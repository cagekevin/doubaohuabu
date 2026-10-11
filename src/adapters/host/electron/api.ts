/**
 * ApiPort 的 Electron 实现（第三方 provider）
 *
 * ⚠️ 密钥明文**永不过桥**：`configSetKey` / `configSetSecret` 只单向送入；读取只回 `keyHint`（脱敏）
 * ⚠️ W1：`onApiJobEvent` 是订阅，**必须取取消函数**
 *
 * ★ **2026-10-10 修（原则 6）**：原实现用 `call<T>()` 把返回值直接 `ok(...)` 出去 ——
 *   **完全无视后端的 `ok:false`**。而本工程这一组方法**每一个**都用
 *   `{ok:false, error}` / `{ok:false, message}` 表达失败（见 `main.js:3087-3162`）
 *   ⇒ 失败被吞成「成功且值为空」，UI 永远看不到原因。现统一按 `ok` 标志收口。
 *
 * ★ **2026-10-10 追修（同一条原则，治本）**：上一次只收口了 `ok` 一处，**同一个洞还留在两处**：
 *   ①判别位写成 `r.ok === false` 是 **fail-open** —— 后端漏 `ok` / 换了形状，一律被当成功；
 *   ②`pick` 里的默认值（`jobId: ''` / `total: 0` / `status: 'cancelled'`）是**同一类静默兜底**，
 *     字段一漂移照样产出「成功且值为空」—— 等于把洞从 `ok` 那层搬到字段这层。
 *   现改为：`ok !== true` 即失败（fail-closed）+ 必需字段缺失即违约，并把后端原始载荷整体留在
 *   `cause` —— 后端第三种失败形状 `{ok:false, kind, message, advice}`（`job-manager.js:343`）
 *   不再被「error → message → 兜底」的字符串优先级**拍扁成一个 string**。
 *
 * ⚠️ 类型断言只出现在**宿主边界**（后端返回是 `unknown`，形状由 `main.js` / `job-manager.js` 定）。
 */

import type { ApiPort } from '@/core/ports/host.port';
import type {
  ApiBatchResult,
  ApiConfigMap,
  ApiJobEvent,
  ApiJobStatus,
  ApiProviderMeta,
  ApiSetup,
  ApiUsage,
} from '@/stable/model/gen';
import { DEFAULT_API_CONCURRENCY } from '@/constants';
import { COMMON_TEXT } from '@/constants/text';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { asRecord, isRecord } from '@/lib/object';
import { getHostApi, HOST_MISSING } from './host-api';

/**
 * 后端失败原因原文
 *
 * ⚠️ 失败文案优先级：`error`（多数 handler）→ `message`（`api-config:test` 用这个）→ SSOT 兜底
 *    （这是后端**历史形状**的兼容，不是本层该有的知识 —— 见文件头注的 `kind/advice` 保留）
 */
function failReasonOf(r: Record<string, unknown>): string {
  return (
    (typeof r.error === 'string' && r.error) ||
    (typeof r.message === 'string' && r.message) ||
    COMMON_TEXT.unknownReason
  );
}

/** 必需字段「缺失 / 类型不符」= 契约违约 ⇒ 抛（由 `callOk` 的 catch 收成 err，**不静默给默认值**） */
function need<T>(r: Record<string, unknown>, key: string, guard: (v: unknown) => v is T): T {
  const v = r[key];
  if (!guard(v)) throw new Error(COMMON_TEXT.boundaryViolation(key));
  return v;
}

const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number';
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * 调宿主 + 按后端 `ok` 标志收口
 *
 * ★ **fail-closed**：只有**明确** `ok === true` 才算成功。反向写法（`ok === false` 才失败）是
 *   fail-open —— 后端漏字段 / 换了形状会被静默当成功，正是原 bug 的形状。
 */
async function callOk<T>(
  fn: (api: NonNullable<ReturnType<typeof getHostApi>>) => Promise<unknown>,
  pick: (raw: Record<string, unknown>) => T,
): Promise<Result<T>> {
  const api = getHostApi();
  if (!api) return err('unknown', HOST_MISSING);
  try {
    const raw = await fn(api);
    const r = asRecord(raw);
    if (r.ok !== true) {
      // `ok` 本身缺失 ⇒ 是**契约违约**，不是「后端说了失败但没给原因」—— 两者别混为一谈
      const why = typeof r.ok === 'boolean' ? failReasonOf(r) : COMMON_TEXT.boundaryViolation('ok');
      // 原始载荷整体进 `cause`：后端 `kind` / `advice` 不再被拍扁丢弃（原则 6）
      return err('unknown', why, r);
    }
    try {
      return ok(pick(r));
    } catch (e) {
      // 必需字段缺失（`need` 抛）⇒ 违约：原始载荷一并留在 `cause`，便于定位是哪一处漂移
      return err('unknown', toMessage(e), r);
    }
  } catch (e) {
    return err('unknown', toMessage(e), e);
  }
}

