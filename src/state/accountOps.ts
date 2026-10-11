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
import { releaseSession } from '@/core/usecases/prepareSession';
import type { NewAccountInput } from '@/core/rules/accountRoster';
import { ACCOUNT_STATUS } from '@/stable/model/account';
import { SEND_TEXT } from '@/constants/text';

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
  };
}
