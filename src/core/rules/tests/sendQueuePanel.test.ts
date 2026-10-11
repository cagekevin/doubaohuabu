/**
 * 发送队列面板纯显示层单测 —— 原 `Qd` 42586
 *
 * ⚠️ **2026-10-11（`TD-16-103`）删掉了两个 describe**：`formatElapsed` 与 `deriveGenView` ——
 *   它们是 `core/rules/genProgress.ts` 的**第二份**转写（`sendQueuePanel.ts` 里那份抄本）。
 *   删前逐条比对过覆盖：`tests/genProgress.test.ts` **严格更严**（多出窗口**边界** `at === startedAt-1500`、
 *   脏记录防御（`null` 元素 / `at` 非数字 / 非有限数）、`last.status` 非终态、`finishedAt` 优先、
 *   `filter` 三态等）⇒ 本文件那两段是其**子集**，无覆盖损失。
 *
 * 断言红线（**实现一变必红**）：`clampPanelPosition` 的**夹取**（正常 / 负值 / 右下越界 / 面板比视口大）。
 */

import { describe, expect, it } from 'vitest';
import { clampPanelPosition } from '../sendQueuePanel';

describe('clampPanelPosition（原 `Qd` 42586）', () => {
  it('★ 正常范围：原样（取整）', () => {
    expect(clampPanelPosition(100.4, 200.6, 300, 200, { w: 1280, h: 800 })).toEqual({ x: 100, y: 201 });
  });

  it('★ 负值 ⇒ 夹到 `0`', () => {
    expect(clampPanelPosition(-50, -50, 300, 200, { w: 1280, h: 800 })).toEqual({ x: 0, y: 0 });
  });

  it('★ 超出右下 ⇒ 夹到 `视口 - 面板尺寸`', () => {
    expect(clampPanelPosition(9999, 9999, 300, 200, { w: 1280, h: 800 })).toEqual({ x: 980, y: 600 });
  });

  it('★ **面板比视口大** ⇒ 夹到 `0`（不是负值）', () => {
    expect(clampPanelPosition(50, 50, 2000, 1000, { w: 1280, h: 800 })).toEqual({ x: 0, y: 0 });
  });
});
