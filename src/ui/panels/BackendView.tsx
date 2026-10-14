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
 * ⚠️ 零注入（`docs/过程.md` #2）：这里**不碰** `navigator`/`screen`/`webgl`；
 *    指纹伪装是宿主 preload（`preload=<file://…>`）的活。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccountOps, useHostOps, useStore } from '@/state';
import { isAccountUsable, type Account } from '@/stable/model/account';
// ★ 容器钩子类名的 SSOT（`findWebview` 靠它定位；见下方 `className`）
import { WEBVIEWS_HOST_CLASS } from '@/stable/contracts/schemas';
import { ACCOUNT_PANEL_TEXT, BACKEND_VIEW_TEXT, WATERMARK_PANEL_TEXT } from '@/constants/text';
import { NEW_IMAGES_SITES } from '@/core/rules/accountPick';
// ★ 默认会话分区的**唯一真源**（`TD-04-11`：同一语义此前 5 处定义 3 套值）
import { defaultPartitionOf } from '@/core/rules/partition';
import { NewImagesPanel } from './NewImagesPanel';
import { WatermarkPanel } from './WatermarkPanel';
import { LovartSessionBar } from './LovartSessionBar';
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
  // ★ 2026-10-12（`TD-04-11`）：改委托**唯一真源** `core/rules/partition.defaultPartitionOf`
  //   （此前这里是唯一 type-aware 的写法，但**值**在本仓另有 3 套写死版本 ⇒ 同一语义 5 处定义）
  return account.partition || defaultPartitionOf(account.type);
}

/** `<webview>`（Electron 自定义元素）上我们需要的**最小面** —— React 无精确类型 ⇒ 结构化声明 */
interface WebviewElementLike {
  addEventListener(type: string, cb: () => void): void;
  removeEventListener(type: string, cb: () => void): void;
}

