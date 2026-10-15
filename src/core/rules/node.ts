/**
 * 节点不变量校验（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据：`NODE_DEFAULTS`（`core/model/defaults.ts`，来自源码 8 类节点的初始化对象）
 *   —— 默认值定义了「每类节点**必须**有哪些字段」，反过来就是**不变量**。
 *
 * ⚠️ 归属说明（审计越权 5 的修正）：
 *   - **默认值**（数据）在 `core/model/defaults.ts`
 *   - **校验**（规则）在本文件
 *
 * 用途：
 *   1. 加载老数据后体检（配合 `stable/migrations`）
 *   2. 创建节点前校验
 *   3. 开发期断言（`dev` 模式下对 `commit` 的输入做检查）
 */

import type { CanvasNode, NodeType } from '@/stable/model/node';
import { isRecord } from '@/lib/object';

/** 一条不变量问题 */
export interface NodeIssue {
  nodeId: string;
  type: string;
  /** 出问题的字段路径，如 `data.text` */
  field: string;
  /** ★ 原样描述（不美化，便于定位） */
  message: string;
}

const isNonEmptyString = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const isString = (v: unknown): v is string => typeof v === 'string';
const isNumber = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isArray = (v: unknown): v is unknown[] => Array.isArray(v);

/** 每类节点的必填字段与类型（由 `NODE_DEFAULTS` 反推） */
const REQUIRED: Record<NodeType, Record<string, 'string' | 'number' | 'array'>> = {
  text: { text: 'string', aspectRatio: 'string', duration: 'number', linkOrder: 'array', referenceOrder: 'array', materialIds: 'array', styleIds: 'array' },
  material: { name: 'string', dataUrl: 'string' },
  video: { label: 'string', url: 'string' },
  genvideo: { label: 'string', text: 'string', aspectRatio: 'string', duration: 'number', sendAccount: 'string', styleIds: 'array', linkOrder: 'array' },
  imggen: { label: 'string', text: 'string', aspectRatio: 'string', channel: 'string', sendAccount: 'string', imageCount: 'number', styleIds: 'array', linkOrder: 'array', results: 'array' },
  account: { accountId: 'string' },
  download: { folder: 'string' },
  group: { label: 'string' },
};

function checkField(nodeId: string, type: string, field: string, kind: 'string' | 'number' | 'array', v: unknown): NodeIssue | null {
  const ok =
    kind === 'string' ? isString(v) : kind === 'number' ? isNumber(v) : isArray(v);
  if (ok) return null;
  return {
    nodeId,
    type,
    field,
    message: `字段类型不符：期望 ${kind}，实际 ${v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v}`,
  };
}

/** 校验单个节点 */
export function validateNode(node: CanvasNode): NodeIssue[] {
  const issues: NodeIssue[] = [];
  const type = node.type as NodeType;

  // ① 类型必须合法
  if (!(type in REQUIRED)) {
    issues.push({ nodeId: node.id, type: String(type), field: 'type', message: `未知节点类型：${String(type)}` });
    return issues;
  }

  // ② id 非空
  if (!isNonEmptyString(node.id)) {
    issues.push({ nodeId: String(node.id), type, field: 'id', message: 'id 为空' });
  }

  // ③ position 必须是数值坐标（**入参可能是磁盘/旧版本的脏值** ⇒ 用 `isRecord` 收，不自称形状）
  const pos = node.position;
  if (!isRecord(pos) || !isNumber(pos.x) || !isNumber(pos.y)) {
    issues.push({ nodeId: node.id, type, field: 'position', message: 'position 缺失或坐标非数值' });
  }

  // ④ data 必须存在（`NodeDataBase` 自带索引签名 ⇒ 下面取字段不需要断言）
  const data = node.data;
  if (!data || typeof data !== 'object') {
    issues.push({ nodeId: node.id, type, field: 'data', message: 'data 缺失' });
    return issues;
  }

  // ⑤ 必填字段与类型
  for (const [field, kind] of Object.entries(REQUIRED[type])) {
    const issue = checkField(node.id, type, `data.${field}`, kind, data[field]);
    if (issue) issues.push(issue);
  }

  return issues;
}

/** 批量校验（加载老数据后体检用） */
export function validateNodes(nodes: readonly CanvasNode[]): NodeIssue[] {
  return nodes.flatMap(validateNode);
}
