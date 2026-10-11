/**
 * 提示词预设（原 `addPreset`，`shared.js:27857-27873`）—— **纯规则**
 *
 * 源（逐行抄录）：
 * ```js
 * addPreset: ({ name: n, content: r }) => {
 *   const s = `pre_${Date.now().toString(36)}_${(Gl++).toString(36)}`;
 *   const o = { id: s, name: n && n.trim() || '未命名预设', content: r || '' };
 *   const a = [...t().presets, o];
 *   e({ presets: a });
 *   wo(a);
 *   return s;
 * },
 * ```
 *
 * ⚠️ **三个逐字细节**：
 *   · id 的两段都是 **base36**（`Date.now().toString(36)` **和** `seq.toString(36)`）——
 *     与 `makeNodeId`（`${now.toString(36)}_${seq}`，seq 是**十进制**）**不同**，不合并；
 *   · `name` 是 `name && name.trim() || '未命名预设'` —— 先 `trim` 再判空，空 / 全空白 ⇒ 兜底；
 *   · `content` 用 `|| ''`（`undefined`/`null`/空串都成空串）。
 *
 * ⚠️ **提示词预设与图预设住在同一个数组**（`Preset` 是联合）：本函数产出的**没有 `kind`**
 *    （判据见 `_Component42.jsx:196`：`kind === 'graph'` 才是图预设）。
 *
 * ⚠️ 源里提示词预设**只写不读**（`CL.jsx` 的「保存预设」按钮写；119 个展开组件里没有列表 / 套用方）
 *    —— 本仓照实建模，**不假装它有 UI**（见 `stable/model/project.ts` 的 `PromptPreset` 头注）。
 */

import { PRESET_TEXT } from '@/constants/text';
// ★ **2026-10-12（`TD-01-7`）**：id 前缀改吃契约层常量 —— 此前硬编码 `pre_`，而
//   `stable/contracts/schemas.ts:91` 有 `PRESET_ID_PREFIX` 却 0 消费（SSOT 第二份）。
// ★ **2026-10-12**：id 改走**唯一工厂** `makeId('preset', …)`（前缀由 `ID_PREFIX` 取契约常量）
import { makeId } from './project';
import type { CanvasNode } from '@/stable/model/node';
import type { CanvasEdge, GraphPreset, Preset, PromptPreset } from '@/stable/model/project';

/**
 * 造一条提示词预设（原 `addPreset` 的纯半）
 *
 * @param input 源传的 `{name, content}`（`name` 来自节点标题，`content` 是 `text.trim()`）
 * @param now   时间戳（ms）—— 由调用方注入（`core` 禁 `Date.now()`，原则 4）
 * @param seq   自增计数（**会被转成 base36**）
 */
export function makePromptPreset(
  input: { name?: string; content?: string },
  now: number,
  seq: number,
): PromptPreset {
  return {
    id: makeId('preset', now, seq),
    name: (input.name && input.name.trim()) || PRESET_TEXT.unnamed,
    content: input.content || '',
  };
}

/**
 * 从 `presets` 的**联合**（`PromptPreset | GraphPreset`）里挑出**图预设**
 *
 * ⚠️ 必须显式收窄：`PromptPreset` **没有 `kind` 字段**（源实测该数组混装两种，见
 *   `stable/model/project.ts` 的 `Preset` 头注）⇒ 直接读 `.kind` 在类型层就不成立。
 * ★ **唯一真源**：`canvas.splitApplyPreset`、`SplitKeywordModal`（分流）、`SplitPresetPickerModal`
 *   （列表）三处**都调它** —— 不各写一份 `p.kind === 'graph'`。
 */
export const isGraphPreset = (p: Preset): p is GraphPreset => 'kind' in p && p.kind === 'graph';

/** `makeGraphPreset` 的入参（源 `addNodePreset` 解构的 `{name, nodes, edges}`） */
export interface GraphPresetInput {
  name?: string;
  nodes: readonly CanvasNode[];
  edges: readonly CanvasEdge[];
}

/**
 * 造一条**节点图预设**（原 `addNodePreset` 的纯半，`shared.js:28363-28396`）
 *
 * 源（逐行抄录，只留计算部分）：
 * ```js
 * addNodePreset: ({ name: n, nodes: r, edges: s }) => {
 *   const o = `pre_${Date.now().toString(36)}_${(Gl++).toString(36)}`;
 *   const a = (r || []).map(d => { const { selected, dragging, positionAbsolute, ...m } = d; return { ...m, selected: false }; });
 *   const l = (s || []).map(d => { const { selected, ...p } = d; return { ...p }; });
 *   const c = { id: o, name: n && n.trim() || '未命名节点预设', kind: 'graph', nodes: a, edges: l };
 *   const u = [...t().presets, c];
 * ```
 *
 * ⚠️ **它与 `makePromptPreset` 是同一族**：id 形状逐字相同（`pre_<base36 now>_<base36 seq>`），
 *   源里两者共用**同一个 seq 计数器**（`Gl++`）与**同一个 `presets` 数组** —— 靠 `kind` 区分
 *   （提示词预设**无 `kind`**）。本仓 `addPreset` / `addNodePreset` 共用 `global` slice 的 `seq` ✅。
 *
 * ⚠️ **两处不照抄，都有取证**（铁律 2：不为不存在的用户写代码）：
 *   · 源从 node 上删 `dragging` / `positionAbsolute` —— 那是 **React Flow 的运行期字段**；
 *     本仓 `positionAbsolute` **全仓 0 命中**、`dragging` 只出现在无关的本地状态里 ⇒ 本仓模型
 *     **不带它们**，照抄就是删不存在的键 ⇒ **不删**；
 *   · 源从 edge 上删 `selected` —— 本仓 `CanvasEdge`（`stable/model/project.ts:12-25`）
 *     **没有这个字段** ⇒ 同样不删。
 *   而 `nodes` 的 **`selected: false` 照抄**：`NodeBase.selected` 本仓有，且"存档不该带选中态"是真语义。
 */
export function makeGraphPreset(
  input: GraphPresetInput,
  now: number,
  seq: number,
): GraphPreset {
  return {
    id: makeId('preset', now, seq),
    name: (input.name && input.name.trim()) || PRESET_TEXT.unnamedNode,
    kind: 'graph',
    // 源 `(r || []).map(... => ({...m, selected: false}))` —— **恒置 false**
    nodes: input.nodes.map((n) => ({ ...n, selected: false })),
    // 源 `(s || []).map(... => ({...p}))` —— 本仓边无可清洗字段（见上），**原样收**
    edges: [...input.edges],
  };
}
