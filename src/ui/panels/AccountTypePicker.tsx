/**
 * 「选择账号类型」弹窗（原 `TP.jsx`，64 行 —— 逐行回源）
 *
 * 依据（**逐字对照**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 外壳 | `TP.jsx:6-7` | `.login-backdrop` + `.login-modal.type-picker-modal` |
 *   | 头 | `TP.jsx:8-15` | 标题「选择账号类型」+ `关闭` |
 *   | 正文 | `TP.jsx:16-61` | `.type-picker-body` 六张 `.type-picker-card`（emoji / 名 / 说明） |
 *
 * ⚠️ 本项目口径：**遮罩只有一种、关闭钮只有一种 `✕`**（2026-10-12 用户裁定）
 *   ⇒ 源版的 `关闭` 文本按钮走 `Modal` 的统一 `✕`，不再单造一个文本关闭钮。
 * ⚠️ 原则 1：本组件**不写 store** —— 选中的类型经 `onPick` 回调交给调用方（`AccountPanel`）
 */

import { Modal } from '@/ui/common/Modal';
import { ACCOUNT_TYPE_PICKER_TEXT } from '@/constants/text';
import type { SiteType } from '@/stable/model/account';
import styles from './AccountTypePicker.module.css';

export interface AccountTypePickerProps {
  /** 选中某个平台（原 `TP.jsx` 的 `onPick`）—— 由调用方建号 */
  onPick: (type: SiteType) => void;
  /** 关闭（原 `TP.jsx` 的 `onClose`） */
  onClose: () => void;
}

export function AccountTypePicker({ onPick, onClose }: AccountTypePickerProps) {
  return (
    <Modal open onClose={onClose} title={ACCOUNT_TYPE_PICKER_TEXT.title}>
      <div className={styles.body}>
        {ACCOUNT_TYPE_PICKER_TEXT.cards.map((card) => (
          <button
            key={card.type}
            type="button"
            className={styles.card}
            onClick={() => onPick(card.type)}
          >
            <span className={styles.emoji} aria-hidden="true">
              {card.emoji}
            </span>
            <span className={styles.name}>{card.name}</span>
            <span className={styles.desc}>{card.desc}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
