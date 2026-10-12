/**
 * SaveErrorBanner —— 保存失败横幅（原 `Z0.jsx`，745 B / 1 按钮 / 1 文案）
 *
 * ★ **为什么必须有**：落盘失败（序列化失败 / localStorage 配额超限）在源版会**显式提示**
 *   用户「数据没存上」；本工程此前把失败写进了 `saveError` 却**无人读取**
 *   ⇒ **数据静默丢失、用户毫不知情**。
 *   （`docs/13` §2.3 把 `Z0.jsx` 误标成「背景 / 装饰层」—— 回源 `Z0.jsx` 后确认它读 `saveError`，
 *    实为保存失败提示。本次一并更正。）
 *
 * 依据（**逐行回源 `Z0.jsx`**）：
 *   · 读 `saveError`；`null` ⇒ 不渲染（`return null`）
 *   · 出现后 **8000ms 自动消失**（`setTimeout(() => t(null), 8000)`）
 *   · `⚠️ {e.message}` + `×` 关闭（`title="关闭提示"`）、`role="alert"`
 *   · 源版在**两个分支**都挂（`.app` 上方 / 启动页上方）⇒ 挂载点见 `bootstrap/main.tsx`
 *
 * ⚠️ 原则 6（错误透传）：`message` **原样展示** —— 不改写、不按 kind 映射、不兜底造错；
 *   它就是 `state/persist` 从 `core/usecases` 收来的原文。
 * ⚠️ 原则 1（谁拥有状态谁写）：清空走 store 的 `setSaveError`（state 层），本组件只读 + 转发。
 */

import { useEffect } from 'react';
import { PERSIST_TEXT } from '@/constants/text';
import { useStore } from '@/state';
import styles from './shared.module.css';

/** 自动消失延时（原 `Z0.jsx:15-17` 的 `8000`，逐字） */
const AUTO_DISMISS_MS = 8000;

export function SaveErrorBanner() {
  const saveError = useStore((s) => s.saveError);
  const setSaveError = useStore((s) => s.setSaveError);

  // ⚠️ 依赖 `saveError` 本身（源版 deps `[e, t]`）：换一条新错误即**重置**计时窗口
  useEffect(() => {
    if (!saveError) return;
    const t = window.setTimeout(() => setSaveError(null), AUTO_DISMISS_MS);
    return () => window.clearTimeout(t);
  }, [saveError, setSaveError]);

  if (!saveError) return null;

  return (
    <div className={styles.saveErrorBanner} role="alert">
      {/* `⚠️` 是源版就内联在 JSX 里的装饰前缀（不是可复用文案） */}
      <span className={styles.saveErrorText}>⚠️ {saveError.message}</span>
      <button
        type="button"
        className={`${styles.panelClose} ${styles.isDanger}`}
        title={PERSIST_TEXT.close}
        onClick={() => setSaveError(null)}
      >
        ×
      </button>
    </div>
  );
}
