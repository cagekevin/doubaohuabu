/**
 * 哈希工具（无状态 —— `lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：
 *   - `H$`  shared.js:25665-25729 —— **SHA-1**（手写实现，初始值 `1732584193` = 0x67452301）
 *   - `nm`  shared.js:25730-25753 —— `dataUrl → SHA-1 前 16 位 hex`
 *   - `W$`  shared.js:25754-25764 —— `img://<16hex>.<ext>` → 哈希
 *
 * ⚠️ **必须与源码同算法**：`img://` 的文件名就是这个哈希（前 16 位），
 *    换算法会导致**老数据的 `img://` 引用全部失效**（老数据兼容，W2/W3）。
 */

/** 标准 SHA-1，返回 40 位小写 hex */
export function sha1Hex(bytes: Uint8Array): string {
  const bitLen = bytes.length * 8;
  // 原实现：`e.length + 1 + 8 + 63 >> 6 << 6`
  const total = ((bytes.length + 1 + 8 + 63) >> 6) << 6;

  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 8, Math.floor(bitLen / 4294967296));
  view.setUint32(total - 4, bitLen >>> 0);

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);

  for (let i = 0; i < total; i += 64) {
    for (let j = 0; j < 16; j++) w[j] = view.getUint32(i + j * 4);
    for (let j = 16; j < 80; j++) {
      const n = (w[j - 3] as number) ^ (w[j - 8] as number) ^ (w[j - 14] as number) ^ (w[j - 16] as number);
      w[j] = (n << 1) | (n >>> 31);
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;

    for (let j = 0; j < 80; j++) {
      let f: number;
      let k: number;
      if (j < 20) {
        f = (b & c) | (~b & d);
        k = 0x5a827999;
      } else if (j < 40) {
        f = b ^ c ^ d;
        k = 0x6ed9eba1;
      } else if (j < 60) {
        f = (b & c) | (b & d) | (c & d);
        k = 0x8f1bbcdc;
      } else {
        f = b ^ c ^ d;
        k = 0xca62c1d6;
      }
      const t = ((((a << 5) | (a >>> 27)) + f + e + k + (w[j] as number)) | 0) >>> 0;
      e = d;
      d = c;
      c = (b << 30) | (b >>> 2);
      b = a;
      a = t;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
  }

  return [h0, h1, h2, h3, h4].map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
}

/** base64 → 字节（`atob` 在浏览器与 Node 16+ 均可用） */
export function base64ToBytes(b64: string): Uint8Array | null {
  try {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out.length > 0 ? out : null;
  } catch {
    return null;
  }
}

/**
 * `dataUrl → 精确哈希（SHA-1 前 16 位）`（原 `nm` 25730）
 *
 * @returns 16 位小写 hex；非 `data:image/*` 或解码失败 → `null`
 */
export function exactHashFromDataUrl(dataUrl: unknown): string | null {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  const m = /^data:(image\/[\w.+-]+);base64,(.+)$/.exec(dataUrl);
  if (!m) return null;
  const bytes = base64ToBytes(m[2] as string);
  if (!bytes || bytes.length === 0) return null;
  return sha1Hex(bytes).slice(0, 16);
}

/**
 * `img://<16hex>.<ext>` → 哈希（原 `W$` 25754）
 *
 * @returns 16 位小写 hex；不匹配 → `null`
 */
export function hashFromImgRef(ref: unknown): string | null {
  if (typeof ref !== 'string') return null;
  const m = /^img:\/\/([0-9a-f]{16})\./i.exec(ref);
  return m ? (m[1] as string).toLowerCase() : null;
}

/** 汉明距离（原 `rm` 25766）—— 任一为空 → `Infinity` */
/**
 * FNV-1a 32 位 ⇒ base36（**会话幂等键的哈希段**）
 *
 * ★ **2026-10-12（`TD-05-6` 收口）**：此前**两份实现**——
 *   · `adapters/site/doubao/index.ts` 里一个**文件私有**的 `hash32`（FNV-1a＋base36）；
 *   · `adapters/site/gpt/index.ts` 的 `sessionId` 却拿 `core/rules/sendGuard.contentFingerprint`
 *     （**内容指纹**：stripHtml＋去空白＋截 200）当哈希段 ⇒ **同一语义两套、且用途混用**。
 *   ⇒ 提升到此处作**唯一真源**，两处委托。
 *
 * ⚠️ **回源定案**：源的 FNV-1a 是 `b$`（`shared.js:25062-25068`，`return t >>> 0` —— **十进制**）；
 *   而 `contentFingerprint` 的源是 `AS`（`shared.js:41866`）—— **另一个用途**（防重内容指纹）。
 *   源的 `Xn`（`shared.js:23553`）**不是哈希**（那是"按 id/partition/type 找 webview"）。
 * ⚠️ **base36 是本仓的加法**（源 `b$` 返十进制）——为了让 id 更短；**留痕**，不是漏抄。
 */
export function hash32(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

export function hammingDistance(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b) return Infinity;
  let n = BigInt(`0x${a}`) ^ BigInt(`0x${b}`);
  let count = 0n;
  while (n > 0n) {
    count += n & 1n;
    n >>= 1n;
  }
  return Number(count);
}
