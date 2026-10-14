/**
 * 报文构造单测（原 `PL` / `TL` / `$L` 的完整形状）
 *
 * ⚠️ 协议形状是**跨进程冻结契约**：字段名 / `source` / `apiVersion` 不得改
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import {
  buildAccountNodePayload,
  buildImagePayload,
  buildVideoPayload,
  toSitePayload,
  SEND_SOURCES,
} from '../payload';

const ACC = { id: 'acc_1', name: '豆包01', partition: 'persist:doubao' };
const NOW = 1_700_000_000_000;
const ISO = new Date(NOW).toISOString();

/**
 * 造参助手 —— `TD-16-104` 收窄后 `stylePrefix` / `images` 变**必填**，而本文件绝大多数用例不关心它们。
 *
 * ⚠️ 这**不是**"为测试加的兜底分支"（那是被禁的）：它是**测试文件自己的造参助手**，
 *    生产代码零感知；要测这两个字段时**照样显式传**（会被下面的 spread 覆盖）。
 */
type ImgInput = Parameters<typeof buildImagePayload>[0];
type VidInput = Parameters<typeof buildVideoPayload>[0];
const buildImg = (
  input: Omit<ImgInput, 'stylePrefix' | 'images'> & Partial<Pick<ImgInput, 'stylePrefix' | 'images'>>,
): ReturnType<typeof buildImagePayload> => buildImagePayload({ stylePrefix: '', images: [], ...input });
const buildVideo = (
  input: Omit<VidInput, 'stylePrefix' | 'images'> & Partial<Pick<VidInput, 'stylePrefix' | 'images'>>,
): ReturnType<typeof buildVideoPayload> => buildVideoPayload({ stylePrefix: '', images: [], ...input });

describe('报文公共形状（跨进程契约）', () => {
  it('★ 三种来源都在白名单里', () => {
    expect(SEND_SOURCES).toEqual(['canvas-image-gen', 'canvas-text-node', 'canvas-account-node']);
  });

  it('★ 公共字段：apiVersion / action / timestamp / account / autoSend', () => {
    const p = buildImg({ account: ACC, text: '猫', now: NOW });
    expect(p.apiVersion).toBe('1.0');
    expect(p.action).toBe('account_node_send');
    expect(p.timestamp).toBe(ISO);
    expect(p.account).toEqual({ id: 'acc_1', name: '豆包01', partition: 'persist:doubao' });
    expect(p.autoSend).toBe(true);
    expect(p.content.autoSend).toBe(true);
  });

  it('★ partition 缺省 → `persist:doubao`', () => {
    const p = buildVideo({ account: { id: 'a', name: 'n' }, text: '猫', now: NOW });
    expect(p.account.partition).toBe('persist:doubao');
    expect(p.content.genParams).toEqual({ duration: null, model: null });
  });

  it('★ timestamp 由注入的 now 生成（原则 4：core 不得用 Date.now）', () => {
    const a = buildImg({ account: ACC, text: '猫', now: NOW });
    const b = buildImg({ account: ACC, text: '猫', now: NOW + 1000 });
    expect(a.timestamp).not.toBe(b.timestamp);
    expect(b.timestamp).toBe(new Date(NOW + 1000).toISOString());
  });
});

describe('buildImagePayload（原 `PL`）', () => {
  it('★ source = `canvas-image-gen`', () => {
    expect(buildImg({ account: ACC, text: '猫', now: NOW }).source).toBe('canvas-image-gen');
  });

  it('★ imageParams 回填夹取后的值（不是重新解析正文）', () => {
    const p = buildImg({
      account: ACC,
      text: '猫',
      count: 99,
      model: 'Seedream 5.0 Pro',
      resolution: '2K',
      now: NOW,
    });
    expect(p.content.imageParams).toEqual({ count: 4, model: 'Seedream 5.0 Pro', resolution: '2K' });
  });

  it('★ 非法分辨率 → null（不是空串）', () => {
    const p = buildImg({ account: ACC, text: '猫', resolution: '8K', now: NOW });
    expect(p.content.imageParams.resolution).toBeNull();
  });

  it('★ 空 model → null', () => {
    const p = buildImg({ account: ACC, text: '猫', now: NOW });
    expect(p.content.imageParams.model).toBeNull();
  });

  // ⚠️ 原「`images` 非数组 → 空数组」用例已**删除**（`TD-16-104`）：`images` 现为**必填
  //   `readonly string[]`**，生产侧 `Array.isArray` 假守卫已删 ⇒ "非数组"在类型层不可能。

  it('sourceNodeId 缺省 → null', () => {
    expect(buildImg({ account: ACC, text: '猫', now: NOW }).sourceNodeId).toBeNull();
  });

  it('★ 正文与 imageParams 一致（幂等剥离后）', () => {
    const p = buildImg({ account: ACC, text: '画一张：猫，图片分辨率 4K', resolution: '2K', now: NOW });
    expect(p.content.text.match(/画一张[:：]/g)).toHaveLength(1);
    expect(p.content.text).toContain('图片分辨率 2K');
    expect(p.content.imageParams.resolution).toBe('2K');
  });
});

