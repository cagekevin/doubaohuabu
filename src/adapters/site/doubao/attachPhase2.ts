/**
 * 发送管线 **Phase 2 · 附图**（原 `_Component43.jsx` 的 `Be`，`:888-1051`）
 *
 * 依据（**逐行回源抄录**）：CDP 主通路 `:901-950` → 探测确认 `:913-923` → 剪贴板逐张回退 `:951-1011`
 *   → 按键补充 `:985-995` → **Phase 2b 增量重试** `:1012-1050`
 *
 * ★ **与 `../shared/attachImage.ts` 不是同一个函数**（重要，别合并）：
 *   | 源 | 服务谁 | 形态 |
 *   |---|---|---|
 *   | `hS`（`shared.js:38893-38947`） | `gS` / `yS` 的 **`askWithImage`** | 简单：CDP 重试 3 次 → 剪贴板一次性 |
 *   | `Be` 的 Phase 2（本文件） | **发送管线**（文生图 / 文生视频 / 账号节点） | 富：**基数 + 增量确认 + 逐张回退 + 按键补充 + 2b 重试** |
 *   ⚠️ 本仓此前**只落了 `hS`**，并把发送管线的附图简化成「CDP 一次直喂」⇒ 本文件是**补整段 Phase 2**（不是"补第三档"）。
 *
 * 铁律：
 *   - ★ 宿主能力经注入（`ClipboardPort`），**不直调 `window.api`**（TD-05-1）
 *   - ★ **零注入**：本文件只读页面（`ATTACH_COUNT_SCRIPT` 是纯读脚本）；粘贴/按键是**用户级动作**的等价物
 *   - ★ 失败**如实上报**（原则 6）：贴了几张就报几张，`failed` 带原始下标
 */

import type { ClipboardPort } from '@/core/ports/host.port';
import { ok, type Result } from '@/core/model/result';
import type { RefImageRef } from '@/core/rules/payload';
import { sleep } from '@/lib/async';
import {
  ATTACH_CDP_CONFIRM_POLLS,
  ATTACH_CDP_CONFIRM_POLL_MS,
  ATTACH_CLIPBOARD_CONFIRM_POLLS,
  ATTACH_CLIPBOARD_CONFIRM_POLL_MS,
  ATTACH_KEY_SUPPLEMENT_SETTLE_MS,
  ATTACH_RETRY_SETTLE_MS,
} from '@/constants';
import {
  cdpConfirmed,
  clipboardDelta,
  dedupeReferenceImages,
  retryImproved,
  type DedupedRefImage,
} from '@/core/rules/attachRefImages';
import { COMMON_TEXT } from '@/constants/text';
import { webviewEvalSafe, type WebviewElement } from '../shared/webview';
import { ATTACH_COUNT_SCRIPT, INPUT_FOCUS_SCRIPT } from './scripts';

export interface AttachPhase2Deps {
  clipboard: Pick<ClipboardPort, 'attachImages' | 'writeImage' | 'pasteToWebview'>;
  /**
   * 平台判定（原 `Je` 读 `navigator.platform || navigator.userAgent` 判 Mac ⇒ `meta` 否则 `control`）
   * ⚠️ 由调用方注入 —— `adapters` 不读 `navigator`（宿主读数走端口）
   */
  isMac: () => boolean;
}

export interface AttachPhase2Outcome {
  /** 已确认贴上去的张数（源 `we`） */
  attached: number;
  /** 去重后的张数（源 `K.length`） */
  total: number;
  /** 走通的档位 */
  via: 'cdp' | 'clipboard' | 'none';
  /** 仍未贴上的**去重后下标**（源 `ge`） */
  failed: number[];
  /** 去重掉的张数（源 `de`） */
  dropped: number;
}

/** 探测一次附件数（原 `ze(ee, _a, …)` —— **失败不抛**，同 `{_execError:true}` 的 0 兜底） */
async function probeAttachCount(view: WebviewElement): Promise<number> {
  const r = await webviewEvalSafe<{ attachImgCount?: unknown }>(view, ATTACH_COUNT_SCRIPT);
  if (!r || typeof r !== 'object') return 0;
  const n = r.attachImgCount;
  return typeof n === 'number' && Number.isFinite(n) ? n : 0;
}

/** 聚焦输入框（原 `Qe`/`Je` 的第一句 `ze(ee, Ap, …)` + `ee.focus()`） */
async function focusInput(view: WebviewElement): Promise<void> {
  // 源把它包在 `try{}catch{}` 里（`:586-588` 的 `ee.focus()` 也是）⇒ 失败不中断
  await webviewEvalSafe(view, INPUT_FOCUS_SCRIPT);
  try {
    view.focus();
  } catch {
    /* 同上 */
  }
}

