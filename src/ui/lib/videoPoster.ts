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

/**
 * ★ **取帧的共用内核**（2026-10-16 提出来）—— 「把 `video` **此刻**的画面导成 dataURL」。
 *
 * ★ **为什么提出来**：本仓有两处要"抓视频的一帧"，**机器完全不同目的**：
 *   | 用它的 | 输入 | 输出 | 失败口径 |
 *   |---|---|---|---|
 *   | `generateVideoPoster`（海报缩略图） | **离屏** `<video>`（从 `url` 加载、seek 到 `seekSec`） | `image/jpeg` **0.8** · 宽 ≤480 | **任何失败 ⇒ `null`**（源 `s(null)`，从不 reject） |
 *   | 大图预览的「截当前帧 / 尾帧」（`ImageLightbox`） | **页面上正在播的那个** `<video>`（已 seek 好） | `image/png`（要能再进剪贴板） | **返回 `null` 由调用方去报错**（原则 6：别静默） |
 *   ⇒ 共用的只有"**画到 canvas 再导出**"这一段（含 `videoWidth/Height` 守卫 + 缩放 + 跨域污染会抛）
 *     —— 这才是"同一件东西"；两边的**质量/尺寸/报错口径是真差异**，各留在自己的包装里。
 *
 * @param maxW 宽度上限；**不给 = 按原始尺寸**（剪贴板要原图；海报那侧自己传 480）
 * @returns `null` = 这个元素现在拿不到帧（未加载 / 尺寸为 0 / canvas 被跨域污染）
 */
export function drawVideoFrameToDataUrl(
  video: HTMLVideoElement,
  options: { mime?: string; quality?: number; maxW?: number } = {},
): string | null {
  const mime = options.mime ?? 'image/jpeg';
  const quality = options.quality ?? 0.8;
  try {
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return null;
    const scale = options.maxW ? Math.min(1, options.maxW / w) : 1;
    const canvas = createCanvas(Math.max(2, Math.round(w * scale)), Math.max(2, Math.round(h * scale)));
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL(mime, quality);
  } catch {
    // catch-ok: 跨域污染 / 尺寸异常 —— 交回调用方按各自口径处置（真值就是"这一帧取不到"）
    return null;
  }
}

/**
 * 把这个 `<video>` **定位到某一秒并等它 seek 完**（★ 与海报那条同一类等待，别再各写一份）。
 *
 * ⚠️ 已在该位置（差 <0.05s）⇒ **立刻返回 `true`**，不白等一次 `seeked`。
 * @returns `false` = 超时 / 出错 / 该位置不可达（调用方据此报错或回落）
 */
export function seekVideoTo(video: HTMLVideoElement, sec: number, timeoutMs = 5000): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    if (Math.abs(video.currentTime - sec) < 0.05) {
      resolve(true);
      return;
    }
    let done = false;
    const finish = (ok: boolean): void => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      resolve(ok);
    };
    const onSeeked = (): void => finish(true);
    const onError = (): void => finish(false);
    const timer = window.setTimeout(() => finish(false), timeoutMs);
    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    try {
      video.currentTime = sec;
    } catch {
      // catch-ok: 位置不可达（元数据未就绪等）⇒ 如实告诉调用方
      finish(false);
    }
  });
}

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
        // ★ 画帧那一段走**共用内核**（与「截当前帧/尾帧」同一份实现，别在这里再写一遍 canvas）
        finish(drawVideoFrameToDataUrl(el, { mime: 'image/jpeg', quality: 0.8, maxW }));
      });

      el.addEventListener('error', () => finish(null));
      el.src = url;
      el.load();
    } catch {
      finish(null);
    }
  });
}
