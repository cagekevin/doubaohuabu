/**
 * 豆包 / Dola 站点适配器（★ 最易变层）
 *
 * 依据：docs/过程.md §4 §6 + docs/过程.md（后端硬约束）
 *   - `Bu` shared.js:40411-40530 —— 发送（含 `sessionId` **幂等**）
 *   - `Be` `_Component43.jsx:807-1318` —— **管线本体**（`Bu` 的 transport 真身）：
 *     Phase 1 文本填入（`:851-887`）/ 2 附图 / 3a 校验（`:1139-1215`）/ 3b 点发送（`:1237`）
 *   - `DR` shared.js:36335-36553 —— 生成结果轮询（**结果来自 webview 扫描**，不是 `lovartFetchImages`）
 *   - `Xk` shared.js:35949-36035 —— 结果扫描器（`./../shared/scanScripts.ts`）
 *   - `Zl` 37118-37222 —— 发送按钮四级降级（`./scripts.ts`）
 *
 * 铁律（契约注释）：
 *   - ★ **宿主能力一律经 `HostPort` 注入**，**禁止直调 `window.api`**（TD-05-1）
 *     —— `webview` DOM 操作例外：那是渲染层自己的元素，不是宿主 IPC
 *   - ★ **不开自动轮询抓取**（docs/过程.md #4）：本适配器**不自启定时器**；轮询只在 `send` 期间存在，`send` 结束即停
 *   - ★ **零注入**（docs/过程.md #2）
 *   - ★ **失败返 `Result`，不得抛异常**（docs/过程.md #6）；**禁止 `.catch(() => 空)`**（TD-05-2）
 *   - ★ **选择器不外泄**（全在 `./scripts.ts`）
 */

import type { Account } from '@/stable/model/account';
import type { GenResult } from '@/stable/model/gen';
import type { HostPort } from '@/core/ports/host.port';
import type { StoragePort } from '@/core/ports/storage.port';
import type { SendResult, SitePort, SiteProbe, ScanResult } from '@/core/ports/site.port';
// ★ 发送入参 = **品牌类型**（只由 `core/rules/payload.toSitePayload` 产出）—— 见 `docs/11` §六·六 M1
import type { SiteSendPayload } from '@/core/rules/payload';
import { err, ok, toMessage, type Result } from '@/core/model/result';
// ★ 「30s 强开」的**闸**（纯判据）住 `core/rules`（见该文件头注：入参是业务数据，不掺环境）
import { isDolaForceTarget } from '@/core/rules/dolaForce';
import { sleep } from '@/lib/async';
import { log } from '@/lib/log';
// ★ `TD-05-6`：会话幂等键的哈希段收口到 `lib/hash.hash32`（此前本文件有一份私有副本）
import { hash32 } from '@/lib/hash';
// ★ 源 Phase 1 的 `In(text)`（HTML 实体/标签归一）—— 本仓同一份实现在 `lib/text`
import { stripHtml } from '@/lib/text';
// ★ 原图尺寸（原 `Lc` 的 `<img>` 半）—— 量不到 ⇒ `0`（与 `Pu` 的 `200×160` 兜底不是一回事）
import { measureNaturalSize } from '@/lib/readDroppedFile';
import { GEN_POLL_MS, GEN_SCAN_MIN_SIDE, GEN_SEND_GRACE_MS } from '@/constants';
// ★ 出片轮询的**纯判定**（去重键 / 基线 / 结束三档 / 跨会话去重表 —— 原 `DR` 的四段）
import {
  countRecurringAsset,
  decideScanEnd,
  emptyRecurringTable,
  freshScannedItems,
  isRecurringTable,
  pruneRecurringAssets,
  stripScanKeys,
} from '@/core/rules/resultScan';
// ★ 占位图判定（原 `Nk`）—— 既有的纯层去重器（`isPlaceholder`）；感知哈希由 `lib/phash` 注入
import { createDedupe, emptyDedupeState } from '@/core/rules/dedupe';
import { perceptualHash } from '@/lib/phash';
// ★ 跨会话去重表（原 `TR`/`PR`）—— 键与形状都是 SSOT 契约
import { LS_IMGGEN_DEDUP } from '@/stable/contracts/keys';
import type { ImggenDedupTable } from '@/stable/contracts/lsValues';
import { fillText } from './fillText';
// ★ 发送管线的 **Phase 2 · 附图**（原 `Be` 的 `:888-1051` 全段：CDP 主通路 + 剪贴板回退 + 按键补充 + 2b）
import { attachImagesPhase2 } from './attachPhase2';
import { ATTACH_FINGERPRINT_SCRIPT, buildClickSendScript, READ_INPUT_STATE_SCRIPT } from './scripts';
// ★ **Phase 3a · 发送前完整性校验**（图数 / 图序）—— 纯判据住 `core/rules/precheckAttach`
import {
  attachPrecheck,
  attachPrecheckDiag,
  attachPrecheckIssue,
  compareImageOrder,
  type ImageOrder,
} from '@/core/rules/precheckAttach';
import { ATTACH_PRECHECK_TEXT } from '@/constants/text';
import {
  enableDolaForce30s,
  runDolaForcePanelUi,
  scheduleDolaForceCleanup,
} from './dolaForce';
import { applyGenParams } from './setGenParams';
import { createDoubaoGenConfirm } from './genConfirm';
import {
  createDoubaoAskWithImage,
  createDoubaoDetectVideos,
  createDoubaoFetchWatermarkFree,
  createDoubaoFetchWatermarkFreeByThread,
  createDoubaoLeaveDetectPage,
  createDoubaoPingQueueProgress,
} from './analyze';
// ★ 发送后监测的页内探测（原 `_Component43` 的 `watchSendReply` + `postSendDetect` 的 `Hd`）
import {
  createDoubaoProbeGenAck,
  createDoubaoProbeGenSubmitted,
  createDoubaoProbeQuotaUsage,
  createDoubaoProbeReplyNotice,
  createDoubaoProbeWaitTime,
} from './watch';
import { requireWebview, webviewEval, webviewEvalSafe } from '../shared/webview';
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

