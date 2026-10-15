/**
 * usecase · 提示词分析 / 调整（原 `gS` shared.js:39044-39255 + `yS` 39256-39449）
 *
 * ★ **拆分**（判据 A1 + 原则 1）：
 *   · **纯决策**：`core/rules/analyzePrompt.ts`（`CD` / `oS` / `$D`）
 *   · **模型指令**：`constants/analyzePrompts.ts`（`ND` / `ED`）
 *   · **页内动作**：`SitePort.askWithImage`（adapter）
 *   · **编排 + 状态机**：本文件 —— 源版把「阶段流转 + 错误落点」直接写进 store，
 *     这里改成**返回要落的 `analyzePrompt` 补丁**，由 state 写（原则 1）
 *
 * ⚠️ **`patch` 的语义（调用方必须照此落）**：它是一份**完整的** `analyzePrompt` 对象，
 *    state 应 `updateNodeData(nodeId, { analyzePrompt: patch })`（**整体替换**，不是再合并），
 *    因为源版每处都是 `u({analyzePrompt: {...}})` 整对象替换。
 *    `patch === null` = **源版那一步根本不写数据**（`yS` 的五道前置闸）。
 */

import { isAccountUsable, type Account, type PoolStrategy, type SiteType } from '@/stable/model/account';
// ★ `analyzePrompt` 的**形状真源**在契约层（`stable/model`，与 `GenHistory` 同法）
import type { AnalyzePromptState } from '@/stable/model/node';
import type { BackendPagePort } from '@/core/ports/backendPage.port';
import type { SiteRegistry } from '@/core/ports/site.port';
import { err, ok, type Result } from '@/core/model/result';
import { parseAnalyzeResult, type AnalyzeParseResult } from '@/core/rules/analyzePrompt';
import { ANALYZE_INSTRUCTION, buildReviseInstruction } from '@/constants/analyzePrompts';
import { ANALYZE_TEXT, SEND_TEXT, SITE_CAP_TEXT, type ToastLevel } from '@/constants/text';
import { SEND_FALLBACK_CHAIN, withBackendPage, type SendToSiteDeps } from './sendToSite';

/** `nodes[].data.analyzePrompt` 的状态机（原 `gS`/`yS` 写进去的那个对象） */
export type AnalyzeStatus = AnalyzePromptState['status'];

export interface AnalyzeOutcome {
  /**
   * 要写到节点上的完整 `analyzePrompt`
   * `null` = **这一步不写节点数据**（只提示，原 `yS` 的前置闸）
   */
  patch: AnalyzePromptState | null;
  /** 要 `showToast(text, level)`；`null` = 不提示 */
  toast: { text: string; level: ToastLevel } | null;
  /** 解析出的成分（拿到模型回复时才有值） */
  parsed: AnalyzeParseResult | null;
}

export interface AnalyzeDeps extends SendToSiteDeps {
  backendPage: BackendPagePort;
  sites: SiteRegistry;
}

export interface AnalyzeInput {
  /** 素材节点 id（源版 `nodeId`） */
  nodeId: string;
  /** 原素材图片（`data:` / `img://`；源版取 `data.dataUrl`） */
  imageUrl: string;
  accounts: readonly Account[];
  busy?: readonly string[];
  strategy?: PoolStrategy;
  cursor?: number;
  /** 时间（原则 4） */
  now: number;
  /** 退级链（默认 `['doubao','dola']`） */
  chain?: readonly SiteType[];
  timeoutMs?: number;
  /**
   * ★ **中间态回调**（原 `gS`/`yS` 的 `onProgress` → `u({analyzePrompt:{status, phase, …}})`）
   *
   * ⚠️ 源在**选号完成之后、附图之前**就写第一段（`gS:39155-39168` / `yS:39362-39370`）——
   *    没有它，用户点了「分析提示词」后**界面毫无反馈**（一直等到出结果或报错）。
   * ⚠️ 第二段（附图后 / 提问前，`gS:39175` / `yS:39376`）发生在 `site.askWithImage`
   *    **内部**，本仓这一层够不着 ⇒ 只落第一段（已足以让 UI 显示「生成中 + phase」）。
   */
  onProgress?: (patch: AnalyzePromptState) => void;
}

/** 账号执行信息（源版每次写状态都带上这仨） */
const accountFields = (a: Account): Pick<AnalyzePromptState, 'accountId' | 'accountName' | 'accountType'> => ({
  accountId: a.id,
  accountName: a.name || a.id,
  accountType: a.type,
});

