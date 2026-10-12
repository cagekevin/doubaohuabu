/**
 * 更换素材节点的图（**纯函数**，★ 必测）—— 原 `replaceMaterialWithLib` shared.js:27682-27724
 *
 * ★ **它和 `planMaterialRename` 是两件事**（都改素材节点，但改的东西不同）：
 *   · `planMaterialRename` 改的是**名字**（一处改、同源多处一起改）
 *   · 本模块改的是**图**（换一张图，并把指向旧图的**文本引用**改指新图）
 *
 * 规则（**逐行回照源 27682-27724**）：
 *   ① 守卫：节点必须存在、`type === 'material'`、有 `data`；条目必须存在且有 `dataUrl`
 *      ⇒ 任一不满足 ⇒ `{ok:false, reason:'bad-input'}`（**什么都不做**）
 *   ② `prevLibId = Ms(node, library)`（原 `Ms` = 本仓 `resolveMaterialLibId` —— 判据 C1，不写第二份）
 *   ③ 新名 = `item.name || node.data.name || node.data.label || '素材'`（四级回落，逐字）
 *   ④ 引用改指（原 `Gy` = 本仓 `replaceRefId`）：`@[旧id|旧名]` → `@[新id|新名]`、
 *      `materialIds` 里的旧 id → 新 id；**一处都没改 ⇒ 返回 `null`** ⇒ 用原节点数组（源 `c || l`）
 *   ⑤ 目标节点换 `dataUrl/libId/name/label/natW/natH`
 *      ⚠️ `natW/natH` 是 `item.w || 0` / `item.h || 0` —— **不保留旧值**（源如此；从文件选图时
 *         源在 `DT.jsx:24-25` 写死 `400/300`，因为 `importFiles` 不返回尺寸）
 *      ⚠️ `libId` 直接写 `item.id` —— 从文件选来的条目**没有 id** ⇒ 该键为 `undefined`（源同样）
 *
 * ⚠️ **不改资源库**：换的是"节点绑到哪张图"，库条目本身不动（源也是分开的 ——
 *    库条目换图是另一条链 `replaceLibrary`，见 `docs/13` §2.2）。
 * ⚠️ **撤销 key 由调用方给**（原 `commit(\`replace-mat-${n}\`)` —— 按节点分区）。
 * ⚠️ 返回走 `core/model/result.ts` 的 `Result` 契约：`reason: 'bad-input'` 已登记进
 *    `SEND_FAIL_KINDS`（`constants/failure.ts`，2026-10-12 随本模块补 —— 源里约 60 个
 *    `reason:` 字面量，本仓只生产到"刚好够"，不预支没有生产者的 kind）。
 */

import { err, ok, type Result } from '@/core/model/result';
import { resolveMaterialLibId, type MaterialNodeLike, type RenamableLibraryItem } from './materialRename';
import { replaceRefId } from './refs';

/** 待换上的图（库条目，或「从文件选择」的结果） */
export interface MaterialReplaceItem {
  /** 库条目 id（**文件挑选来的没有它** ⇒ `libId` 写 `undefined`，与源一致） */
  id?: string;
  name?: string;
  dataUrl: string;
  w?: number;
  h?: number;
}

export interface MaterialReplacePlan {
  /** 改写后的**全部**节点（引用改指 + 目标节点换图；未命中的原样返回） */
  nodes: MaterialNodeLike[];
  /** 解析出来的**旧** libId（供调用方留痕/测试） */
  prevLibId: string;
  /** 新 libId（= `item.id`，可能 `undefined`） */
  nextId: string | undefined;
  /** 实际采用的名字（四级回落的产物） */
  name: string;
}

/**
 * 规划一次「换图」（原 `replaceMaterialWithLib` 的纯半）
 *
 * @returns `{ok:false, reason:'bad-input'}` = 守卫没过 —— 调用方据此**不 commit**
 *   （源的 `commit` 在守卫之后）并给用户提示（源那行**静默**，本仓按原则 6 不静默）。
 */
export function planMaterialReplaceWithLib(input: {
  nodes: readonly MaterialNodeLike[];
  library: readonly RenamableLibraryItem[];
  nodeId: string;
  item: MaterialReplaceItem | null | undefined;
}): Result<MaterialReplacePlan> {
  const { nodes, library, nodeId, item } = input;
  const node = (nodes ?? []).find((n) => n.id === nodeId);
  // ① 守卫（逐字对源 27686）
  if (!node || node.type !== 'material' || !node.data || !item || !item.dataUrl) {
    return err('bad-input', '更换素材：节点不是素材节点或未选择图片');
  }

  // ② 旧 libId（原 `Ms`）
  const prevLibId = resolveMaterialLibId(node, library ?? []);
  // ③ 新名（四级回落，逐字）
  const d = node.data;
  const name =
    item.name || (typeof d.name === 'string' && d.name) || (typeof d.label === 'string' && d.label) || '素材';

  // ④ 引用改指（原 `Gy`）—— `null` = 一处都没改 ⇒ 用原数组
  const nextId = item.id;
  const rewired = replaceRefId(nodes, { prevId: prevLibId, nextId: nextId ?? '', nextName: name }) ?? nodes;

  // ⑤ 目标节点换图
  const out = (rewired as MaterialNodeLike[]).map((n) =>
    n.id === nodeId
      ? {
          ...n,
          data: {
            ...n.data,
            dataUrl: item.dataUrl,
            libId: nextId,
            name,
            label: name,
            natW: item.w || 0,
            natH: item.h || 0,
          },
        }
      : n,
  );

  return ok({ nodes: out, prevLibId, nextId, name });
}
