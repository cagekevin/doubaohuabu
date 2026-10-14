/**
 * W3 · 图片外置幂等（`externalizeDeep` / `externalizeProjectImages`）
 *
 * 判据（`docs/过程资料/08` §二 W3 的**前端半** —— 后端 `saveImageSync` 的幂等要真机）：
 *   ① 内联 base64 ⇒ 调 `saveImage` 换成 `img://`
 *   ② **已是 `img://` ⇒ 不动**（幂等 —— 连跑两次结果相同，第二次**不再调** `saveImage`）
 *   ③ 落盘失败 ⇒ **保留内联**（数据不丢）+ 记进 `failures`（原则 6：不静默）
 *   ④ **不可变**：不改入参
 *   ⑤ `externalizeProjectImages` **只动 `data`**，其余字段原样
 *
 * ⚠️ 断言的是**行为**（输入 → 输出 / 副作用），不断实现细节。
 */

import { describe, expect, it } from 'vitest';
import { externalizeDeep, externalizeProjectImages } from '../imageExternalize';
import type { NormalizeContext } from '../types';

/** 造一个 `NormalizeContext`（`saveImage` 记调用；`now` 本用例用不到） */
function ctxWith(saveImage: NormalizeContext['saveImage']): NormalizeContext {
  return { saveImage, now: () => 0 };
}

const inline = 'data:image/png;base64,AAA';

describe('externalizeDeep · 图片外置', () => {
  it('★ 内联 base64 ⇒ 换成 `saveImage` 的返回（`img://`）', () => {
    const calls: string[] = [];
    const out = externalizeDeep(
      inline,
      ctxWith((u) => {
        calls.push(u);
        return { ok: true, value: 'img://a.png' };
      }),
      { count: 0, bytes: 0, failures: [] },
    );
    expect(out).toBe('img://a.png');
    expect(calls).toEqual([inline]);
  });

  it('★ 已是 `img://` ⇒ **不动**（幂等：连跑两次结果相同，第二次不再调 `saveImage`）', () => {
    const calls: string[] = [];
    const ctx = ctxWith((u) => {
      calls.push(u);
      return { ok: true, value: 'img://x' };
    });
    const stats = { count: 0, bytes: 0, failures: [] as string[] };
    const first = externalizeDeep(inline, ctx, stats);
    const second = externalizeDeep(first, ctx, stats);
    expect(second).toBe(first);
    expect(calls).toHaveLength(1);
  });

  it('★ 落盘失败 ⇒ **保留内联**（数据不丢）+ 记进 `failures`（不静默）', () => {
    const stats = { count: 0, bytes: 0, failures: [] as string[] };
    const out = externalizeDeep(
      inline,
      ctxWith(() => ({ ok: false, message: '磁盘满' })),
      stats,
    );
    expect(out).toBe(inline);
    expect(stats.failures).toEqual(['磁盘满']);
  });

  it('★ 递归进数组 / 对象；非图片值原样', () => {
    const out = externalizeDeep(
      { a: [inline, 42, { b: 'plain' }], c: true },
      ctxWith(() => ({ ok: true, value: 'img://ok' })),
      { count: 0, bytes: 0, failures: [] },
    );
    expect(out).toEqual({ a: ['img://ok', 42, { b: 'plain' }], c: true });
  });
});

describe('externalizeProjectImages · 只动 `data` + 不可变', () => {
  it('★ 只动 `data`，其余字段**原样保留**', () => {
    const projects = [{ id: 'p_1', name: '工程', data: { url: inline } }];
    const out = externalizeProjectImages(projects, ctxWith(() => ({ ok: true, value: 'img://a' })));
    expect(out.value).toEqual([{ id: 'p_1', name: '工程', data: { url: 'img://a' } }]);
    expect(out.changed).toBe(true);
  });

  it('★ **不可变**：不改入参', () => {
    const projects = [{ id: 'p_1', data: { url: inline } }];
    const snapshot = JSON.parse(JSON.stringify(projects)) as unknown;
    externalizeProjectImages(projects, ctxWith(() => ({ ok: true, value: 'img://a' })));
    expect(projects).toEqual(snapshot);
  });

  it('★ 没有可外置的图 ⇒ `changed: false`（调用方**不应写盘**）', () => {
    const out = externalizeProjectImages([{ id: 'p_1', data: { url: 'img://a' } }], ctxWith(() => ({ ok: true, value: 'x' })));
    expect(out.changed).toBe(false);
  });
});
