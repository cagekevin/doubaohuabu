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

import { useCallback, useEffect, useState } from 'react';
import { useAccountOps, useHostOps, useStore } from '@/state';
import type { Account } from '@/stable/model/account';
// ★ 容器钩子类名的 SSOT（`findWebview` 靠它定位；见下方 `className`）
import { WEBVIEWS_HOST_CLASS } from '@/stable/contracts/schemas';
import { BACKEND_VIEW_TEXT, WATERMARK_PANEL_TEXT } from '@/constants/text';
import { NEW_IMAGES_SITES } from '@/core/rules/accountPick';
// ★ 默认会话分区的**唯一真源**（`TD-04-11`：同一语义此前 5 处定义 3 套值）
import { defaultPartitionOf } from '@/core/rules/partition';
import { NewImagesPanel } from './NewImagesPanel';
import { WatermarkPanel } from './WatermarkPanel';
import styles from './BackendView.module.css';
import shared from '@/ui/common/shared.module.css';

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

function AccountWebview({ account, active }: { account: Account; active: boolean }) {
  // ★ 2026-10-11：原先两处 `usePorts()` 直调（`host.account.ensureFingerprint` / `sites[].chatUrl`）
  //   已收口到 `accountOps`（TD-16-8）—— 组件不再持有 `Ports`。
  const accountOps = useAccountOps();
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
          partition: partitionOf(account),
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
  }, [accountOps, account.id, account.partition, account.fingerprint, account.type]);

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
  const activeAccountId = useStore((s) => s.activeAccountId);
  /** 头部折叠（原 `se`）—— 键 `doubao-view-head-collapsed`，**读盘初始化 / 切换即写盘** */
  const headCollapsed = useStore((s) => s.viewHeadCollapsed);
  const setHeadCollapsed = useStore((s) => s.setViewHeadCollapsed);
  const pushToast = useStore((s) => s.pushToast);
  const accountOps = useAccountOps();
  /** 外链转发口（`ui` 不持端口 —— 铁律②）—— 原 `window.api.openExternal` 的接线 */
  const hostOps = useHostOps();

  /** 当前选中的账号（原 `_Component43:3220-3222` 的 `Ke`） */
  const active = accounts.find((a) => a.id === activeAccountId) ?? null;

  /** ★ 「无水印资源」面板开合（原 `_Component43` 的「无水印资源（N）」按钮 `Ie(v => !v)` toggle） */
  const [watermarkOpen, setWatermarkOpen] = useState(false);
  /** 无水印视频条数（「无水印资源（N）」按钮的 N，原 `ce.length`） */
  const watermarkCount = useStore((s) => s.videoShares.length);

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

  const headTitle = headCollapsed ? BACKEND_VIEW_TEXT.expandHead : BACKEND_VIEW_TEXT.collapseHead;

  return (
    /*
      ★ 容器**始终渲染**（DOM 常驻 ⇒ `findWebview` 找得到），只切 `viewVisible`/`viewHidden`
        —— 逐字对源 `_Component43.jsx:3223` 的 `doubao-view${t ? ' dv-visible' : ' dv-hidden'}`。
      ⚠️ 源还有第三态 `dv-send-overlay`（**隐藏但仍有发送任务**时叠一个"发送中"覆盖层）——
        本仓的发送链是 `state/sendQueue` 的后台泵、不依赖视图可见性 ⇒ 暂无该态（如实登记，不造空壳）。
    */
    <div className={`${styles.view} ${visible ? styles.viewVisible : styles.viewHidden}`}>
      {/*
        ★ **头部工具栏**（原 `_Component43.jsx:3225-3271`）—— 2026-10-11 前**整条没落**，
          于是 `LS_VIEW_HEAD_COLLAPSED` 这个跨层契约键、`BACKEND_VIEW_TEXT` 的文案、
          以及 `BackendPagePort.reload` 都**没有消费者**。
        ⚠️ **2026-10-12 修正**：条件原为我写的「`active`（选中了账号）」—— 而源是 **`{t && …}`**
          （可见即渲染），账号未选中时由内部的 `Ke` 兜底（`s.find(id===active) || s[0]`）⇒ 改回 `visible`。
      */}
      {visible && (
        <div className={`${styles.head} ${headCollapsed ? styles.headCollapsed : ''}`}>
          <div className={styles.headClip}>
            <div className={styles.headInner}>
              <div className={shared.panelTitle}>
                {/* 原 `3231-3232`：站点标题 · 账号名（未选账号 ⇒ `未选择账号`） */}
                {BACKEND_VIEW_TEXT.title[active?.type ?? ''] ?? BACKEND_VIEW_TEXT.title.doubao} ·{' '}
                {active?.name || BACKEND_VIEW_TEXT.noAccount}
              </div>
              <div className={styles.actions}>
                {/* 原 `dv-actions`（`:3247-3266`）：`刷新` · `浏览器打开` · `无水印资源（N）` · `返回画布`
                    ⚠️ 本仓当前只落 `刷新` 与 `返回画布`（另两项属未落功能，见 `docs/13` §2.3）。 */}
                <button type="button" className={styles.btn} onClick={onRefresh}>
                  {BACKEND_VIEW_TEXT.refresh}
                </button>
                <button type="button" className={styles.btn} onClick={onOpenInBrowser}>
                  {BACKEND_VIEW_TEXT.openInBrowser}
                </button>
                {/*
                  ★ 「无水印资源（N）」按钮（原 `_Component43.jsx:3260`）—— 2026-10-12 落
                    （`docs/13` §2.3 的 `SD` 面板）。条件 = 非 lovart（原 `Ke?.type !== 'lovart'`）。
                */}
                {active && active.type !== 'lovart' ? (
                  <button type="button" className={styles.btn} onClick={() => setWatermarkOpen(!watermarkOpen)}>
                    {WATERMARK_PANEL_TEXT.title}
                    {watermarkOpen ? '' : `（${watermarkCount}）`}
                  </button>
                ) : null}
                {/* 「返回画布」= 源的 `onClose` 入口（`_Component48.jsx:178` 的 `onClose={() => a(false)}`） */}
                <button type="button" className={styles.btn} onClick={onClose}>
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

      {/*
        ★ 「出新图」条（原 `_Component26`）—— **源里它是本视图的子节点**（`_Component43.jsx:3301`）：
        ```jsx
        {t && c.length>0 && (Ke?.type==='lovart'||Ke?.type==='tapnow'||Ke?.type==='other')
          && <_Component26 account={Ke} active={t} />}
        {t && c.length>0 && Ke?.type!=='lovart' && <_SD items={ce} open={…} onClose={…} />}   // ← 另一支
        ```
        ⚠️ **2026-10-12 修正（我上一版写错了）**：上一版只写 `{visible && <NewImagesPanel />}` ⇒
           **无条件渲染**，而源**只在 lovart / tapnow / other** 三站渲染它；其余站点（doubao/dola/gpt）
           那一支是 **`SD`（「无水印资源」面板）** —— 见下方 `SD` 的未落登记。
        ⚠️ 它靠"把图拖进后台页面"交互 ⇒ 必须紧贴下面的 webview 区（源即如此）。
      */}
      {visible && NEW_IMAGES_SITES.includes(active?.type ?? '') && <NewImagesPanel />}

      {/*
        ★ 「无水印资源」面板（原 `SD.jsx`）—— 源 `_Component43.jsx:3298` 的另一支：
          `{t && c.length>0 && Ke?.type!=='lovart' && <_SD items={ce} …/>}`。
          2026-10-12 落（`docs/13` §2.3 的 `SD`）—— 只展示视频（`videoShares`），图来自
          `onDolaMedia`（未落），如实标注。
      */}
      {visible && watermarkOpen && active && active.type !== 'lovart' ? (
        <WatermarkPanel onClose={() => setWatermarkOpen(false)} />
      ) : null}
      {/*
        ⏳ **未落的那一支**（源 `:3298`）：`{t && c.length>0 && Ke?.type!=='lovart' && <_SD …/>}` ——
           `SD` 就是「**无水印资源**」面板（`SD.jsx` 160 行：`dola-media-panel` / `dmp-head` / `dmp-title`
           `无水印资源` / `dmp-count` / `dmp-path-row`（下载到） / `docked` 态）⇒ 与 `dv-actions` 的
           「无水印资源（N）」按钮（toggle）、`fetchWatermarkFree`、`videoShares` **是同一个功能块**。
      */}

      {/* ★ 这个**字面量类**不是装饰：`adapters/site/shared/webview.ts` 的 `findWebview` 靠它定位容器
          （`WEBVIEWS_HOST_CLASS` = SSOT）。2026-10-11 前这里只挂 CSS-module 哈希类 ⇒ 定位恒失效。 */}
      <div className={`${WEBVIEWS_HOST_CLASS} ${styles.webviews}`}>
        {accounts.map((a) => (
          <AccountWebview key={a.id} account={a} active={a.id === activeAccountId} />
        ))}
      </div>
    </div>
  );
}
