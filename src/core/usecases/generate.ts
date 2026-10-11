/**
 * 生成用例（**双通道**：网页通道 / API 通道）
 *
 * 依据：docs/04-AI协议版.md 单元 4 + docs/03-人类版.md §5
 *   - 网页通道：`SitePort.send`（选择器策略在 adapter 内部）
 *   - API 通道：`HostPort.api.jobSubmit` / `jobBatch`
 *   - 失败决策：`core/rules/failure` 的 `decideFailAction`（`maxRetry = 2`）
 *
 * ⚠️ **原则 1**：本文件**绝不写 store** —— 只返回 `Result`，由 `state` 层写入
 * ⚠️ **原则 6**：失败时 `message` 必须**原样转发**（不得改写 / 编造）
 * ⚠️ **原则 4**：时间一律经 `ClockPort`，不得 `Date.now()`
 */

import type { Account, PoolStrategy } from '@/stable/model/account';
import type { HostPort } from '@/core/ports/host.port';
import type { SiteRegistry } from '@/core/ports/site.port';
import type { ClockPort } from '@/core/ports/clock.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { decideByReason } from '@/core/rules/failure';
import type { SendFailKind } from '@/constants/failure';
import { pickAccount } from '@/core/rules/accountPool';
import { buildImagePayload, buildVideoPayload } from '@/core/rules/payload';
import type { ApiBatchResult, GenResult } from '@/stable/model/gen';
import { BATCH_RATIOS } from '@/constants/models';
import { ACCOUNT_PICK_TEXT, SEND_TEXT } from '@/constants/text';

/**
 * ⚠️ 原 `GEN_MAX_RETRY = 2` **已删**（2026-10-10，TD-03-2）——
 *    它与 `constants` 的 `FAILURE_MAX_RETRY`（同为 2）**是同一个真相的两份**。
 *    现统一用 `FAILURE_MAX_RETRY`（SSOT 在 `constants/index.ts`；语义：
 *    `attempt >= maxRetry ⇒ give-up` 且 `attempt` 从 1 起 ⇒ 2 = 最多 2 次尝试）。
 */
import { FAILURE_MAX_RETRY } from '@/constants';

/** 注册表里任意一个站点适配器（避免对 `SiteRegistry` 用字符串索引） */
type AnySitePort = NonNullable<SiteRegistry[keyof SiteRegistry]>;

export interface GenDeps {
  sites: SiteRegistry;
  host: Pick<HostPort, 'api'>;
  clock: ClockPort;
  /** `styleId[]` → 拼接后的风格前缀（来自 `constants/stylePresets`，由 state 提供） */
  stylePrefixOf: (styleIds: readonly string[]) => string;
  /**
   * ★ **占用账号**（原 `Fi` 34596）—— 写 store 的动作由 **state 注入**（判据 D1 / 原则 1）
   *
   * 为什么必须注入而不是在本层直接写：占用**必须发生在「选号之后、发送之前」**，
   * 而选号就在本文件里 ⇒ 只有这里能给出正确的时序；但 `set()` 只能发生在 `state/**`。
   * 这正是 `docs/16` §2.4「`setBusyAccounts` 零调用 ⇒ `all-busy` 排队永不触发」的修法。
   *
   * @returns `false` = 已被占用（原 `Fi` 的 `return false`）
   */
  holdAccount: (accountId: string, nodeId: string | null) => boolean;
  /** ★ **释放**（原 `tn` 34614 的 `releaseBusy: true`） */
  releaseAccount: (accountId: string) => void;
}

/**
 * 生成结果（交给 state 层写入）
 *
 * ★ **2026-10-10 修**：原 `jobs?: ApiJobLite[]` 与后端实测不符 ——
 *   `api-job:submit` **只回 `jobId`**（任务对象要等 `onJobEvent` 推送），
 *   `api-job:batch` 回的是 `{jobIds, errors, total}`。故拆成 `jobId` / `batch` 两个字段。
 */
