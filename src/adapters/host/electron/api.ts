/**
 * ApiPort 的 Electron 实现（第三方 provider）
 *
 * ⚠️ 密钥明文**永不过桥**：`configSetKey` / `configSetSecret` 只单向送入；读取只回 `keyHint`（脱敏）
 * ⚠️ W1：`onApiJobEvent` 是订阅，**必须取取消函数**
 *
 * ★ **2026-10-10 修（原则 6）**：原实现用 `call<T>()` 把返回值直接 `ok(...)` 出去 ——
 *   **完全无视后端的 `ok:false`**。而本工程这一组方法**每一个**都用
 *   `{ok:false, error}` / `{ok:false, message}` 表达失败（见 `main.js`）
 *   ⇒ 失败被吞成「成功且值为空」，UI 永远看不到原因。现统一按 `ok` 标志收口。
 *
 * ★ **本组收口口径（原则 6 · 母体 M2「守卫声索 > 覆盖」）**：
 *   ① 判别位 `ok !== true` 即失败（**fail-closed** —— 后端漏 `ok` / 换了形状一律算失败）；
 *   ② 成功路径上，**后端每条 return 都恒带的字段一律走 `need()`**（缺失即契约违约，不静默给默认值）；
 *   ③ 后端原始载荷整体留在 `cause` —— `{ok:false, kind, message, advice}`（`job-manager.js:343`）
 *      不再被「error → message → 兜底」的字符串优先级**拍扁成一个 string**。
 *   ⚠️ **必需字段的判据 = 后端 `main.js` 每条 return**（逐条回源，见各 `pick` 处的注释）；
 *      **可选**字段（如 `api-config:test` 的 `message`）仍走 `typeof` 判定，不冒充必需。
 *
 * ⚠️ 类型断言只出现在**宿主边界**（后端返回是 `unknown`，形状由 `main.js` / `job-manager.js` 定）。
 */

import type { ApiPort } from '@/core/ports/host.port';
import type {
  ApiBatchResult,
  ApiConfigMap,
  ApiJobPayload,
  ApiJobStatus,
  ApiJobVariant,
  ApiProviderMeta,
  ApiSetup,
  ApiUsage,
} from '@/stable/model/gen';
import { DEFAULT_API_CONCURRENCY } from '@/constants';
import { COMMON_TEXT } from '@/constants/text';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { asRecord, isRecord } from '@/lib/object';
import { isApiJobEvent } from '@/stable/model/gen';
import { log } from '@/lib/log';
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
    configGet: async () =>
      callOk((api) => api.apiConfigGet(), (r) => ({
        // ★ 后端 `main.js` **每条 return 都恒带** `providers` + `configs`（`publicOf` 逐 provider）
        //   ⇒ 两个都是**必需字段**（缺失 = 契约违约，`TD-04-6`）
        providers: providersOf(r),
        configs: need(r, 'configs', isRecord) as ApiConfigMap,
      })),

    configSet: async (providerId: string, patch: unknown) =>
      // ★ 后端 `main.js` 恒返 `{ok:true, config: publicOf(...)}`（恒为对象）⇒ `config` 必需
      callOk((api) => api.apiConfigSet(providerId, patch), (r) => ({ config: need(r, 'config', isRecord) })),

    configSetKey: async (providerId: string, key: string) =>
      // ★ 后端 `main.js` 恒返 `{ok:true, keyHint, maskedBy}`（两者都是 `maskKey(key)`）
      callOk((api) => api.apiConfigSetKey(providerId, key), (r) => ({
        keyHint: need(r, 'keyHint', isStr),
        maskedBy: need(r, 'maskedBy', isStr),
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
    jobSubmit: async (payload: ApiJobPayload) =>
      callOk((api) => api.apiJobSubmit(payload), (r) => ({
        jobId: need(r, 'jobId', isStr),
      })),

    jobBatch: async (basePayload: ApiJobPayload, matrix: readonly ApiJobVariant[]) =>
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

    // ⚠️ `jobList` 已于 2026-10-12 删除（源前端 0 命中、不拉列表 —— 见 `core/ports/host.port.ts` 该处留证）

    setupGet: async () =>
      callOk((api) => api.apiSetupGet(), (r) => ({
        // ★ 后端 `main.js` 恒返 `{ok:true, setup, usage}`（`getSetup` / `getUsage` 恒为对象）
        setup: normalizeSetup(need(r, 'setup', isRecord)),
        usage: need(r, 'usage', isRecord) as ApiUsage,
      })),

    setupSet: async (patch: Partial<ApiSetup>) =>
      // ★ 后端 `main.js` 恒返 `{ok:true, setup}`（`setSetup` 内部返 `getSetup()`）
      callOk((api) => api.apiSetupSet(patch), (r) => ({ setup: normalizeSetup(need(r, 'setup', isRecord)) })),

    /** ★ 订阅：取取消函数并返回（W1） */
    onJobEvent: (cb) => {
      const api = getHostApi();
      if (!api) return () => undefined;
      const off = api.onApiJobEvent((payload) => {
        // ★ **边界收窄**（与拉取侧的 `checkOk` / `need` 同法，fail-closed）—— 推送载荷来自后端、
        //   属不可信输入；不收窄 ⇒ 形状漂移会**静默变成 `undefined`**（`TD-04-12`）。
        //   形状不符 ⇒ **丢弃 + 留痕**（不静默、不 cb）
        if (!isApiJobEvent(payload)) {
          log.warn('[api] onJobEvent 载荷形状不符，已丢弃:', payload);
          return;
        }
        cb(payload);
      });
      return typeof off === 'function' ? off : () => undefined;
    },
  };
}
