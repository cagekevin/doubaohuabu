/**
 * 账号节点（`type: 'account'`）的**输入收集**（★ 纯函数，必测）—— 原 `RL` shared.js:40531-40680
 *
 * ★★ **它是什么**：账号节点是**「填表」节点** —— 把**上游**（沿入边可达）的文本框与
 *    `@` 引用素材汇总起来，一次性塞进该账号的对话框（原 `OL.jsx:498-501` 的按钮 `title`：
 *    「同步比例/时长/模型，并把文本框与素材填入所选账号对话框（**不触发发送**）」）。
 *    可选 `autoSend` 会连发送一起做（原 `OL.jsx:348` 的 `autoClicked`）。
 *
 * ★ **为什么要移植它**：`buildAccountNodePayload`（原 `$L`）**只有测试调用、零运行时消费者**，
 *   而 `OL.jsx` 的 `x = RL(state, nodeId)` 正是 `$L` 的**入参来源** —— 少了它，
 *   `$L` 永远拿不到 `{texts, materials, params}`。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 上游闭包 | `40537-40546` | 从本节点沿**入边反向**收集**全部祖先**（不是只有直接前驱） |
 *   | 拓扑排序 | `40547-40587` | Kahn；入度 0 的按**节点在 `nodes` 数组里的下标**排（≈ 视觉顺序）；**有环的残余追加在末尾** |
 *   | 引用编号 | `40591-40599` | 全局递增计数器（**跨所有上游文本共用一个编号空间**） |
 *   | 素材解析 | `40588-40623` | 先查资源库，再查 `material` 节点（形状与 `resolveRefMaterial` 的①②级一致，但**只有这两级**） |
 *   | texts | `40624-40645` | 只取 `text` 节点；每条的正文过 `resolveReferences`（原 `Qc`）；带上该节点的 `aspectRatio`/`duration`/`model` 默认值 |
 *   | materials | `40646-40657` | **来源于上游文本里的 `@` 引用**（不是连线上的素材节点）；按编号排序 |
 *   | params | `40658-40673` | 逐条 texts 取**首个非空**的 `aspectRatio`/`duration`/`model` |
 *   | total | `40678` | `materials.length + texts.length`（**`OL.jsx:302` 用它判「未连接文本框或素材」**） |
 *
 * ⚠️ 与 `collectLinkedTexts`（原 `d3`）**不是一回事**：那个只看**直接入边**、且不含引用素材。
 */

import type { LibraryItem } from '@/stable/model/project';
import { DEFAULT_VIDEO_MODEL, NODE_DEFAULT_RATIO_LABEL } from '@/constants/models';
// ★ 反馈条文案是**用户可见文案** ⇒ 取 SSOT（原则 5）
import { ACCOUNT_NODE_TEXT } from '@/constants/text';
import { parseRefChips, refsToReferenceLabels } from './refs';
import { stripHtml } from '@/lib/text';

/** 上游文本的一条（原 `RL` 的 `y` 元素） */
export interface AccountNodeText {
  id: string;
  /** **原文**（含 `@[id|名]` 标记）—— `$L` 会再解析一次（原 `$L` 的 `n.forEach(d => In(d.rawText))`） */
  rawText: string;
  /** 已把引用解析成 `参考图N` 的正文 */
  text: string;
  aspectRatio: string;
  duration: number;
  model: string;
  /** `refId → 全局编号`（供 `$L` 用） */
  refMap: Record<string, number>;
}

/** 一条被引用到的素材（原 `RL` 的 `b` 元素） */
export interface AccountNodeMaterial {
  id: string;
  label: string;
  dataUrl: string;
  /** 全局编号（1 起）—— 素材列表按它排序 */
  refIndex: number;
}

export interface AccountNodeInputs {
  materials: AccountNodeMaterial[];
  texts: AccountNodeText[];
  /** 各文本的**首个非空**参数（原 40658-40673） */
  params: { aspectRatio: string | null; duration: number | null; model: string | null };
  /** `materials.length + texts.length`（原 40678） */
  total: number;
}