export interface GenOutcome {
  via: 'web' | 'api';
  /** 实际使用的账号（API 通道为空） */
  accountId?: string;
  /** 网页通道：生成结果 */
  results?: GenResult[];
  /** API 通道：单个任务 id（结果经 `onJobEvent` 回来） */
  jobId?: string;
  /** API 通道：批量提交结果（逐位 `jobIds` / `errors`） */
  batch?: ApiBatchResult;
}

interface CommonInput {
  accounts: readonly Account[];
  poolStrategy?: PoolStrategy;
  /** 指定账号；`'auto'` / 缺省 = 走池调度 */
  accountId?: string | 'auto';
  /** 风格 id（查前缀） */
  styleIds?: readonly string[];
  ratio?: string;
  sourceNodeId?: string | null;
  images?: readonly string[];
  /** 池游标（round-robin 用） */
  cursor?: number;
}

export interface ImageGenInput extends CommonInput {
  text: string;
  count?: number;
  model?: string;
  resolution?: string;
  /** 生成通道 */
  channel: 'doubao' | 'api';
}

export interface VideoGenInput extends CommonInput {
  text: string;
  model?: string;
  duration?: number;
  channel: 'doubao' | 'api';
  /** 批量出片：按三比例各出一片 */
  batch?: boolean;
}

/** 从站点注册表取账号类型对应的适配器（无适配器 ⇒ 明确报错，**不静默回落**） */
function siteOf(deps: GenDeps, account: Account) {
  return deps.sites[account.type] ?? null;
}

/**
 * 网页通道：发送 + 失败决策（`retry` / `retry-switch` / `give-up`）
 *
 * ⚠️ 失败 `message` **原样转发**（原则 6）；只有 `reason` 用分类结果
 */
async function sendViaWeb(
  deps: GenDeps,
  input: CommonInput,
  buildPayload: (account: Account) => Parameters<AnySitePort['send']>[1],
): Promise<Result<{ accountId: string; results: GenResult[] }>> {
  const excluded: string[] = [];
  /** ⚠️ `attempt` 从 **1** 起（与源码 `g3` 的 `Number(attempt) || 1` 一致） */
  let attempt = 1;
  /** 最后一次的原始错误（必须原样带出去 —— 原则 6） */
  let lastMessage = '';
  let lastReason: SendFailKind = 'unknown';

  while (attempt <= FAILURE_MAX_RETRY) {
    const picked = pickAccount(
      input.accounts,
      {
        strategy: input.poolStrategy,
        exclude: excluded,
        preferId: input.accountId && input.accountId !== 'auto' ? input.accountId : null,
        cursor: input.cursor,
      },
    );

    if (!picked.account) {
      // 池里没有可用账号 —— 这是**明确的失败**，不是「静默回落」
      return err(
        picked.reason === 'no-account' ? 'no-account' : lastReason,
        picked.reason === 'no-account' ? '无可用账号' : lastMessage,
      );
    }

    const account = picked.account;
    const site = siteOf(deps, account);
    if (!site) {
      // 站点适配器缺失：**明确报错**（不编造「网络异常」之类）
      // ★ 文案取自 SSOT（判据 C1：同一句原先在本文件内联，`sendToSite` 是第 2 处）
      return err('unknown', SEND_TEXT.noSiteAdapter(account.type));
    }

    // ★ 占用（原 `Fi`）—— 选号与占用之间可能被别的任务抢先 ⇒ 原版给 `hold-failed`
    //   并在 `finally` 里释放（我们的 `SitePort.send` 是「发送 + 等结果」，
    //   返回即已结束 ⇒ 与源版 `gS` 的 `finally` 同款；源版 `tO` 成功不释放是因为
    //   它的发送是 fire-and-forget、结果靠轮询回来）
    const res = await (async () => {
      if (!deps.holdAccount(account.id, input.sourceNodeId ?? null)) return null;
      try {
        return await site.send(account, buildPayload(account));
      } finally {
        deps.releaseAccount(account.id);
      }
    })();
    if (!res) return err('busy', ACCOUNT_PICK_TEXT.holdFailed);

    if (res.ok) {
      return ok({ accountId: account.id, results: res.value.results });
    }

    // ★ 转发原始错误（不改写）
    lastMessage = res.message;
    lastReason = res.reason;

    // ★ 用**生产者已分类的 `reason`** 决策，不拿 message 二次分类（原则 6）
    const decision = decideByReason(res.reason, attempt);
    if (decision.action === 'give-up') return err(res.reason, res.message, res.cause);

    if (decision.action === 'retry-switch') excluded.push(account.id);
    attempt += 1;
  }

  return err(lastReason, lastMessage);
}

