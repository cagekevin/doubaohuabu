/**
 * API 任务事件的**落点**（原 `applyApiJobEvent` 直接写 store 的那几件事）—— **`canvas` 片的片段**
 *
 * ★ **它为什么单独成文件**：`canvas.ts` 的代码行已到 `max-lines`（400）上限〔⚠️ 该规则已于 2026-10-11 关闭〕 ⇒ 与
 *   `materialBatch.ts` **同法**：把「读 state → 算 → 写 state」的主体抽出来，
 *   `canvas.ts` 只**组合**它（`...createApiLandingActions(set, get, deps)`）。
 *   ⇒ 归属**仍是 `canvas` 片**（它写的就是 `nodes` / `library`）。
 *
 * **依据（逐行回源抄录）**：
 *   - `addToLibrary` shared.js:27101-27128
 *   - `attachImageResultToNode` shared.js:27227-27290
 *   - `addVideoNode` 的 **genvideo 源分支** shared.js:28114-28160（经 `applyApiJobEvent` 30773 调用）
 *
 * ⚠️ 原则 1：只有 state 能写 store —— 本文件属 `state/**`，且写的是**具名 action**。
 * ⚠️ 原则 4：`now` / `persistImage` / id 生成全部**注入**（不在本文件碰 `Date.now()` / 宿主）。
 *
 * ── 未落（如实标注，判据 B5：不留「落了但没人调」）──────────────────────────
 * | 缺 | 源 | 原因 |
 * |---|---|---|
 * | `addVideoNode` 的「**源节点非 genvideo ⇒ 网格新建视频节点**」分支 | 28162-28330 | 唯一调用方是**网页（doubao）视频流程**，该流程**未接线**；而 API 通道的视频任务源节点**必为 `genvideo`**（`state/generate.ts` 按节点类型分派）⇒ 该分支**不可达** ⇒ 不落（已登记 TD-16-83） |
 * | `imageGenKeyParams[u]` 查表（`u = genKey || jobId`） | 27247 / 27280 | 该表**无生产者**（`bindImageGenKey` / `bindImageGenJobs` 未接线）⇒ 恒为 `null` ⇒ 全走节点自身兜底 ⇒ 与源在「无绑定」时**逐字等价**（已登记 TD-16-84） |
 * | `pushImageGenFeed` / `imageGenFeed` | 27131-27167 | 源把它当 state 维护（去重 + 上限 80），但**119 个展开组件里无任何读者** ⇒ `docs/16` §2.9 已裁定为「派生视图」⇒ 不落（判据 B5；已登记 TD-16-85） |
 * | `localizeNodeVideos(q)` / 海报抓取（`_cmp_bk`） | 28150-28160 | ⚠️ **2026-10-11 回写**：`localizeNodeVideos` **已接线** —— `state/localizeOps`（← `state/generate` 写完 `resultUrl` 后 · 启动 5s 的 `container.startVideoBackfill()`）；**只剩海报抓取**（`_cmp_bk`）未落（需宿主能力，TD-02-5 家族） |
 */

import type { CanvasNode } from '@/stable/model/node';
import { GEN_HISTORY_KEY } from '@/stable/model/node';
import type { LibraryItem } from '@/stable/model/project';
import type { ApiJobAttempt } from '@/stable/model/gen';
import { appendGenHistoryAttempt, patchGenHistoryAttempt } from '@/core/rules/genHistory';
import { IMAGE_GEN_RESULT_LIMIT } from '@/constants';
import { clampImageCount } from '@/core/rules/prompt';

/** 落库的一张图（原 `addToLibrary` 的入参项） */
export interface LibraryAddItem {
  name: string;
  dataUrl: string;
  id?: string;
  favorite?: boolean;
  w?: number;
  h?: number;
  natW?: number;
  natH?: number;
}

/** 附加到 `imggen` 节点的图片结果（原 `attachImageResultToNode` 的 `r`） */
export interface ImgAttachResult {
  dataUrl: string;
  source: string;
  accountName: string | null;
  genKey: string | null;
}

/**
 * 落到 `genvideo` 源节点的视频结果（原 `addVideoNode` 的入参，**只用 API 通道会给的那几个**）
 *
 * ⚠️ 源还传 `name` / `accountName`，但它们**只在「网格新建」分支**被读（genvideo 分支**忽略**）
 *    ⇒ 这里不收（那条分支未落，见文件头）。
 */