/**
 * 账号节点发送后的**反馈条文案**（原 `OL.jsx:339-359`）—— ★ 纯函数，可测
 *
 * 源逐字：
 * ```js
 * const ce = [];
 * if (x.texts.length)                    ce.push('文本已填');
 * if (ne.imagesAttached != null)         ce.push(`图片 ${ne.imagesAttached}/${ne.imagesTotal ?? x.materials.length}`);
 * const oe = !!t.autoSend && ne.autoClicked;
 * if (oe)                                ce.push('已自动发送');
 * const he = ce.length ? ce.join(' · ') + (oe ? '' : '（仅填入，未发送）') : '已填入（仅填入，未发送）';
 * S({ status: 'ok', msg: he });
 * ```
 *
 * ★ 源 `:340` 还有一档：`precheck && !precheck.pass` ⇒ `status:'err'` + `precheckWarn(issue)`。
 *   ⚠️ 它**可达**（不是死分支）—— `autoSend=false`（只填入）时 `site.send` 照走 `ok` 但带
 *   `precheck.pass=false`（硬闸只设在 `autoSend` 分支，见 `adapters/site/doubao/index.ts:428`）
 *   ⇒ 本函数负责把这一支翻成 `error`。
 * ⚠️ 摘要里的三段与那句 `（仅填入，未发送）` 都是**用户可见文案** ⇒ 取 `ACCOUNT_NODE_TEXT`（原则 5）。
 */
export interface AccountSendFeedbackInput {
  /** 上游文本条数（原 `x.texts.length`） */
  textCount: number;
  /** 参考图回执（原 `ne.imagesAttached`）—— `null`/`undefined` ⇒ **不报这一段** */
  imagesAttached?: number | null;
  /** 图总数（原 `ne.imagesTotal ?? x.materials.length`） */
  imagesTotal: number;
  /** 节点上的自动发送开关（原 `t.autoSend`） */
  autoSend: boolean;
  /** 有没有**真的点到**发送按钮（原 `ne.autoClicked`） */
  autoClicked?: boolean;
  /**
   * ★ **Phase 3a 校验回执**（原 `ne.precheck`）—— 只读 `pass`。
   *    `autoSend=false` 时 `site.send` 照走 `ok` 但带 `pass:false`（见本文件头注）。
   */
  precheck?: { pass: boolean } | null;
  /** 校验明细（原 `ne.precheckIssue`）—— 缺省时回退 `precheckFallback` */
  precheckIssue?: string | null;
}

export function accountSendFeedback(input: AccountSendFeedbackInput): {
  status: 'success' | 'error';
  msg: string;
} {
  const autoSent = input.autoSend && !!input.autoClicked;
  const parts: string[] = [];
  if (input.textCount > 0) parts.push(ACCOUNT_NODE_TEXT.textsFilled);
  if (input.imagesAttached != null) {
    parts.push(ACCOUNT_NODE_TEXT.imagesAttached(input.imagesAttached, input.imagesTotal));
  }
  if (autoSent) parts.push(ACCOUNT_NODE_TEXT.autoSent);
  const msg = parts.length
    ? parts.join(' · ') + (autoSent ? '' : ACCOUNT_NODE_TEXT.filledOnly)
    : ACCOUNT_NODE_TEXT.filledNoText;
  // ★ 原 `OL.jsx:340`：`precheck && !precheck.pass` ⇒ 带告警（明细缺省回退那句兜底文案）
  const issue =
    input.precheck && !input.precheck.pass
      ? input.precheckIssue || ACCOUNT_NODE_TEXT.precheckFallback
      : null;
  return issue
    ? { status: 'error', msg: msg + ACCOUNT_NODE_TEXT.precheckWarn(issue) }
    : { status: 'success', msg };
}

/** 本模块只读节点的这几个字段（保持入参最小） */
interface NodeLike {
  id: string;
  type: string;
  data?: Record<string, unknown> | null;
}

const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * 上游闭包 + 拓扑序（原 `RL` 40537-40587）
 *
 * ⚠️ **闭包是传递的**（沿入边一直往上走），不是只有直接前驱 —— 与 `collectLinkedTexts` 不同。
 * ⚠️ 拓扑序里，**入度为 0 的那批按 `nodes` 数组下标排**（原 40560-40567 的 `u`）——
 *    那是"画布上的视觉顺序"，不是字母序。
 * ⚠️ 有环时：`f.length < a.length` ⇒ 把**没排进去的按原顺序追加**（原 40581-40587）——
 *    **不报错、不丢节点**（有环图的输入仍然全部参与收集）。
 */
export function collectUpstreamOrder(
  nodeId: string,
  nodes: readonly NodeLike[] = [],
  edges: readonly { source: string; target: string }[] = [],
): string[] {
  const seen = new Set<string>();
  const stack = [nodeId];
  while (stack.length) {
    const cur = stack.pop() as string;
    for (const e of edges || []) {
      if (e.target === cur && !seen.has(e.source)) {
        seen.add(e.source);
        stack.push(e.source);
      }
    }
  }
  const all = [...seen];

  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
  const inDegree = new Map(all.map((k) => [k, 0]));
  const next = new Map(all.map((k) => [k, [] as string[]]));
  for (const e of edges || []) {
    if (seen.has(e.source) && seen.has(e.target)) {
      next.get(e.source)?.push(e.target);
      inDegree.set(e.target, (inDegree.get(e.target) ?? 0) + 1);
    }
  }

  const ready = all
    .filter((k) => inDegree.get(k) === 0)
    .sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0));
  const order: string[] = [];
  while (ready.length) {
    const k = ready.shift() as string;
    order.push(k);
    for (const c of (next.get(k) ?? []).slice().sort((a, b) => (indexOf.get(a) ?? 0) - (indexOf.get(b) ?? 0))) {
      inDegree.set(c, (inDegree.get(c) ?? 0) - 1);
      if (inDegree.get(c) === 0) ready.push(c);
    }
  }
  if (order.length < all.length) {
    for (const k of all) if (!order.includes(k)) order.push(k);
  }
  return order;
}

