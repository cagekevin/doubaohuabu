/**
 * 截图纯层单测（原 `MT` 32322 / `$T` 32333-32343）
 *
 * 断言红线（**实现一变必红**）：
 *   ① `formatClipTime` **没有小时位**（90 分 ⇒ `90-00`，不是 `01-30-00`）；
 *   ② 矩形**不取整**（浮点直接乘 —— 取整会切掉边缘像素）；
 *   ③ 守卫判的是 **DOM 矩形的宽高**（`< 2` ⇒ `null`），不是换算后的设备像素；
 *   ④ `dpr` 缺失/为 0 ⇒ **回落 1**。
 */

import { describe, expect, it } from 'vitest';
import {
  formatClipTime,
  screenshotNodePlacement,
  SCREENSHOT_STACK_MAX,
  toCaptureRect,
} from '../capture';

describe('formatClipTime（原 `MT` 32322）', () => {
  it('★ 秒 ⇒ `MM-SS`，两段都补零', () => {
    expect(formatClipTime(0)).toBe('00-00');
    expect(formatClipTime(5)).toBe('00-05');
    expect(formatClipTime(65)).toBe('01-05');
    expect(formatClipTime(600)).toBe('10-00');
  });

  it('★★ **没有小时位**：90 分 ⇒ `90-00`（源版如此）', () => {
    expect(formatClipTime(5400)).toBe('90-00');
    expect(formatClipTime(3600)).toBe('60-00');
  });

  it('★ 先 `floor`（小数被截断）', () => {
    expect(formatClipTime(59.9)).toBe('00-59');
    expect(formatClipTime(60.5)).toBe('01-00');
  });

  it('★ **负数 / 非数 ⇒ 归 0**（源版 `max(0, floor(t || 0))`）', () => {
    expect(formatClipTime(-5)).toBe('00-00');
    expect(formatClipTime(undefined)).toBe('00-00');
    expect(formatClipTime(null)).toBe('00-00');
    expect(formatClipTime('abc')).toBe('00-00');
    expect(formatClipTime(NaN)).toBe('00-00');
  });

  it('★ 字符串数字会被 `Number()` 收（源版是 `e || 0` 后 `Math.floor`）', () => {
    expect(formatClipTime('65')).toBe('01-05');
  });
});

describe('toCaptureRect（原 `$T` 32333）', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it('★ 四字段都乘 `dpr`', () => {
    expect(toCaptureRect(rect, 2)).toEqual({ x: 200, y: 100, width: 400, height: 200 });
    expect(toCaptureRect(rect, 1)).toEqual({ x: 100, y: 50, width: 200, height: 100 });
  });

  it('★★ **不取整**（浮点直接乘）', () => {
    const r = toCaptureRect({ left: 10.5, top: 20.25, width: 100.5, height: 50.25 }, 1.5);
    expect(r).toEqual({ x: 15.75, y: 30.375, width: 150.75, height: 75.375 });
  });

  it('★★ 守卫：**宽或高 < 2px ⇒ `null`**（元素没渲染/被折叠）', () => {
    expect(toCaptureRect({ ...rect, width: 1.9 }, 2)).toBeNull();
    expect(toCaptureRect({ ...rect, height: 1.9 }, 2)).toBeNull();
    expect(toCaptureRect({ ...rect, width: 2, height: 2 }, 2)).not.toBeNull(); // 恰好 2 ⇒ 通过
  });

  it('★ 没有元素（`null`/`undefined`）⇒ `null`（调用方据此放弃，不抛）', () => {
    expect(toCaptureRect(null, 2)).toBeNull();
    expect(toCaptureRect(undefined, 2)).toBeNull();
  });

  it('★ `dpr` 缺失 / 为 0 / 非数 ⇒ **回落 1**（源版 `|| 1`）', () => {
    expect(toCaptureRect(rect, undefined)).toEqual({ x: 100, y: 50, width: 200, height: 100 });
    expect(toCaptureRect(rect, 0)).toEqual({ x: 100, y: 50, width: 200, height: 100 });
    expect(toCaptureRect(rect, null)).toEqual({ x: 100, y: 50, width: 200, height: 100 });
    expect(toCaptureRect(rect, NaN)).toEqual({ x: 100, y: 50, width: 200, height: 100 });
  });

  it('★ 守卫判的是**DOM 矩形的宽高**（不是换算后的）—— 宽 1.9 即使 dpr=10 也不截', () => {
    expect(toCaptureRect({ ...rect, width: 1.9 }, 10)).toBeNull();
  });

  it('负坐标**不夹**（源版不夹 —— 视口外的元素由宿主处理）', () => {
    expect(toCaptureRect({ left: -100, top: -50, width: 200, height: 100 }, 1)).toEqual({
      x: -100,
      y: -50,
      width: 200,
      height: 100,
    });
  });
});

describe('screenshotNodePlacement（原 `addScreenshotMaterial` 28328）', () => {
  const anchor = { position: { x: 100, y: 200 }, width: 300 };

  it('★ 第 1 张：放在视频**右侧**（`x + 宽 + 40`），y 与视频齐平', () => {
    expect(screenshotNodePlacement(anchor, 0)).toEqual({ x: 440, y: 200 });
  });

  it('★ 每张**下移 26px**', () => {
    expect(screenshotNodePlacement(anchor, 1)).toEqual({ x: 440, y: 226 });
    expect(screenshotNodePlacement(anchor, 3)).toEqual({ x: 440, y: 278 });
  });

  it('★★ **最多叠 8 层**：第 9 张起与第 8 张**重合**（源版如此）', () => {
    expect(SCREENSHOT_STACK_MAX).toBe(8);
    expect(screenshotNodePlacement(anchor, 8)).toEqual({ x: 440, y: 200 + 8 * 26 });
    expect(screenshotNodePlacement(anchor, 9)).toEqual(screenshotNodePlacement(anchor, 8));
    expect(screenshotNodePlacement(anchor, 100)).toEqual(screenshotNodePlacement(anchor, 8));
  });

  it('★ 视频**没有宽度** ⇒ 兜底 **320**（源版 `|| 320`）', () => {
    expect(screenshotNodePlacement({ position: { x: 0, y: 0 } }, 0)).toEqual({ x: 360, y: 0 });
    expect(screenshotNodePlacement({ position: { x: 0, y: 0 }, width: 0 }, 0).x).toBe(360);
  });

  it('★ 负数/非数张数 ⇒ 归 0（不产生反向偏移）', () => {
    expect(screenshotNodePlacement(anchor, -3).y).toBe(200);
    expect(screenshotNodePlacement(anchor, NaN).y).toBe(200);
  });

  it('★ 坐标缺失 ⇒ 当 0（不抛）', () => {
    expect(screenshotNodePlacement({ position: { x: 0, y: 0 } }, 0)).toEqual({ x: 360, y: 0 });
  });
});