describe('buildVideoPayload（原 `TL`）', () => {
  it('★ source = `canvas-text-node`；genParams 用 `Number(x) || null`', () => {
    const p = buildVideo({ account: ACC, text: '猫', model: 'seedance-2.0', duration: 5, now: NOW });
    expect(p.source).toBe('canvas-text-node');
    expect(p.content.genParams).toEqual({ duration: 5, model: 'seedance-2.0' });
  });

  it('★ duration = 0 → null（源码 `Number(r) || null`）', () => {
    expect(buildVideo({ account: ACC, text: '猫', duration: 0, now: NOW }).content.genParams.duration).toBeNull();
    // ⚠️ 原「`duration = 'abc'`（非数值）→ null」的断言已**删除**（`TD-16-104`：`duration` 现为
    //   `number`，"传入字符串"在类型层已不可能；`0` 这个真实边界仍由上面覆盖）。
  });

  it('★ 正文走视频组装（「视频生成 …」+ 参数后缀）', () => {
    const p = buildVideo({ account: ACC, text: '猫在跳舞', model: 'seedance-2.0', duration: 5, ratio: '16:9', now: NOW });
    expect(p.content.text).toBe('视频生成 猫在跳舞，画面比例 16:9，duration=5，--模型:Seedance 2.0');
  });
});

describe('buildAccountNodePayload（原 `$L`）', () => {
  it('★ source = `canvas-account-node`；多段文案换行合并', () => {
    const p = buildAccountNodePayload({ account: ACC, texts: ['第一段', '第二段'], now: NOW });
    expect(p.source).toBe('canvas-account-node');
    expect(p.content.text).toBe('第一段\n第二段');
    expect(p.content.texts).toEqual(['第一段', '第二段']);
  });

  it('★ 无文案 → 兜底句「请参考以下 N 张素材图片进行创作。」', () => {
    const p = buildAccountNodePayload({ account: ACC, texts: [], images: ['img://a.png', 'img://b.png'], now: NOW });
    expect(p.content.text).toBe('请参考以下 2 张素材图片进行创作。');
  });

  it('空段被过滤（只留非空）', () => {
    const p = buildAccountNodePayload({ account: ACC, texts: ['  ', '有效', ''], now: NOW });
    expect(p.content.text).toBe('有效');
  });

  it('autoSend=false 时两处都为 false', () => {
    const p = buildAccountNodePayload({ account: ACC, texts: ['x'], autoSend: false, now: NOW });
    expect(p.autoSend).toBe(false);
    expect(p.content.autoSend).toBe(false);
  });

  it('params 原样透传', () => {
    const p = buildAccountNodePayload({ account: ACC, texts: ['x'], params: { foo: 1 }, now: NOW });
    expect(p.content.params).toEqual({ foo: 1 });
  });
});

describe('toSitePayload（跨进程报文 → `SitePort.send` 的扁平入参）', () => {
  it('★ 三个字段**从 `content` 里取**（不是整份报文直接传下去）', () => {
    const p = buildVideoPayload({
      account: ACC,
      text: '正文',
      images: ['img://a.png'],
      stylePrefix: '',
      now: NOW,
    });
    const site = toSitePayload(p);
    expect(site).toMatchObject({
      text: p.content.text,
      images: [{ label: '', dataUrl: 'img://a.png' }],
      params: p.content.params,
      autoSend: true,
      source: 'canvas-text-node',
    });
    // ★ **品牌在**（结构约束 M1）：`SiteSendPayload` 带一个**非导出的 symbol 键**
    //   ⇒ 别的模块造不出这个形状（`send` 也因此只可能收到 `toSitePayload` 的产物）。
    //   ⚠️ symbol 名**故意不导出** ⇒ 这里只能按"有且仅有一个 symbol 键、值为 true"验。
    const brand = Object.getOwnPropertySymbols(site);
    expect(brand).toHaveLength(1);
    expect(Object.getOwnPropertyDescriptor(site, brand[0] as symbol)?.value).toBe(true);
  });

  it('★ 图归一成 `RefImageRef[]`：对象取 `{label, dataUrl}`（**label 保留** —— 去重键 `vD` / 后端文件名要用，`TD-16-116`）', () => {
    const p = buildAccountNodePayload({
      account: ACC,
      texts: ['x'],
      images: [{ label: '素材', dataUrl: 'img://b.png' }],
      now: NOW,
    });
    expect(toSitePayload(p).images).toEqual([{ label: '素材', dataUrl: 'img://b.png' }]);
  });

  it('★ 混装也能收：字符串原样（label 空串）、**空串丢掉**、非法项丢掉（不留 `undefined` 给适配器）', () => {
    const p = buildAccountNodePayload({
      account: ACC,
      texts: ['x'],
      images: ['img://a.png', '', null, 42, { label: 'no-url' }, { dataUrl: 'img://c.png' }],
      now: NOW,
    });
    expect(toSitePayload(p).images).toEqual([
      { label: '', dataUrl: 'img://a.png' },
      { label: '', dataUrl: 'img://c.png' },
    ]);
  });

  it('★ `autoSend` 取**报文顶层**那个（与 `content.autoSend` 同值 —— 源 `$L` 两处都写）', () => {
    const off = buildAccountNodePayload({ account: ACC, texts: ['x'], autoSend: false, now: NOW });
    expect(toSitePayload(off).autoSend).toBe(false);
  });

  it('★ `source` 原样带（适配器/幂等键要用它）', () => {
    const p = buildImagePayload({
      account: ACC,
      text: '画',
      stylePrefix: '',
      images: [],
      now: NOW,
    });
    expect(toSitePayload(p).source).toBe('canvas-image-gen');
  });
});
