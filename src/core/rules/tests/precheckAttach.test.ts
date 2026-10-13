/**
 * Phase 3a（发送前完整性校验）纯判据单测
 *
 * 依据：`uD` `shared.js:37458-37493` · 期望指纹 `:37463-37465` ·
 *      校验与结论 `_Component43.jsx:1169-1227` · 诊断串 `:1228` · issue 拼接 `:1304`
 *
 * 断言红线：**实现一变必红** —— 尤其「顺序 `'ok'` ⇒ 取四者最大」与
 * 「否则 ⇒ 只取两者最大」这条**分支差异**，以及 `'mismatch'` 即使图数够也**不通过**。
 */

import { describe, expect, it } from 'vitest';
import {
  attachPrecheck,
  attachPrecheckDiag,
  attachPrecheckIssue,
  compareImageOrder,
  expectedSigOf,
} from '../precheckAttach';

describe('expectedSigOf（原 uD:37463-37465）', () => {
  it('★ 先去 `data:` 前缀、再去空白、最后截 600，并加 `DATA$` 前缀', () => {
    const d = 'data:image/png;base64,AA BB';
    expect(expectedSigOf(d)).toBe('DATA$AABB');
  });

  it('★ 顺序不能换：先截 600 再截会留下空白（这条锁住三步顺序）', () => {
    const body = `${'x'.repeat(598)}  yy`;
    const out = expectedSigOf(`data:image/png;base64,${body}`);
    expect(out).toBe(`DATA$${'x'.repeat(598)}yy`.slice(0, 605));
    expect(out.includes(' ')).toBe(false);
  });

  it('非 `data:` 前缀 ⇒ 原样（只去空白与截断）', () => {
    expect(expectedSigOf('img://a.png')).toBe('DATA$img://a.png');
  });

  it('非字符串 ⇒ 空体', () => {
    expect(expectedSigOf(null)).toBe('DATA$');
  });
});

describe('compareImageOrder（原 uD）', () => {
  const a = expectedSigOf('img://a.png');
  const b = expectedSigOf('img://b.png');

  it('★ 顺序一致（下标严格递增）⇒ `ok`', () => {
    expect(compareImageOrder([a, b], ['img://a.png', 'img://b.png'])).toBe('ok');
  });

  it('★ 顺序颠倒 ⇒ `mismatch`', () => {
    expect(compareImageOrder([b, a], ['img://a.png', 'img://b.png'])).toBe('mismatch');
  });

  it('★ **期望项没全命中** ⇒ `unknown`（源注释：无法判定，不阻塞）', () => {
    // 期望 2 张、页内只探到 1 张 ⇒ matched(1) !== expected(2)
    expect(compareImageOrder([a], ['img://a.png', 'img://b.png'])).toBe('unknown');
  });

  it('★ 页内**多出**未命中的指纹**不影响**判定（只有命中数参与比较）', () => {
    // 期望 1 张、页内 3 条（1 命中 + 2 无关）⇒ matched(1) === expected(1) ⇒ 判序
    expect(compareImageOrder([a, expectedSigOf('img://zzz.png')], ['img://a.png'])).toBe('ok');
  });

  it('入参不是数组 / 期望为空 ⇒ `unknown`', () => {
    expect(compareImageOrder(null, ['x'])).toBe('unknown');
    expect(compareImageOrder([a], [])).toBe('unknown');
  });

});

describe('attachPrecheck（原 :1169-1227）', () => {
  const base = {
    textOk: true,
    expected: 3,
    processCount: 1,
    liveCount: 2,
    sigCount: 2,
    order: 'unknown' as const,
  };

  it('★ 无图 ⇒ `imagesOk` 恒 true、`imagesAttached` 恒 0', () => {
    const r = attachPrecheck({ ...base, expected: 0, processCount: 0, liveCount: 0, sigCount: 0 });
    expect(r.imagesOk).toBe(true);
    expect(r.imagesAttached).toBe(0);
    expect(r.pass).toBe(true);
  });

  it('★ 顺序 `ok` ⇒ `imagesAttached = max(过程, 页内, 指纹, 期望)`，且**直接判够**', () => {
    const r = attachPrecheck({ ...base, order: 'ok' });
    expect(r.imagesAttached).toBe(3); // max(1,2,2,3)
    expect(r.imagesOk).toBe(true);
    expect(r.pass).toBe(true);
  });

  it('★ 顺序非 ok ⇒ `imagesAttached = max(过程, 页内)`，够不够按 `>= 期望` 判', () => {
    const r = attachPrecheck({ ...base, order: 'unknown' });
    expect(r.imagesAttached).toBe(2); // max(1,2) —— **不含**期望与指纹数
    expect(r.imagesOk).toBe(false); // 2 < 3
    expect(r.pass).toBe(false);
    expect(r.issues).toContain('参考图缺失（2/3）');
  });

  it('★ 图数够但顺序 `mismatch` ⇒ **不通过**（且明细只有顺序那条）', () => {
    const r = attachPrecheck({ ...base, processCount: 5, liveCount: 5, order: 'mismatch' });
    expect(r.imagesOk).toBe(true); // max(5,5)=5 >= 3
    expect(r.pass).toBe(false);
    expect(r.issues).toBe('图片顺序与素材顺序不一致');
  });

  it('★ 文本没过 ⇒ 明细第一条是文本', () => {
    const r = attachPrecheck({ ...base, textOk: false, order: 'ok' });
    expect(r.pass).toBe(false);
    expect(r.issues.startsWith('文本未填入聊天框')).toBe(true);
  });

  it('★ 三条明细按源顺序拼接（文本 → 图数 → 图序）', () => {
    const r = attachPrecheck({
      ...base,
      textOk: false,
      processCount: 0,
      liveCount: 0,
      order: 'mismatch',
    });
    expect(r.issues).toBe('文本未填入聊天框；参考图缺失（0/3）；图片顺序与素材顺序不一致');
  });

  it('全通过 ⇒ 明细为空串', () => {
    expect(attachPrecheck({ ...base, order: 'ok' }).issues).toBe('');
  });
});

describe('attachPrecheckDiag（原 :1228）', () => {
  it('★ 无图 ⇒ 空串（源 G>0 才给诊断）', () => {
    expect(attachPrecheckDiag(0, null, 0, 0, 0)).toBe('');
  });

  it('★ 有图 ⇒ 六段诊断；探针缺失时 `inputTag` 兜「未找到」', () => {
    const s = attachPrecheckDiag(2, null, 3, 1, 2);
    expect(s).toBe('锚定输入框=未找到(area=? 候选编辑器=?) liveDomCount=3 过程计数=1 指纹=2');
  });

  it('有探针 ⇒ 取它的三个字段', () => {
    const s = attachPrecheckDiag(2, { inputTag: 'textarea.x', inputArea: 120, edCount: 4 }, 3, 1, 2);
    expect(s).toContain('锚定输入框=textarea.x(area=120 候选编辑器=4)');
  });
});

describe('attachPrecheckIssue（原 :1304 / :1330 的三目链）', () => {
  it('★ 明细 + 诊断 ⇒ `明细｜诊断: 诊断`', () => {
    expect(attachPrecheckIssue('缺图', 'D')).toBe('缺图｜诊断: D');
  });

  it('只有明细 ⇒ 明细；只有诊断 ⇒ `诊断: 诊断`', () => {
    expect(attachPrecheckIssue('缺图', '')).toBe('缺图');
    expect(attachPrecheckIssue('', 'D')).toBe('诊断: D');
  });

  it('都没有 ⇒ `null`', () => {
    expect(attachPrecheckIssue('', '')).toBeNull();
  });
});
