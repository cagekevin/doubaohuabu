/**
 * `canvas.addMaterialsBatch` 的**主体**（原 `addMaterialsBatch` shared.js:29084-29242）
 *
 * ★ **为什么单独成文件（判据 C1 + `max-lines`〔该规则 2026-10-11 已关闭〕）**：`canvas.ts` 的**代码行**已超 400 ⇒
 *   把「排网格 → 落盘外置 → library 去重 → 建节点」这段抽出来；
 *   `canvas.ts` 只留「读 state → 调它 → 写 state」。
 *
 * ⚠️ **原则 1**：本模块**不写 store** —— 只**返回** `{newIds, newNodes, newLib}`。
 * ⚠️ **原则 4**：宿主能力（`persistImage`）与 id 生成全部**注入**。
 */

import type { CanvasNode } from '@/stable/model/node';
import type { LibraryItem } from '@/stable/model/project';
import { defaultNodeData } from '@/core/model/defaults';
import { LOVART_ITEM_DEFAULT_NAME } from '@/core/rules/lovartGallery';
import {
  autoPlaceCenter,
  planMaterialGrid,
  type MaterialGridItem,
  type MaterialPlacement,
} from '@/core/rules/materialGrid';
import { GALLERY_GRID_GAP, GALLERY_GRID_SCALE, GALLERY_NODE_HEADER_H } from '@/constants';

/** 入参里的**一张图**（比 `MaterialGridItem` 多名字 / 地址） */
export interface MaterialBatchInput extends MaterialGridItem {
  name?: string;
  dataUrl?: string;
}

export interface MaterialBatchOptions {
  /** 列数（不给 ⇒ `ceil(sqrt(n))`） */
  cols?: number;
  gap?: number;
  scale?: number;
  /** 按**已有节点**的右边界自动落点（原 `r.autoPlace`；画廊**不传**，`_Component26` 才传） */
  autoPlace?: boolean;
}

export interface MaterialBatchState {
  nodes: readonly CanvasNode[];
  library: readonly LibraryItem[];
  snap: boolean;
}

export interface MaterialBatchDeps {
  /** 原 `Tn`：把 `data:` 图落成本地引用（**宿主**，同步 IPC） */
  persistImage(dataUrl: string): string;
  /** 新素材节点 id（原 `Pt('m')`） */
  nextNodeId(): string;
  /** 新库条目 id（原 `Pt('lib')`） */
  nextLibId(): string;
}

export interface MaterialBatchResult {
  /** 新节点 id（**顺序即入参顺序**）；已在画布上的那张给的是**既有节点 id** */
  newIds: string[];
  newNodes: CanvasNode[];
  newLib: LibraryItem[];
}

export function buildMaterialBatch(
  state: MaterialBatchState,
  items: readonly MaterialBatchInput[],
  opts: MaterialBatchOptions,
  deps: MaterialBatchDeps,
): MaterialBatchResult {
  const gap = opts.gap ?? GALLERY_GRID_GAP;
  const scale = opts.scale ?? GALLERY_GRID_SCALE;

  // ① 排网格（原 29088-29160）—— `snap` 与源一致：`t().snap ? mr(H) : H`
  const base = {
    gap,
    scale,
    snap: state.snap,
    ...(opts.cols === undefined ? {} : { cols: opts.cols }),
  };
  let plan = planMaterialGrid(items, base);
  if (opts.autoPlace) {
    const c = autoPlaceCenter(state.nodes, gap, plan.width, plan.height);
    plan = planMaterialGrid(items, { ...base, centerOn: c });
  }

  /** `dataUrl → libId`（原 `C`） */
  const libByUrl = new Map(state.library.map((l) => [l.dataUrl, l.id]));
  /** `libId → 已在画布上的素材节点 id`（原 `E`）—— 命中就**复用**，不重复建节点 */
  const nodeByLibId = new Map<string, string>();
  for (const n of state.nodes) {
    if (n.type !== 'material') continue;
    const d = n.data as { libId?: string; dataUrl?: string; poster?: string };
    // 原 `Ms(node, library)`：`data.libId || (按 dataUrl 找库条目).id || ''`
    const libId = d.libId || state.library.find((l) => l.dataUrl === (d.dataUrl || d.poster || ''))?.id || '';
    if (libId && !nodeByLibId.has(libId)) nodeByLibId.set(libId, n.id);
  }

  const newIds: string[] = [];
  const newNodes: CanvasNode[] = [];
  const newLib: LibraryItem[] = [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i] as MaterialBatchInput;
    // ② 落盘外置（原 `Tn`）
    const dataUrl = it.dataUrl ? deps.persistImage(it.dataUrl) : '';
    let libId: string | null = dataUrl ? (libByUrl.get(dataUrl) ?? null) : null;
    // ③ 该库条目已有节点 ⇒ 复用节点，跳过建新的（原 29184-29187）
    if (libId && nodeByLibId.has(libId)) {
      newIds.push(nodeByLibId.get(libId) as string);
      continue;
    }
    if (!libId && dataUrl) {
      libId = deps.nextLibId();
      const p0 = plan.placements[i] as MaterialPlacement;
      newLib.push({
        id: libId,
        name: it.name || LOVART_ITEM_DEFAULT_NAME,
        dataUrl,
        w: it.natW || p0.w || 0,
        h: it.natH || p0.h - GALLERY_NODE_HEADER_H || 0,
        favorite: false,
      });
      libByUrl.set(dataUrl, libId);
    }
    const lib =
      (libId ? state.library.find((l) => l.id === libId) : undefined) ??
      (libId ? newLib.find((l) => l.id === libId) : undefined);
    const name = lib?.name || it.name || LOVART_ITEM_DEFAULT_NAME;
    const p = plan.placements[i] as MaterialPlacement;
    const id = deps.nextNodeId();
    newIds.push(id);
    newNodes.push({
      id,
      type: 'material',
      position: { x: p.x, y: p.y },
      width: p.w,
      height: p.h,
      selected: false,
      data: { ...defaultNodeData('material'), label: name, name, dataUrl, libId },
    } as CanvasNode);
    if (libId) nodeByLibId.set(libId, id);
  }

  return { newIds, newNodes, newLib };
}
