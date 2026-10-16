/**
 * ErrorBanner —— 错误横幅（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**类型→文案 + 「关闭此提示」/「全部清除」**
 *
 * ⚠️ 原则 6（错误透传）：文案来自 `constants/failure.ts`（按 kind 映射），
 *    **不覆盖**原始 `message` —— message 必须原样展示（可折叠/可复制）。
 */

import { BANNER_TEXT } from '@/constants/text';
import { BACKEND_ERROR_LABEL } from '@/constants/failure';
// ★ 数据形状由 state 拥有（分层：state 不得依赖 ui，所以类型定义放 state）
import type { BannerError } from '@/state/slices/ui';
import styles from './shared.module.css';

export interface ErrorBannerProps {
  errors: readonly BannerError[];
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

export function ErrorBanner({ errors, onDismiss, onClearAll }: ErrorBannerProps) {
  const first = errors[0];
  if (!first) return null;

  return (
    <div className={styles.banner} role="alert">
      <span className={styles.bannerMsg} title={first.message}>
        {BACKEND_ERROR_LABEL[first.kind]}：{first.message}
        {errors.length > 1 ? `（共 ${errors.length} 条）` : ''}
      </span>
      <button type="button" className={styles.bannerAction} onClick={() => onDismiss(first.id)}>
        {BANNER_TEXT.dismiss}
      </button>
      {errors.length > 1 && (
        <button type="button" className={styles.bannerAction} onClick={onClearAll}>
          {BANNER_TEXT.clearAll}
        </button>
      )}
    </div>
  );
}
