/**
 * 8 类节点的默认值（★ 这是**数据**，不是规则 —— 审计越权 5 的修正）
 *
 * 依据：docs/过程.md §0.2 + docs/过程.md §四
 * 归属说明：默认值属 `core/model`（数据）；不变量校验属 `core/rules`（规则）
 */

import type { NodeDataOf, NodeType } from '@/stable/model/node';
import {
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_RESOLUTION,
  NODE_DEFAULT_RATIO,
  NODE_DEFAULT_RATIO_LABEL,
} from '@/constants/models';
import { GROUP_Z_INDEX } from '@/constants';

/**
 * ★ 三类带比例的节点，默认比例一律 `NODE_DEFAULT_RATIO_LABEL`（= `'4:3'`）
 * ⚠️ 与源不同（源是 `16:9` / `16:9` / `1:1`）—— 见 `constants/models.ts` 的 `NODE_DEFAULT_RATIO` 注。
 */
export const NODE_DEFAULTS = {
  text: {
    text: '',
    aspectRatio: NODE_DEFAULT_RATIO_LABEL,
    duration: 7,
    linkOrder: [],
    referenceOrder: [],
    materialIds: [],
    styleIds: [],
  },
  material: {
    name: '',
    dataUrl: '',
  },
  video: {
    label: '视频',
    url: '',
  },
  genvideo: {
    label: '文生视频',
    text: '',
    aspectRatio: NODE_DEFAULT_RATIO_LABEL,
    duration: 5,
    sendAccount: 'auto',
    styleIds: [],
    linkOrder: [],
  },
  imggen: {
    label: '文生图',
    text: '',
    aspectRatio: NODE_DEFAULT_RATIO_LABEL,
    channel: 'doubao',
    sendAccount: 'auto',
    imageCount: DEFAULT_IMAGE_COUNT,
    igResolution: DEFAULT_IMAGE_RESOLUTION,
    styleIds: [],
    linkOrder: [],
    results: [],
  },
  account: {
    accountId: '',
  },
  download: {
    folder: '',
  },
  group: {
    label: '组',
  },
} as const satisfies Record<NodeType, unknown>;

/** 取某类节点的默认 data（返回浅拷贝，避免共享引用） */
export function defaultNodeData<T extends NodeType>(type: T): NodeDataOf<T> {
  const d = NODE_DEFAULTS[type];
  return JSON.parse(JSON.stringify(d)) as NodeDataOf<T>;
}

/**
 * 建**生成类**节点时**沿用画布上「上一个同类节点」的设置**（原 `addGenVideo` 29496 / `addGenImage` 29536）
 *
 * 源逐字：`[...nodes].reverse().find(n => n.type === X)` 取**最后一个同类节点**，
 * 把它 `data` 里的设置按「真值才沿用」合并进新节点（`u.X || 兜底`）。
 *
 * ⚠️ 返回的是**要覆盖 `defaultNodeData` 的 patch**（由调用方 `{...defaultNodeData, ...本函数, ...显式patch}` 合并）。
 *
 * ⚠️ 与源的两处**有意差异**（都是本仓既有裁定，不在本函数内改）：
 *   ① 兜底值取本仓 `defaultNodeData`（比例 = `NODE_DEFAULT_RATIO_LABEL` 4:3，源是 `16:9`/`1:1`，用户裁定）；
 *   ② 源还叠一层 `canvasDefaults`（`d.ratio`/`d.duration`/`d.model`）—— 本仓那一层在**读侧**
 *      （`GenPanel.tsx` 的 `data.X || canvasDefaults.X || 兜底`），此处**不重复**。
 *
 * ⚠️ 字段清单**逐字对源**：
 *   · 共有：`aspectRatio`（真值）· `sendAccount`（真值）· `styleIds`（数组即沿用，浅拷贝）
 *   · `genvideo`：`duration`（真值）· `model`（**非 `undefined`/`null` 即沿用**，可含空串）· `channel`（真值才**加键**）
 *   · `imggen`：`channel`（真值）· `imageCount`（真值）· `igModel`（真值才**加键**）· `igResolution`（真值）
 */