/**
 * 结果扫描脚本（模块级常量 —— 原 `Xk.toString()` 每次重建，这里只建一次）
 *
 * ⚠️ `minSide` 传 `GEN_SCAN_MIN_SIDE`（220）—— 源 `DR` 就是**带参**调用 `Xk` 的
 *   （`{minSide: Jk}`，`:36427`），不是用 `Xk` 自己的默认值 96。
 */
const RESULT_SCAN = buildResultScanScript(GEN_SCAN_MIN_SIDE);

/**
 * 占位图判定（原 `Nk`，`:25776`）—— 判定住 `core/rules/dedupe`（SSOT），此处只**注入感知哈希**
 * （`core` 不得碰 DOM ⇒ 浏览器侧实现 `lib/phash` 只能由适配器接上）
 */
const placeholderDetector = createDedupe(emptyDedupeState(), { phash: perceptualHash });

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

/**
 * 取回一张扫描图的内容（原 `Lc`，`:36481`）
 *
 * `data:` 直接可用；`http(s):` 需经宿主带 cookie 取回（CORS 拦不住主进程）。
 */
async function fetchScanImage(host: HostPort, item: ResultScanItem): Promise<Result<string>> {
  if (item.kind === 'data') return ok(item.url);
  const fetched = await host.media.imageFetchDataUrl(item.url);
  if (!fetched.ok) return fetched; // ★ 转发原始错误
  if (!fetched.value) return err('unknown', `无法取得图片内容：${item.url.slice(0, 80)}`);
  return ok(fetched.value);
}

/**
 * 落盘成 `GenResult`（`saveImageSync` 同步返回 `img://` 引用，落盘幂等）
 *
 * ⚠️ **失败原样转发**（原则 6）；不在这里做任何过滤 —— 滤网在 `pollResults` 里**按源顺序**排。
 */
