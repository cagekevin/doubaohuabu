/**
 * 给后台页「附参考图」（★ 站点无关的公共底座）
 *
 * 依据（**逐行回源抄录**）：`hS` shared.js:38893-38947
 *
 * 两档（**顺序即语义**）：
 *   ① **CDP 直喂**：`attachImagesToWebview(wcId, [img])` —— 重试 `ATTACH_IMAGE_ATTEMPTS` 次，间隔 1.5s
 *   ② **剪贴板回落**：`copyImageToClipboard(img, wcId)` → `pasteToWebview(wcId)` → 静置 2.5s
 *   两档都失败 ⇒ 把沿途收集到的原因**前 3 条**拼进一句里返回（源 38945）
 *
 * ⚠️ **经 `ClipboardPort`，不直调 `window.api`**（TD-05-1 铁律）
 * ⚠️ 粘贴那一步包在 **`withInputLock`** 里（原 `hS` 38927 的 `dS(e, ...)`）——
 *    否则页面自己的脚本/handler 会和外来的粘贴打架
 * ⚠️ 这是**唯一允许的注入例外**链上的动作（见 `docs/过程.md` 链 17）；除此之外零注入
 */

import type { ClipboardPort } from '@/core/ports/host.port';
import { err, ok, type Result } from '@/core/model/result';
import { sleep } from '@/lib/async';
import { ANALYZE_TEXT, COMMON_TEXT } from '@/constants/text';
import {
  ATTACH_IMAGE_ATTEMPTS,
  ATTACH_IMAGE_PASTE_SETTLE_MS,
  ATTACH_IMAGE_RETRY_MS,
} from '@/constants';
import { withInputLock } from './inputLock';
import type { WebviewElement } from './webview';

export interface AttachImageDeps {
  clipboard: Pick<ClipboardPort, 'attachImages' | 'writeImage' | 'pasteToWebview'>;
}

export interface AttachImageOutcome {
  /** 走通的档位（源版返回值里就有这个字段，用于诊断） */
  method: 'cdp' | 'clipboard';
  /** CDP 档才有：宿主报告已附上的张数 */
  count: number;
}





/**
 * 附一张参考图（原 `hS`）
 *
 * @param view 目标 `<webview>`（**必须已就绪** —— 调用方先走 `BackendPagePort.prepareForSend`）
 * @param webContentsId 该 webview 的 `webContentsId`（CDP 直喂与页内回落都要）
 * @param dataUrl 图片（`data:` 或 `img://`）
 */
export async function attachImageToWebview(
  deps: AttachImageDeps,
  view: WebviewElement,
  webContentsId: number,
  dataUrl: string,
): Promise<Result<AttachImageOutcome>> {
  const reasons: string[] = [];
  const img = { dataUrl, label: COMMON_TEXT.referenceImageLabel };

  // ── ① CDP 直喂（重试 3 次）──
  if (webContentsId) {
    for (let i = 0; i < ATTACH_IMAGE_ATTEMPTS; i += 1) {
      const r = await deps.clipboard.attachImages(webContentsId, [img]);
      if (r.ok) {
        // 宿主已受理且**没有逐条失败** ⇒ 直接成功（源版 `if (o && o.ok) return …`）
        const failed = r.value.errors ?? [];
        if (failed.length === 0) return ok({ method: 'cdp', count: r.value.count });
        reasons.push(...failed.slice(0, 3));
      } else {
        reasons.push(r.message);
      }
      await sleep(ATTACH_IMAGE_RETRY_MS);
    }
  } else {
    reasons.push(ANALYZE_TEXT.attachApiUnavailable);
  }

  // ── ② 剪贴板回落 ──
  const wrote = await deps.clipboard.writeImage(img, webContentsId);
  if (wrote.ok) {
    // ⚠️ 粘贴包在 input-lock 里（原 `hS` 38927 的 `dS`）
    await withInputLock(view, async () => {
      await deps.clipboard.pasteToWebview(webContentsId);
    });
    await sleep(ATTACH_IMAGE_PASTE_SETTLE_MS);
    return ok({ method: 'clipboard', count: 0 });
  }
  reasons.push(ANALYZE_TEXT.clipboardFailed(wrote.message));

  return err('unknown', ANALYZE_TEXT.attachFailed(reasons));
}
