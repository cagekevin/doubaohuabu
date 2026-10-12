/**
 * 遮脸参数面板（原 `_Component40.jsx`，108 行）
 *
 * 依据（**逐行回源**）：
 *   · 位置：`left = max(8, min(x, innerWidth - 232 - 8))`、`top = max(8, min(y, innerHeight - 236 - 8))`
 *     （原 54-57 —— `232/236` 是面板的**实测**尺寸，`8` 是视口留边）
 *   · 关闭：**外部 mousedown（捕获）** + `Escape`（原 27-47）
 *   · 遮脸方式：四颗按钮（`FACE_MASK_EFFECT_LABEL` 逐字取 label/hint）+ 当前效果的 hint 行
 *   · 强度 `0.4~3 step 0.1`（原 90）· 范围外扩 `0~0.6 step 0.02`（原 99）
 *   · 脚注：`FACEMASK_TEXT.hint(脸数)`（原 105）
 *
 * ⚠️ **与源的两处差异（有意，登记 `TD-03-19`）**：
 *   ① `Escape` 走共享 `useEscapeKey`（源在面板里自己监听 —— 本仓「浮层语义只住 `ui/common/`」）；
 *   ② 参数**不再手写 localStorage**（源 `L$`）：落盘由 `pick()` 自动覆盖（见 `state/persist.ts` 第 ⑦ 段）。
 */

import { useEffect, useRef } from 'react';
import { useStore } from '@/state';
import { FACE_MASK_EFFECTS, FACE_MASK_EFFECT_LABEL } from '@/constants/facemask';
import { toPercent } from '@/lib/math';
import { FACEMASK_TEXT } from '@/constants/text';
import { useEscapeKey } from '@/ui/common/useEscapeKey';
import styles from './FaceMaskPanel.module.css';

/** 面板实测尺寸（原 `_Component40.jsx:54-55` 的 `l`/`c`）—— 只用来夹视口 */
const PANEL_W = 232;
const PANEL_H = 236;
/** 视口留边（原 `Math.max(8, …)`） */
const VIEWPORT_MARGIN = 8;

export interface FaceMaskPanelProps {
  nodeId: string;
  /** 打开它的那次双击的视口坐标（原 `clientX`/`clientY`） */
  x: number;
  y: number;
  onClose: () => void;
}

export function FaceMaskPanel({ nodeId, x, y, onClose }: FaceMaskPanelProps) {
  const faceMaskOpts = useStore((s) => s.faceMaskOpts);
  const setFaceMaskOpts = useStore((s) => s.setFaceMaskOpts);
  const faceCount = useStore((s) => s.faceMarks[nodeId]?.faces.length ?? 0);

  const panelRef = useRef<HTMLDivElement>(null);

  // 关闭一（原 36-40）：`Escape` —— 走共享 hook（差异 ①）
  useEscapeKey(true, onClose);

  // 关闭二（原 31-35）：**外部** mousedown（捕获阶段）
  useEffect(() => {
    const onDown = (e: MouseEvent): void => {
      const el = panelRef.current;
      if (el && !el.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', onDown, true);
    return () => document.removeEventListener('mousedown', onDown, true);
  }, [onClose]);

  const left = Math.max(VIEWPORT_MARGIN, Math.min(x, (window.innerWidth || 1200) - PANEL_W - VIEWPORT_MARGIN));
  const top = Math.max(VIEWPORT_MARGIN, Math.min(y, (window.innerHeight || 800) - PANEL_H - VIEWPORT_MARGIN));
  const hint = FACE_MASK_EFFECT_LABEL[faceMaskOpts.effect].hint;

  return (
    <div
      className={`${styles.panel} nodrag nopan`}
      ref={panelRef}
      style={{ left, top }}
      onMouseDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      <div className={styles.head}>
        <span className={styles.title}>{FACEMASK_TEXT.title}</span>
        <button type="button" className={styles.close} title={FACEMASK_TEXT.closeTitle} onClick={onClose}>
          {FACEMASK_TEXT.closeGlyph}
        </button>
      </div>

      <div className={styles.body}>
        <div className={styles.label}>{FACEMASK_TEXT.mode}</div>
        <div className={styles.effects}>
          {FACE_MASK_EFFECTS.map((effect) => (
            <button
              type="button"
              className={`${styles.effect}${faceMaskOpts.effect === effect ? ` ${styles.effectActive}` : ''}`}
              title={FACE_MASK_EFFECT_LABEL[effect].hint}
              onClick={() => void setFaceMaskOpts({ effect })}
              key={effect}
            >
              {FACE_MASK_EFFECT_LABEL[effect].label}
            </button>
          ))}
        </div>
        <div className={styles.hint}>{hint}</div>

        <div className={styles.row}>
          <span className={styles.label}>{FACEMASK_TEXT.strength}</span>
          <span className={styles.val}>
            {faceMaskOpts.strength.toFixed(1)}
            {FACEMASK_TEXT.strengthSuffix}
          </span>
        </div>
        <input
          type="range"
          className={styles.range}
          min="0.4"
          max="3"
          step="0.1"
          value={faceMaskOpts.strength}
          onChange={(e) => void setFaceMaskOpts({ strength: Number(e.target.value) })}
        />

        <div className={styles.row}>
          <span className={styles.label}>{FACEMASK_TEXT.expand}</span>
          <span className={styles.val}>{toPercent(faceMaskOpts.pad)}%</span>
        </div>
        <input
          type="range"
          className={styles.range}
          min="0"
          max="0.6"
          step="0.02"
          value={faceMaskOpts.pad}
          onChange={(e) => void setFaceMaskOpts({ pad: Number(e.target.value) })}
        />

        <div className={styles.foot}>{FACEMASK_TEXT.hint(faceCount)}</div>
      </div>
    </div>
  );
}
