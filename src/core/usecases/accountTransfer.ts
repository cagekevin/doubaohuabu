/**
 * usecase · 账号数据导入 / 导出（cookies）
 *
 * 依据（**逐行回源抄录**）：
 *   - 导出：`PP.jsx:36-94`（逐号 `exportAccountCookies` → 组 JSON → `saveAccountsFile`）
 *   - 导入：`OP.jsx:585-699`（`loadAccountsFile` → 解析 → 三重判重 → 恢复 cookie → 建号）
 *
 * ⚠️ 纯逻辑（判重 / 归一 / 组文件正文）在 `core/rules/accountTransfer.ts`（**可单测**）。
 * ⚠️ 原则 1：本文件**不写 store** —— 返回待建账号清单，由 state 落（`addAccount`）。
 * ⚠️ 原则 4：时间经 `ClockPort`（源的 `Date.now()` / `new Date()` 全部改为注入）。
 * ⚠️ 原则 6：源版**两处 cookie 失败只 `console.warn`**（用户永远不知道 cookie 没恢复）
 *    ⇒ 重写改为**记账上报**（`warnings`），并**不因此中断**整批导入（与源版一致）。
 */

import type { AccountPort } from '@/core/ports/host.port';
import type { ClockPort } from '@/core/ports/clock.port';
import type { Account } from '@/stable/model/account';
import { err, ok, type Result } from '@/core/model/result';
import {
  buildAccountsExportFile,
  readAccountsFromFile,
  selectImportableAccounts,
  toExportedAccountEntry,
} from '@/core/rules/accountTransfer';
import { ACCOUNT_TRANSFER_TEXT } from '@/constants/text';

export interface AccountTransferDeps {
  account: Pick<
    AccountPort,
    'exportCookies' | 'importCookies' | 'saveAccountsFile' | 'loadAccountsFile'
  >;
  clock: ClockPort;
}

// ─────────────────────────── 导出 ───────────────────────────

export interface ExportAccountsInput {
  /** 要导出的账号（UI 已勾选） */
  accounts: readonly Account[];
}

export interface ExportAccountsOk {
  /** 实际写进文件的账号数 */
  count: number;
  /** cookie 读取失败清单（**原文**，已加前缀）—— 非空表示「导出成功但有账号没带上 cookie」 */
  warnings: string[];
}

/**
 * 导出账号数据（原 `PP.jsx:36-94`）
 *
 * ⚠️ 源版流程：先逐个取 cookie（**失败即空数组继续**）→ 组 JSON → 保存对话框。
 *    保存失败 / 取消 ⇒ `err`（转发后端原文，如 `已取消`）。
 */
export async function exportAccounts(
  deps: AccountTransferDeps,
  input: ExportAccountsInput,
): Promise<Result<ExportAccountsOk>> {
  if (input.accounts.length === 0) {
    return err('no-account', ACCOUNT_TRANSFER_TEXT.pickNone);
  }

  const warnings: string[] = [];
  const entries = [];
  for (const account of input.accounts) {
    const res = await deps.account.exportCookies(account.partition);
    if (!res.ok) {
      // ★ 源版是 `console.warn`（吞掉）⇒ 这里**如实记账**，但仍按源版降级为空 cookie 继续
      warnings.push(ACCOUNT_TRANSFER_TEXT.exportCookieFailed(account.name, res.message));
      entries.push(toExportedAccountEntry(account, []));
      continue;
    }
    entries.push(toExportedAccountEntry(account, res.value.cookies));
  }

  const exportedAtIso = new Date(deps.clock.now()).toISOString();
  const content = buildAccountsExportFile(entries, exportedAtIso);
  const saved = await deps.account.saveAccountsFile(content);
  if (!saved.ok) return saved;

  return ok({ count: entries.length, warnings });
}

// ─────────────────────────── 导入 ───────────────────────────

export interface ImportAccountsInput {
  /** 已有账号（判重用）—— 由 **state** 传入（用例不读 store，原则 1） */
  existing: readonly Account[];
}

export type ImportAccountsOutcome =
  | { kind: 'canceled' }
  | {
      kind: 'imported';
      /** 待建账号（**尚未入 store**） */
      accounts: Account[];
      /** 因 id / 名字 / 分区重复而跳过数 */
      skipped: number;
      /** 成功恢复的 cookie 条数（后端 `restored` 之和） */
      restored: number;
      /** cookie 恢复失败清单（**原文**，已加前缀） */
      warnings: string[];
    };

/**
 * 导入账号数据（原 `OP.jsx:585-699`）
 *
 * ⚠️ 三种「没有可导入内容」的情况都是**明确失败**（转发源版文案）：
 *    文件格式错误 / 文件中无账号数据 / 解析失败。
 */
export async function importAccounts(
  deps: AccountTransferDeps,
  input: ImportAccountsInput,
): Promise<Result<ImportAccountsOutcome>> {
  const loaded = await deps.account.loadAccountsFile();
  if (!loaded.ok) return loaded;
  if (loaded.value === null) return ok({ kind: 'canceled' });

  let parsed: unknown;
  try {
    parsed = JSON.parse(loaded.value);
  } catch (e) {
    // 源：`l('文件格式错误')` —— 原文进 cause（原则 6：不丢信息）
    return err('unknown', ACCOUNT_TRANSFER_TEXT.badFile, e);
  }

  const entries = readAccountsFromFile(parsed);
  if (entries.length === 0) {
    return err('no-account', ACCOUNT_TRANSFER_TEXT.noAccountsInFile);
  }

  const now = deps.clock.now();
  const { drafts, skipped } = selectImportableAccounts(entries, input.existing, {
    // 源：`const bt = Date.now().toString(36)`（同批共用同一个基）
    nowBase36: now.toString(36),
    now,
  });

  let restored = 0;
  const warnings: string[] = [];
  for (const draft of drafts) {
    if (draft.cookies.length === 0) continue;
    const partition = draft.account.partition;
    if (!partition) continue;
    const res = await deps.account.importCookies(partition, draft.cookies);
    if (!res.ok) {
      // ★ 源版是 `console.warn`（吞掉）⇒ 这里如实记账，且**不中断**整批导入
      warnings.push(ACCOUNT_TRANSFER_TEXT.restoreCookieFailed(draft.account.name, res.message));
      continue;
    }
    restored += res.value.restored;
  }

  return ok({
    kind: 'imported',
    accounts: drafts.map((d) => d.account),
    skipped,
    restored,
    warnings,
  });
}
