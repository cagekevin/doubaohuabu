/**
 * 读图 + 压缩成封面（原 `J3.jsx`，35 行）—— **会 reject**
 *
 * 依据（**逐行回源抄录**）：
 * ```js
 * function J3(e) {
 *   return new Promise((t, n) => {
 *     const r = new FileReader();
 *     r.onerror = () => n(new Error('读取图片失败'));
 *     r.onload = () => {
 *       const s = new Image();
 *       s.onerror = () => n(new Error('解析图片失败'));
 *       s.onload = () => {
 *         const a = Math.min(1, 560 / Math.max(s.width, s.height));
 *         const l = Math.max(1, Math.round(s.width * a));
 *         const c = Math.max(1, Math.round(s.height * a));
 *         const u = document.createElement('canvas');
 *         u.width = l; u.height = c;
 *         const d = u.getContext('2d');
 *         if (!d) { t(String(r.result)); return; }
 *         d.drawImage(s, 0, 0, l, c);
 *         try { t(u.toDataURL('image/jpeg', 0.82)); }
 *         catch { t(String(r.result)); }
 *       };
 *       s.src = String(r.result);
 *     };
 *     r.readAsDataURL(e);
 *   });
 * }
 * ```
 *
 * ⚠️ 与 `readImageFile`（原 `Pu`，同目录）**关键差异**：
 *   - `Pu` 任何失败都**兜底 resolve**（拖放建素材要保图，尺寸量不到给 `200×160`）；
 *   - 本函数读/解析失败**reject**（封面「要么成、要么报错」，坏图不能塞进 store）。
 * ⚠️ 读文件失败 / 图片解析失败抛**错误码**（`Error.message`，运行时透传，非编译符号）——
 *   与 `lib/image.ts` 的 `loadImage`（`decode-fail`）同法；用户可见 toast 文案归 `constants`。
 * ⚠️ 消费者唯一：`StyleLibraryModal.pickCover`（风格库上传封面，原 `US.jsx:123-139`）。
 *
 * 归属：纯浏览器能力（`lib` 层 L0，与 `readDroppedFile.ts` / `videoPoster.ts` 同法）⇒
 *     **不可测**（要真 `File` + DOM `Image`），不进单测。
 */

/** 封面最长边（原 `J3` 的 `560`） */
const MAX_EDGE = 560;
/** JPEG 重编码质量（原 `J3` 的 `0.82`） */
const JPEG_QUALITY = 0.82;

/** 读文件失败（原 `new Error('读取图片失败')` 的错误码化） */
const ERR_READ = 'cover-read-fail';
/** 图片解析失败（原 `new Error('解析图片失败')` 的错误码化） */
const ERR_PARSE = 'cover-parse-fail';

export function compressCoverImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(ERR_READ));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error(ERR_PARSE));
      img.onload = () => {
        const scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        // ⚠️ 拿不到 2d 上下文 ⇒ 原样给 dataUrl（源同：不压缩、不 reject）
        if (!ctx) {
          resolve(String(reader.result));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        try {
          resolve(canvas.toDataURL('image/jpeg', JPEG_QUALITY));
        } catch {
          // ⚠️ canvas 被污染等 ⇒ 原样给 dataUrl（源同：不 reject）
          resolve(String(reader.result));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
