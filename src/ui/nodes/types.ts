/**
 * ReactFlow 面向的类型（UI 边界适配）
 *
 * 为什么需要这一层：
 *   `stable/model` 是**冻结的数据契约**（手写形状，不依赖任何库）；
 *   而 `@xyflow/react` 要求节点类型是它自己的 `Node<Data, Type>`。
 *   两者的差异**只在框架约束上**，不在数据语义上 ⇒ 在 UI 边界做一次映射，
 *   **不动 `stable/model`**（保持契约层与库解耦）。
 *
 * 依据：xyflow 官方模式 —— `NodeProps<Node<Data, Type>>`
 */

import type { Node, NodeProps } from '@xyflow/react';
import type { NodeDataOf, NodeType } from '@/stable/model/node';

/** 某类节点在 ReactFlow 里的类型 */
export type RFNode<T extends NodeType> = Node<NodeDataOf<T>, T>;

/** 某类节点组件的 props */
export type RFNodeProps<T extends NodeType> = NodeProps<RFNode<T>>;

/** 8 类节点的联合（供 `ReactFlow<RFCanvasNode, ...>` 使用） */
export type RFCanvasNode = { [T in NodeType]: RFNode<T> }[NodeType];
