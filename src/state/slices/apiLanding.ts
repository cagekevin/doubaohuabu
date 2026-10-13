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
 *   - `addVideoNode` shared.js:28009-28336（**两条分支**：genvideo 源 28050-28111 · 网格新建 28112-28335）
 *
 * ⚠️ 原则 1：只有 state 能写 store —— 本文件属 `state/**`，且写的是**具名 action**。
 * ⚠️ 原则 4：`now` / `persistImage` / id 生成全部**注入**（不在本文件碰 `Date.now()` / 宿主）。
 *
 * ── 未落（如实标注，判据 B5：不留「落了但没人调」）──────────────────────────
 * | 缺 | 源 | 原因 |
 * |---|---|---|
 * | ~~`imageGenKeyParams[u]` 查表~~ ✅ **已落（API 通道）**：`bindImageGenJobs`（`state/generate.ts` API 提交后绑定 `jobId[] → 提交参数`）→ `attachImageResultToNode` 按 `genKey || jobId` 查表回填 + 删键（纯层 `core/rules/imageGenKey.ts`）。网页通道的 `bindImageGenKey` 待 CDP 图像回流（BP-03 后半） |
 * | `pushImageGenFeed` / `imageGenFeed` | 27131-27167 | 源把它当 state 维护（去重 + 上限 80），但**119 个展开组件里无任何读者** ⇒ `docs/过程.md` §2.9 已裁定为「派生视图」⇒ 不落（判据 B5；已登记 TD-16-85） |
 * | `localizeNodeVideos(q)` / 海报抓取（`_cmp_bk`） | 28150-28160 | ⚠️ **2026-10-11 回写**：`localizeNodeVideos` **已接线** —— `state/localizeOps`（← `state/generate` 写完 `resultUrl` 后 · 启动 5s 的 `container.startVideoBackfill()`）；**只剩海报抓取**（`_cmp_bk`）未落（需宿主能力，TD-02-5 家族） |
 */

import type { CanvasNode, XY } from '@/stable/model/node';
import { GEN_HISTORY_KEY } from '@/stable/model/node';
import type { LibraryItem } from '@/stable/model/project';
import type { ApiJobAttempt } from '@/stable/model/gen';
import { appendGenHistoryAttempt, patchGenHistoryAttempt } from '@/core/rules/genHistory';
import {
  IMAGE_GEN_RESULT_LIMIT,
  VIDEO_GRID_COLS,
  VIDEO_GRID_GAP,
  VIDEO_GRID_OFFSET,
  VIDEO_NODE_WIDTH,
} from '@/constants';
import {
  bindImageGenJobs,
  dropImageGenKey,
  isImageGenSatisfied,
  resolveImageGenParams,
  tickImageGenDelivered,
  type ImageGenDeliveredKeys,
  type ImageGenKeyParams,
  type ImageGenParams,
  type ImageGenNodeFallback,
} from '@/core/rules/imageGenKey';

/** 缺尺寸时的兜底比例（原 `addVideoNode` 内的 `16/9`，`shared.js:28025`） */
const VIDEO_FALLBACK_RATIO = 16 / 9;

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
  /** ★ BP-03：API 通道的任务 id（查表键 = `genKey || jobId`，原 `:27246`） */
  jobId?: string | null;
}

/** CDP 图像回流的落点入参（原 `addImageGenResult` 的解构，`:27352-27359`） */
export interface AddImageGenResultInput {
  key: string;
  dataUrl: string;
  source: string;
  accountName: string | null;
  /** 目标节点 id（本仓 CdpJob 直接存节点 id，**不反查 `imageGenKeyNode`**） */
  nodeId: string;
}

/** CDP 图像回流落点结果（原 `addImageGenResult` 的 `{ok, added, satisfied}`） */
export interface AddImageGenResultOutcome {
  ok: boolean;
  /** 已收满（调用方据此 toast「已完成」/ 释放账号） */
  satisfied: boolean;
  /** 已收满被拒（去重，`:27370-27376`） */
  duplicate: boolean;
}

