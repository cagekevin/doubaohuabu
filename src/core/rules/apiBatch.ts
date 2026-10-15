/**
 * 批量出片的落点计算（★ 纯函数，必测）
 *
 * 依据（**逐行回源抄录**）：原 `Z3_1.jsx:928-940`（`st` 的成功分支）
 *
 * 源：
 *   ```js
 *   const $e = (Ne.jobIds || []).filter(Boolean).length;          // 成功提交的任务数
 *   Ae({ apiJob: {
 *     jobId: (Ne.jobIds || []).find(Boolean) || null,             // 第一个成功的 jobId（**可为 null**）
 *     providerId: He.id, providerName: He.name,
 *     status: 'queued', kind: 'video', batch: true,
 *   } });
 *   ```
 *
 * ⚠️ 后端 `submitBatch` 会**逐位**返回 `jobIds`（提交失败处为 `null`）⇒ 这里是「有哪些真的成功了」的
 *    唯一真源；`count` 用的是**过滤掉 `null` 之后**的条数（源同）。
 */

import type { ApiBatchResult, VideoApiJob } from '@/stable/model/gen';

export interface VideoBatchLanding {
  /** 真正提交成功的任务数（源 `jobIds.filter(Boolean).length`） */
  count: number;
  /**
   * 落进节点 `data.apiJob` 的批量摘要（源 `Ae({apiJob:{...}})` 的形状）
   * ★ 形状真源 = `stable/model/gen.VideoApiJob`（本处只填其中批量分支那几项；
   *   `jobId` 取**第一个成功的**，全部失败 ⇒ `null` —— 源 `find(Boolean) || null`）
   */
  apiJob: VideoApiJob;
}

/**
 * 批量出片成功后的落点（原 `Z3_1.jsx:929-939`）
 *
 * @param batch    后端 `api-job:batch` 的返回（`{jobIds, errors, total}`）
 * @param provider 本次使用的 provider（`id` / `name`，来自 `apiProvidersMeta`）
 */
export function planVideoBatchLanding(
  batch: ApiBatchResult,
  provider: { id: string; name: string },
): VideoBatchLanding {
  const ids = (batch.jobIds ?? []).filter((x): x is string => !!x);
  return {
    count: ids.length,
    apiJob: {
      jobId: ids[0] ?? null,
      providerId: provider.id,
      providerName: provider.name,
      status: 'queued',
      kind: 'video',
      batch: true,
    },
  };
}