/**
 * 收集账号节点的输入（原 `RL` 40531-40680）
 *
 * @param input.nodes / edges / library 都是只读快照（调用方从 store 取）
 */
export function collectAccountNodeInputs(input: {
  nodeId: string;
  nodes?: readonly NodeLike[];
  edges?: readonly { source: string; target: string }[];
  library?: readonly LibraryItem[];
}): AccountNodeInputs {
  const nodes = input.nodes ?? [];
  const edges = input.edges ?? [];
  const library = input.library ?? [];

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const libById = new Map(library.map((l) => [l.id, l]));

  const order = collectUpstreamOrder(input.nodeId, nodes, edges);

  // 原 40591-40599：**全局**引用编号（跨所有上游文本共用一个计数器）
  const refIndex = new Map<string, number>();
  let seq = 0;
  const assign = (id: string): number => {
    const hit = refIndex.get(id);
    if (hit !== undefined) return hit;
    seq += 1;
    refIndex.set(id, seq);
    return seq;
  };

  // 原 40588-40623：素材解析（**只有**资源库 + `material` 节点两级）
  const resolveMaterial = (id: string): AccountNodeMaterial => {
    const lib = libById.get(id);
    if (lib) return { id, label: lib.name || id, dataUrl: lib.dataUrl || '', refIndex: 0 };
    const n = byId.get(id);
    if (n && n.type === 'material' && n.data) {
      const d = n.data;
      return { id, label: str(d.label) || str(d.name) || id, dataUrl: str(d.dataUrl), refIndex: 0 };
    }
    return { id, label: id, dataUrl: '', refIndex: 0 };
  };

  const texts: AccountNodeText[] = [];
  for (const id of order) {
    const n = byId.get(id);
    const d = n?.data;
    if (!n || !d || n.type !== 'text') continue;

    const rawText = str(d.text);
    // 原 40628-40632：逐条把引用登记进**全局**编号表
    const parsed = parseRefChips(stripHtml(rawText));
    const refMap: Record<string, number> = {};
    for (const r of parsed.refs) refMap[r.id] = assign(r.id);
    const labelled = refsToReferenceLabels(parsed.text, parsed.refs);

    texts.push({
      id,
      rawText,
      text: labelled.body.trim(),
      /*
       * ⚠️ **2026-10-12 有意偏离源（只改"默认值"这一轴）**：源 `shared.js:40639-40641` 是
       *   `aspectRatio || '16:9'` / `duration ?? 7` / `model || 'seedance-2.0-mini'`（**逐字**）。
       *   其中 `'16:9'` 与 `'seedance-2.0-mini'` 都是**同一槽位的默认值**
       *   （默认比例 / 默认模型）⇒ 吃 SSOT，不再于此处复述第二份（改一处另一处会静默漂）。
       *   `7` 保留字面量：它是**文本节点默认时长**那个槽（同 `NODE_DEFAULTS.text.duration`），
       *   与"视频默认时长"不是一个槽 —— 与 `RECIPE_TEXT_FALLBACKS.duration` 同属"同值巧合"。
       */
      aspectRatio: str(d.aspectRatio) || NODE_DEFAULT_RATIO_LABEL,
      duration: typeof d.duration === 'number' ? d.duration : 7,
      model: str(d.model) || DEFAULT_VIDEO_MODEL,
      refMap,
    });
  }

  const materials: AccountNodeMaterial[] = [...refIndex.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(([id, n]) => ({ ...resolveMaterial(id), refIndex: n }));

  // 原 40658-40673：逐条取**首个非空**
  const params: AccountNodeInputs['params'] = { aspectRatio: null, duration: null, model: null };
  for (const t of texts) {
    if (params.aspectRatio == null && t.aspectRatio) params.aspectRatio = t.aspectRatio;
    if (params.duration == null && t.duration != null) params.duration = t.duration;
    if (params.model == null && t.model) params.model = t.model;
  }

  return { materials, texts, params, total: materials.length + texts.length };
}
