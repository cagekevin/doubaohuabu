/**
 * 生成用例（**双通道**：网页通道 / API 通道）
 *
 * 依据：docs/过程.md 单元 4 + docs/过程.md §5
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
import type { SendResult, SiteRegistry } from '@/core/ports/site.port';
import type { ClockPort } from '@/core/ports/clock.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { decideByReason } from '@/core/rules/failure';
import { FAIL_LABEL, type SendFailKind } from '@/constants/failure';
// ★ 通道值域的真源（`GEN_CHANNELS`）在 `constants/models` —— 这两个入参类型只引用它，不重写联合
import type { GenChannel } from '@/constants/models';
import { pickAccount } from '@/core/rules/accountPool';
import { buildImagePayload, buildVideoPayload, toSitePayload } from '@/core/rules/payload';
import { applyStylePrefix, clampImageCount } from '@/core/rules/prompt';
import type { ApiBatchResult, ApiJobAttempt, GenResult } from '@/stable/model/gen';
import { API_VIDEO_RESOLUTION, API_VIDEO_WATERMARK, BATCH_RATIOS } from '@/constants/models';
import { ACCOUNT_PICK_TEXT, API_TEXT, SEND_TEXT } from '@/constants/text';
import { makeGenAttempt } from '@/core/rules/genHistory';

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
   * 这正是 `docs/过程.md` §2.4「`setBusyAccounts` 零调用 ⇒ `all-busy` 排队永不触发」的修法。
   *
   * @returns `false` = 已被占用（原 `Fi` 的 `return false`）
   */
  holdAccount: (accountId: string, nodeId: string | null) => boolean;
  /** ★ **释放**（原 `tn` 34614 的 `releaseBusy: true`） */
  releaseAccount: (accountId: string) => void;
  /**
   * ★ **当前"忙"的账号 id**（原 `Hk` 34611 的 `accountBusy` 读侧）—— 由 **state 注入**（原则 1）
   *
   * ⚠️ **为什么是取数函数而不是快照**：`sendViaWeb` **跨重试**多次选号，忙表在两次尝试
   *    之间会变（别的任务占用 / 释放）⇒ 每次选号都必须**实时**读。
   * ⚠️ **TD-02-16 的修法**：此前本文件选号**不传 `busy`** ⇒ 选中一个正在生成的账号 ⇒
   *    `holdAccount` 失败 ⇒ 直接报 `busy`（**而不是跳过它换下一个空闲号**）。
   */
  busyIds: () => readonly string[];
  /**
   * ★ **造一个尝试 id**（原 `O$` `shared.js:25514-25517`：`` `a${Date.now().toString(36)}${seq.toString(36)}` ``）。
   *
   * ⚠️ **为什么是注入**：源版那个函数**自己**取 `Date.now()` 并用模块级计数器 —— 两条都违反
   *    原则 4（`core` 禁时间 / 禁隐式全局状态）。由 `state` 注入即可保持纯 + 可测。
   */
  makeAttemptId: () => string;
  /**
   * ★★ **一次发送的「前后编排」**（注入）—— 源 `sendPayload` 的**发送半**
   *   （`_Component43.jsx:2846-3005`）：`读基线 → Be 发送 → 写 _pendingAttempt → 起生成确认`。
   *
   * ⚠️ **为什么是注入而不是在 `core` 里做**：源版这段**直接读页面 ＋ 写 store**
   *    （`getURL` / 基线探测 / `updateNodeData` / `kt(...)`），而本仓 `core` 既不写 store
   *    也不碰宿主（原则 1）⇒ 与 `holdAccount` / `releaseAccount` 同法，由 `state` 注入
   *    （实现见 `state/sendWithConfirm.ts` —— 三条发送路**共用一份**，判据 C1）。
   *
   * ⚠️ **时序**：整段包裹在 `holdAccount` 与 `releaseAccount` **之间**（源同：写在 `finally` 释放之前）。
   * ⚠️ **实现必须自己调 `send()`** —— 它要在**发送之前**读基线（发完再读会把已经到达的回复吞掉，
   *    源 `sendPayload:2846-2861` 的注释就是这个约束）。
   * ⚠️ 缺省 ⇒ 调用方直发（见下方调用点的 `??`）。
   */
  onSend?: (input: {
    accountId: string;
    payload: Parameters<AnySitePort['send']>[1];
    /** 源 `sendPayload` 的第三个入参 `me`（**与报文里的 `sourceNodeId` 不是同一个东西**） */
    sourceNodeId: string | null;
    /** ★ 真正的发送（`site.send`）—— 实现**必须**调它，且要在读基线之后 */
    send: () => Promise<Result<SendResult>>;
  }) => Promise<Result<SendResult>>;
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
  /** ★ BP-44：网页通道的轮询终止原因（`timeout` 且 0 结果 ⇒ state 提示「等待超时」） */
  endReason?: SendResult['endReason'];
  /** ★ BP-03：网页通道的生成键（`sessionId`）—— state 用它 `bindImageGenKey`（回填 params） */
  key?: string;
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
  /** 生成通道（真源 = `constants/models.GEN_CHANNELS`） */
  channel: GenChannel;
  /**
   * ★ 已解析的 provider id（**API 通道必填给值**）—— 同 `VideoGenInput.providerId`。
   *   由 `state` 用 `resolveApiProviderId('image', …)` 求出（纯规则 `core/rules/apiProvider.ts`）。
   */
  providerId?: string | null;
}

