/**
 * GPT 站点适配器（★ 最易变层 —— 站点改版只动这里）
 *
 * 依据（**逐行回源抄录**）：
 *   - `oO` shared.js:43134-43169 —— **站点级发送**（找 webview → 跑页内脚本 → 4 种失败态）
 *   - `sO` shared.js:42998-43133 —— 页内发送脚本（已落 `./scripts.ts`）
 *   - `aO` 43170-43313 —— **参考图附加**那段（3 次重试 + 1500ms 间隔 + 成功后等 2000ms）
 *
 * ★ **`aO` 不是站点层**（`docs/14` 曾错标）：它是**编排**（选号 → 占号 → `vr` 准备会话 →
 *   附参考图 → `oO` 发送 → 释放）⇒ 归 `core/usecases/generateImage.ts`（M11）。
 *   本文件只承接其中**与站点交互**的两段：附参考图 + 跑页内脚本。
 *
 * ⚠️ **修掉原版的 `TD-05-1` 越权**：原 `aO` 直调 `window.api.attachImagesToWebview`；
 *    这里改经 **`HostPort.clipboard.attachImages`**（端口已有 ✓，与 `doubao/index.ts` 同法）。
 *
 * ⚠️ **`results` 恒为空的说明**：原 `oO` 只负责"**已发送**"，**不含结果轮询**
 *    （`aO` 返回 `{ok,key,accountId,accountName,account}` 后由调用方另行采集）。
 *    ⇒ 本适配器如实返回 `results: []`，**不假装**已拿到生成结果；采集归 M11 用例层。
 *
 * 铁律（与 `doubao`/`lovart` 同）：宿主能力经 `HostPort` · 不开自动轮询 · 零注入 · 失败返 `Result` 不抛。
 */

import type { Account } from '@/stable/model/account';
import type { HostPort } from '@/core/ports/host.port';
import type {
  ScanResult,
  SendPayload,
  SendResult,
  SitePort,
  SiteProbe,
} from '@/core/ports/site.port';
import { GPT_SEND_TIMEOUT_MS } from '@/constants';
import { GPT_TEXT } from '@/constants/text';
import { err, ok, type Result } from '@/core/model/result';
import { sleep, withTimeout } from '@/lib/async';
// ★ 判据 C1：`isRecord`/`asRecord` 取自 `lib/object` —— ⛔ 不在本文件 / `tapnow/api.ts` / `tapnow/index.ts` 各写一遍
//   ⇒ 第 3 次出现即抽出到 `lib/object.ts`
import { asRecord } from '@/lib/object';
// ★ 复用既有 SSOT 的内容指纹（`doubao/index.ts` 自带一个局部 `hash32`，
//   按 C1 三振出局：GPT 是第 2 处 ⇒ 先用现成的；到第 3 处时把 `doubao` 也收口过来）
import { contentFingerprint } from '@/core/rules/sendGuard';
import { findWebview, webviewEval } from '../shared/webview';
import { gptSendScript } from './scripts';

/** 参考图附加的重试次数与间隔（原 `aO`：`for (N=0; N<3; …)` + 失败等 1500ms） */
const ATTACH_RETRIES = 3;
const ATTACH_RETRY_DELAY_MS = 1500;
/** 附加成功后的静置（原 `aO`：`await sleep(2000)` —— 等页面把图挂上再发文本） */
const ATTACH_SETTLE_MS = 2000;



export function createGptSite(host: HostPort): SitePort {
  return {
    kind: 'gpt',

    async send(account: Account, payload: SendPayload): Promise<Result<SendResult>> {
      // ⚠️ 与源一致（原 `oO` 用 `Xn`）：**找不到页面返回 `page-not-open`，不抛**
      const view = findWebview({ id: account.id, partition: account.partition, type: account.type });
      if (!view || typeof view.executeJavaScript !== 'function') {
        return err('page-error', GPT_TEXT.pageNotOpen);
      }

      const sessionId = `${account.id}:${payload.source}:${contentFingerprint(payload.text)}`;

      // ① 附参考图（**经 HostPort** —— 修掉原版 `window.api` 越权）
      if (payload.images.length > 0) {
        const wcId = view.getWebContentsId?.() ?? 0;
        if (!wcId) return err('page-error', GPT_TEXT.attachUnsupported);

        const images = payload.images.map((ref) => ({ dataUrl: ref }));
        let last: { ok: boolean; error?: string; errors?: string[] } | null = null;
        for (let i = 0; i < ATTACH_RETRIES && !(last?.ok === true); i += 1) {
          const r = await host.clipboard.attachImages(wcId, images);
          last = r.ok ? { ok: true } : { ok: false, error: r.message };
          if (last.ok !== true) await sleep(ATTACH_RETRY_DELAY_MS);
        }
        if (last?.ok !== true) {
          const why = last?.error || last?.errors?.join('；') || GPT_TEXT.attachUnknownReason;
          return err(
            'page-error',
            `${GPT_TEXT.attachFailedPrefix}${why}${GPT_TEXT.attachFailedSuffix}`,
          );
        }
        // 原 `aO`：附加成功后静置 2s 再发文本
        await sleep(ATTACH_SETTLE_MS);
      }

      // ② 跑页内脚本（写文本 + 点发送 + 确认），带超时（原 `gn(..., nO=30000, 'GPT 发送')`）
      const r = await withTimeout(
        webviewEval(view, gptSendScript(payload.text)),
        GPT_SEND_TIMEOUT_MS,
        'GPT 发送',
      );

      if (!r.ok) {
        return r.kind === 'timeout'
          ? err('page-timeout', GPT_TEXT.sendTimeout, r.error)
          : err('page-error', `${GPT_TEXT.sendErrorPrefix}${r.error}`);
      }

      const res = asRecord(r.value);
      if (res.ok !== true) {
        // ★ 原样透传脚本给的 `reason`/`note`（原则 6：不改写）
        return err('page-error', typeof res.note === 'string' ? res.note : GPT_TEXT.sendFailed, res.reason);
      }

      // ⚠️ `results: []` —— 见文件头：原 `oO` 不含结果轮询，采集归 M11
      return ok({ sessionId, endReason: 'settled', results: [] });
    },

    async scan(): Promise<Result<ScanResult>> {
      // GPT 用于**发图**，不抓素材（那是 Lovart/Tapnow 的能力）；明确报错，**不静默返回空**
      return err('unknown', 'GPT 适配器不支持抓取素材');
    },

    async probe(account: Account): Promise<Result<SiteProbe>> {
      const view = findWebview({ id: account.id, partition: account.partition, type: account.type });
      if (!view || typeof view.executeJavaScript !== 'function') {
        // ⚠️ 与源一致：页面没开 ⇒ **不是"未登录"**，而是"不可用"
        return ok({ usable: false, loggedIn: false, pageKind: 'other' });
      }
      try {
        const raw = asRecord(
          await webviewEval(
            view,
            '({ href: location.href, hasComposer: !!(document.querySelector(\'#prompt-textarea\') || document.querySelector(\'form div[contenteditable="true"]\')) })',
          ),
        );
        const href = typeof raw.href === 'string' ? raw.href : '';
        return ok({ usable: raw.hasComposer === true, loggedIn: !!href, pageKind: 'other' });
      } catch (e: unknown) {
        return err('page-error', e instanceof Error ? e.message : String(e), e);
      }
    },
  };
}
