/**
 * UI slice（① 全局共享 —— 见 docs/11 §5.1）
 *
 * ⚠️ 原则 1：**只有 state 能写 store**。usecases / adapters 只能返回结果，由本层写入。
 * ⚠️ 原则 5（SSOT）：错误**文案映射**在 `constants/failure.ts`，本层**只存"当前有哪些错误"**。
 *    （这是 docs/11 §6.5 审计越权 4 的修正）
 * ⚠️ §5.3：单 slice ≤300 行 / ≤25 字段 —— 超了就按共享范围再分
 */

import type { BackendErrorKind } from '@/constants/failure';
import type { ToastLevel } from '@/constants/text';
// ⚠️ 形状真源在用例层（`sendQueue.ts`）—— state 依赖 core 是允许方向
import type { NodeSendState } from '@/core/usecases/sendQueue';
import {
  LS_NEWIMAGES_AUTOCAP,
  LS_NEWIMAGES_CURRENT_ONLY,
  LS_NEWIMAGES_FOLDED,
  LS_VIEW_HEAD_COLLAPSED,
} from '@/stable/contracts/keys';
import type { CanvasDefaults } from '@/stable/contracts/lsValues';

/** 默认 toast 时长（ms） */
const TOAST_DURATION_MS = 3000;

/**
 * 本片负责持久化的**布尔开关**（原 `zd(key,'0') === '1'` / `Fd(key, v?'1':'0')`）
 *
 * ⚠️ **只列本片真的用**的键（判据 B5：不留没人读的开关）—— 四处：
 *   `doubao-newimages-{autocap,current-only,folded}` + `doubao-view-head-collapsed`（后台视图头部折叠）。
 * ⚠️ `autocap` = **非 Lovart 站点**的自动值守总开关（`docs/过程.md` #11 / `main.js:2749` 的裁定**只覆盖 Lovart**）。
 */
export type UiFlagKey =
  | typeof LS_NEWIMAGES_FOLDED
  | typeof LS_NEWIMAGES_CURRENT_ONLY
  | typeof LS_NEWIMAGES_AUTOCAP
  | typeof LS_VIEW_HEAD_COLLAPSED;

/** 本片的注入（`state` 不碰 `localStorage` —— 键的读写在 `persistKeys` 的唯一落点上） */
export interface UiSliceDeps {
  now: () => number;
  /** 读一个开关（原 `zd(key, '0') === '1'`；缺省 ⇒ false） */
  readFlag: (key: UiFlagKey) => boolean;
  /** 写一个开关（原 `Fd(key, v ? '1' : '0')`） */
  writeFlag: (key: UiFlagKey, value: boolean) => void;
  /**
   * 读「画布默认值」（原 `NT()`，`shared.js:26491-26503`：`JSON.parse` 失败 / 非对象 ⇒ 兜底三空）
   *
   * ★ **2026-10-12 落（`docs/过程.md` §3 的 `canvasDefaults` 真缺口）**：它是**对象**，不是 `'0'/'1'` 开关
   * ⇒ 不走 `readFlag`/`writeFlag`（那两个的签名只收 `UiFlagKey` 且值恒字符串）。
   */
  readCanvasDefaults: () => CanvasDefaults;
  /** 写「画布默认值」（原 `ST(r)`，`shared.js:26484`） */
  writeCanvasDefaults: (value: CanvasDefaults) => void;
}

/**
 * Toast 上的**操作按钮**（原 `showToast(msg, type, duration, o)` 的第 4 参 `o`，`shared.js:30542`）
 *
 * ⚠️ **形状逐字对源**：源把它存进 toast 对象（`action: o || null`），`_Component42.jsx:1478-1488`
 *   渲染成 `<button class="app-toast-action">`；点击时 `stopPropagation` → 调 `onClick` → 清 toast。
 * ⚠️ **为什么允许 store 里存闭包**：源版就是存闭包（`{label, onClick}`），且 toast **不落盘**
 *   （不在 `PersistSnapshot` 里）⇒ 无序列化要求。改成"动作描述符 + 在 ui 侧分派"会多一层间接，
 *   却只服务当前唯一消费者（`GenVideoNode` 的「在文件夹中显示」）。
 */