export interface VideoAttachResult {
  url: string;
  /** 原 `{...attempt, status:'success'}`；无 ⇒ `null` */
  attempt: (ApiJobAttempt & { status: string }) | null;
}

export interface ApiLandingActions {
  /**
   * ★ **落资源库**（原 `addToLibrary` 27101）
   *
   * 顺序（逐行对源）：① 逐张 `data:` 图**落盘外置**（`persistImage`）② 按 `dataUrl` 对**已有库**去重
   * （源：`!l.dataUrl || !seen.has(l.dataUrl)` ⇒ **空 dataUrl 的条目保留**）③ 补 `id` / `favorite:false`。
   * ⚠️ **一张都没新增 ⇒ 不 commit、不写**（源 `if (a.length === 0) return {}`）。
   */
  addToLibrary: (items: readonly LibraryAddItem[]) => void;
  /**
   * ★ **把图片结果附加到 `imggen` 节点**（原 `attachImageResultToNode` 27227）
   *
   * 顺序（逐行对源）：① 找 `id` 且 `type==='imggen'` 的节点（不是 ⇒ `false`）
   * ② 落盘外置 ③ 按 `dataUrl` 对已有 `results` **去重**（命中 ⇒ `false`）
   * ④ `commit('imggen-result')` ⑤ 结果**插到最前**、上限 40 ⑥ 写 `resultUrl` / `dataUrl` / `viewUrl:null` / `generating:false`。
   * @returns 是否真的落了（源同）
   */
  attachImageResultToNode: (nodeId: string, result: ImgAttachResult) => boolean;
  /**
   * ★ **把视频结果落到 `genvideo` 源节点**（原 `addVideoNode` 28114 的 genvideo 分支）
   *
   * 顺序（逐行对源）：① `commit('graph-add')` ② 有 `attempt` ⇒ **追加**进 `genHistory`（`U$`）并按 id
   * **打补丁**（`Uy`：`vid`/`status:'success'`/`url`/`poster`/`width`/`height`/`duration`）
   * ③ `selVer = 尝试数 - 1` ④ 写 `resultUrl` / `resultPoster` / `resultVid` / `resultAt`
   * ⑤ 清 `_pendingAttempt`（若在）与 `_pendingAttempts[accountId]`（若命中）。
   * ⚠️ 源节点**不是 `genvideo`** ⇒ **不落**（源会走「网格新建」分支，那条未落，见文件头）。
   */
  attachVideoResultToNode: (nodeId: string, result: VideoAttachResult) => void;
}

/** 本片段**读**的字段（运行期就是整个 store；这里只声明用到的那几个） */
interface ApiLandingReadable {
  nodes: CanvasNode[];
  library: LibraryItem[];
  commit: (key: string) => void;
}

/** 本片段**写**的字段（都属 `canvas` 片） */
interface ApiLandingWritable {
  nodes: CanvasNode[];
  library: LibraryItem[];
}

export interface ApiLandingDeps {
  now(): number;
  /** 原 `Tn`：把内联 `data:` 图落成本地引用（**宿主**，同步 IPC） */
  persistImage(dataUrl: string): string;
  /** 原 `Pt('lib')` */
  nextLibraryId(): string;
}