function saveGenResult(
  host: HostPort,
  dataUrl: string,
  ctx: {
    source: 'doubao' | 'dola';
    accountName: string;
    key: string;
    /** 原 `D.natW || 0` / `D.natH || 0`（`shared.js:36524-36525`） */
    natW: number;
    natH: number;
  },
): Result<GenResult> {
  const saved = host.media.saveImageSync(dataUrl);
  if (!saved.ok) return saved;
  return ok({
    ref: saved.value,
    source: ctx.source,
    accountName: ctx.accountName,
    genKey: ctx.key,
    ts: Date.now(),
    ratio: '',
    prompt: '',
    params: {},
    natW: ctx.natW,
    natH: ctx.natH,
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

/**
 * 建豆包 / Dola 站点适配器
 *
 * ⚠️ `storage` **必须注入**（`adapters` 不得 import `state` —— `.dependency-cruiser.cjs`
 *   的 `adapters-no-upward`）⇒ 跨会话去重表的读写经 `StoragePort`，键与形状仍取 SSOT
 *   （`stable/contracts/keys` 的 `LS_IMGGEN_DEDUP` · `lsValues` 的 `ImggenDedupTable`）。
 */
export function createDoubaoSite(
  kind: 'doubao' | 'dola',
  host: HostPort,
  storage: StoragePort,
): SitePort {
  /**
   * Dola 30s 诊断回传（原 `ct`，`_Component43.jsx:628-636`）
   *
   * ⚠️ **fire-and-forget**：失败只留痕，绝不打断发送（源也是 `try{ void … }catch{}`）。
   * ⚠️ 只发**本仓真存在**的阶段行 —— 源的「会话 … 参考图 原始=… 去重后=…」那行带
   *    **去重计数**，而本仓**不做参考图去重** ⇒ 发它就是编数字，**不发**。
   */
  const diag = (msg: string): void => {
    void host.media.logDolaDuration(msg).then((r) => {
      if (!r.ok) log.warn('[doubao] dolaDurationDiag 失败：', r.message);
    });
  };

  /** 已发送过的幂等键（原实现用 `sessionId` 防重复点菜单）—— 收进闭包，避免模块级可变状态 */
  const sentSessions = new Set<string>();

  return {
    kind,
    chatUrl: CHAT_URL[kind],
    // ★ 提示词分析 / 调整的页内半（原 `hS` + `mS`）—— 只有豆包 / Dola 有这条链
    askWithImage: createDoubaoAskWithImage(host),
    // ★ `TD-16-103`：`store.queueProgress` 的生产者接缝（发送后追问排队进度）
    pingQueueProgress: createDoubaoPingQueueProgress(host),
    // ★ 无水印拉取（原 `mD`/`gD` 页内脚本）—— 2026-10-12 落（`docs/过程.md` §10 的 ⛔ 阻塞）
    fetchWatermarkFree: createDoubaoFetchWatermarkFree(),
    fetchWatermarkFreeByThread: createDoubaoFetchWatermarkFreeByThread(),
    // ★ 发送后检测（原 `it` / `postSendDetect`）—— 站到 aispace ＋ 宿主主进程取数
    detectVideos: createDoubaoDetectVideos(host),
    leaveDetectPage: createDoubaoLeaveDetectPage(),
    // ★ 「生成确认」链（原 `kt` / `autoConfirm`）—— `Hd`/`A0`/`lD`/`j0`/`Zl` 的页内半
    genConfirm: createDoubaoGenConfirm(host),
    // ★ 发送后监测的 4 个页内探测（原 `_Component43` 的 `watchSendReply` 用 `dD`/`fD`/`pD`/`hD`）
    probeGenAck: createDoubaoProbeGenAck(),
    probeWaitTime: createDoubaoProbeWaitTime(),
    probeReplyNotice: createDoubaoProbeReplyNotice(),
    probeQuotaUsage: createDoubaoProbeQuotaUsage(),
    // ★ 「已提交」探测（原 `Hd`，`shared.js:37494`）—— 服务 **`postSendDetect` 的计时器启动**
    //   （源 `ze(Y, Hd, 'detect-gen-submit')`，`_Component43.jsx:1565`）；**不属上面那族**
    probeGenSubmitted: createDoubaoProbeGenSubmitted(),

    /**
     * 发送（原 `Bu` → transport `kS` → `_Component43` 的 `Be`）—— **本仓落的六段**：
     *   ⓪ **文本填入**（原 Phase 1）：`In(text)` 归一 → 写剪贴板 → 聚焦＋粘贴 → 验证
     *   ① 附图（原 Phase 2；本仓走 CDP 直喂，不经剪贴板）
     *   ② **应用生成参数**（原 Phase 2c；`./setGenParams` 的 `applyGenParams`）—— dola 跳过
     *   ③ **Dola 面板 UI 自动化**（原 Phase 2d；`./dolaForce` 的 `runDolaForcePanelUi`）
     *   ④ 点发送（原 Phase 3b）
     *   ⑤ 等结果（原 `DR` 轮询；**结束即停**，不自启常驻定时器）
     * ⚠️ 源的 Phase 2b 与 Phase 3a 的**图数/图序**那两档未落（分片见 `docs/过程.md（原 plan/02）`）。
     */
    async send(account: Account, payload: SiteSendPayload): Promise<Result<SendResult>> {
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

      // ★ **Dola「30s 强开」的配对**（原 `Mt`/`zt`，`_Component43.jsx:758-779`）——
      //   发送前装（`Mt`）／发送后 3s 清（`zt`）。清理**必须**走 `finally`（M4「作用域即配对」）：
      //   写成"每个出口记得清"必然有人漏；而漏了会让残留配置劫持**下一次非强开**的发送
      //   （`JP` 的 `cfg()` 只按"`duration>=16` ＋ 未过期"判，不认那一次是不是强开）。
      const force30s = await enableDolaForce30s(view, account.type, payload.params);
      try {
        // ⓪ **文本填入**（原 `Be` 的 Phase 1，`_Component43.jsx:851-887`）—— ★ 源顺序：
        //   **文本 → 图 → 点发送**。源逐字：`In(text).trim()`（HTML 实体/标签归一，本仓 = `stripHtml`）
        //   → `copyTextToClipboard` → 聚焦＋粘贴 → `Ql` 验证（读 `valueLen`）。
        //   ⚠️ 本段此前**整段缺失**：那时只有 `pasteToWebview`（= `wc.paste()`，贴的是**系统剪贴板**）
        //      而**没人写剪贴板** ⇒ 发出去的其实是剪贴板里的旧内容。现按源顺序补上，且填入那段
        //      **复用提问链的实现**（`./fillText`，判据 C1）—— 不再写第二份。
        //   ⚠️ 判空用**原文**（源 `if (me.text && me.text.trim())`）—— 归一后变空串**照样走填入**
        //      （那样会被下面的闸拦下），别在门口把它当"没文本"跳过。
        let textInserted = true; // 源 `ae` 的初值：无文本 ⇒ 视作"已填入"（`:884`）
        if (payload.text && payload.text.trim()) {
          const filled = await fillText(host, view, wcId, stripHtml(payload.text));
          // ⚠️ **源不在此处中止**：它只把「文本没进输入框」记为 `ae = false`，判定交给 **Phase 3a** ——
          //   `autoSend` 时那是**硬闸**（`if (Ne) 点击 else return { reason:'precheck-fail' }`，`:1264-1307`）；
          //   `autoSend=false` 时它照走 `ok` 但带 `precheck.pass=false`，由账号节点显示成 `err` + 警告
          //   （`OL.jsx:353-355`）。⇒ 2026-10-13 起本仓同源（此前这里**提前 return**，把两档压成一档）。
          textInserted = filled.ok;
        }

        // ① 附图（**原 Phase 2 全段 + 2b**，`./attachPhase2`；经 `HostPort` —— TD-05-1）
        //    ⚠️ 2026-10-13 补：此前这里只有「CDP 一次直喂」，**没有**基数/增量确认、剪贴板回退、
        //       按键补充、Phase 2b —— 那是源 `Be` 的 Phase 2 全段（`:888-1051`），与 `hS`（服务
        //       `askWithImage` 的那份）**不是同一个函数**。现在按源逐段落。
        let imagesAttached = 0;
        /** 去重后张数（源 `K.length`）—— Phase 3a 的「期望张数」就是它 */
        let imagesUnique = payload.images.length;
        /** 去重掉的张数（源 `de`） */
        let duplicatesRemoved = 0;
        if (payload.images.length > 0) {
          diag(`Phase2 主通路 CDP 直喂 ${payload.images.length} 张…`); // 源 `:903`
          const p2 = await attachImagesPhase2(
            { clipboard: host.clipboard, isMac: () => host.os === 'macos' },
            view,
            wcId,
            payload.images,
          );
          if (!p2.ok) return p2; // ★ 转发原始错误
          imagesAttached = p2.value.attached;
          imagesUnique = p2.value.total;
          duplicatesRemoved = p2.value.dropped;
          if (p2.value.dropped > 0) {
            // 源 `:842`：`图片去重：原始 N 张 → 去重后 M 张（去除 d 张重复）`
            diag(`Phase2 参考图去重：原始 ${payload.images.length} 张 → 去重后 ${imagesUnique} 张`);
          }
          diag(`Phase2 ${p2.value.via} 通路确认附件 ${imagesAttached} 张`); // 源 `:933` / `:999`
          // ⚠️ 「一张都没贴上」源**不报错** ⇒ 交给下面的 Phase 3a 图数校验去判（同源）
        }

        // ② **应用生成参数**（原 `Be` 的 **Phase 2c**，`:1058-1138`）——
        //   「把参数写到页面底栏（模型/比例/时长）」。**dola 跳过**（源 `:1058` 的 `if (qe)` —— 该账号没有生成参数控件）。
        //   ⚠️ **best-effort**：源从不因它中止（失败只记诊断）⇒ `applyGenParams` 恒返 `ok`，失败只留痕。
        //   ⚠️ 位置照源：在 Phase 2（附图）之后、Phase 2d（Dola 面板）**之前**。
        if (account.type !== 'dola') {
          await applyGenParams(view, payload.params);
        }

        // ③ **Phase 3a · 发送前完整性校验**（图数 / 图序；原 `:1169-1241`）
        //   ⚠️ **位置照源**：在 **Phase 2c 之后、Phase 2d 之前**（源的 Phase 2d 块就在它下面）
        let textOk = textInserted;
        if (payload.text && payload.text.trim() && !textOk) {
          // 源 `:1172-1175`：文本「该有但没有」⇒ 用页内读数复核一次（`Ql`）
          const st = await webviewEvalSafe<{ valueLen?: unknown }>(view, READ_INPUT_STATE_SCRIPT);
          textOk = !!st && typeof st.valueLen === 'number' && st.valueLen > 0;
        }
        const expected = imagesUnique;
        let order: ImageOrder = 'unknown';
        let liveCount = 0;
        let sigCount = 0;
        let probe: { inputTag?: unknown; inputArea?: unknown; edCount?: unknown } | null = null;
        if (expected > 0) {
          const fp = await webviewEvalSafe<{
            sigs?: unknown;
            count?: unknown;
            inputTag?: unknown;
            inputArea?: unknown;
            edCount?: unknown;
          }>(view, ATTACH_FINGERPRINT_SCRIPT);
          if (fp) {
            probe = fp;
            liveCount = typeof fp.count === 'number' ? fp.count : 0;
            const sigs = Array.isArray(fp.sigs) ? fp.sigs : [];
            sigCount = sigs.length;
            order = compareImageOrder(sigs, payload.images);
          }
          diag(`Phase3a 图序=${order} 期望=${expected} 页内元素=${liveCount} 指纹=${sigCount}`);
        }
        const pre = attachPrecheck({
          textOk,
          expected,
          processCount: imagesAttached,
          liveCount,
          sigCount,
          order,
        });
        const precheckDiag = attachPrecheckDiag(expected, probe, liveCount, imagesAttached, sigCount);
        const precheckIssue = attachPrecheckIssue(pre.issues, precheckDiag);
        diag(`Phase3a 结论=${pre.pass ? 'PASS' : 'FAIL'}${pre.issues ? ` 明细=${pre.issues}` : ''}`);

        // ④ **Dola 面板 UI 自动化**（原 `Be` 的 **Phase 2d**，`:1242-1263`）——
        //   「强开 Seedance 2.5 ＋ 目标时长」。闸与 `Mt` **同一份**（`isDolaForceTarget`，判据 C1）。
        //   ⚠️ 它只**尽力**：面板没停在「视频生成」模式时 `ok:false` **属正常** —— 网络层（`JP`）兜底
        //      （源也把它整体包在 `try/catch` 里，失败只记诊断串）。
        //   ⚠️ 位置照源：在 `autoSend` 分流**之前**（源的 `if (me.autoSend)` 在它之后）。
        if (isDolaForceTarget(account.type, payload.params)) {
          await runDolaForcePanelUi(view);
        }

        // ⑤ **只填不点**（原 `Be` 的 **Phase 3**，`:1311-1314`）—— `autoSend === false` 时
        //   到此为止：不点发送、也就没有轮询（源那一路直接走到「填入完成」返回 `:1315-1332`）。
        //   ⇒ 账号节点的「填入」语义就落在这里（开关 `autoSend` 由节点给）。
        //   ⚠️ **这条路不拦校验**：源照走 `ok`，只把 `precheck.pass=false` 带出去，
        //      由账号节点显示成 `err` + 警告（`OL.jsx:353-355`）—— 硬闸只设在下面的 `autoSend` 分支。
        if (!payload.autoSend) {
          sentSessions.add(sessionId);
          return ok({
            sessionId,
            endReason: 'filled-only',
            results: [],
            fillOnly: true,
            autoClicked: false,
            imagesAttached,
            imagesTotal: payload.images.length,
            imagesUnique,
            duplicatesRemoved,
            textInserted,
            precheck: pre,
            precheckIssue,
          });
        }

        // ★ **Phase 3a 的硬闸**（原 `:1264-1307`）—— `autoSend` 开着时校验不过 ⇒ **阻止自动发送**。
        //   ⚠️ 源在**这里**才拦（不是在校验处算完就拦）—— 只填入那条路**不拦**（上面已返回）。
        if (!pre.pass) {
          const issues = pre.issues || ATTACH_PRECHECK_TEXT.fallbackIssues;
          diag(ATTACH_PRECHECK_TEXT.blockedLog(issues)); // 源 `:1297`
          return err('precheck-fail', ATTACH_PRECHECK_TEXT.blocked(issues)); // 源 `:1298-1301`
        }

        // ⑥ 点发送（四级降级，全在脚本内；原 Phase 3b `:1264-1294` 的点击段）
        let click: ClickResult | null;
        try {
          click = (await webviewEval(view, buildClickSendScript())) as ClickResult;
        } catch (e) {
          return err('send-stuck', toMessage(e), e);
        }
        if (!click?.ok || !click.clicked) {
          // ★ 原样透传脚本返回的错误（原则 6）
          return err(
            'send-stuck',
            click?.error ?? `未找到发送按钮（strategy=${click?.strategy ?? 'none'}）`,
          );
        }

        sentSessions.add(sessionId);

        // ⑦ 等结果 —— **仅图片通道**（原 `DR` 同步轮询出片）。
        //   ⚠️ 视频（`canvas-text-node`）/ 账号节点（`canvas-account-node`）**发完即返回**：
        //      源 `Be` 对视频是 fire-and-forget，结果由 `postSendDetect` / `dolaMedia` 异步归属；
        //      本仓此前把视频也塞进 `pollResults`（它扫的是**页面新图**）⇒ 等不到视频、超时（真 bug，BP-08）。
        if (payload.source === 'canvas-image-gen') {
          const { results, endReason, failures } = await pollResults(host, storage, partition, {
            source: kind,
            accountName: account.name,
            key: sessionId,
          });

          // ★ 全部失败且无结果 ⇒ 如实报错（不伪装成 timeout）
          if (results.length === 0 && failures.length > 0) {
            return err('page-error', failures.join(' | '));
          }
          return ok({
            sessionId,
            endReason,
            results,
            fillOnly: false,
            autoClicked: true,
            imagesAttached,
            imagesTotal: payload.images.length,
            imagesUnique,
            duplicatesRemoved,
            textInserted,
            precheck: pre,
            precheckIssue,
          });
        }

        // 视频 / 账号节点：发完即返回（结果由上层异步归属）
        return ok({
          sessionId,
          endReason: 'settled',
          results: [],
          fillOnly: false,
          autoClicked: true,
          imagesAttached,
          imagesTotal: payload.images.length,
          imagesUnique,
          duplicatesRemoved,
          textInserted,
          precheck: pre,
          precheckIssue,
        });
      } finally {
        // ★ **强开清理**（原 `zt`）—— 发送结束（无论成败）后 **3s** 删页面上的配置
        if (force30s) scheduleDolaForceCleanup(view);
      }
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
 * 等结果（原 `DR` 的循环骨架，`shared.js:36335-36553`）
 *
 * 顺序**逐行对源**：
 *   ① **首轮扫描只记基线**（`:36444-36451`）—— 页面上已有的图不是本轮结果
 *   ② 之后每轮只处理**新项**（基线外 + 未处理过；键 = `Od` 去签名，`:36452-36455`）
 *   ③ 取回 → 占位图跳过（`Nk`）→ 落盘出图
 *   ④ 结束三档由纯层 `decideScanEnd` 判（`:36532-36541`）
 *
 * ⚠️ **首轮立即扫**（源 `Promise.resolve().then(N)`）—— 基线取的正是"发送后那一刻"的页面；
 *   若先 sleep 再扫，这 3 秒内出现的图会被**当基线吞掉**（少收结果）。
 * ⚠️ **结束即停**：不留下常驻定时器。
 * ⚠️ 逐次失败**收集**（不吞）—— 全部失败时由调用方如实报错。
 * ⚠️ 阈值全住 `constants`（SSOT）：轮询 `CR` 3000 · 静默 `ER` 9000 · 仅占位图 `jR` 180000 ·
 *   总超时 `_R` 600000。
 */
/**
 * 读跨会话去重表（原 `TR`，`:36238`）
 *
 * ⚠️ 与 `state/persistKeys` 的 `PERSIST[LS_IMGGEN_DEDUP]` 是**同一个调用**（那里就是 `rw(key)`）
 *   ⇒ 不是第二份读写；本文件是那条 `rw` 的**唯一消费者**。
 * ⚠️ 源 `TR` 是 `try/catch` + 形状校验 ⇒ `missing` / `corrupt` / **形状不对**都当**空表**
 *   （否则写回时会把损坏数据覆盖成"半张表"）。
 */
function readDedupTable(storage: StoragePort): ImggenDedupTable {
  const r = storage.read<ImggenDedupTable>(LS_IMGGEN_DEDUP);
  if (r.kind !== 'ok' || !isRecurringTable(r.value)) return emptyRecurringTable();
  return r.value;
}

/**
 * 写回跨会话去重表（原 `PR`，`:36251`）—— **先裁后写**
 *
 * ⚠️ 源把写盘包在 `try/catch {}` 里**空吞**；本仓**留痕不吞**（原则 6），但**不因此中断**
 *   —— 表的写失败不影响「图已经拿到了」这个事实。
 */
function writeDedupTable(storage: StoragePort, table: ImggenDedupTable): void {
  pruneRecurringAssets(table);
  try {
    storage.write(LS_IMGGEN_DEDUP, table);
  } catch (e) {
    log.warn('[pollResults] 跨会话去重表写回失败：', e);
  }
}

/**
 * 等结果（原 `DR` 的循环骨架，`shared.js:36335-36553`）
 *
 * 顺序**逐行对源**：
 *   ① **首轮扫描只记基线**（`:36444-36451`）—— 页面上已有的图不是本轮结果
 *   ② 之后每轮只处理**新项**（基线外 + 未处理过；键 = `Od` 去签名，`:36452-36455`）
 *   ③ 每个新项过**两道闸**（`:36466` 那**同一个 `if`**）：发送后前 10 秒内的新图 ·
 *      **跨会话**已见 ≥ 2 次的固有素材（URL 桶）
 *   ④ 取回 → 感知哈希也过跨会话表（`hashes` 桶）→ 占位图跳过（`Nk`）→ 落盘出图
 *   ⑤ 结束三档由纯层 `decideScanEnd` 判（`:36532-36541`）
 *
 * ⚠️ **首轮立即扫**（源 `Promise.resolve().then(N)`）—— 基线取的正是"发送后那一刻"的页面；
 *   若先 sleep 再扫，这 3 秒内出现的图会被**当基线吞掉**（少收结果）。
 * ⚠️ **去重表整场只读一次、只写一次**（源 `TR()` `:36353` / `PR(p)` `:36367`）。
 * ⚠️ **结束即停**：不留下常驻定时器。
 * ⚠️ 逐次失败**收集**（不吞）—— 全部失败时由调用方如实报错。
 * ⚠️ 阈值全住 `constants`（SSOT）：轮询 `CR` 3000 · 静默 `ER` 9000 · 仅占位图 `jR` 180000 ·
 *   总超时 `_R` 600000 · 扫描最小边 `Jk` 220 · 发送后宽限 `IR` 10000。
 */
async function pollResults(
  host: HostPort,
  storage: StoragePort,
  partition: string,
  ctx: { source: 'doubao' | 'dola'; accountName: string; key: string },
): Promise<{ results: GenResult[]; endReason: SendResult['endReason']; failures: string[] }> {
  const started = Date.now();
  const results: GenResult[] = [];
  const failures: string[] = [];
  /** 基线（首轮扫描时的去重键）；`null` = 还没扫过 */
  let baseline: string[] | null = null;
  /** 基线建立时刻（源 `h`）—— 发送后宽限 `IR` 从它起算 */
  let baselineAt = started;
  /** 已处理过的键（源 `u`）—— 含被跳过、不再重试的项 */
  const processed = new Set<string>();
  /** 跨会话去重表（整场一份） */
  const table = readDedupTable(storage);
  /** `p0` 的「本轮已计过」集合（源 `d`，`:36351`）—— **整场共用**，不是每轮一个 */
  const counted = new Set<string>();
  let lastProgress = started;
  let sawPlaceholder = false;

  /** 每条出口都写回表（源 `x()` 里就是 `PR(p)` —— 所有结束路径共用） */
  const finish = (endReason: SendResult['endReason']) => {
    writeDedupTable(storage, table);
    return { results, endReason, failures };
  };

  for (;;) {
    const sampled = await sampleOnce(partition);
    if (!sampled.ok) {
      // ★ 采样失败**记下原文**（不伪装成"本轮无新图" —— TD-05-2）
      failures.push(sampled.message);
    } else if (baseline === null) {
      // ① 首轮：只记基线，**不产出**（源 `if (!h) { …c.add(Od(O)); return }`）
      baseline = stripScanKeys(sampled.value);
      baselineAt = Date.now();
      lastProgress = baselineAt;
    } else {
      /** 发送后宽限窗口（源 `P - h < IR`；`P` 每轮取一次） */
      const inGrace = Date.now() - baselineAt < GEN_SEND_GRACE_MS;
      // ② 新项（保序）
      for (const { item, key } of freshScannedItems(sampled.value, baseline, [...processed])) {
        processed.add(key);
        // 源在过滤之后、取图之前就更新 `m` ⇒ 被跳过 / 失败的项也算"有进展"
        const at = Date.now();
        lastProgress = at;
        // ③ 源 `:36466` 的**同一个 `if`**：前 10 秒的新图 ‖ 跨会话已见 ≥2 次的 URL ⇒ 跳过
        if (inGrace || countRecurringAsset(table, 'urls', key, counted, at) >= 2) continue;

        const fetched = await fetchScanImage(host, item);
        if (!fetched.ok) {
          failures.push(fetched.message);
          continue;
        }
        const dataUrl = fetched.value;

        // ④ 源 `:36502-36510`：先算感知哈希，再看 `hashes` 桶
        const phash = await perceptualHash(dataUrl);
        if (phash && countRecurringAsset(table, 'hashes', phash, counted, at) >= 2) continue;

        // 源 `:36511-36520`：占位图 ⇒ 记一笔、跳过（**不是失败、也不是结果**）
        if (await placeholderDetector.isPlaceholder(dataUrl)) {
          sawPlaceholder = true;
          continue;
        }

        // ④b 量原始尺寸（原 `Lc` 的 `<img>` 半，`shared.js:23812-23820`）—— 量不到 ⇒ `0`
        const size = await measureNaturalSize(dataUrl);

        const saved = saveGenResult(host, dataUrl, { ...ctx, natW: size.natW, natH: size.natH });
        if (!saved.ok) {
          failures.push(saved.message);
          continue;
        }
        results.push(saved.value);
      }
    }

    // ⑤ 结束三档（纯层判定）
    const end = decideScanEnd({
      sinceLastProgressMs: Date.now() - lastProgress,
      emitted: results.length,
      sawPlaceholder,
      sinceStartMs: Date.now() - started,
    });
    if (end) {
      // ⚠️ 与源的一处**有意差异**：源把结果**流式**交 `onItem`（超时也照样算拿到）；
      //   本仓是聚合成 `results` 一次交 ⇒ 10 分钟到点时**已拿到的结果照旧算数**（标 `settled`），
      //   只有「一张都没拿到」才叫 `timeout`。
      return finish(end === 'timeout' && results.length > 0 ? 'settled' : end);
    }

    await sleep(GEN_POLL_MS);
  }
}



/** 32 位字符串哈希（幂等键用；非加密用途） */
// ⚠️ 已删除本文件私有的 `hash32`（2026-10-12 · `TD-05-6`）—— 提升为 `lib/hash.hash32` 唯一真源
//   （源 `b$` `shared.js:25062-25068` 的后代；gpt 的 sessionId 也改用同一处）
