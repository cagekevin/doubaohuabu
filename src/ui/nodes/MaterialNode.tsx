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
 * ⛔ **一处未落地，按判据 B4 渲染但禁用并写明原因**（不假装）：
 *   · **「编辑图片」**（原 163-178）→ 源版调 `openImageEditor({nodeId,imgRef,label})`，
 *     会开一个**遮脸 / 裁剪编辑器**（`G3.jsx`，1087 行）—— 独立大件，尚未落地
 *     ⇒ 按钮**禁用** + `title` 说明 + 可见标注。
 *   · ✅ **人脸遮罩层**（原 160 的 `_Component29` = `iL.jsx`）—— **2026-10-11 已落**：
 *     `ui/nodes/FaceMarksLayer.tsx`（识别人脸 → 角标 → 单击遮脸 / 双击设参数）
 *     + `ui/panels/FaceMaskPanel.tsx`（参数面板，挂在外壳 `CanvasHost`）。
 *
 * ⚠️ **改名收口在 `NodeTitle`**（显示态 ↔ 编辑态 + `Enter` 提交 + `Esc` 取消 + focus/全选）。
 *   `Esc` 处理住 `ui/common/useEscapeKey`（键盘 `Escape` 只允许住 `ui/common/`）。
 */

import { useState } from 'react';
import { useStore } from '@/state';
import { withThumb } from '@/stable/protocols/img';
import { MATERIAL_NODE_TEXT } from '@/constants/text';
import { AnalyzePrompt } from './AnalyzePrompt';
import { FaceMarksLayer } from './FaceMarksLayer';
import { NodeShell } from './NodeShell';
import { NodeTitle } from './NodeTitle';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function MaterialNode({ id, data, selected }: RFNodeProps<'material'>) {
  const renameMaterialNode = useStore((s) => s.renameMaterialNode);
  const openImageEditor = useStore((s) => s.openImageEditor);

  /** 名字兜底（原 18-19：空或字面量 `undefined` ⇒ `素材`） */
  const label = data.label && data.label !== 'undefined' ? data.label : MATERIAL_NODE_TEXT.fallbackName;

  /** 图片**自然尺寸**（原 157-160 的 `{w,h}`）—— 脸框落点要按它换算 */
  const [nat, setNat] = useState({ w: 0, h: 0 });

  return (
    <NodeShell
      type="material"
      title={
        /*
         * 改名收口到 `NodeTitle`（显示态 ↔ 编辑态 + Enter 提交 + Esc 取消 + focus/全选）。
         * ⚠️ 与源逐字一致：**`trim()` 后为空** 或 **与当前名相同** ⇒ **不调 action**（但退出改名态）
         *   —— `defaultTitle` 传当前 `label`，使"清空后提交"回落到当前名（不误改名）。
         */
        <NodeTitle
          label={label}
          defaultTitle={label}
          prefix={
            <>
              {MATERIAL_NODE_TEXT.headPrefix}
              {/* 原 154 的 `素材 · {a}`，` · ` 逐字 */}
              {' · '}
            </>
          }
          onRename={(next) => {
            if (next && next !== label) renameMaterialNode(id, next);
          }}
        />
      }
      selected={selected}
      minWidth={140}
      minHeight={100}
      padded={false}
      testId="material-node"
    >

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
            // ★ 原 157-160：`onLoad` 读**自然尺寸**（脸框落点要按图片宽高比换算）
            onLoad={(e) => setNat({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
          />
        ) : (
          <div className={styles.materialPlaceholder}>{MATERIAL_NODE_TEXT.noImage}</div>
        )}

        {/* ★ 人脸遮罩层（原 160 的 `_Component29` = `iL.jsx`）—— 铺在图上，自量显示框 */}
        {data.dataUrl && (
          <FaceMarksLayer
            nodeId={id}
            src={data.dataUrl}
            natW={nat.w || data.natW}
            natH={nat.h || data.natH}
            label={label}
          />
        )}

      </div>

      {/*
        ★ 分析提示词（原 179-192）—— 这套按钮 + 面板与文生图节点**逐字相同**
          ⇒ 判据 C1：复用 `ui/nodes/AnalyzePrompt.tsx`（第 2 处消费，仍走同一组件）

        ⚠️ **`leading` = 「编辑图片」**：源里 `mat-edit-float` 与 `mat-analyze-float` 是
           **同一个 `.mat-float-actions` 里的兄弟**（`fL.jsx:162-192`）⇒ 动作条由
           `AnalyzePrompt` 出容器，本组件只把「前面那颗」传进去（两条 bar 合成一条）。
      */}
      <AnalyzePrompt
        nodeId={id}
        imageUrl={data.dataUrl}
        state={data.analyzePrompt ?? null}
        showButton={!!data.dataUrl}
        leading={
          <button
            type="button"
            className={styles.matFloatBtn}
            /*
             * ★ 原 163-178 的 `mat-edit-float`：`onMouseDown` stopPropagation 保选中、
             *   `onClick` stopPropagation 后 `openImageEditor({nodeId, imgRef, label})`。
             * ★ **2026-10-12 解禁（`TD-09-4`）**：图片编辑器已落（`ui/panels/ImageEditor.tsx`）。
             */
            title={MATERIAL_NODE_TEXT.editImageTitle}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              openImageEditor(id, data.dataUrl, label);
            }}
          >
            {MATERIAL_NODE_TEXT.editImage}
          </button>
        }
      />
    </NodeShell>
  );
}
