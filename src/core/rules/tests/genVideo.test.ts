/**
 * 文生视频节点纯规则单测（原 `YL.jsx` 的 `v` / `h` / `y` / `A` / `R`·`D` / `X` / `J` / `Ve` / `gv-apijob`）
 *
 * ⚠️ 断言**逐值对源**（`YL.jsx:42,64-75,62-109,171-173,196-200,357,545,561-563`）—— 不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import {
  apiJobLabel,
  durationText,
  frameCrop,
  framePlacement,
  frameSeekSeconds,
  frameTargetRatio,
  genVideoDownloadName,
  hasRealDuration,
  hasResult,
  nodeAccountLabel,
  seekSeconds,
  stageRatio,
  timelinePercent,
} from '../genVideo';
import type { Account } from '@/stable/model/account';

describe('stageRatio（原 `v`，`YL.jsx:64-75`）', () => {
  it('三分支：9:16 / 1:1 / 其余', () => {
    expect(stageRatio('9:16')).toBe('9 / 16');
    expect(stageRatio('1:1')).toBe('1 / 1');
    expect(stageRatio('16:9')).toBe('16 / 9');
  });

  it('★ 空值与**其它比例**一律 `16 / 9`（源只有三个分支 —— `4:3` 也不例外）', () => {
    expect(stageRatio(undefined)).toBe('16 / 9');
    expect(stageRatio('')).toBe('16 / 9');
    expect(stageRatio('4:3')).toBe('16 / 9');
    expect(stageRatio('3:4')).toBe('16 / 9');
  });
});

describe('hasResult（原 `h`，`YL.jsx:42`）', () => {
  it('`resultUrl` 或 `resultPoster` 任一为真即真', () => {
    expect(hasResult({ resultUrl: 'img://x.png' })).toBe(true);
    expect(hasResult({ resultPoster: 'img://p.png' })).toBe(true);
    expect(hasResult({ resultUrl: 'a', resultPoster: 'b' })).toBe(true);
  });

  it('都没有 ⇒ 假（含空串 —— 源是 `!!`，空串算假）', () => {
    expect(hasResult({})).toBe(false);
    expect(hasResult({ resultUrl: '', resultPoster: '' })).toBe(false);
  });
});

describe('nodeAccountLabel（原 `y`，`YL.jsx:62-109`）', () => {
  const accounts = [{ id: 'a_1', name: '豆包01' }] as unknown as Account[];
  const groups = [{ id: 'g1', name: '主力' }];

  it('空 / `auto` ⇒ 全部账号（自动）', () => {
    expect(nodeAccountLabel({})).toBe('全部账号（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto' })).toBe('全部账号（自动）');
  });

  it('`auto:group:ungrouped` ⇒ 未分组（自动）', () => {
    expect(nodeAccountLabel({ sendAccount: 'auto:group:ungrouped' })).toBe('未分组（自动）');
  });

  it('`auto:group:<id>` ⇒ 组名（自动）；查不到 ⇒ 分组（自动）', () => {
    expect(nodeAccountLabel({ sendAccount: 'auto:group:g1', groups })).toBe('主力（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:group:nope', groups })).toBe('分组（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:group:g1' })).toBe('分组（自动）');
  });

  it('`auto:<channel>` ⇒ 频道名账号（自动）；查不到频道 ⇒ 原文账号（自动）', () => {
    expect(nodeAccountLabel({ sendAccount: 'auto:doubao' })).toBe('豆包账号（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:other' })).toBe('其他账号（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:lovart' })).toBe('Lovart账号（自动）');
    expect(nodeAccountLabel({ sendAccount: 'auto:unknownch' })).toBe('unknownch账号（自动）');
  });

  it('显式账号 id ⇒ 账号名；查不到 ⇒ 豆包账号（自动）', () => {
    expect(nodeAccountLabel({ sendAccount: 'a_1', accounts })).toBe('豆包01');
    expect(nodeAccountLabel({ sendAccount: 'a_missing', accounts })).toBe('豆包账号（自动）');
  });

  it('★ 不看 `channel`（与 `accountPickerLabel` 的 `api` 优先**不同**）', () => {
    expect(nodeAccountLabel({ sendAccount: 'auto' })).toBe('全部账号（自动）');
    // 反证：同样的输入喂给 picker 那套会得 'API'（见 accountPick.test.ts）
  });
});

describe('hasRealDuration（原 `A`，`YL.jsx:173`）', () => {
  it('有结果 + 有限正数 ⇒ 真', () => {
    expect(hasRealDuration(true, 8)).toBe(true);
    expect(hasRealDuration(true, 0.4)).toBe(true);
  });

  it('★ 四个条件缺一即假：无结果 / 非有限 / 0 / 负数', () => {
    expect(hasRealDuration(false, 8)).toBe(false);
    expect(hasRealDuration(true, Number.NaN)).toBe(false);
    expect(hasRealDuration(true, Number.POSITIVE_INFINITY)).toBe(false);
    expect(hasRealDuration(true, 0)).toBe(false);
    expect(hasRealDuration(true, -1)).toBe(false);
  });
});

describe('durationText（原 `R`+`D`，`YL.jsx:171-172`）', () => {
  it('真实时长优先；整数不带小数、非整数保留 1 位', () => {
    expect(durationText(true, 8, 5)).toBe('8');
    expect(durationText(true, 8.4, 5)).toBe('8.4');
    expect(durationText(true, 8.44, 5)).toBe('8.4');
  });

  it('没有真实时长 ⇒ 用计划时长（同样按整数规则）', () => {
    expect(durationText(false, 8, 5)).toBe('5');
    expect(durationText(false, 0, 5.5)).toBe('5.5');
    expect(durationText(true, Number.NaN, 5)).toBe('5');
  });

  it('★ 源的双重兜底逐字保留：计划时长也非有限 ⇒ `String(计划时长)`（得 `"NaN"`）', () => {
    expect(durationText(false, 0, Number.NaN)).toBe('NaN');
  });
});

describe('timelinePercent（原 `X`，`YL.jsx:545`）', () => {
  it('分母是**真实时长**，夹到 [0,100]', () => {
    expect(timelinePercent(4, 8)).toBe(50);
    expect(timelinePercent(5, 8)).toBe(62.5);
  });

  it('越界夹取', () => {
    expect(timelinePercent(-1, 8)).toBe(0);
    expect(timelinePercent(10, 8)).toBe(100);
  });

  it('★ 真实时长为 0 ⇒ 0（避开 0/0）', () => {
    expect(timelinePercent(3, 0)).toBe(0);
  });
});

describe('seekSeconds（原 `J` 的 `ze`/`Qe`，`YL.jsx:196-200`）', () => {
  it('视频时长可用 ⇒ 用它', () => {
    expect(seekSeconds(0.5, 8, 5)).toBe(4);
    expect(seekSeconds(0.25, 8, 99)).toBe(2);
  });

  it('★ 视频时长不可用（0 / 非有限）⇒ 回落到真实时长', () => {
    expect(seekSeconds(0.5, 0, 8)).toBe(4);
    expect(seekSeconds(0.5, Number.NaN, 8)).toBe(4);
  });

  it('两者都不可用 ⇒ 0（调用方据此跳过写入）', () => {
    expect(seekSeconds(0.5, 0, 0)).toBe(0);
  });
});

describe('genVideoDownloadName（原 `Ve`，`YL.jsx:357`）', () => {
  it('自定义名 ⇒ 用它；后缀由调用方给', () => {
    expect(genVideoDownloadName('我的片', 'mp4', 1700000000000)).toBe('我的片_1700000000000.mp4');
    expect(genVideoDownloadName('封面', 'png', 7)).toBe('封面_7.png');
  });

  it('★ 缺名 / 空串 / 恰为 `文生视频` ⇒ 回落 `文生视频`（源的 `d.label !== \'文生视频\'` 判据）', () => {
    expect(genVideoDownloadName(undefined, 'mp4', 5)).toBe('文生视频_5.mp4');
    expect(genVideoDownloadName('', 'mp4', 5)).toBe('文生视频_5.mp4');
    expect(genVideoDownloadName('文生视频', 'mp4', 5)).toBe('文生视频_5.mp4');
  });
});

describe('apiJobLabel（原 `gv-apijob`，`YL.jsx:561-563`）', () => {
  it('★ `null` = 不渲染：无 apiJob / 无 status / 已 `done`', () => {
    expect(apiJobLabel(undefined)).toBeNull();
    expect(apiJobLabel(null)).toBeNull();
    expect(apiJobLabel({})).toBeNull();
    expect(apiJobLabel({ status: '' })).toBeNull();
    expect(apiJobLabel({ status: 123 })).toBeNull();
    expect(apiJobLabel({ status: 'done' })).toBeNull();
  });

  it('六个状态各自的文案（逐字）', () => {
    expect(apiJobLabel({ status: 'queued' })).toBe('⏳ API 排队中');
    expect(apiJobLabel({ status: 'submitting' })).toBe('⏳ API 提交中');
    expect(apiJobLabel({ status: 'downloading' })).toBe('⬇️ API 结果接收中');
    expect(apiJobLabel({ status: 'cancelled' })).toBe('⏹ API 任务已取消');
  });

  it('`running`：有数字进度带 `%`，否则 `…`（★ `0` 也是数字）', () => {
    expect(apiJobLabel({ status: 'running' })).toBe('🎬 API 生成中…');
    expect(apiJobLabel({ status: 'running', progress: '42' })).toBe('🎬 API 生成中…');
    expect(apiJobLabel({ status: 'running', progress: 42 })).toBe('🎬 API 生成中 42%');
    expect(apiJobLabel({ status: 'running', progress: 0 })).toBe('🎬 API 生成中 0%');
  });

  it('`failed`：用 `error.message`；缺失 / 空串 ⇒ `未知错误`', () => {
    expect(apiJobLabel({ status: 'failed', error: { message: '额度不足' } })).toBe('⚠️ API 失败：额度不足');
    expect(apiJobLabel({ status: 'failed', error: { message: '' } })).toBe('⚠️ API 失败：未知错误');
    expect(apiJobLabel({ status: 'failed', error: 'oops' })).toBe('⚠️ API 失败：未知错误');
    expect(apiJobLabel({ status: 'failed' })).toBe('⚠️ API 失败：未知错误');
  });

  it('★ 未识别的状态 ⇒ **空串**（源仍渲染那个空 `<div>` —— 逐字保留）', () => {
    expect(apiJobLabel({ status: 'weird' })).toBe('');
  });
});

describe('三帧→画布参考图（原 `se`，`YL.jsx:206-348`）', () => {
  it('frameTargetRatio：6 档 + `auto`；查不到 ⇒ 16/9（★ 与 `stageRatio` **不是同一张表**）', () => {
    expect(frameTargetRatio('16:9')).toBeCloseTo(16 / 9);
    expect(frameTargetRatio('9:16')).toBeCloseTo(9 / 16);
    expect(frameTargetRatio('1:1')).toBe(1);
    expect(frameTargetRatio('3:4')).toBeCloseTo(3 / 4);
    expect(frameTargetRatio('4:3')).toBeCloseTo(4 / 3);
    expect(frameTargetRatio('21:9')).toBeCloseTo(21 / 9);
    expect(frameTargetRatio('auto')).toBeCloseTo(16 / 9);
    expect(frameTargetRatio(undefined)).toBeCloseTo(16 / 9);
    expect(frameTargetRatio('weird')).toBeCloseTo(16 / 9);
    // ★ 反证：`stageRatio` 把 4:3 当 16/9，而这里 4:3 **是** 4/3
    expect(stageRatio('4:3')).toBe('16 / 9');
    expect(frameTargetRatio('4:3')).not.toBeCloseTo(16 / 9);
  });

  it('frameSeekSeconds：头帧 0 · 尾帧 `总时长 - 0.05` · 当前帧 = 传入的 currentTime', () => {
    expect(frameSeekSeconds('head', 5, 8, 3)).toBe(0);
    expect(frameSeekSeconds('tail', 5, 8, 3)).toBeCloseTo(7.95);
    expect(frameSeekSeconds('current', 5, 8, 3)).toBe(5);
  });

  it('frameSeekSeconds：视频时长不可用 ⇒ 回落真实时长 `z`', () => {
    expect(frameSeekSeconds('tail', 5, 0, 3)).toBeCloseTo(2.95);
    expect(frameSeekSeconds('tail', 5, Number.NaN, 3)).toBeCloseTo(2.95);
  });

  it('frameCrop：比例相等 ⇒ 原样；视频更宽 ⇒ 裁两侧；更高 ⇒ 裁上下', () => {
    // 16:9 视频 + 16:9 目标 ⇒ 不裁
    expect(frameCrop(1920, 1080, '16:9')).toEqual({ sx: 0, sy: 0, sw: 1920, sh: 1080, outW: 1920, outH: 1080 });
    // 2:1 视频 + 16:9 目标 ⇒ 裁两侧（`sw = h * target`，`sx` 居中）
    const wide = frameCrop(2000, 1000, '16:9');
    expect(wide.sw).toBeCloseTo(1000 * (16 / 9));
    expect(wide.sx).toBeCloseTo((2000 - 1000 * (16 / 9)) / 2);
    expect(wide.sh).toBe(1000);
    expect(wide.outW).toBe(1778);
    expect(wide.outH).toBe(1000);
    // 1:1 视频 + 16:9 目标 ⇒ 裁上下（`sh = w / target`，`sy` 居中）
    const tall = frameCrop(1000, 1000, '16:9');
    expect(tall.sh).toBeCloseTo(1000 / (16 / 9));
    expect(tall.sy).toBeCloseTo((1000 - 1000 / (16 / 9)) / 2);
    expect(tall.sw).toBe(1000);
    expect(tall.outW).toBe(1000);
    expect(tall.outH).toBe(563);
  });

  it('framePlacement：宽 `max(220, 源宽-24)`、高 `round(54 + (宽-18)/比例)`、右侧一列每列 3 个', () => {
    const src = { position: { x: 100, y: 200 }, width: 400 };
    const first = framePlacement(src, 0, '16:9');
    expect(first.w).toBe(376); // max(220, 400-24)
    expect(first.h).toBe(255); // round(54 + 358/(16/9))
    expect(first.position).toEqual({ x: 560, y: 200 }); // 100+400+60, 200

    // 第 4 张 ⇒ 换列（列距 `宽+40`）
    const fourth = framePlacement(src, 3, '16:9');
    expect(fourth.position.x).toBe(560 + (376 + 40));
    expect(fourth.position.y).toBe(200);

    // 第 5 张 ⇒ 同列第 2 行（行距 `高+24`）
    const fifth = framePlacement(src, 4, '16:9');
    expect(fifth.position.x).toBe(560 + (376 + 40));
    expect(fifth.position.y).toBe(200 + (255 + 24));
  });

  it('framePlacement：缺源节点 ⇒ `{0,0}` + 宽 380；`measured.width` 优先于 `width`', () => {
    const none = framePlacement(undefined, 0, '16:9');
    expect(none.w).toBe(356); // max(220, 380-24)
    expect(none.position).toEqual({ x: 440, y: 0 }); // 0+380+60
    const measured = framePlacement({ position: { x: 0, y: 0 }, width: 400, measured: { width: 500 } }, 0, '16:9');
    expect(measured.w).toBe(476); // max(220, 500-24)
  });
});
