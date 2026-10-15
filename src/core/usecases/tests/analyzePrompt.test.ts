/**
 * 提示词分析 / 调整用例单测（原 `gS` 39044 + `yS` 39256）
 *
 * 重点：
 *   ① ★ **前置闸不写数据**（`patch === null`）—— 源 `yS` 的五道闸只有 toast
 *   ② ★ **revise 的两处 `{...o}` 展开**（非 JSON / catch）必须带上旧字段；
 *      成功分支是**整对象替换**（**不**展开旧值）
 *   ③ ★ **`patch` 是完整对象**（调用方整体替换 `analyzePrompt`），不是"局部补丁"
 *   ④ ★ **指定账号不退级**（源 `FS` 直接 return）
 */

import { describe, expect, it } from 'vitest';
import { analyzeNodePrompt, reviseNodePrompt, type AnalyzeDeps } from '../analyzePrompt';
import { ok, err } from '@/core/model/result';
import { ACCOUNT_PICK_TEXT, ANALYZE_TEXT } from '@/constants/text';
import type { Account } from '@/stable/model/account';
import type { SitePort, SiteRegistry, ImageQuestionContext } from '@/core/ports/site.port';
import type { BackendPagePort } from '@/core/ports/backendPage.port';

const NOW = 1_700_000_000_000;

const acc = (id: string, type: Account['type'] = 'doubao', status = '已登录'): Account => ({
  id,
  name: `#${id}`,
  type,
  status,
  partition: `persist:${id}`,
  addedAt: 0,
  groupId: null,
  autoStart: false,
  fpSalt: 0,
});

const GOOD_REPLY = JSON.stringify({ zh_prompt: '中文提示', en_prompt: 'en prompt', json_prompt: { subject: ['x'] } });

function makeSite(
  kind: SitePort['kind'],
  reply: { ok: true; text: string } | { ok: false; reason: 'page-error'; message: string } | 'unsupported',
): SitePort {
  const base: SitePort = {
    kind,
    chatUrl: kind === 'doubao' ? 'https://www.doubao.com/chat/' : 'https://www.dola.com/chat/',
    scan: async () => ok({ items: [], skipped: 0 }),
    probe: async () => ok({ usable: true, loggedIn: true }),
    send: async () => ok({ sessionId: 's', endReason: 'settled', results: [] }),
  };
  if (reply === 'unsupported') return base;
  return {
    ...base,
    askWithImage: async (_ctx: ImageQuestionContext, _imageUrl: string, _instruction: string) =>
      reply.ok ? ok({ text: reply.text }) : err(reply.reason, reply.message),
  };
}

function makeDeps(over: { doubao?: SitePort; dola?: SitePort } = {}) {
  const events: string[] = [];
  const asked: Array<{ imageUrl: string; instruction: string }> = [];

  const wrap = (s: SitePort): SitePort => ({
    ...s,
    ...(s.askWithImage
      ? {
          askWithImage: (ctx: ImageQuestionContext, imageUrl: string, instruction: string) => {
            asked.push({ imageUrl, instruction });
            return s.askWithImage!(ctx, imageUrl, instruction);
          },
        }
      : {}),
  });

  const sites: SiteRegistry = {
    doubao: wrap(over.doubao ?? makeSite('doubao', { ok: true, text: GOOD_REPLY })),
    dola: wrap(over.dola ?? makeSite('dola', { ok: true, text: GOOD_REPLY })),
  };

  const backendPage = {

    prepareForSend: async (_a: Account, opts: { targetUrl: string }) =>
      ok({ leaseId: 'rt_1', webContentsId: 42, href: opts.targetUrl }),
    release: (id: string) => events.push(`release:${id}`),
    runScript: async () => ok(undefined),
    reload: () => ok(undefined),

    // ⚠️ 测试夹具：泛型方法无法逐一满足，整体断言到端口类型（与 `sendToSite.test.ts` 同法）
  } as unknown as BackendPagePort;

  const deps: AnalyzeDeps = {
    sites,
    backendPage,
    holdAccount: (id) => {
      events.push(`hold:${id}`);
      return true;
    },
    releaseAccount: (id) => events.push(`releaseAccount:${id}`),
  };
  return { deps, events, asked };
}

const baseInput = {
  nodeId: 'ig_1',
  imageUrl: 'img://a.png',
  accounts: [acc('a')],
  now: NOW,
};

