/**
 * usecase · 视频本地化（把节点里的 `http(s)` 直链落盘成 `vid://`）
 *
 * 依据（**逐行回源抄录**）：
 *   - `localizeNodeVideos` shared.js:31017-31054
 *   - `backfillLocalVideos` shared.js:31055-31067
 *
 * ⚠️ 链 18 硬约束（`docs/过程.md` #9）：**视频必须落盘** —— 站点直链会过期/需要 referer。
 *
 * ⚠️ 原则 1：本文件**不写 store**。它返回**回写后的完整 `data`**，
 *    由 state 用**已存在**的 `patchNodeData(nodeId, data)` 落下 —— 不新增 store action。
 *
 * ⚠️ **本用例不返回 `Result`（有意，与 `docs/过程.md` §1.6 的「全部返回 Result」不同）**：
 *    源实现是「逐 URL `try{}catch{}`，**单条失败不影响其余**，整体恒成功」⇒
 *    **不存在"整体失败"语义**。为它编一个 `err` 分支＝造错（原则 6 禁止）。
 *    单条失败**如实进 `failures`**（源版是静默吞掉，重写改为上报）。
 */

import type { MediaPort } from '@/core/ports/host.port';
import { VIDEO_TEXT } from '@/constants/text';
import {
  applyLocalVideoRef,
  collectLocalizableUrls,
  selectVideoNodesToLocalize,
  type LocalizableNode,
} from '@/core/rules/videoLocalize';

export interface LocalizeVideosDeps {
  media: Pick<MediaPort, 'saveVideoFromUrl'>;
}

/** 一条已完成的回写 */
export interface LocalizedVideo {
  nodeId: string;
  /** ★ 回写后的**完整** `data`（state 直接 `patchNodeData(nodeId, data)`） */
  data: Record<string, unknown>;
}

export interface LocalizeOutcome {
  /** 需要回写的节点清单（空 = 本轮没有可落盘的） */
  rewrites: LocalizedVideo[];
  /**
   * 单条 URL 的失败清单（**原始 message**，已加前缀）
   * ⚠️ 源版是 `try{}catch{}` 静默吞掉 ⇒ 重写如实上报（原则 6），但**不中断**整批
   */
  failures: string[];
}

const emptyOutcome = (): LocalizeOutcome => ({ rewrites: [], failures: [] });

/**
 * 本地化**单个节点**（原 `localizeNodeVideos` 31017）
 *
 * 流程：收集直链 → 逐个 `saveVideoFromUrl` → 命中即回写 `data`（累计）→ 返回最终 `data`。
 * ⚠️ 同一节点多条 URL 时**依次叠加**回写（源版也是往同一份 `data` 上连续 `applyLocalVideoRef`）。
 */
export async function localizeNodeVideos(
  deps: LocalizeVideosDeps,
  node: LocalizableNode,
): Promise<LocalizeOutcome> {
  const urls = collectLocalizableUrls(node.data);
  if (urls.length === 0) return emptyOutcome();

  const failures: string[] = [];
  let data = node.data;
  let changed = false;

  for (const url of urls) {
    const res = await deps.media.saveVideoFromUrl(url);
    if (!res.ok) {
      // ★ 源版静默吞错 ⇒ 这里如实记账，但**不中断**其余 URL（与源版一致）
      failures.push(VIDEO_TEXT.saveFailed(url, res.message));
      continue;
    }
    const applied = applyLocalVideoRef(data, url, res.value.ref);
    if (applied.changed) {
      data = applied.data;
      changed = true;
    }
  }

  return { rewrites: changed ? [{ nodeId: node.id, data }] : [], failures };
}

/**
 * 全量回填（原 `backfillLocalVideos` 31055）
 *
 * ⚠️ 源版**串行** `for...of await`（不是并发）—— 照抄，避免同时打满主进程下载。
 * ⚠️ 源版每个节点包一层 `try{}catch{}` 吞掉 ⇒ 本实现把**单条 URL 的**失败收进 `failures`；
 *    用例本身不再抛（`saveVideoFromUrl` 已经是 `Result`，不会抛）。
 */
export async function backfillLocalVideos(
  deps: LocalizeVideosDeps,
  nodes: readonly { id: string; type: string; data: unknown }[],
): Promise<LocalizeOutcome> {
  const targets = selectVideoNodesToLocalize(nodes);
  const rewrites: LocalizedVideo[] = [];
  const failures: string[] = [];

  for (const node of targets) {
    const res = await localizeNodeVideos(deps, node);
    rewrites.push(...res.rewrites);
    failures.push(...res.failures);
  }

  return { rewrites, failures };
}
