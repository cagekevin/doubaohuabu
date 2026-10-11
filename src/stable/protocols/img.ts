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
 * 是不是**内联 base64 图片**（`data:image/…;base64,…`）—— 原 `fp` 22561-22563
 *
 * ★ **它就是「要不要落盘」的判据**（原 `Tn` 22578-22592 的判据半）：
 *   只有内联 base64 需要外置成 `img://`；`img://` / 远程 http(s) / `file://` / 空
 *   ⇒ **一律原样返回**。
 *
 * ⚠️ 与 `isDataUrl` 的区别：`isDataUrl` 只认 `data:` 前缀（也可能是文本 data URL）；
 *   本判据要求**是图片 + base64**（`fp` 逐字）。
 *
 * ★★ **2026-10-11 收口（判据 C1 + 回源纠错）**：此前这条判据在**两处**各写一遍，且
 *   **其中一处写反了** —— `core/rules/lovartGallery.ts` 的 `shouldMaterializeImage` 用的是
 *   「是不是**远程 http**」（恰好反了：远程根本不该落盘，内联 base64 才该），
 *   并因此让 `state/store.ts` 的 `normalizeImage` / `persistImage` **无条件**调 `saveImageSync`
 *   ⇒ 已是 `img://` 的引用会被**二次外置**成坏引用。
 *   另一处 `stable/migrations/imageExternalize.ts` 的 `isInlineImage` **是对的** ⇒ 提到协议真源，
 *   两处改用它（那份本地定义已删）。
 *   （旁证：`adapters/media/faceDetect.ts:192` 早就写着「直接调 `withThumb` 会给任意 URL 也拼
 *   `?w=`，与原版**不等价**」并用 `isImgRef` 守住 —— 说明 `?w=` 属 `img://` 这条事实在仓里
 *   已有正确认知，只是没推广开。）
 */
export function isInlineImage(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith('data:image/') && v.includes(';base64,');
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