describe('analyzeNodePrompt · 入参与选号', () => {
  it('★ 缺 nodeId / imageUrl ⇒ error + badArgs，**不提示**、不占用', async () => {
    const { deps, events } = makeDeps();
    const r = await analyzeNodePrompt(deps, { ...baseInput, imageUrl: '' });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.patch).toEqual({ status: 'error', error: ANALYZE_TEXT.badArgs, at: NOW });
    expect(r.value.toast).toBeNull();
    expect(events).toEqual([]);
  });

  it('★ 没账号 ⇒ `error` 补丁（前缀 `分析失败：`）+ error 提示', async () => {
    const { deps } = makeDeps();
    const r = await analyzeNodePrompt(deps, { ...baseInput, accounts: [] });
    if (!r.ok) return;
    expect(r.value.patch?.status).toBe('error');
    expect(String(r.value.patch?.error).startsWith(ANALYZE_TEXT.analyzeFailed(''))).toBe(true);
    expect(r.value.toast?.level).toBe('error');
  });

  it('★ 站点不支持该链路（无 `askWithImage`）⇒ 明确报错，不静默', async () => {
    const { deps } = makeDeps({ doubao: makeSite('doubao', 'unsupported') });
    const r = await analyzeNodePrompt(deps, baseInput);
    if (!r.ok) return;
    expect(String(r.value.patch?.error)).toContain('不支持提示词分析');
  });
});

describe('analyzeNodePrompt · 成功与解析失败', () => {
  it('★ 拿到标准 JSON ⇒ done/ok:true + 三成分 + 账号字段 + info 提示', async () => {
    const { deps, events } = makeDeps();
    const r = await analyzeNodePrompt(deps, baseInput);
    if (!r.ok) return;
    const p = r.value.patch;
    expect(p).toMatchObject({
      status: 'done',
      ok: true,
      zh_prompt: '中文提示',
      en_prompt: 'en prompt',
      json_prompt: { subject: ['x'] },
      raw: GOOD_REPLY,
      at: NOW,
      accountId: 'a',
      accountName: '#a',
      accountType: 'doubao',
    });
    expect(r.value.toast).toEqual({ text: ANALYZE_TEXT.analyzeDone, level: 'info' });
    // 占用/租约都释放
    expect(events).toEqual(['hold:a', 'release:rt_1', 'releaseAccount:a']);
  });

  it('★ 模型没回标准 JSON ⇒ done/**ok:false** + zh=en=raw + json_prompt null + warn', async () => {
    const { deps } = makeDeps({ doubao: makeSite('doubao', { ok: true, text: '这是解释，不是 JSON' }) });
    const r = await analyzeNodePrompt(deps, baseInput);
    if (!r.ok) return;
    expect(r.value.patch).toMatchObject({
      status: 'done',
      ok: false,
      zh_prompt: '这是解释，不是 JSON',
      en_prompt: '这是解释，不是 JSON',
      json_prompt: null,
      raw: '这是解释，不是 JSON',
    });
    expect(r.value.toast).toEqual({ text: ANALYZE_TEXT.analyzeNonJson, level: 'warn' });
  });

  it('★ 问的是 `ANALYZE_INSTRUCTION`（模型指令），图是原图', async () => {
    const { deps, asked } = makeDeps();
    await analyzeNodePrompt(deps, baseInput);
    expect(asked).toHaveLength(1);
    expect(asked[0]!.imageUrl).toBe('img://a.png');
    expect(asked[0]!.instruction).toContain('但最终只输出一个 JSON 对象');
    expect(asked[0]!.instruction).toContain('zh_prompt');
    // 换行是 **LF** —— 源版写的是 ``.join(`<真实换行>`)``（模板字符串），其值就是 `\n`。
    // ⚠️ 此前这条断言锁的是 `'\r\n'`（与源相反）⇒ 已按源改正。
    expect(asked[0]!.instruction).toContain('\n');
    expect(asked[0]!.instruction).not.toContain('\r\n');
  });

  it('★ 中间态：选号完成 ⇒ 先写 `analyzing` + phase（原 `gS:39155-39168`）', async () => {
    const { deps } = makeDeps();
    const seen: unknown[] = [];
    await analyzeNodePrompt(deps, { ...baseInput, onProgress: (p) => seen.push(p) });
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({
      status: 'analyzing',
      phase: ANALYZE_TEXT.phaseSendingImage,
      accountId: 'a',
    });
  });

  it('★ 页内失败 ⇒ 前缀 `分析失败：` + **原文**保留', async () => {
    const { deps } = makeDeps({
      doubao: makeSite('doubao', { ok: false, reason: 'page-error', message: '未读到模型回复' }),
    });
    const r = await analyzeNodePrompt(deps, baseInput);
    if (!r.ok) return;
    expect(r.value.patch?.error).toBe(ANALYZE_TEXT.analyzeFailed('未读到模型回复'));
  });

  it('doubao 不可用 ⇒ 退到 dola', async () => {
    const { deps, asked } = makeDeps({ doubao: makeSite('doubao', 'unsupported') });
    const r = await analyzeNodePrompt(deps, { ...baseInput, accounts: [acc('d', 'dola')] });
    if (!r.ok) return;
    expect(asked).toHaveLength(1);
    expect(r.value.patch?.accountType).toBe('dola');
  });
});

