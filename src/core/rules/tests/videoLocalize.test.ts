/**
 * 视频本地化纯规则单测
 * （原 `localizeNodeVideos` 31029-31040 的收集半 + `applyLocalVideoRef` 30952-31016）
 */

import { describe, expect, it } from 'vitest';
import {
  applyLocalVideoRef,
  collectLocalizableUrls,
  isHttpUrl,
  selectVideoNodesToLocalize,
} from '../videoLocalize';

describe('isHttpUrl', () => {
  it('只认 http(s)，大小写不敏感', () => {
    expect(isHttpUrl('http://a/b.mp4')).toBe(true);
    expect(isHttpUrl('HTTPS://A/B.MP4')).toBe(true);
    expect(isHttpUrl('vid://x.mp4')).toBe(false);
    expect(isHttpUrl('img://x.png')).toBe(false);
    expect(isHttpUrl('data:video/mp4;base64,AA')).toBe(false);
    expect(isHttpUrl(undefined)).toBe(false);
    expect(isHttpUrl(42)).toBe(false);
  });
});

describe('collectLocalizableUrls（原 31029-31040）', () => {
  it('三个来源都收：url / resultUrl / genHistory.attempts[].url', () => {
    const urls = collectLocalizableUrls({
      url: 'https://a/1.mp4',
      resultUrl: 'https://a/2.mp4',
      genHistory: { v: 1, attempts: [{ id: 'a1', url: 'https://a/3.mp4' }] },
    });
    expect(urls).toEqual(['https://a/1.mp4', 'https://a/2.mp4', 'https://a/3.mp4']);
  });

  it('★ 非 http(s) 一律不收（`vid://` 已落盘）', () => {
    expect(
      collectLocalizableUrls({
        url: 'vid://x',
        resultUrl: 'data:video/mp4;base64,AA',
        genHistory: { v: 1, attempts: [{ url: 'img://y' }] },
      }),
    ).toEqual([]);
  });

  it('★ 去重（同一 URL 出现在多处只收一次，保序）', () => {
    expect(
      collectLocalizableUrls({
        url: 'https://a/1.mp4',
        resultUrl: 'https://a/1.mp4',
        genHistory: { v: 1, attempts: [{ url: 'https://a/1.mp4' }] },
      }),
    ).toEqual(['https://a/1.mp4']);
  });

  it('genHistory 缺失 / attempts 非数组 / 坏项都不崩', () => {
    expect(collectLocalizableUrls({})).toEqual([]);
    expect(collectLocalizableUrls({ genHistory: null })).toEqual([]);
    expect(collectLocalizableUrls({ genHistory: { attempts: 'nope' } })).toEqual([]);
    expect(
      collectLocalizableUrls({ genHistory: { attempts: [null, 1, { url: 'https://a/1.mp4' }] } }),
    ).toEqual(['https://a/1.mp4']);
  });
});

describe('selectVideoNodesToLocalize（原 31056-31060）', () => {
  it('★ 只要 genvideo / video 两类', () => {
    const picked = selectVideoNodesToLocalize([
      { id: 'a', type: 'genvideo', data: {} },
      { id: 'b', type: 'video', data: {} },
      { id: 'c', type: 'imggen', data: {} },
      { id: 'd', type: 'text', data: {} },
      { id: 'e', type: 'material', data: {} },
    ]);
    expect(picked.map((n) => n.id)).toEqual(['a', 'b']);
  });

  it('data 非对象 ⇒ 归一成空表（不崩）', () => {
    expect(selectVideoNodesToLocalize([{ id: 'a', type: 'video', data: null }])[0]!.data).toEqual({});
  });
});

