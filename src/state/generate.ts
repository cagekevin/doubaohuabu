/**
 * 生成编排（**state 层：唯一把生成结果写进 store 的地方**）
 *
 * 依据：§6.5 原则 1 —— `core/usecases` 只返回 `Result`，**不写 store**；
 *       写入由本文件负责。
 *
 * ⚠️ 原则 6：失败时 `message` **原样**写入 `backendErrors`（不改写）
 * ⚠️ 本文件属于 `state`，**不得** import `adapters`（端口由 container 注入）
 */

import type { Ports } from '@/core/ports';
import type { AppStore } from './store';
import { generateImage, generateVideo, type GenDeps } from '@/core/usecases/generate';
import type { SendWatchController } from './sendWatch';
import { countUsable } from '@/core/rules/accountPool';
import { busyIdsOf } from '@/core/rules/accountBusy';
import { resolveApiProviderId } from '@/core/rules/apiProvider';
import { planVideoBatchLanding } from '@/core/rules/apiBatch';
import { FAIL_LABEL } from '@/constants/failure';
import { DEFAULT_IMAGE_RESOLUTION } from '@/constants/models';
import { clampImageCount, resolveRefMaterial } from '@/core/rules/prompt';
import { localizeNodeInto } from './localizeOps';
import { parseRefChips, refsToRawNames, refsToReferenceLabels } from '@/core/rules/refs';
import { stripHtml } from '@/lib/text';
import { stylePrefixOf } from '@/core/rules/style';
import { COMMON_TEXT, GEN_PANEL_TEXT } from '@/constants/text';

export interface GenController {
  /** 对某个节点触发生成；返回是否成功（失败已写进 `backendErrors`） */
  runForNode(nodeId: string): Promise<boolean>;
  /**
   * ★ **批量出片**（原 `Z3_1.jsx:856-944` 的 `st`）：同一提示词 + 当前视频 provider，
   *   按 16:9 / 9:16 / 1:1 三比例各出一片（复用后端并发队列）。
   *
   * ⚠️ 仅对 `genvideo` + API 通道有意义（UI 只在 `channel==='api'` 且解析出 provider 时渲染按钮）。
   * 返回是否成功；成功已把 `apiJob` 落节点并 toast。
   */
  runVideoBatchForNode(nodeId: string): Promise<boolean>;
}

