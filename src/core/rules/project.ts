/**
 * 工程规则（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据：docs/03-人类版.md §2（工程 CRUD）+ `Pt('p')` 的 id 生成规则
 *   - id 格式：`p_<base36 时间>_<计数>`（真实样本实测 `p_mv1raqbo_1` ✅）
 *   - 新工程名默认「未命名项目」
 *
 * ⚠️ 原则 4：`now` 由外部注入（`ClockPort`），本模块**不调 `Date.now()`**
 */

import type { CanvasEdge, GraphPreset, LibraryItem, Project, ProjectData } from '@/stable/model/project';
import type { CanvasNode } from '@/stable/model/node';
import { emptyProjectData } from '@/stable/model/project';
import { BRAND } from '@/constants/text';
import { LEGACY_PROJECT_NAME, PROJECT_ID_PREFIX } from '@/stable/contracts/schemas';

/** 新工程默认名（SSOT 在 `constants/text.ts` 的 `BRAND`） */
const DEFAULT_PROJECT_NAME = BRAND.untitledProject;

/**
 * 生成工程 id（原 `Pt('p')` = `p_<base36>_<计数>`）
 *
 * @param now 时间戳（ms）
 * @param seq 同一毫秒内的自增计数（从 1 起）
 */
export function makeProjectId(now: number, seq: number): string {
  // ⚠️ `PROJECT_ID_PREFIX` 已含下划线（`'p_'`）⇒ 拼出 `p_<base36>_<seq>`（真实样本 `p_mv1raqbo_1` ✅）
  return `${PROJECT_ID_PREFIX}${now.toString(36)}_${seq}`;
}

/**
 * 节点 id 前缀（原 `Pt` 的各前缀）
 * ⚠️ 与 `stable/contracts/schemas.ts` 里的 `*_ID_PREFIX` 同源 —— 那边是**冻结契约**，
 *    这里补的是节点专用的几个（源码里节点前缀没有独立常量）
 */
export const NODE_ID_PREFIX = {
  text: 't_',
  material: 'm_',
  video: 'vid_',
  genvideo: 'gv_',
  imggen: 'ig_',
  account: 'a_',
  /**
   * ★ 2026-10-10 补：原先**漏了 `download`** ⇒ `makeNodeId('download', …)` 编译不过
   *   ⇒ 下载节点**根本建不出来**（与「5 类节点零创建入口」是同一批断链）。
   *   前缀取自源版 `Pt('dl')`（`shared.js` 全文前缀集合：`a`/`dl`/`e`/`grp`/`gv`/`ig`/
   *   `lg`/`lib`/`m`/`p`/`sty`/`t`/`vid`）。
   */
  download: 'dl_',
  group: 'grp_',
} as const;

export type NodeIdKind = keyof typeof NODE_ID_PREFIX;

/**
 * 生成节点 id（原 `Pt(prefix)`）
 * @param kind 节点类别
 * @param now 时间戳（ms）
 * @param seq 自增计数
 */
export function makeNodeId(kind: NodeIdKind, now: number, seq: number): string {
  return `${NODE_ID_PREFIX[kind]}${now.toString(36)}_${seq}`;
}

/**
 * 生成**素材库条目** id（原 `Pt('lib')`）
 *
 * ⚠️ **2026-10-11 收口（判据 C1）**：此前只有 `ui/panels/LibraryPanel.tsx` 里内联过
 *   `` `lib_${Date.now().toString(36)}_${i}` ``；`canvas.addMaterialsBatch` 是第 **2** 处
 *   ⇒ 提到这里（与 `makeNodeId` 同法，前缀固定 `lib_`；`lib` **不是节点类型**，故不进
 *   `NODE_ID_PREFIX`）。
 */
export function makeLibraryId(now: number, seq: number): string {
  return `lib_${now.toString(36)}_${seq}`;
}

/** 新建工程（原「＋ 新建项目」） */
export function createProject(opts: {
  now: number;
  seq: number;
  name?: string;
  data?: Partial<ProjectData>;
  storagePath?: string;
}): Project {
  return {
    id: makeProjectId(opts.now, opts.seq),
    name: opts.name ?? DEFAULT_PROJECT_NAME,
    updatedAt: opts.now,
    ...(opts.storagePath ? { storagePath: opts.storagePath } : {}),
    data: { ...emptyProjectData(), ...(opts.data ?? {}) },
  };
}

