/**
 * `Esc` 处理（★ **`ui/common/` 是 `Escape` 处理唯一允许的落点**）
 *
 * ★ **为什么必须住在这儿**：约定「`Escape` 键盘处理只允许在 `ui/common/`」
 *   ——否则每个浮层（`Modal` / `ContextMenu` /
 *   `RefAutocomplete` / …）都会手写一份 `if (e.key === 'Escape')`，解散法迟早不一致
 *   （有的只关最上层、有的连点两下关两层、有的根本不关）。
 *
 * ⚠️ **两种作用域是两件东西，别硬合成一个**（2026-10-16 收口时定）：
 *
 *   | `scope` | 谁用 | 为什么 |
 *   |---|---|---|
 *   | `'element'`（默认） | **非模态浮层**：`@` 引用候选 · 账号选择器 · 遮脸参数 · 节点就地改名 · 就地重命名… | 它的 `Esc` 必须走**自己元素的 `onKeyDown`**（焦点在输入框 / textarea 里）。挂全局会在用户按 `Esc` 关**别的东西**时误触发 |
 *   | `'window'` | **一层一关闭的浮层**：`PanelShell`（`overlay`）· `GenPanel` | 焦点可能在画布 / 别处，命令是"**关掉这一层**"，不是"退出这个输入框" |
 *
 *   ⇒ 没有"统一成一个"这回事 —— 它们**关的对象不同**。但**同一作用域只许一份实现**：
 *   `window` 那半此前是 `PanelShell` 与 `GenPanel` **各手写一份监听**（其中一份还住在 `ui/panels/`，
 *   违反上面那条判据）⇒ 已收进本文件。
 *
 * ⚠️ 与 `<ContextMenu>` 的分工：菜单自带方向键 / Enter 的键盘模型，故它自己处理 `Esc`。
 */

import { useCallback, useEffect, useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

type ElementEscapeHandler = (e: ReactKeyboardEvent<HTMLElement>) => void;

/**
 * @param enabled 是否处理（浮层没开时传 `false` —— 别抢别的 `Esc`）
 * @param onEscape 命中时的回调（原文**不做**任何加工）
 * @param scope `'element'`（默认）返回可挂到元素上的处理器；`'window'` 自己挂/摘全局监听（此时**不用**返回值）
 * @returns `scope='element'` 时是可直接挂的 `onKeyDown`；`scope='window'` 时是 `undefined`
 *
 * ⚠️ 用**重载**表达"元素级一定给你处理器"：否则每个既有调用点都要写 `onEscape?.(e)`
 *   （那是把类型噪声摊到 5 个站点）—— 类型只在**窗口模式**下才可能是 `undefined`。
 */
export function useEscapeKey(
  enabled: boolean,
  onEscape: () => void,
  scope?: 'element',
): ElementEscapeHandler;
export function useEscapeKey(
  enabled: boolean,
  onEscape: () => void,
  scope: 'window',
): undefined;
export function useEscapeKey(
  enabled: boolean,
  onEscape: () => void,
  scope: 'element' | 'window' = 'element',
): ElementEscapeHandler | undefined {
  /**
   * ⚠️ 回调进 ref：`window` 监听**不许**因回调每帧换新而反复"摘了重挂"
   *   （`GenPanel` 原文就为此备了一个 `closeRef`）—— 监听只随 `enabled` / `scope` 变。
   */
  const cbRef = useRef(onEscape);
  useEffect(() => {
    cbRef.current = onEscape;
  }, [onEscape]);

  const elementHandler = useCallback<ElementEscapeHandler>(
    (e) => {
      if (!enabled) return;
      if (e.key !== 'Escape') return;
      e.preventDefault();
      cbRef.current();
    },
    [enabled],
  );

  useEffect(() => {
    if (scope !== 'window' || !enabled) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      cbRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled, scope]);

  return scope === 'element' ? elementHandler : undefined;
}
