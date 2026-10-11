/**
 * 建节点浮层（原 `create-panel`，`_Component42.jsx:1634-1680`）
 *
 * 原版是**三选一**：文生图 / 文生视频 / 文字（`ye('image'|'video'|'text')`）。
 * 标题按来源数分两档：「引用该节点生成」/「引用所选节点生成」。
 *
 * 两种**打开方式**（源版 `Ae.mode`）：
 *   · `mode: 'node'` —— 从一个/多个**选中节点**触发（在 `flowPos` 居中建，并带上 `sourceIds`）
 *   · `mode: 'edge'` —— 点一条**边**触发（在两端中点插入，并**删原边补两条**）
 *
 * ⚠️ 原则 1：本组件**不写 store**（只调 `state` 暴露的 action）
 * ⚠️ 文案全员走 `constants/text`（`CREATE_PANEL_TEXT`）
 */

import { useStore } from '@/state';
import type { NodeType } from '@/stable/model/node';
import { CREATE_PANEL_TEXT } from '@/constants/text';
// ⚠️ 尺寸表**只有一处真源**（原则 5）：`core/model/defaults.ts` 的 `NODE_CREATE_SIZES`。
//    这里**只读**它（`ui` 读 `core/model` 的数据是允许的方向；不得反向）。
import { nodeCreateSize } from '@/core/model/defaults';
import styles from './CreatePanel.module.css';

/** 浮层的打开状态（原 `Ae`） */
export type CreatePanelState =
  | {
      mode: 'node';
      /** 屏幕坐标（浮层定位） */
      x: number;
      y: number;
      /** 画布坐标（新节点落点中心） */
      flowPos: { x: number; y: number };
      /** 触发的节点（引用来源） */
      sourceIds: string[];
    }
  | {
      mode: 'edge';
      x: number;
      y: number;
      edgeId: string;
      sourceId: string;
      targetId: string;
    }
  | {
      /** ★ 空白处右键（原 `mode:'context'`，`_Component42.jsx:1039-1045`） */
      mode: 'context';
      x: number;
      y: number;
      /** 画布坐标（落点中心） */
      flowPos: { x: number; y: number };
      /**
       * 右键时画布上**有没有**选中节点（原 `hasSelection`）
       * ⚠️ **源只存不用** —— 面板标题/三个选项都没读它（逐字保留，见 `docs/13` §3）
       */
      hasSelection: boolean;
    };

export interface CreatePanelProps {
  state: CreatePanelState;
  onClose: () => void;
}

export function CreatePanel({ state, onClose }: CreatePanelProps) {
  const addNode = useStore((s) => s.addNode);
  const insertNodeOnEdge = useStore((s) => s.insertNodeOnEdge);
  const connect = useStore((s) => s.connect);
  const openGeneratePanel = useStore((s) => s.openGeneratePanel);
  const openImageGenPanel = useStore((s) => s.openImageGenPanel);
  const selectOnly = useStore((s) => s.selectOnly);

  /**
   * 建节点（原 `ye` → `be` / `ie` / `$`）
   *
   * ⚠️ **两处有意偏离（都留痕）**：
   *   ① 原版 `mode:'node'` 用 `connectManyToTarget(sourceIds, newId)` **批量连线**；
   *      本工程目前只有单条 `connect(conn)` ⇒ 这里**逐条 connect**，效果等价。
   *   ② 原版建完 gen 节点会**顺带把来源节点的文本/素材带过去**（`linkOrder`/`materialIds`）；
   *      那部分逻辑在源版分散在多个 action 里，本切片**只建节点**，绑定留到后续切片。
   */
  const create = (type: NodeType): void => {
    let created: string | null;
    if (state.mode === 'edge') {
      created = insertNodeOnEdge(state.edgeId, type);
    } else {
      const size = nodeCreateSize(type);
      const id = addNode(type, {
        x: state.flowPos.x - size.w / 2,
        y: state.flowPos.y - size.h / 2,
      });
      if (state.mode === 'node') {
        // 源版 `connectManyToTarget(sourceIds, newId)`：把来源连到新节点
        for (const src of state.sourceIds) connect({ source: src, target: id });
      }
      // ⚠️ `mode:'context'`（空白右键）：源走**同一个 else 分支** ⇒ `connect({source: 新节点,
      //    target: Ae.sourceId})`，而 `sourceId` 在这个 mode 下是 **undefined** ⇒
      //    **源的老 bug**（那步必然失败、连不出边）。本实现**跳过连线**，只建节点 ——
      //    照抄会造出 `target` 为 `undefined` 的坏边。
      created = id;
    }
    /*
     * ★ **2026-10-11 落（TD-16-90 结）**：源 `_Component42.jsx:761-771` / `818-828` —— 建完**生成类**节点后
     *   会**选中它并打开对应的生成面板**（`openGeneratePanel` / `openImageGenPanel`）；
     *   且**三种 mode 下都**会
     *   `onNodesChange(nodes.map(n => ({type:'select', id:n.id, selected:n.id === B})))`
     *   —— 即**建完只选新节点**（`_Component42.jsx:761-771` / `818-828`）。
     *   此前本仓刻意没做（面板按 `genPanelNodeId` 打开、不依赖选中态）—— 现在补齐。
     */
    if (created) selectOnly([created]);
    if (created) {
      if (type === 'imggen') openImageGenPanel(created);
      else if (type === 'genvideo') openGeneratePanel(created);
    }
    onClose();
  };

  /**
   * 标题（原 `_Component42.jsx:1642-1644`）—— **只有两档**
   * ⚠️ 与源一致：边模式下 `sourceIds` 缺失 ⇒ **也显示**「引用该节点生成」
   *    （源版就是个二元三目，没有第三种文案；不擅自"改进"）
   */
  const title =
    state.mode === 'node' && state.sourceIds.length > 1
      ? CREATE_PANEL_TEXT.multiTitle
      : CREATE_PANEL_TEXT.singleTitle;

  return (
    <>
      {/* 点空白关掉（原 `panel-backdrop` 的 `onMouseDown`） */}
      <div className={styles.backdrop} onMouseDown={onClose} />
      <div className={styles.panel} style={{ left: state.x, top: state.y }} data-testid="create-panel">
        <div className={styles.title}>{title}</div>
        <button type="button" className={styles.option} onClick={() => create('imggen')}>
          {CREATE_PANEL_TEXT.image}
        </button>
        <button type="button" className={styles.option} onClick={() => create('genvideo')}>
          {CREATE_PANEL_TEXT.video}
        </button>
        <button type="button" className={styles.option} onClick={() => create('text')}>
          {CREATE_PANEL_TEXT.text}
        </button>
      </div>
    </>
  );
}


