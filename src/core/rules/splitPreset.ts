/**
 * 「拆分并套用节点预设」（原 `splitApplyPreset`，`shared.js:28646-28905`）—— **纯规则**
 *
 * ★ **它补的是「节点预设」这条链的读取端**（`TD-16-…`，2026-10-12）：写入端
 *   （`makeGraphPreset` ＋ `global.addNodePreset` ＋ 右键项 5）已落；此前 `presets` 里
 *   `kind:'graph'` 的记录**没有任何地方读** —— 拆分弹窗只会 `splitDirect`。
 *
 * ## 源算法（逐行抄录，常量即源的 `k`/`N`/`C`/`O`/`R`）
 *
 * 1. 校验：源节点存在 · 预设存在且 `kind === 'graph'` · 预设 `nodes` 非空
 * 2. 拆分源节点正文（`Ty`/`$y` ⇒ 本仓 `splitByKeywords`/`splitAuto`），结果 **< 2 段 ⇒ 失败**
 * 3. 找预设的「**入口节点**」：**第一个入度为 0** 的；都没有 ⇒ 首节点
 * 4. 拆分结果实例化成 N 个文本框（同 `x`，`y` 按 `i × (400 + 80)` 往下排，600×400）
 * 5. 预设的**其余节点**按「**份数 = 拆分段数**」各复制一份：
 *    横向压到 **30%**（`x = 首段.x + 600 + 30 + (旧x − 入口.x) × 0.3`）、纵向同高（`y = 段.y + (旧y − 入口.y)`）
 * 6. **引用重写**（仅 `text` 节点）：`@[旧id|名]` ⇒ `@[新id|名]`；`materialIds` 逐项映射；
 *    并把 `height` **删掉**（源 `delete he.height`）
 * 7. 边：份内边（两端都映射到）· 入口的**出边** ⇒ 接到**该份**的首个拆分节点 ·
 *    指向入口的**入边** ⇒ 接到**第一份**的首个拆分节点
 *
 * ## 与源的两处如实差异（留痕）
 *
 * | 差异 | 源 | 本仓 | 为什么 |
 * | --- | --- | --- | --- |
 * | 其余节点的 id 前缀 | `se.type === 'material' ? 'm' : se.type === 'text' ? 't' : 'a'`（**三目**，其它类型一律 `a`） | **委托 canonical** `nextNodeId(type)`（= `core/rules/project.makeNodeId`，前缀表 `NODE_ID_PREFIX`） | 源那三目对 `video`/`genvideo`/… 会给出**错误前缀**；id 前缀是**已收口**的 canonical（判据 C1：不自造第二份映射） |
 * | 拆分节点的 `data` | 显式写 `{label, text, aspectRatio:'16:9', duration:7, linkOrder:[]}` | 由 `newTextData(part)` 注入 —— 与 `splitDirect`（本仓 `canvas.splitTextNode`）**同一份**构造 | 源自己两条拆分路径的 `data` 字面量就不一致；这里是**一个真相**，避免"同样拆出来的节点长得不一样" |
 *
 * ## ⚠️ 一处**源的行为**（照抄 + 留痕，不擅自改）
 *
 * 引用重写的映射表**只含 `others`（除入口之外的节点）** —— 入口节点本身**没有**新 id
 * （它被 N 个拆分节点取代，语义上不对应某一个）。
 * ⇒ 预设里若有节点引用**入口节点**的 id，实例化后那个引用会**悬空**（源 `J[se.id] = q` 同样不含入口）。
 * 本仓**照抄**该行为（`splitPreset.test.ts` 有一条断言钉住它），并在此留痕 ——
 * 要不要补（例如把入口引用接到第一个拆分节点）属**新语义**，不该由转写顺手决定。
 *
 * ⚠️ 原则 1：本文件**不写 store**；它返回一份**计划**（要新增的 nodes/edges ＋ 要 `fitView` 的 id），
 *   由 `state/slices/canvas` 落库 —— 与 `core/rules/clipboard.planPaste` 同法。
 * ⚠️ 原则 4：时间由调用方注入（`now`）；id 序号也由调用方注入（`nextNodeId`），故本文件**无副作用**。
 */

import { SPLIT_NODE_GAP, SPLIT_NODE_HEIGHT, SPLIT_NODE_WIDTH } from '@/constants';
import type { CanvasNode } from '@/stable/model/node';
import type { CanvasEdge, GraphPreset } from '@/stable/model/project';
import { createRefChipRe } from './refs';
import { splitAuto, splitByKeywords, type SplitPart } from './splitText';

