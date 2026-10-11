/**
 * usecase · API 通道配置（provider / 配置 / 测试连接 / 任务）
 *
 * 依据（**逐行回源抄录**）：原 store action `loadApiSetup`(30567) · `saveApiSetup`(30594) ·
 *   `refreshApiConfig`(30650) · `submitApiJob`(30662) · `listApiJobs` / `cancelApiJob`(30699)
 *   + 消费者 `_Component46.jsx`（API 设置面板）
 *
 * ★ **为什么值得有这一层**（不是"给端口套壳"）：
 *   `_Component46.jsx:100/109/118/149/175` **直调 `window.api.apiConfigSet*` / `apiConfigTest`**
 *   —— 那是铁律② 的违规（视图直调宿主）。本文件就是把这些调用**纳入
 *   `ui → state → usecases → ports` 的那道口子**；没有它，UI 只能继续碰 `window.api`。
 *
 * ⚠️ 原则 1：本文件**不写 store**（回灌由 `state` 落）。
 * ⚠️ 原则 6：源版 `loadApiSetup` 是 `try{}catch{}` **全吞** ⇒ 重写**如实转发**；
 *    且源版里「配置」与「setup」在**同一个 try** 内（前一步抛错则后一步不执行）——
 *    这里拆成两个独立函数，调用方可以**各判各的**。
 */

import type { ApiPort } from '@/core/ports/host.port';
import type { ApiJobEvent, ApiJobStatus, ApiProviderMeta, ApiSetup, ApiUsage } from '@/stable/model/gen';
import type { Result } from '@/core/model/result';

export interface ApiConfigDeps {
  api: ApiPort;
}

/**
 * 读 provider 元信息 + 配置原文（原 `loadApiSetup` 前半 + `refreshApiConfig` 30650-30661）
 *
 * 两者是**同一个后端调用**（`api-config:get` 一次返回 `providers` + `configs`）——
 * 源版分了两处（启动一次、刷新一次）拷同一份数据。
 */
export async function loadApiProviders(
  deps: ApiConfigDeps,
): Promise<Result<{ providers: ApiProviderMeta[]; configs: unknown }>> {
  return deps.api.configGet();
}

/** 读通道设置 + 用量（原 `loadApiSetup` 后半 · `api-setup:get`） */
export async function loadApiSetup(
  deps: ApiConfigDeps,
): Promise<Result<{ setup: ApiSetup; usage: ApiUsage }>> {
  return deps.api.setupGet();
}

/**
 * 保存通道设置（原 `saveApiSetup` 30594-30623）
 *
 * ⚠️ 源版在宿主缺失时**自造**文案 `'当前版本不支持通道设置'`；本工程由适配器统一给
 *    `HOST_MISSING` ⇒ 这里**原样转发**，不再造第二句（原则 6）。
 */
export async function saveApiSetup(
  deps: ApiConfigDeps,
  patch: Partial<ApiSetup>,
): Promise<Result<{ setup: ApiSetup }>> {
  return deps.api.setupSet(patch);
}

/** 保存 provider 配置（原 `_Component46.jsx:100/175` 直调 `apiConfigSet`） */
export async function saveProviderConfig(
  deps: ApiConfigDeps,
  providerId: string,
  patch: unknown,
): Promise<Result<{ config: unknown }>> {
  return deps.api.configSet(providerId, patch);
}

/** 保存 provider 密钥（**明文只进不出**；原 `_Component46.jsx:109`） */
export async function saveProviderKey(
  deps: ApiConfigDeps,
  providerId: string,
  key: string,
): Promise<Result<{ keyHint?: string; maskedBy?: string }>> {
  return deps.api.configSetKey(providerId, key);
}

/** 保存 provider 附加密钥（原 `_Component46.jsx:118`） */
export async function saveProviderSecret(
  deps: ApiConfigDeps,
  providerId: string,
  key: string,
): Promise<Result<{ hasSecret: boolean }>> {
  return deps.api.configSetSecret(providerId, key);
}

/** 测试连接（原 `_Component46.jsx:149` 直调 `apiConfigTest`） */
export async function testProvider(
  deps: ApiConfigDeps,
  providerId: string,
): Promise<Result<{ message?: string }>> {
  return deps.api.configTest(providerId);
}

/** 任务列表（原 `api-job:list`） */
export async function listApiJobs(deps: ApiConfigDeps): Promise<Result<ApiJobEvent[]>> {
  return deps.api.jobList();
}

/** 取消任务（原 `cancelApiJob` 30699-30707） */
export async function cancelApiJob(
  deps: ApiConfigDeps,
  jobId: string,
): Promise<Result<{ status: ApiJobStatus }>> {
  return deps.api.jobCancel(jobId);
}
