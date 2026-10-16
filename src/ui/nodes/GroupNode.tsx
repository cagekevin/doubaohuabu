/**
 * 组节点（`type: 'group'`）—— 对应原 `GL.jsx`（**39 行，逐行移植**）
 *
 * ★ **它是容器**：成员靠 `parentId` 归属、`zIndex = -1001`（在其它节点**之下**，
 *   `GROUP_Z_INDEX`）。`docs/过程.md` §1（31577-31579）。
 *
 * ★★ **2026-10-10 补的三件**（此前该组件 17 行、**零交互**）：
 *   ① **成员计数**（原 `GL.jsx:9-13`：`nodes.filter(n => n.parentId === id).length`）；
 *   ② **可缩放边框**（原 19 的 `_Component28` = ReactFlow 的 `NodeResizer`，`minWidth=200`/`minHeight=140`、
 *      **只在选中时可见**）；
 *   ③ **「取消组」按钮**（原 30-37：`onMouseDown`/`onClick` **都** `stopPropagation`，
 *      再调 `ungroupNodes(id)`）。
 *
 * ⚠️ 源版这两个动作（`groupSelectedNodes` / `ungroupNodes`）都在 store 里，
 *   本工程按原则 1 拆开：**纯几何在 `core/rules/group.ts`**（已测）、写 store 在 `canvas.ts`。
 * ⚠️ 与源一致：组头（`.group-node-head`）是**拖动把手**（`title` 也这么写）——
 *    ReactFlow 靠 `dragHandle` 指定；本工程的组节点**整块**可拖（没有单独的把手类名），
 *    差异仅在于"拖内容区也能移动"，不影响语义。
 */

import { useStore } from '@/state';
import { GROUP_MIN_H, GROUP_MIN_W } from '@/core/rules/group';
import { GROUP_NODE_TEXT } from '@/constants/text';
import { NodeShell } from './NodeShell';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function GroupNode({ id, data, selected }: RFNodeProps<'group'>) {
  /** 组内节点数（原 `GL.jsx:9-13`） */
  const count = useStore((s) => s.nodes.filter((n) => n.parentId === id).length);
  const ungroupNodes = useStore((s) => s.ungroupNodes);

  return (
    // ★ 组节点也**照默认给圆点**，组图标走 `icon` 槽 ——
    //   设计稿的组头是「圆点 + `#i-group` 图标 + 标题」，不是"拿图标冒充圆点"
    <NodeShell
      type="group"
      icon="group"
      title={data.label || GROUP_NODE_TEXT.defaultLabel}
      meta={<span className={styles.nodeCount} title={GROUP_NODE_TEXT.countTitle}>{count}</span>}
      actions={
        <button
          type="button"
          // `nodrag nopan` 是 ReactFlow 的约定类名：没有它，点按钮会顺带拖动/平移
          className={`${styles.groupUngroup} nodrag nopan`}
          title={GROUP_NODE_TEXT.ungroupTitle}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            ungroupNodes(id);
          }}
        >
          {GROUP_NODE_TEXT.ungroup}
        </button>
      }
      selected={selected}
      /* 原 `GL.jsx` **没有** `_Component30` ⇒ 组节点不挂 side handle
         （组的连线锚点是 `_Component37` = `ui/canvas/GroupConnectHandle.tsx`） */
      handles={false}
      minWidth={GROUP_MIN_W}
      minHeight={GROUP_MIN_H}
      cardTitle={GROUP_NODE_TEXT.headTitle}
      testId="group-node"
    />
  );
}
