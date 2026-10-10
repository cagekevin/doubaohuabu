/**
 * 交互式连线（原 `fO`，`type: 'interactive'`）
 * 依据：docs/03-人类版.md §1（连线 `Mr` 26724-26744）
 *
 * ⚠️ 样式来自 `constants`（`EDGE_STYLE` / `EDGE_MARKER`），颜色用 CSS 变量 → SSOT
 */

import { BaseEdge, getBezierPath, type EdgeProps } from '@xyflow/react';

export function InteractiveEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  markerEnd,
  style,
  selected,
}: EdgeProps) {
  const [path] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <BaseEdge
      id={id}
      path={path}
      markerEnd={markerEnd}
      style={style}
      // 选中态：加粗（颜色仍走 CSS 变量）
      {...(selected ? { style: { ...style, strokeWidth: 3 } } : {})}
    />
  );
}
