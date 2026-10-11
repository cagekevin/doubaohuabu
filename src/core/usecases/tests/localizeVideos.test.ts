/**
 * 视频本地化用例单测（原 `localizeNodeVideos` 31017 / `backfillLocalVideos` 31055）
 *
 * 重点：
 *   ① **只有 `http(s)` 才发给宿主**（`vid://` 不重复落盘）
 *   ② 单条失败 ⇒ 记账 + **不中断其余**
 *   ③ 返回值是**回写后的完整 data**（state 用 `patchNodeData` 落，不需要新 action）
 *   ④ `backfill` **串行**（与源版一致，避免同时打满主进程下载）
 */

import { describe, expect, it } from 'vitest';
import { backfillLocalVideos, localizeNodeVideos, type LocalizeVideosDeps } from '../localizeVideos';
import { ok, err } from '@/core/model/result';
import { VIDEO_TEXT } from '@/constants/text';

function makeDeps(
  script: Array<{ ok: true; ref: string } | { ok: false; message: string }> = [],
) {
  const calls: string[] = [];
  let i = 0;
  const deps: LocalizeVideosDeps = {
    media: {
      saveVideoFromUrl: async (url: string) => {
        calls.push(url);
        // ⚠️ 脚本按**下标**取（不是"重复最后一步"）：某个用例需要「第一条失败、后面成功」
        const step = script[i];
        i += 1;
        if (!step) return ok({ ref: `vid://${url.split('/').pop()}`, size: 1 });
        return step.ok ? ok({ ref: step.ref, size: 1 }) : err('unknown', step.message);
      },
    },
  };
  return { deps, calls };
}

const genvideo = (over: Record<string, unknown> = {}) => ({
  id: 'gv_1',
  type: 'genvideo',
  data: { url: 'https://cdn/1.mp4', ...over } as Record<string, unknown>,
});

describe('localizeNodeVideos', () => {
  it('没有 http 直链 ⇒ 空结果且**不碰宿主**', async () => {
    const { deps, calls } = makeDeps();
    const r = await localizeNodeVideos(deps, { id: 'v1', type: 'video', data: { url: 'vid://x' } });
    expect(r).toEqual({ rewrites: [], failures: [] });
    expect(calls).toEqual([]);
  });

  it('★ 成功 ⇒ 返回**回写后的完整 data**', async () => {
    const { deps, calls } = makeDeps();
    const r = await localizeNodeVideos(deps, genvideo({ resultUrl: 'https://cdn/1.mp4' }));
    expect(calls).toEqual(['https://cdn/1.mp4']);
    expect(r.failures).toEqual([]);
    expect(r.rewrites).toHaveLength(1);
    expect(r.rewrites[0]).toEqual({
      nodeId: 'gv_1',
      data: { url: 'vid://1.mp4', resultUrl: 'vid://1.mp4' },
    });
  });

  it('★ 多条 URL 依次叠加回写（含 genHistory.attempts）', async () => {
    const { deps } = makeDeps([
      { ok: true, ref: 'vid://1.mp4' },
      { ok: true, ref: 'vid://2.mp4' },
    ]);
    const r = await localizeNodeVideos(deps, {
      id: 'gv_1',
      type: 'genvideo',
      data: {
        url: 'https://cdn/1.mp4',
        genHistory: { v: 1, attempts: [{ id: 'a1', url: 'https://cdn/2.mp4' }] },
      },
    });
    const data = r.rewrites[0]!.data;
    expect(data.url).toBe('vid://1.mp4');
    expect((data.genHistory as { attempts: Array<{ url: string }> }).attempts[0]!.url).toBe('vid://2.mp4');
  });

  it('★ 单条失败 ⇒ 进 failures（原文）+ **不中断其余**', async () => {
    const { deps, calls } = makeDeps([{ ok: false, message: '磁盘满了' }]);
    const r = await localizeNodeVideos(deps, genvideo({ resultUrl: 'https://cdn/2.mp4' }));
    // 第一条（url）失败，第二条（resultUrl）仍被处理
    expect(calls).toEqual(['https://cdn/1.mp4', 'https://cdn/2.mp4']);
    expect(r.failures).toEqual([
      VIDEO_TEXT.saveFailed('https://cdn/1.mp4', '磁盘满了'),
    ]);
    // 只有成功的那条被回写
    expect(r.rewrites[0]!.data.url).toBe('https://cdn/1.mp4');
    expect(r.rewrites[0]!.data.resultUrl).toBe('vid://2.mp4');
  });

  it('全部失败 ⇒ 没有 rewrites，只有 failures', async () => {
    const { deps } = makeDeps([{ ok: false, message: 'x' }]);
    const r = await localizeNodeVideos(deps, genvideo());
    expect(r.rewrites).toEqual([]);
    expect(r.failures).toHaveLength(1);
  });

  it('宿主返回的 ref 与原 URL 相同 ⇒ 不算改动（不产空回写）', async () => {
    const { deps } = makeDeps([{ ok: true, ref: 'https://cdn/1.mp4' }]);
    const r = await localizeNodeVideos(deps, genvideo());
    expect(r.rewrites).toEqual([]);
  });
});

describe('backfillLocalVideos（原 31055）', () => {
  const nodes = [
    { id: 'gv_1', type: 'genvideo', data: { url: 'https://cdn/1.mp4' } },
    { id: 'v_1', type: 'video', data: { url: 'https://cdn/2.mp4' } },
    { id: 'ig_1', type: 'imggen', data: { url: 'https://cdn/3.mp4' } },
  ];

  it('★ 只处理 genvideo / video，且**串行**（调用顺序 = 节点顺序）', async () => {
    const { deps, calls } = makeDeps();
    const r = await backfillLocalVideos(deps, nodes);
    expect(calls).toEqual(['https://cdn/1.mp4', 'https://cdn/2.mp4']);
    expect(r.rewrites.map((w) => w.nodeId)).toEqual(['gv_1', 'v_1']);
    expect(r.failures).toEqual([]);
  });

  it('空列表 / 无目标类型 ⇒ 空结果', async () => {
    const { deps, calls } = makeDeps();
    expect(await backfillLocalVideos(deps, [])).toEqual({ rewrites: [], failures: [] });
    expect(await backfillLocalVideos(deps, [nodes[2]!])).toEqual({ rewrites: [], failures: [] });
    expect(calls).toEqual([]);
  });

  it('失败按节点累积（不因一个节点失败而停）', async () => {
    const { deps } = makeDeps([
      { ok: false, message: 'a' },
      { ok: false, message: 'b' },
    ]);
    const r = await backfillLocalVideos(deps, nodes);
    expect(r.failures).toHaveLength(2);
    expect(r.rewrites).toEqual([]);
  });
});
