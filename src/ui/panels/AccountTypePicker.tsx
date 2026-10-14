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
// ★ 清单 / 顺序都取自**真源**（`@/constants` 的 L0 桶）—— 不再从卡片数组里读 `type`
import { SITE_TYPES, type SiteType } from '@/constants';
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
        {/* ★ 遍历的是**真源 `SITE_TYPES`**（集合与顺序都在那一处）；文案表只按 `type` 取词 */}
        {SITE_TYPES.map((type) => {
          const card = ACCOUNT_TYPE_PICKER_TEXT.cards[type];
          return (
            <button key={type} type="button" className={styles.card} onClick={() => onPick(type)}>
              <span className={styles.emoji} aria-hidden="true">
                {card.emoji}
              </span>
              <span className={styles.name}>{card.name}</span>
              <span className={styles.desc}>{card.desc}</span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
