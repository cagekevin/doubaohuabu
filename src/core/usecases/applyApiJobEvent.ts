/**
 * usecase · API 任务事件 → **落点决策**（纯函数，不写 store）
 *
 * 依据（**逐行回源抄录**）：原 `applyApiJobEvent` `shared.js:30708-30838`
 *
 * 原版这个方法**直接写 store**（`addVideoNode` / `addToLibrary` / `updateNodeData` /
 * `attachImageResultToNode` / `pushImageGenFeed` / `showToast` 六件事）。
 * 按本工程架构（原则 1 + 判据 D2），它必须拆成两半：
 *   · **决策（本文件）**：纯 —— 输入「事件 + 当前节点」，输出「要做哪些事」；
 *   · **落（`state/subscriptions.ts`）**：唯一写入点。
 *
 * ⚠️ 因此本文件**零 store 依赖**：节点列表由 state 传入（`docs/16` §2.5 的 D1）。
 * ⚠️ 原则 4：`now` 由调用方注入（源版的 `new Date()` 全部改为注入）。
 * ⚠️ **`null` 的语义**（与源版 `if (!n || !n.jobId) return;` 逐字对应）：
 *    事件缺 `jobId` ⇒ **什么都不做**。这不是"失败"，故不用 `Result` 造一个假 reason。
 *    （`docs/16` §2.5 写的是「返回 Result」—— 那是读源码前的写法；源码这里是**提前 return**。）
 */

import type { ApiJobAttempt, ApiJobEvent, ApiJobStatus } from '@/stable/model/gen';
import type { CanvasNode } from '@/stable/model/node';
import { GEN_HISTORY_KEY } from '@/stable/model/node';
import { API_TEXT } from '@/constants/text';
import { API_TOAST_ERROR_MS, API_TOAST_QUOTA_MS } from '@/constants';
import { patchGenHistoryAttempt } from '@/core/rules/genHistory';
import { formatClockTime } from '@/lib/time';
import { asRecord } from '@/lib/object';

/** 节点 `data.apiJob` 里记的那份任务摘要（原 30754-30762 的 `a`） */
export interface ApiJobNodePatch {
  jobId: string;
  providerId?: string;
  providerName?: string;
  kind: 'image' | 'video';
  status: ApiJobStatus;
  progress?: number;
  /** 只有 `failed` 才带 */
  error?: unknown;
}

export interface ApiJobDecision {
  /** ★ **总是**要回灌的任务快照键（源版第一件事：`apiJobs[jobId] = n`） */
  jobId: string;
  job: ApiJobEvent;
  /** 落资源库的图片（原 `addToLibrary`） */
  library: Array<{ name: string; dataUrl: string }>;
  /** 新建视频节点（原 `addVideoNode`） */
  videoNode?: {
    url: string;
    sourceNodeId: string;
    name: string;
    accountName: string;
    attempt: (ApiJobAttempt & { status: string }) | null;
  };
  /** 附加到 `imggen` 节点的图片结果（原 `attachImageResultToNode`，**仅 `imggen`**） */
  attachImage?: {
    nodeId: string;
    dataUrl: string;
    source: 'api';
    accountName: string | null;
    genKey: string | null;
    jobId: string;
  };
  /** 合并进节点 `data` 的补丁（原 `updateNodeData`） */
  nodePatch?: { nodeId: string; patch: Record<string, unknown> };
  /** 生成图片流项（原 `pushImageGenFeed`） */
  feed?: {
    name: string;
    dataUrl: string;
    source: 'api';
    accountName: string | null;
    genKey: string | null;
  };
  /** 提示（原 `showToast`） */
  toast?: { text: string; level: 'success' | 'error'; durationMs?: number };
}

export interface ApiJobDecisionInput {
  event: ApiJobEvent;
  /** 当前画布节点（**只读** —— 由 state 传入） */
  nodes: readonly CanvasNode[];
  /** 当前时间（原则 4） */
  now: number;
}

/** 源 `a`: 节点上要记的任务摘要 */
function apiJobPatchOf(event: ApiJobEvent): ApiJobNodePatch {
  return {
    jobId: event.jobId,
    providerId: event.providerId,
    providerName: event.providerName,
    kind: event.kind,
    status: event.status,
    // 原：`typeof n.progress == 'number' ? n.progress : undefined`
    ...(typeof event.progress === 'number' ? { progress: event.progress } : {}),
    // 原：`error: n.status === 'failed' ? n.error : undefined`
    ...(event.status === 'failed' ? { error: event.error } : {}),
  };
}

/** 结果里第一条图片的 `dataUrl`（原 `l.find(d => d.type === 'image' && d.dataUrl)`） */
const firstImageUrl = (event: ApiJobEvent): string | null => {
  for (const r of event.results) {
    if (r.type === 'image' && r.dataUrl) return r.dataUrl;
  }
  return null;
};