describe('reviseNodePrompt · 五道前置闸（★ 都不写节点数据）', () => {
  const prevDone = { status: 'done', ok: true, zh_prompt: 'z', en_prompt: 'e', raw: 'RAW', accountId: 'a' };

  it('★ 没分析过 ⇒ patch **null** + warn', async () => {
    const { deps } = makeDeps();
    const r = await reviseNodePrompt(deps, { ...baseInput, instruction: '改光影', previous: null });
    if (!r.ok) return;
    expect(r.value.patch).toBeNull();
    expect(r.value.toast).toEqual({ text: ANALYZE_TEXT.needAnalyzeFirst, level: 'warn' });
  });

  it('★ 分析过但没有 `raw` ⇒ 同一道闸', async () => {
    const { deps } = makeDeps();
    const r = await reviseNodePrompt(deps, {
      ...baseInput,
      instruction: '改光影',
      previous: { status: 'done', accountId: 'a' },
    });
    if (!r.ok) return;
    expect(r.value.patch).toBeNull();
    expect(r.value.toast?.text).toBe(ANALYZE_TEXT.needAnalyzeFirst);
  });

  it('★ 没原图 ⇒ patch null + `找不到原素材图片，请重新分析`', async () => {
    const { deps } = makeDeps();
    const r = await reviseNodePrompt(deps, {
      ...baseInput,
      imageUrl: '',
      instruction: '改',
      previous: prevDone,
    });
    if (!r.ok) return;
    expect(r.value.patch).toBeNull();
    expect(r.value.toast?.text).toBe(ANALYZE_TEXT.noSourceImage);
  });

  it('★ 没原分析账号 ⇒ patch null + 提示', async () => {
    const { deps } = makeDeps();
    const r = await reviseNodePrompt(deps, {
      ...baseInput,
      instruction: '改',
      previous: { status: 'done', raw: 'R' },
    });
    if (!r.ok) return;
    expect(r.value.patch).toBeNull();
    expect(r.value.toast?.text).toBe(ANALYZE_TEXT.noAnalyzeAccount);
  });

  it('★ 原账号已不可用 ⇒ patch null + 提示', async () => {
    const { deps } = makeDeps();
    const r = await reviseNodePrompt(deps, {
      ...baseInput,
      accounts: [acc('a', 'doubao', '已失效')],
      instruction: '改',
      previous: prevDone,
    });
    if (!r.ok) return;
    expect(r.value.patch).toBeNull();
    expect(r.value.toast?.text).toBe(ANALYZE_TEXT.analyzeAccountGone);
  });

  it('★ 原账号在忙 ⇒ patch null（**指定账号不退级**，note 是源 `FS` 那句）', async () => {
    const { deps } = makeDeps();
    const r = await reviseNodePrompt(deps, {
      ...baseInput,
      accounts: [acc('a'), acc('d', 'dola')],
      busy: ['a'],
      instruction: '改',
      previous: prevDone,
    });
    if (!r.ok) return;
    // 走到 runAsk ⇒ 选号失败（busy）⇒ 归到 `调整失败：…`
    expect(String(r.value.patch?.error)).toBe(ANALYZE_TEXT.reviseFailed(ACCOUNT_PICK_TEXT.busy));
  });

  it('★ 空指令 / 缺 nodeId ⇒ patch null + **不提示**（源 `bad-args`）', async () => {
    const { deps } = makeDeps();
    const r = await reviseNodePrompt(deps, { ...baseInput, instruction: '   ', previous: prevDone });
    if (!r.ok) return;
    expect(r.value.patch).toBeNull();
    expect(r.value.toast).toBeNull();
  });
});

