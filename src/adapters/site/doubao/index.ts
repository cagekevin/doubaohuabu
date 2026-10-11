/**
 * 豆包 / Dola 站点适配器（★ 最易变层）
 *
 * 依据：docs/03-人类版.md §4 §6 + docs/10（后端硬约束）
 *   - `Bu` shared.js:40411-40530 —— 发送（含 `sessionId` **幂等**）
 *   - `DR` shared.js:36335-36553 —— 生成结果轮询（**结果来自 webview 扫描**，不是 `lovartFetchImages`）
 *   - `Xk` shared.js:35949-36035 —— 结果扫描器（`./../shared/scanScripts.ts`）
 *   - `Zl` 37118-37222 —— 发送按钮四级降级（`./scripts.ts`）
 *
 * 铁律（契约注释）：
 *   - ★ **宿主能力一律经 `HostPort` 注入**，**禁止直调 `window.api`**（TD-05-1）
 *     —— `webview` DOM 操作例外：那是渲染层自己的元素，不是宿主 IPC
 *   - ★ **不开自动轮询抓取**（docs/10 #4）：本适配器**不自启定时器**；轮询只在 `send` 期间存在，`send` 结束即停
 *   - ★ **零注入**（docs/10 #2）
 *   - ★ **失败返 `Result`，不得抛异常**（docs/10 #6）；**禁止 `.catch(() => 空)`**（TD-05-2）
 *   - ★ **选择器不外泄**（全在 `./scripts.ts`）
 */

import type { Account } from '@/stable/model/account';
import type { GenResult } from '@/stable/model/gen';
import type { HostPort } from '@/core/ports/host.port';
import type { SendPayload, SendResult, SitePort, SiteProbe, ScanResult } from '@/core/ports/site.port';
import { err, ok, toMessage, type Result } from '@/core/model/result';
import { GEN_POLL_MS, GEN_SILENT_MS, GEN_TIMEOUT_MS } from '@/constants';
import { buildClickSendScript } from './scripts';
import { createDoubaoAskWithImage } from './analyze';
import { requireWebview, webviewEval } from '../shared/webview';
import { buildResultScanScript } from '../shared/scanScripts';

/** 点击发送的结果（原 `Zl` 返回 `{ok, clicked, tag, strategy}`） */
interface ClickResult {
  ok: boolean;
  clicked: boolean;
  tag?: string;
  strategy?: string;
  level?: number;
  error?: string;
}

/** 结果扫描的返回（原 `Xk` 的 `{ok, href, items}`） */
interface ResultScanItem {
  url: string;
  kind: 'http' | 'data' | 'blob';
  w: number;
  h: number;
}

/** 结果扫描脚本（模块级常量 —— 原 `Xk.toString()` 每次重建，这里只建一次） */
const RESULT_SCAN = buildResultScanScript();

/**
 * 采样一次生成结果（原 `DR` 内层：`webview.executeJavaScript(Xk)`）
 *
 * ⚠️ **失败返判别联合**，不 `.catch(() => [])`（TD-05-2）
 */
async function sampleOnce(partition: string): Promise<Result<ResultScanItem[]>> {
  let view;
  try {
    view = requireWebview(partition);
  } catch (e) {
    // ★ 原样透传（原则 6）
    return err('page-error', toMessage(e), e);
  }
  try {
    const raw = (await webviewEval(view, RESULT_SCAN)) as {
      ok?: boolean;
      items?: ResultScanItem[];
      error?: string;
    } | null;
    // ★ 2026-10-11 收口（TD-05-3）：`ok === false` ⇒ **fail-open**（脚本漏 `ok` 即被当成功）。
    //   脚本 `buildResultScanScript` 恒返回 `{ok:true,…}`（`shared/scanScripts.ts:100`）⇒ 改 `!== true`。
    if (!raw || raw.ok !== true) return err('page-error', raw?.error ?? '结果扫描返回失败');
    return ok(Array.isArray(raw.items) ? raw.items : []);
  } catch (e) {
    return err('page-error', toMessage(e), e);
  }
}

