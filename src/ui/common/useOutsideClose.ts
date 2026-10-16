/**
 * **点外面关闭**（★ 与 `useEscapeKey` 同一族：`ui/common/` 是浮层语义唯一允许的落点）
 *
 * ★ **为什么住在这儿**：这条机制此前被**手写了 7 份** ——
 *   `ContextMenu` · `AccountPicker` · `SelectionToolbar` · `GenImageNode`（历史弹层）·
 *   `GenVideoNode`（历史弹层，与上面那份**逐字相同**）· `AnalyzePrompt` · `FaceMaskPanel`
 *   （后两份用**捕获阶段**）。其中 5 份住在 `ui/nodes` / `ui/panels`，**违反**仓里的判据
 *   「浮层语义只许住 `ui/common/`」；而"要不要捕获阶段""忽略哪几个元素"这些差异，
 *   正是**同一条机制被抄多份之后各自漂移**的典型症状（`G06` 那一类）。
 *
 * ⚠️ 与 `useEscapeKey` 的分工：那是**键盘**触发（`Esc`），本 hook 是**指针**触发（`mousedown`）；
 *   两者都只负责"把一次'外面'变成一次回调"，**关什么、关几层由调用方决定**。
 * ⚠️ 用 `mousedown` 而不是 `click`：避免与"点击菜单项"竞争（源版同法，见 `AccountPicker` 原注释）。
 * ⚠️ `PanelShell` **不用**本 hook —— 它有一层**真遮罩元素**在收点击（那是"共享外壳"的正法）；
 *   本 hook 是给**没有遮罩元素**的浮层（贴锚点的菜单 / 下拉 / 弹层）用的。
 */

import { useEffect, useRef } from 'react';
import type { RefObject } from 'react';

export interface UseOutsideCloseOptions {
  /**
   * 用**捕获阶段**（默认 `false`）。
   * ⚠️ 只有当浮层**内部**会 `stopPropagation`（如 `AnalyzePrompt` 的编辑器、`FaceMaskPanel` 的画布）
   *   才需要开 —— 开了之后，浮层内部的其它 `mousedown` 处理**先于**它运行。
   */
  capture?: boolean;
  /** 额外的"算里面"判据（如 `AccountPicker` 的 portal 面板走 `[data-…]` 选择器，拿不到元素 ref） */
  ignore?: (target: Node | null) => boolean;
}

/**
 * @param enabled 浮层开着才挂（`false` 时**不挂监听** —— 别抢别人的"外面"）
 * @param refs 「算里面」的元素（可给多个：触发钮 + 面板；顺序无关）
 * @param onClose 命中"外面"时的回调（**不做**任何加工）
 */
export function useOutsideClose(
  enabled: boolean,
  refs: ReadonlyArray<RefObject<HTMLElement | null>>,
  onClose: () => void,
  options: UseOutsideCloseOptions = {},
): void {
  const { capture = false, ignore } = options;

  /** ⚠️ 回调与判据进 ref：监听只随 `enabled` / `capture` 变（别因每帧新函数反复"摘了重挂"） */
  const cbRef = useRef(onClose);
  const ignoreRef = useRef(ignore);
  const refsRef = useRef(refs);
  useEffect(() => {
    cbRef.current = onClose;
    ignoreRef.current = ignore;
    refsRef.current = refs;
  }, [onClose, ignore, refs]);

  useEffect(() => {
    if (!enabled) return;
    const onDown = (e: MouseEvent): void => {
      const target = e.target as Node | null;
      if (refsRef.current.some((r) => r.current?.contains(target))) return;
      if (ignoreRef.current?.(target)) return;
      cbRef.current();
    };
    document.addEventListener('mousedown', onDown, capture);
    return () => document.removeEventListener('mousedown', onDown, capture);
  }, [enabled, capture]);
}
