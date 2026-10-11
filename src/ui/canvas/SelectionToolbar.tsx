/**
 * 选择工具条（原 `_Component42.jsx` 的 `.sel-toolbar`）—— **只落「成组」**
 *
 * ★ **它补的是 `groupSelected` 的入口**：`canvas` slice 的成组 action 落地后，
 *   若界面上没有调用方，就是又一个"注册了但没人用"（判据 B5）。
 *
 * ⚠️ **源版的工具条还有一堆按钮**（左/中/右对齐、顶/底对齐、水平/垂直等间距、取消组 ——
 *   `_Component42.jsx:1548-1560`），本工程**只落成组**：
 *   「取消组」在**组节点自身**上就有一个（源版也是，见 `GL.jsx:30`）⇒ 不重复；
 *   对齐/分布需要一组 `arrangeNodes` 语义，**属另一单元**（已登记）。
 *
 * ⚠️ 原则 1：不写 store —— 调 `useStore` 暴露的 action
 */

import { useStore } from '@/state';
import { GROUP_NODE_TEXT } from '@/constants/text';
import styles from './SelectionToolbar.module.css';

export function SelectionToolbar() {
  const nodes = useStore((s) => s.nodes);
  const groupSelected = useStore((s) => s.groupSelected);
  const pushToast = useStore((s) => s.pushToast);

  // 源版判据：`selected && type !== 'group'`（**组不参与成组** —— 组不能套组）
  const count = nodes.filter((n) => n.selected && n.type !== 'group').length;
  if (count < 2) return null;

  return (
    <div className={styles.bar} data-testid="selection-toolbar">
      <button
        type="button"
        className={styles.btn}
        title={GROUP_NODE_TEXT.groupTitle}
        onClick={() => {
          const r = groupSelected();
          // ⚠️ 失败**不静默**：`need-2` 只会在"选中数刚好跨过边界"时出现（理论上到不了）
          if (!r.ok) pushToast(GROUP_NODE_TEXT.groupTitle, undefined, 'warn');
        }}
      >
        {GROUP_NODE_TEXT.group}
      </button>
    </div>
  );
}
