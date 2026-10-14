/**
 * 生成面板锚定单测（原 `Z3_1.jsx:60-90`，TD-16-89）
 *
 * ⚠️ 断言**逐值对源**（下方优先 / 翻转 / 三重夹取 / 量测优先链）—— 不是"不崩"式自证。
 */

import { describe, expect, it } from 'vitest';
import {
  planGenPanelAnchor,
  planSelectionAnchor,
  PANEL_ANCHOR_MARGIN,
  SEL_TOOLBAR_EST_H,
  SEL_TOOLBAR_GAP,
  SEL_TOOLBAR_MIN_TOP,
} from '../panelAnchor';

const WIN = { innerWidth: 1440, innerHeight: 900 };
/** 无量测尺寸的节点兜底（原 380×220） */
const NODE = { position: { x: 0, y: 0 }, width: 380, height: 220 };

describe('planGenPanelAnchor（原 `Z3_1.jsx:63-89`）', () => {
  it('★ 默认放节点**下方**，水平对齐节点中心（margin 12）', () => {
    // viewport 0/0/1：节点屏幕矩形 = (0,0,380,220)，底 = 220 ⇒ top = 232
    const a = planGenPanelAnchor({ node: NODE, viewport: { x: 0, y: 0, zoom: 1 }, window: WIN })!;
    expect(a.top).toBe(220 + PANEL_ANCHOR_MARGIN);
    // 面板宽兜底 = min(860, 1440*.92=1324.8) = 860 ⇒ left = 190 - 430 = -240 ⇒ **被夹到 12**
    expect(a.left).toBe(PANEL_ANCHOR_MARGIN);
  });

  it('★ zoom 参与换算（节点屏幕矩形 = position×zoom + viewport）', () => {
    const a = planGenPanelAnchor(
      {
        node: NODE,
        viewport: { x: 100, y: 50, zoom: 2 },
        window: WIN,
      },
    )!;
    // 屏幕底 = 50 + 220*2 = 490 ⇒ top = 502；中心 x = 100 + 380*2/2 = 480 ⇒ left = 480-430 = 50
    expect(a.top).toBe(490 + PANEL_ANCHOR_MARGIN);
    expect(a.left).toBe(50);
  });

  it('★ 下方放不下 ⇒ **翻到节点上方**（`top = 节点屏幕上 - 面板高 - margin`）', () => {
    const a = planGenPanelAnchor(
      {
        node: { position: { x: 0, y: 700 }, width: 380, height: 220 },
        viewport: { x: 0, y: 0, zoom: 1 },
        window: WIN,
      },
    )!;
    // 下方：232 + 360 = 592 < 888 —— 还放得下；把节点移到 700：底=920 ⇒ 932+360 > 888 ⇒ 翻转
    // 上面这行算错了，直接用 y=700：bottom=920，下方 top=932，932+360=1292 > 888 ⇒ 翻到 700-360-12=328
    expect(a.top).toBe(700 - 360 - PANEL_ANCHOR_MARGIN);
  });

  it('★ 翻转后仍越上界 ⇒ 夹到 margin（源 `if (Ce < Fe) Ce = Fe`）', () => {
    const a = planGenPanelAnchor(
      {
        node: { position: { x: 0, y: 0 }, width: 380, height: 220 },
        viewport: { x: 0, y: 0, zoom: 1 },
        panel: { offsetWidth: 860, offsetHeight: 800 },
        window: WIN,
      },
    )!;
    // 下方：232+800=1032 > 888 ⇒ 翻到 0-800-12 = -812 ⇒ < 12 ⇒ 夹到 12
    expect(a.top).toBe(PANEL_ANCHOR_MARGIN);
  });

  it('★ 左右夹取：`max(margin, min(left, innerWidth - 面板宽 - margin))`', () => {
    // 面板量测宽 500、节点中心在 1400 ⇒ left = 1150 ⇒ 1440-500-12 = 928 ⇒ 夹到 928
    const a = planGenPanelAnchor(
      {
        node: { position: { x: 1400, y: 0 }, width: 380, height: 220 },
        viewport: { x: 0, y: 0, zoom: 1 },
        panel: { offsetWidth: 500, offsetHeight: 300 },
        window: WIN,
      },
    )!;
    expect(a.left).toBe(WIN.innerWidth - 500 - PANEL_ANCHOR_MARGIN);
    expect(a.top).toBe(220 + PANEL_ANCHOR_MARGIN);
  });

  it('★ 节点尺寸**量测优先**（`measured → width → 380/220`）', () => {
    const a = planGenPanelAnchor(
      {
        node: { position: { x: 0, y: 0 }, width: 380, height: 220, measured: { width: 200, height: 100 } },
        viewport: { x: 0, y: 0, zoom: 1 },
        panel: { offsetWidth: 860, offsetHeight: 100 },
        window: WIN,
      },
    )!;
    // 屏幕底 = 100 ⇒ top = 112（若用了 width 兜底 220 会是 232）
    expect(a.top).toBe(100 + PANEL_ANCHOR_MARGIN);
  });
});

