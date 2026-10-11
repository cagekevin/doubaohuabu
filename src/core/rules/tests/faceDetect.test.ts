/**
 * 人脸检测纯计算单测 —— 回源 `UD`(39516) / `zD`(39532) / `wS`(39546) / `kl`(39638) / `VD`(39669)
 *
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  buildDetectPlan,
  clamp01,
  clampBoxToImage,
  iou,
  coverFit,
  displayFaceRects,
  isUsableFaceBox,
  nmsBoxes,
  toNormalizedFaceBoxes,
  FACE_DETECT_BASE,
  FACE_NMS_IOU,
  type PixelFaceBox,
} from '../faceDetect';

const box = (x: number, y: number, w: number, h: number, score = 1): PixelFaceBox => ({ x, y, w, h, score });

describe('iou（原 `UD` 39516）', () => {
  it('自身 → 1', () => {
    expect(iou(box(0, 0, 10, 10), box(0, 0, 10, 10))).toBe(1);
  });

  it('部分重叠 → 交/并（手算：交 25 / 并 175）', () => {
    expect(iou(box(0, 0, 10, 10), box(5, 5, 10, 10))).toBeCloseTo(25 / 175, 10);
  });

  it('不相交 → 0', () => {
    expect(iou(box(0, 0, 10, 10), box(20, 20, 10, 10))).toBe(0);
    expect(iou(box(0, 0, 10, 10), box(10, 0, 10, 10))).toBe(0); // 边贴边 ⇒ 交 0
  });

  it('★ 零面积 → 0（源码 `inter <= 0` 守卫）', () => {
    expect(iou(box(0, 0, 0, 0), box(0, 0, 0, 0))).toBe(0);
    expect(iou(box(0, 0, 10, 10), box(0, 0, 0, 0))).toBe(0);
  });
});

describe('nmsBoxes（原 `zD` 39532）', () => {
  it('按 score 降序，重叠者被丢（手算 IoU ≈ 0.68 > 0.45）', () => {
    const a = box(0, 0, 10, 10, 0.9);
    const b = box(1, 1, 10, 10, 0.8);
    expect(nmsBoxes([b, a])).toEqual([a]); // 输入乱序也应先取高分
  });

  it('不重叠 → 全留', () => {
    const a = box(0, 0, 10, 10, 0.9);
    const c = box(50, 50, 10, 10, 0.5);
    expect(nmsBoxes([c, a])).toEqual([a, c]);
  });

  it('★ 边界：IoU **恰好等于**阈值 ⇒ **保留**（源码是 `>` 不是 `>=`）', () => {
    // ⚠️ 用 **2 的幂**构造，IoU 才是**精确**的 0.25（交 4 / 并 16）——
    //    用非 2 次幂会引入浮点误差，断言"恰好等于阈值"就变成脆弱测试。
    const a = box(0, 0, 4, 4, 0.9);
    const b = box(0, 0, 2, 2, 0.8);
    expect(iou(a, b)).toBe(0.25);
    expect(nmsBoxes([a, b], 0.25)).toHaveLength(2); // 等于阈值 ⇒ 保留
    expect(nmsBoxes([a, b], 0.24)).toHaveLength(1); // 略低于 ⇒ 丢弃
  });

  it('空输入 → 空', () => {
    expect(nmsBoxes([])).toEqual([]);
  });

  it('★ 锁常量：默认 IoU 阈值 = 0.45（原 `zD` 第二参默认值）', () => {
    expect(FACE_NMS_IOU).toBe(0.45);
  });
});

describe('buildDetectPlan（原 `wS` 的缩放计划）', () => {
  it('典型尺寸 → 4 项（2 模型 × 2 缩放）', () => {
    expect(buildDetectPlan(1600, 1600)).toEqual([
      { detector: 'full', scale: 1 },
      { detector: 'short', scale: 1 },
      { detector: 'full', scale: 1.8 },
      { detector: 'short', scale: 1.8 },
    ]);
  });

  it('大图 → 基准缩到「最长边 = 1600」', () => {
    const plan = buildDetectPlan(4000, 2000);
    expect(plan[0]?.scale).toBeCloseTo(FACE_DETECT_BASE / 4000, 10); // 0.4
    expect(plan[2]?.scale).toBeCloseTo((FACE_DETECT_BASE / 4000) * 1.8, 10); // 0.72
    expect(plan).toHaveLength(4);
  });

  it('★ 回源发现：跳过条件 `maxSide*scale > 1600*2.2` 实际**永不成立**（`1600` 与 `2880` 都 < `3520`）', () => {
    // 极大图也一样：缩放后最长边恒为 1600 或 2880
    expect(buildDetectPlan(100000, 100000)).toHaveLength(4);
    expect(buildDetectPlan(1, 1)).toHaveLength(4);
  });

  it('尺寸为 0 → 空计划', () => {
    expect(buildDetectPlan(0, 0)).toEqual([]);
    expect(buildDetectPlan(100, 0)).toEqual([]);
  });
});

describe('clampBoxToImage（原 `wS` 尾部）', () => {
  it('越界负值 → 夹到 0，且不超出图', () => {
    expect(clampBoxToImage(box(-5, -5, 100, 100), 50, 40)).toEqual(box(0, 0, 50, 40));
  });

  it('★ 贴到右下角 → `w/h` 至少 1', () => {
    expect(clampBoxToImage(box(49, 39, 100, 100), 50, 40)).toEqual(box(49, 39, 1, 1));
  });

  it('完全在图内 → 不变', () => {
    expect(clampBoxToImage(box(10, 10, 20, 20), 100, 100)).toEqual(box(10, 10, 20, 20));
  });
});

describe('isUsableFaceBox（原 `wS` 的过滤）', () => {
  it('★ score 阈值是 `>= 0.35`', () => {
    expect(isUsableFaceBox(box(0, 0, 10, 10, 0.35))).toBe(true);
    expect(isUsableFaceBox(box(0, 0, 10, 10, 0.349))).toBe(false);
  });

  it('★ 边长阈值是 `> 2`（严格大于）', () => {
    expect(isUsableFaceBox(box(0, 0, 3, 3, 1))).toBe(true);
    expect(isUsableFaceBox(box(0, 0, 2, 3, 1))).toBe(false);
    expect(isUsableFaceBox(box(0, 0, 3, 2, 1))).toBe(false);
  });
});

describe('clamp01（原 `kl` 39638）', () => {
  it('夹到 [0,1]', () => {
    expect(clamp01(-0.5)).toBe(0);
    expect(clamp01(0)).toBe(0);
    expect(clamp01(0.5)).toBe(0.5);
    expect(clamp01(1)).toBe(1);
    expect(clamp01(1.5)).toBe(1);
  });
});

describe('toNormalizedFaceBoxes（原 `VD` 39669 + `kl`）', () => {
  it('除以宽高归一化', () => {
    expect(toNormalizedFaceBoxes([box(50, 25, 100, 50)], 200, 100)).toEqual([
      { nx: 0.25, ny: 0.25, nw: 0.5, nh: 0.5 },
    ]);
  });

  it('★ 越界被 `kl` 夹到 [0,1]', () => {
    expect(toNormalizedFaceBoxes([box(250, 0, 100, 100)], 200, 100)).toEqual([
      { nx: 1, ny: 0, nw: 0.5, nh: 1 },
    ]);
  });

  it('★ 宽高为 0 时按 1 处理（避免除零得 Infinity）', () => {
    expect(toNormalizedFaceBoxes([box(0, 0, 0, 0)], 0, 0)).toEqual([{ nx: 0, ny: 0, nw: 0, nh: 0 }]);
  });

  it('空输入 → 空', () => {
    expect(toNormalizedFaceBoxes([], 100, 100)).toEqual([]);
  });
});

describe('coverFit（原 rL 39905-39923）', () => {
  it('★ 图更宽 ⇒ 宽度撑满、上下留黑；框更宽 ⇒ 高度撑满、左右留黑', () => {
    // 框 200×100（比 2），图比 4:1（更宽）⇒ w=200, h=200/4=50, offY=25
    expect(coverFit(200, 100, 4)).toEqual({ w: 200, h: 50, offX: 0, offY: 25 });
    // 图比 1:1（比框窄）⇒ h=100, w=100, offX=50
    expect(coverFit(200, 100, 1)).toEqual({ w: 100, h: 100, offX: 50, offY: 0 });
  });
  it('★ 入参有假值 / 比例非正 ⇒ 全 0（源第一句）', () => {
    expect(coverFit(0, 100, 2)).toEqual({ w: 0, h: 0, offX: 0, offY: 0 });
    expect(coverFit(200, 100, 0)).toEqual({ w: 0, h: 0, offX: 0, offY: 0 });
    expect(coverFit(200, 100, -1)).toEqual({ w: 0, h: 0, offX: 0, offY: 0 });
  });
});

describe('displayFaceRects（原 sL 39924-39940）', () => {
  const face = (nx: number, ny: number, nw: number, nh: number) => ({ nx, ny, nw, nh });
  it('★ 落点 = off + 归一化值 × 有效边长；带下标 i', () => {
    // 框 200×100、图 2:1 ⇒ 有效区=整框（w=200,h=100,off=0）
    const out = displayFaceRects([face(0.1, 0.2, 0.3, 0.4)], { w: 200, h: 100 }, 2);
    expect(out).toEqual([{ i: 0, left: 20, top: 20, width: 60, height: 40 }]);
  });
  it('★ 留黑偏移要算进去（图上宽下窄时）', () => {
    // 框 200×100、图 4:1 ⇒ 有效区 w=200,h=50,offY=25
    const out = displayFaceRects([face(0, 0, 0.5, 0.5)], { w: 200, h: 100 }, 4);
    expect(out[0]).toMatchObject({ left: 0, top: 25, width: 100, height: 25 });
  });
  it('★ 宽高各取 max(4, …)（源默认 minSide=4，太小点不到）', () => {
    const out = displayFaceRects([face(0, 0, 0.001, 0.001)], { w: 200, h: 100 }, 2);
    expect(out[0]).toMatchObject({ width: 4, height: 4 });
  });
  it('没脸 / 有效区为 0 ⇒ 空数组', () => {
    expect(displayFaceRects([], { w: 200, h: 100 }, 2)).toEqual([]);
    expect(displayFaceRects(null, { w: 200, h: 100 }, 2)).toEqual([]);
    expect(displayFaceRects([face(0,0,1,1)], { w: 0, h: 0 }, 2)).toEqual([]);
  });
});
