/**
 * Canvas slice（② 子树共享：只在画布子树内 —— docs/11 §5.1）
 *
 * ⚠️ 原则 1：只有 state 能写 store
 * ⚠️ 撤销/重做的**纯逻辑**在 `core/rules/undo.ts`（已测 W5）；本文件只做接线 + 注入时钟
 * ⚠️ **快照时机 = 变更之前**（统一约定，见 `core/rules/undo.ts` 头部说明）
 */

import type { CanvasNode } from '@/stable/model/node';
import type { CanvasEdge, LibraryItem } from '@/stable/model/project';
import {
  commitSnapshot,
  initialUndoStack,
  redo as redoStack,
  undo as undoStack,
  type UndoStack,
} from '@/core/rules/undo';
import { applyConnection, detachConnection, type ConnectRequest } from '@/core/rules/graph';
import { makeNodeId } from '@/core/rules/project';
import { defaultNodeData } from '@/core/model/defaults';
import type { CanvasEdge as Edge } from '@/stable/model/project';

/** 被快照的状态（原 `Td` = `structuredClone({nodes,edges,library})`） */
export interface CanvasSnapshot {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  library: LibraryItem[];
}

/** 快照深拷贝（原 `Td` 26745） */
export const takeSnapshot = (s: CanvasSnapshot): CanvasSnapshot =>
  structuredClone({ nodes: s.nodes, edges: s.edges, library: s.library });

/** slice 需要的注入依赖（时钟来自 `ClockPort`） */
export interface CanvasSliceDeps {
  now(): number;
  /** 新边的 id 生成（副作用，由 state 注入） */
  makeEdge(conn: ConnectRequest): Edge;
}

export interface CanvasSlice {
  // ── state ──
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  library: LibraryItem[];
  /** 吸附开关（工程级，随 ProjectData 持久化） */
  snap: boolean;
  /** 撤销栈（原 `past`/`future`/`_lastCommit`） */
  undo: UndoStack<CanvasSnapshot>;

  // ── actions ──
  setGraph: (nodes: CanvasNode[], edges: CanvasEdge[]) => void;
  setLibrary: (library: LibraryItem[]) => void;
  setSnap: (snap: boolean) => void;

  /**
   * 提交快照（原 `commit`）—— ⚠️ **必须在变更之前调用**
   * 同 key 且 <800ms 合并；栈上限 80
   */
  commit: (key: string) => void;
  undoAction: () => void;
  redoAction: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;

  /**
   * 添加连线（原 `onConnect`）—— 内含环检测 + `referenceOrder` 维护
   * @returns 被拒时的提示文案；成功返回 `null`
   */
  connect: (conn: ConnectRequest) => string | null;
  /** 删除连线（并清理 `referenceOrder`） */
  disconnect: (edge: CanvasEdge) => void;

  /** ★ 建文本节点（原「双击画布创建文本框」）—— 返回新节点 id */
  addTextNode: (position: { x: number; y: number }) => string;
  /** ★ 建素材节点（原「从资源库拖入」）—— 返回新节点 id */
  addMaterialNode: (
    item: { id: string; name: string; dataUrl: string; w?: number; h?: number; natW?: number; natH?: number },
    position: { x: number; y: number },
  ) => string;
  /** ★ 删除节点（连带删除其相关边与 `referenceOrder` 引用） */
  removeNodes: (ids: readonly string[]) => void;
  /** 更新单个节点的 `data`（局部合并） */
  patchNodeData: (id: string, patch: Record<string, unknown>) => void;
}