export function createGenController(
  store: AppStore,
  ports: Ports,
  /**
   * ★ 「发送后监测」控制器（原 `gt` 的尾巴 —— `_Component43.jsx:3010` 在发送链里触发 `watchSendReply`）
   *
   * ⚠️ 由 `container` 注入（`state` 内部**不互相 new** —— 否则两个控制器互相依赖就成环）。
   *   缺省 `undefined` ⇒ 只跳过监测（单测里不必造它）。
   */
  sendWatch?: SendWatchController,
): GenController {
  /**
   * 尝试 id 的自增段（原 `O$` 的模块级计数器 `Oy`）
   *
   * ⚠️ 放在**控制器闭包**里而不是模块级 —— 本仓 `test.isolate: false`（见 `vite.config.ts`），
   *    模块级可变状态会**跨测试文件泄漏**。
   */
  let attemptSeq = 0;

  const deps: GenDeps = {
    sites: ports.sites,
    host: ports.host,
    clock: ports.clock,
    /*
     * ★ 风格前缀（原 `nu(De, G.styles)`）—— 2026-10-11（`TD-07-1` 清场）：
     *   拼接逻辑搬进**纯层** `core/rules/style.ts`；本处只把「当前风格表」喂进去
     *   （源也是查 store 的 `styles`，**不是**内置表 —— 用户自建风格要能生效）。
     */
    stylePrefixOf: (ids) => stylePrefixOf(ids, store.useStore.getState().styles),
    // ★ 尝试 id（原 `O$`）—— 时间经端口、序号在闭包内自增
    makeAttemptId: () => {
      attemptSeq += 1;
      return `a${ports.clock.now().toString(36)}${attemptSeq.toString(36)}`;
    },
    // ★ 占用 / 释放（原 `Fi` / `tn`）—— **真正的 `set` 发生在 state**（原则 1）；
    //   注入给用例是因为「占用」必须在「用例内部选号之后、发送之前」发生。
    //   这是 `docs/14` §8「`setBusyAccounts` 零调用」的修法。
    holdAccount: (accountId, nodeId) =>
      store.useStore.getState().holdAccount(accountId, { itemId: null, nodeId }),
    releaseAccount: (accountId) => {
      store.useStore.getState().releaseAccount(accountId);
    },
    // ★ TD-02-16：选号必须**实时**知道哪些账号在忙（用例跨重试多次选号）
    busyIds: () => busyIdsOf(store.useStore.getState().accountBusy, ports.clock.now()),
  };

  return {
    async runForNode(nodeId) {
      const s = store.useStore.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node) {
        // ★ 经**唯一写入口** `pushBackendError`（带 kind 去重 + 统一 id）
        //   —— ⛔ 不得直改 `setState` 绕过它（TD-07-2）
        store.useStore.getState().pushBackendError('unknown', `节点不存在：${nodeId}`);
        return false;
      }
      if (node.type !== 'imggen' && node.type !== 'genvideo') {
        store.useStore.getState().pushBackendError('unknown', `节点类型 ${node.type} 不支持生成`);
        return false;
      }

      // ★ 前置检查：**有没有可用账号**（无可用 ⇒ 明确报错；配了 API provider 仍可走 API 通道）
      //   ⚠️ 本处**不再自己选号**（TD-02-16 一归）：选号是 usecase 的职责，且它现在**带 `busy`**
      //      （`deps.busyIds`）⇒ 本处只需一个「可用账号计数」——
      //      ⛔ 此处不再 `pickAccount`（与用例内的选号是**同一判断的两份**）。
      if (countUsable(s.accounts) === 0 && !(s.apiSetup.imageProviderId || s.apiSetup.videoProviderId)) {
        // ⚠️ 文案取自 SSOT（`FAIL_LABEL`）—— 不再内联（TD-03-3）
        store.useStore.getState().pushBackendError('unknown', FAIL_LABEL['no-account']);
        return false;
      }

      const styleIds = node.data.styleIds ?? [];
      const ratio = node.data.aspectRatio;
      const text = node.data.text;
      const sourceNodeId = node.id;
      const isApi = node.data.channel === 'api';
      /**
       * ★ API 通道要**显式给 provider**（后端 `job-manager.js:415` 的第一个参数）——
       *   解析是纯规则（`core/rules/apiProvider.ts`，原 `resolveApiProviderId`）。
       *   ⚠️ 图 / 视频两条通道都走它（各自的 `capabilities` 由规则内部区分）。
       */
      const apiProviderId = isApi
          ? resolveApiProviderId(
              node.type === 'imggen' ? 'image' : 'video',
              s.apiProvidersMeta,
              s.apiConfigs,
              s.apiSetup,
            )
          : null;
      /** provider 展示名（只用于视频尝试记录的 `accountName` / `note`，源 `He.name`） */
      const apiProviderName =
        apiProviderId ? (s.apiProvidersMeta.find((p) => p.id === apiProviderId)?.name ?? '') : '';

      /**
       * ★★ **API 通道的引用改写 + 参考图采集**（原 `Z3_1.jsx:792-803` 视频 / `_Component45.jsx:855-875` 图片）
       *
       * `data.text` 存的是 **`@[id|名]` 形态**（见 `ui/panels/GenPanel` 的协议表）⇒ 先 `parseRefChips`（原 `Ja`）：
       *   · **视频** ⇒ 每处引用换成该素材的 **`rawName`**（原 `Z3_1.jsx:792` 的 `replace(/@图(\d)/g, …)`）；
       *   · **图片** ⇒ 换成 **`参考图N`** 标签（原 `_Component45.jsx:855` 的 `KL`）—— 两条通道写法**本就不同**，照抄；
       *   · 两条都收集引用素材的 **`dataUrl`** 当 `refSources`（`resolveRefMaterial`，原 `de`）。
       * ⚠️ 老工程里若被上一版写过 `@图N`（无 id）⇒ `refs` 为空 ⇒ **原样发出**（= 旧行为，已登记 `TD-03-9`）。
       */
      const apiRefs = isApi ? parseRefChips(stripHtml(text)) : null;
      const apiText = !apiRefs
        ? text
        : node.type === 'genvideo'
          ? refsToRawNames(apiRefs.text, apiRefs.refs)
          : refsToReferenceLabels(apiRefs.text, apiRefs.refs).body;
      const refSources = apiRefs
        ? apiRefs.refs
            .map((r) => resolveRefMaterial(r.id, s.library, s.nodes).dataUrl)
            .filter((u) => !!u)
        : [];

      // 标记「生成中」（写入由 state 负责）
      store.useStore.getState().patchNodeData(nodeId, { generating: true });

      const res =
        node.type === 'imggen'
          ? await generateImage(deps, {
              accounts: s.accounts,
              poolStrategy: s.poolStrategy,
              accountId: node.data.sendAccount,
              styleIds,
              ratio,
              text: apiText,
              images: refSources,
              count: clampImageCount(node.data.imageCount),
              model: node.data.igModel,
              resolution: node.data.igResolution ?? DEFAULT_IMAGE_RESOLUTION,
              channel: isApi ? 'api' : 'doubao',
              sourceNodeId,
              providerId: apiProviderId,
            })
          : await generateVideo(deps, {
              accounts: s.accounts,
              poolStrategy: s.poolStrategy,
              accountId: node.data.sendAccount,
              styleIds,
              ratio,
              text: apiText,
              images: refSources,
              model: node.data.model,
              duration: node.data.duration,
              channel: isApi ? 'api' : 'doubao',
              sourceNodeId,
              providerId: apiProviderId,
              providerName: apiProviderName,
              rawText: text,
            });

      const now = ports.clock.now();
      if (!res.ok) {
        // ★ 原样写进 backendErrors（原则 6）—— 同上，走唯一写入口
        store.useStore.getState().patchNodeData(nodeId, { generating: false });
        store.useStore.getState().pushBackendError('unknown', res.message);
        return false;
      }

      // 成功：把结果落到节点（`imggen` 写 results / `genvideo` 写 resultUrl）
      const first = res.value.results?.[0];
      if (node.type === 'imggen') {
        const prev = node.data.results ?? [];
        store.useStore.getState().patchNodeData(nodeId, {
          generating: false,
          ...(first ? { results: [...prev, first], resultUrl: first.ref } : {}),
        });
      } else {
        store.useStore.getState().patchNodeData(nodeId, {
          generating: false,
          ...(first ? { resultUrl: first.ref, resultAt: now } : {}),
        });
        // ★ 视频本地化（源 `_Component43.jsx:3160`：写完 `attempt.url` 后**立刻** `localizeNodeVideos`）
        //   链 18（`docs/10` #9）「视频必须落盘」；`void` 调 —— 落盘是收尾，不该拖住"生成成功"的返回
        void localizeNodeInto(store, ports, nodeId);
      }

      // ★ 「发送后监测」（原 `_Component43.jsx:3010`：发送链尾部起 `watchSendReply`）
      //   网页通道发送成功 ⇒ 后台监测 180s（已接单 / 预计等待 / 额度 / 回复通知）。
      //   ⚠️ `void` 调 —— 监测最长 180s，**绝不能**拖住"发送成功"这条主链的返回。
      //   ⚠️ **只有网页通道**：源的 `watchSendReply` 挂在 `gt`（网页发送）上，API 通道另有一条链。
      if (res.value.via === 'web' && res.value.accountId) {
        sendWatch?.start({ nodeId, accountId: res.value.accountId, ownText: text });
      }
      return true;
    },

    /**
     * ★ **批量出片**（原 `Z3_1.jsx:856-944` 的 `st`）
     *
     * 顺序（逐行对源）：
     *   ① 提示词为空 ⇒ `请先输入提示词`（warn）并返回；
     *   ② 无可用视频 provider ⇒ `没有可用的 API 服务商…`（warn, 4500）并返回；
     *   ③ `submitApiBatch(base, 三比例矩阵)`；
     *   ④ 失败 ⇒ `批量提交失败：<原文>`（error, 5000，**原文透传**，原则 6）；
     *   ⑤ 成功 ⇒ 把 `apiJob`（`{jobId, providerId, providerName, status:'queued', kind:'video', batch:true}`）
     *      落节点 + `已批量提交 N 个任务（多比例 · 名称），出片后自动连到本节点`（success）。
     *
     * ⚠️ 源版把「提交 + 落点」都写在组件里；本工程按原则 1 收进 `state`（唯一写 store 处）。
     * ⚠️ `count` 用**过滤掉 null 之后**的条数（后端逐位返回，失败处为 null）。
     */
    async runVideoBatchForNode(nodeId) {
      const s = store.useStore.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node || node.type !== 'genvideo') {
        store.useStore.getState().pushBackendError('unknown', `节点不存在：${nodeId}`);
        return false;
      }

      // ① 提示词守卫（源 857-860）
      if (!node.data.text.trim()) {
        store.useStore.getState().pushToast(GEN_PANEL_TEXT.batchNoPrompt, 3000, 'warn');
        return false;
      }

      // ② provider 守卫（源 861-864）—— 解析走纯规则
      const providerId = resolveApiProviderId('video', s.apiProvidersMeta, s.apiConfigs, s.apiSetup);
      if (!providerId) {
        store.useStore.getState().pushToast(GEN_PANEL_TEXT.batchNoProvider, 4500, 'warn');
        return false;
      }
      const providerName = s.apiProvidersMeta.find((p) => p.id === providerId)?.name ?? '';

      // ③ 提交（三比例）
      // ★ 与 `runForNode` 的 API 分支**同一套**引用改写 + 参考图采集（源 `st` 与 `lt` 是同一段逻辑）
      const rawText = node.data.text;
      const refs = parseRefChips(stripHtml(rawText));
      const res = await generateVideo(deps, {
        accounts: s.accounts,
        poolStrategy: s.poolStrategy,
        accountId: node.data.sendAccount,
        styleIds: node.data.styleIds ?? [],
        ratio: node.data.aspectRatio,
        text: refsToRawNames(refs.text, refs.refs),
        images: refs.refs
          .map((r) => resolveRefMaterial(r.id, s.library, s.nodes).dataUrl)
          .filter((u) => !!u),
        duration: node.data.duration,
        channel: 'api',
        batch: true,
        providerId,
        providerName,
        rawText,
        sourceNodeId: nodeId,
      });

      // ④ 失败 ⇒ 原文透传（源 941-943 的 `批量提交失败：${error}`）
      if (!res.ok) {
        store.useStore.getState().pushToast(GEN_PANEL_TEXT.batchFailed(res.message), 5000, 'error');
        return false;
      }
      const batch = res.value.batch;
      if (!batch) {
        // 结构上不可达（`batch:true` + `channel:'api'` 必回 `batch`）—— 真出现就是契约漂移，如实报
        store.useStore.getState().pushToast(
          GEN_PANEL_TEXT.batchFailed(COMMON_TEXT.unknownReason),
          5000,
          'error',
        );
        return false;
      }

      // ⑤ 落点（源 928-940）
      const landing = planVideoBatchLanding(batch, { id: providerId, name: providerName });
      store.useStore.getState().patchNodeData(nodeId, { apiJob: landing.apiJob });
      store.useStore.getState().pushToast(
        GEN_PANEL_TEXT.batchSubmitted(landing.count, providerName),
        3000,
        'success',
      );
      return true;
    },
  };
}

/**
 * ★ **2026-10-11：本地 `stylePrefixOf` 已删除**（`TD-07-1` 清场）
 *
 * 原实现住在这里（`state`），被判「业务逻辑住 state（§5.3 组装提示词违规）」。
 * 它其实是**纯字符串拼接** ⇒ 已收口到 `core/rules/style.ts` 的 `stylePrefixOf(ids, styles)`
 * （**逐字对源 `nu`**：逐条去尾标点 → `join('，')` → 末尾再补 `，`）。
 * ⚠️ 语义有**一处实质变化**：原来只认 `DEFAULT_STYLE_PRESETS`（内置表）⇒ **用户自建风格永远拼不出前缀**；
 *    现在按源版查 **store 的 `styles`** ⇒ 自建风格生效。
 */
