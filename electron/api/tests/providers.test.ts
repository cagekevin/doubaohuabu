// ============================================================
// 后端 · API 接入的**纯函数**测试（fixture 直接驱动解析函数）
// ------------------------------------------------------------
// 边界（vite.config.ts 的同一处也写着）：**只许导入不依赖 `electron` 的纯模块**。
// 本文件覆盖各 provider 的 `parseSubmit` / `parsePoll`（body 进 / 结构出）＋ 引擎侧的
// 脱敏 / 额度 / 域轮换 —— 这些正是转换时最容易"看着对、实际漂"的地方。
// ============================================================
import { describe, expect, it } from 'vitest';
import { adapter as kling } from '../providers/kling';
import { adapter as vidu } from '../providers/vidu';
import { adapter as ark } from '../providers/volcengine-ark';
import { adapter as geeknow } from '../providers/geeknow-relay';
import { adapter as llm } from '../providers/llm-openai-compat';
import { matchQuotaHint, quotaMessage } from '../quota';
import { redactHeaders, redactText } from '../redact';
import { createDomainRota } from '../domains';

describe('kling 解析', () => {
  it('parseSubmit 取 data.task_id', () => {
    expect(kling.parseSubmit({ code: 0, data: { task_id: 'abc' } })).toEqual({ taskId: 'abc' });
  });
  it('parseSubmit 业务失败（code != 0）带原文', () => {
    expect(kling.parseSubmit({ code: 1101, message: '额度不足' })).toEqual({
      error: { kind: 'business', message: '额度不足' },
    });
  });
  it('parsePoll 成功取 videos[].url', () => {
    const out = kling.parsePoll({ code: 0, data: { task_status: 'succeed', task_result: { videos: [{ url: 'https://v/1.mp4' }] } } });
    expect(out).toEqual({ status: 'succeeded', results: [{ type: 'video', url: 'https://v/1.mp4' }] });
  });
  it('parsePoll 成功但没地址 ⇒ failed（bad_response）', () => {
    const out = kling.parsePoll({ data: { task_status: 'succeed', task_result: { videos: [] } } });
    expect(out.status).toBe('failed');
    expect(out.error?.kind).toBe('bad_response');
  });
  it('parsePoll 处理中', () => {
    expect(kling.parsePoll({ data: { task_status: 'processing' } })).toEqual({ status: 'running' });
  });
});

describe('vidu 解析', () => {
  it('parseSubmit 兼容 task_id 与 id', () => {
    expect(vidu.parseSubmit({ task_id: 't1' })).toEqual({ taskId: 't1' });
    expect(vidu.parseSubmit({ id: 't2' })).toEqual({ taskId: 't2' });
  });
  it('parsePoll 成功取 creations[].url', () => {
    const out = vidu.parsePoll({ state: 'success', creations: [{ url: 'https://v/a.mp4' }] });
    expect(out).toEqual({ status: 'succeeded', results: [{ type: 'video', url: 'https://v/a.mp4' }] });
  });
  it('parsePoll 失败取 errmsg', () => {
    expect(vidu.parsePoll({ state: 'failed', errmsg: '余额不足' })).toEqual({
      status: 'failed',
      error: { kind: 'business', message: '余额不足' },
    });
  });
});

describe('火山方舟 解析', () => {
  it('parseSubmit 异步型（视频）取 id', () => {
    expect(ark.parseSubmit({ id: 'task-1' })).toEqual({ taskId: 'task-1' });
  });
  it('parseSubmit 同步型（图片）取 data[]', () => {
    const out = ark.parseSubmit({ data: [{ url: 'https://i/1.png' }, { b64_json: 'AAA' }] });
    expect(out).toEqual({
      results: [
        { url: 'https://i/1.png', type: 'image' },
        { b64: 'AAA', type: 'image', mime: 'image/jpeg' },
      ],
    });
  });
  it('parsePoll 取 content.video_url', () => {
    expect(ark.parsePoll({ status: 'succeeded', content: { video_url: 'https://v/x.mp4' } })).toEqual({
      status: 'succeeded',
      results: [{ type: 'video', url: 'https://v/x.mp4' }],
    });
  });
  it('parsePoll 取消算失败', () => {
    const out = ark.parsePoll({ status: 'cancelled' });
    expect(out.status).toBe('failed');
    expect(out.error?.message).toContain('被取消');
  });
});