describe('applyLocalVideoRef（原 30952-31016）', () => {
  const base = (): Record<string, unknown> => ({
    url: 'https://a/1.mp4',
    resultUrl: 'https://a/1.mp4',
    genHistory: { v: 1, attempts: [{ id: 'a1', url: 'https://a/1.mp4' }] },
  });

  it('★ 三处同时命中（url / resultUrl / attempts）', () => {
    const { data, changed } = applyLocalVideoRef(base(), 'https://a/1.mp4', 'vid://1.mp4');
    expect(changed).toBe(true);
    expect(data.url).toBe('vid://1.mp4');
    expect(data.resultUrl).toBe('vid://1.mp4');
    expect((data.genHistory as { attempts: Array<{ url: string }> }).attempts[0]!.url).toBe('vid://1.mp4');
  });

  it('★ 前置守卫：空串 / 相同 ⇒ 原样返回同一引用', () => {
    const d = base();
    expect(applyLocalVideoRef(d, '', 'vid://x').data).toBe(d);
    expect(applyLocalVideoRef(d, 'https://a/1.mp4', '').data).toBe(d);
    expect(applyLocalVideoRef(d, 'https://a/1.mp4', 'https://a/1.mp4').data).toBe(d);
  });

  it('★ 一处都没命中 ⇒ 同一引用（不是"白建一份对象"）', () => {
    const d = base();
    const r = applyLocalVideoRef(d, 'https://other/x.mp4', 'vid://x');
    expect(r.changed).toBe(false);
    expect(r.data).toBe(d);
  });

  it('★ 给了 attemptId ⇒ 只改那一条 attempt', () => {
    const d: Record<string, unknown> = {
      genHistory: { v: 1, attempts: [{ id: 'a1', url: 'https://a/1.mp4' }, { id: 'a2', url: 'https://a/1.mp4' }] },
    };
    const { data, changed } = applyLocalVideoRef(d, 'https://a/1.mp4', 'vid://1.mp4', 'a2');
    expect(changed).toBe(true);
    const attempts = (data.genHistory as { attempts: Array<{ id: string; url: string }> }).attempts;
    expect(attempts[0]!.url).toBe('https://a/1.mp4');
    expect(attempts[1]!.url).toBe('vid://1.mp4');
  });

  it('attemptId 未命中 attempt，但 url/resultUrl 命中 ⇒ 仍算改', () => {
    const d: Record<string, unknown> = {
      url: 'https://a/1.mp4',
      genHistory: { v: 1, attempts: [{ id: 'a1', url: 'https://a/1.mp4' }] },
    };
    const { data, changed } = applyLocalVideoRef(d, 'https://a/1.mp4', 'vid://1.mp4', 'nope');
    expect(changed).toBe(true);
    expect(data.url).toBe('vid://1.mp4');
    // attempt 那条没被动
    expect((data.genHistory as { attempts: Array<{ url: string }> }).attempts[0]!.url).toBe('https://a/1.mp4');
  });

  it('只有 resultUrl 命中时也改（且不动 url）', () => {
    const d: Record<string, unknown> = { url: 'vid://keep', resultUrl: 'https://a/1.mp4' };
    const { data } = applyLocalVideoRef(d, 'https://a/1.mp4', 'vid://1.mp4');
    expect(data).toEqual({ url: 'vid://keep', resultUrl: 'vid://1.mp4' });
  });

  it('★ 不可变：不改传入对象及其嵌套', () => {
    const d = base();
    const snapshot = JSON.parse(JSON.stringify(d));
    applyLocalVideoRef(d, 'https://a/1.mp4', 'vid://1.mp4');
    expect(d).toEqual(snapshot);
  });

  it('genHistory 缺 attempts 时不崩，照样改 url/resultUrl', () => {
    const d: Record<string, unknown> = { url: 'https://a/1.mp4', genHistory: { v: 1 } };
    const { data, changed } = applyLocalVideoRef(d, 'https://a/1.mp4', 'vid://1.mp4');
    expect(changed).toBe(true);
    expect(data.url).toBe('vid://1.mp4');
    expect(data.genHistory).toEqual({ v: 1 });
  });
});