/** 生成图片 */
export async function generateImage(deps: GenDeps, input: ImageGenInput): Promise<Result<GenOutcome>> {
  const stylePrefix = deps.stylePrefixOf(input.styleIds ?? []);
  const now = deps.clock.now();

  if (input.channel === 'api') {
    // API 通道：交给宿主，密钥与 provider 解析都在主进程
    const res = await deps.host.api.jobSubmit({
      kind: 'image',
      prompt: input.text,
      stylePrefix,
      ratio: input.ratio,
      count: input.count,
      model: input.model,
      resolution: input.resolution,
      sourceNodeId: input.sourceNodeId,
      images: input.images,
    });
    if (!res.ok) return res;
    return ok({ via: 'api', jobId: res.value.jobId });
  }

  const web = await sendViaWeb(deps, input, (account) =>
    toSitePayload(
      buildImagePayload({
        account,
        text: input.text,
        stylePrefix,
        ratio: input.ratio,
        count: input.count,
        model: input.model,
        resolution: input.resolution,
        images: [...(input.images ?? [])],
        sourceNodeId: input.sourceNodeId,
        now,
      }),
    ),
  );
  if (!web.ok) return web;
  return ok({ via: 'web', accountId: web.value.accountId, results: web.value.results });
}

/** 生成视频（`batch` = 按 16:9 / 9:16 / 1:1 各出一片） */
export async function generateVideo(deps: GenDeps, input: VideoGenInput): Promise<Result<GenOutcome>> {
  const stylePrefix = deps.stylePrefixOf(input.styleIds ?? []);
  const now = deps.clock.now();

  if (input.channel === 'api') {
    const base = {
      kind: 'video' as const,
      prompt: input.text,
      stylePrefix,
      model: input.model,
      duration: input.duration,
      sourceNodeId: input.sourceNodeId,
      images: input.images,
    };
    if (input.batch) {
      // 批量出片：三比例
      const res = await deps.host.api.jobBatch(base, { ratios: [...BATCH_RATIOS] });
      if (!res.ok) return res;
      return ok({ via: 'api', batch: res.value });
    }
    const res = await deps.host.api.jobSubmit({ ...base, ratio: input.ratio });
    if (!res.ok) return res;
    return ok({ via: 'api', jobId: res.value.jobId });
  }

  const web = await sendViaWeb(deps, input, (account) =>
    toSitePayload(
      buildVideoPayload({
        account,
        text: input.text,
        model: input.model,
        duration: input.duration,
        ratio: input.ratio,
        images: [...(input.images ?? [])],
        sourceNodeId: input.sourceNodeId,
        stylePrefix,
        now,
      }),
    ),
  );
  if (!web.ok) return web;
  return ok({ via: 'web', accountId: web.value.accountId, results: web.value.results });
}

/** 把跨进程报文压成 `SitePort.send` 需要的形状（选择器/协议细节留在 adapter） */
function toSitePayload(p: {
  content: { text: string; images: unknown[]; params: Record<string, unknown>; autoSend: boolean };
  source: 'canvas-account-node' | 'canvas-text-node' | 'canvas-image-gen';
}): Parameters<AnySitePort['send']>[1] {
  return {
    text: p.content.text,
    images: p.content.images as string[],
    params: p.content.params,
    autoSend: p.content.autoSend,
    source: p.source,
  };
}

/** 供上层透传：把抛出物转原文（**不做任何加工**） */
export { toMessage as rawMessage };
