/**
 * 生成面板的**锚定定位**（原 `Z3_1.jsx:60-90` 的 `useLayoutEffect`，TD-16-89）
 *
 * 源（逐行抄录，`t` = 面板对应的节点，`p/h/m` = viewport 的 x/y/zoom）：
 * ```js
 * const xe = t.measured?.width  || t.width  || 380;   // 节点宽
 * const Me = t.measured?.height || t.height || 220;   // 节点高
 * const Re = t.position.x * m + p;                    // 节点屏幕左
 * const $  = t.position.y * m + h;                    // 节点屏幕上
 * const ie = xe * m;                                  // 节点屏幕宽
 * const be = Me * m;                                  // 节点屏幕高
 * const ye = Re + ie / 2;                             // 节点屏幕中心 x
 * const Ne = $ + be;                                  // 节点屏幕底
 * const $e = G.offsetWidth || Math.min(860, window.innerWidth * 0.92);  // 面板宽（量不到 ⇒ 兜底）
 * const at = G.offsetHeight || 360;                   // 面板高（量不到 ⇒ 兜底）
 * const Fe = 12;                                      // 屏幕边距
 * let W = ye - $e / 2;                                // 先对齐节点中心 x
 * let Ce = Ne + Fe;                                   // 先放节点**下方**
 * if (Ce + at > window.innerHeight - Fe) Ce = $ - at - Fe;  // 放不下 ⇒ **翻到上方**
 * if (Ce < Fe) Ce = Fe;                               // 上边夹取
 * W = Math.max(Fe, Math.min(W, window.innerWidth - $e - Fe)); // 左右夹取
 * ```
 *
 * ⚠️ 源是**直接写 `G.style.left/top`**（DOM 命令式），不走 React 状态 ⇒ 本实现同样**只返回坐标**，
 *   由 `GenPanel` 的 `useLayoutEffect` 写到元素上（避免每帧 setState）。
 * ⚠️ `window` 的两尺寸由调用方注入（`core` 不读运行环境，原则 4）。
 */

/** 面板锚定的入参（全部结构化，便于单测） */
export interface PanelAnchorInput {
  /** 目标节点（原 `t`）—— 位置是**画布坐标**，尺寸用**量测值优先** */
  node: {
    position: { x: number; y: number };
    width?: number | null;
    height?: number | null;
    measured?: { width?: number | null; height?: number | null } | null;
  };
  /** viewport（原 `p/h/m` = `transform[0..2]`） */
  viewport: { x: number; y: number; zoom: number };
  /** 面板自身的量测尺寸（原 `G.offsetWidth/offsetHeight`；量不到 ⇒ 走源那套兜底） */
  panel?: { offsetWidth?: number | null; offsetHeight?: number | null } | null;
  /** 窗口尺寸（原 `window.innerWidth/innerHeight`，由调用方注入） */
  window: { innerWidth: number; innerHeight: number };
}

/** 面板锚定结果（`position: fixed` 的 `left/top`，px） */
export interface PanelAnchor {
  left: number;
  top: number;
}

/** 面板宽兜底（原 `Math.min(860, window.innerWidth * 0.92)`） */
const FALLBACK_PANEL_W = 860;
/** 面板高兜底（原 `360`） */
const FALLBACK_PANEL_H = 360;
/** 节点宽兜底（原 `|| 380`） */
const FALLBACK_NODE_W = 380;
/** 节点高兜底（原 `|| 220`） */
const FALLBACK_NODE_H = 220;
/** 屏幕边距（原 `Fe = 12`） */
export const PANEL_ANCHOR_MARGIN = 12;

/** 取数字（`unknown` 收敛，`NaN`/非有限 ⇒ null） */
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * 算面板的 `left/top`（原 `Z3_1.jsx:63-89`）
 *
 * @returns `null` = 面板没量到尺寸且窗口尺寸缺失等极端情况（源此时**保持原样不动**）
 */
export function planGenPanelAnchor(input: PanelAnchorInput): PanelAnchor | null {
  const { node, viewport, window: win } = input;
  const nodeW = num(node.measured?.width ?? null) ?? num(node.width ?? null) ?? FALLBACK_NODE_W;
  const nodeH = num(node.measured?.height ?? null) ?? num(node.height ?? null) ?? FALLBACK_NODE_H;
  const screenLeft = node.position.x * viewport.zoom + viewport.x;
  const screenTop = node.position.y * viewport.zoom + viewport.y;
  const screenW = nodeW * viewport.zoom;
  const screenH = nodeH * viewport.zoom;
  const centerX = screenLeft + screenW / 2;
  const nodeBottom = screenTop + screenH;

  const panelW =
    num(input.panel?.offsetWidth ?? null) ?? Math.min(FALLBACK_PANEL_W, win.innerWidth * 0.92);
  const panelH = num(input.panel?.offsetHeight ?? null) ?? FALLBACK_PANEL_H;

  const Fe = PANEL_ANCHOR_MARGIN;
  let left = centerX - panelW / 2;
  let top = nodeBottom + Fe;
  if (top + panelH > win.innerHeight - Fe) top = screenTop - panelH - Fe;
  if (top < Fe) top = Fe;
  left = Math.max(Fe, Math.min(left, win.innerWidth - panelW - Fe));
  return { left, top };
}