interface RunAskOptions {
  /** 关联任务 id（源版 `analyze:<nodeId>` / `revise:<nodeId>`） */
  jobId: string;
  purpose: string;
  instruction: string;
  /**
   * 指定账号（原 `yS` 只用原分析账号）—— 给了就**只试这一个**（链长 1，不退级）
   * ⚠️ 源版 `yS` 在账号忙时直接失败（`busy`），**不会**换号 ⇒ 这里必须单链
   */
  accountHint: Account | null;
  /** ★ 中间态的状态名（分析 = `analyzing` / 调整 = `revising` —— 源同） */
  progressStatus: 'analyzing' | 'revising';
  /** ★ 中间态的 phase 文案（源 `gS:39158` / `yS:39365` 那两句） */
  phaseAttach: string;
}

/** 内部：备好后台页 → 提问 → 解析回复 */
async function runAsk(
  deps: AnalyzeDeps,
  input: AnalyzeInput,
  opts: RunAskOptions,
): Promise<Result<{ parsed: AnalyzeParseResult; account: Account }>> {
  const accounts = opts.accountHint ? [opts.accountHint] : input.accounts;
  const chain = opts.accountHint ? [opts.accountHint.type] : (input.chain ?? SEND_FALLBACK_CHAIN);

  let used: Account | null = opts.accountHint;

  const res = await withBackendPage(
    deps,
    {
      accounts,
      sendAccount: opts.accountHint ? opts.accountHint.id : 'auto',
      busy: input.busy,
      strategy: input.strategy,
      cursor: input.cursor,
      chain,
      jobId: opts.jobId,
      purpose: opts.purpose,
      nodeId: input.nodeId,
      timeoutMs: input.timeoutMs,
    },
    async (ctx) => {
      used = ctx.account;
      // ★ **中间态第一段**（原 `gS:39155-39168` / `yS:39362-39370`）：选号完成 ⇒ 立刻让界面显示「在跑」
      input.onProgress?.({
        status: opts.progressStatus,
        phase: opts.phaseAttach,
        at: input.now,
        ...accountFields(ctx.account),
      });
      const ask = ctx.site.askWithImage;
      if (!ask) return err('unknown', SEND_TEXT.noCapability(ctx.site.kind, SITE_CAP_TEXT.analyzePrompt));
      const reply = await ask(
        { account: ctx.account, webContentsId: ctx.page.webContentsId },
        input.imageUrl,
        opts.instruction,
      );
      if (!reply.ok) return reply;
      return ok(parseAnalyzeResult(reply.value.text));
    },
  );

  if (!res.ok) return res;
  if (!used) return err('unknown', ANALYZE_TEXT.analyzeAccountGone);
  return ok({ parsed: res.value, account: used });
}

/**
 * 分析节点的提示词（原 `gS` 39044）
 *
 * 阶段（**顺序即语义**）：
 *   ① 入参缺失 ⇒ `status:'error'` + `badArgs`
 *   ② 选号 / 退级失败 ⇒ `status:'error'` + `error` 提示（源版文案取自 `SEND_TEXT`）
 *   ③ 占用失败 / 后台页失败 / 附件失败 / 问答失败 ⇒ 同一 catch ⇒ `status:'error'` + `分析失败：…`
 *   ④ 解析成功 ⇒ `status:'done', ok:true` + `info`
 *   ⑤ 解析失败 ⇒ `status:'done', ok:false`（**保留原文**）
 */
export async function analyzeNodePrompt(
  deps: AnalyzeDeps,
  input: AnalyzeInput,
): Promise<Result<AnalyzeOutcome>> {
  // ① 入参缺失（原 39079-39085）
  if (!input.nodeId || !input.imageUrl) {
    return ok({
      patch: { status: 'error', error: ANALYZE_TEXT.badArgs, at: input.now },
      toast: null,
      parsed: null,
    });
  }

  const res = await runAsk(deps, input, {
    jobId: `analyze:${input.nodeId}`,
    purpose: 'image-analysis',
    instruction: ANALYZE_INSTRUCTION,
    accountHint: null,
    progressStatus: 'analyzing',
    phaseAttach: ANALYZE_TEXT.phaseSendingImage,
  });

  if (!res.ok) {
    const message = ANALYZE_TEXT.analyzeFailed(res.message);
    return ok({
      patch: { status: 'error', error: message, at: input.now },
      toast: { text: message, level: 'error' },
      parsed: null,
    });
  }

  const { parsed, account } = res.value;
  const fields = accountFields(account);

  if (parsed.ok) {
    return ok({
      patch: {
        status: 'done',
        ok: true,
        zh_prompt: parsed.zh_prompt,
        en_prompt: parsed.en_prompt,
        json_prompt: parsed.json_prompt,
        raw: parsed.raw,
        at: input.now,
        ...fields,
      },
      toast: { text: ANALYZE_TEXT.analyzeDone, level: 'info' },
      parsed,
    });
  }

  // 解析失败：**保留原文**（原 39212-39227）
  return ok({
    patch: {
      status: 'done',
      ok: false,
      zh_prompt: parsed.raw,
      en_prompt: parsed.raw,
      json_prompt: null,
      raw: parsed.raw,
      at: input.now,
      ...fields,
    },
    toast: { text: ANALYZE_TEXT.analyzeNonJson, level: 'warn' },
    parsed,
  });
}

