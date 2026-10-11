/**
 * 下载节点纯层单测（原 `WL.jsx` 150 行的逻辑半 + `Kd` 40779）
 *
 * 断言红线（**实现一变必红**）：`formatBytes` 的 **`0 ⇒ 空串`** 与 **B 档无小数/无 GB 档**、
 * `downloadFileName` 的**先替换再截断**与**固定 `.mp4`**、`collectDownloadTargets` 的
 * **只看直接入边 + 只认 `video` + 不去重**、`totalDownloadedBytes` 的**只累加 ok**。
 */

import { describe, expect, it } from 'vitest';
import {
  collectDownloadTargets,
  countDownloaded,
  downloadFileName,
  formatBytes,
  totalDownloadedBytes,
} from '../downloadNode';

describe('formatBytes（原 `Kd` 40779）', () => {
  it('★ **`0` / 空 / `NaN` ⇒ 空串**（源版是 `if (e)` 的假值判定，不是 `0 B`）', () => {
    expect(formatBytes(0)).toBe('');
    expect(formatBytes(null)).toBe('');
    expect(formatBytes(undefined)).toBe('');
    expect(formatBytes(NaN)).toBe('');
    expect(formatBytes('')).toBe('');
  });

  it('★ `< 1024` ⇒ **整数 B**（无小数）', () => {
    expect(formatBytes(1)).toBe('1 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  it('★ `< 1 MiB` ⇒ KB，保留 **1 位小数**', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1048575)).toBe('1024.0 KB');
  });

  it('★ `>= 1 MiB` ⇒ MB，保留 1 位小数；**没有 GB 档**', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(5 * 1048576)).toBe('5.0 MB');
    // ⚠️ 源版最大就是 MB ⇒ 10 GiB 也显示 MB
    expect(formatBytes(10 * 1024 * 1048576)).toBe('10240.0 MB');
  });
});

describe('downloadFileName（原 `WL.jsx:55`）', () => {
  it('★ 优先 `label`，其次 `vid`，都没有才用 `video`', () => {
    expect(downloadFileName({ label: '小猫', vid: 'vid_1' })).toBe('小猫.mp4');
    expect(downloadFileName({ vid: 'vid_1' })).toBe('vid_1.mp4');
    expect(downloadFileName({})).toBe('video.mp4');
    expect(downloadFileName(null)).toBe('video.mp4');
  });

  it('★ 非法字符换 `_`（**保留** 字母数字、下划线、中文、连字符）', () => {
    expect(downloadFileName({ label: 'a b/c:d' })).toBe('a_b_c_d.mp4');
    expect(downloadFileName({ label: 'a-b_c1中文' })).toBe('a-b_c1中文.mp4');
  });

  it('★★ **先替换再截断**到 60 字符（顺序反了会让非法字符漏进文件名）', () => {
    // 61 个 `!` ⇒ 全部替换成 `_`，再截成 60 个
    expect(downloadFileName({ label: '!'.repeat(61) })).toBe(`${'_'.repeat(60)}.mp4`);
    // 61 个中文字符：合法 ⇒ 已被替换步骤放行，截断成 60 个
    expect(downloadFileName({ label: '中'.repeat(61) })).toBe(`${'中'.repeat(60)}.mp4`);
  });

  it('★ 后缀**固定 `.mp4`**（不看真实容器格式）', () => {
    expect(downloadFileName({ label: 'a.webm' })).toBe('a_webm.mp4');
  });

  it('空 label 但非空 vid ⇒ 用 vid（源版是 `||` 而不是 `??`）', () => {
    expect(downloadFileName({ label: '', vid: 'v1' })).toBe('v1.mp4');
  });
});

describe('collectDownloadTargets（原 `WL.jsx:18-29`）', () => {
  const video = (id: string, url = 'vid://a.mp4') => ({ id, type: 'video', data: { url } });
  const material = (id: string) => ({ id, type: 'material', data: { dataUrl: 'img://a.png' } });

  it('★ 只取**直接入边**里 `video` 且有 `url` 的源节点', () => {
    const nodes = [video('v1'), material('m1'), video('v2', '')];
    const edges = [
      { source: 'v1', target: 'd' },
      { source: 'm1', target: 'd' }, // 不是 video ⇒ 排除
      { source: 'v2', target: 'd' }, // 没有 url ⇒ 排除
    ];
    expect(collectDownloadTargets(nodes, edges, 'd').map((n) => n.id)).toEqual(['v1']);
  });

  it('★ **不看传递上游**（只直接入边）', () => {
    const nodes = [video('up'), video('mid')];
    const edges = [
      { source: 'up', target: 'mid' },
      { source: 'mid', target: 'd' },
    ];
    // `up` 是 mid 的上游、不是 d 的直接前驱 ⇒ 不在列表里
    expect(collectDownloadTargets(nodes, edges, 'd').map((n) => n.id)).toEqual(['mid']);
  });

  it('★ 出边不算', () => {
    const nodes = [video('v1'), video('down')];
    expect(collectDownloadTargets(nodes, [{ source: 'd', target: 'down' }], 'd')).toEqual([]);
  });

  it('★ 顺序 = **边数组顺序**', () => {
    const nodes = [video('v1'), video('v2')];
    const edges = [
      { source: 'v2', target: 'd' },
      { source: 'v1', target: 'd' },
    ];
    expect(collectDownloadTargets(nodes, edges, 'd').map((n) => n.id)).toEqual(['v2', 'v1']);
  });

  it('⚠️ **不去重**（同源两条边 ⇒ 出现两次 —— 源版就是 `map` 后 `filter`，照抄）', () => {
    const nodes = [video('v1')];
    const edges = [
      { source: 'v1', target: 'd' },
      { source: 'v1', target: 'd' },
    ];
    expect(collectDownloadTargets(nodes, edges, 'd')).toHaveLength(2);
  });

  it('源节点找不到（悬空边）⇒ 跳过，不抛', () => {
    expect(collectDownloadTargets([], [{ source: 'ghost', target: 'd' }], 'd')).toEqual([]);
  });
});

describe('totalDownloadedBytes / countDownloaded（原 `WL.jsx:98-102`）', () => {
  it('★ 只累加 `status === "ok"` 的 `size`', () => {
    expect(
      totalDownloadedBytes({
        a: { status: 'ok', size: 1024 },
        b: { status: 'ok' }, // size 缺 ⇒ 记 0
        c: 'downloading', // 不算
        d: { status: 'err', error: 'x' }, // 不算
      }),
    ).toBe(1024);
  });

  it('空表 ⇒ 0', () => {
    expect(totalDownloadedBytes({})).toBe(0);
    expect(countDownloaded({})).toBe(0);
  });

  it('countDownloaded 只数 ok', () => {
    expect(
      countDownloaded({ a: { status: 'ok' }, b: { status: 'err', error: 'x' }, c: 'downloading' }),
    ).toBe(1);
  });
});