export interface ToastAction {
  label: string;
  onClick: () => void;
}

/**
 * Toast 数据形状（★ 由 state 拥有 —— 数据在 state；`ui/common/ToastHost` 只 import 类型）
 * 依据：docs/11 §6.5 原则 1「谁拥有状态谁写」+ 分层（state 不得依赖 ui）
 */
export interface ToastItem {
  id: string;
  message: string;
  /** 毫秒；0 = 不自动消失 */
  duration: number;
  /**
   * 语气（原 `showToast(text, 'info' | 'warn' | 'err')`）
   *
   * ★ **2026-10-10 补**：此前只有 `message` + `duration` ⇒ 源版按 info / warn / err
   *   分级的提示**全用同一个样式**（`analyzePrompt` / 批量发送 / 额度异常这些都带语气）。
   * ⚠️ 等级联合的真源在 `constants/text.ts`（core 不得向上依赖 state）。
   */
  level: ToastLevel;
  /** ★ 2026-10-11 补：操作按钮（原第 4 参 `o`）—— 缺省则无按钮 */
  action?: ToastAction;
}

/** 横幅错误（★ 保留原始 message —— 原则 6：错误不可被掩盖） */
export interface BannerError {
  id: string;
  kind: BackendErrorKind;
  /** ★ 原始错误原文，不得改写 */
  message: string;
}

/**
 * ★ 图片编辑器打开时的上下文（原 store `imageEditor`，`shared.js:31449-31458`）
 *
 * ⚠️ **为什么住 store 而不是组件局部 state**：编辑器由**节点内**的「编辑图片」按钮打开，
 *   但浮层是**全屏模态**（原 `G3.jsx` 的 `.ie-overlay-root`）⇒ 由**外壳**（`CanvasHost`）渲染，
 *   与 `splitKeywordModal` / `genPanelNodeId` 同法。
 */
export interface ImageEditorState {
  nodeId: string;
  /** 被编辑的图（`img://` / `data:`） */
  imgRef: string;
  label: string;
}

export interface UiSlice {
  // ── state ──
  toasts: ToastItem[];
  backendErrors: BannerError[];
  /** 画布选中数（工具条用） */
  selectedCount: number;
  /**
   * 当前**显示**在后台视图里的账号（原 `_Component43` 的 `o`）
   *
   * 原版同一个时刻只让一个账号的 `<webview>` 可见（其余 `dv-wv-hidden`），
   * 用户就是在那个可见页面里登录。`null` ⇒ 全隐藏（只跑后台任务、不给人看）。
   */
  activeAccountId: string | null;
  /**
   * ★ **最近一次成功发送用的账号**（原 `lastSentAccountId`，`shared.js:26790` ＋ setter `:30395`）
   *
   * **写方**（源对位）：发送/填入成功后 —— `state/batchSend` 的 `transport` 成功分支
   *   （源 `OL.jsx:360`："已自动发送/填入成功后 `setLastSentAccount(V.id)`"）。
   *   ⚠️ 源另一处写方 `_Component43.jsx:2538` 是**换号重发**成功后 —— 本仓**没有那条链**，如实登记。
   * **读方**：顶栏「豆包后台」入口的**补齐逻辑**（`core/rules/accountPick.pickActiveAccountFallback`
   *   ← `AppShell.openDoubaoView`）。
   * ⚠️ 源里 `_Component48.jsx:23-25` 也订阅了它却**从不使用** —— 那是**源自己的死订阅**，
   *   **不照抄**（判据 B5：不留没人读的订阅）。
   * ⚠️ **内存态、不落盘**（源 `:26790` 给的是字面量 `null`，不是读盘函数 ⇒ 不在 `PersistSnapshot`）。
   */
  lastSentAccountId: string | null;
  /**
   * ★ **「按关键词拆分」弹窗**（原 `splitKeywordModal` shared.js:26776 / 28535-28546）
   *
   * ⚠️ **为什么它住 store 而不是组件局部 state**：弹窗由**画布节点内**的按钮打开，
   *    但必须由**画布宿主**（`CanvasHost.Inner`）渲染 —— 因为拆分会**删掉源节点**
   *    （渲染在节点里的弹窗会随之卸载），且节点在 ReactFlow 的**变换容器**内
   *    （`position: fixed` 的浮层会被 transform 带偏）。源版也正是这么放的。
   */
  splitKeywordModal: { sourceNodeId: string } | null;
  openSplitKeywordModal: (sourceNodeId: string) => void;
  closeSplitKeywordModal: () => void;
  /**
   * ★ **「拆分并套用节点预设」弹窗**（原 `splitPresetPicker`，`shared.js:26775` / `28524-28534`）
   *   —— **2026-10-12 落**
   *
   * **何时开**（源 `te`，`_Component42.jsx:191-206`）：拆分弹窗提交时，`presets` 里**有图预设**
   * ⇒ **不直接拆**，先开本弹窗让用户挑；没有图预设 ⇒ 直接 `splitDirect`。
   * ⚠️ 同 `splitKeywordModal`：由**外壳**（`CanvasHost`）渲染 —— 拆分会删掉源节点，
   *   渲染在节点内的浮层会随之卸载；且节点的 `transform` 会把 `position: fixed` 带偏。
   */
  splitPresetPicker: { sourceNodeId: string; keywords: string[] } | null;
  openSplitPresetPicker: (sourceNodeId: string, keywords: readonly string[]) => void;
  closeSplitPresetPicker: () => void;

