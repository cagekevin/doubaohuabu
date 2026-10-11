/**
 * 8 类节点的默认值（★ 这是**数据**，不是规则 —— 审计越权 5 的修正）
 *
 * 依据：docs/03-人类版.md §0.2 + docs/07-领域规则.md §四
 * 归属说明：默认值属 `core/model`（数据）；不变量校验属 `core/rules`（规则）
 */

import type { NodeDataOf, NodeType } from '@/stable/model/node';
import { DEFAULT_IMAGE_COUNT, DEFAULT_IMAGE_RESOLUTION } from '@/constants/models';
import { GROUP_Z_INDEX } from '@/constants';

export const NODE_DEFAULTS = {
  text: {
    text: '',
    aspectRatio: '16:9',
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
    aspectRatio: '16:9',
    duration: 5,
    sendAccount: 'auto',
    styleIds: [],
    linkOrder: [],
  },
  imggen: {
    label: '文生图',
    text: '',
    aspectRatio: '1:1',
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
export const NODE_CREATE_SIZES: Readonly<Partial<Record<NodeType, { w: number; h: number }>>> = {
  text: { w: 280, h: 150 },
  genvideo: { w: 380, h: 240 },
  imggen: { w: 380, h: 300 },
  account: { w: 420, h: 220 },
  download: { w: 280, h: 200 },
};

/** 取创建尺寸（缺项 ⇒ 源 `lt` 的兜底 `200×180`） */
export function nodeCreateSize(type: string): { w: number; h: number } {
  return NODE_CREATE_SIZES[type as NodeType] ?? { w: 200, h: 180 };
}