function AccountWebview({ account, active }: { account: Account; active: boolean }) {
  // ★ 2026-10-11：原先两处 `usePorts()` 直调（`host.account.ensureFingerprint` / `sites[].chatUrl`）
  //   已收口到 `accountOps`（TD-16-8）—— 组件不再持有 `Ports`。
  const accountOps = useAccountOps();
  /**
   * ★ `partition`（真源 `partitionOf`）在**组件体**算一次，effect 与 `<webview>` 标签共用。
   * ⚠️ 不能让 effect 内联调用 `partitionOf(account)` —— 那会把**整个 `account` 对象**带进依赖
   *    （eslint 看不出 `partitionOf` 只读哪几个字段）⇒ 对象标识每次 store 更新都变 ⇒ effect 每轮重跑。
   */
  const partition = partitionOf(account);
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
        const r = await accountOps.prepareWebviewSession({
          accountId: account.id,
          // ★ **2026-10-12（`TD-04-11` 源头修法）**：此前这里传的是**原始** `account.partition`
          //   （建号时为 `null`）⇒ 后端只好"猜"一个站点（写死 lovart / doubao）⇒ **静默落到错的
          //   session**（探债段症状①：指纹 HTTP 层头注入被跳过、却仍报成功）。而同一个组件的
          //   `<webview>` 用的**已经是** type-aware 的 `partitionOf(account)` ⇒ 现在两边**同一个来源**
          //   （真源 `core/rules/partition.defaultPartitionOf`），后端不必再猜。
          partition,
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
    //   ⚠️ **必须用字段级依赖**（不是 `account` 对象）：`accounts` 每次 store 更新都会换对象标识，
    //      用整个 `account` 会让本 effect 每轮重跑 ⇒ 重复打 `ensureFingerprint` IPC。
  }, [accountOps, account.id, partition, account.fingerprint, account.type]);

  /**
   * ★ `<webview>` 元素引用 —— 只为挂 **`dom-ready`**（原 `_Component25.jsx:113-142` 的 `F`）
   *
   * ⚠️ `ui` **不 import `adapters`**（铁律②）⇒ 事件里只调**控制器**（`accountOps.onWebviewDomReady`），
   *   由它经端口去挂 CDP 调试器（`onDolaMedia` 的唯一数据来源）。
   */
  const wvRef = useRef<WebviewElementLike | null>(null);
  // ⚠️ 抽局部量：effect 里若直接闭包 `account`，`react-hooks/exhaustive-deps` 要求把整个对象入依赖
  const accountId = account.id;
  useEffect(() => {
    const el = wvRef.current;
    if (!el) return;
    const onReady = (): void => accountOps.onWebviewDomReady(accountId);
    /**
     * ★ `did-navigate`（原 `_Component25.jsx:163-171`）—— SPA 换页后**重注入** Dola 30s 钩子
     * （钩子装在页面主世界里，换页就没了）。⚠️ 源的 did-navigate 还注入 `c0`（拖放兜底），
     * 那件**未落**（站点层注入，需先定性 —— `docs/过程.md` #2）。
     */
    const onNavigated = (): void => accountOps.onWebviewNavigated(accountId);
    el.addEventListener('dom-ready', onReady);
    el.addEventListener('did-navigate', onNavigated);
    return () => {
      el.removeEventListener('dom-ready', onReady);
      el.removeEventListener('did-navigate', onNavigated);
    };
  }, [accountOps, accountId]);

  return (
    <>
      {/*
        ★ **Lovart 会话条**（原 `_Component25.jsx:359` 的条件 `p && t` = `type === 'lovart' && isActive`）
        —— 顺序照源：条在 `<webview>` **之前**；`Fragment` 不产生 DOM 节点
        ⇒ `adapters/site/shared/webview.ts` 的 `findWebview` 照旧找得到（`WEBVIEWS_HOST_CLASS` 容器内）。
      */}
      {account.type === 'lovart' && active ? (
        <LovartSessionBar account={account} partition={partition} />
      ) : null}
      <webview
        ref={(el) => {
          // ⚠️ 自定义元素：React 的 ref 类型是 `HTMLElement`，这里跨一次断言到我们需要的最小面
          wvRef.current = el as unknown as WebviewElementLike | null;
        }}
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
        partition={partition}
        src={backendUrlOf(account, accountOps.chatUrlOf(account.type))}
        // 原版：有指纹就用指纹的 UA；否则交给引擎默认（不编一个）
        {...(account.fingerprint ? { useragent: account.fingerprint.userAgent } : {})}
        // ⚠️ 渲染侧守卫（不是 effect 里重置状态）：`other` 类型永远不挂 preload，
        //    这样即使类型从有指纹的站点改成 `other`，也不会把旧 preload 带过去
        {...(account.type !== 'other' && preloadUrl ? { preload: preloadUrl } : {})}
        /*
         * ⚠️ **必须传字符串**（源版 `_Component25.jsx:355` 也是 `"true"`）：
         *    React 不认 `allowpopups` 是布尔属性 ⇒ 裸布尔 `true` 会告警
         *    （"Received `true` for a non-boolean attribute"）；Electron 只认「属性存在」⇒ 等价。
         * ⚠️ 类型层要跨一次断言：`@types/react` 的 `WebViewHTMLAttributes` 把它声明成 `boolean`，
         *    而运行时事实是**字符串**（第三方类型 ↔ 运行时事实的边界，**不是**本仓的类型双轨）。
         */
        allowpopups={'true' as unknown as boolean}
        // 可见性（原 `I0` 的三态；本工程只用到「当前账号可见 / 其余隐藏」两态）
        className={active ? styles.active : styles.hidden}
      />
    </>
  );
}

/**
 * 后台视图宿主（原 `_Component43.jsx`，`shared.js` 里的 `.doubao-view`）
 *
 * ★★ **2026-10-12 位置修正（原实现摆错了）**：它原先被我挂在 `AppShell` 的**左侧账号栏**
 *   （`AccountPanel` 里面），并附了一句「后台视图必须常驻（`findWebview` 靠 DOM）」当理由 ——
 *   **那句把两件事混成了一件**：源的**容器始终在 DOM**（所以 `findWebview` 找得到）
 *   **同时也切显示**。源的真形态（`_Component43.jsx:3223`）：
 *   ```js
 *   const Ct = `doubao-view${t ? ' dv-visible' : ' dv-hidden'}${!t && (…有发送任务…) ? ' dv-send-overlay' : ''}`;
 *   ```
 *   ⇒ 它是**与画布并列**的一个视图块（`_Component48.jsx:171-178`：`<FP><_Component42 …/></FP>` ＋
 *   `<_Component43 ref={s} visible={o} onClose={…} />` 同在 `.center-stage` 里），
 *   由宿主的**本地态** `o`（初值 `false`）控制显隐；顶栏的「豆包后台」按钮（`onOpenDoubaoView`）把它打开。
 *   ⚠️ 本仓原先把「出新图」（`NewImagesPanel`）也放在左栏 —— 源里它是**本视图的子节点**
 *   （`_Component43.jsx:3301` `{t && … <_Component26 account={Ke} active={t} />}`）⇒ 一并移入。
 */
