/**
 * 节点连接点（★ 原则 8「三振出局」的落点）
 *
 * 抽出的重复模式：**每类节点都要挂 source/target handle**
 * 没有 Handle 时 ReactFlow **无法计算连线端点 ⇒ 边不渲染**（W13 实测抓到）
 *
 * 位置约定：target 在左、source 在右（与主流画布一致）
 * ⚠️ 组节点不挂 handle（它是容器，不参与连线）
 */

import { Handle, Position } from '@xyflow/react';

export interface NodeHandlesProps {
  target?: boolean;
  source?: boolean;
}

export function NodeHandles({ target = true, source = true }: NodeHandlesProps) {
  return (
    <>
      {target && <Handle type="target" position={Position.Left} />}
      {source && <Handle type="source" position={Position.Right} />}
    </>
  );
}
