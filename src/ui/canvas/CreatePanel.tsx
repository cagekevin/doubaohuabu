/**
 * 建节点浮层（原 `create-panel`，`_Component42.jsx:1634-1680`）
 *
 * 原版是**三选一**：文生图 / 文生视频 / 文字（`ye('image'|'video'|'text')`）。
 * 标题按来源数分两档：「引用该节点生成」/「引用所选节点生成」。
 *
 * 四种**打开方式**（源版 `Ae` 的形态）：
 *   · `mode: 'single'` —— **连线落到空白**（原 `G`/`onConnectEnd` 610-620；源里这个形态
 *     **没有 mode 字段**，为判别联合起名 `single`）—— 在 `flowPos` 居中建，并按
 *     `fromType` 决定**连线方向**（源 697-704 的三目）
 *   · `mode: 'node'` —— 从一个/多个**选中节点**触发（在 `flowPos` 居中建，并带上 `sourceIds`）
 *     ⚠️ 本仓自造的 mode（源没有）—— 保留给节点触发的那条路，见文件末注
 *   · `mode: 'group'` —— ★ **2026-10-12 落**：组连线锚点（原 `_Component37`）拖到空白
 *     （原 `xe` 608-620）—— 建完走 **`connectManyToTarget`** 批量连（源 `$`/`be`/`ie` 的
 *     `sourceIds` 分支 730-740 / 795-801 / 877-887）
 *   · `mode: 'edge'` —— 点一条**边**触发（在两端中点插入，并**删原边补两条**）
 *   · `mode: 'context'` —— 空白处右键（原 `W`/`uo`，只建节点不连线）
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
      /**
       * ★ 连线落到空白（原 `G` 610-620 开的那个形态 —— 源里**没有 mode 字段**，
       *   走 `ye` 的 `else` 分支；这里为判别联合起名 `single`）
       */
      mode: 'single';
      /** 屏幕坐标（浮层定位） */
      x: number;
      y: number;
      /** 发起连线的节点 */
      sourceId: string;
      /** 连线是从**源手柄**还是**目标手柄**发起的（决定连回来的方向） */
      fromType: 'source' | 'target';
      /** 画布坐标（新节点落点中心） */
      flowPos: { x: number; y: number };
    }
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
      /**
       * ★ 组连线锚点拖到空白（原 `xe` 608-620 的 `mode:'group'`）
       *
       * 与 `node` 的**唯一差别**是连线方式：建完走 **`connectManyToTarget`**
       * （源 `$`/`be`/`ie` 的 `sourceIds` 分支）—— 不查环、不动 `referenceOrder`。
       */
      mode: 'group';
      /** 屏幕坐标（浮层定位） */
      x: number;
      y: number;
      /** 画布坐标（新节点落点中心） */
      flowPos: { x: number; y: number };
      /** 组锚点那一片选中的节点（源 `B`） */
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
  const connectManyToTarget = useStore((s) => s.connectManyToTarget);
  const openGeneratePanel = useStore((s) => s.openGeneratePanel);
  const openImageGenPanel = useStore((s) => s.openImageGenPanel);
  const selectOnly = useStore((s) => s.selectOnly);

  /**
   * 建节点（原 `ye` → `be` / `ie` / `$`）
   *
   * 连线分三种（**全部照源**）：
   *   · `mode:'group'` ⇒ **`connectManyToTarget(sourceIds, 新节点)`** —— 批量连、不查环
   *     （源 `$`/`be`/`ie` 的 `sourceIds` 分支；`connectManyToTarget` 内部有「目标必须在、
   *     剔自己、空则退」三条守卫，见 `state/slices/canvas.ts`）
   *   · `mode:'single'` ⇒ **按 `fromType` 定方向的单条**（源 697-704：从源手柄发起 ⇒
   *     `{source: 源, target: 新}`；从目标手柄发起 ⇒ `{source: 新, target: 源}`）—— 走
   *     `connect()`（环检测 + `referenceOrder` 都在）
   *   · `mode:'node'` ⇒ 逐条 `connect({source, target: 新})`（本仓自造 mode 的既有行为：
   *     它对应「节点触发」那条路，源没有这个 mode；保留 `connect` 的环检测）
   *
   * ⚠️ 一处**有意偏离（留痕）**：原版建完 gen 节点会**顺带把来源节点的文本/素材带过去**
   *    （`linkOrder`/`materialIds`）；那部分逻辑在源版分散在多个 action 里，本切片
   *    **只建节点**，绑定留到后续切片。
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
      if (state.mode === 'group') {
        // 源版 `connectManyToTarget(sourceIds, newId)`：把来源连到新节点
        connectManyToTarget(state.sourceIds, id);
      } else if (state.mode === 'single') {
        // 源 697-704：方向由**发起手柄**决定
        connect(
          state.fromType === 'source'
            ? { source: state.sourceId, target: id }
            : { source: id, target: state.sourceId },
        );
      } else if (state.mode === 'node') {
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
   *
   * 源逐字：`Ae.sourceIds && Ae.sourceIds.length > 1 ? '引用所选节点生成' : '引用该节点生成'`
   * —— 判据**只看 `sourceIds`**、不看 mode（`edge`/`context` 形态没有这个字段 ⇒ 走单数档）。
   * ⚠️ 与源一致：**不擅自加第三种文案**。
   */
  const title =
    (state.mode === 'node' || state.mode === 'group') && state.sourceIds.length > 1
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


