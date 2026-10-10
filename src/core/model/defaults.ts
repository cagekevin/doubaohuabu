/**
 * 8 类节点的默认值（★ 这是**数据**，不是规则 —— 审计越权 5 的修正）
 *
 * 依据：docs/03-人类版.md §0.2 + docs/07-领域规则.md §四
 * 归属说明：默认值属 `core/model`（数据）；不变量校验属 `core/rules`（规则）
 */

import type { NodeDataOf, NodeType } from '@/stable/model/node';
import { DEFAULT_IMAGE_RESOLUTION } from '@/constants/models';
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
    imageCount: 1,
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