/**
 * 视频结果落画布的入参（原 `addVideoNode` 28009-28018 的解构）
 *
 * ⚠️ **两条分支共用它**：`genvideo` 源分支只用 `url`/`vid`/`attempt`/尺寸/海报；
 *    网格新建分支还会读 `name`/`accountName`/`recipe`/`sourceLabel`。
 */
export interface VideoNodeInput {
  url: string | null;
  /** 站点侧视频 id（去重键；已有同 `vid` 的 video 节点 ⇒ 不建） */
  vid: string | null;
  width: number | null;
  height: number | null;
  duration: number | null;
  poster: string | null;
  accountId: string | null;
  accountName: string;
  /** 节点 label（原 `name`，兜底「视频」） */
  name: string;
  /** 源节点：是 `genvideo` ⇒ 更新它；否则（含 `null`）⇒ **网格新建** */
  sourceNodeId: string | null;
  /** 原 `d0()` 派生的配方（网格分支落进 `data.recipe`） */
  recipe?: unknown;
  /** 原 `d0()` 派生的来源标签（网格分支落进 `data.sourceLabel`） */
  sourceLabel?: string | null;
  /** 原 `attempt`（有 ⇒ 追加进 `genHistory`） */
  attempt?: (ApiJobAttempt & { status?: string }) | null;
}

export interface ApiLandingActions {
  /**
   * ★ **绑定一批 API 图片任务 → 提交参数**（原 `bindImageGenJobs` 的 params 半，`:27207-27215`）
   *
   * 提交成功后由 `state/generate.ts` 调；结果到达时 `attachImageResultToNode` 按
   * `genKey || jobId` 查表回填 `params` 并删键（防膨胀）。
   */
  bindImageGenJobs: (jobIds: readonly string[], params: ImageGenParams) => void;
  /**
   * ★ **绑定网页通道单键**（原 `bindImageGenKey`，`:27171-27194`）：`key → 提交参数 + 期望张数`
   *
   * 网页通道发送成功后由 `state/generate.ts` 调；CDP 图像回流时 `addImageGenResult` 按
   * `key` 查表回填 `params` 并按期望张数去重。
   */
  bindImageGenKey: (key: string, params: ImageGenParams, target: number) => void;
  /**
   * ★ **CDP 图像回流落点**（原 `addImageGenResult`，`:27352-27453`）：
   * 去重 → 落节点（`attachImageResultToNode` 查表回填）→ 计数。
   */
  addImageGenResult: (input: AddImageGenResultInput) => AddImageGenResultOutcome;
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
   * ★ **视频结果落画布**（原 `addVideoNode` 28009-28336）—— **两条分支一个入口**
   *
   * ① **`vid` 去重**：已有同 `vid` 的 `video` 节点 ⇒ 不建（返回 `null`）
   * ② **`genvideo` 源节点** ⇒ 更新它（`genHistory` 追加 + `Uy` 补丁 / `selVer` / `result*` / 清 `_pending*`）
   * ③ **其余源节点（含账号节点 / 无源）** ⇒ **网格新建**视频节点
   *    （`gridAnchor` = 源节点 id · `gridSlot` 递增槽位 · `gridPos` 落点；会按行高**重排**同网格旧节点）
   * @returns 新建节点 id；走 ① / ② ⇒ `null`
   */
  addVideoNode: (input: VideoNodeInput) => string | null;
}

/** 本片段**读**的字段（运行期就是整个 store；这里只声明用到的那几个） */
interface ApiLandingReadable {
  nodes: CanvasNode[];
  library: LibraryItem[];
  imageGenKeyParams: ImageGenKeyParams;
  imageGenDeliveredKeys: ImageGenDeliveredKeys;
  commit: (key: string) => void;
}

/** 本片段**写**的字段（都属 `canvas` 片） */
interface ApiLandingWritable {
  nodes: CanvasNode[];
  library: LibraryItem[];
  imageGenKeyParams: ImageGenKeyParams;
  imageGenDeliveredKeys: ImageGenDeliveredKeys;
}

export interface ApiLandingDeps {
  now(): number;
  /** 原 `Tn`：把内联 `data:` 图落成本地引用（**宿主**，同步 IPC） */
  persistImage(dataUrl: string): string;
  /** 原 `Pt('lib')` */
  nextLibraryId(): string;
  /** 原 `Pt('vid')` —— 网格新建视频节点的 id */
  nextVideoNodeId(): string;
}