export interface VideoGenInput extends CommonInput {
  text: string;
  model?: string;
  duration?: number;
  /** 生成通道（真源 = `constants/models.GEN_CHANNELS`） */
  channel: GenChannel;
  /** 批量出片：按三比例各出一片 */
  batch?: boolean;
  /**
   * ★ 已解析的 provider id（**API 通道必填给值**）—— 由 `state` 用
   *   `resolveApiProviderId('video', …)` 求出（纯规则在 `core/rules/apiProvider.ts`）。
   *   ⚠️ 后端 `job-manager.js:submit` 的第一个参数就是 `providerId`；**不传 ⇒
   *   `registry.getProvider(undefined)` ⇒ 提交必失败**。
   */
  providerId?: string | null;
  /** 后端 `params.resolution`（缺省用 SSOT 的 `API_VIDEO_RESOLUTION`） */
  resolution?: string;
  /** 后端 `params.watermark`（缺省用 SSOT 的 `API_VIDEO_WATERMARK`） */
  watermark?: string;
  /**
   * ★ provider 展示名（**只用于 `attempt` 的 `accountName` / `note`**，源 `He.name`）——
   *   由 `state` 从 `apiProvidersMeta` 查出后传入。
   */
  providerName?: string;
  /**
   * ★ **原始正文**（未做 `@图N` 改写的 `data.text`）—— 只用于 `attempt.edit.text`。
   *
   * ⚠️ 源 `Z3_1.jsx:819` 写的是 `N.current`（**编辑器文本**，不是改写后的 `prompt`）；
   *    版本切换（`selectVersionPatch`）要靠它把正文**还原**回节点 ⇒ 必须是原始形态。
   * ⚠️ 缺省 ⇒ 回落改写后的 `text`（不造空值）。
   */
  rawText?: string;
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
): Promise<Result<{ accountId: string; sessionId: string; results: GenResult[]; endReason: SendResult['endReason'] }>> {
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
        // ★ TD-02-16：**必须带 `busy`** —— 否则会选中正在生成的账号，
        //   然后 `holdAccount` 失败直接报错（而不是换下一个空闲号）
        busy: deps.busyIds(),
        preferId: input.accountId && input.accountId !== 'auto' ? input.accountId : null,
        cursor: input.cursor,
      },
    );

    if (!picked.account) {
      // 池里没有可用账号 / 全忙 / 全被排除 —— 这是**明确的失败**，不是「静默回落」
      // ⚠️ 文案取自 SSOT（`FAIL_LABEL`）—— 原先内联的「无可用账号」与它是**同一真相的两份**（TD-03-3）
      if (picked.reason === 'no-account') return err('no-account', FAIL_LABEL['no-account']);
      // ⚠️ `all-busy` 只有在接通 `busy`（TD-02-16）之后才**可达** —— 它此前被"选中忙号再占用失败"掩盖
      if (picked.reason === 'all-busy') return err('busy', FAIL_LABEL.busy);
      // `all-excluded`（本轮可用账号全失败过）⇒ 保留**最后一次的原始错误**（原则 6）
      return err(lastReason, lastMessage);
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
    const payload = buildPayload(account);
    const res = await (async () => {
      if (!deps.holdAccount(account.id, input.sourceNodeId ?? null)) return null;
      try {
        // ★★ 源 `sendPayload` 的**发送半**（`:2846-3005`：读基线 → 发送 → 写 `_pendingAttempt` → 起生成确认）
        //    收在注入实现里（`state/sendWithConfirm`，三条发送路共用一份）；未注入 ⇒ 直发。
        const send = (): Promise<Result<SendResult>> => site.send(account, payload);
        return deps.onSend
          ? await deps.onSend({
              accountId: account.id,
              payload,
              sourceNodeId: input.sourceNodeId ?? null,
              send,
            })
          : await send();
      } finally {
        deps.releaseAccount(account.id);
      }
    })();
    if (!res) return err('busy', ACCOUNT_PICK_TEXT.holdFailed);

    if (res.ok) {
      return ok({
        accountId: account.id,
        sessionId: res.value.sessionId,
        results: res.value.results,
        endReason: res.value.endReason,
      });
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
    /*
     * ★★ **2026-10-11 报文形状更正（清场 `TD-03-7`）** —— 与视频通道同病同修：
     *   后端 `job-manager.js:415` 读 `providerId / kind / prompt / params / nodeId / refSources`，
     *   原报文传的是 `sourceNodeId` / `images` / `model` / `count` ⇒ `providerId === undefined`
     *   ⇒ `registry.getProvider(undefined)` 恒空 ⇒ **文生图 API 提交必失败**。
     * 现**逐字对源**（`_Component45.jsx:921-940`）：
     *   · `params = { ratio }`（模型 / 分辨率**不进** params —— 它们由 provider 配置决定）
     *   · `prompt = 风格前缀 ? 前缀 + 正文.trim() : 正文.trim()`（源 924；注意**与视频不同**：
     *     图片**不加**额外的「，」—— 前缀自带尾「，」）
     *   · ★ **张数 = N 个任务**：源用 `submitApiBatch(base, Array.from({length: N}, () => ({})))`
     *     把同一请求展开成 N 个变体（复用后台并发队列），**不是**一个任务出 N 张。
     */
    // ⚠️ 不做 `?? ''`（`TD-16-104`）：`ImageGenInput.text` 是**必填 `string`** ⇒ `??` 恒不触发（死兜底）。
    //   `String(...)` 一并去掉 —— 类型层已保证是 string（上游 `state/generate` 同批已删兜底）。
    const body = input.text.trim();
    const base = {
      providerId: input.providerId ?? null,
      kind: 'image' as const,
      // ★ 前缀拼接收在纯层 `applyStylePrefix`（本行原为内联副本 —— 判据 C1：能一种的别搞两种）
      prompt: applyStylePrefix(body, stylePrefix),
      params: { ratio: input.ratio },
      nodeId: input.sourceNodeId ?? null,
      refSources: [...(input.images ?? [])],
    };
    const n = clampImageCount(input.count);
    const res = await deps.host.api.jobBatch(base, Array.from({ length: n }, () => ({})));
    if (!res.ok) return res;
    return ok({ via: 'api', batch: res.value });
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
  return ok({
    via: 'web',
    accountId: web.value.accountId,
    key: web.value.sessionId,
    results: web.value.results,
    endReason: web.value.endReason,
  });
}

/** 生成视频（`batch` = 按 16:9 / 9:16 / 1:1 各出一片） */
export async function generateVideo(deps: GenDeps, input: VideoGenInput): Promise<Result<GenOutcome>> {
  const stylePrefix = deps.stylePrefixOf(input.styleIds ?? []);
  const now = deps.clock.now();

  if (input.channel === 'api') {
    /*
     * ★★ **2026-10-11 报文形状更正（清场：原报文与后端契约不符 ⇒ API 视频通道整体不可用）**
     *
     * 后端 `job-manager.js:submit(payload)` 读的是
     *   `providerId / kind / prompt / params / nodeId / refSources / attempt`
     *   （`electron/api/job-manager.js:415`），**不是** `sourceNodeId` / `images`。
     * 原报文传的是 `{kind, prompt, stylePrefix, model, duration, sourceNodeId, images}` ⇒
     *   `providerId === undefined` ⇒ `registry.getProvider(undefined)` 恒返回空
     *   ⇒ **提交必失败**（`未知服务商 undefined`）。
     * 现**逐字对源**（`Z3_1.jsx:879-903`）：
     *   · `params = {ratio, duration, resolution:'1080p', watermark:'off'}`（模型**不进** params）
     *   · `prompt = 风格前缀 ? `${前缀}，${正文}` : 正文`（源 803）
     *   · `nodeId` / `refSources`（参考图 dataUrl 数组）
     */
    const baseParams = {
      ratio: input.ratio,
      duration: input.duration,
      resolution: input.resolution ?? API_VIDEO_RESOLUTION,
      watermark: input.watermark ?? API_VIDEO_WATERMARK,
    };
    const providerName = input.providerName ?? '';
    const prompt = stylePrefix ? `${stylePrefix}，${input.text}` : input.text;
    /** 写进 `attempt.edit.text` 的**原始正文**（源是 `N.current` —— 编辑器文本，不是改写后的 prompt） */
    const rawText = input.rawText ?? input.text;
    const styleIds = input.styleIds ?? [];
    /**
     * ★ 造一条尝试记录（原 `Fc`，`Z3_1.jsx:810-828` 单发 / `:904-927` 批量）
     *
     * ⚠️ **不带它 ⇒ `genHistory` 永不写入 ⇒ 版本历史对 API 出片为空**（`TD-03-6`）。
     * ⚠️ `id` / `at` 由注入给出（原则 4：`core` 不自己取时间 / 随机）。
     */
    const attemptOf = (ratio: string, batch: boolean): ApiJobAttempt =>
      makeGenAttempt({
        id: deps.makeAttemptId(),
        at: now,
        accountName: batch
          ? API_TEXT.videoAccountBatch(providerName, ratio)
          : API_TEXT.videoAccount(providerName),
        params: { ratio, duration: input.duration, styleId: styleIds[0] ?? null },
        prompt,
        edit: {
          text: rawText,
          aspectRatio: ratio,
          duration: input.duration,
          model: input.model,
          sendAccount: 'api',
          styleIds,
        },
        status: 'pending',
        note: batch
          ? API_TEXT.attemptNoteBatch(providerName, ratio)
          : API_TEXT.attemptNote(providerName),
      });

    const base = {
      providerId: input.providerId ?? null,
      kind: 'video' as const,
      prompt,
      params: baseParams,
      nodeId: input.sourceNodeId ?? null,
      refSources: [...(input.images ?? [])],
    };
    if (input.batch) {
      // 批量出片（原 `Z3_1.jsx:885-892` / `904-927`）：同一提示词 + 三比例各出一片，**每个变体各带一条 attempt**。
      // ⚠️ matrix **必须是数组** —— 后端 `submitBatch` 用 `Array.isArray(matrix)` 判定
      //   （`job-manager.js:464`）；传对象会被静默当成空数组 ⇒ **提交 0 个任务却报成功**（假成功）。
      const matrix = BATCH_RATIOS.map((ratio) => ({
        params: { ratio },
        attempt: attemptOf(ratio, true),
      }));
      const res = await deps.host.api.jobBatch(base, matrix);
      if (!res.ok) return res;
      return ok({ via: 'api', batch: res.value });
    }
    const res = await deps.host.api.jobSubmit({ ...base, attempt: attemptOf(input.ratio ?? '', false) });
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
  return ok({ via: 'web', accountId: web.value.accountId, results: web.value.results, endReason: web.value.endReason });
}

/** 供上层透传：把抛出物转原文（**不做任何加工**） */
export { toMessage as rawMessage };
