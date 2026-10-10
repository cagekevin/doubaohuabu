/**
 * 8 类节点出口 + `nodeTypes` 映射
 *
 * 依据：docs/03-人类版.md §1（`nodeTypes` 映射 shared.js:43402-43414，8 类）
 * 对应验收：`08-验证用例.md` **W13**（8 类全部能创建/渲染/持久化/重载）
 *
 * ⚠️ 映射的 key 必须与 `CanvasNode['type']` 的 8 个字面量**完全一致**
 */

import type { NodeTypes } from '@xyflow/react';
import { TextNode } from './TextNode';

import { MaterialNode } from './MaterialNode';
import { VideoNode } from './VideoNode';
import { GenVideoNode } from './GenVideoNode';
import { GenImageNode } from './GenImageNode';
import { AccountNode } from './AccountNode';
import { DownloadNode } from './DownloadNode';
import { GroupNode } from './GroupNode';

export { TextNode, MaterialNode, VideoNode, GenVideoNode, GenImageNode, AccountNode, DownloadNode, GroupNode };

/**
 * 原 `dO`（shared.js:43402-43414）
 *
 * ⚠️ 各组件收窄了 props 类型（`RFNodeProps<'text'>` 等），与 `NodeTypes`（`ComponentType<NodeProps>`）
 *    存在**逆变**关系 ⇒ 这里做一次断言。断言是安全的：映射的 key 与 `NodeType` 的 8 个字面量一一对应，
 *    由 `core/rules/tests/node.test.ts`（W13）保证。
 */
export const nodeTypes = {
  text: TextNode,
  material: MaterialNode,
  video: VideoNode,
  genvideo: GenVideoNode,
  imggen: GenImageNode,
  account: AccountNode,
  download: DownloadNode,
  group: GroupNode,
} as unknown as NodeTypes;
