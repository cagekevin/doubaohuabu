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
// ★ 默认通道的唯一真源（数据层：`core/model/defaults`）—— 本层不写通道字面量
import { DEFAULT_CHANNEL } from '@/core/model/defaults';
import type { AppStore } from './store';
import { sendToSiteDeps } from './sendDeps';
import { generateImage, generateVideo, type GenDeps } from '@/core/usecases/generate';
import type { SendWatchController } from './sendWatch';
import type { PostSendDetectController } from './postSendDetect';
import type { DolaMediaController } from './dolaMedia';
import type { PendingAttemptController } from './pendingAttempt';
import type { AutoConfirmController } from './autoConfirm';
// ★ 「发送 ＋ 生成确认」的共享实现（源 `sendPayload` 的发送半）—— 三条发送路**同一份**
import { sendWithConfirm, type SendConfirmDeps } from './sendWithConfirm';
import { countUsable } from '@/core/rules/accountPool';
import { busyIdsOf } from '@/core/rules/accountBusy';
import { resolveApiProviderId } from '@/core/rules/apiProvider';
import { planVideoBatchLanding } from '@/core/rules/apiBatch';
import { FAIL_LABEL } from '@/constants/failure';
import { DEFAULT_IMAGE_RESOLUTION } from '@/constants/models';
import { clampImageCount, resolveRefMaterial } from '@/core/rules/prompt';
import type { ImageGenParams } from '@/core/rules/imageGenKey';
import { imageGenJobId } from '@/core/rules/imageGenKey';
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
  /** ★ 「发送后检测」控制器（BP-08：视频发完即返回 ⇒ 交它异步检测出片）—— 单例，由 `container` 注入 */
  postSendDetect?: PostSendDetectController,
  /** ★ CDP 待归属队列（无 `detectVideos` 能力的站点走它）—— 单例，由 `container` 注入 */
  dolaMedia?: DolaMediaController,
  /** ★ 待归属尝试写入器（原 `sendPayload` 的两处写入）—— 单例，由 `container` 注入 */
  pendingAttempt?: PendingAttemptController,
  /**
   * ★ **「生成确认」控制器**（原 `kt` / `autoConfirm`）—— 单例，由 `container` 注入。
   * ⚠️ 缺省 ⇒ **不挂 `onSend`**（发送照旧，只是**不起生成确认**）—— 只给"只发不确认"的调用方留口。
   */
  autoConfirm?: AutoConfirmController,
): GenController {
  /**
   * 尝试 id 的自增段（原 `O$` 的模块级计数器 `Oy`）
   *
   * ⚠️ 放在**控制器闭包**里而不是模块级 —— 本仓 `test.isolate: false`（见 `vite.config.ts`），
   *    模块级可变状态会**跨测试文件泄漏**。
   */
  let attemptSeq = 0;

  /**
   * ★★ 「发送 ＋ 生成确认」的共享依赖（源 `sendPayload` 的发送半）—— 三条发送路**同一份**
   *   （`state/sendWithConfirm.ts`）。缺 `autoConfirm` ⇒ 不挂 `onSend`（发送照旧，只是不起确认）。
   */
  const confirmDeps: SendConfirmDeps | null = autoConfirm
    ? { store, ports, autoConfirm, ...(pendingAttempt ? { pendingAttempt } : {}) }
    : null;

  const deps: GenDeps = {
    // `sites` / `backendPage` / `holdAccount` / `releaseAccount` 走**唯一组装点**（`./sendDeps`）
    ...sendToSiteDeps(store, ports),
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
    // ★ TD-02-16：选号必须**实时**知道哪些账号在忙（用例跨重试多次选号）
    busyIds: () => busyIdsOf(store.useStore.getState().accountBusy, ports.clock.now()),
    /**
     * ★★ **发送半**（原 `sendPayload`，`_Component43.jsx:2838-3005`）——
     *   `读基线 → 发送 → 写 _pendingAttempt → 起生成确认`。
     *   收在 `state/sendWithConfirm`（三条发送路**共用一份**，判据 C1）。
     *
     * ⚠️ `writeAttempt`：源对**网页文生图**传的 `sourceNodeId` 是 `'imggen:' + key`
     *    （`shared.js:42921`）⇒ `updateNodeData` 找不到节点 ⇒ **空写**；本仓那两处传的是真节点 id
     *    ⇒ 只对 `genvideo` 写（与源等价）。
     */
    onSend: confirmDeps
      ? async ({ accountId, payload, sourceNodeId, send }) => {
          const nodeId = sourceNodeId ?? '';
          const st = store.useStore.getState();
          const account = st.accounts.find((a) => a.id === accountId);
          // 账号在"选号"与"发送"之间被删 ⇒ 直发（不因缺上下文漏发）
          if (!account) return send();
          const node = nodeId ? st.nodes.find((n) => n.id === nodeId) : undefined;
          return sendWithConfirm(confirmDeps, {
            account,
            payload,
            nodeId: nodeId || null,
            send,
            writeAttempt: node?.type === 'genvideo',
          });
        }
      : undefined,
  };

  return {
    async runForNode(nodeId) {
      const s = store.useStore.getState();
      const node = s.nodes.find((n) => n.id === nodeId);
      if (!node) {
        // ★ 经**唯一写入口** `pushBackendError`（带 kind 去重 + 统一 id）
        //   —— ⛔ 不得直改 `setState` 绕过它（TD-07-2）
        store.useStore.getState().pushBackendError('unknown', GEN_PANEL_TEXT.nodeMissing(nodeId));
        return false;
      }
      if (node.type !== 'imggen' && node.type !== 'genvideo') {
        store.useStore.getState().pushBackendError('unknown', GEN_PANEL_TEXT.nodeTypeUnsupported(node.type));
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

      // 标记「生成中」—— ★ **只有 `imggen`**：源里 `generating` 只服务文生图
      //   （写 `_Component45:740` · 读 `ZL.jsx:230/256` · 清 `shared.js:27277`）；
      //   `genvideo` 的「生成中」由 `m`（`apiJob`/`_pendingAttempt`）推导，**不写这个布尔**。
      if (node.type === 'imggen') {
        store.useStore.getState().patchNodeData(nodeId, { generating: true });
      }

      /** `genvideo` 分支的数据（`sendGenVideo` 在这个分支里被调；提到外面会丢类型收窄） */
      const videoData = node.type === 'genvideo' ? node.data : undefined;

      /**
       * 发一次**网页通道的视频**（原 `gt` 里的发送）—— 首次发送与**换号重发共用**同一条。
       * ★ 它留在本文件（**发送源头**）：`sendWatch` 只拿这个回调去"换个账号再发一次"，
       *   自己**不碰 payload**（不越权）。
       */
      const sendGenVideo = (accountId: string | undefined) =>
        generateVideo(deps, {
          accounts: s.accounts,
          poolStrategy: s.poolStrategy,
          accountId,
          styleIds,
          ratio,
          text: apiText,
          images: refSources,
          // 这里脱离了 `node.type === 'genvideo'` 的收窄 ⇒ 显式取一次（它只在这个分支被调）
          model: videoData?.model,
          duration: videoData?.duration,
          channel: isApi ? 'api' : DEFAULT_CHANNEL,
          sourceNodeId,
          providerId: apiProviderId,
          providerName: apiProviderName,
          rawText: text,
        });

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
              channel: isApi ? 'api' : DEFAULT_CHANNEL,
              sourceNodeId,
              providerId: apiProviderId,
            })
          : await sendGenVideo(node.data.sendAccount);

      if (!res.ok) {
        // ★ 原样写进 backendErrors（原则 6）—— 同上，走唯一写入口
        store.useStore.getState().patchNodeData(nodeId, { generating: false });
        store.useStore.getState().pushBackendError('unknown', res.message);
        return false;
      }

      // 成功：`imggen` 落结果（网页通道走 `addImageGenResult` 查表回填；API 通道经 `onJobEvent` 异步回来）
      if (node.type === 'imggen') {
        const count = clampImageCount(node.data.imageCount);
        /** 提交参数（原 `_Component45.jsx:900-909` 的 `fe`）—— 网页/API 两通道共用 */
        const genParams: ImageGenParams = {
          text: apiText,
          channel: isApi ? 'api' : DEFAULT_CHANNEL,
          aspectRatio: ratio ?? '',
          styleIds,
          imageCount: count,
          igModel: node.data.igModel ?? '',
          igResolution: node.data.igResolution ?? DEFAULT_IMAGE_RESOLUTION,
          sendAccount: node.data.sendAccount,
        };

        if (res.value.via === 'web') {
          // ★ BP-03：网页通道（原 `_Component45.jsx:1032` + `DR`）—— `bindImageGenKey`（key → 节点 +
          //   期望张数 + 提交参数）＋ 每张结果走 `addImageGenResult`（按 key 反查节点 + 查表回填 + 去重）；
          //   CDP 推送作补充（同键去重协调）。
          const key = res.value.key;
          if (key) {
            store.useStore.getState().bindImageGenKey(key, nodeId, count, genParams);

            for (const r of res.value.results ?? []) {
              store.useStore.getState().addImageGenResult({
                key: r.genKey || key,
                dataUrl: r.ref,
                source: r.source,
                accountName: r.accountName,
                accountId: res.value.accountId ?? null,
                ...(r.natW && r.natH ? { natW: r.natW, natH: r.natH } : {}),
              });
            }

            // ★ 登记 CDP 图像任务（后端 CDP 推送补充出片；与 pollResults 靠 `imageGenDeliveredKeys` 去重）
            //   ⚠️ 作业 id = `'imggen:' + key`（原 `shared.js:42921`）—— 源的 CDP 队列就按这个前缀挑图像任务
            if (res.value.accountId) {
              dolaMedia?.registerSent(res.value.accountId, imageGenJobId(key));
            }
          } else {
            // 没有 key（结构上不可达）：只清「生成中」
            store.useStore.getState().patchNodeData(nodeId, { generating: false });
          }
        } else if (res.value.via === 'api' && res.value.batch) {
          // ★ BP-03：API 通道提交成功 ⇒ 绑定 `jobId[] → 节点 + 提交参数`（原 `bindImageGenJobs`，
          //   `_Component45.jsx:955`）—— 结果到达时 `attachImageResultToNode` 按 `genKey || jobId`
          //   查表回填 `params` 并删键（否则历史版本的参数只能拿节点**当前值**兜底，不是提交值）。
          const jobIds = res.value.batch.jobIds.filter((id): id is string => Boolean(id));
          if (jobIds.length > 0) {
            store.useStore.getState().bindImageGenJobs(jobIds, nodeId, genParams);
          }
        }

        // ★ BP-44：网页通道 timeout 且 0 结果 ⇒ 清「生成中」+ 提示「等待超时」（原 `_Component45.jsx:1093-1095`）
        if (res.value.via === 'web' && res.value.endReason === 'timeout' && !res.value.results?.length) {
          store.useStore.getState().patchNodeData(nodeId, { generating: false });
          const acc = res.value.accountId
            ? store.useStore.getState().accounts.find((a) => a.id === res.value.accountId)
            : undefined;
          store.useStore.getState().pushToast(
            // ★ 只给**站点类型**，站点名与文案由 `constants` 决定（本层零站点名、零文案）
            GEN_PANEL_TEXT.genTimeout(acc?.type ?? ''),
            5000,
            'warn',
          );
        }
      }
      // ★ BP-08：`genvideo` 发完即返回（`results` 恒空）⇒ **不写 `resultUrl` / 不清 `generating`**，
      //   等 `postSendDetect` 异步检测出片后由 `addVideoNode` 落（resultUrl + generating:false + 本地化）。

      // ★ 「发送后监测」（原 `_Component43.jsx:3010`：发送链尾部起 `watchSendReply`）
      //   网页通道发送成功 ⇒ 后台监测 180s（已接单 / 预计等待 / 额度 / 回复通知）。
      //   ⚠️ `void` 调 —— 监测最长 180s，**绝不能**拖住"发送成功"这条主链的返回。
      //   ⚠️ **只有网页通道**：源的 `watchSendReply` 挂在 `gt`（网页发送）上，API 通道另有一条链。
      if (res.value.via === 'web' && res.value.accountId) {
        sendWatch?.start({
          nodeId,
          accountId: res.value.accountId,
          // ★ 换号重发的能力**留在发送源头**（本文件持有那次发送的全部参数）
          resend: async (accountId) => (await sendGenVideo(accountId)).ok,
        });
        // ★ BP-08：视频发完即返回 ⇒ 交 `postSendDetect` 异步检测（按站点能力分流，同 `accountOps`）
        if (node.type === 'genvideo') {
          const acc = store.useStore.getState().accounts.find((a) => a.id === res.value.accountId);
          if (acc) {
            if (ports.sites[acc.type]?.detectVideos) {
              postSendDetect?.notifySent({ accountId: acc.id, sourceNodeId: nodeId });
            } else {
              dolaMedia?.registerSent(acc.id, nodeId);
            }
          }
        }
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
        store.useStore.getState().pushBackendError('unknown', GEN_PANEL_TEXT.nodeMissing(nodeId));
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
