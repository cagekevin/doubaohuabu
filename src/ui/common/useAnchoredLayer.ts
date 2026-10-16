/**
 * **浮层定位原语**（★ 一处实现，全仓浮层共用）
 *
 * ── 它解决的是什么 ──
 *   「一个浮层要贴在某个点（光标 / 按钮 / 右键位置）上，且**永远完整落在视口内**」。
 *   这是**一类**问题，不是某一个浮层的问题 —— 此前每个浮层各写一套（或干脆没写）：
 *   `.gvHistPop` 在注释里手写 `innerWidth - 264 - 8`（把宽度**硬编码**进夹取式）、
 *   `.edgeActions` / `.menu` / `SelectionToolbar` 各自算坐标。
 *
 * ── 算法（popover 的三步，顺序不能换）──
 *   ① **size**：先按可用空间限高（**光挪位置不够**：浮层比可用空间还高时，挪到哪都溢出）；
 *   ② **flip**：下方放不下就翻到锚点**上方**；上下都不够（视口很矮）⇒ 贴顶 + 铺满可用高度；
 *   ③ **shift**：左右越界就收进视口（收到 `margin` 为止）。
 *
 * ── 与仓库两条硬约束的相处 ──
 *   · ⚠️ **不 `setState`**：本仓口径是「effect 里不做同步 setState」
 *     (`react-hooks/set-state-in-effect`)。定位只挪 DOM ⇒ **直接写 style**，不触发重渲染。
 *   · ⚠️ 浮层必须 **`position: fixed` + portal 到 `body`**（否则会被祖先 `overflow: hidden` 裁掉，
 *     且 `absolute` 贴的是"最近定位祖先"而不是锚点）。
 *
 * ── 用法 ──
 *   ```tsx
 *   const { ref, style } = useAnchoredLayer<HTMLDivElement>({
 *     open: query !== null,
 *     anchor: caretViewportRect(),
 *     depsKey: `${query}|${items.length}`,   // 内容变了要重摆（高度会变）
 *   });
 *   return createPortal(<div ref={ref} style={style} className={styles.pop}>…</div>, document.body);
 *   ```
 */
import { useCallback, useEffect, useLayoutEffect, useRef } from 'react';
import type { CSSProperties } from 'react';

export interface AnchoredLayerOptions {
  /** 是否显示中（`false` ⇒ 不摆位、不挂监听） */
  open: boolean;
  /** 锚点（**视口坐标**；`null` ⇒ 拿不到位置，浮层先藏起来，别闪到左上角） */
  anchor: { x: number; y: number } | null;
  /** 贴锚点下方留的空隙（默认 4） */
  gap?: number;
  /** 距视口边的最小留白（默认 8） */
  margin?: number;
  /** 高度上界（不传 = 不限，按可用空间） */
  maxHeight?: number;
  /** 再挤也至少给这么高（超出部分由浮层内部滚动兜，默认 96） */
  minHeight?: number;
  /** 内容指纹：内容/条数变了要重摆（高度会变）。例：`` `${query}|${items.length}` `` */
  depsKey?: string;
}

export interface AnchoredLayer {
  /** 挂到浮层根元素上 */
  ref: React.RefObject<HTMLDivElement | null>;
  /** 首帧的位置（`anchor` 为空时 `visibility: hidden`，避免闪一下再跳） */
  style: CSSProperties;
}

/** 摆位（纯 DOM 写，不触发渲染）—— 三步：size → flip → shift */
function placeLayer(
  el: HTMLElement,
  anchor: { x: number; y: number },
  gap: number,
  margin: number,
  maxHeight: number | undefined,
  minHeight: number,
): void {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const r = el.getBoundingClientRect();
  const cap = maxHeight ?? Number.POSITIVE_INFINITY;

  // ① size + ② flip
  const below = vh - margin - (anchor.y + gap);
  const above = anchor.y - gap - margin;
  let top: number;
  let height: number;
  if (below >= Math.min(cap, r.height)) {
    top = anchor.y + gap;
    height = Math.min(cap, below);
  } else if (above > below) {
    height = Math.min(cap, above);
    top = anchor.y - gap - height;
  } else {
    // 上下都放不下（视口很矮）⇒ 别再翻，贴顶铺满可用高度
    top = margin;
    height = Math.min(cap, vh - 2 * margin);
  }
  el.style.maxHeight = `${Math.max(minHeight, height)}px`;
  el.style.top = `${Math.max(margin, top)}px`;

  // ③ shift（"比视口还宽"由浮层自己的 `max-width` 兜，这里只管越界收回）
  const w = Math.min(r.width, vw - 2 * margin);
  el.style.left = `${anchor.x + w > vw - margin ? Math.max(margin, vw - margin - w) : anchor.x}px`;
}

export function useAnchoredLayer(opts: AnchoredLayerOptions): AnchoredLayer {
  const { open, anchor, gap = 4, margin = 8, maxHeight, minHeight = 96, depsKey = '' } = opts;
  const ref = useRef<HTMLDivElement>(null);
  const x = anchor?.x ?? null;
  const y = anchor?.y ?? null;

  const place = useCallback((): void => {
    const el = ref.current;
    if (!el || x === null || y === null) return;
    placeLayer(el, { x, y }, gap, margin, maxHeight, minHeight);
  }, [x, y, gap, margin, maxHeight, minHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
  }, [open, place, depsKey]);

  /**
   * 打开期间跟着**滚动 / 尺寸变化**走：
   *   · 窗口 resize（锚点所在的编辑器位置会变）；
   *   · 容器**内部滚动**（正文 / 面板身有 `overflow: auto`）—— 滚动事件不冒泡，
   *     只能在 window 的**捕获阶段**拿到。
   * ⚠️ **画布平移 / 缩放不用跟**：拖画布会让正文编辑器失焦 ⇒ 调用方本来就会关掉浮层
   *    （不必为此给本原语引入 `@xyflow` 依赖）。
   */
  useEffect(() => {
    if (!open) return;
    const onMove = (): void => place();
    window.addEventListener('scroll', onMove, { capture: true, passive: true });
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, { capture: true });
      window.removeEventListener('resize', onMove);
    };
  }, [open, place]);

  return {
    ref,
    style:
      x === null || y === null
        ? { position: 'fixed', left: 0, top: 0, visibility: 'hidden' }
        : { position: 'fixed', left: x, top: y + gap },
  };
}