export interface ReviseInput extends Omit<AnalyzeInput, 'accounts'> {
  /** 用户修改意见（源版先 `trim`；空 ⇒ `bad-args`） */
  instruction: string;
  /**
   * 节点上**已有的** `analyzePrompt` 整对象（源版 `o`）
   * ⚠️ 因为 `yS` 有两处写 `{...o, …}`，必须拿到完整对象才能如实展开
   */
  previous: Record<string, unknown> | null;
  accounts: readonly Account[];
}

/**
 * 按用户意见调整提示词（原 `yS` 39256）
 *
 * ⚠️ **五道前置闸**（源版每道只有 `warn` 提示、**完全不写节点数据**）：
 *    没分析过 / 没原图 / 没账号 id / 原账号已不可用 / 原账号在忙
 */
export async function reviseNodePrompt(
  deps: AnalyzeDeps,
  input: ReviseInput,
): Promise<Result<AnalyzeOutcome>> {
  const instruction = String(input.instruction ?? '').trim();

  /** 前置闸：**不写数据**，只提示（与源版逐字一致） */
  const refuse = (text: string): Result<AnalyzeOutcome> =>
    ok({ patch: null, toast: { text, level: 'warn' }, parsed: null });

  // 源版 `!e || !n` ⇒ `bad-args`（**也不写数据**）
  if (!input.nodeId || !instruction) {
    return ok({ patch: null, toast: null, parsed: null });
  }

  const prev = input.previous;
  if (!prev || prev.status !== 'done' || !prev.raw) return refuse(ANALYZE_TEXT.needAnalyzeFirst);
  if (!input.imageUrl) return refuse(ANALYZE_TEXT.noSourceImage);
  const prevAccountId = typeof prev.accountId === 'string' ? prev.accountId : '';
  if (!prevAccountId) return refuse(ANALYZE_TEXT.noAnalyzeAccount);

  // 原分析账号必须**仍在且已登录**（源版 `(m.status || '已登录') === '已登录'`）
  // ⚠️ **2026-10-12 越权收口**：判据原为**内联复写**（全仓唯一一处内联字面量）——
  //    改委托源头 `isAccountUsable`（它的实现逐字就是源那句），**不写第二份**。
  const original = input.accounts.find((a) => a.id === prevAccountId) ?? null;
  if (!original || !isAccountUsable(original)) {
    return refuse(ANALYZE_TEXT.analyzeAccountGone);
  }

  // 调整指令：`raw` 优先（字符串），否则退 `json_prompt` 的格式化 JSON（原 39360）
  const base = typeof prev.raw === 'string' ? prev.raw : JSON.stringify(prev.json_prompt ?? {}, null, 2);

  const res = await runAsk(
    deps,
    { ...input, accounts: [original] },
    {
      jobId: `revise:${input.nodeId}`,
      purpose: 'image-analysis-revision',
      instruction: buildReviseInstruction(base, instruction),
      accountHint: original,
      progressStatus: 'revising',
      phaseAttach: ANALYZE_TEXT.phaseReviseNewSession,
    },
  );

  const fields = res.ok ? accountFields(res.value.account) : {};

  if (!res.ok) {
    // 源版 catch：`{...o, status:'done', phase:null, partial:null, error:'调整失败：…'}`（**不置 ok**）
    const message = ANALYZE_TEXT.reviseFailed(res.message);
    return ok({
      patch: { ...prev, status: 'done', phase: null, partial: null, error: message, at: input.now, ...fields },
      toast: { text: message, level: 'error' },
      parsed: null,
    });
  }

  const parsed = res.value.parsed;
  if (parsed.ok) {
    // 成功：源版**整对象替换**（不展开旧值）
    return ok({
      patch: {
        status: 'done',
        ok: true,
        zh_prompt: parsed.zh_prompt,
        en_prompt: parsed.en_prompt,
        json_prompt: parsed.json_prompt,
        raw: parsed.raw,
        at: input.now,
        ...fields,
      },
      toast: { text: ANALYZE_TEXT.reviseDone, level: 'info' },
      parsed,
    });
  }

  // 没回标准 JSON：源版 `{...o, status:'done', ok:false, zh/en/raw = 原文, json_prompt:null}`
  return ok({
    patch: {
      ...prev,
      status: 'done',
      ok: false,
      zh_prompt: parsed.raw,
      en_prompt: parsed.raw,
      json_prompt: null,
      raw: parsed.raw,
      at: input.now,
      ...fields,
    },
    toast: { text: ANALYZE_TEXT.reviseNonJson, level: 'warn' },
    parsed,
  });
}