export function createApiLandingActions(
  set: (partial: Partial<ApiLandingWritable>) => void,
  get: () => ApiLandingReadable,
  deps: ApiLandingDeps,
): ApiLandingActions {
  return {
    addToLibrary: (items) => {
      const s = get();
      if (!Array.isArray(items) || items.length === 0) return;

      // ① 落盘外置（源 `Tn`；`dataUrl` 为空 ⇒ 原样）
      const prepared = items.map((it) => ({
        ...it,
        dataUrl: it.dataUrl ? deps.persistImage(it.dataUrl) : it.dataUrl,
      }));
      // ② 对**已有库**按 `dataUrl` 去重（源：空 `dataUrl` 的条目保留）
      const seen = new Set(s.library.map((l) => l.dataUrl));
      const added = prepared
        .filter((l) => !l.dataUrl || !seen.has(l.dataUrl))
        .map((l) => ({ id: l.id || deps.nextLibraryId(), favorite: false, ...l }));
      // ③ 一张都没新增 ⇒ 不 commit、不写（源同）
      if (added.length === 0) return;

      get().commit('library');
      set({ library: [...s.library, ...added] });
    },

    attachImageResultToNode: (nodeId, result) => {
      const s = get();
      if (!nodeId || !result || !result.dataUrl) return false;

      const node = s.nodes.find((n) => n.id === nodeId && n.type === 'imggen');
      if (!node) return false;

      const dataUrl = deps.persistImage(result.dataUrl);
      const data = node.data;
      const prev: Array<Record<string, unknown>> = Array.isArray(data.results) ? data.results : [];
      if (prev.some((r) => r.dataUrl === dataUrl)) return false;

      // ⚠️ 源此处先查 `imageGenKeyParams[u]`（`u = genKey || jobId`）—— 该表**无生产者**
      //    ⇒ `d` 恒为 `null` ⇒ 下面全部走**节点自身**兜底（与源在「无绑定」时逐字等价）。
      const params = {
        text: (typeof data.text === 'string' ? data.text : '') || '',
        channel: (typeof data.channel === 'string' && data.channel) || 'doubao',
        aspectRatio: (typeof data.aspectRatio === 'string' && data.aspectRatio) || '1:1',
        styleIds: Array.isArray(data.styleIds) ? data.styleIds : [],
        imageCount: clampImageCount(data.imageCount),
        igModel: (typeof data.igModel === 'string' && data.igModel) || '',
        igResolution: (typeof data.igResolution === 'string' && data.igResolution) || '',
        sendAccount: (typeof data.sendAccount === 'string' && data.sendAccount) || 'auto',
      };
      const item = {
        dataUrl,
        source: result.source || 'api',
        accountName: result.accountName || null,
        genKey: result.genKey || null,
        ts: deps.now(),
        ratio: params.aspectRatio || null,
        prompt: (params.text || '').slice(0, 80) || null,
        params,
      };

      get().commit('imggen-result');
      // ⚠️ `overrides` 走 `Record<string, unknown>`（与 `canvas.patchNodeData` 同法）——
      //    `viewUrl: null` / `prompt: null` 这些是源版真的会写的值，但冻结形状把它们标成 `string`。
      const overrides: Record<string, unknown> = {
        results: [item, ...prev].slice(0, IMAGE_GEN_RESULT_LIMIT),
        resultUrl: dataUrl,
        dataUrl,
        viewUrl: null,
        generating: false,
      };
      set({
        nodes: s.nodes.map((n) =>
          n.id === nodeId ? ({ ...node, data: { ...node.data, ...overrides } } as CanvasNode) : n,
        ),
      });
      return true;
    },

    attachVideoResultToNode: (nodeId, result) => {
      const s = get();
      const node = s.nodes.find((n) => n.id === nodeId);
      // ⚠️ 非 `genvideo` 源 ⇒ 源版走「网格新建」分支（**未落**，见文件头）⇒ 此处不落。
      if (!node || node.type !== 'genvideo') return;

      const { url, attempt } = result;
      const prevData = node.data;
      let data: Record<string, unknown> = { ...prevData };

      if (attempt) {
        data = appendGenHistoryAttempt(data, attempt);
        data = patchGenHistoryAttempt(data, attempt.id, {
          vid: (attempt.vid as string | undefined) || null,
          status: 'success',
          url: url || null,
          poster: null,
          width: null,
          height: null,
          duration: null,
        });
      }

      const history = data[GEN_HISTORY_KEY] as { attempts?: unknown[] } | undefined;
      const attempts = history && Array.isArray(history.attempts) ? history.attempts : [];
      data.selVer = attempts.length - 1;
      data.resultUrl = url || null;
      data.resultPoster = null;
      data.resultVid = null;
      data.resultAt = deps.now();

      // `_pendingAttempt(s)` 清理（原 28138-28147）：本仓这两个字段**无生产者**
      // （启动归位即清）⇒ 目前恒为无操作；照抄源是为了将来 sendQueue 接线时不必回改。
      const hadPending = !!prevData._pendingAttempt;
      const pending =
        prevData._pendingAttempts && typeof prevData._pendingAttempts === 'object'
          ? { ...(prevData._pendingAttempts as Record<string, unknown>) }
          : null;
      const acc = (attempt && (attempt.accountId as string | undefined)) || null;
      if (pending && acc && pending[acc]) delete pending[acc];

      get().commit('graph-add');
      set({
        nodes: s.nodes.map((n) =>
          n.id === nodeId
            ? ({
                ...n,
                data: {
                  ...data,
                  ...(hadPending ? { _pendingAttempt: undefined } : {}),
                  ...(pending ? { _pendingAttempts: pending } : {}),
                },
              } as CanvasNode)
            : n,
        ),
      });
    },
  };
}
