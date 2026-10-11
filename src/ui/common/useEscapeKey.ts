/**
 * `Esc` 关闭（★ **`ui/common/` 是 `Escape` 处理唯一允许的落点**）
 *
 * ★ **为什么必须住在这儿**：约定「`Escape` 键盘处理只允许在 `ui/common/`」
 *   ——否则每个浮层（`Modal` / `ContextMenu` /
 *   `RefAutocomplete` / …）都会手写一份 `if (e.key === 'Escape')`，解散法迟早不一致
 *   （有的只关最上层、有的连点两下关两层、有的根本不关）。
 *
 * ⚠️ 本 hook 与 `<Modal>` / `<ContextMenu>` 的分工：那两个是**模态类**浮层（自带遮罩与
 *    焦点管理，关 **自己**）；本 hook 是给**非模态浮层**（如 `@` 引用候选）用的
 *    —— 它只负责「把 `Esc` 变成一次回调」，关什么、关几层由调用方决定。
 *
 * ⚠️ 与 `React.KeyboardEvent` 绑定的原因是：非模态浮层的 `Esc` 必须走**它自己元素的
 *    `onKeyDown`**（焦点在 textarea 里），而不是全局 `keydown` ——
 *    全局监听会在用户按 `Esc` 关别的东西时误触发。
 */

import { useCallback } from 'react';
import type { KeyboardEvent } from 'react';

/**
 * @param enabled 是否处理（浮层没开时传 `false` —— 别抢别的 `Esc`）
 * @param onEscape 命中时的回调（原文**不做**任何加工）
 * @returns 可直接挂到元素上的 `onKeyDown` 处理函数
 */
export function useEscapeKey(
  enabled: boolean,
  onEscape: () => void,
): (e: KeyboardEvent<HTMLElement>) => void {
  return useCallback(
    (e) => {
      if (!enabled) return;
      if (e.key !== 'Escape') return;
      e.preventDefault();
      onEscape();
    },
    [enabled, onEscape],
  );
}