  /**
   * ★ **生成面板打开的节点**（原 `genPanelNodeId` / `imggenPanelNodeId`，
   *   `shared.js:31467,31482`；开/关 = `openGeneratePanel`/`closeGeneratePanel`/
   *   `openImageGenPanel`/`closeImageGenPanel`，同文件 31468-31496）
   *
   * ⚠️ **与 `splitKeywordModal` 同法**：面板由**节点内**的卡片点击打开，却由**外壳**渲染
   *    （`AppShell` 里的 `<GenPanel/>`）。
   * ⚠️ 源是**两个**面板（`Z3_1.jsx` 文生视频 / `_Component45.jsx` 文生图）各带一个 id；
   *    本仓的 `GenPanel` 是**二者合一**（既有设计）⇒ 消费侧取「先 imggen 后 genvideo」。
   * ⚠️ **这是唯一真源**：此前 `GenPanel` 用 `selected` 推导（`docs/过程.md` §4 的登记项）。
   */
  genPanelNodeId: string | null;
  imggenPanelNodeId: string | null;
  openGeneratePanel: (nodeId: string) => void;
  closeGeneratePanel: () => void;
  openImageGenPanel: (nodeId: string) => void;
  closeImageGenPanel: () => void;

  /**
   * ★ **图片编辑器上下文**（原 `imageEditor`，`shared.js:31449`）
   *
   * **开**：`openImageEditor`（原 31449-31459：**`nodeId` 与 `imgRef` 都非空才写**）
   * **关**：`closeImageEditor`（原 31460-31466：有值才写 `null`）
   * ⚠️ **内存态、不落盘**（源版也是纯 store 字段，不在 `PersistSnapshot`）。
   */
  imageEditor: ImageEditorState | null;
  openImageEditor: (nodeId: string, imgRef: string, label?: string) => void;
  closeImageEditor: () => void;