/**
 * 触发一次粘贴（原 `Qe`，`:557-578`）—— 聚焦 → 取 `wcId` → `pasteToWebview`
 * @returns `false` = 前置条件缺失（源在这三种情况下**抛错**，由调用方 catch 后计入失败）
 */
async function pasteNow(
  deps: AttachPhase2Deps,
  view: WebviewElement,
  webContentsId: number,
): Promise<boolean> {
  await focusInput(view);
  if (!webContentsId) return false;
  const r = await deps.clipboard.pasteToWebview(webContentsId);
  return r.ok;
}

/**
 * 按键补充一次 `Ctrl/Cmd+V`（原 `Je`，`:579-604`）
 * @returns `false` = 该环境没有 `sendInputEvent`（源 `if (!ee.sendInputEvent) return false`）
 */
async function pressPaste(
  deps: AttachPhase2Deps,
  view: WebviewElement,
): Promise<boolean> {
  if (!view.sendInputEvent) return false;
  const modifiers = [deps.isMac() ? 'meta' : 'control'];
  await focusInput(view);
  try {
    view.sendInputEvent({ type: 'keyDown', keyCode: 'v', modifiers });
    view.sendInputEvent({ type: 'char', keyCode: 'v', modifiers });
    view.sendInputEvent({ type: 'keyUp', keyCode: 'v', modifiers });
  } catch {
    return false;
  }
  return true;
}

/**
 * 写剪贴板 + 触发粘贴（源 `:959-972` 的 `copyImageToClipboard` + `et(ee, () => Qe(ee))`）
 *
 * ⚠️ 两个结果**分开报**：源在「写入成功」与「粘贴成功」之间插了 `nt.add(ot)`（`:968` / `:1028`），
 *    而 `nt` 决定 2b 会不会重试 ⇒ 两者的语义**不能合并成一个布尔**。
 */
async function clipboardPasteOne(
  deps: AttachPhase2Deps,
  view: WebviewElement,
  webContentsId: number,
  img: DedupedRefImage,
): Promise<{ wrote: boolean; pasted: boolean }> {
  const wrote = await deps.clipboard.writeImage(
    { dataUrl: img.dataUrl, label: img.label || COMMON_TEXT.referenceImageLabel },
    webContentsId,
  );
  if (!wrote.ok) return { wrote: false, pasted: false };
  return { wrote: true, pasted: await pasteNow(deps, view, webContentsId) };
}

/**
 * 附**多张**参考图（原 `Be` 的 Phase 2 + 2b）
 *
 * 顺序（**顺序即语义**，逐条对源）：
 *   ⓪ 参考图去重（`:822-843`）
 *   ① 取**附件基数**（`:891-892`）
 *   ② **CDP 主通路**（`:901-950`）：`attachImages` → 轮询 `8 × 1.2s` 确认增量
 *   ③ **剪贴板逐张回退**（`:951-1011`）：写剪贴板 → 粘贴 → 轮询 `3 × 1.2s`
 *      → 仍无新增 ⇒ **按键补充** → 静置 `2.5s` → 再探
 *   ④ **Phase 2b 增量重试**（`:1012-1050`）—— ⚠️ 只重试**剪贴板写入失败**的那些
 *      （源在 `:968` 已把「写入成功」的加进 `nt`，2b 的 `if (nt.has(ot)) continue` 会把它们全跳过）
 *
 * @param images 参考图引用（`{label, dataUrl}` —— 源 `me.images` 的形状）
 */
