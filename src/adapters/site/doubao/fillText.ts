/**
 * 「把文本填进后台页的输入框」—— **发送链与提问链共用这一份**（判据 C1：能一种的别搞两种）
 *
 * 依据（**逐行回源抄录**）：
 *   - `MD` shared.js:38948-38978 —— 填文本（**剪贴板优先，setter 回落**）
 *   - `Be` `_Component43.jsx:851-887` —— 同一条链的发送侧（Phase 1）：
 *     `In(text).trim()` → `copyTextToClipboard` → 聚焦＋粘贴 → `Ql` 验证
 *
 * ★★ **为什么必须共用**：`SitePort.send`（发送）此前**只**做了 `pasteToWebview`（= `wc.paste()`，
 *   贴的是**系统剪贴板**），**从不写剪贴板** ⇒ 发出去的是剪贴板里的旧内容（`payload.text`
 *   只被用来算 `sessionId`）。而这条路（`analyze` 的提问链）**一直是做对的**
 *   ⇒ 抽成一份给两边用，而不是在 `send` 里再写第二遍。
 *
 * 两档（**顺序即语义**）：
 *   ① **剪贴板**：`writeText` → `withInputLock(pasteToWebview)` → 静置 600ms → 读 `valueLen > 0` 即成功
 *   ② **setter 回落**：直接写 `value`（React 受控组件走原型 setter）+ 补发 `input` 事件
 *
 * ⚠️ 源版在①失败时**不记账**（直接进②），最终失败统一给一句 —— 照抄。
 * ⚠️ `input-lock` 只在「粘贴」那一步用（原 `dS`）。
 * ⚠️ **失败的 message 属调用方域**：本模块给的是 `analyze` 的原文（`ANALYZE_TEXT.fillTextFailed`）；
 *    `send` 域按源 3a 的话术自报（见 `./index.ts` 的 Phase 1）。
 */
import type { HostPort } from '@/core/ports/host.port';
import { err, ok, type Result } from '@/core/model/result';
import { ANALYZE_TEXT } from '@/constants/text';
import { FILL_TEXT_SETTLE_MS } from '@/constants';
import { sleep } from '@/lib/async';
import { withInputLock } from '../shared/inputLock';
import { runProbe } from '../shared/waits';
import type { WebviewElement } from '../shared/webview';
import { INPUT_FOCUS_SCRIPT, READ_INPUT_STATE_SCRIPT, buildSetInputScript } from './scripts';

/** 读输入框状态（原 `Ql`） */
interface InputState {
  found?: boolean;
  valueLen?: number;
  focused?: boolean;
}

/** 写输入框结果（原 `AD`） */
interface SetInputResult {
  ok?: boolean;
  len?: number;
  reason?: string;
}

/** 把文本填进输入框（原 `MD`；剪贴板优先，setter 回落） */
export async function fillText(
  host: HostPort,
  view: WebviewElement,
  webContentsId: number,
  text: string,
): Promise<Result<void>> {
  // ① 先聚焦（原 `MD` 38949 的 `On(e, Ap)`）—— 失败不致命（下面还有 setter 那条路）
  await runProbe(view, INPUT_FOCUS_SCRIPT);

  const wrote = await host.clipboard.writeText(text);
  if (wrote.ok && webContentsId) {
    // ⚠️ 粘贴包在 input-lock 里（原 `MD` 38953 的 `dS`）
    await withInputLock(view, async () => {
      await host.clipboard.pasteToWebview(webContentsId);
    });
    await sleep(FILL_TEXT_SETTLE_MS);
    const state = await runProbe<InputState>(view, READ_INPUT_STATE_SCRIPT);
    if (state.ok && state.value && (state.value.valueLen ?? 0) > 0) return ok(undefined);
  }

  // ② setter 回落（原 `MD` 38966）
  const set = await runProbe<SetInputResult>(view, buildSetInputScript(text));
  if (set.ok && set.value?.ok && (set.value.len ?? 0) > 0) return ok(undefined);
  return err('unknown', ANALYZE_TEXT.fillTextFailed);
}