export function inheritGenNodeData(
  type: 'genvideo' | 'imggen',
  nodes: readonly { type: string; data?: unknown }[],
): Record<string, unknown> {
  const prev = [...nodes].reverse().find((n) => n.type === type);
  const raw = prev?.data;
  const u: Record<string, unknown> =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const out: Record<string, unknown> = {};
  if (u.aspectRatio) out.aspectRatio = u.aspectRatio;
  if (u.sendAccount) out.sendAccount = u.sendAccount;
  if (Array.isArray(u.styleIds)) out.styleIds = [...u.styleIds];
  if (type === 'genvideo') {
    if (u.duration) out.duration = u.duration;
    // 源 `u.model !== undefined && u.model !== null ? u.model : d.model || null`
    if (u.model !== undefined && u.model !== null) out.model = u.model;
    if (u.channel) out.channel = u.channel;
  } else {
    if (u.channel) out.channel = u.channel;
    if (u.imageCount) out.imageCount = u.imageCount;
    if (u.igModel) out.igModel = u.igModel;
    if (u.igResolution) out.igResolution = u.igResolution;
  }
  return out;
}

/** 组节点的固定 zIndex（原 31577） */
export const GROUP_NODE_Z_INDEX = GROUP_Z_INDEX;

/**
 * 各类节点**新建时的尺寸**（原 `_Component42.jsx` 的 `create-panel` 三个动作内联）
 *
 * | 类型 | 尺寸 | 源 |
 * |---|---|---|
 * | `text` | 280×150 | `$()` 655-690（三个 mode 都是这个值） |
 * | `genvideo` | 380×240 | `ie()` 716-744 |
 * | `imggen` | 380×300 | `be()` 780-781 |
 * | `account` | 420×220 | `Ne()` 863-891 |
 * | `download` | 280×200 | `$e()` 914-942 |
 *
 * ⚠️ 只列**面板/右键能建出来**的 5 类 —— `material`（拖入）/`video`（扫描产出）/
 *    `group`（框选成组）都**不经**这条创建路径，故不给尺寸（缺项 ⇒ 用 `lt` 的兜底 200×180）。
 * ⚠️ 用途目前只有一个：**在边上插入节点时算中点**（原 `lt` 543-560 的 `Oe.w/Oe.h`）。
 */
/** 由宽度与**默认比例**算出节点高度（`NODE_CREATE_SIZES` 与 `nodeCreateSize` 兜底共用一处） */
const sizeH = (w: number): number => Math.round(w / NODE_DEFAULT_RATIO);

export const NODE_CREATE_SIZES: Readonly<Partial<Record<NodeType, { w: number; h: number }>>> = {
  // ★ **2026-10-12 用户裁定**：宽高比一律 `NODE_DEFAULT_RATIO`（4:3）——
  //   宽度保留源值（那是"这个节点该多宽"的既有判断），高由比例算出。
  text: { w: 280, h: sizeH(280) },
  genvideo: { w: 380, h: sizeH(380) },
  imggen: { w: 380, h: sizeH(380) },
  account: { w: 420, h: sizeH(420) },
  download: { w: 280, h: sizeH(280) },
};

/**
 * 取创建尺寸（缺项 ⇒ 兜底 `200×180`）
 *
 * ⚠️ **`TD-02-8` 复核结论（2026-10-12 · 回源定案）：这个 `200×180` 与下面两处
 *   **不是同一条规则**，**禁止合并**成共享常量** ——
 *   | 处 | 源 | 兜底形态 | 角色 |
 *   |---|---|---|---|
 *   | **本函数** | `lt` 的参数侧（`Oe.w/Oe.h`，`_Component42.jsx:559-560`） | 字面量 | **新建节点**自身的尺寸 |
 *   | `core/rules/graph.ts:116-119` | `lt` 内部（`:552-555`） | `width \|\| 200`（**二级**，不查 `measured`） | **已有节点**的尺寸 |
 *   | `core/rules/group.ts:17` | `s(x)`（`shared.js:31508-31513`） | `width ?? measured.width ?? 200`（**三级**） | **组内盒** |
 *   ⇒ 三者分属**两个不同源函数**、**三种角色**、**两种不同层级**的兜底 —— 合并即**凭空造一条耦合**
 *     （日后源改一处，另两处会被静默带偏）。**它们只是取值巧合相同。**
 */
export function nodeCreateSize(type: string): { w: number; h: number } {
  // ⚠️ 兜底尺寸的**宽**保留源值 `200`；**高**同样由 `NODE_DEFAULT_RATIO` 算出（原 `180`）
  return NODE_CREATE_SIZES[type as NodeType] ?? { w: 200, h: sizeH(200) };
}