/** 失败原因 —— `SplitFailReason`（`splitText.ts`）的**超集**：多出预设侧那三档（源 `setSplitFeedback` 同款） */
export type SplitPresetFailReason =
  | 'node-missing'
  | 'preset-missing'
  | 'preset-empty'
  | 'no-keyword'
  | 'not-splittable';

export interface SplitPresetPlan {
  /** 要**新增**的节点（拆分节点 ＋ 预设其余节点的各份）—— 调用方负责把它们接到既有数组尾部 */
  nodes: CanvasNode[];
  /** 要**新增**的边 */
  edges: CanvasEdge[];
  /** 拆分出的片段数（源 `count`，给 toast 用） */
  count: number;
  /** 拆分出的**新文本节点 id**（源 `E`）—— 宿主要 `fitView` 的就是它们 */
  newIds: string[];
  /** `fitView` 的**全部**新节点 id（源 `[...E, ...I.map(id)]`） */
  focusIds: string[];
}

/** 预设「入口节点」的横向偏移（源 `O = 30`） */
const PRESET_ENTRY_OFFSET = 30;
/** 其余节点横向**压缩系数**（源 `R = 0.3` —— 不压缩会把整份预设拉得极宽） */
const PRESET_SHRINK_X = 0.3;

// ⚠️ **2026-10-12 越权修正**：此处原先**自造**了一份 `REF_RE = /@\[([^\]|]+)\|([^\]]+)\]/g`
//    —— 而 canonical（`core/rules/refs.createRefChipRe`，原 `U0`）早就有同款 ⇒ 改委托它。
//    （那时源头只给了"严格＋全文"一种形态，下游于是各自造；现在源头已补齐四种形态。）

/**
 * 造「拆分并套用预设」的计划
 *
 * @param input.source    源节点（要拆的那个文本框）
 * @param input.preset    选中的节点预设（**必须** `kind === 'graph'`）
 * @param input.keywords  自定义关键词（空数组 ⇒ 走 `splitAuto`，与 `splitDirect` 同规则）
 * @param input.newTextData 一个拆分片段的 `data`（**注入** —— 与 `canvas.splitTextNode` **同一份**构造）
 * @param input.nextNodeId   新节点 id（**注入** —— 源 `Pt(type)`；实现 = `makeNodeId(type, now, ++seq)`）
 * @param input.makeEdge     建边工厂（**注入** —— 源 `Mr({source,target})`；可返回 `null`）
 */