  // ── 「出新图」面板的持久化开关（原 `_Component26` 的 `f` / `m` 两个 `useState` + `Fd`）──
  /**
   * 折叠态（原 `f`，键 `doubao-newimages-folded`）
   * ⚠️ 与源一致：**初始化时读盘**（`zd(v0,'0')==='1'`），切换时**立即写盘**（`Fd`）——
   *    不经防抖落盘（它不在 `PersistSnapshot` 里；源版也是直接 `localStorage`）。
   */
  newImagesFolded: boolean;
  /** 只留本画布（原 `m`，键 `doubao-newimages-current-only`） */
  newImagesCurrentOnly: boolean;
  /**
   * ★ **自动值守**总开关（原 `u`，键 `doubao-newimages-autocap`）
   *
   * ⚠️ 这里**只存"用户想不想开"**；**真的开**由 `accountOps.setAutoWatch(on)` 落到定时器上
   *    （谁参与 / 什么节奏 → 由 adapter 的 `SitePort.autoWatch` 决定）。UI 只负责把开关传下去。
   */
  newImagesAutoWatch: boolean;
  setNewImagesFolded: (value: boolean) => void;
  setNewImagesCurrentOnly: (value: boolean) => void;
  setNewImagesAutoWatch: (value: boolean) => void;

  // ── 后台视图头部折叠（原 `_Component43.jsx:3225-3271` 的 `se` ＋ 键 `doubao-view-head-collapsed`）──
  /**
   * 后台视图**头部工具栏**是否收起（原 `se`）
   * ⚠️ 与 `newImagesFolded` 同法：**初值读盘**、切换**立即写盘**（源 `Fd`）——
   *    不经防抖落盘（它不在 `PersistSnapshot` 里）。
   */
  viewHeadCollapsed: boolean;
  setViewHeadCollapsed: (value: boolean) => void;

  // ── 画布默认值（原 `canvasDefaults`，`shared.js:30457`；键 `doubao-canvas-defaults`）──
  /**
   * ★ **新建文本节点吃的默认值**（原 `canvasDefaults`，`shared.js:26760` 附近的 store 声明 ⇒
   *   初值 `NT()` 读盘、setter `30458-30468`）
   *
   * **谁读**：建文本框那两条路 —— 源 `29440-29442`（普通建框）与 `29486-29488`（「重跑」）
   *   ⇒「`aspectRatio: canvasDefaults.ratio || <默认比例>`、`duration: … || 7`、`model: … || null`」。
   *   ⚠️ 本仓那个「默认比例」的**真源** = `NODE_DEFAULT_RATIO_LABEL`（`constants/models.ts`，现 `'4:3'`），
   *   不再在注释里复述源版的 `'16:9'`（复述即第二份、会漂）。
   * **谁写**：源里 `setCanvasDefaults` **0 调用** ⇒ 值实际上**只从盘上来**（本仓同此：
   *   以 `hydrate` 读盘 ⇒ 建节点时消费为主路径；setter 保留以对源，将来有设置 UI 直接可用）。
   */
  canvasDefaults: CanvasDefaults;
  /**
   * 合并写（原 `setCanvasDefaults`，`shared.js:30458-30468`）
   * ⚠️ 与源逐字一致：**非对象 ⇒ 直接 `return`（不抛）**；否则 `om({...old, ...patch})` 合并 ＋ **显式落盘**。
   */
  setCanvasDefaults: (patch: Partial<CanvasDefaults>) => void;

  // ── actions（只做编排，不做业务）──
  /**
   * 推一条 toast
   * @param level 语气（默认 `'info'`）—— **加在第三位**，保证既有 `pushToast(msg)` /
   *   `pushToast(msg, 5000)` 调用**零改动**（向后兼容）
   * @param action ★ 2026-10-11 补：操作按钮（原 `showToast` 第 4 参）—— **加在第四位**，
   *   同样保证既有调用零改动；缺省则无按钮（原 `o = null`）
   */
  pushToast: (message: string, duration?: number, level?: ToastLevel, action?: ToastAction) => void;
  dismissToast: (id: string) => void;
  /** 上报后端错误（原始 message 必须原样传入） */
  pushBackendError: (kind: BackendErrorKind, message: string) => void;
  dismissBackendError: (id: string) => void;
  clearBackendErrors: () => void;
  setSelectedCount: (n: number) => void;
  setActiveAccountId: (id: string | null) => void;
  /** 原 `setLastSentAccount`（`shared.js:30395`）—— 写方只有发送成功路径 */
  setLastSentAccount: (id: string | null) => void;
  /**
   * ★ **节点的发送状态**（原 `nodeSendStates[id]`）
   *
   * 两个用处（与源一致）：① 节点上显示状态圆点；② `x3` 的**防重复发送**守卫
   * （`input.isSending(nodeId)` ⇒ `该节点正在发送中，已跳过（防止重复发送）`）。
   * ⚠️ 不持久化（源版也不落盘）—— 重启即清空。
   */
  nodeSendStates: Record<string, NodeSendState>;
  setNodeSendState: (nodeId: string, patch: Omit<NodeSendState, 'nodeId'>) => void;
  /**
   * ★ **清掉**某节点的发送状态（原 `clearNodeSendState`，`OL.jsx:194-196`）
   *
   * ⚠️ 为什么需要"清"而不是"写一个 idle"：源版 `OL.jsx:197-207` 的 `S()` 助手在
   *   `status === 'idle' || !msg` 时走的是 **`C(e)` 删除** —— 于是节点上**没有这条记录**，
   *   与「有一条 `status:'idle'` 的记录」在展示上不同（后者会让状态圆点常驻）。
   */
  clearNodeSendState: (nodeId: string) => void;
}

