/**
 * 账号操作控制器（★ 接线层）—— 把「**需要宿主参与的**那几半」与 store 动作拼起来
 *
 * 依据（**逐行回源抄录**）：`removeAccount` shared.js:30218-30247
 *
 * ★ **为什么纯列表动作在 slice、而这几个在控制器**：
 *   · `global.removeAccount`（sync）= 源版 30229-30236 的**列表半**（filter + `vo()` 重编号）
 *   · 本文件 = 源版 30224-30228 的**会话清理半**（要 await 宿主）+ 30237-30246 的
 *     `lovartGalleries` 清理（本工程该字段尚未落地，故略）
 *   ⇒ **分开放**：删号列表是**同步、必定成功**的，绝不能被宿主失败卡住。
 *
 * ⚠️ **一处有意偏离（留痕）**：源版清会话是 `try { window.api.clearAccountSession(partition) } catch {}`
 *   —— **fire-and-forget + 全吞**（原则 6 违规）。本实现**等它**并把失败原样上报
 *   （`pushBackendError`），但**仍然继续删除**（与源一致：宿主失败不阻断用户意图）。
 */

import type { AppStore } from './store';
import type { Ports } from '@/core/ports';
import { applyProxyAssignments, releaseSession } from '@/core/usecases/prepareSession';
import { assignProxyPool, normalizeProxyPool } from '@/core/rules/proxy';
import {
  buildFingerprintDiagnosis,
  probeFromFingerprint,
  type DiagnosisSource,
  type FingerprintDiagnosis,
  type FingerprintNetProbe,
} from '@/core/rules/fingerprintDiagnosis';
import type { FingerprintPageProbe } from '@/core/ports/backendPage.port';
import {
  exportAccounts as runExportAccounts,
  importAccounts as runImportAccounts,
} from '@/core/usecases/accountTransfer';
// ★ 抓图入库用例（原 `wp` / `xp` / `NR` 的编排半 —— 扫页面 → 画廊入参）
import { scanGallery as runScanGallery } from '@/core/usecases/scanGallery';
import type { ScanPhaseEvent } from '@/core/ports/site.port';
import type { NewAccountInput } from '@/core/rules/accountRoster';
import { ACCOUNT_STATUS } from '@/stable/model/account';
import { SEND_TEXT } from '@/constants/text';

/**
 * 账号导入 / 导出结果（UI 据此出提示）
 *
 * ⚠️ 原则 6：`message` 是**后端原文**（如 `已取消` / `文件格式错误`）—— **不改写、不加前缀**。
 * ⚠️ `warnings`（cookie 读取/恢复失败）已**同时**上报到 `backendErrors`（不静默），此处再带出供 UI 计数。
 */
export type AccountTransferResult =
  | { kind: 'canceled' }
  | { kind: 'failed'; message: string }
  | { kind: 'exported'; count: number; warnings: string[] }
  | { kind: 'imported'; imported: number; skipped: number; restored: number; warnings: string[] };

export interface AccountOpsController {
  /**
   * 新增账号（原 `addAccount` 的整体效果）
   * @returns 新账号 id
   */
  addAccount(input: NewAccountInput): string;
  /** 移除账号（原 `removeAccount`）：先清会话（best-effort），再删列表 */
  removeAccount(accountId: string): Promise<void>;
  /**
   * ★ **检测登录态并写回 `status`**
   *
   * ⚠️ **源版没有这个动作** —— 源版的建号发生在登录成功之后（`$P.jsx`），
   *    所以从不需要"事后补判登录"。本工程改成「先建号 → 在 `BackendView` 的 `<webview>`
   *    里真人登录 → 探针判定」⇒ 需要这一步。
   *    判据用的是**既有端口** `SitePort.probe`（返回 `SiteProbe.loggedIn`），不是新造机制。
   *
   * @returns 是否已登录（同时已把 `status` 写成 `已登录` / `未登录`）
   */
  probeLogin(accountId: string): Promise<boolean>;
  /**
   * ★ **导出账号数据**（原 `PP.jsx:36-94`）
   * @param accountIds UI 已勾选的账号 id（空 ⇒ `failed`，转发源版 `请至少选择一个账号`）
   * @returns `exported`（含 cookie 失败 `warnings`）/ `failed`（后端原文，如 `已取消`）
   */
  exportAccounts(accountIds: readonly string[]): Promise<AccountTransferResult>;
  /**
   * ★ **导入账号数据**（原 `OP.jsx:585-699`）
   *
   * ★ 逐个入 store 用**既有** `addAccount`（`NewAccountInput` 收 `id`/`partition`/`fingerprint`
   *   ⇒ 保留导入字段 + 与源一致地 `vo()` 重编号）—— **不是**直接 `setAccounts` 追加。
   * ⚠️ 文件格式错误 / 无账号数据 ⇒ `failed`（转发源版文案）；用户取消 ⇒ `canceled`。
   */
  importAccounts(): Promise<AccountTransferResult>;
  /**
   * ★ **保存 Lovart 出口代理池**（原 `setProxyPool` 30320-30330 + `reassignLovartProxies` 30331+）
   *
   * 顺序（**逐行对源**）：归一 → 落 store → 纯层**轮询分配** → 账号写回 → **逐条落宿主**。
   * @param text 文本域原文（每行一个代理；空 ⇒ 全部直连）
   * @returns `count` = 归一后的代理数（0 ⇒ 直连）；`failures` = 落宿主失败清单（已上报，原则 6）
   */
  saveProxyPool(text: string): Promise<{ count: number; applied: number; failures: string[] }>;
  /**
   * ★ **指纹诊断**（原 `OP.jsx:59-125` 的 `h(W)`）
   *
   * 顺序（**逐行对源**）：
   *   ① 页面**实际生效**指纹（`BackendPagePort.probeFingerprint`，best-effort 2.5s 超时）
   *   ② 探不到 ⇒ **回落账号里存的指纹配置**（原 83-97，来源标 `configured`）
   *   ③ 真实出口网络（`AccountPort.fpNetDiag`）
   *   ④ 纯层拼摘要（`buildFingerprintDiagnosis`）
   *
   * ⚠️ **不弹错**：源版这两处失败都是 `catch {}` 后置 `null`（best-effort）——
   *    失败只体现在摘要的「伪装 / 出口」段，**不打断**诊断。
   * ⚠️ 调用方（UI）用 `diagnosisSegments()` + `FP_DIAG_TEXT.prefix` 拼 toast 文案
   *    （文案是 SSOT 的活，控制器只交**结构化结果**）。
   */
  diagnoseAccount(accountId: string): Promise<FingerprintDiagnosis>;

