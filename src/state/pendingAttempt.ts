/**
 * 「待归属尝试」写入器（原 `_Component43.jsx` 的 `sendPayload` 里的那两段）
 *
 * 依据（**逐行回源**）：
 *   - 成功 `:2865-2913`（会话 id 读取 `:2870-2878` · `edit` 快照 · 尝试 · 落点）
 *   - 失败 `:2921-2942`
 *
 * ★ **为什么必须有它**：源里 `_pendingAttempt(s)` 的**唯一**写入方就是 `sendPayload`，而
 *   `sendPayload` 是**全仓唯一发送入口** `Bu`（`shared.js:40411`）的 transport（`Bu` 的 `r = IL()`
 *   = 隐形桥 = `sendPayload`）⇒ **每条发送路径都会写**。
 *   缺了它 ⇒ CDP 落回来的视频**没有出片记录 / 没有配方**，`pullResult` 的「回会话页拉取」
 *   也拿不到 `conversationId`。
 *
 * ⚠️ **原则 1**：只有 `state/**` 写 store —— 本文件属 `state/`，写的是**具名 action**（`patchNodeData`）。
 * ⚠️ **原则 4**：`id` / `at` / `sleep` 全部注入。
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import {
  accountNameFallback,
  conversationIdFromUrl,
  failedAttemptOf,
  pendingAttemptPatch,
  sentAttemptOf,
} from '@/core/rules/pendingAttempt';
import { log } from '@/lib/log';

/**
 * 会话 id 的**重读间隔 / 总上限**（原 `:2871-2878` 的 `600` 与 `4000`）
 *
 * ⚠️ **与源的一处差异（已记账）**：源在那 4s 窗口里是一句**空转的 `while (… && !be) {}`**
 *    —— 它**不会**再读一次 `be`，净效果 = 白卡 ~3.4s。本实现改成**睡眠式有界重读**
 *    （同样的 600ms + 4s 上限，但既不空转、也确实多读几次）。
 */
const CONVERSATION_REREAD_MS = 600;
const CONVERSATION_DEADLINE_MS = 4000;

export interface PendingAttemptInput {
  nodeId: string;
  accountId: string;
  /** 原 `Q.text` */
  prompt: unknown;
  /** 原 `Q.params`（只有成功分支用） */
  payloadParams?: unknown;
}

export interface PendingAttemptFailedInput extends Omit<PendingAttemptInput, 'payloadParams'> {
  /** 原 `ge.note || ge.reason || ''` */
  note: string;
}

export interface PendingAttemptController {
  /** **发送成功后**写（原 `:2865-2913`）—— 含会话 id 读取，故是异步的 */
  recordSent(input: PendingAttemptInput): Promise<void>;
  /** **发送失败后**写（原 `:2921-2942`）—— 同步，无会话 id */
  recordFailed(input: PendingAttemptFailedInput): void;
}

export interface PendingAttemptDeps {
  now(): number;
  /** 原 `O$()` */
  makeAttemptId(): string;
  sleep(ms: number): Promise<void>;
}

export function createPendingAttempt(
  store: AppStore,
  ports: Ports,
  deps: PendingAttemptDeps,
): PendingAttemptController {
  const s = () => store.useStore.getState();

  /**
   * 读会话 id（原 `:2870-2878`）—— `N0(webview.getURL())`，读不到就 600ms 后重读、直到 4s 上限。
   * ⚠️ best-effort：读不到 ⇒ `null`（**不编造**）。
   */
  const readConversationId = async (accountId: string): Promise<string | null> => {
    const account = s().accounts.find((a) => a.id === accountId);
    if (!account) return null;

    const read = (): string | null => {
      const r = ports.backendPage.hrefOf(account);
      return r.ok ? conversationIdFromUrl(r.value) : null;
    };

    const first = read();
    if (first) return first;

    const started = deps.now();
    await deps.sleep(CONVERSATION_REREAD_MS);
    const second = read();
    if (second) return second;

    while (deps.now() - started < CONVERSATION_DEADLINE_MS) {
      await deps.sleep(CONVERSATION_REREAD_MS);
      const again = read();
      if (again) return again;
    }
    return null;
  };

  /** 写进节点（原 `:2907-2913` / `:2935-2941` —— 两处同形） */
  const write = (
    nodeId: string,
    accountId: string,
    attempt: Record<string, unknown>,
  ): void => {
    const node = s().nodes.find((n) => n.id === nodeId);
    if (!node) return;
    try {
      s().patchNodeData(nodeId, pendingAttemptPatch(node.data, accountId, attempt));
    } catch (e: unknown) {
      log.warn('[pendingAttempt] 写入失败：', e);
    }
  };

  const accountNameOf = (accountId: string): string => {
    const account = s().accounts.find((a) => a.id === accountId);
    return account?.name || accountNameFallback(account?.type === 'dola');
  };

  return {
    async recordSent(input) {
      const conversationId = await readConversationId(input.accountId);
      write(
        input.nodeId,
        input.accountId,
        sentAttemptOf({
          id: deps.makeAttemptId(),
          at: deps.now(),
          accountId: input.accountId,
          accountName: accountNameOf(input.accountId),
          prompt: input.prompt,
          payloadParams: input.payloadParams,
          conversationId,
          // ⚠️ `edit` 快照取**写之前**的节点 data（源 `:2880-2890` 也是先读后写）
          nodeData: s().nodes.find((n) => n.id === input.nodeId)?.data,
        }),
      );
    },

    recordFailed(input) {
      write(
        input.nodeId,
        input.accountId,
        failedAttemptOf({
          id: deps.makeAttemptId(),
          at: deps.now(),
          accountId: input.accountId,
          accountName: accountNameOf(input.accountId),
          prompt: input.prompt,
          note: input.note,
        }),
      );
    },
  };
}