/** 扫描项 → `GenResult`（落盘拿 `img://` 引用；**落盘失败如实计入 failed**） */
async function toGenResult(
  host: HostPort,
  item: ResultScanItem,
  ctx: { source: 'doubao' | 'dola'; accountName: string; key: string },
): Promise<Result<GenResult>> {
  // `data:` 直接落盘；`http(s):` 需经宿主带 cookie 取回（CORS 拦不住主进程）
  let dataUrl: string | null = null;
  if (item.kind === 'data') {
    dataUrl = item.url;
  } else {
    const fetched = await host.media.imageFetchDataUrl(item.url);
    if (!fetched.ok) return fetched; // ★ 转发原始错误
    dataUrl = fetched.value;
  }
  if (!dataUrl) return err('unknown', `无法取得图片内容：${item.url.slice(0, 80)}`);

  // `sendSync`：同步返回 `img://` 引用（落盘幂等）；失败返 Result（不再 try 兜）
  const saved = host.media.saveImageSync(dataUrl);
  if (!saved.ok) return saved; // ★ 转发原始错误（原则 6）

  return ok({
    ref: saved.value,
    source: ctx.source,
    accountName: ctx.accountName,
    genKey: ctx.key,
    ts: Date.now(),
    ratio: '',
    prompt: '',
    params: {},
  });
}

/**
 * 会话页地址（原 `aS` = `'https://www.doubao.com/chat/'` · `iS` = `'https://www.dola.com/chat/'`
 * shared.js:38717-38718）
 *
 * ⚠️ **站点细节 ⇒ 只能住在这里**（`core` 不得出现站点 URL）。后台页导航目标由
 *    `SitePort.chatUrl` 对外声明，`core/usecases/sendToSite` 只消费不认得。
 */
const CHAT_URL: Readonly<Record<'doubao' | 'dola', string>> = {
  doubao: 'https://www.doubao.com/chat/',
  dola: 'https://www.dola.com/chat/',
};