/**
 * 重命名（原 `renameProject` 30056-30068）—— **空名保持原名**
 *
 * ⚠️ 2026-10-10 修正：本函数原先「空名回落 `未命名项目`」，而源实现是
 *    `name: r && r.trim() ? r.trim() : c.name` —— 即**空名保留原名**。
 *    那是**行为不等价**（把「清空名字」变成「改名成未命名项目」），已按源改正。
 */
export function renameProject(project: Project, name: string, now: number): Project {
  const trimmed = String(name ?? '').trim();
  return { ...project, name: trimmed || project.name, updatedAt: now };
}

/**
 * 设置保存路径（原 `setProjectStoragePath` 30096-30113）
 *
 * ⚠️ 与源逐字对齐：`typeof path === 'string' ? path.trim() : ''` ⇒ **空串即「用默认目录」**
 *    （落到 `undefined`，而不是存一个空字符串 —— 真实样本里缺字段就是缺字段）。
 */
export function setProjectStoragePath(project: Project, path: unknown, now: number): Project {
  const trimmed = typeof path === 'string' ? path.trim() : '';
  return { ...project, storagePath: trimmed || undefined, updatedAt: now };
}

/** 未知值 → 数组（非数组一律空数组 —— 与源的 `Array.isArray(x) ? x : []` 一致） */
const asArray = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

/**
 * 从导入文件读工程数据（原 `importProject` 30001-30006）
 *
 * ⚠️ **有意不做节点归一**（与源一致）：源版 `importProject` **不跑** `openProject`
 *    那套归一（补 id / 补 type / 补 position）⇒ 导入的工程在**被重新打开**时才归一。
 *    这是源版既有行为，照抄（不顺手"修好"，否则与源不等价）。
 */
export function readImportedProjectData(source: Record<string, unknown>): ProjectData {
  return {
    nodes: asArray<CanvasNode>(source.nodes),
    edges: asArray<CanvasEdge>(source.edges),
    library: asArray<LibraryItem>(source.library),
    // 源：`n.snap ?? true` —— 缺省吸附开
    snap: typeof source.snap === 'boolean' ? source.snap : true,
    videoShares: [],
  };
}

/**
 * 导入文件里的默认工程名（原 `importProject` 的 `'导入的项目'`）
 * ⚠️ 与源同字面量 —— 复用 `LEGACY_PROJECT_NAME`（同一字符串，只留一处真源）。
 */
export const IMPORTED_PROJECT_NAME = LEGACY_PROJECT_NAME;

/**
 * 已知存储路径清单（原版**四处重复**的组装：`createProject` 29849-29856 ·
 * `openProject` 29891-29898 · `renameProject` 30082-30089 · `importProject` 30014-30021）
 *
 * ⚠️ 抽出的理由 = 判据 **C1 三振出局**（原版自己重复了 4 遍，逐字相同）。
 * ⚠️ 逐字对齐：`{path: p.storagePath, name: p.name}` 再**丢掉没有 path 的工程**。
 */
export function knownStoragePathsOf(projects: readonly Project[]): Array<{ path: string; name: string }> {
  const out: Array<{ path: string; name: string }> = [];
  for (const p of projects) {
    if (p.storagePath) out.push({ path: p.storagePath, name: p.name });
  }
  return out;
}

/** 从导入文件读工程名（原 `r && r.trim() ? r.trim() : '导入的项目'`） */
export function readImportedProjectName(source: Record<string, unknown>): string {
  const raw = source.name;
  const trimmed = typeof raw === 'string' ? raw.trim() : '';
  return trimmed || IMPORTED_PROJECT_NAME;
}

/**
 * 合并导入的预设（原 `importProject` 30025-30040）
 *
 * 规则（逐字对齐）：只并入**带 `id` 且 id 尚未存在**的项；`id` 重复的**静默丢弃**
 * （原版对"没带 id"的项也丢弃 —— 否则无法判重）。
 */
export function mergeImportedPresets(
  existing: readonly GraphPreset[],
  incoming: unknown,
): GraphPreset[] {
  const items = asArray<unknown>(incoming);
  if (items.length === 0) return [];
  const seen = new Set(existing.map((p) => p.id));
  const added: GraphPreset[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Partial<GraphPreset>;
    if (!p.id || typeof p.id !== 'string' || seen.has(p.id)) continue;
    seen.add(p.id);
    added.push(item as GraphPreset);
  }
  return added;
}

/** 触碰 `updatedAt`（任何数据变更都该调） */
export function touchProject(project: Project, now: number): Project {
  return { ...project, updatedAt: now };
}
