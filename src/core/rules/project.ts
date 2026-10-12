/**
 * 工程规则（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据：docs/过程.md §2（工程 CRUD）+ `Pt('p')` 的 id 生成规则
 *   - id 格式：`p_<base36 时间>_<计数>`（真实样本实测 `p_mv1raqbo_1` ✅）
 *   - 新工程名默认「未命名项目」
 *
 * ⚠️ 原则 4：`now` 由外部注入（`ClockPort`），本模块**不调 `Date.now()`**
 */

import type { CanvasEdge, LibraryItem, Preset, Project, ProjectData } from '@/stable/model/project';
import type { CanvasNode } from '@/stable/model/node';
import { emptyProjectData } from '@/stable/model/project';
import { BRAND } from '@/constants/text';
import {
  ACCOUNT_ID_PREFIX,
  EDGE_ID_PREFIX,
  LEGACY_PROJECT_NAME,
  LIBRARY_ID_PREFIX,
  PRESET_ID_PREFIX,
  PROJECT_ID_PREFIX,
} from '@/stable/contracts/schemas';

/** 新工程默认名（SSOT 在 `constants/text.ts` 的 `BRAND`） */
const DEFAULT_PROJECT_NAME = BRAND.untitledProject;

/**
 * **全仓唯一 id 前缀表**（★ 2026-10-12 · 越权族收口）
 *
 * ⚠️ **每一格都对着源**（不按"我觉得该叫什么"起名）：
 *   · 契约层已有的 5 个（`p`/`lib`/`pre`/`e`/`acc`）**直接取契约常量** —— 不在本表再抄一遍字面量；
 *   · 其余取自源 `Pt(...)` 的**前缀全集**（`shared.js` 全文实测：`a`/`dl`/`e`/`grp`/`gv`/`ig`/
 *     `lg`/`lib`/`m`/`p`/`pre`/`sty`/`t`/`vid`）＋本仓新增两类（租约 `rt` · 队列项 `sq`）。
 * ⚠️ **`account` 与 `accountNode` 是两个东西**：`acc_` 是**账号记录**的 id（源 `addAccount`），
 *   `a_` 是**账号节点**的 id（源 `Pt('a')`）—— 合并会把两者撞成一个前缀。
 * ⚠️ 同理 `accountGroup`（源 `grp_<base36>`，**无 seq 段**）与 `groupNode`（画布组节点，走 `Pt` ⇒ 有 seq）。
 */
/**
 * 契约常量**自带尾下划线**（`'p_'` / `'lib_'` / `'pre_'` / `'e_'` / `'acc_'`），而本表统一按**裸名**存
 * （`ID_PREFIX.project === 'p'`）—— 否则 `makeId` 的模板会再补一个 `_` ⇒ 拼出 `pre__…`。
 */
const bare = (p: string): string => p.replace(/_$/, '');

export const ID_PREFIX = {
  project: bare(PROJECT_ID_PREFIX),
  library: bare(LIBRARY_ID_PREFIX),
  preset: bare(PRESET_ID_PREFIX),
  edge: bare(EDGE_ID_PREFIX),
  account: bare(ACCOUNT_ID_PREFIX),
  accountGroup: 'grp',
  style: 'sty',
  lovartGallery: 'lg',
  lease: 'rt',
  queueItem: 'sq',
  /** 无水印视频分享（原 `addVideoShare` 的 `vs_` 前缀，`shared.js:27923`） */
  videoShare: 'vs',
  // ── 节点类（原 `Pt` 的前缀）──
  text: 't',
  material: 'm',
  video: 'vid',
  genvideo: 'gv',
  imggen: 'ig',
  download: 'dl',
  accountNode: 'a',
  /** 画布**组节点**（与 `accountGroup` 同前缀、不同物 —— 见上注） */
  groupNode: 'grp',
} as const;

export type IdKind = keyof typeof ID_PREFIX;

/**
 * **全仓唯一 id 工厂**（原 `Pt`，`shared.js:26668-26671` **逐字**）：
 *
 * ```js
 * let Gl = 1;
 * const Pt = e => `${e}_${Date.now().toString(36)}_${(Gl++).toString(36)}`;
 * ```
 * ⇒ 形状 = `<kind>_<base36 时间>_<base36 计数>` —— ⚠️ **两段都是 base36**。
 *
 * ★ **为什么要有它（越权族的根治）**：此前本仓 **9 处**各自拼 id（`makeProjectId` · `makeLibraryId` ·
 *   `makeNodeId` · `preset.ts` · `backendPage.ts` 的租约 · `style.ts` · `sendQueue.ts` · `store.ts` 的 `lg_` · …），
 *   **且 seq 段有的十进制、有的 base36** —— 而源只有**一条**规范 ⇒ 把规范留在**这里**，下游一律委托。
 *
 * ⚠️ `seq` **可省**：源里 `grp_<base36>`（`31938`，账号分组）与 `acc_<base36>`（历史遗留）**没有 seq 段**
 *   ⇒ 省略时输出 `<kind>_<base36 时间>`（逐字对源，**不强行补一段**）。
 */