describe('planSelectionAnchor（原 `L3.jsx:20-49` ＋ `_Component42.jsx:131-152`，两处同形）', () => {
  const bounds = { x: 100, y: 200, width: 400, height: 300 };
  /** 工具条常数（`_Component42.jsx:141-143`：`vt=40` · `Dt=10` · `6`） */
  const TOOLBAR = {
    bounds,
    viewport: { x: 0, y: 0, zoom: 1 },
    aboveOffset: SEL_TOOLBAR_GAP,
    belowOffset: SEL_TOOLBAR_GAP,
    flipReserve: SEL_TOOLBAR_EST_H + SEL_TOOLBAR_GAP,
    minTop: SEL_TOOLBAR_MIN_TOP,
  };

  it('★ `left` = 包围盒中心 x；上方放得下 ⇒ `top` = 上边 − 间距 + `translate(-50%,-100%)`', () => {
    const a = planSelectionAnchor(TOOLBAR);
    expect(a.left).toBe(300); // (100 + 400/2) * 1 + 0
    expect(a.top).toBe(190); // 200 − 10
    expect(a.transform).toBe('translate(-50%, -100%)');
  });

  it('★ 上方放不下 ⇒ **翻到下方**（`top` = 下边 + 间距 · `translate(-50%,0)`）', () => {
    const a = planSelectionAnchor({ ...TOOLBAR, bounds: { ...bounds, y: 40 } });
    expect(a.top).toBe(350); // (40 + 300) + 10
    expect(a.transform).toBe('translate(-50%, 0)');
  });

  it('★ 边界：`上边 − 预留 == minTop` ⇒ 仍算「放得下」（源是 `>=`）', () => {
    expect(planSelectionAnchor({ ...TOOLBAR, bounds: { ...bounds, y: 56 } }).transform).toBe(
      'translate(-50%, -100%)',
    );
    expect(planSelectionAnchor({ ...TOOLBAR, bounds: { ...bounds, y: 55 } }).transform).toBe(
      'translate(-50%, 0)',
    );
  });

  it('★ viewport 换算（`zoom` + 平移）', () => {
    const a = planSelectionAnchor({ ...TOOLBAR, viewport: { x: 50, y: 30, zoom: 2 } });
    expect(a.left).toBe((100 + 200) * 2 + 50); // 650
    expect(a.top).toBe(200 * 2 + 30 - SEL_TOOLBAR_GAP); // 420
  });

  it('★ 触发条那档（三者同值）—— 与工具条**只差常数**', () => {
    const offset = 10 + 40 + 6; // BS_TRIGGER_MARGIN_X + OFFSET_Y + GAP
    const a = planSelectionAnchor({
      bounds,
      viewport: { x: 0, y: 0, zoom: 1 },
      aboveOffset: offset,
      belowOffset: offset,
      flipReserve: offset,
      minTop: SEL_TOOLBAR_MIN_TOP,
    });
    expect(a.left).toBe(300);
    expect(a.top).toBe(200 - offset); // 144
    expect(a.transform).toBe('translate(-50%, -100%)');
  });
});
