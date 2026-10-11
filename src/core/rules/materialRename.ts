/**
 * 素材节点改名（**纯函数**，★ 必测）—— 原 `renameMaterialNode` shared.js:27549-27625
 *
 * ★★ **它的要点不是"改一个字段"，而是"改一处、所有同源处一起改"**：
 *    一个素材可能同时出现在 ① 资源库 ② 画布上的多个素材节点（同一个 `libId` 或同一个 `dataUrl`）
 *    ⇒ 只改被双击的那个节点，会让"同一个素材有两个名字"。源版把这三处**一起**改。
 *
 * 规则（**逐行回照**）：
 *   ① 节点必须存在且有 `data`；`name.trim()` 为空 ⇒ **整件事不做**（返回 `null`，不写空名）
 *   ② 解析 `libId`：先用节点自己的 `data.libId`；没有就**按 `dataUrl` 反查资源库**
 *   ③ **同源节点**的判据：`id === nodeId` **或** (`libId` 相等) **或** (两边都没有 `libId` 且 `dataUrl` 相等)
 *      ⇒ 这些节点的 `data` 都写 `{name, label, libId}`（`libId` 写**解析出来的那个**，可能新补上）
 *   ④ 资源库里 `id === libId` 的那条也改成新名字
 *   ⑤ `commit` 的 key 是 **`rename-${nodeId}`**（原 27570）—— 按节点分区，故"改 A 再改 B"是两步撤销
 *
 * ⚠️ **明确跳过的一支（如实标注）**：源版还会同步 `lovartGalleries` 里 `dataUrl` 相同的条目
 *    （27571-27590）。本工程 **`lovartGalleries` 尚未落地**（见 `state/slices/global.ts` 的待办）
 *    ⇒ 这一支**不实现**，也不假装。等该字段落地时**必须回来补**。
 */

/** 本模块只读素材节点的这几个字段 */
export interface MaterialNodeLike {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
}

/** 资源库条目的最小形状 */
export interface RenamableLibraryItem {
  id: string;
  name: string;
  dataUrl: string;
}

import type { LovartGalleries } from './lovartGallery';

export interface MaterialRenamePlan {
  /** 改名后的**全部**节点（未命中的原样返回同一引用） */
  nodes: MaterialNodeLike[];
  /** 改名后的资源库（未命中 ⇒ **同一引用**） */
  library: RenamableLibraryItem[];
  /** 解析出来的 `libId`（节点自己没带、由 `dataUrl` 反查得到时是新补的） */
  libId: string;
  /** 实际被改名的节点 id（含被双击的那个）—— 便于调用方做事后提示/测试 */
  renamedNodeIds: string[];
  /**
   * ★ 同步过的 Lovart 画廊（原 27571-27590）—— **只有真的改了才出现**（源版也是"变了才带上"）
   * ⚠️ 判据是**节点的 `dataUrl` 与条目的 `dataUrl` 字面相等**（源版如此 —— 不做归一比较）。
   */
  galleries?: LovartGalleries;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 规划一次素材改名（原 `renameMaterialNode`）
 *
 * @returns `null` = **不做任何事**（节点不存在 / 没有 data / 新名字 trim 后为空）
 */
export function planMaterialRename(input: {
  nodes: readonly MaterialNodeLike[];
  library: readonly RenamableLibraryItem[];
  nodeId: string;
  name: string;
  /**
   * 可选的 Lovart 画廊（给了就**同步改同名条目** —— 原 27571-27604）
   * ⚠️ 不给 ⇒ 与从前一样（这条支路是**后接上**的，不改变原有调用方的行为）
   */
  galleries?: LovartGalleries;
}): MaterialRenamePlan | null {
  const target = input.nodes.find((n) => n.id === input.nodeId);
  if (!target || !target.data) return null;

  const name = (input.name || '').trim();
  // ① 空名 ⇒ 整件事不做（源版 `if (!o) return`）
  if (!name) return null;

  const dataUrl = str(target.data.dataUrl);
  let libId = str(target.data.libId);
  if (!libId && dataUrl) {
    // ② 按 dataUrl 反查资源库
    const hit = input.library.find((l) => l.dataUrl && l.dataUrl === dataUrl);
    if (hit) libId = hit.id;
  }

  const renamedNodeIds: string[] = [];
  const nodes = input.nodes.map((n) => {
    if (n.type !== 'material' || !n.data) return n;
    // ③ 同源判据（逐字对齐源版 27609）
    const sameLib = !!libId && str(n.data.libId) === libId;
    const sameUrl = !str(n.data.libId) && !!dataUrl && str(n.data.dataUrl) === dataUrl;
    if (n.id !== input.nodeId && !sameLib && !sameUrl) return n;

    renamedNodeIds.push(n.id);
    const nextLibId = str(n.data.libId) || libId || undefined;
    return {
      ...n,
      data: {
        ...n.data,
        name,
        label: name,
        // ⚠️ 源版写 `libId: h`，而 `h = f.data.libId || l || undefined`
        //   ⇒ 都没有时是 `undefined`（**显式写 undefined**，不是删键）
        libId: nextLibId,
      },
    };
  });

  // ④ 资源库同名项
  const libraryHit = !!libId && input.library.some((l) => l.id === libId);
  const library = libraryHit
    ? input.library.map((l) => (l.id === libId ? { ...l, name } : l))
    : // ⚠️ 未命中 ⇒ **返回同一引用**（与 `renumberAccounts` 同法：让调用方能用 `===` 判"没变"）
      (input.library as RenamableLibraryItem[]);

  // ★ 画廊同步（原 27571-27590）：**逐账号逐条**比 `dataUrl`，命中就改名
  let galleries: LovartGalleries | undefined;
  if (input.galleries) {
    let changed = false;
    const next: LovartGalleries = {};
    for (const key of Object.keys(input.galleries)) {
      const list = input.galleries[key] ?? [];
      const mapped = list.map((item) => {
        if (dataUrl && item.dataUrl === dataUrl) {
          changed = true;
          return { ...item, name };
        }
        return item;
      });
      next[key] = mapped;
    }
    // ⚠️ 没改 ⇒ **不带这个字段**（源版 `...(u ? {lovartGalleries: d} : {})`）
    if (changed) galleries = next;
  }

  return {
    nodes,
    library,
    libId,
    renamedNodeIds,
    ...(galleries === undefined ? {} : { galleries }),
  };
}
