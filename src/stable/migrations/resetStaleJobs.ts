/**
 * 启动归位 · 清在途任务状态（原 `migrateNodes` 的 ③④ 两段）
 *
 * ⚠️ **这不是"迁移"** —— 它**每次启动都要跑**：
 *    上一次运行被关掉/崩掉时，`genvideo` 的 `_pendingAttempt(s)` 与
 *    `apiJob`（queued/submitting/running）会**残留在 localStorage 里**。
 *    重启后它们永远不会有结果 ⇒ 必须清掉（docs/过程.md 视角 4：重启即放弃）。
 *
 * ⚠️ 与"为旧版本兼容"的区别（铁律 2）：
 *    旧版本的 `puretext → text` / 补 `height` / 补 `position` **已删除** ——
 *    实测真实数据里节点字段齐全、无旧类型 ⇒ 那些是**为不存在的用户写的代码**。
 *
 * ⚠️ 不可变：返回新结构
 */

import type { MigrationOutcome } from './types';
import { STALE_JOB_STATUSES } from '../model/gen';

/**
 * 未完成 API 任务状态的**查表**（重启时清理）
 *
 * ★ **派生自唯一真源** `../model/gen` 的 `STALE_JOB_STATUSES`（TD-01-5）—— 自抄一份必与真源各管各的 ⇒ 会漂。
 * ⚠️ 显式 `Set<string>`：真源类型是 `ApiJobStatus[]`，而这里要判的是**老数据里的任意字符串**
 *   （脏值也必须能判），故查表按 `string` 收。
 */
const STALE_JOB_STATUS_LOOKUP = new Set<string>(STALE_JOB_STATUSES);

interface AnyNode {
  type?: unknown;
  data?: Record<string, unknown>;
  [k: string]: unknown;
}

function resetOneNode(node: AnyNode): { node: AnyNode; changed: boolean } {
  if (node.type !== 'genvideo' || !node.data) return { node, changed: false };

  const d: Record<string, unknown> = { ...node.data };
  let changed = false;

  // 在途标记（本次会话的临时产物，落盘时本就不该有；残留在旧文件里也要清）
  if ('_pendingAttempt' in d) {
    delete d._pendingAttempt;
    changed = true;
  }
  if ('_pendingAttempts' in d) {
    delete d._pendingAttempts;
    changed = true;
  }

  // 未完成的 API 任务 —— 重启即放弃（不会有回调了）
  const job = d.apiJob as { status?: unknown } | undefined;
  if (job && typeof job.status === 'string' && STALE_JOB_STATUS_LOOKUP.has(job.status)) {
    delete d.apiJob;
    changed = true;
  }

  return changed ? { node: { ...node, data: d }, changed: true } : { node, changed: false };
}

/** 对工程数组清在途任务状态（只动 `data.nodes`） */
export function resetStaleJobs<T extends { data?: unknown }>(projects: readonly T[]): MigrationOutcome<T[]> {
  let touched = 0;

  const value = projects.map((proj) => {
    const d = (proj.data ?? {}) as Record<string, unknown>;
    const nodes = Array.isArray(d.nodes) ? (d.nodes as AnyNode[]) : [];
    if (nodes.length === 0) return proj;

    let anyChanged = false;
    const nextNodes = nodes.map((n) => {
      const r = resetOneNode(n);
      if (r.changed) anyChanged = true;
      return r.node;
    });

    if (!anyChanged) return proj;
    touched += 1;
    return { ...proj, data: { ...d, nodes: nextNodes } } as T;
  });

  const notes = touched > 0 ? [`[reset] 清理了 ${touched} 个工程的在途任务状态`] : [];
  return { value, changed: touched > 0, notes };
}
