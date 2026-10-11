/**
 * 素材节点（`type: 'material'`）—— 对应原 `fL.jsx`（270 行）
 *
 * ★★ **2026-10-10 补的**（此前该组件 20 行、**零交互**）：
 *   ① **双击改名**（原 111-155：`F` 进入改名态、`M` 提交）—— 走 **`renameMaterialNode`**
 *      （**多址改名**：资源库同名项 + 所有指向同一来源的素材节点一起改，见 `core/rules/materialRename.ts`）；
 *   ② **可缩放边框**（原 134 的 `_Component28` = `NodeResizer`，`minWidth=140`/`minHeight=100`）；
 *   ③ **图片**（原 157-160：`Xt(dataUrl, 480)` 缩略图（本仓 = `withThumb`） + `onLoad` 读**自然尺寸**
 *      到 `{w,h}`，供下游按原始宽高比使用）；
 *   ④ **分析提示词浮动按钮**（原 179-192）—— **逐字与生成节点相同** ⇒ 直接复用 `AnalyzePrompt`。
 *
 * ⛔ **两处未落地，按判据 B4 渲染但禁用/不渲染并写明原因**（不假装）：
 *   · **「编辑图片」**（原 163-178）→ 源版调 `openImageEditor({nodeId,imgRef,label})`，
 *     会开一个**遮脸 / 裁剪编辑器** —— 独立大件，尚未落地 ⇒ 按钮**禁用** + `title` 说明 + 可见标注。
 *   · **人脸遮罩层**（原 160 的 `_Component29` = `iL.jsx` **191 行**：识别人脸、单击遮脸、
 *     双击设参数）—— 它甚至**不在 `fL.jsx` 里**，是挂在图片上的独立组件 ⇒ **不渲染**
 *     （渲染一个空的遮罩层等于假装有这功能）。
 *
 * ⚠️ **与源版的一处措辞差异（有意）**：源版改名输入框的 `onKeyDown` 里**有 `Escape` 取消**
 *   （原 143-146）。本工程的 `Escape` 处理只允许住 `ui/common/`（`原则8/rule-of-three`）
 *   ⇒ 改用 `useEscapeKey`（**行为相同**：取消改名、不提交）。
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { NodeResizer } from '@xyflow/react';
import { useStore } from '@/state';
import { withThumb } from '@/stable/protocols/img';
import { MATERIAL_NODE_TEXT } from '@/constants/text';
import { useEscapeKey } from '@/ui/common/useEscapeKey';
import { AnalyzePrompt } from './AnalyzePrompt';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function MaterialNode({ id, data, selected }: RFNodeProps<'material'>) {
  const renameMaterialNode = useStore((s) => s.renameMaterialNode);

  /** 名字兜底（原 18-19：空或字面量 `undefined` ⇒ `素材`） */
  const label = data.label && data.label !== 'undefined' ? data.label : MATERIAL_NODE_TEXT.fallbackName;

  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState(label);
  const nameInputRef = useRef<HTMLInputElement>(null);

  /** 原 105-110：进入改名态后 **focus + 全选**（否则用户还要手点一次） */
  useEffect(() => {
    if (editingName && nameInputRef.current) {
      nameInputRef.current.focus();
      nameInputRef.current.select();
    }
  }, [editingName]);

  /** 进入改名态（原 `F` 111-117：`stopPropagation` + 把草稿重置成当前名） */
  const startRename = useCallback(
    (e?: { stopPropagation?: () => void }) => {
      e?.stopPropagation?.();
      setDraft(label);
      setEditingName(true);
    },
    [label],
  );

  /**
   * 提交改名（原 `M` 118-131）
   * ⚠️ 与源逐字一致：**`trim()` 后为空** 或 **与当前名相同** ⇒ **不调 actio**（但**仍然退出改名态**）
   */
  const commitRename = useCallback(() => {
    const next = draft.trim();
    if (next && next !== label) renameMaterialNode(id, next);
    setEditingName(false);
  }, [draft, label, id, renameMaterialNode]);

  /** ⚠️ `Esc` 取消改名 —— 走 `ui/common`（源版同行为，见文件头） */
  const onEscape = useEscapeKey(editingName, () => setEditingName(false));

  return (
    <div className={`${styles.materialNode} ${selected ? styles.groupSelected : ''}`} data-testid="material-node">
      {/* 原 134：`minWidth=140` / `minHeight=100` + **只在选中时可见** */}
      <NodeResizer minWidth={140} minHeight={100} isVisible={!!selected} />

      <div className={styles.materialHead}>
        <span className={styles.materialDot} />
        {editingName ? (
          <input
            ref={nameInputRef}
            className={`${styles.materialRename} nodrag nopan nowheel`}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => {
              // Enter 提交（原 140-142）
              if (e.key === 'Enter') {
                e.preventDefault();
                commitRename();
                return;
              }
              // Escape 取消（原 143-146）—— 收口在 `ui/common/useEscapeKey`
              onEscape(e);
            }}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span
            className={styles.materialTitle}
            title={MATERIAL_NODE_TEXT.renameTitle}
            onDoubleClick={startRename}
          >
            {MATERIAL_NODE_TEXT.headPrefix}
            {/* 原 154 的 `素材 · {a}`，` · ` 逐字 */}
            {' · '}
            {label}
          </span>
        )}
      </div>

      <div className={styles.materialImgWrap}>
        {data.dataUrl ? (
          <img
            className={styles.materialImg}
            // 原 16：缩略图宽 **480**
            src={withThumb(data.dataUrl, 480)}
            alt={label}
            draggable={false}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <div className={styles.materialPlaceholder}>{MATERIAL_NODE_TEXT.noImage}</div>
        )}

        {data.dataUrl && (
          <div className={`${styles.matFloatActions} nodrag nopan`}>
            <button
              type="button"
              className={styles.matFloatBtn}
              disabled
              /*
               * ⛔ 源版这里有 `openImageEditor({nodeId, imgRef, label})`（原 167-171）——
               *    遮脸 / 裁剪编辑器**尚未落地**。禁用并把原因写进 `title`（判据 B4）。
               */
              title={`${MATERIAL_NODE_TEXT.editImageTitle}\n${MATERIAL_NODE_TEXT.editImagePending}`}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {MATERIAL_NODE_TEXT.editImage}
            </button>
          </div>
        )}
      </div>

      {/*
        ★ 分析提示词（原 179-192）—— 这套按钮 + 面板与生成节点**逐字相同**
          ⇒ 判据 C1：复用 `ui/nodes/AnalyzePrompt.tsx`（第 3 处消费，仍走同一组件）
      */}
      <AnalyzePrompt
        nodeId={id}
        imageUrl={data.dataUrl}
        state={data.analyzePrompt ?? null}
        showButton={!!data.dataUrl}
      />
    </div>
  );
}