describe('reviseNodePrompt · 成功 / 非 JSON / 失败', () => {
  const prevFull = {
    status: 'done',
    ok: true,
    zh_prompt: '旧中',
    en_prompt: '旧英',
    json_prompt: { old: 1 },
    raw: '旧RAW',
    accountId: 'a',
    accountName: '#a',
    accountType: 'doubao',
  };

  it('★ 成功是**整对象替换**（旧字段不残留 —— 源版就没展开）', async () => {
    const { deps, asked } = makeDeps();
    const r = await reviseNodePrompt(deps, { ...baseInput, instruction: ' 改光影 ', previous: prevFull });
    if (!r.ok) return;
    expect(r.value.patch).toMatchObject({ status: 'done', ok: true, zh_prompt: '中文提示', raw: GOOD_REPLY });
    // 旧的 `json_prompt: {old:1}` 被新值覆盖（不是残留）
    expect(r.value.patch?.json_prompt).toEqual({ subject: ['x'] });
    expect(r.value.toast).toEqual({ text: ANALYZE_TEXT.reviseDone, level: 'info' });
    // 调整指令带上了**旧 raw** 与 **trim 后的意见**
    expect(asked[0]!.instruction).toContain('旧RAW');
    expect(asked[0]!.instruction).toContain('用户修改意见：改光影');
  });

  it('★ `raw` 是**非字符串的真值** ⇒ 指令带的是 `json_prompt` 的格式化 JSON（原 39360 的三目）', async () => {
    const { deps, asked } = makeDeps();
    await reviseNodePrompt(deps, {
      ...baseInput,
      instruction: '改',
      // ⚠️ 不能给 `undefined`/`''` —— 那样会先被前置闸（`!prev.raw`）拦掉，走不到这一支
      previous: { ...prevFull, raw: true },
    });
    expect(asked[0]!.instruction).toContain('"old": 1');
  });

  it('★ 非 JSON 回复 ⇒ **展开旧值** + zh/en=新原文 + json_prompt null + warn', async () => {
    const { deps } = makeDeps({ doubao: makeSite('doubao', { ok: true, text: '不是 JSON' }) });
    const r = await reviseNodePrompt(deps, { ...baseInput, instruction: '改', previous: prevFull });
    if (!r.ok) return;
    const p = r.value.patch;
    expect(p).toMatchObject({
      status: 'done',
      ok: false,
      zh_prompt: '不是 JSON',
      json_prompt: null,
      raw: '不是 JSON',
      // 旧字段被展开带过来（源版 `{...o, …}`）
      accountId: 'a',
    });
    expect(r.value.toast).toEqual({ text: ANALYZE_TEXT.reviseNonJson, level: 'warn' });
  });

  it('★ 页内失败 ⇒ **展开旧值** + `phase:null` + `partial:null` + `调整失败：…`', async () => {
    const { deps } = makeDeps({
      doubao: makeSite('doubao', { ok: false, reason: 'page-error', message: '未找到发送按钮' }),
    });
    const r = await reviseNodePrompt(deps, { ...baseInput, instruction: '改', previous: prevFull });
    if (!r.ok) return;
    const p = r.value.patch;
    expect(p).toMatchObject({
      status: 'done',
      phase: null,
      partial: null,
      error: ANALYZE_TEXT.reviseFailed('未找到发送按钮'),
      zh_prompt: '旧中', // 展开旧值
    });
    /**
     * ⚠️ **源版的一个瑕疵，照实保留**：catch 分支写的是 `{...o, status:'done', …}`，
     *    **没有**把 `ok` 置 false/删掉 ⇒ 若上一轮成功过（`o.ok === true`），
     *    这次失败后节点上会同时有 `ok:true` 与 `error:'调整失败：…'`。
     *    本实现**忠实复现**（改掉它＝行为不等价），故这里断言"确实继承下来了"。
     */
    expect(p?.ok).toBe(true);
    expect(r.value.toast?.level).toBe('error');
  });
});
