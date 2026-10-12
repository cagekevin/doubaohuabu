/**
 * 资源库条目的**改名 / 换图**（**纯函数**，★ 必测）
 *
 * 原 `renameLibrary` shared.js:27515-27548 · `replaceLibrary` shared.js:27755-27806
 *
 * ★ **它们与「更换素材」（`materialReplace.ts`）是三件事**（2026-10-12 厘清，别再混）：
 *   | 名字 | 改什么 |
 *   |---|---|---|
 *   | 素材重命名（`planLibraryRename`） | 库条目自身的**名字** ＋ 同步所有同源素材节点的 `name/label` |
 *   | 替换素材（`planLibraryReplace`） | 库条目自身的**图** ＋ 同步所有引用节点的 `dataUrl` |
 *   | 更换素材（`materialReplace.ts`） | **换一个节点绑到哪张图**（+ 文本引用改指） |
 *
 * ⚠️ 类型**复用源头**（不再各写一份）：节点形状用 `materialRename.MaterialNodeLike`、
 *   库条目形状用 `stable/model` 的 `LibraryItem`（真源）。
 * ⚠️ 两个函数都**不查环、不建边**；撤销 key 由调用方给（源都是 `'library'`）。
 */

import type { LibraryItem } from '@/stable/model/project';
import type { MaterialNodeLike } from './materialRename';

/**
 * 资源库的**展示顺序**（原 `RT.jsx:29-37` 的 `useMemo`）
 *
 * 源逐行：`const _ = e.filter(J => J.favorite)` ＋ `const H = e.filter(J => !J.favorite)`
 *   ⇒ `[..._, ...H]` —— **收藏在前**，两组**各自保持原序**（`Array.filter` 稳定）。
 * ⚠️ 只影响**渲染顺序**，不改 `library` 数组本身（源也没写回 store）。
 */
export function sortLibrary(items: readonly LibraryItem[]): LibraryItem[] {
  return [...(items ?? []).filter((it) => it.favorite), ...(items ?? []).filter((it) => !it.favorite)];
}

/**
 * 画布上引用该库条目的**素材节点**数（原 `getLibraryRefCount`，`shared.js:27733-27754`）
 *
 * 源逐行：库里找不到该 id ⇒ `0`；否则取条目的 `dataUrl`，遍历节点：
 *   `type === 'material'` 且 `data` 存在 ⇒ `data.libId === libId` 记一次（`continue`）；
 *   否则 `item.dataUrl` 非空且 `data.dataUrl === item.dataUrl` 也记一次。
 *
 * ⚠️ **只数 `material` 节点**（视频 / 生成节点不算）—— 与 `materialNode.materialLibId`
 *   （那条还认 `poster`、且不限节点类型）**不是同一条判据**，各自逐字对各自的源，**不合并**。
 * ⚠️ 用途：删除库条目前的确认（原 `RT.jsx:322-326`）—— 有引用时才拦一下。
 */
export function countLibRefs(
  library: readonly LibraryItem[],
  nodes: readonly MaterialNodeLike[],
  libId: string,
): number {
  const hit = (library ?? []).find((l) => l.id === libId);
  if (!hit) return 0;
  const url = hit.dataUrl;
  let n = 0;
  for (const node of nodes ?? []) {
    if (!node || node.type !== 'material' || !node.data) continue;
    if (node.data.libId === libId) {
      n += 1;
      continue;
    }
    if (url && node.data.dataUrl === url) n += 1;
  }
  return n;
}

/** 改名规划的结果 */
export interface LibraryRenamePlan {
  /** 改名后的资源库（未命中 ⇒ **同一引用**） */
  library: LibraryItem[];
  /** 改名后的全部节点（只动同源素材节点的 `name/label`） */
  nodes: MaterialNodeLike[];
  /** 被改名的库条目 id（找不到 ⇒ `null`） */
  libId: string | null;
}

/** 换图规划的结果 */
export interface LibraryReplacePlan {
  /** 换图后的资源库（未命中 ⇒ **同一引用**） */
  library: LibraryItem[];
  /** 换图后的全部节点（引用该图的都换 `dataUrl`） */
  nodes: MaterialNodeLike[];
  /** 外置后的新图地址（调用方原样写回库与节点） */
  storedUrl: string;
  /** 实际被换图的节点数（源返回 `replaced`，供调用方提示） */
  replaced: number;
}