export function makeId(kind: IdKind, now: number, seq?: number): string {
  const base = `${ID_PREFIX[kind]}_${now.toString(36)}`;
  return seq === undefined ? base : `${base}_${seq.toString(36)}`;
}

/**
 * 生成工程 id（原 `Pt('p')` = `p_<base36>_<base36>`）
 * @param now 时间戳（ms）
 * @param seq 同一毫秒内的自增计数（从 1 起）
 */
export function makeProjectId(now: number, seq: number): string {
  return makeId('project', now, seq);
}

/**
 * 节点 id 前缀（原 `Pt` 的各前缀）—— ★ **2026-10-12 起由 `ID_PREFIX` 派生**（只此一份真相）
 *
 * ⚠️ 保留本常量是为了老的引用面（`NodeIdKind` 与 `makeNodeId` 的键名按**节点类型**命名 ——
 *   它们与 `ID_PREFIX` 的节点类键**同名**，因为源就是这么叫的）。
 * ⚠️ `account` / `group` 两个键在这里指**节点**（`a_`/`grp_`），与 `ID_PREFIX` 里的
 *    `account`（账号记录 `acc_`）/ `accountGroup` 不是一回事 —— 故此处显式映射。
 */
export const NODE_ID_PREFIX = {
  text: `${ID_PREFIX.text}_`,
  material: `${ID_PREFIX.material}_`,
  video: `${ID_PREFIX.video}_`,
  genvideo: `${ID_PREFIX.genvideo}_`,
  imggen: `${ID_PREFIX.imggen}_`,
  account: `${ID_PREFIX.accountNode}_`,
  /** 前缀取自源版 `Pt('dl')`（原注释：漏了它 ⇒ `makeNodeId('download', …)` 编译不过） */
  download: `${ID_PREFIX.download}_`,
  group: `${ID_PREFIX.groupNode}_`,
} as const;

export type NodeIdKind = keyof typeof NODE_ID_PREFIX;

/**
 * 生成节点 id（原 `Pt(prefix)`）
 * @param kind 节点类别
 * @param now 时间戳（ms）
 * @param seq 自增计数
 */
export function makeNodeId(kind: NodeIdKind, now: number, seq: number): string {
  // ★ 委托唯一工厂（键名 → `ID_PREFIX` 的节点类键；`account`/`group` 是**节点**侧的名字）
  const key: IdKind = kind === 'account' ? 'accountNode' : kind === 'group' ? 'groupNode' : kind;
  return makeId(key, now, seq);
}

/**
 * 生成**素材库条目** id（原 `Pt('lib')`）
 *
 * ⚠️ **2026-10-11 收口（判据 C1）**：此前只有 `ui/panels/LibraryPanel.tsx` 里内联过
 *   `` `lib_${Date.now().toString(36)}_${i}` ``；`canvas.addMaterialsBatch` 是第 **2** 处
 *   ⇒ 提到这里（与 `makeNodeId` 同法）。
 * ⚠️ **2026-10-12**：再收一层 —— 改委托 `makeId('library', …)`（前缀由 `ID_PREFIX` 取契约常量）。
 */
export function makeLibraryId(now: number, seq: number): string {
  return makeId('library', now, seq);
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
 * 重命名后**要不要**重新激活存储目录（原 `renameProject` 30075 的 `n === t().activeId`）
 *
 * ⚠️ 源**只对当前工程**重新激活（工程名参与磁盘目录名与「已知路径清单」，改名后要同步）。
 */
export function shouldReactivateOnRename(projectId: string, activeId: string | null): boolean {
  return activeId === projectId;
}

/**
 * 删除某工程后新的 `activeId`（原 `deleteProject` 30120 / 30123）
 *
 * ⚠️ 源：删的是**当前**工程 ⇒ `null`（**回启动页**），**不是**切到列表里的下一个。
 */
export function activeIdAfterDelete(activeId: string | null, deletedId: string): string | null {
  return activeId === deletedId ? null : activeId;
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
  existing: readonly Preset[],
  incoming: unknown,
): Preset[] {
  const items = asArray<unknown>(incoming);
  if (items.length === 0) return [];
  const seen = new Set(existing.map((p) => p.id));
  const added: Preset[] = [];
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const p = item as Partial<Preset>;
    if (!p.id || typeof p.id !== 'string' || seen.has(p.id)) continue;
    seen.add(p.id);
    added.push(item as Preset);
  }
  return added;
}

/** 触碰 `updatedAt`（任何数据变更都该调） */
export function touchProject(project: Project, now: number): Project {
  return { ...project, updatedAt: now };
}

/**
 * 启动页历史列表的**展示顺序**：按 `updatedAt` **倒序**（原 `_Component47.jsx:25-27` 逐字：
 * `[...e].sort((m, w) => w.updatedAt - m.updatedAt)`）
 *
 * ⚠️ 源的 `.sort` 是**就地在临时数组上**做的（`[...e]`）⇒ 本函数同样**返回新数组**，不动入参。
 * ⚠️ 只用于**展示**：store 里的 `projects` 顺序（插入序）不动 —— 否则每次落盘都会重排。
 */
export function orderProjectsByUpdatedAt(projects: readonly Project[]): Project[] {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt);
}
