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

/*
 * ★ **2026-10-11 删除 `isDataUrl`**：它此前唯一的真实消费者是 `withThumb` 的早退分支；
 *   而按源 `Xt` 的判据（只认 `isImgRef`），那个分支是**冗余**的 ⇒ `isDataUrl` 失去全部生产消费者
 *   （只剩测试）⇒ 按死代码闸「只被测试引用 ⇒ 判死」删除。将来真有「任意 data:」的判据需求时，
 *   `isInlineImage`（图片版）多半才是要的那条。
 */

/**
 * 是不是**内联 base64 图片**（`data:image/…;base64,…`）—— 原 `fp` 22561-22563
 *
 * ★ **它就是「要不要落盘」的判据**（原 `Tn` 22578-22592 的判据半）：
 *   只有内联 base64 需要外置成 `img://`；`img://` / 远程 http(s) / `file://` / 空
 *   ⇒ **一律原样返回**。
 *
 * ⚠️ 判据是**图片 + base64**（`fp` 逐字）：`data:text/…` 这类**非图片**的 data URL ⇒
 *   **不落盘**（`saveImageSync` 只认图片，见 `electron/main.js:679`）。
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
 * ★ **只对 `img://` 拼**（源 `Xt` 22564-22570：`Kh(e) ? …?w=… : e`，`Kh` = 「已是 `img://` 引用」）。
 *   `?w=` 是**宿主协议处理器**认的参数（`electron/main.js:709`：「`img://xxx.png?w=480` 直接命中磁盘缓存」）
 *   —— 挂到远程 URL 上，CDN 只会收到一个它不认识的 query（可能 404 / 返回别的图）。
 *   ⇒ 调用方**无需**再自己加 `isImgRef` 守卫（`adapters/media/faceDetect.ts` 已随之简化）。
 *
 * ⚠️ **幂等**：非 `img://` 的（`data:` / 远程 / `file:` / 空）—— 一律**原样返回**；
 *   已带 `?w=` 的**不再叠加**。
 * ⚠️ **与源的一处刻意差异**：源 `Xt` 会**截断**已有 query（`img://a.png?v=2` → `img://a.png?w=480`），
 *   本实现是**幂等追加**（→ `img://a.png?v=2&w=480`）。宿主产出的 `img://` 引用**不带 query**
 *   ⇒ 两者等价；而追加不会丢掉已有参数、也不会把 `?w=` 拼两次。
 */
export function withThumb(src: string, width: number = THUMB_WIDTH): string {
  // ⚠️ 只有 `img://` 才拼（`data:` / 远程 / 空都不是 ⇒ 走这条早退）
  if (!isImgRef(src)) return src || '';
  // 已带 `?w=`（`?w=` 或 `&w=`）⇒ 不再叠加
  if (new RegExp(`[?&]${THUMB_QUERY_KEY}=`).test(src)) return src;
  return `${src}${src.includes('?') ? '&' : '?'}${THUMB_QUERY_KEY}=${width}`;
}
