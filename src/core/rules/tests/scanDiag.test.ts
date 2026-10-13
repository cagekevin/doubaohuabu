/**
 * 抓取诊断纯判据单测（原 `GT`，`shared.js:32453-32477`）
 *
 * 断言红线：**实现一变必红** —— 摘要的**档位顺序**、`docCount || 1` 的缺省、以及
 * 「有才出」的四档（`iframe` / `shadowRoot` / `canvas`），以及**收窄**（缺字段 ⇒ `null`）。
 */

import { describe, expect, it } from 'vitest';
import { formatScanDiag, normalizeScanDiag, shouldExportCanvas } from '../scanDiag';
import type { CanvasBox, ScanDiag } from '@/core/ports/site.port';

const diag = (over: Partial<ScanDiag> = {}): ScanDiag => ({
  docCount: 1,
  iframeCount: 0,
  shadowCount: 0,
  imgTotal: 0,
  imgUsable: 0,
  canvasCount: 0,
  canvases: [],
  itemsRaw: 0,
  itemsKept: 0,
  ...over,
});

const box = (over: Partial<CanvasBox> = {}): CanvasBox => ({ w: 0, h: 0, dw: 0, dh: 0, ...over });

describe('formatScanDiag（原 `GT`）', () => {
  it('★ 没有诊断 ⇒ `（无诊断数据）`（原 `:32455` 逐字）', () => {
    expect(formatScanDiag(null)).toBe('（无诊断数据）');
    expect(formatScanDiag(undefined)).toBe('（无诊断数据）');
  });

  it('★ 全 0 ⇒ 只出**恒有三档**；且 `docCount` 0 按 **1**（原 `e.docCount || 1`）', () => {
    expect(formatScanDiag(diag())).toBe('文档 1 · img 0（可用 0） · 候选 0→0');
    expect(formatScanDiag(diag({ docCount: 0 }))).toBe('文档 1 · img 0（可用 0） · 候选 0→0');
  });

  it('★ 档位**顺序即语义**：文档 → iframe → shadowRoot → img → canvas → 候选', () => {
    const s = formatScanDiag(
      diag({ docCount: 3, iframeCount: 2, shadowCount: 5, imgTotal: 32, imgUsable: 4, canvasCount: 1, itemsRaw: 32, itemsKept: 4 }),
    );
    expect(s).toBe('文档 3 · iframe 2 · shadowRoot 5 · img 32（可用 4） · canvas 1 · 候选 32→4');
  });

  it('★ 「有才出」的四档：为 0 时**整档不出现**', () => {
    const s = formatScanDiag(diag({ iframeCount: 0, shadowCount: 0, canvasCount: 0 }));
    expect(s).not.toContain('iframe');
    expect(s).not.toContain('shadowRoot');
    expect(s).not.toContain('canvas');
  });

  it('★ 分隔符是 ` · `（原 `:32476`）', () => {
    expect(formatScanDiag(diag({ canvasCount: 2 }))).toContain(' · canvas 2 · ');
  });

  it('★ **不含 `frame N 个` 档**（源里它读 `diag.frames`，而 `hp` 从不写该字段 = 死分支）', () => {
    expect(formatScanDiag(diag({ iframeCount: 9 }))).not.toContain('frame 9 个');
  });
});

describe('normalizeScanDiag（页内脚本是运行时数据 ⇒ 必须收窄）', () => {
  it('★ 八个字段齐全且都是有限数 ⇒ 原样收下', () => {
    const raw = { docCount: 1, iframeCount: 2, shadowCount: 3, imgTotal: 4, imgUsable: 5, canvasCount: 6, canvases: [], itemsRaw: 7, itemsKept: 8 };
    expect(normalizeScanDiag(raw)).toEqual(raw);
  });

  it('★ **缺任一字段 ⇒ `null`**（不补默认值 —— 补了就是把"没给"伪装成"是 0"）', () => {
    const full = { docCount: 1, iframeCount: 2, shadowCount: 3, imgTotal: 4, imgUsable: 5, canvasCount: 6, canvases: [], itemsRaw: 7, itemsKept: 8 };
    for (const k of Object.keys(full)) {
      const partial: Record<string, unknown> = { ...full };
      delete partial[k];
      expect(normalizeScanDiag(partial), `缺 ${k} 应判 null`).toBeNull();
    }
  });

  it('★ `canvases`：合法数组原样收下（含四个数）', () => {
    const raw = { ...diag({ canvasCount: 1 }), canvases: [{ w: 800, h: 600, dw: 400, dh: 300 }] };
    expect(normalizeScanDiag(raw)).toEqual(raw);
  });

  it('★ `canvases` 不是数组 ⇒ `null`；**有一条不合法 ⇒ 整个诊断作废**（不"跳过坏条目"）', () => {
    expect(normalizeScanDiag({ ...diag(), canvases: 'x' })).toBeNull();
    expect(normalizeScanDiag({ ...diag(), canvases: [box({ w: 800 }), { w: 1, h: 2 }] })).toBeNull();
    expect(normalizeScanDiag({ ...diag(), canvases: [box({ w: 800, dh: Number.NaN })] })).toBeNull();
  });

  it('★ 字段不是数字 / 非有限数 ⇒ `null`', () => {
    expect(normalizeScanDiag({ ...diag(), imgTotal: '32' })).toBeNull();
    expect(normalizeScanDiag({ ...diag(), imgTotal: Number.NaN })).toBeNull();
    expect(normalizeScanDiag({ ...diag(), imgTotal: Number.POSITIVE_INFINITY })).toBeNull();
  });

  it('非对象 ⇒ `null`', () => {
    expect(normalizeScanDiag(null)).toBeNull();
    expect(normalizeScanDiag('x')).toBeNull();
    expect(normalizeScanDiag(42)).toBeNull();
  });
});

describe('shouldExportCanvas（原 `wp:32611-32613` 的画布门）', () => {
  it('★ 没有诊断 / `canvasCount` 为 0 ⇒ **不导**', () => {
    expect(shouldExportCanvas(null)).toBe(false);
    expect(shouldExportCanvas(undefined)).toBe(false);
    expect(shouldExportCanvas(diag({ canvasCount: 0, canvases: [box({ w: 900, h: 900 })] }))).toBe(false);
  });

  it('★ 画布都不够大（< 200）⇒ 不导', () => {
    expect(shouldExportCanvas(diag({ canvasCount: 1, canvases: [box({ w: 199, h: 199 })] }))).toBe(false);
  });

  it('★ 边界：**恰好 200 就算够大**（源是 `>= 200`）', () => {
    expect(shouldExportCanvas(diag({ canvasCount: 1, canvases: [box({ w: 200 })] }))).toBe(true);
  });

  it('★ 四个数里**任一**够大即可（像素不够但布局够大 ⇒ 也导）', () => {
    expect(shouldExportCanvas(diag({ canvasCount: 1, canvases: [box({ w: 10, h: 10, dw: 10, dh: 300 })] }))).toBe(true);
  });

  it('★ **只要有一个**够大就导（不要求全部）', () => {
    const d = diag({ canvasCount: 3, canvases: [box({ w: 10, h: 10 }), box({ w: 800, h: 600 }), box({ w: 10, h: 10 })] });
    expect(shouldExportCanvas(d)).toBe(true);
  });
});
