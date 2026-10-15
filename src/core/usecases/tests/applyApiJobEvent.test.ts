/**
 * API 任务事件落点决策单测（原 `applyApiJobEvent` `shared.js:30708-30838`）
 *
 * 覆盖源版的**全部分支**：
 *   ① 缺 `jobId` ⇒ 什么都不做
 *   ② 无 `nodeId` + `done` + `image` ⇒ 落库 + 图片流 + 提示
 *   ③ `nodeId` 指向的节点不存在 ⇒ 只记任务快照
 *   ④ `done` + 视频结果 ⇒ 建视频节点 + 记 `apiJob`
 *   ⑤ `done` + 图片结果 ⇒ 落库 + 记 `apiJob`（**仅 `imggen`** 才附加结果）+ 提示
 *   ⑥ `done` 但无可用产物 ⇒ 只记 `apiJob`
 *   ⑦ `failed` / `cancelled` ⇒ 回写 `genHistory` + 提示（`quota` 提示 7000ms）
 *   ⑧ 其余状态 ⇒ 只记 `apiJob`
 *
 * 断言红线：断言**具体的落点与文案**，不断言"不崩"。
 */

import { describe, expect, it } from 'vitest';
import { applyApiJobEvent, type ApiJobDecisionInput } from '../applyApiJobEvent';
import { API_TOAST_ERROR_MS, API_TOAST_QUOTA_MS } from '@/constants';
import { GEN_HISTORY_KEY, type CanvasNode } from '@/stable/model/node';
import type { ApiJobEvent } from '@/stable/model/gen';
import { makeGenAttempt, type GenAttemptInput } from '@/core/rules/genHistory';

const NOW = 1_700_000_000_000;

/** 造一条**合法**尝试 —— 用唯一构造器 `makeGenAttempt`（`ApiJobAttempt` 的形状真源），只覆盖用例关心的字段 */
const attempt = (over: Partial<GenAttemptInput> & Pick<GenAttemptInput, 'id'>) =>
  makeGenAttempt({ at: NOW, ...over });

const ev = (over: Partial<ApiJobEvent> & { jobId: string }): ApiJobEvent => ({
  kind: 'image',
  nodeId: null,
  status: 'running',
  error: null,
  attempt: null,
  results: [],
  params: {},
  prompt: '',
  taskId: null,
  createdAt: 0,
  finishedAt: null,
  usedFallback: false,
  ...over,
});

const imgNode = (id: string, over: Record<string, unknown> = {}): CanvasNode => ({
  id,
  type: 'imggen',
  position: { x: 0, y: 0 },
  data: {
    label: '文生图',
    text: 't',
    aspectRatio: '1:1',
    channel: 'api',
    sendAccount: 'auto',
    imageCount: 1,
    styleIds: [],
    linkOrder: [],
    results: [],
    ...over,
  },
});

const videoNode = (id: string, label = '视频'): CanvasNode => ({
  id,
  type: 'video',
  position: { x: 0, y: 0 },
  data: { label: label as '视频', url: 'vid://x' },
});

const input = (event: ApiJobEvent, nodes: readonly CanvasNode[] = []): ApiJobDecisionInput => ({
  event,
  nodes,
  now: NOW,
});

describe('applyApiJobEvent · 前置分支', () => {
  it('★ 缺 jobId ⇒ null（源版 `if (!n || !n.jobId) return;`）', () => {
    expect(applyApiJobEvent(input(ev({ jobId: '' })))).toBeNull();
  });

  it('运行中（无落点动作）⇒ 空壳决策（library 空 · 无 videoNode）', () => {
    const d = applyApiJobEvent(input(ev({ jobId: 'j1', status: 'running' })));
    expect(d?.library).toEqual([]);
    expect(d?.videoNode).toBeUndefined();
  });
});