/**
 * **同源素材节点**判据（原 `renameLibrary` 27530 / `replaceLibrary` 27783 的**同一行**）
 *
 * `data.libId === libId` **或** `data.dataUrl === 旧图地址`（两者是**或**关系，逐字对源）。
 * ⚠️ 与 `materialRename.ts` 的「同源」判据**不是同一份**（那边还含"两边都没 libId"分支）——
 *    源里就是两段独立实现，**不合并**（判据：各自逐字对各自的源）。
 */
function isSameSourceNode(node: MaterialNodeLike, libId: string, oldDataUrl: string): boolean {
  if (node.type !== 'material' || !node.data) return false;
  const d = node.data;
  const nodeLibId = typeof d.libId === 'string' ? d.libId : '';
  const nodeUrl = typeof d.dataUrl === 'string' ? d.dataUrl : '';
  // 源 `o.data.libId && o.data.libId === n || o.data.dataUrl === s.dataUrl`（`&&` 高于 `||`）
  return (!!nodeLibId && nodeLibId === libId) || nodeUrl === oldDataUrl;
}

/**
 * 规划一次**库条目改名**（原 `renameLibrary(n, r)` 27515-27548）
 *
 * 源逐行：`commit('library')` → 找条目 → **条目改名** ＋ **所有同源素材节点的
 * `data.name`/`data.label` 一起改**（否则"同一个素材两个名字"）。
 * ⚠️ **找不到条目 ⇒ 什么都不做**（源 `if (s)` 守住的）；**空名也照写**（源不过滤——
 *    输入框那侧的兜底「未命名」在调用方，原 `RT.jsx:248`）。
 * @returns `null` = 库里没有这个 id ⇒ 调用方**不 commit**
 */
export function planLibraryRename(input: {
  library: readonly LibraryItem[];
  nodes: readonly MaterialNodeLike[];
  libId: string;
  name: string;
}): LibraryRenamePlan | null {
  const { library, nodes, libId, name } = input;
  const hit = (library ?? []).find((l) => l.id === libId);
  if (!hit) return null;

  const nextLibrary = (library ?? []).map((l) => (l.id === libId ? { ...l, name } : l));
  // 同源判据用**条目自己的** dataUrl（源 `s.dataUrl`）
  const nextNodes = (nodes ?? []).map((n) =>
    isSameSourceNode(n, libId, hit.dataUrl) ? { ...n, data: { ...n.data, name, label: name } } : n,
  );
  return { library: nextLibrary, nodes: nextNodes, libId };
}

/**
 * 规划一次**库条目换图**（原 `replaceLibrary(n, r)` 27755-27806）
 *
 * 源逐行：守卫（条目在 + 新图有 `dataUrl`）→ 记**旧图地址** `o` → 新图**外置** `Tn(r.dataUrl)`
 * → `commit('library')` → 库条目换 `dataUrl`（`w/h` 用 `r.w || c.w` / `r.h || c.h`）
 * → **所有同源素材节点换 `dataUrl`** → 数一下换了几处（`replaced`）。
 *
 * ⚠️ **外置由调用方做**（源 `Tn` 在 action 里跑，但它是不纯的 IPC）—— 本函数吃
 *    `storedUrl`（调用方外置后的结果）；外置失败 ⇒ 调用方直接返回，不走本函数。
 * ⚠️ **不改 `name`/`libId`/`natW/natH`**（源只动 `dataUrl` 与库条目的 `w/h`）。
 * @returns `null` = 守卫没过（条目不在 / 新图无地址）⇒ 调用方**不 commit**
 */
export function planLibraryReplace(input: {
  library: readonly LibraryItem[];
  nodes: readonly MaterialNodeLike[];
  libId: string;
  /** 新图的**外置后**地址（调用方已过 `persistImage`） */
  storedUrl: string;
  /** 新图实测宽高（可空 ⇒ 保留条目原值，源 `r.w || c.w`） */
  w?: number;
  h?: number;
}): LibraryReplacePlan | null {
  const { library, nodes, libId, storedUrl, w, h } = input;
  const hit = (library ?? []).find((l) => l.id === libId);
  if (!hit || !storedUrl) return null;

  const oldDataUrl = hit.dataUrl;
  let replaced = 0;
  const nextNodes = (nodes ?? []).map((n) => {
    if (!isSameSourceNode(n, libId, oldDataUrl)) return n;
    replaced++;
    return { ...n, data: { ...n.data, dataUrl: storedUrl } };
  });
  const nextLibrary = (library ?? []).map((l) =>
    l.id === libId ? { ...l, dataUrl: storedUrl, w: w || l.w, h: h || l.h } : l,
  );
  return { library: nextLibrary, nodes: nextNodes, storedUrl, replaced };
}