/** 结果里第一条视频的 `url`（原 `l.find(d => d.type === 'video' && d.url)`） */
const firstVideoUrl = (event: ApiJobEvent): string | null => {
  for (const r of event.results) {
    if (r.type === 'video' && r.url) return r.url;
  }
  return null;
};

/**
 * 决策入口
 *
 * @returns `null` = 事件无效（缺 `jobId`）⇒ 什么都不做（与源版 `return` 等价）
 */
export function applyApiJobEvent(input: ApiJobDecisionInput): ApiJobDecision | null {
  const { event, nodes, now } = input;

  // ① 源：`if (!n || !n.jobId) return;`
  if (!event || !event.jobId) return null;

  const decision: ApiJobDecision = { jobId: event.jobId, job: event, library: [] };

  const nodeId = event.nodeId;

  // ② 无节点来源：`done` + `image` ⇒ 落资源库（源 30719-30745）
  if (!nodeId) {
    if (event.status === 'done' && event.kind === 'image') {
      const dataUrl = firstImageUrl(event);
      if (dataUrl) {
        decision.library.push({ name: API_TEXT.imageName(formatClockTime(now)), dataUrl });
        decision.feed = {
          name: API_TEXT.feedName,
          dataUrl,
          source: 'api',
          accountName: event.providerName ?? null,
          // ⚠️ 后端 `publicSnapshot` **不发 `genKey`** ⇒ 源版这里恒为 `null`（照实对齐）
          genKey: null,
        };
        decision.toast = { text: API_TEXT.imageStored, level: 'success' };
      }
    }
    return decision;
  }

  // ③ 节点不存在 ⇒ 任务快照已记，其余什么都不做（源 30751-30753）
  const node = nodes.find((n) => n.id === nodeId);
  if (!node) return decision;

  const data = asRecord(node.data);
  const apiJob = apiJobPatchOf(event);

  if (event.status === 'done') {
    const videoUrl = firstVideoUrl(event);
    const imageUrl = firstImageUrl(event);

    if (videoUrl) {
      // 源 30771-30786：建视频节点 + 记 apiJob（**不**落资源库）
      decision.videoNode = {
        url: videoUrl,
        sourceNodeId: nodeId,
        name: typeof data.label === 'string' ? data.label : API_TEXT.videoFallbackName,
        accountName: API_TEXT.videoAccount(event.providerName ?? ''),
        attempt: event.attempt ? { ...event.attempt, status: 'success' } : null,
      };
      decision.nodePatch = { nodeId, patch: { apiJob } };
      return decision;
    }

    if (imageUrl) {
      // 源 30787-30808：落库 + 记 apiJob + （仅 imggen）附加结果 + 提示
      decision.library.push({ name: API_TEXT.imageName(formatClockTime(now)), dataUrl: imageUrl });
      decision.nodePatch = { nodeId, patch: { apiJob } };
      if (node.type === 'imggen') {
        decision.attachImage = {
          nodeId,
          dataUrl: imageUrl,
          source: 'api',
          accountName: event.providerName ?? null,
          genKey: null,
          jobId: event.jobId,
        };
      }
      decision.toast = { text: API_TEXT.imageStored, level: 'success' };
      return decision;
    }

    // 源 30809-30813：`done` 但没有任何可用产物 ⇒ 只记 apiJob
    decision.nodePatch = { nodeId, patch: { apiJob } };
    return decision;
  }

  if (event.status === 'failed' || event.status === 'cancelled') {
    // 源 30814-30832：回写 genHistory 尝试记录 + 记 apiJob + 失败提示
    const patch: Record<string, unknown> = { apiJob };
    if (event.attempt && event.attempt.id) {
      const patched = patchGenHistoryAttempt(data, event.attempt.id, {
        status: event.status === 'failed' ? 'failed' : 'cancelled',
        note: event.status === 'failed' ? API_TEXT.failedNote(event.error?.message) : API_TEXT.cancelledNote,
      });
      // 只在真的命中时带出去（`patchGenHistoryAttempt` 未命中会原样返回同一引用）
      if (patched !== data) patch[GEN_HISTORY_KEY] = patched[GEN_HISTORY_KEY];
    }
    decision.nodePatch = { nodeId, patch };

    if (event.status === 'failed') {
      const kind = event.error?.kind;
      const message = event.error?.message || API_TEXT.unknownError;
      decision.toast =
        kind === 'quota'
          ? {
              text: API_TEXT.failedQuota(message, event.error?.advice),
              level: 'error',
              durationMs: API_TOAST_QUOTA_MS,
            }
          : { text: API_TEXT.failed(message), level: 'error', durationMs: API_TOAST_ERROR_MS };
    }
    return decision;
  }

  // 源 30833-30836：其余状态（queued / submitting / running / downloading）⇒ 只记 apiJob
  decision.nodePatch = { nodeId, patch: { apiJob } };
  return decision;
}
