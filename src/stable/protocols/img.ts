/**
 * `img://` 协议 + `?w=` 缩略图（★ **协议规则住这里**）
 *
 * 依据：docs/10 #7（**缩略图一律走 `?w=`，不加载原图** —— 原图 2~20MB）
 *      docs/11 §六 把「`img://` + `?w=`」列为 **❌ 冻结协议**（与 20 个键同级）
 *
 * ⚠️ 为什么在 `stable/`（2026-10-10，TD-01-1）：
 *    原实现把 `withThumb` 放在 `ui/common/Thumb.tsx:24` —— 但它是**协议规则**（冻结契约），
 *    不是 UI 细节。协议住 UI 层 ⇒ 非 UI 消费者（抓取/落盘/测试）要复用它就得**反向依赖 ui**。
 *    ⇒ 下沉到 `stable/protocols/`（与 `stable/contracts/schemas.ts` 的 `PROTOCOL_IMG` 同族）。
 *
 * ⚠️ 契约常量仍在 `stable/contracts/schemas.ts`（`PROTOCOL_IMG` / `THUMB_QUERY_KEY`）——
 *    本文件只放**由契约派生的拼接行为**，不重复定义字面量。
 */

import { PROTOCOL_IMG, THUMB_QUERY_KEY } from '@/stable/contracts/schemas';
import { THUMB_WIDTH } from '@/constants/dedupe';

export { PROTOCOL_IMG, THUMB_QUERY_KEY };

/** 是不是 `img://` 引用（落盘后的形态） */
export function isImgRef(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PROTOCOL_IMG);
}

/** 是不是内联 dataUrl（⚠️ 返回 `boolean` 而非类型谓词 —— 它不改变调用方的类型） */
export function isDataUrl(v: unknown): boolean {
  return typeof v === 'string' && v.startsWith('data:');
}

/**
 * 拼缩略图 URL：`img://xxx.png` → `img://xxx.png?w=480`
 *
 * ⚠️ **幂等**：已是 `?w=` 的、`data:` 的、空的 —— 一律**原样返回**（不叠加、不抛）
 */
export function withThumb(src: string, width: number = THUMB_WIDTH): string {
  if (!src || isDataUrl(src)) return src;
  // 已带 `?w=`（`?w=` 或 `&w=`）⇒ 不再叠加
  if (new RegExp(`[?&]${THUMB_QUERY_KEY}=`).test(src)) return src;
  return `${src}${src.includes('?') ? '&' : '?'}${THUMB_QUERY_KEY}=${width}`;
}