describe('applyApiJobEvent · 无节点来源（源 30719-30745）', () => {
  it('★ done + image + 有图片结果 ⇒ 落库 + 图片流 + 提示', () => {
    const d = applyApiJobEvent(
      input(
        ev({
          jobId: 'j1',
          kind: 'image',
          status: 'done',
          providerName: '火山方舟',
          results: [{ type: 'video', url: 'u1' }, { type: 'image', dataUrl: 'data:image/png;base64,AA' }],
        }),
      ),
    );
    expect(d?.library).toHaveLength(1);
    expect(d?.library[0]!.dataUrl).toBe('data:image/png;base64,AA');
    // 名字带**本地时钟时刻**（源 `API 图片 ${toLocaleTimeString}`）⇒ 只断言形态（免 TZ 依赖）
    expect(d?.library[0]!.name).toMatch(/^API 图片 \d{2}:\d{2}:\d{2}$/);
    expect(d?.feed).toEqual({
      name: 'API 图片',
      dataUrl: 'data:image/png;base64,AA',
      source: 'api',
      accountName: '火山方舟',
      genKey: null,
    });
    expect(d?.toast).toEqual({ text: 'API 图片已存入资源库', level: 'success' });
    expect(d?.nodePatch).toBeUndefined();
  });

  it('无节点 + done + **视频** ⇒ 什么都不落（源分支只认 image）', () => {
    const d = applyApiJobEvent(
      input(ev({ jobId: 'j1', kind: 'video', status: 'done', results: [{ type: 'video', url: 'u' }] })),
    );
    expect(d?.library).toEqual([]);
    expect(d?.videoNode).toBeUndefined();
    expect(d?.toast).toBeUndefined();
  });

  it('无节点 + image 但结果里没有可用图 ⇒ 只记快照', () => {
    const d = applyApiJobEvent(
      input(ev({ jobId: 'j1', status: 'done', results: [{ type: 'image' }] })),
    );
    expect(d?.library).toEqual([]);
    expect(d?.toast).toBeUndefined();
  });

  it('无节点 + 未完成状态 ⇒ 只记快照', () => {
    const d = applyApiJobEvent(input(ev({ jobId: 'j1', status: 'running', kind: 'image' })));
    expect(d?.toast).toBeUndefined();
    expect(d?.feed).toBeUndefined();
  });
});

describe('applyApiJobEvent · 有节点来源', () => {
  it('★ 节点不存在 ⇒ 无落点动作（源 30751-30753）', () => {
    const d = applyApiJobEvent(input(ev({ jobId: 'j1', nodeId: 'nope' }), [imgNode('ig_1')]));
    expect(d?.nodePatch).toBeUndefined();
    expect(d?.library).toEqual([]);
  });

  it('★ done + 视频结果 ⇒ 建视频节点（**不**落库）+ 记 apiJob', () => {
    const d = applyApiJobEvent(
      input(
        ev({
          jobId: 'j1',
          kind: 'video',
          nodeId: 'gv_1',
          status: 'done',
          providerName: '可灵',
          attempt: attempt({ id: 'at1', conversationId: 'c' }),
          results: [{ type: 'video', url: 'https://v/1.mp4' }],
        }),
        [imgNode('gv_1', { label: '我的片' })],
      ),
    );
    expect(d?.videoNode).toEqual({
      url: 'https://v/1.mp4',
      sourceNodeId: 'gv_1',
      name: '我的片',
      accountName: 'API · 可灵',
      attempt: { ...attempt({ id: 'at1', conversationId: 'c' }), status: 'success' },
    });
    expect(d?.library).toEqual([]);
    expect(d?.nodePatch?.nodeId).toBe('gv_1');
    expect((d?.nodePatch?.patch.apiJob as { status: string }).status).toBe('done');
  });

  it('节点无 label ⇒ 视频名回落「API 视频」（源 `o.data.label || "API 视频"`）', () => {
    const node = imgNode('gv_1');
    delete (node.data as { label?: unknown }).label;
    const d = applyApiJobEvent(
      input(
        ev({ jobId: 'j1', nodeId: 'gv_1', status: 'done', results: [{ type: 'video', url: 'u' }] }),
        [node],
      ),
    );
    expect(d?.videoNode?.name).toBe('API 视频');
    expect(d?.videoNode?.attempt).toBeNull();
  });

  it('★ done + 图片结果 + imggen ⇒ 落库 + 附加结果 + 提示', () => {
    const d = applyApiJobEvent(
      input(
        ev({
          jobId: 'j1',
          nodeId: 'ig_1',
          status: 'done',
          providerName: '方舟',
          results: [{ type: 'image', dataUrl: 'data:img' }],
        }),
        [imgNode('ig_1')],
      ),
    );
    expect(d?.library).toHaveLength(1);
    expect(d?.attachImage).toEqual({
      nodeId: 'ig_1',
      dataUrl: 'data:img',
      source: 'api',
      accountName: '方舟',
      genKey: null,
      jobId: 'j1',
    });
    expect(d?.toast?.level).toBe('success');
  });

  it('★ 同样的图片结果落**非 imggen** 节点 ⇒ 不附加（源 `if (o.type === "imggen")`）', () => {
    const d = applyApiJobEvent(
      input(
        ev({ jobId: 'j1', nodeId: 'gv_1', status: 'done', results: [{ type: 'image', dataUrl: 'data:img' }] }),
        [videoNode('gv_1')],
      ),
    );
    expect(d?.attachImage).toBeUndefined();
    expect(d?.library).toHaveLength(1);
  });

  it('★ done 但无可用产物 ⇒ 只记 apiJob（源 30809-30813）', () => {
    const d = applyApiJobEvent(input(ev({ jobId: 'j1', nodeId: 'ig_1', status: 'done' }), [imgNode('ig_1')]));
    expect(d?.library).toEqual([]);
    expect(d?.toast).toBeUndefined();
    expect(d?.nodePatch?.patch).toEqual({
      apiJob: { jobId: 'j1', kind: 'image', status: 'done' },
    });
  });

  it('queue / running / downloading ⇒ 只记 apiJob；`progress` 只在有值时带', () => {
    const withProgress = applyApiJobEvent(
      input(ev({ jobId: 'j1', nodeId: 'ig_1', status: 'running', progress: 42 }), [imgNode('ig_1')]),
    );
    expect((withProgress?.nodePatch?.patch.apiJob as { progress?: number }).progress).toBe(42);

    const noProgress = applyApiJobEvent(
      input(ev({ jobId: 'j1', nodeId: 'ig_1', status: 'queued' }), [imgNode('ig_1')]),
    );
    expect(noProgress?.nodePatch?.patch.apiJob).toEqual({ jobId: 'j1', kind: 'image', status: 'queued' });
  });
});

