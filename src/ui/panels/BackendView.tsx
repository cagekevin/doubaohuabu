/**
 * 后台视图（原 `_Component43.jsx` 的**视图半** + `_Component25.jsx` 的 `<webview>` 标签）
 *
 * ★★ **这个组件是整条链的关键路径**：`adapters/site/shared/webview.ts` 的 `findWebview`
 *   查的是 `.doubao-view-webviews` 容器里的 `<webview>` —— 而**此前没有任何地方渲染它**
 *   ⇒ `findWebview` 恒返回 `null` ⇒ 发送 / 提示词分析 / 抓素材**全都不可能成功**。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 容器 | `_Component43.jsx:3272` | `<div className="doubao-view-webviews">` |
 *   | 每账号 | `3273-3274` | `{accounts.map(a => <Webview account={a} …/>)}` |
 *   | 空态 | `3297` | `请先在左侧添加并登录账号` |
 *   | 标签 | `_Component25.jsx:355` | 见下方逐条对照 |
 *   | 可见性 | `I0` 38643-38651 | `active` / `forced` / `hidden` 三态 |
 *
 * ★ **本工程与源版的一处结构性差异（有意）**：源版**不渲染 webview 时**，`vr` 用的是
 *   组件间注册表（`rT({getWebview,isReady,reloadAccount})`，`_Component43:422-438`）。
 *   本工程把那套提成了**端口**（`BackendPagePort`）⇒ **本组件不需要注册任何东西**，
 *   它只要把 `<webview>` **渲染出来**，适配器就能按 DOM 找到它们。
 *   ⇒ 这消掉了源版最脆的一环（注册表与组件生命周期耦合）。
 *
 * ⚠️ 原则 1：本组件**不写 store**（`activeAccountId` 由账号面板改）
 * ⚠️ 零注入（`docs/10` #2）：这里**不碰** `navigator`/`screen`/`webgl`；
 *    指纹伪装是宿主 preload（`preload=<file://…>`）的活。
 */

import { useEffect, useState } from 'react';
import { usePorts, useStore } from '@/state';
import type { Account } from '@/stable/model/account';
import styles from './BackendView.module.css';

/**
 * `<webview>` 的 `src`（原 `_Component25.jsx:355` 的六路三目）
 *
 * ★ **站点地址不由本组件写死**：豆包 / Dola 的会话页来自 `SitePort.chatUrl`
 *   （站点细节住适配器，见 `site.port.ts` 的注释）；未声明 `chatUrl` 的站点回落
 *   `about:blank`（`test` 之外的站点本来就还没实现）。
 * ⚠️ `other` 类型用账号自己的 `url`（原版就是 `e.url || 'about:blank'`）。
 */
function backendUrlOf(account: Account, chatUrl?: string): string {
  if (account.type === 'other') return account.url || 'about:blank';
  return chatUrl ?? 'about:blank';
}

/**
 * `<webview>` 的 `partition`（原 `_Component25.jsx:355` 的六路三目）
 *
 * ★ **源版那个长长的三目其实是一条通用规则**：`account.partition || \`persist:${type}\``
 *   （六个分支的值分别就是 `persist:lovart`/`persist:dola`/… —— 与 `type` 一一对应）
 *   ⇒ 这里写成**一条规则**，不再逐个列举（判据 C1；行为完全一致）。
 */
function partitionOf(account: Account): string {
  return account.partition || `persist:${account.type}`;
}

function AccountWebview({ account, active }: { account: Account; active: boolean }) {
  const ports = usePorts();
  /** 宿主产出的指纹 preload 地址（原 `_Component25` 的 `preload={h}`） */
  const [preloadUrl, setPreloadUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    /**
     * `other` 类型**没有指纹**（`account.fingerprint` 为 undefined）⇒ 不必准备 preload。
     * ⚠️ 这里**不能** `setPreloadUrl(null)` —— 在 effect 里**同步** setState 会触发级联渲染
     *    （被 `eslint` 的 `react-hooks` 规则拦下）。改为**渲染侧守卫**（见下面的 `preload` 展开）。
     */
    if (account.type !== 'other') {
      void (async () => {
        const r = await ports.host.account.ensureFingerprint({
          id: account.id,
          partition: account.partition,
          fingerprint: account.fingerprint,
        });
        if (cancelled) return;
        // ⚠️ 失败**不抛也不编造** —— 页面照常加载（只是没有指纹伪装），
        //    错误已由适配器如实返回；这里只决定要不要挂 preload
        if (r.ok && r.value.preloadUrl) setPreloadUrl(r.value.preloadUrl);
      })();
    }
    return () => {
      cancelled = true;
    };
    // ⚠️ 指纹或盐一变就要**重新准备**（换指纹 = 换身份）
  }, [ports, account.id, account.partition, account.fingerprint, account.type]);

  return (
    <webview
      /**
       * ⚠️ **`key` 含 `fpSalt`**（与原版 355 行逐字一致）：换指纹必须**重挂元素**，
       *    否则 guest 页面仍是旧身份（preload 只在导航时生效）。
       */
      key={`wv-${account.id}-${account.fpSalt ?? 0}`}
      data-account-id={account.id}
      /**
       * ⚠️ **属性顺序有意义**：`partition` 必须在 `src` 之前生效，
       *    否则会先在错误的 session 里起一次导航（Electron 的已知行为）。
       */
      partition={partitionOf(account)}
      src={backendUrlOf(account, ports.sites[account.type]?.chatUrl)}
      // 原版：有指纹就用指纹的 UA；否则交给引擎默认（不编一个）
      {...(account.fingerprint ? { useragent: account.fingerprint.userAgent } : {})}
      // ⚠️ 渲染侧守卫（不是 effect 里重置状态）：`other` 类型永远不挂 preload，
      //    这样即使类型从有指纹的站点改成 `other`，也不会把旧 preload 带过去
      {...(account.type !== 'other' && preloadUrl ? { preload: preloadUrl } : {})}
      // ⚠️ 源版写 `"true"`（字符串）；Electron 只认「属性存在」⇒ 布尔等价（见 d.ts 注释）
      allowpopups
      // 可见性（原 `I0` 的三态；本工程只用到「当前账号可见 / 其余隐藏」两态）
      className={active ? styles.active : styles.hidden}
    />
  );
}

/**
 * 后台视图宿主
 *
 * ⚠️ 挂在 `AppShell` 的**左侧账号栏**里（原版就是一个左栏区域），
 *    尺寸由 `AccountPanel` 的内容决定；隐藏态的那些 webview 仍在 DOM 里（后台任务要用）。
 */
export function BackendView() {
  const accounts = useStore((s) => s.accounts);
  const activeAccountId = useStore((s) => s.activeAccountId);

  return (
    <div className={styles.webviews}>
      {accounts.map((a) => (
        <AccountWebview key={a.id} account={a} active={a.id === activeAccountId} />
      ))}
    </div>
  );
}