  /**
   * ★ **抓图入库**（原 `wp` / `xp` / `NR` 的**编排半**）—— 逐账号扫描 → 写 `lovartGalleries`
   *
   * ⚠️ 与源一致：**逐账号**进行，**单个账号失败不中断其余**（源 `oe` 的 `for` 里就是跳过）。
   *   但失败**原样上报**（`pushBackendError`）：源版只对 tapnow 那条出提示
   *   （`Tapnow「X」未打开画布页，已跳过`），其余站点**静默吞掉** —— 本工程统一不静默（原则 6）。
   * ⚠️ **去重**由 `addLovartImages` 兜底（按 `dataUrl` + `sourceUrl` 双去重），控制器不重复实现。
   * ⚠️ 文案（`已抓取 N 张新图` / `没有新的图` …）是 **UI 的活** —— 本方法只交**结构化计数**。
   */
  scanGallery(
    accountIds: readonly string[],
    opts?: { onPhase?: (event: ScanPhaseEvent) => void },
  ): Promise<ScanGallerySummary>;
}

/** `scanGallery` 的结果（**结构化计数** —— UI 据此出提示，控制器不拼文案） */
export interface ScanGallerySummary {
  /** 实际扫了几个账号（`accountIds` 里存在的那些） */
  scanned: number;
  /** 真正**新增**的画廊条数（`addLovartImages` 的返回；已存在的被去重掉） */
  added: number;
  /** 逐张**落盘失败**（原 `wp.failed`） */
  failed: number;
  /** 扫描阶段跳过（重复 / 过小 / 占位图） */
  skipped: number;
}

