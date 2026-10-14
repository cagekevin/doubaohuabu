/**
 * 视频海报（缩略图）生成（原 `bk.jsx`，`YL.jsx` 的 `_cmp_bk` 调用点）
 *
 * 用途：文生视频**历史版本**弹层里给「还没有海报」的历次出片**懒生成**一张缩略图
 *   （原 `YL.jsx:439-459` 的 effect）。
 *
 * 归属：现住 `src/ui/lib`（**消费层**）—— 它 `document.createElement('video')` 碰的是 **Web 标准能力**
 *   （DOM），不是 `window.api` ⇒ 按原则 4 后半与「Web 标准能力工具归消费层」留在消费层；
 *   `TD-16-110` 已判**不迁** `adapters/media`。
 *
 * ⚠️ 与源逐字对齐的行为：
 *   · `url` 为空 / 无 `document` ⇒ **`Promise.resolve(null)`**（不抛）
 *   · **任何失败路径都 resolve `null`**（源是 `s(null)`，从不 reject）—— 调用方据此"没有海报"
 *   · 离屏 `<video>` 必须 `crossOrigin='anonymous'`，否则 canvas 被污染、`toDataURL` 抛（源同法）
 *   · seek 到 `min(seekSec, 总时长 - 0.1)`；总时长取不到时回落 `seekSec`
 *   · 输出 `image/jpeg`，质量 **`0.8`**（与 `GenVideoNode` 取帧的 `0.92` **不同** —— 各自对源）
 *   · 结束时**释放**离屏 `<video>`（`removeAttribute('src')` + `load()`）
 */

import { createCanvas } from '@/lib/image';
import { clamp } from '@/lib/math';

/** 默认参数（原 `bk` 的默认值：`seekSec=1` / `timeoutMs=8000` / `maxW=480`） */
const DEFAULT_SEEK_SEC = 1;
const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_MAX_W = 480;

export async function generateVideoPoster(
  url: string,
  options: { seekSec?: number; timeoutMs?: number; maxW?: number } = {},
): Promise<string | null> {
  const seekSec = options.seekSec ?? DEFAULT_SEEK_SEC;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxW = options.maxW ?? DEFAULT_MAX_W;
  if (!url || typeof document === 'undefined') return null;

  return new Promise<string | null>((resolve) => {
    let video: HTMLVideoElement | null = null;
    let settled = false;
    let timer: number | null = null;

    /** 一次性收尾（源 `c`）：清超时 → 释放 video → resolve */
    const finish = (result: string | null): void => {
      if (settled) return;
      settled = true;
      if (timer !== null) window.clearTimeout(timer);
      try {
        if (video) {
          video.removeAttribute('src');
          try {
            video.load();
          } catch {
            // catch-ok: 释放离屏 video 属 best-effort（源同此吞掉）
          }
        }
      } catch {
        // catch-ok: 释放失败无碍（源同此吞掉）
      }
      resolve(result);
    };

    try {
      const el = document.createElement('video');
      video = el;
      el.crossOrigin = 'anonymous';
      el.muted = true;
      el.playsInline = true;
      el.preload = 'auto';
      timer = window.setTimeout(() => finish(null), timeoutMs);

      el.addEventListener('loadedmetadata', () => {
        try {
          const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : seekSec;
          el.currentTime = clamp(seekSec, 0, Math.max(0, total - 0.1));
        } catch {
          finish(null);
        }
      });

      el.addEventListener('seeked', () => {
        try {
          const w = el.videoWidth;
          const h = el.videoHeight;
          if (!w || !h) {
            finish(null);
            return;
          }
          const scale = Math.min(1, maxW / w);
          const canvas = createCanvas(Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
          canvas.getContext('2d')?.drawImage(el, 0, 0, canvas.width, canvas.height);
          finish(canvas.toDataURL('image/jpeg', 0.8));
        } catch {
          finish(null);
        }
      });

      el.addEventListener('error', () => finish(null));
      el.src = url;
      el.load();
    } catch {
      finish(null);
    }
  });
}