export function planSplitWithPreset(input: {
  source: CanvasNode;
  preset: GraphPreset | undefined;
  keywords: readonly string[];
  newTextData: (part: SplitPart) => CanvasNode['data'];
  nextNodeId: (type: CanvasNode['type']) => string;
  makeEdge: (e: { source: string; target: string }) => CanvasEdge | null;
}): { ok: true; plan: SplitPresetPlan } | { ok: false; reason: SplitPresetFailReason } {
  const { source, preset } = input;

  // ①② 校验（源 28652-28687）
  if (!preset || preset.kind !== 'graph') return { ok: false, reason: 'preset-missing' };
  const entryFallback = preset.nodes[0];
  if (!entryFallback) return { ok: false, reason: 'preset-empty' };

  const body = typeof source.data.text === 'string' ? source.data.text : '';
  const hasKeywords = input.keywords.length > 0;
  const parts = hasKeywords ? splitByKeywords(body, input.keywords) : splitAuto(body);
  if (parts.length < 2) {
    return { ok: false, reason: hasKeywords ? 'no-keyword' : 'not-splittable' };
  }

  // ③ 入口节点：**第一个入度为 0** 的（源 28703-28721）；没有 ⇒ 首节点
  const indegree = new Map<string, number>();
  for (const n of preset.nodes) indegree.set(n.id, 0);
  for (const e of preset.edges) {
    const cur = indegree.get(e.target);
    if (cur !== undefined) indegree.set(e.target, cur + 1);
  }
  const entry = preset.nodes.find((n) => (indegree.get(n.id) ?? 0) === 0) ?? entryFallback;
  // ⚠️ 源 `v = c.filter(M => M.id !== m)` 过滤的是**整个** `c` —— 别写成"除首元素之外的其余"
  //   （那样当入口不是首元素时会**丢掉首元素那一份**）
  const others = preset.nodes.filter((n) => n.id !== entry.id);
  const innerEdges = preset.edges.filter((e) => e.source !== entry.id && e.target !== entry.id);
  const entryOutTargets = preset.edges.filter((e) => e.source === entry.id).map((e) => e.target);
  const entryInEdges = preset.edges.filter((e) => e.target === entry.id);

  // ④ 拆分结果 → 文本节点（源 28737-28769：`k`/`N`/`C` 即本仓 SPLIT_NODE_*）
  const base = source.position;
  const splitNodes: CanvasNode[] = [];
  const newIds: string[] = [];
  for (const [i, part] of parts.entries()) {
    const id = input.nextNodeId('text');
    newIds.push(id);
    splitNodes.push({
      id,
      type: 'text',
      position: { x: base.x, y: base.y + i * (SPLIT_NODE_HEIGHT + SPLIT_NODE_GAP) },
      width: SPLIT_NODE_WIDTH,
      style: { width: SPLIT_NODE_WIDTH, height: SPLIT_NODE_HEIGHT },
      selected: true,
      data: input.newTextData(part),
    } as CanvasNode);
  }

  // ⑤⑥⑦ 其余节点/边：**逐份**复制（源 28770-28896）
  const addedNodes: CanvasNode[] = [];
  const addedEdges: CanvasEdge[] = [];
  /** 每份的「旧 id → 新 id」映射（源 `z`） */
  const maps: Record<string, string>[] = [];

  for (const splitNode of splitNodes) {
    const startX = splitNode.position.x + SPLIT_NODE_WIDTH + PRESET_ENTRY_OFFSET;
    const idMap: Record<string, string> = {};
    maps.push(idMap);

    for (const n of others) {
      const newId = input.nextNodeId(n.type);
      idMap[n.id] = newId;
      let node = {
        ...n,
        id: newId,
        selected: false,
        position: {
          x: startX + (n.position.x - entry.position.x) * PRESET_SHRINK_X,
          y: splitNode.position.y + (n.position.y - entry.position.y),
        },
      } as CanvasNode;

      // ⑥ 引用重写（源 28800-28833，**只处理 `text`**）
      if (node.type === 'text') {
        const data = node.data as { text?: string; materialIds?: string[] };
        const patch: Record<string, unknown> = {};
        if (data.text) {
          const rewritten = data.text.replace(createRefChipRe(), (whole, oldId: string, name: string) => {
            const mapped = idMap[oldId];
            return mapped ? `@[${mapped}|${name}]` : whole;
          });
          if (rewritten !== data.text) patch.text = rewritten;
        }
        if (Array.isArray(data.materialIds)) {
          const before = data.materialIds;
          const after = before.map((m) => idMap[m] ?? m);
          if (after.some((v, idx) => v !== before[idx])) patch.materialIds = after;
        }
        if (Object.keys(patch).length > 0) {
          node = { ...node, data: { ...node.data, ...patch } };
        }
        // 源 `delete he.height` —— 文本节点的高度交给样式/内容，不写死在节点上
        const { height: _drop, ...rest } = node;
        node = rest as CanvasNode;
      }
      addedNodes.push(node);
    }

    // 份内边
    for (const e of innerEdges) {
      const s = idMap[e.source];
      const t = idMap[e.target];
      if (!s || !t) continue;
      const made = input.makeEdge({ source: s, target: t });
      if (made) addedEdges.push(made);
    }
    // 入口的**出边** ⇒ 接到**该份**的首个拆分节点（源 28858-28868）
    for (const target of entryOutTargets) {
      const mapped = idMap[target];
      if (!mapped) continue;
      const made = input.makeEdge({ source: splitNode.id, target: mapped });
      if (made) addedEdges.push(made);
    }
  }

  // 指向入口的**入边** ⇒ 接到**第一份**的首个拆分节点（源 28870-28881）
  const firstMap = maps[0] ?? {};
  const firstSplitId = newIds[0];
  if (firstSplitId) {
    for (const e of entryInEdges) {
      const mapped = firstMap[e.source];
      if (!mapped) continue;
      const made = input.makeEdge({ source: mapped, target: firstSplitId });
      if (made) addedEdges.push(made);
    }
  }

  const nodes = [...splitNodes, ...addedNodes];
  return {
    ok: true,
    plan: {
      nodes,
      edges: addedEdges,
      count: parts.length,
      newIds,
      focusIds: nodes.map((n) => n.id),
    },
  };
}