/** 用注入的时钟生成 id（避免在 store 里直接调 Date.now —— 原则 4 的延伸） */
export function createUiSlice(deps: UiSliceDeps) {
  let seq = 0;
  const nextId = (prefix: string) => `${prefix}-${deps.now().toString(36)}-${++seq}`;

  return (set: (partial: Partial<UiSlice>) => void, get: () => UiSlice): UiSlice => ({
    toasts: [],
    backendErrors: [],
    selectedCount: 0,
    activeAccountId: null,
    // ★ 原 `lastSentAccountId: null`（**内存态**；真正的初值由发送路径写入）
    lastSentAccountId: null,
    splitKeywordModal: null,
    // ★ 「拆分并套用节点预设」（源 `splitPresetPicker: null`，`shared.js:26775`）
    splitPresetPicker: null,
    genPanelNodeId: null,
    imggenPanelNodeId: null,
    // ★ 图片编辑器（源 `imageEditor: null`，`shared.js` 里的 store 初值）
    imageEditor: null,
    nodeSendStates: {},
    // ★ 初值**读盘**（原 `_Component26.jsx:30-45` 的 `zd(y0/v0/w0, '0') === '1'`）
    newImagesFolded: deps.readFlag(LS_NEWIMAGES_FOLDED),
    newImagesCurrentOnly: deps.readFlag(LS_NEWIMAGES_CURRENT_ONLY),
    newImagesAutoWatch: deps.readFlag(LS_NEWIMAGES_AUTOCAP),
    // ★ 后台视图头部折叠（源 `zd('<view-head-collapsed>','0')==='1'`）
    viewHeadCollapsed: deps.readFlag(LS_VIEW_HEAD_COLLAPSED),
    // ★ 画布默认值（源 `canvasDefaults: NT()` —— 读盘）
    canvasDefaults: deps.readCanvasDefaults(),

    pushToast: (message, duration = TOAST_DURATION_MS, level = 'info', action) => {
      set({
        toasts: [
          ...get().toasts,
          // 缺 `action` 时**不写该字段**（原 `action: o || null`；这里用可选属性，语义等价）
          { id: nextId('toast'), message, duration, level, ...(action ? { action } : {}) },
        ],
      });
    },

    dismissToast: (id) => {
      set({ toasts: get().toasts.filter((t) => t.id !== id) });
    },

    pushBackendError: (kind, message) => {
      // ⚠️ 去重：同 kind + 同 message 不重复堆叠
      const exists = get().backendErrors.some((e) => e.kind === kind && e.message === message);
      if (exists) return;
      set({ backendErrors: [...get().backendErrors, { id: nextId('err'), kind, message }] });
    },

    dismissBackendError: (id) => {
      set({ backendErrors: get().backendErrors.filter((e) => e.id !== id) });
    },

    clearBackendErrors: () => set({ backendErrors: [] }),

    setSelectedCount: (n) => set({ selectedCount: n }),
    setActiveAccountId: (activeAccountId) => set({ activeAccountId }),
    // ★ 原 `setLastSentAccount`（`shared.js:30395`：`{ lastSentAccountId: n }`）
    setLastSentAccount: (lastSentAccountId) => set({ lastSentAccountId }),

    openSplitKeywordModal: (sourceNodeId) => set({ splitKeywordModal: { sourceNodeId } }),
    closeSplitKeywordModal: () => set({ splitKeywordModal: null }),
    // ★ 源 `openSplitPresetPicker(n, r)`（`shared.js:28524-28531`）：`keywords: r || []`
    openSplitPresetPicker: (sourceNodeId, keywords) =>
      set({ splitPresetPicker: { sourceNodeId, keywords: [...keywords] } }),
    closeSplitPresetPicker: () => set({ splitPresetPicker: null }),

    // ⚠️ 逐字对源：`open*` 空 id **直接忽略**（`if (n) e({...})`）、`close*` 只在有值时才写
    openGeneratePanel: (nodeId) => {
      if (nodeId) set({ genPanelNodeId: nodeId });
    },
    closeGeneratePanel: () => {
      if (get().genPanelNodeId) set({ genPanelNodeId: null });
    },
    openImageGenPanel: (nodeId) => {
      if (nodeId) set({ imggenPanelNodeId: nodeId });
    },
    closeImageGenPanel: () => {
      if (get().imggenPanelNodeId) set({ imggenPanelNodeId: null });
    },

    // ⚠️ 逐字对源（`shared.js:31449-31466`）：开**只认 nodeId + imgRef 都非空**；关**有值才写 null**
    openImageEditor: (nodeId, imgRef, label = '') => {
      if (nodeId && imgRef) set({ imageEditor: { nodeId, imgRef, label } });
    },
    closeImageEditor: () => {
      if (get().imageEditor) set({ imageEditor: null });
    },

    setNewImagesFolded: (value) => {
      // ⚠️ 与源一致：**先写盘再改状态**（原 `p(le => { Fd(v0, …); return te; })`）
      deps.writeFlag(LS_NEWIMAGES_FOLDED, value);
      set({ newImagesFolded: value });
    },
    setNewImagesCurrentOnly: (value) => {
      deps.writeFlag(LS_NEWIMAGES_CURRENT_ONLY, value);
      set({ newImagesCurrentOnly: value });
    },
    setNewImagesAutoWatch: (value) => {
      // ⚠️ 与源一致（原 `he`：`d(le); Fd(y0, …)`）—— **先写盘再改状态**
      deps.writeFlag(LS_NEWIMAGES_AUTOCAP, value);
      set({ newImagesAutoWatch: value });
      // ★ 后台视图头部折叠（`setViewHeadCollapsed`）与上面三个同法，见下方
    },

    setViewHeadCollapsed: (value) => {
      // ⚠️ 与源一致：**先写盘再改状态**（同 `newImagesFolded`）
      deps.writeFlag(LS_VIEW_HEAD_COLLAPSED, value);
      set({ viewHeadCollapsed: value });
    },

    /**
     * 画布默认值（原 `setCanvasDefaults`，`shared.js:30458-30468`）—— **逐行对源**
     * ⚠️ 源：`if (!n || typeof n != 'object') return;` ⇒ 非对象**静默返回**（不抛、不改）
     * ⚠️ 源：**先落盘再改状态**（`e(...)` 之后 `ST(r)`；本仓同序）
     */
    setCanvasDefaults: (patch) => {
      if (!patch || typeof patch !== 'object') return;
      const next: CanvasDefaults = { ...get().canvasDefaults, ...patch };
      deps.writeCanvasDefaults(next);
      set({ canvasDefaults: next });
    },

    setNodeSendState: (nodeId, patch) => {
      set({ nodeSendStates: { ...get().nodeSendStates, [nodeId]: { nodeId, ...patch } } });
    },

    clearNodeSendState: (nodeId) => {
      const next = { ...get().nodeSendStates };
      delete next[nodeId];
      set({ nodeSendStates: next });
    },
  });
}
