/**
 * lib 层单测（哈希 / URL 规范化）
 *
 * 这些是**纯工具**（`lib` 层，L0）—— 必须与源码同算法，否则老数据不可比。
 * 原则 7：只测纯逻辑。
 */

import { describe, expect, it } from 'vitest';
import { base64ToBytes, exactHashFromDataUrl, hammingDistance, hashFromImgRef, sha1Hex } from '../hash';
import { fileNameFromUrl, normalizeUrl, shouldDiscardImage, stripSignature } from '../url';

const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

describe('sha1Hex —— 必须与标准 SHA-1 一致', () => {
  it('空输入', () => {
    expect(sha1Hex(enc(''))).toBe('da39a3ee5e6b4b0d3255bfef95601890afd80709');
  });
  it('"abc"', () => {
    expect(sha1Hex(enc('abc'))).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
  });
  it('跨块（>64 字节）', () => {
    // 64 个 'a'
    expect(sha1Hex(enc('a'.repeat(64)))).toBe('0098ba824b5c16427bd7a1122a5a442a25ec644d');
  });
  it('中文字节', () => {
    expect(sha1Hex(enc('豆包画布'))).toHaveLength(40);
  });
});

describe('exactHashFromDataUrl（原 `nm`）', () => {
  const PNG_1x1 =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  it('★ 返回 16 位小写 hex', () => {
    const h = exactHashFromDataUrl(PNG_1x1);
    expect(h).toHaveLength(16);
    expect(h).toMatch(/^[0-9a-f]{16}$/);
  });

  it('★ 同输入同输出（幂等）', () => {
    expect(exactHashFromDataUrl(PNG_1x1)).toBe(exactHashFromDataUrl(PNG_1x1));
  });

  it('非 image/* 或非 dataUrl → null', () => {
    expect(exactHashFromDataUrl('data:text/plain;base64,YWJj')).toBeNull();
    expect(exactHashFromDataUrl('http://x/a.png')).toBeNull();
    expect(exactHashFromDataUrl(null)).toBeNull();
    expect(exactHashFromDataUrl(123)).toBeNull();
  });

  it('base64 非法 → null（不抛）', () => {
    expect(exactHashFromDataUrl('data:image/png;base64,!!!not-base64!!!')).toBeNull();
  });

  it('与 sha1 直接计算一致', () => {
    const b64 = PNG_1x1.split(',')[1]!;
    const bytes = base64ToBytes(b64)!;
    expect(exactHashFromDataUrl(PNG_1x1)).toBe(sha1Hex(bytes).slice(0, 16));
  });
});

describe('hashFromImgRef（原 `W$`）', () => {
  it('解析 16 位 hex', () => {
    expect(hashFromImgRef('img://a1b2c3d4e5f60718.png')).toBe('a1b2c3d4e5f60718');
  });
  it('大小写归一', () => {
    expect(hashFromImgRef('img://A1B2C3D4E5F60718.PNG')).toBe('a1b2c3d4e5f60718');
  });
  it('不匹配 → null', () => {
    expect(hashFromImgRef('img://short.png')).toBeNull();
    expect(hashFromImgRef('vid://a1b2c3d4e5f60718.mp4')).toBeNull();
    expect(hashFromImgRef(null)).toBeNull();
  });
});

describe('hammingDistance（原 `rm`）', () => {
  it('相同 → 0', () => {
    expect(hammingDistance('ffffffffffffffff', 'ffffffffffffffff')).toBe(0);
  });
  it('低 8 位不同 → 8', () => {
    expect(hammingDistance('0000000000000000', '00000000000000ff')).toBe(8);
  });
  it('★ 任一为空 → Infinity', () => {
    expect(hammingDistance(null, 'ff')).toBe(Infinity);
    expect(hammingDistance('ff', '')).toBe(Infinity);
  });
  it('跨 32 位（>4 字节）也正确', () => {
    // 高 32 位全 1
    expect(hammingDistance('ffffffff00000000', '0000000000000000')).toBe(32);
  });
});

describe('normalizeUrl（原 `Si`）', () => {
  it('★ 去 query 与 hash', () => {
    expect(normalizeUrl('https://a.com/x/y.png?sig=1#z')).toBe('https://a.com/x/y.png');
  });
  it('host 小写 + 去末尾斜杠', () => {
    expect(normalizeUrl('https://A.COM/x/')).toBe('https://a.com/x');
  });
  it('根路径保留 `/`', () => {
    expect(normalizeUrl('https://a.com')).toBe('https://a.com/');
  });
  it('data: / blob: 原样返回', () => {
    expect(normalizeUrl('data:image/png;base64,AA')).toBe('data:image/png;base64,AA');
    expect(normalizeUrl('blob:http://a/b')).toBe('blob:http://a/b');
  });
  it('非法 URL 原样返回（不抛）', () => {
    expect(normalizeUrl('not a url')).toBe('not a url');
    expect(normalizeUrl(null)).toBe('');
  });
});

describe('stripSignature（原 `Od`）', () => {
  it('★ 去掉签名参数，保留其它 query', () => {
    const out = stripSignature('https://a.com/i.png?w=480&sign=abc&x-amz-signature=zz&id=7');
    expect(out).toContain('w=480');
    expect(out).toContain('id=7');
    expect(out).not.toContain('sign=');
    expect(out).not.toContain('x-amz-signature');
  });
  it('无签名参数时保持等价（仅规范化 host/末尾斜杠）', () => {
    expect(stripSignature('https://A.com/i.png?a=1')).toBe('https://a.com/i.png?a=1');
  });
});

describe('shouldDiscardImage（原 `RR`）', () => {
  it('svg → 丢弃', () => {
    expect(shouldDiscardImage('https://a.com/x.svg')).toBe(true);
    expect(shouldDiscardImage('https://a.com/x.svg?v=1')).toBe(true);
  });
  it('头像/logo/icon → 丢弃', () => {
    expect(shouldDiscardImage('https://a.com/avatar/u1.png')).toBe(true);
    expect(shouldDiscardImage('https://a.com/logo.png')).toBe(true);
    expect(shouldDiscardImage('https://a.com/ui/icon-close.png')).toBe(true);
  });
  it('长边 <200px → 丢弃', () => {
    expect(shouldDiscardImage('https://a.com/i.png', { w: 120, h: 90 })).toBe(true);
    expect(shouldDiscardImage('https://a.com/i.png', { w: 800, h: 600 })).toBe(false);
  });
  it('文件 <4KB → 丢弃', () => {
    expect(shouldDiscardImage('https://a.com/i.png', { bytes: 1000 })).toBe(true);
    expect(shouldDiscardImage('https://a.com/i.png', { bytes: 50000 })).toBe(false);
  });
  it('正常图 → 保留', () => {
    expect(shouldDiscardImage('https://a.com/gen/abc123.png', { w: 1024, h: 1024, bytes: 300000 })).toBe(false);
  });
  it('空 url → 丢弃', () => {
    expect(shouldDiscardImage('')).toBe(true);
  });
});

describe('fileNameFromUrl（原 `kR`）', () => {
  it('取末段', () => {
    expect(fileNameFromUrl('https://a.com/x/y/photo.png?sig=1')).toBe('photo.png');
  });
  it('无末段 → null', () => {
    expect(fileNameFromUrl('https://a.com/')).toBeNull();
    expect(fileNameFromUrl('not a url')).toBeNull();
  });
  it('解码百分号转义', () => {
    expect(fileNameFromUrl('https://a.com/%E5%9B%BE.png')).toBe('图.png');
  });
});