export interface BackendViewProps {
  /** 原 `_Component43` 的 `visible`（宿主 `_Component48.jsx:56` 的 `useState(false)`） */
  visible: boolean;
  /** 原 `onClose`：源由头部的「返回画布」触发（`_Component48.jsx:178` `onClose={() => a(false)}`） */
  onClose: () => void;
}

export function BackendView({ visible, onClose }: BackendViewProps) {
  const accounts = useStore((s) => s.accounts);
  /** 占用表（原 `Fi`/`Hk` 那套；`key` 即"正在用这个账号"）—— 挂载集合的一档守卫 */
  const accountBusy = useStore((s) => s.accountBusy);
  /**
   * ★ **后台页「还活着」的账号 id**（原 `_Component43` 的 `d` = `oT()`，`shared.js:25973`）
   * —— 由 `state/subscriptions.ts` 订阅端口写入（原则 2），`ui` **只读**。
   */
  const leasedAccounts = useStore((s) => s.leasedAccounts);
  /** 恢复静默（源 `Ve`）—— 把 `autoStart` 置回 `true` ⇒ 该账号重新进挂载集合 */
  const setAccountAutoStart = useStore((s) => s.setAccountAutoStart);
  const activeAccountId = useStore((s) => s.activeAccountId);
  /** 头部折叠（原 `se`）—— 键 `doubao-view-head-collapsed`，**读盘初始化 / 切换即写盘** */
  const headCollapsed = useStore((s) => s.viewHeadCollapsed);
  const setHeadCollapsed = useStore((s) => s.setViewHeadCollapsed);
  const pushToast = useStore((s) => s.pushToast);
  const accountOps = useAccountOps();
  /** 外链转发口（`ui` 不持端口 —— 铁律②）—— 原 `window.api.openExternal` 的接线 */
  const hostOps = useHostOps();

  /**
   * 当前显示的账号（原 `_Component43:3220-3222` 的 `Ke = s.find(id===o) || s[0]`）。
   * ⚠️ **必须带 `|| s[0]` 兜底**：源在「没选账号」时**回落到第一个账号**（`s` = **全部** accounts，不是已登录集）
   *   ⇒ 否则标题恒显「未选择账号」、四个按钮全不可用。
   */
  const active = accounts.find((a) => a.id === activeAccountId) ?? accounts[0] ?? null;
  /**
   * **已登录账号**（原 `_Component43.jsx:23-25` 的 `c`）——
   * 空态 / `SD` / 出新图条**三条条件的共同判据**。
   * ⚠️ 判据走真源 `isAccountUsable`（原 `(status || '已登录') === '已登录'`），**不另写一份**。
   */
  const loggedIn = accounts.filter(isAccountUsable);
  /**
   * **要挂 `<webview>` 的账号**（原 `_Component43.jsx:37-46` 的 `h` = `c ∩ (autoStart ∪ 租约快照)`）。
   *
   * ⚠️ 没人用的账号**不挂** `<webview>`：元素不在 ⇒ guest 进程不在 ⇒ 这才叫"不占用内存 / CPU"。
   * ★ **2026-10-13 修**：源那半边是**租约状态记录快照**（原 `Jn.keys()`，含 **drain 宽限** 1500ms）。
   *   此前本仓用 `accountBusy` 顶 —— 它**漏了「只持租约、不占 busy」的那一类**：
   *   `state/autoConfirm` 申请的是**独立租约**（`purpose: 'gen-confirm'`）⇒ 源会保持挂载，
   *   而按旧的判据页面会被**卸载** ⇒ 它的页内脚本全打在空元素上。现改用端口快照
   *   （`BackendPagePort.leases/subscribeLeases` → `state/subscriptions.ts` → `leasedAccounts`）。
   * ⚠️ 仍 **OR 上 `accountBusy`**（**有意的本仓差异**）：本仓的 busy 在**取租约之前**就置好
   *   （`holdAccount` 在选号阶段），若只留快照，`hold` 到租约之间会**瞬时卸载再重挂**
   *   （源是"先租约、后 busy"，没有这个窗口）⇒ 宁可多挂一个，不要闪一下。
   */
  const mounted = loggedIn.filter(
    (a) =>
      a.autoStart === true || leasedAccounts.includes(a.id) || Object.hasOwn(accountBusy, a.id),
  );

  /** ★ 「无水印资源」面板开合（原 `_Component43` 的「无水印资源（N）」按钮 `Ie(v => !v)` toggle） */
  const [watermarkOpen, setWatermarkOpen] = useState(false);
  /** ★ 出图条**拖拽中** ⇒ 给 `.webviews` 容器加落点高亮（原 `.nip-drop-active`，`_Component26.jsx:261`） */
  const [newImagesDropActive, setNewImagesDropActive] = useState(false);
  /** 无水印资源条数（「无水印资源（N）」按钮的 N，原 `ce.length` = **CDP 捕获列表**长度） */
  const watermarkCount = useStore((s) => s.dolaMediaItems.length);

  /**
   * 「刷新」—— 原 `_Component43.jsx:3235-3245`：`const ee = te(o); if (ee) ee.reload()`
   *
   * ★ 经 `accountOps.reloadBackend`（`ui` **不持端口** —— 铁律②；端口方法 `BackendPagePort.reload`
   *   此前**零消费**，本按钮是它的消费者）。
   * ⚠️ **失败可见**（原则 6）：源版这条链点下去**没有任何反馈**（`ee.reload()` 无返回）⇒
   *   本仓把 `Result` 的失败原文 toast 出来 —— **不静默**。
   */
  const onRefresh = useCallback(() => {
    if (!active) return;
    const r = accountOps.reloadBackend(active.id);
    if (!r.ok) pushToast(r.message, 4000, 'error');
  }, [accountOps, active, pushToast]);

  /**
   * 「浏览器打开」—— 原 `_Component43.jsx:3246-3254`：
   * ```js
   * onClick={() => { if (window.api?.openExternal) window.api.openExternal(
   *   Ke?.type === 'lovart' ? _p : Ke?.type === 'dola' ? nS : Ke?.type === 'tapnow' ? rS
   *   : Ke?.type === 'gpt' ? sS : Ke?.type === 'other' ? (Ke?.url || 'about:blank') : La); }}
   * ```
   * ⇒ 打开**该站点的 URL**（`La`/`nS`/`_p`/`rS`/`sS` 是站点常量）；`other` ⇒ **账号自己的 `url`**；
   *    兜底 `about:blank`。
   *
   * ★ **2026-10-12 接线（不造第二份）**：那串"站点常量"在本仓**已有唯一真源** ——
   *   `ports.sites[type].chatUrl`（`doubao` 就是 `'https://www.doubao.com/chat/'`，**逐字**等于源的 `La`）
   *   ⇒ 经 `accountOps.chatUrlOf(type)` 取（它自己就带 `?? 'about:blank'` 兜底）；
   *   只有源的 **`other` 分支**要单独照抄（`Ke.url || 'about:blank'`，`Account.url?: string` 本仓有）。
   * ⚠️ **失败可见**（原则 6）：源那行**没有任何反馈**（`openExternal` 无返回）⇒ 本仓把 `Result`
   *   的失败原文 toast 出来 —— 「不静默」。⚠️ 源也**不判 `visible`**（它在 `dv-actions` 里，
   *   只在可见时渲染）⇒ 本仓同样不判（按钮本身就在 `visible &&` 的头部里）。
   */
  const onOpenInBrowser = useCallback(() => {
    if (!active) return;
    const url =
      active.type === 'other' ? active.url || 'about:blank' : accountOps.chatUrlOf(active.type);
    void hostOps.openExternal(url).then((r) => {
      if (!r.ok) pushToast(r.message, 4000, 'error');
    });
  }, [accountOps, active, hostOps, pushToast]);

  /**
   * 头部高度（原 `pe`）—— `ResizeObserver` 量 `.headInner`（源 `_Component43.jsx:99-117`），
   * 供 `.headClip` 内联 `height` 做折叠过渡（源 `:3226-3228`）。
   */
  const headRef = useRef<HTMLDivElement>(null);
  const [headH, setHeadH] = useState(0);
  useEffect(() => {
    const el = headRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setHeadH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const headTitle = headCollapsed ? BACKEND_VIEW_TEXT.expandHead : BACKEND_VIEW_TEXT.collapseHead;

  /**
   * ★ **静默底图**（原 `_Component43.jsx:3277` 的 `UT(Ke.id)` → `<img className="silent-snap">`）
   *
   * 静默那一刻由 `BackendPagePort.captureSnapshot`（原 `je`）截下；`ui` **不持端口**（铁律②）
   * ⇒ 经 `accountOps.snapshotOf` 取（`ui → state → ports`）。
   * ⚠️ 只在**当前账号处于静默**时取（`autoStart !== true`）—— 其余情况遮罩根本不渲染。
   */
  const silentSnap = active && active.autoStart !== true ? accountOps.snapshotOf(active.id) : null;

  return (
    /*
      ★ 容器**始终渲染**（DOM 常驻 ⇒ `findWebview` 找得到），只切 `viewVisible`/`viewHidden`
        —— 逐字对源 `_Component43.jsx:3223` 的 `doubao-view${t ? ' dv-visible' : ' dv-hidden'}`。
      ⚠️ 源还有第三态 `dv-send-overlay`（**隐藏但仍有发送任务**时叠一个"发送中"覆盖层）——
        本仓的发送链是 `state/sendQueue` 的后台泵、不依赖视图可见性 ⇒ 暂无该态（如实登记，不造空壳）。
    */
    <div className={visible ? styles.view : `${styles.view} ${styles.viewHidden}`}>
      {/*
        ★ **头部工具栏**（原 `_Component43.jsx:3225-3271`）—— 2026-10-11 前**整条没落**，
          于是 `LS_VIEW_HEAD_COLLAPSED` 这个跨层契约键、`BACKEND_VIEW_TEXT` 的文案、
          以及 `BackendPagePort.reload` 都**没有消费者**。
        ⚠️ **2026-10-12 修正**：条件原为我写的「`active`（选中了账号）」—— 而源是 **`{t && …}`**
          （可见即渲染），账号未选中时由内部的 `Ke` 兜底（`s.find(id===active) || s[0]`）⇒ 改回 `visible`。
      */}
      {visible && (
        <div className={styles.head}>
          {/* 折叠高度**内联**（原 `:3226-3228` 的 `style={{ height: se ? 0 : pe }}`） */}
          <div
            className={styles.headClip}
            style={headH ? { height: headCollapsed ? 0 : headH } : undefined}
          >
            <div className={styles.headInner} ref={headRef}>
              <div className={styles.headTitle}>
                {/* 原 `3231-3232`：站点标题 · 账号名（未选账号 ⇒ `未选择账号`） */}
                {BACKEND_VIEW_TEXT.title[active?.type ?? ''] ?? BACKEND_VIEW_TEXT.title.doubao} ·{' '}
                {active?.name || BACKEND_VIEW_TEXT.noAccount}
              </div>
              <div className={styles.actions}>
                {/* 原 `dv-actions`（`:3235-3264`）—— ★ 按钮类名**逐字对源**：`btn sm` / `btn sm primary`
                    ⇒ 一律 `composes` 真源（`docs/17` 查 6），不自造小按钮。 */}
                {/* 原 `:3243` 的 `disabled={Ke?.autoStart !== true}` —— 静默中的账号**没有挂载**，刷新无从谈起 */}
                <button
                  type="button"
                  className={styles.headBtn}
                  onClick={onRefresh}
                  disabled={active?.autoStart !== true}
                >
                  {BACKEND_VIEW_TEXT.refresh}
                </button>
                <button type="button" className={styles.headBtn} onClick={onOpenInBrowser}>
                  {BACKEND_VIEW_TEXT.openInBrowser}
                </button>
                {/*
                  ★ 「无水印资源（N）」按钮（原 `_Component43.jsx:3255-3261`）——
                    条件**逐字照源** = `type === 'dola' || type === 'doubao'`（**不是**「非 lovart」）。
                */}
                {active && (active.type === 'dola' || active.type === 'doubao') ? (
                  <button type="button" className={styles.headBtn} onClick={() => setWatermarkOpen(!watermarkOpen)}>
                    {WATERMARK_PANEL_TEXT.title}
                    {watermarkOpen ? '' : `（${watermarkCount}）`}
                  </button>
                ) : null}
                {/* 「返回画布」= 源的 `onClose` 入口（`_Component48.jsx:178` 的 `onClose={() => a(false)}`） */}
                <button type="button" className={styles.headBtnPrimary} onClick={onClose}>
                  {BACKEND_VIEW_TEXT.backToCanvas}
                </button>
              </div>
            </div>
          </div>
          {/* 原 `3268`：`dv-head-toggle`（`∨`/`∧` + 两个 title/aria 文案，逐字） */}
          <button
            type="button"
            className={styles.headToggle}
            title={headTitle}
            aria-label={headTitle}
            aria-expanded={!headCollapsed}
            onClick={() => setHeadCollapsed(!headCollapsed)}
          >
            {headCollapsed ? '∨' : '∧'}
          </button>
        </div>
      )}

      {/* ★ 这个**字面量类**不是装饰：`adapters/site/shared/webview.ts` 的 `findWebview` 靠它定位容器
          （`WEBVIEWS_HOST_CLASS` = SSOT）。2026-10-11 前这里只挂 CSS-module 哈希类 ⇒ 定位恒失效。 */}
      <div
        className={`${WEBVIEWS_HOST_CLASS} ${styles.webviews}${
          newImagesDropActive ? ` ${styles.webviewsDropActive}` : ''
        }`}
      >
        {mounted.map((a) => (
          <AccountWebview
            key={a.id}
            account={a}
            /* 原 `isActive={t && ee.id === o && ee.autoStart === true}`（`_Component43.jsx:3274`） */
            active={visible && a.id === activeAccountId && a.autoStart === true}
          />
        ))}

        {/*
          静默遮罩（原 `_Component43.jsx:3276-3295`）——
          条件 = `c.length>0 && Ke && Ke.autoStart !== true`：当前账号**没挂载**（静默中）时，
          给一句说明 + 一个恢复入口。恢复 = `setAccountAutoStart(id, true)`（源 `Ve`，`:516-524`）。
        */}
        {loggedIn.length > 0 && active && active.autoStart !== true ? (
          <div className={styles.silentOverlay}>
            {/*
              ★ 底图（原 `_Component43.jsx:3278` 的 `<img className="silent-snap" src={ee} />`）——
              静默那一刻截下的页面样子；截不到就没有它（遮罩退化为纯色底）。
              ⚠️ **不落源的 `has-snap` 类**（`:3277` 的 `silent-overlay${ee ? ' has-snap' : ''}`）：
              `mockup.css` 无该条、全仓 **0 读者** ⇒ 建它就是造一个没有消费者的状态
              （同 `dv-wv-*` 的既有裁定，`daily/架构日志/16-…-2026-10-12.md` §10.2）。
            */}
            {silentSnap && (
              <img className={styles.silentSnap} src={silentSnap} alt="" draggable={false} />
            )}
            <div className={styles.silentMask} />
            <div className={styles.silentCenter}>
              <button
                type="button"
                className={styles.silentResume}
                title={BACKEND_VIEW_TEXT.resume}
                aria-label={BACKEND_VIEW_TEXT.resume}
                onClick={() => setAccountAutoStart(active.id, true)}
              >
                <span className={styles.silentPauseIcon} aria-hidden="true">
                  <i />
                  <i />
                </span>
              </button>
              <div className={styles.silentTip}>{BACKEND_VIEW_TEXT.silent(active.name)}</div>
            </div>
          </div>
        ) : null}
      </div>

      {/* 空态（原 `_Component43.jsx:3297`：`{c.length === 0 && …}`，`c` = **已登录账号**列表） */}
      {loggedIn.length === 0 && <div className={styles.emptyHint}>{ACCOUNT_PANEL_TEXT.emptyHint}</div>}

      {/*
        ★ 「无水印资源」面板（原 `SD`，`_Component43.jsx:3298`）——
        ★ 位置照源：在 **webviews 之后**（视图底部）；条件 = `t && c.length>0 && Ke?.type !== 'lovart'`。
      */}
      {visible && loggedIn.length > 0 && active && active.type !== 'lovart' && watermarkOpen ? (
        <WatermarkPanel onClose={() => setWatermarkOpen(false)} />
      ) : null}

      {/*
        ★ 「出新图」条（原 `_Component26`，`_Component43.jsx:3301`）——
        ★ 位置照源：在 **webviews 之后**（它靠"把图拖进后台页面"交互，源就把它摆在 webview 下方）；
        条件 = `t && c.length>0 && Ke?.type ∈ {lovart, tapnow, other}`。
      */}
      {visible && loggedIn.length > 0 && NEW_IMAGES_SITES.includes(active?.type ?? '') && (
        <NewImagesPanel onDropActiveChange={setNewImagesDropActive} />
      )}
    </div>
  );
}
