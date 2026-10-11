/**
 * 8 类节点出口 + `nodeTypes` 映射
 *
 * 依据：docs/03-人类版.md §1（`nodeTypes` 映射 shared.js:43402-43414，8 类）
 * 对应验收：`08-验证用例.md` **W13**（8 类全部能创建/渲染/持久化/重载）
 *
 * ★ **键穷尽由编译器守卫**（结构承载，不是闸、也不是注释声称）：
 *   `NODE_COMPONENT_BY_TYPE` 的类型注解 `Record<NodeType, unknown>` **就是守卫本身** ——
 *   少一个键 / 多一个键 / 拼错键 ⇒ **编译不过**。
 *
 * ⚠️ **别改回 `as unknown as NodeTypes`**：那会把**键**一并绕过（实证 probe：注入
 *   `texxt: TextNode, missing: VideoNode` 两个垃圾键，`tsc` **退出 0** = 零守卫）。
 *   `core/rules/tests/node.test.ts`（W13）只覆盖 `core/rules/node.ts`，**不碰本映射**。
 */

import type { NodeTypes } from '@xyflow/react';
import type { NodeType } from '@/stable/model/node';
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
 * 键 → 组件
 *
 * ⚠️ `Record<NodeType, unknown>` 注解 = **结构守卫**：对象字面量直接对它赋值 ⇒
 *    缺键报错、多键 / 拼错键触发**多余属性检查**。改这行注解为宽类型 = 把守卫拆了。
 * ⚠️ 值类型**故意写宽**（`unknown`）：各组件收窄了 props（`RFNodeProps<'text'>` 等），
 *    与 `NodeTypes` 的 `ComponentType<NodeProps>` 是**逆变**关系 —— 这一层不承担键校验，
 *    键已由上面的注解锁死。
 */
const NODE_COMPONENT_BY_TYPE: Record<NodeType, unknown> = {
  text: TextNode,
  material: MaterialNode,
  video: VideoNode,
  genvideo: GenVideoNode,
  imggen: GenImageNode,
  account: AccountNode,
  download: DownloadNode,
  group: GroupNode,
};

/** 原 `dO`（shared.js:43402-43414）—— 交给 ReactFlow 时的**值**桥接（键已在上一行由类型锁死） */
export const nodeTypes = NODE_COMPONENT_BY_TYPE as NodeTypes;
