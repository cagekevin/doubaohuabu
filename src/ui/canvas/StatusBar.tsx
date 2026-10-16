/**
 * 状态栏（画布的身份条）—— ★ 设计稿**新增**的件，真值 = `docs/mockup/assets/mockup.css` 的 `.mk-statusbar`。
 *
 * 四件：**节点数 · 连线数 · 缩放% · 网格吸附开关** —— 全部只读画布的事实。
 *
 * ⚠️ 它必须住在 `ReactFlowProvider` 内（缩放走 `useViewport()`）⇒ 由 `CanvasHost` 渲染。
 * ⚠️ 吸附开关写的是**工程级** `snap`（同一个开关也喂节点落点与批量排布）—— 不在这里兜第二份判断。
 * ⚠️ 「网格吸附」的**文案真源** = `ACCOUNT_PANEL_TEXT`（两处开关同一个 `snap` ⇒ 文案只许一处）。
 */
import { useViewport } from '@xyflow/react';
import { useStore } from '@/state';
import { ACCOUNT_PANEL_TEXT, CANVAS_TEXT } from '@/constants/text';
import { Icon } from '@/ui/common/Icon';
import styles from './StatusBar.module.css';

export function StatusBar() {
  const nodeCount = useStore((s) => s.nodes.length);
  const edgeCount = useStore((s) => s.edges.length);
  const snap = useStore((s) => s.snap);
  const setSnap = useStore((s) => s.setSnap);
  /** 缩放来自**视图**（不是 store）—— 平移 / 缩放时本组件重渲染，这正是"实时"要的 */
  const { zoom } = useViewport();

  return (
    <div className={styles.bar}>
      <span className={styles.item}>
        {CANVAS_TEXT.statusNodes} <b>{nodeCount}</b>
      </span>
      <span className={styles.sep} />
      <span className={styles.item}>
        {CANVAS_TEXT.statusEdges} <b>{edgeCount}</b>
      </span>
      <span className={styles.sep} />
      <span className={styles.item}>
        {CANVAS_TEXT.statusZoom} <b>{Math.round(zoom * 100)}%</b>
      </span>
      <span className={styles.spacer} />
      <button
        type="button"
        className={snap ? `${styles.toggle} ${styles.on}` : styles.toggle}
        title={ACCOUNT_PANEL_TEXT.snapTitle}
        aria-pressed={snap}
        onClick={() => setSnap(!snap)}
      >
        <Icon name="magnet" />
        {ACCOUNT_PANEL_TEXT.snapLabel}
      </button>
    </div>
  );
}
