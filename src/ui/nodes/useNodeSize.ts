/**
 * 节点尺寸订阅 / 比例同步（`NodeShell` 的尺寸能力）
 *
 * ── 为什么需要「订阅 node 尺寸」──
 * ReactFlow 的端口（`CustomHandle`）与连线都基于**节点整体中点**计算，而节点尺寸由
 * `node.width/height`（或 `node.style`）决定。根 div 若只写 `width: 100%`，跟的是父容器
 * 而不是 ReactFlow 节点 ⇒ 拖拽 / 缩放 / 改比例后**端口跑偏**。
 * 故 `NodeShell` 用 `useNodeWidth/Height` 从 ReactFlow store 订阅真实尺寸，以 inline style 渲染。
 *
 * ⚠️ **返回原始值（number / string / undefined），不返回对象**：zustand 用 `Object.is` 比较，
 *   返回新对象字面量会**永不相等** ⇒ store 每帧变化都让全部节点重渲（大画布下 GC 压力明显）。
 *
 * ⚠️ 未设置尺寸的节点返回 `undefined` ⇒ `NodeShell` **不写 inline 尺寸**（保持按内容自适应）。
 */

import { useEffect } from 'react';
import {
  useStore as useFlowStore,
  useUpdateNodeInternals,
} from '@xyflow/react';
import { useStore } from '@/state';
import {
  NODE_AREA_FIXED_BASE_SIZE,
  computeSizeSync,
  parseAspect,
  type SizeSyncMode,
} from '@/core/rules/nodeSize';

/** 当前节点在 ReactFlow store 里的宽度（未设置 ⇒ `undefined`） */
export function useNodeWidth(id: string): number | string | undefined {
  return useFlowStore((s) => {
    const n = s?.nodeLookup?.get(id);
    return n?.width ?? (n?.style?.width as number | string | undefined);
  });
}

/** 当前节点在 ReactFlow store 里的高度（未设置 ⇒ `undefined`） */
export function useNodeHeight(id: string): number | string | undefined {
  return useFlowStore((s) => {
    const n = s?.nodeLookup?.get(id);
    return n?.height ?? (n?.style?.height as number | string | undefined);
  });
}

export interface SizeSyncOptions {
  mode?: SizeSyncMode;
  defaultWidth?: number;
  defaultHeight?: number;
  baseSize?: number;
}

/**
 * 比例 → 节点尺寸同步。
 *
 * `aspectRatio` 为 `'Auto'` / 空 ⇒ **不干预**（返回 `null`）：尺寸由实际媒体 / 内容自适应决定。
 * 有比例时按 `core/rules/nodeSize` 算出目标尺寸并**写回 store**（`setNodes`，唯一的画布写入点），
 * 再 `updateNodeInternals` 让 ReactFlow 重算端口位置。
 *
 * @returns 解析出的宽高比（`null` = 无比例，未干预）
 */
export function useSizeSync(
  id: string,
  aspectRatio: string,
  opts: SizeSyncOptions = {},
): number | null {
  const nodes = useStore((s) => s.nodes);
  const setNodes = useStore((s) => s.setNodes);
  const updateNodeInternals = useUpdateNodeInternals();

  const mode = opts.mode ?? 'width-fixed';
  const defaultWidth = opts.defaultWidth ?? 420;
  const defaultHeight = opts.defaultHeight ?? 420;
  const baseSize = opts.baseSize ?? NODE_AREA_FIXED_BASE_SIZE;
  const ratio = parseAspect(aspectRatio);

  useEffect(() => {
    if (!ratio) return;
    const n = nodes.find((x) => x.id === id);
    if (!n) return;
    const currentWidth = Number(n.style?.width ?? n.width ?? defaultWidth);
    const { width: w, height: h } = computeSizeSync(ratio, {
      mode,
      currentWidth,
      defaultWidth,
      defaultHeight,
      baseSize,
    });
    const curW = Number(n.style?.width ?? n.width ?? NaN);
    const curH = Number(n.style?.height ?? n.height ?? NaN);
    if (curW === w && curH === h) return;
    setNodes(
      nodes.map((x) =>
        x.id === id ? { ...x, width: w, height: h, style: { ...(x.style ?? {}), width: w, height: h } } : x,
      ),
    );
    updateNodeInternals(id);
  }, [id, ratio, mode, defaultWidth, defaultHeight, baseSize, nodes, setNodes, updateNodeInternals]);

  return ratio;
}