describe('applyApiJobEvent · failed / cancelled（源 30814-30832）', () => {
  const withHistory = (): CanvasNode =>
    imgNode('ig_1', { [GEN_HISTORY_KEY]: { v: 1, attempts: [attempt({ id: 'at1', status: 'running' })] } });

  it('★ failed + 有 attempt ⇒ 回写 genHistory（failed）+ 记 apiJob + 提示 5000ms', () => {
    const d = applyApiJobEvent(
      input(
        ev({
          jobId: 'j1',
          nodeId: 'ig_1',
          status: 'failed',
          attempt: attempt({ id: 'at1' }),
          error: { message: '服务端 500' },
        }),
        [withHistory()],
      ),
    );
    expect(d?.nodePatch?.patch[GEN_HISTORY_KEY]).toEqual({
      v: 1,
      attempts: [{ ...attempt({ id: 'at1' }), status: 'failed', note: '服务端 500' }],
    });
    expect((d?.nodePatch?.patch.apiJob as { error?: unknown }).error).toEqual({ message: '服务端 500' });
    expect(d?.toast).toEqual({ text: 'API 生成失败：服务端 500', level: 'error', durationMs: API_TOAST_ERROR_MS });
  });

  it('★ failed + `quota` ⇒ 额度文案（含 advice）+ 提示 7000ms', () => {
    const d = applyApiJobEvent(
      input(
        ev({
          jobId: 'j1',
          nodeId: 'ig_1',
          status: 'failed',
          error: { kind: 'quota', message: '余额不足', advice: '请充值' },
        }),
        [imgNode('ig_1')],
      ),
    );
    expect(d?.toast).toEqual({
      text: 'API 生成失败（额度异常）：余额不足 · 请充值',
      level: 'error',
      durationMs: API_TOAST_QUOTA_MS,
    });
  });

  it('failed 但 error 为空 ⇒ 文案回落「未知错误」', () => {
    const d = applyApiJobEvent(
      input(ev({ jobId: 'j1', nodeId: 'ig_1', status: 'failed', error: null }), [imgNode('ig_1')]),
    );
    expect(d?.toast?.text).toBe('API 生成失败：未知错误');
  });

  it('★ cancelled ⇒ genHistory 记 cancelled 且 note「已取消」，**不提示**', () => {
    const d = applyApiJobEvent(
      input(ev({ jobId: 'j1', nodeId: 'ig_1', status: 'cancelled', attempt: attempt({ id: 'at1' }) }), [withHistory()]),
    );
    expect((d?.nodePatch?.patch[GEN_HISTORY_KEY] as { attempts: unknown[] }).attempts[0]).toEqual({
      ...attempt({ id: 'at1' }),
      status: 'cancelled',
      note: '已取消',
    });
    expect(d?.toast).toBeUndefined();
  });

  it('★ 没有 attempt / attempt 未命中 ⇒ **不带** genHistory 键（源版原样返回 data）', () => {
    const noAttempt = applyApiJobEvent(
      input(ev({ jobId: 'j1', nodeId: 'ig_1', status: 'failed' }), [withHistory()]),
    );
    expect(GEN_HISTORY_KEY in (noAttempt?.nodePatch?.patch ?? {})).toBe(false);

    const missAttempt = applyApiJobEvent(
      input(
        ev({ jobId: 'j1', nodeId: 'ig_1', status: 'failed', attempt: attempt({ id: 'nope' }) }),
        [withHistory()],
      ),
    );
    expect(GEN_HISTORY_KEY in (missAttempt?.nodePatch?.patch ?? {})).toBe(false);
  });

  it('节点没有 genHistory 也不崩，照样记 apiJob', () => {
    const d = applyApiJobEvent(
      input(
        ev({ jobId: 'j1', nodeId: 'ig_1', status: 'failed', attempt: attempt({ id: 'at1' }) }),
        [imgNode('ig_1')],
      ),
    );
    expect(d?.nodePatch?.patch).toHaveProperty('apiJob');
  });
});
