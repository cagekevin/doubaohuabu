/**
 * 感知哈希（aHash）—— 无状态工具（`lib` 层，L0）
 *
 * 依据（**逐行回源抄录**）：`Bc.jsx`（`_cmp_Bc`）
 *   1. `Image` 加载
 *   2. 画到 **8×8** canvas
 *   3. 取灰度（`0.299R + 0.587G + 0.114B`）
 *   4. 与**均值**比较：`>= 均值` 置位
 *   5. 位图 → 16 位 hex（**bit i = 像素 i**，即 bit0 = 左上角）
 *
 * ⚠️ 位序必须与源码一致（`bits |= 1n << BigInt(i)`）—— 否则与老数据的
 *    感知哈希**不可比**，去重会全部失效。
 * ⚠️ 依赖 DOM（`Image` + `canvas`）；**`core` 不得直接调它**，
 *    必须经注入（见 `core/rules/dedupe.ts` 的 `DedupeDeps.phash`）。
 */

import { PHASH_SIZE } from '@/constants/dedupe';
import { log } from '@/lib/log';
import { createCanvas, loadImage } from './image';

/**
 * 感知哈希（8×8 aHash → 16 位 hex）；**失败返回 `null`**
 *
 * ⚠️ **三条失败路径都留痕（原则 6）** —— 此前它们**同返 `null`**、调用方无从区分
 *   （「没有 DOM 环境」与「图解码不了」被当成同一件事 = 静默失败，`TD-16-11` / `TD-02-10`）。
 *   返回类型仍是 `string | null`（`core/rules/dedupe` 的 `DedupeDeps.phash` 只关心"有没有哈希"），
 *   **区分度落在日志上**：谁想查"为什么没去重"看得见原因。
 */
export async function perceptualHash(src: string, size: number = PHASH_SIZE): Promise<string | null> {
  if (!src || typeof document === 'undefined' || typeof Image === 'undefined') {
    // ★ 无 DOM / 空源 —— 与"解码失败"**不是一回事**，分开留痕
    log.warn('[phash] 无 DOM 环境或空源，感知哈希不可得');
    return null;
  }
  try {
    const img = await loadImage(src);

    const canvas = createCanvas(size, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      log.warn('[phash] 取 2d 上下文失败，感知哈希不可得');
      return null;
    }

    ctx.drawImage(img, 0, 0, size, size);
    const data = ctx.getImageData(0, 0, size, size).data;

    const gray = new Array<number>(size * size);
    let sum = 0;
    for (let i = 0; i < size * size; i++) {
      const r = data[i * 4] as number;
      const g = data[i * 4 + 1] as number;
      const b = data[i * 4 + 2] as number;
      const lum = r * 0.299 + g * 0.587 + b * 0.114;
      gray[i] = lum;
      sum += lum;
    }
    const avg = sum / gray.length;

    let bits = 0n;
    for (let i = 0; i < gray.length; i++) {
      if ((gray[i] as number) >= avg) bits |= 1n << BigInt(i);
    }
    return bits.toString(16).padStart(16, '0');
  } catch (e: unknown) {
    // ★ 解码失败 —— 与「无 DOM」**分开留痕**（原则 6：不静默；源码是 `catch { return null }`）
    log.warn('[phash] 解码失败，感知哈希不可得：', e);
    return null;
  }
}
