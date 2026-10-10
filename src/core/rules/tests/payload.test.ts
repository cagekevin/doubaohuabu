/**
 * 报文构造单测（原 `PL` / `TL` / `$L` 的完整形状）
 *
 * ⚠️ 协议形状是**跨进程冻结契约**：字段名 / `source` / `apiVersion` 不得改
 * 原则 7：只测纯逻辑（本文件在 `core/rules/tests/` 下，合规）
 */

import { describe, expect, it } from 'vitest';
import { buildAccountNodePayload, buildImagePayload, buildVideoPayload, SEND_SOURCES } from '../payload';

const ACC = { id: 'acc_1', name: '豆包01', partition: 'persist:doubao' };
const NOW = 1_700_000_000_000;
const ISO = new Date(NOW).toISOString();

describe('报文公共形状（跨进程契约）', () => {
  it('★ 三种来源都在白名单里', () => {
    expect(SEND_SOURCES).toEqual(['canvas-image-gen', 'canvas-text-node', 'canvas-account-node']);
  });

  it('★ 公共字段：apiVersion / action / timestamp / account / autoSend', () => {
    const p = buildImagePayload({ account: ACC, text: '猫', now: NOW });
    expect(p.apiVersion).toBe('1.0');
    expect(p.action).toBe('account_node_send');
    expect(p.timestamp).toBe(ISO);
    expect(p.account).toEqual({ id: 'acc_1', name: '豆包01', partition: 'persist:doubao' });
    expect(p.autoSend).toBe(true);
    expect(p.content.autoSend).toBe(true);
  });

  it('★ partition 缺省 → `persist:doubao`', () => {
    const p = buildVideoPayload({ account: { id: 'a', name: 'n' }, text: '猫', now: NOW });
    expect(p.account.partition).toBe('persist:doubao');
    expect(p.content.genParams).toEqual({ duration: null, model: null });
  });

  it('★ timestamp 由注入的 now 生成（原则 4：core 不得用 Date.now）', () => {
    const a = buildImagePayload({ account: ACC, text: '猫', now: NOW });
    const b = buildImagePayload({ account: ACC, text: '猫', now: NOW + 1000 });
    expect(a.timestamp).not.toBe(b.timestamp);
    expect(b.timestamp).toBe(new Date(NOW + 1000).toISOString());
  });
});

describe('buildImagePayload（原 `PL`）', () => {
  it('★ source = `canvas-image-gen`', () => {
    expect(buildImagePayload({ account: ACC, text: '猫', now: NOW }).source).toBe('canvas-image-gen');
  });

  it('★ imageParams 回填夹取后的值（不是重新解析正文）', () => {
    const p = buildImagePayload({
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
    const p = buildImagePayload({ account: ACC, text: '猫', resolution: '8K', now: NOW });
    expect(p.content.imageParams.resolution).toBeNull();
  });

  it('★ 空 model → null', () => {
    const p = buildImagePayload({ account: ACC, text: '猫', now: NOW });
    expect(p.content.imageParams.model).toBeNull();
  });

  it('images 非数组 → 空数组', () => {
    const p = buildImagePayload({ account: ACC, text: '猫', now: NOW, images: undefined });
    expect(p.content.images).toEqual([]);
  });

  it('sourceNodeId 缺省 → null', () => {
    expect(buildImagePayload({ account: ACC, text: '猫', now: NOW }).sourceNodeId).toBeNull();
  });

  it('★ 正文与 imageParams 一致（幂等剥离后）', () => {
    const p = buildImagePayload({ account: ACC, text: '画一张：猫，图片分辨率 4K', resolution: '2K', now: NOW });
    expect(p.content.text.match(/画一张[:：]/g)).toHaveLength(1);
    expect(p.content.text).toContain('图片分辨率 2K');
    expect(p.content.imageParams.resolution).toBe('2K');
  });
});

describe('buildVideoPayload（原 `TL`）', () => {
  it('★ source = `canvas-text-node`；genParams 用 `Number(x) || null`', () => {
    const p = buildVideoPayload({ account: ACC, text: '猫', model: 'seedance-2.0', duration: 5, now: NOW });
    expect(p.source).toBe('canvas-text-node');
    expect(p.content.genParams).toEqual({ duration: 5, model: 'seedance-2.0' });
  });

  it('★ duration = 0 / NaN → null（源码 `Number(r) || null`）', () => {
    expect(buildVideoPayload({ account: ACC, text: '猫', duration: 0, now: NOW }).content.genParams.duration).toBeNull();
    expect(
      buildVideoPayload({ account: ACC, text: '猫', duration: 'abc', now: NOW }).content.genParams.duration,
    ).toBeNull();
  });

  it('★ 正文走视频组装（「视频生成 …」+ 参数后缀）', () => {
    const p = buildVideoPayload({ account: ACC, text: '猫在跳舞', model: 'seedance-2.0', duration: 5, ratio: '16:9', now: NOW });
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
