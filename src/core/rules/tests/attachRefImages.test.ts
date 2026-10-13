/**
 * Phase 2 附图纯判据单测
 *
 * 依据：`vD` `shared.js:38638-38642` · 去重 `_Component43.jsx:822-843` ·
 *      增量判定 `:918-923`（CDP）· `:979-984`（剪贴板）· `:991-995`（按键补充）· `:1036-1045`（2b）
 *
 * 断言红线：**实现一变必红** —— 尤其 `clipboardDelta` 与 `retryImproved` **两处公式不同**
 * （源就是不同的两处写法），把它们"统一"掉这条会红。
 */

import { describe, expect, it } from 'vitest';
import {
  cdpConfirmed,
  clipboardDelta,
  dedupeReferenceImages,
  referenceImageKey,
  retryImproved,
} from '../attachRefImages';

describe('referenceImageKey（原 vD）', () => {
  it('★ = `dataUrl` 前 80 字 + `::` + `label.trim()`', () => {
    expect(referenceImageKey({ dataUrl: 'img://a.png', label: ' 参考图 ' })).toBe(
      'img://a.png::参考图',
    );
  });

  it('★ 只取前 80 字（长 base64 被截断）', () => {
    const long = 'x'.repeat(200);
    const key = referenceImageKey({ dataUrl: long, label: '' });
    expect(key).toBe(`${'x'.repeat(80)}::`);
  });

  it('非字符串字段 ⇒ 空段（不抛）', () => {
    expect(referenceImageKey(null)).toBe('::');
    expect(referenceImageKey({ dataUrl: 123, label: null })).toBe('::');
  });

  it('label 不同 ⇒ 键不同（同图不同名算两张）', () => {
    const a = referenceImageKey({ dataUrl: 'u', label: '甲' });
    const b = referenceImageKey({ dataUrl: 'u', label: '乙' });
    expect(a).not.toBe(b);
  });
});

describe('dedupeReferenceImages（原 :822-843）', () => {
  it('★ 首次出现保留，后续同键跳过并计数', () => {
    const r = dedupeReferenceImages([
      { dataUrl: 'a', label: '参考图' },
      { dataUrl: 'b', label: '参考图' },
      { dataUrl: 'a', label: '参考图' },
    ]);
    expect(r.list.map((x) => x.dataUrl)).toEqual(['a', 'b']);
    expect(r.dropped).toBe(1);
    expect(r.droppedAt).toEqual([{ index: 2, dupOf: 0 }]);
  });

  it('★ `origIndex` 是**原数组下标**（去重后仍能回指原项）', () => {
    const r = dedupeReferenceImages([
      { dataUrl: 'a' },
      { dataUrl: 'a' },
      { dataUrl: 'c' },
    ]);
    expect(r.list.map((x) => x.origIndex)).toEqual([0, 2]);
  });

  it('★ `fp` 就是 `referenceImageKey` 的产物', () => {
    const r = dedupeReferenceImages([{ dataUrl: 'a', label: 'L' }]);
    expect(r.list[0]?.fp).toBe(referenceImageKey({ dataUrl: 'a', label: 'L' }));
  });

  it('全不同 ⇒ 不丢；空数组 ⇒ 空结果', () => {
    expect(dedupeReferenceImages([{ dataUrl: 'a' }, { dataUrl: 'b' }]).dropped).toBe(0);
    expect(dedupeReferenceImages([]).list).toEqual([]);
  });
});

describe('cdpConfirmed（原 :920 的 `rt >= K.length`）', () => {
  it('★ 到齐才算确认（等于也算）', () => {
    expect(cdpConfirmed(3, 3)).toBe(true);
    expect(cdpConfirmed(4, 3)).toBe(true);
    expect(cdpConfirmed(2, 3)).toBe(false);
  });
});

describe('clipboardDelta（原 :980 的 `attachImgCount - Te - we`）', () => {
  it('★ 减**两次**：基数与已确认累计', () => {
    // 当前探测 5、粘贴前基数 1、已确认 2 ⇒ 本次新增 2
    expect(clipboardDelta(5, 1, 2)).toBe(2);
  });

  it('★ 漏掉「已确认」会把它重复算进来 —— 这条锁住不许简化', () => {
    expect(clipboardDelta(5, 1, 0)).toBe(4);
    expect(clipboardDelta(5, 1, 0)).not.toBe(clipboardDelta(5, 1, 2));
  });
});

describe('retryImproved（原 :1038-1039 的 `$t - Te > we`）', () => {
  it('★ 比的是**总计**且**严格大于**', () => {
    expect(retryImproved(5, 1, 3)).toBe(true); // 5-1=4 > 3
    expect(retryImproved(4, 1, 3)).toBe(false); // 4-1=3 不大于 3
  });

  it('★ 与 `clipboardDelta` **不是同一个公式**（源两处写法不同）', () => {
    // count=4, before=1, already=3：delta = 0，而 retry 判据是 3 > 3 = false —— 同结果
    // count=5：delta = 1，retry = 4 > 3 = true —— 也同向
    // 真正分叉点：already 已含本次时 delta 会减成 0，而 retry 不减 ⇒ retry 更宽松
    expect(clipboardDelta(4, 1, 3)).toBe(0);
    expect(retryImproved(4, 1, 3)).toBe(false);
    expect(retryImproved(6, 1, 3)).toBe(true); // 5 > 3（delta 也是 2，但阈值口径不同）
  });
});