/** provider 元信息数组（后端字段就叫 `providers`；缺失即违约，不是「空列表」） */
const providersOf = (raw: Record<string, unknown>): ApiProviderMeta[] =>
  need(raw, 'providers', Array.isArray) as ApiProviderMeta[];

/** 归一 `ApiSetup`（缺省并发取 SSOT 常量 —— 源 `loadApiSetup` 的 `concurrency: 3`） */
function normalizeSetup(raw: unknown): ApiSetup {
  const r = asRecord(raw);
  return {
    imageProviderId: typeof r.imageProviderId === 'string' ? r.imageProviderId : null,
    videoProviderId: typeof r.videoProviderId === 'string' ? r.videoProviderId : null,
    fallbackProviderId: typeof r.fallbackProviderId === 'string' ? r.fallbackProviderId : null,
    concurrency: typeof r.concurrency === 'number' ? r.concurrency : DEFAULT_API_CONCURRENCY,
  };
}

export function createElectronApiPort(): ApiPort {
  return {
    providersList: async () => callOk((api) => api.apiProvidersList(), providersOf),

    configGet: async () =>
      callOk((api) => api.apiConfigGet(), (r) => ({
        providers: providersOf(r),
        // ⚠️ 后端 `main.js:3090-3097` 恒给 `configs` 对象（`publicOf` 逐 provider）——
        //    `?? {}` 只兜「后端漏字段」这一种违约（不假装读到了配置）
        configs: (isRecord(r.configs) ? r.configs : {}) as ApiConfigMap,
      })),

    configSet: async (providerId: string, patch: unknown) =>
      callOk((api) => api.apiConfigSet(providerId, patch), (r) => ({ config: r.config })),

    configSetKey: async (providerId: string, key: string) =>
      callOk((api) => api.apiConfigSetKey(providerId, key), (r) => ({
        keyHint: typeof r.keyHint === 'string' ? r.keyHint : undefined,
        maskedBy: typeof r.maskedBy === 'string' ? r.maskedBy : undefined,
      })),

    configSetSecret: async (providerId: string, key: string) =>
      // ⚠️ 原 `r.hasSecret === true` 把「后端没给」和「后端说没有」压成同一个 `false`
      callOk((api) => api.apiConfigSetSecret(providerId, key), (r) => ({
        hasSecret: need(r, 'hasSecret', isBool),
      })),

    configTest: async (providerId: string) =>
      callOk((api) => api.apiConfigTest(providerId), (r) => ({
        message: typeof r.message === 'string' ? r.message : undefined,
      })),

    // ⚠️ `jobId: ''` 是「假成功」：后端形状一漂移，UI 拿到空 id 却以为提交成功
    jobSubmit: async (payload: unknown) =>
      callOk((api) => api.apiJobSubmit(payload), (r) => ({
        jobId: need(r, 'jobId', isStr),
      })),

    jobBatch: async (basePayload: unknown, matrix: unknown) =>
      callOk((api) => api.apiJobBatch(basePayload, matrix), (r): ApiBatchResult => ({
        // 三个字段**逐位对应**，缺一个整份载荷就是坏的 —— 不能各自兜底成空
        jobIds: need(r, 'jobIds', Array.isArray) as Array<string | null>,
        errors: need(r, 'errors', Array.isArray) as Array<string | null>,
        total: need(r, 'total', isNum),
      })),

    jobCancel: async (jobId: string) =>
      callOk((api) => api.apiJobCancel(jobId), (r) => ({
        // 后端只回字符串（`job-manager.js:462/467` 只产出 done/failed/cancelled）；
        // ★ 缺失即违约 —— 不再兜底成 `cancelled`（那是「未取消」被显示成「已取消」）
        status: need(r, 'status', isStr) as ApiJobStatus,
      })),

    jobList: async () =>
      callOk((api) => api.apiJobList(), (r) => need(r, 'jobs', Array.isArray) as ApiJobEvent[]),

    setupGet: async () =>
      callOk((api) => api.apiSetupGet(), (r) => ({
        setup: normalizeSetup(r.setup),
        usage: (isRecord(r.usage) ? r.usage : {}) as ApiUsage,
      })),

    setupSet: async (patch: Partial<ApiSetup>) =>
      callOk((api) => api.apiSetupSet(patch), (r) => ({ setup: normalizeSetup(r.setup) })),

    /** ★ 订阅：取取消函数并返回（W1） */
    onJobEvent: (cb) => {
      const api = getHostApi();
      if (!api) return () => undefined;
      const off = api.onApiJobEvent((payload) => cb(payload as ApiJobEvent));
      return typeof off === 'function' ? off : () => undefined;
    },
  };
}
