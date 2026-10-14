/**
 * Thumb —— 缩略图（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**加载失败降级**（`?w=` 拼接已下沉到协议层）
 * 出现处：画布节点 / 资源库 / 生成结果 / 新图面板
 *
 * ⚠️ docs/过程.md #7：**缩略图一律走 `?w=`，不加载原图**（原图 2~20MB）
 * ⚠️ `withThumb`（协议规则）**已下沉到 `stable/protocols/img.ts`**（TD-01-1）——
 *    它是冻结协议，不该住 UI 层（否则非 UI 消费者要反向依赖 ui）。本文件**只转发**。
 */

import { useState } from 'react';
// ★ 协议规则的**真源**（冻结契约）—— 消费者一律直接引它；本文件也只自用，**不再转出去**
import { withThumb } from '@/stable/protocols/img';
import { COMMON_TEXT, MATERIAL_NODE_TEXT } from '@/constants/text';
import styles from './shared.module.css';



export interface ThumbProps {
  src: string;
  alt?: string;
  className?: string;
  /** 覆盖默认宽度 */
  width?: number;
}

export function Thumb({ src, alt = '', className, width }: ThumbProps) {
  const [failed, setFailed] = useState(false);

  // ★ **2026-10-12（`TD-09-1`）**：占位文案改委托 SSOT —— 原硬编码 `无图`，
  //   而源版这句是 `暂无图片`（`fL.jsx:161` 的 `material-placeholder`）⇒ **顺带修掉一处文案漂移**。
  //   ⚠️ **不新建键**：`MATERIAL_NODE_TEXT.noImage` 已是这句的唯一真源（`sendPanelText.ts:296`）——
  //     再建一个 `THUMB_TEXT.noImage` 就是**同值两份**（母体 M3）。
  if (!src)
    return (
      <div className={`${styles.thumbPlaceholder} ${className ?? ''}`}>
        {MATERIAL_NODE_TEXT.noImage}
      </div>
    );

  if (failed) {
    // 降级：显示占位（**不隐藏错误**，用 title 暴露原始 src）
    return (
      <div className={`${styles.thumbPlaceholder} ${className ?? ''}`} title={src}>
        {COMMON_TEXT.loadFailed}
      </div>
    );
  }

  return (
    <img
      className={className ?? styles.thumbImg}
      src={withThumb(src, width)}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}