describe('geeknow 解析（字段名各中转站不一，兜底最多）', () => {
  it('parseSubmit 依次兜底 taskId / data.taskId / data.id / id', () => {
    expect(geeknow.parseSubmit({ taskICodeId: 'x' })).toEqual({ taskId: 'x' });
    expect(geeknow.parseSubmit({ data: { taskId: 'y' } })).toEqual({ taskId: 'y' });
  });
  it('parseSubmit 同步图片走 data[] / images[]', () => {
    expect(geeknow.parseSubmit({ images: [{ url: 'https://i/2.png' }] })).toEqual({
      results: [{ url: 'https://i/2.png', type: 'image', mime: 'image/jpeg' }],
    });
  });
  it('parsePoll SUCCESS 取 videoUrl', () => {
    expect(geeknow.parsePoll({ taskICode: 'SUCCESS', data: { videoUrl: 'https://v/y.mp4' } })).toEqual({
      status: 'succeeded',
      results: [{ type: 'video', url: 'https://v/y.mp4' }],
    });
  });
  it('parsePoll 运行中带 progress', () => {
    expect(geeknow.parsePoll({ status: 'running', progress: 42 })).toEqual({ status: 'running', progress: 42 });
  });
});

describe('LLM 通道解析', () => {
  it('parseSubmit 取 choices[0].message.content', () => {
    expect(llm.parseSubmit({ choices: [{ message: { content: '扩写后的提示词' } }] })).toEqual({
      results: [{ type: 'text', text: '扩写后的提示词' }],
    });
  });
  it('parseSubmit HTTP 200 + error 形态', () => {
    expect(llm.parseSubmit({ error: { message: 'insufficient_quota' } })).toEqual({
      error: { kind: 'business', message: 'insufficient_quota' },
    });
  });
});

describe('额度信号（quota）', () => {
  it('命中「额度未扣除」⇒ 可直接重试', () => {
    expect(matchQuotaHint(null, '生成额度未扣除')?.kind).toBe('quota_not_deducted');
  });
  it('命中英文 insufficient_quota ⇒ 额度用完', () => {
    expect(matchQuotaHint(null, 'insufficient_quota')?.kind).toBe('quota_exhausted');
  });
  it('adapter.quotaHints 优先于默认库', () => {
    const hit = matchQuotaHint({ quotaHints: [{ re: /自定义/, kind: 'custom' }] }, '自定义报错');
    expect(hit?.kind).toBe('custom');
  });
  it('无命中 ⇒ null；quotaMessage 拼建议', () => {
    expect(matchQuotaHint(null, '一切正常')).toBeNull();
    expect(quotaMessage({ advice: '请充值' }, '余额不足')).toBe('余额不足（请充值）');
  });
});

describe('脱敏（redact）', () => {
  it('键值形态的密钥被替换', () => {
    expect(redactText('api_key=sk-1234567890')).toContain('<redacted>');
    expect(redactText('"Authorization": "Bearer sk-abcdef"')).toContain('<redacted>');
  });
  it('正文里的普通词不误伤（monkey / cache_key 的前缀不命中裸 key）', () => {
    expect(redactText('the monkey is here')).toBe('the monkey is here');
  });
  it('请求头按键名脱敏', () => {
    expect(redactHeaders({ Authorization: 'Bearer sk-x', 'Content-Type': 'application/json' })).toEqual({
      Authorization: '<redacted>',
      'Content-Type': 'application/json',
    });
  });
});

describe('域轮换（domains）', () => {
  it('单一域名不轮换（返回 null）', () => {
    expect(createDomainRota(['https://a/v1'])).toBeNull();
  });
  it('失败域进冷却并切到下一域；冷却到期主域回归', () => {
    let now = 0;
    const rota = createDomainRota(['https://a/v1', 'https://b/v1'], { now: () => now, cooldownMs: 1000 });
    expect(rota).not.toBeNull();
    if (!rota) return;
    // ⚠️ `pick()` 的语义是「**按优先级**取第一个未冷却域」，不是"取游标"——
    //    游标只在**全部冷却中**时才作为返回项（下面第二段覆盖）。
    expect(rota.pick()).toBe('https://a/v1');
    rota.reportFailure('https://a/v1');
    expect(rota.pick()).toBe('https://b/v1');
    now = 2000; // a 的冷却到期 ⇒ 主域按优先级回归（与游标无关）
    expect(rota.pick()).toBe('https://a/v1');
  });

  it('全部冷却中 ⇒ 返回游标域；成功域清冷却', () => {
    let now = 0;
    const rota = createDomainRota(['https://a/v1', 'https://b/v1'], { now: () => now, cooldownMs: 1000 });
    if (!rota) return;
    rota.reportFailure('https://a/v1'); // a 冷却到 1000；游标切到 b
    rota.reportFailure('https://b/v1'); // b 也冷却到 1000；游标回绕到 a
    expect(rota.pick()).toBe('https://a/v1'); // 全冷 ⇒ 游标域（死马当活马医）
    rota.reportSuccess('https://b/v1'); // b 视为健康（清冷却）＋游标对齐 b
    expect(rota.pick()).toBe('https://b/v1');
    now = 1000; // a 到期 ⇒ 优先级（a 在前）再次生效
    expect(rota.pick()).toBe('https://a/v1');
  });
});