export function createAccountOps(store: AppStore, ports: Ports): AccountOpsController {
  return {
    addAccount: (input) => store.useStore.getState().addAccount(input),

    async removeAccount(accountId) {
      const account = store.useStore.getState().accounts.find((a) => a.id === accountId);
      // ⚠️ 没有分区 ⇒ **不调宿主**（源版 `if (s && s.partition && …)`）——
      //    这与 `releaseSession` 内部的「空分区直接成功」是同一条约束
      if (account?.partition) {
        const r = await releaseSession({ account: ports.host.account }, account.partition);
        if (!r.ok) {
          // 原则 6：不静默。⚠️ 但**不 return** —— 删号必须成功（见文件头）
          store.useStore.getState().pushBackendError('unknown', r.message);
        }
      }
      store.useStore.getState().removeAccount(accountId);
    },

    async probeLogin(accountId) {
      const s = store.useStore.getState();
      const account = s.accounts.find((a) => a.id === accountId);
      if (!account) return false;

      // ⚠️ 站点适配器缺失 ⇒ **明确报错**，不把"没适配器"当成"未登录"
      const site = ports.sites[account.type];
      if (!site) {
        s.pushBackendError('unknown', SEND_TEXT.noSiteAdapter(account.type));
        return false;
      }

      const r = await site.probe(account);
      if (!r.ok) {
        // 探针失败（页面没起来等）⇒ 原样上报；**不改状态**（缺证据就别下结论）
        store.useStore.getState().pushBackendError('unknown', r.message);
        return false;
      }

      const loggedIn = r.value.loggedIn;
      const next = store.useStore.getState().accounts.map((a) =>
        a.id === accountId
          ? { ...a, status: loggedIn ? ACCOUNT_STATUS.loggedIn : ACCOUNT_STATUS.loggedOut }
          : a,
      );
      // ★ 只有 state 能写 store（原则 1）—— 本控制器是 state 层的文件，写在这里是合规的
      store.useStore.setState({ accounts: next });
      // ⚠️ `accounts` 已在 `container.ts` 的自动落盘监听列表里 ⇒ 无需显式 persist
      return loggedIn;
    },

    async exportAccounts(accountIds) {
      const s = store.useStore.getState();
      const selected = s.accounts.filter((a) => accountIds.includes(a.id));
      const r = await runExportAccounts(
        { account: ports.host.account, clock: ports.clock },
        { accounts: selected },
      );
      if (!r.ok) return { kind: 'failed', message: r.message };
      // ★ 原则 6：cookie 失败**不静默**（源版 `PP.jsx:61` 是 `console.warn`）
      for (const w of r.value.warnings) s.pushBackendError('unknown', w);
      return { kind: 'exported', count: r.value.count, warnings: r.value.warnings };
    },

    async importAccounts() {
      const s = store.useStore.getState();
      const r = await runImportAccounts(
        { account: ports.host.account, clock: ports.clock },
        { existing: s.accounts },
      );
      if (!r.ok) return { kind: 'failed', message: r.message };
      if (r.value.kind === 'canceled') return { kind: 'canceled' };
      const { accounts, skipped, restored, warnings } = r.value;
      // ★ 只有 state 能写 store（原则 1）—— 逐个走既有 `addAccount`
      //   （`NewAccountInput` 收 id/partition/fingerprint ⇒ 保留导入字段 + `vo()` 重编号）
      for (const acc of accounts) store.useStore.getState().addAccount(acc);
      const s2 = store.useStore.getState();
      // ★ 原则 6：cookie 恢复失败**不静默**（源版 `OP.jsx:660` 是 `console.warn`）
      for (const w of warnings) s2.pushBackendError('unknown', w);
      return { kind: 'imported', imported: accounts.length, skipped, restored, warnings };
    },

    async saveProxyPool(text) {
      const pool = normalizeProxyPool(text);
      const s0 = store.useStore.getState();
      // ① 落 store（原则 1）；`proxyPool` 已在 `container.ts` 的自动落盘监听列表里
      s0.setProxyPool(pool);
      // ② 纯层轮询分配（原 `reassignLovartProxies` 30331-30346）
      const r = assignProxyPool(s0.accounts, pool);
      // ③ 账号写回（`proxy` 字段）
      store.useStore.setState({ accounts: r.accounts });
      // ④ 逐条落宿主（原 30347-30351）—— 源版 `.catch(() => {})` **全吞** ⇒ 这里如实上报（原则 6）
      const out = await applyProxyAssignments({ account: ports.host.account }, r.assignments);
      for (const f of out.failures) store.useStore.getState().pushBackendError('unknown', f);
      return { count: pool.length, applied: out.applied, failures: out.failures };
    },

    async diagnoseAccount(accountId) {
      const account = store.useStore.getState().accounts.find((a) => a.id === accountId);
      // 找不到账号 ⇒ 什么都不知道（**不编造**，全段落 `?` / `页面未加载`）
      if (!account) return buildFingerprintDiagnosis(null, null, 'live');

      // ① 页面**实际生效**指纹（best-effort，2.5s 超时）
      let page: FingerprintPageProbe | null = null;
      let source: DiagnosisSource = 'live';
      const r = await ports.backendPage.probeFingerprint(account);
      if (r.ok) {
        page = r.value;
      } else if (account.fingerprint) {
        // ② 探不到 ⇒ 回落账号里**存的**指纹配置（原 `OP.jsx:83-97`，`rt = 'configured'`）
        page = probeFromFingerprint(account.fingerprint);
        source = 'configured';
      }
      // ⚠️ 与源一致：探针失败**不弹错**（它本就是 best-effort）—— 只体现在摘要的「伪装」段

      // ③ 真实出口网络（原 98-107）—— 无分区 / 失败 ⇒ `null`（源版 `catch` 后置 null）
      let net: FingerprintNetProbe | null = null;
      if (account.partition) {
        const nr = await ports.host.account.fpNetDiag(account.partition);
        if (nr.ok) net = nr.value as FingerprintNetProbe;
      }

      return buildFingerprintDiagnosis(page, net, source);
    },

    async scanGallery(accountIds, opts) {
      const targets = store.useStore.getState().accounts.filter((a) => accountIds.includes(a.id));
      let added = 0;
      let failed = 0;
      let skipped = 0;
      for (const account of targets) {
        const r = await runScanGallery(
          { sites: ports.sites },
          account,
          // ⚠️ `onPhase` 只做转发（阶段机归 UI；本控制器不存它）
          { ...(opts?.onPhase ? { onPhase: opts.onPhase } : {}) },
        );
        if (!r.ok) {
          // 原则 6：不静默（源版只对 tapnow 那条提示，其余吞掉）；**但不中断**其余账号
          store.useStore.getState().pushBackendError('unknown', r.message);
          continue;
        }
        // ★ 落库（原则 1：写 store 只在 state）—— 去重由 `addLovartImages` 兜底
        added += store.useStore.getState().addLovartImages(account.id, r.value.items);
        failed += r.value.failed;
        skipped += r.value.skipped;
      }
      return { scanned: targets.length, added, failed, skipped };
    },
  };
}