export function createApiLandingActions(
  set: (partial: Partial<ApiLandingWritable>) => void,
  get: () => ApiLandingReadable,
  deps: ApiLandingDeps,
): ApiLandingActions {
  /** 附加图片结果到 `imggen` 节点（原 `attachImageResultToNode`，`:27227-27292`）—— 供 action 内部复用 */
  const doAttachImage = (nodeId: string, result: ImgAttachResult): boolean => {
    const s = get();
    if (!nodeId || !result || !result.dataUrl) return false;

    const node = s.nodes.find((n) => n.id === nodeId && n.type === 'imggen');
    if (!node) return false;

    const dataUrl = deps.persistImage(result.dataUrl);
    const data = node.data;
    const prev: Array<Record<string, unknown>> = Array.isArray(data.results) ? data.results : [];
    if (prev.some((r) => r.dataUrl === dataUrl)) return false;

    // ★ BP-03：查表回填提交参数（原 `:27246-27257`：`u = genKey || jobId`，`d = imageGenKeyParams[u]`）。
    //   有 ⇒ 用提交值；无 ⇒ 走节点自身兜底（与源「无绑定」时逐字等价）。
    const key = result.genKey || result.jobId || null;
    const bound = key ? s.imageGenKeyParams[key] : undefined;
    const params = resolveImageGenParams(bound, data as ImageGenNodeFallback);
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
      // ★ 结果消费后删键（原 `:27280-27288`，防键表无限膨胀）
      imageGenKeyParams: key ? dropImageGenKey(s.imageGenKeyParams, key) : s.imageGenKeyParams,
    });
    return true;
  };

  return {
    bindImageGenJobs: (jobIds, params) => {
      const s = get();
      if (!Array.isArray(jobIds) || jobIds.length === 0 || !params) return;
      set({ imageGenKeyParams: bindImageGenJobs(s.imageGenKeyParams, jobIds, params) });
    },

    bindImageGenKey: (key, params, target) => {
      const s = get();
      if (!key || !params) return;
      const clamped = Math.max(1, Math.min(4, target | 0 || 1));
      set({
        imageGenKeyParams: { ...s.imageGenKeyParams, [key]: params },
        imageGenDeliveredKeys: {
          ...s.imageGenDeliveredKeys,
          [key]: { ts: deps.now(), target: clamped, got: 0 },
        },
      });
    },

    addImageGenResult: (input) => {
      const s = get();
      if (!input || !input.dataUrl || !input.key || !input.nodeId) {
        return { ok: false, satisfied: false, duplicate: false };
      }

      // ① 去重（原 `:27370-27376`：已收满 ⇒ duplicate）
      if (isImageGenSatisfied(s.imageGenDeliveredKeys, input.key)) {
        return { ok: false, satisfied: true, duplicate: true };
      }

      // ② 落节点（原 `:27409-27414`：`imageGenKeyNode[n]` 反查节点 —— 本仓由 CdpJob 直接带 `nodeId`）
      //   `doAttachImage` 内部查 `imageGenKeyParams[key]` 回填 `params` 并删键。
      doAttachImage(input.nodeId, {
        dataUrl: input.dataUrl,
        source: input.source || 'doubao',
        accountName: input.accountName,
        genKey: input.key,
      });

      // ③ 计数（原 `:27416-27438`）
      const ticked = tickImageGenDelivered(get().imageGenDeliveredKeys, input.key, deps.now());
      set({ imageGenDeliveredKeys: ticked.table });

      return { ok: true, satisfied: ticked.satisfied, duplicate: false };
    },

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

    attachImageResultToNode: (nodeId, result) => doAttachImage(nodeId, result),

    addVideoNode: (input) => {
      const s = get();
      const {
        url,
        vid,
        width,
        height,
        duration,
        poster,
        accountId,
        accountName,
        name,
        sourceNodeId,
        recipe,
        sourceLabel,
        attempt,
      } = input;

      // ① `vid` 去重（源 28020-28024）
      if (
        vid &&
        s.nodes.some((n) => n.type === 'video' && (n.data as Record<string, unknown>).vid === vid)
      ) {
        return null;
      }

      // ② 新节点尺寸（源 28025-28027：宽 `b = 1280`，高按比例）
      const ratio = width && height && height > 0 ? width / height : VIDEO_FALLBACK_RATIO;
      const W = VIDEO_NODE_WIDTH;
      const H = Math.round(W / ratio);

      /** 绝对坐标（源 `k`：有 `parentId` ⇒ 相对父节点） */
      const absPos = (n: CanvasNode): XY => {
        const pos = n.position ?? { x: 0, y: 0 };
        const parentId = (n as { parentId?: string }).parentId;
        if (!parentId) return { x: pos.x || 0, y: pos.y || 0 };
        const parent = s.nodes.find((x) => x.id === parentId);
        if (!parent) return { x: pos.x || 0, y: pos.y || 0 };
        return {
          x: (pos.x || 0) + (parent.position?.x || 0),
          y: (pos.y || 0) + (parent.position?.y || 0),
        };
      };
      /** 尺寸（源 `N`：`width/height` 或 `measured`，兜 200×180） */
      const dims = (n: CanvasNode): { w: number; h: number } => {
        const m = (n as { measured?: { width?: number; height?: number } }).measured;
        return { w: n.width ?? m?.width ?? 200, h: n.height ?? m?.height ?? 180 };
      };

      const C = VIDEO_GRID_GAP;
      const S = VIDEO_GRID_COLS;
      const E = W + C;
      const P = Math.round(W / VIDEO_FALLBACK_RATIO) + C;
      const off = VIDEO_GRID_OFFSET;

      const sourceNode = sourceNodeId ? s.nodes.find((n) => n.id === sourceNodeId) : null;

      // ③ `genvideo` 源节点分支（源 28050-28111）—— 更新它，不新建
      if (sourceNode && sourceNode.type === 'genvideo') {
        const prevData = sourceNode.data as Record<string, unknown>;
        let data: Record<string, unknown> = { ...prevData };

        if (attempt) {
          data = appendGenHistoryAttempt(data, attempt);
          data = patchGenHistoryAttempt(data, attempt.id, {
            vid: vid || (attempt.vid as string | undefined) || null,
            status: 'success',
            url: url || null,
            poster: poster || null,
            width: width || null,
            height: height || null,
            duration: duration || null,
          });
        }

        const history = data[GEN_HISTORY_KEY] as { attempts?: unknown[] } | undefined;
        const attempts = history && Array.isArray(history.attempts) ? history.attempts : [];
        data.selVer = attempts.length - 1;
        data.resultUrl = url || null;
        data.resultPoster = poster || null;
        data.resultVid = vid || null;
        data.resultAt = deps.now();
        // ★ BP-08：视频走异步出片 ⇒ 出片即清「生成中」（本仓 genvideo 用 `generating` 布尔，源用 `apiJob`/`_pendingAttempt` 推导）
        data.generating = false;

        // `_pendingAttempt(s)` 清理（原 28091-28101）
        const hadPending = !!prevData._pendingAttempt;
        const pending =
          prevData._pendingAttempts && typeof prevData._pendingAttempts === 'object'
            ? { ...(prevData._pendingAttempts as Record<string, unknown>) }
            : null;
        const acc = accountId || (attempt && (attempt.accountId as string | undefined)) || null;
        if (pending && acc && pending[acc]) delete pending[acc];

        get().commit('graph-add');
        set({
          nodes: s.nodes.map((n) =>
            n.id === sourceNode.id
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
        return null;
      }

      // ④ **网格新建**（源 28112-28335）
      const gridAnchor = sourceNode ? String(sourceNodeId) : '';
      let anchorX: number;
      let anchorY: number;
      if (sourceNode) {
        const p = absPos(sourceNode);
        anchorX = p.x + dims(sourceNode).w + off;
        anchorY = p.y;
      } else {
        let right = 0;
        for (const n of s.nodes) {
          if (n.type === 'video') continue;
          const p = absPos(n);
          right = Math.max(right, p.x + dims(n).w);
        }
        anchorX = right + off;
        anchorY = 40;
      }

      const mates = s.nodes.filter(
        (n) =>
          n.type === 'video' &&
          (((n.data as Record<string, unknown>).gridAnchor as string) || '') === gridAnchor,
      );
      const slotOf = (n: CanvasNode): number => {
        const v = (n.data as Record<string, unknown>).gridSlot;
        return typeof v === 'number' && v >= 0 ? v : -1;
      };
      let maxSlot = -1;
      for (const n of mates) maxSlot = Math.max(maxSlot, slotOf(n));
      let slot = maxSlot + 1;

      /** 行高表（源 `M`） */
      const rowHeights = (s0: number): number[] => {
        const hs: number[] = [];
        for (const n of mates) {
          const sl = slotOf(n);
          if (sl < 0) continue;
          const row = Math.floor(sl / S);
          hs[row] = Math.max(hs[row] || 0, dims(n).h);
        }
        const row0 = Math.floor(s0 / S);
        hs[row0] = Math.max(hs[row0] || 0, H);
        return hs;
      };
      /** 槽位 → 坐标（源 `U`） */
      const slotPos = (s0: number, hs: readonly number[]): XY => {
        const col = s0 % S;
        const row = Math.floor(s0 / S);
        let y = anchorY;
        for (let i = 0; i < row; i++) y += (hs[i] || P) + C;
        return { x: anchorX + col * E, y };
      };
      const approx = (a: XY, b: XY): boolean =>
        Math.abs((a.x || 0) - (b.x || 0)) <= 1 && Math.abs((a.y || 0) - (b.y || 0)) <= 1;
      const hasGridPos = (n: CanvasNode): boolean => {
        const gp = (n.data as Record<string, unknown>).gridPos as XY | undefined;
        return !!gp && approx(n.position, gp);
      };

      // 已占用矩形（源 `J`：跳过「有 gridPos 的网格成员」——它们要跟着重排）
      const occupied: Array<{ x1: number; y1: number; x2: number; y2: number }> = [];
      for (const n of s.nodes) {
        if (mates.includes(n) && hasGridPos(n)) continue;
        const p = absPos(n);
        const d = dims(n);
        occupied.push({ x1: p.x, y1: p.y, x2: p.x + d.w, y2: p.y + d.h });
      }
      const collides = (x: number, y: number): boolean =>
        occupied.some((r) => x < r.x2 - 1 && x + W > r.x1 + 1 && y < r.y2 - 1 && y + H > r.y1 + 1);

      let hs = rowHeights(slot);
      let pos = slotPos(slot, hs);
      for (let i = 0; i < 60 && collides(pos.x, pos.y); i++) {
        slot += 1;
        hs = rowHeights(slot);
        pos = slotPos(slot, hs);
      }

      // 同网格旧节点按新行高重排（源 `ne` / `pe`）
      const repositioned = s.nodes.map((n) => {
        if (!mates.includes(n) || !hasGridPos(n)) return n;
        const sl = slotOf(n);
        if (sl < 0) return n;
        const np = slotPos(sl, hs);
        if (approx(n.position, np)) return n;
        return { ...n, position: np, data: { ...n.data, gridPos: np } } as CanvasNode;
      });
      const nextNodes = repositioned.some((n, i) => n !== s.nodes[i]) ? repositioned : s.nodes;

      const id = deps.nextVideoNodeId();
      get().commit('graph-add');
      const created = {
        id,
        type: 'video',
        position: pos,
        width: W,
        height: H,
        data: {
          label: name || '视频',
          vid: vid || null,
          url: url || null,
          width: width || null,
          height: height || null,
          duration: duration || null,
          poster: poster || null,
          accountId: accountId || null,
          accountName: accountName || '',
          gridAnchor,
          gridSlot: slot,
          gridPos: pos,
          ...(recipe ? { recipe } : {}),
          ...(sourceLabel ? { sourceLabel } : {}),
          ...(attempt ? { genHistory: { v: 1, attempts: [attempt] } } : {}),
        },
      } as CanvasNode;
      set({ nodes: [...nextNodes, created] });
      return id;
    },
  };
}