export function createDoubaoSite(kind: 'doubao' | 'dola', host: HostPort): SitePort {
  /** 已发送过的幂等键（原实现用 `sessionId` 防重复点菜单）—— 收进闭包，避免模块级可变状态 */
  const sentSessions = new Set<string>();

  return {
    kind,
    chatUrl: CHAT_URL[kind],
    // ★ 提示词分析 / 调整的页内半（原 `hS` + `mS`）—— 只有豆包 / Dola 有这条链
    askWithImage: createDoubaoAskWithImage(host),

    async send(account: Account, payload: SendPayload): Promise<Result<SendResult>> {
      const partition = account.partition;
      if (!partition) return err('account-invalid', '账号缺少 partition');

      // ★ 幂等键：同一 (账号, 文本) 只发一次（原实现防重复点菜单）
      const sessionId = `${account.id}:${payload.source}:${hash32(payload.text)}`;
      if (sentSessions.has(sessionId)) {
        return err('busy', `重复发送被拦截（sessionId=${sessionId}）`);
      }

      let view;
      try {
        view = requireWebview(partition);
      } catch (e) {
        return err('page-error', toMessage(e), e);
      }

      const wcId = view.getWebContentsId?.() ?? 0;
      if (!wcId) return err('page-error', '无法取得 webview 的 webContentsId（视图可能未挂载）');

      // ① 附图（**经 HostPort** —— TD-05-1）
      if (payload.images.length > 0) {
        const attached = await host.clipboard.attachImages(
          wcId,
          payload.images.map((ref) => ({ dataUrl: ref })),
        );
        if (!attached.ok) return attached; // ★ 转发原始错误
        const attachErrors = attached.value.errors ?? [];
        if (attachErrors.length > 0) {
          // ★ 部分失败**如实上报**（不虚报成功）
          return err('unknown', attachErrors.join(' | '));
        }
      }

      // ② 贴文本（**经 HostPort**；顺序与 await 由主进程保证 —— docs/10 #8）
      const pasted = await host.clipboard.pasteToWebview(wcId);
      if (!pasted.ok) return pasted; // ★ 转发原始错误

      // ③ 点发送（四级降级，全在脚本内）
      let click: ClickResult | null;
      try {
        click = (await webviewEval(view, buildClickSendScript())) as ClickResult;
      } catch (e) {
        return err('send-stuck', toMessage(e), e);
      }
      if (!click?.ok || !click.clicked) {
        // ★ 原样透传脚本返回的错误（原则 6）
        return err('send-stuck', click?.error ?? `未找到发送按钮（strategy=${click?.strategy ?? 'none'}）`);
      }

      sentSessions.add(sessionId);

      // ④ 等结果（轮询只在 `send` 期间存在；**结束即停**，不自启常驻定时器）
      const { results, endReason, failures } = await pollResults(host, partition, {
        source: kind,
        accountName: account.name,
        key: sessionId,
      });

      // ★ 全部失败且无结果 ⇒ 如实报错（不伪装成 timeout）
      if (results.length === 0 && failures.length > 0) {
        return err('page-error', failures.join(' | '));
      }
      return ok({ sessionId, endReason, results });
    },

    async scan(): Promise<Result<ScanResult>> {
      // 豆包/Dola 不发"抓素材"（那是 Lovart 的能力）；明确报错，**不静默返回空**
      return err('unknown', `${kind} 适配器不支持抓取素材（请用 Lovart 后台）`);
    },

    async probe(account: Account): Promise<Result<SiteProbe>> {
      const partition = account.partition;
      if (!partition) return ok({ usable: false, loggedIn: false });
      let view;
      try {
        view = requireWebview(partition);
      } catch (e) {
        // ★ 视图未挂载 ⇒ 不可用（**不是**"未登录"），原样带出原因
        return err('page-error', toMessage(e), e);
      }
      try {
        const raw = (await webviewEval(
          view,
          '({ href: location.href, hasInput: !!document.querySelector(\'textarea, [contenteditable="true"]\') })',
        )) as { href?: string; hasInput?: boolean } | null;
        return ok({ usable: !!raw?.hasInput, loggedIn: !!raw?.href, pageKind: 'other' });
      } catch (e) {
        return err('page-error', toMessage(e), e);
      }
    },
  };
}

/**
 * 等结果（原 `DR` 的循环骨架）
 *
 * ⚠️ 三个阈值来自 `constants`（SSOT）：轮询 3000ms / 静默 9000ms / 超时 25s
 * ⚠️ **结束即停**：不留下常驻定时器
 * ⚠️ 逐次失败**收集**（不吞）—— 全部失败时由调用方如实报错
 */
async function pollResults(
  host: HostPort,
  partition: string,
  ctx: { source: 'doubao' | 'dola'; accountName: string; key: string },
): Promise<{ results: GenResult[]; endReason: SendResult['endReason']; failures: string[] }> {
  const started = Date.now();
  const results: GenResult[] = [];
  const seen = new Set<string>();
  const failures: string[] = [];
  let lastChange = started;

  for (;;) {
    await sleep(GEN_POLL_MS);

    const sampled = await sampleOnce(partition);
    if (!sampled.ok) {
      // ★ 采样失败**记下原文**（不伪装成"本轮无新图" —— TD-05-2）
      failures.push(sampled.message);
    } else {
      for (const item of sampled.value) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        const converted = await toGenResult(host, item, ctx);
        if (converted.ok) {
          results.push(converted.value);
          lastChange = Date.now();
        } else {
          failures.push(converted.message);
        }
      }
    }

    if (results.length > 0 && Date.now() - lastChange >= GEN_SILENT_MS) {
      return { results, endReason: 'settled', failures };
    }
    if (Date.now() - started >= GEN_TIMEOUT_MS) {
      return { results, endReason: results.length > 0 ? 'settled' : 'timeout', failures };
    }
  }
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/** 32 位字符串哈希（幂等键用；非加密用途） */
function hash32(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}