export function createCanvasSlice(
  set: (partial: Partial<CanvasSlice>) => void,
  get: () => CanvasSlice,
  deps: CanvasSliceDeps,
): CanvasSlice {
  /** 节点 id 序号（原 Pt 的计数） */
  let nodeSeq = 0;

  /** 取当前可快照的三元组 */
  const current = (): CanvasSnapshot => {
    const s = get();
    return { nodes: s.nodes, edges: s.edges, library: s.library };
  };

  return {
    nodes: [],
    edges: [],
    library: [],
    snap: true,
    undo: initialUndoStack<CanvasSnapshot>(),

    setGraph: (nodes, edges) => set({ nodes, edges }),
    setLibrary: (library) => set({ library }),
    setSnap: (snap) => set({ snap }),

    commit: (key) => {
      const s = get();
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), key, deps.now()) });
    },

    undoAction: () => {
      const s = get();
      const out = undoStack(s.undo, takeSnapshot(current()));
      if (!out) return;
      set({
        nodes: out.restored.nodes,
        edges: out.restored.edges,
        library: out.restored.library,
        undo: out.stack,
      });
    },

    redoAction: () => {
      const s = get();
      const out = redoStack(s.undo, takeSnapshot(current()));
      if (!out) return;
      set({
        nodes: out.restored.nodes,
        edges: out.restored.edges,
        library: out.restored.library,
        undo: out.stack,
      });
    },

    canUndo: () => get().undo.past.length > 0,
    canRedo: () => get().undo.future.length > 0,

    connect: (conn) => {
      const s = get();
      const res = applyConnection(s.nodes, s.edges, conn, deps.makeEdge);
      if (!res.ok) {
        // ★ 原则 6：错误原样返回（文案来自 core/rules 的常量，未改写）
        return res.message;
      }
      // 变更前 commit（统一约定）
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({ nodes: res.value.nodes, edges: [...s.edges, res.value.edge] });
      return null;
    },

    disconnect: (edge) => {
      const s = get();
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-delete', deps.now()) });
      const out = detachConnection(s.nodes, s.edges, edge);
      set({ nodes: out.nodes, edges: out.edges });
    },

    addTextNode: (position) => {
      const s = get();
      const id = makeNodeId('text', deps.now(), ++nodeSeq);
      const node = {
        id,
        type: 'text',
        position,
        data: defaultNodeData('text'),
      } as CanvasNode;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({ nodes: [...s.nodes, node] });
      return id;
    },

    addMaterialNode: (item, position) => {
      const s = get();
      const id = makeNodeId('material', deps.now(), ++nodeSeq);
      const node = {
        id,
        type: 'material',
        position,
        data: {
          ...defaultNodeData('material'),
          name: item.name,
          dataUrl: item.dataUrl,
          libId: item.id,
          ...(item.w != null ? { w: item.w } : {}),
          ...(item.h != null ? { h: item.h } : {}),
          ...(item.natW != null ? { natW: item.natW } : {}),
          ...(item.natH != null ? { natH: item.natH } : {}),
        },
      } as CanvasNode;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-add', deps.now()) });
      set({ nodes: [...s.nodes, node] });
      return id;
    },

    removeNodes: (ids) => {
      const s = get();
      const kill = new Set(ids);
      if (kill.size === 0) return;
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'delete', deps.now()) });

      // ① 删边（源或目标被删）
      const edges = s.edges.filter((e) => !kill.has(e.source) && !kill.has(e.target));
      // ② 清理幸存节点里对已删节点的 `referenceOrder` 引用
      const nodes = s.nodes
        .filter((n) => !kill.has(n.id))
        .map((n) => {
          if (n.type !== 'text') return n;
          const order = n.data.referenceOrder ?? [];
          const next = order.filter((rid) => !kill.has(rid));
          return next.length === order.length ? n : ({ ...n, data: { ...n.data, referenceOrder: next } } as CanvasNode);
        });

      set({ nodes, edges });
    },

    patchNodeData: (id, patch) => {
      const s = get();
      set({ undo: commitSnapshot(s.undo, takeSnapshot(current()), 'graph-edit', deps.now()) });
      set({
        nodes: s.nodes.map((n) =>
          n.id === id ? ({ ...n, data: { ...n.data, ...patch } } as CanvasNode) : n,
        ),
      });
    },
  };
}