export async function attachImagesPhase2(
  deps: AttachPhase2Deps,
  view: WebviewElement,
  webContentsId: number,
  images: readonly RefImageRef[],
): Promise<Result<AttachPhase2Outcome>> {
  // ⓪ 去重（原 `:822-843`）—— 键 `vD` 吃 `{dataUrl, label}`（label 由 `payload.normalizeImages` 保留）
  const { list, dropped } = dedupeReferenceImages(images);
  if (list.length === 0) {
    return ok({ attached: 0, total: 0, via: 'none', failed: [], dropped });
  }

  // ① 基数（原 `:891-892`）
  const before = await probeAttachCount(view);

  /** 已尝试过的键（源 `nt`）—— 防重复贴同一张 */
  const tried = new Set<string>();
  /** 已确认成功的键（源 `Ae`） */
  const acked = new Set<string>();
  /** 已确认的新增累计（源 `we`） */
  let attached = 0;
  /** 待重试的去重后下标（源 `ge`） */
  const failedIdx: number[] = [];
  let via: AttachPhase2Outcome['via'] = 'none';

  // ② CDP 主通路（原 `:901-950`）
  if (webContentsId) {
    const r = await deps.clipboard.attachImages(
      webContentsId,
      list.map((it) => ({ dataUrl: it.dataUrl, label: it.label || COMMON_TEXT.referenceImageLabel })),
    );
    const errs = r.ok ? (r.value.errors ?? []) : [r.message];
    if (errs.length === 0) {
      // 轮询确认（原 `:913-923`）：每轮算「相对基数的增量」，到齐即提前收
      let delta = 0;
      for (let i = 0; i < ATTACH_CDP_CONFIRM_POLLS; i += 1) {
        await sleep(ATTACH_CDP_CONFIRM_POLL_MS);
        delta = (await probeAttachCount(view)) - before;
        if (cdpConfirmed(delta, list.length)) break;
      }
      if (delta > 0) {
        // 源 `:924-932`：**只要探测到 >0 就把全部键都标成已试/已成功**（不逐张区分）
        via = 'cdp';
        attached = delta;
        for (const it of list) {
          tried.add(it.fp);
          acked.add(it.fp);
        }
      }
      // `delta === 0` ⇒ 文件已喂但 DOM 没探测到 ⇒ 继续走剪贴板回退（源 `:935-938`）
    }
    // 失败 / 异常 ⇒ 同样回退（源 `:939-946`）
  }

  // ③ 剪贴板逐张回退（原 `:951-1011`）—— 源条件：`for (…; Pe < K.length && !Ye; Pe++)`
  for (let i = 0; i < list.length && via !== 'cdp'; i += 1) {
    const img = list[i] as DedupedRefImage;
    if (tried.has(img.fp)) continue;

    const wrote = await deps.clipboard.writeImage(
      { dataUrl: img.dataUrl, label: img.label || COMMON_TEXT.referenceImageLabel },
      webContentsId,
    );
    if (!wrote.ok) {
      // ⚠️ 源在**写入失败**时 `ge.push` 且**没有** `nt.add`（`:960-965`）⇒ 2b 会重试它
      failedIdx.push(i);
      continue;
    }
    // 写入成功 ⇒ 立刻进 `nt`（源 `:968`）—— 2b 因此**不会**重试这一张
    tried.add(img.fp);

    const pasted = await pasteNow(deps, view, webContentsId);
    if (!pasted) {
      failedIdx.push(i);
      continue;
    }

    // 轮询确认（原 `:975-984`）：3 × 1.2s，增量 = 当前 − 基数 − 已确认
    let delta = 0;
    for (let t = 0; t < ATTACH_CLIPBOARD_CONFIRM_POLLS; t += 1) {
      await sleep(ATTACH_CLIPBOARD_CONFIRM_POLL_MS);
      delta = clipboardDelta(await probeAttachCount(view), before, attached);
      if (delta > 0) break;
    }

    // 按键补充（原 `:985-995`）—— 只有「没探到新增」才补一次
    if (delta <= 0) {
      if (await pressPaste(deps, view)) {
        await sleep(ATTACH_KEY_SUPPLEMENT_SETTLE_MS);
        delta = clipboardDelta(await probeAttachCount(view), before, attached);
      }
    }

    if (delta > 0) {
      attached += delta;
      acked.add(img.fp);
    } else {
      failedIdx.push(i);
    }
  }

  // ④ Phase 2b 增量重试（原 `:1012-1050`）
  //   ⚠️ 源守卫 `if (nt.has(ot)) continue` —— 写入成功过的都已进 `nt` ⇒ **只有写入失败的重试**
  for (const i of failedIdx) {
    const img = list[i] as DedupedRefImage;
    if (tried.has(img.fp)) continue;

    const r2 = await clipboardPasteOne(deps, view, webContentsId, img);
    if (!r2.wrote) continue;
    tried.add(img.fp); // 源 `:1028`：**写入成功即标记**（在粘贴之前）
    if (!r2.pasted) continue;

    await sleep(ATTACH_RETRY_SETTLE_MS);
    const count = await probeAttachCount(view);
    // 源 `:1038-1039`：比的是**总计**（不减 `already`），且要求严格大于
    if (retryImproved(count, before, attached)) {
      attached = count - before;
      acked.add(img.fp);
      if (via === 'none') via = 'clipboard';
    }
  }

  const failed = list
    .map((it, i) => (acked.has(it.fp) ? -1 : i))
    .filter((i) => i >= 0);

  // ⚠️ 一张都没贴上 ⇒ 如实报错（源这里**不报错**，让上层 `imagesAttached=0` 继续；
  //    本仓保持同源语义 ⇒ 仍返 `ok`，由调用方按 `attached` 决定是否 `precheck-fail`，见 BP-05）
  return ok({ attached, total: list.length, via, failed, dropped });
}


