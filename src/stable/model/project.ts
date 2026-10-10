/**
 * 工程 / 连线 / 素材库模型 —— ★ 冻结契约（**值形状**不可改）
 *
 * 依据：docs/03-人类版.md §0.1 §0.3 §0.6 + docs/11 §12.1（**真实数据已验证**）
 * 归属说明：数据形状属 `stable`（L1）—— 见 `./node.ts` 头部说明
 */

import type { CanvasNode } from './node';
import type { SNAPSHOT_FORMAT, SNAPSHOT_VERSION } from '../contracts/schemas';

/** 连线（原 `Mr` 26724-26744） */
export interface CanvasEdge {
  id: string;
  source: string;
  target: string;
  type: 'interactive';
  style?: { stroke: string; strokeWidth: number };
  /**
   * 箭头标记
   * ⚠️ `type` 用字面量联合（而非 `string`）—— 既忠实于原实现（只产 `arrowclosed`），
   *    又满足 `@xyflow/react` 的 `EdgeMarkerType` 约束
   */
  markerEnd?: { type: 'arrow' | 'arrowclosed'; color: string; width: number; height: number };
}

/** 素材库项（原 27101-27128） */
export interface LibraryItem {
  id: string;
  favorite: boolean;
  name: string;
  dataUrl: string;
  w?: number;
  h?: number;
  natW?: number;
  natH?: number;
}

/** 生成图片流项（原 27132-27160，上限 IMAGE_GEN_FEED_LIMIT = 80） */
export interface ImageGenFeedItem {
  id: string;
  name: string;
  dataUrl: string;
  source: 'api' | 'doubao' | 'dola';
  accountName: string;
  genKey: string;
  ts: number;
}

/**
 * 工程数据（原 29836-29841）
 * ★ 真实样本实测字段 = `nodes, edges, library, snap, videoShares`（docs/11 §12.1）
 */
export interface ProjectData {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  library: LibraryItem[];
  /** 吸附开关 */
  snap: boolean;
  videoShares: unknown[];
}

/** 工程（原 29828-29875 / 29741-29771 / 29909-29991） */
export interface Project {
  /** `p_<base36时间>_<计数>`；旧单工程迁移后为 `p_migrated` */
  id: string;
  name: string;
  updatedAt: number;
  /** 磁盘目录；空/缺省 = 用应用默认目录 */
  storagePath?: string;
  data: ProjectData;
}

/** 节点图预设（原 28390-28396） */
export interface GraphPreset {
  id: string;
  name: string;
  kind: 'graph';
  nodes: CanvasNode[];
  edges: CanvasEdge[];
}

/** 磁盘快照格式（主进程写，前端只读兼容；原 main.js:290-328） */
export interface ProjectSnapshot {
  /** 字面量来自 `stable/contracts/schemas.ts`（SSOT） */
  format: typeof SNAPSHOT_FORMAT;
  version: typeof SNAPSHOT_VERSION;
  [k: string]: unknown;
}

/** 空的工程数据 */
export const emptyProjectData = (): ProjectData => ({
  nodes: [],
  edges: [],
  library: [],
  snap: true,
  videoShares: [],
});
