/**
 * 组装容器（★ 唯一知道「用哪个 adapter」的地方）
 *
 * 依据：docs/11 §3.2 + 技能 `vercel-composition-patterns` 的 `state-context-interface`
 *
 * ⚠️ 这是**唯一**允许 import 全部层的地方（见 .dependency-cruiser.cjs）
 * ⚠️ 端口注入到 **state / usecases**，**不是 core**（core/rules 是纯函数，不需要注入）
 */

import type { Ports } from '@/core/ports';
import { createAppStore, type AppStore } from '@/state';
import { createPersistController, type PersistController } from '@/state/persist';
import { createSystemClock } from '@/adapters/clock/system';
import { createLocalStorage } from '@/adapters/storage/local';
import { createMockHost } from '@/adapters/host/mock';
import { createElectronHost } from '@/adapters/host/electron';
import { createSiteRegistry } from '@/adapters/site/registry';
import { createBackendPage } from '@/adapters/site/shared/backendPage';
import { activateProjectStorage } from '@/core/usecases/projectStorage';
import { hydrate, type HydrateResult } from './hydrate';
import { createGenController, type GenController } from '@/state/generate';
import { createAnalyzeController, type AnalyzeController } from '@/state/analyze';
import { createAccountOps, type AccountOpsController } from '@/state/accountOps';
import { createBatchSendController, type BatchSendController } from '@/state/batchSend';
import { createSendQueueController, type SendQueueController } from '@/state/sendQueue';
import { createCaptureController, type CaptureController } from '@/state/capture';
import { createLicenseOps, type LicenseOpsController } from '@/state/licenseOps';
import { createHostOps, type HostOpsController } from '@/state/hostOps';
import { createLocalizeOps, localizeNodeInto, type LocalizeOpsController } from '@/state/localizeOps';
import { VIDEO_BACKFILL_DELAY_MS } from '@/constants';
import { createProjectOps, type ProjectOpsController } from '@/state/projectOps';
import { createApiOps, type ApiOpsController } from '@/state/apiOps';
import { createPullResultController, type PullResultController } from '@/state/pullResult';
import { createSendWatchController } from '@/state/sendWatch';
import { createPostSendDetect } from '@/state/postSendDetect';
import { createDolaMedia } from '@/state/dolaMedia';
import { createAutoConfirm } from '@/state/autoConfirm';
import { createPendingAttempt } from '@/state/pendingAttempt';
import { sleep } from '@/lib/async';
import { makeAttemptId } from '@/core/rules/genHistory';
import { readChromeMajor, readHostOs, readRealGpu, readRealViewport } from '@/adapters/host/shared/env';
import { filterWinScreens, filterWinWebgl } from '@/core/rules/fingerprintGenerator';
import { createSubscriptions, type Subscriptions } from '@/state/subscriptions';

/** 是否运行在 Electron 宿主里（有 `window.api` 即真实宿主） */
export function hasElectronHost(): boolean {
  return typeof window !== 'undefined' && typeof (window as { api?: unknown }).api === 'object';
}

/**
 * 组装端口
 *
 * ★ **真实宿主优先**：在 Electron 里用 `adapters/host/electron`（唯一接触 `window.api` 的地方），
 *   否则回落 `adapters/host/mock`（纯浏览器可开发，docs/11 §二）。
 */
export function createPorts(): Ports {
  // ⚠️ 站点适配器**注入 HostPort**（不得直调 window.api —— TD-05-1）
  const host = hasElectronHost() ? createElectronHost() : createMockHost();
  // ⚠️ `storage` 必须先建：站点适配器也要它（豆包 / Dola 的**跨会话去重表** —— 原 `TR`/`PR`）
  const storage = createLocalStorage();
  return {
    host,
    // ★ 站点注册表（doubao / dola / lovart）；未实现的站点**缺项** ⇒ 调用方报明确错误
    sites: createSiteRegistry(host, storage),
    storage,
    clock: createSystemClock(),
    // ★ 后台页（账号 `<webview>` 的租约 / 就绪 / 命令）—— 原版是组件间注册表，本工程提成端口
    backendPage: createBackendPage(),
  };
}

export interface Container {
  store: AppStore;
  ports: Ports;
  /** 生成控制器（state 层） */
  gen: GenController;
  analyze: AnalyzeController;
  accountOps: AccountOpsController;
  batchSend: BatchSendController;
  sendQueue: SendQueueController;
  capture: CaptureController;
  /** 授权控制器（激活页 / 授权门 —— 收窄 ui 对 `usePorts()` 的使用，TD-16-8） */
  licenseOps: LicenseOpsController;
  /** 宿主能力控制器（拖出文件 / 剪贴板 —— 同批收窄 `ui` 对 `usePorts()` 的使用，TD-16-8） */
  hostOps: HostOpsController;
  /** 工程操作控制器（导入工程 —— 接 `core/usecases/importProject`，此前 0 生产消费） */
  projectOps: ProjectOpsController;
  /** API 配置控制器（provider / 密钥 / 测试连接；原 `_Component46` 直调 `window.api` 的收口） */
  apiOps: ApiOpsController;
  /** ★ 「拉取结果」控制器（接 `core/usecases/fetchWatermarkFree`，此前 0 生产消费） */
  pullResult: PullResultController;
  /** 视频本地化控制器（★ `core/usecases/localizeVideos` 的唯一调用方 —— 链 18「视频必须落盘」） */
  localizeOps: LocalizeOpsController;
  /**
   * ★ 启动后 **5s** 回填视频直链（源 `_Component48.jsx:92-99`）
   * ⚠️ 走注入时钟（原则 4）；由 `main.tsx` 在 `hydrate()` 之后调一次
   */
  startVideoBackfill: () => void;
  /**
   * 启动加载（读键 + **启动归位** + 灌 store）
   * ⚠️ 迁移只剩两条：图片外置（落盘时跑）与 `resetStaleJobs`（每次启动跑）。
   */
  hydrate(): HydrateResult;
  /** 持久化调度器（防抖 600ms + beforeunload） */
  persist: PersistController;
  /** ★ 宿主事件订阅（**唯一写入点** —— 判据 D2） */
  subscriptions: Subscriptions;
}

export function createContainer(): Container {
  const ports = createPorts();
  // ⚠️ 先在前面解构 —— 下面的 `roster` 闭包要用 `host.os`（放在后面虽也能跑，
  //    但"引用了尚未声明的绑定"读起来像 bug）
  const { host, storage, clock } = ports;
  // ★ 账号新增所需的环境（**getter**：源版就是调用时才读 `Uc()`/`M$()`/`$$()`）
  //   ‣ `os` 取 `host.os`（preload 的 `process.platform`，**不读 navigator**）
  //   ‣ 其余三项是**渲染层自己的**读数（UA / 窗口尺寸 / 真实 GPU）⇒ 归 `adapters/host/shared/env`
  const roster = () => {
    const vp = readRealViewport();
    return {
      os: readHostOs(host.os),
      chromeMajor: readChromeMajor(),
      winScreens: filterWinScreens(vp.w, vp.h),
      winWebgl: filterWinWebgl(readRealGpu()),
    };
  };

  const store = createAppStore(ports, {
    roster,
    /**
     * ★ **视频本地化**（写视频 `url` 之后的收尾，见 `CanvasSliceDeps.localizeVideoNode`）
     *
     * ⚠️ **`localizeNodeInto` 的全仓唯一调用点** —— 它同时需要 `store`（写回）与 `ports`（落盘），
     *   而 `state/store` 自己 import 它会成环（`store ⇄ localizeOps`）⇒ 只能在这里注入。
     * ⚠️ `store` 在**定义期**仍处 TDZ，但闭包只在**调用期**读它（同下面 `logOperation`）。
     */
    localizeVideoNode: (id) => void localizeNodeInto(store.useStore, ports, id),
    /**
     * ★ **操作日志**（原 `commit` 尾部的 `window.api.logProjectOperation`，`shared.js:26912-26928`）
     *
     * ⚠️ 源的守卫与取数都在 `commit` 里现读 store（`storagePath` 非空才记 · `projectId = activeId`）
     *   —— 本仓把这两件放在这里，`canvas` slice 不必为它扩 `get()` 的跨片类型。
     * ⚠️ 原则 6：源那里是 `try{}catch{}` **静默** ⇒ 本仓失败**上报**（错误横幅）。
     */
    logOperation: (e) => {
      const s = store.useStore.getState();
      const active = s.projects.find((p) => p.id === s.activeId);
      if (!active?.storagePath) return;
      const r = host.project.logOperation({ ...e, projectId: s.activeId ?? '' });
      if (!r.ok) s.pushBackendError('unknown', r.message);
    },
    /**
     * ★ **激活工程存储目录**（原 `window.api.activateProjectStorage`，**`sendSync`**）
     *
     * ⚠️ 源在 **5 处**调：createProject（29843）· openProject（29887）· renameProject（30077）
     *   ＋ `deleteProject`（30128）/ `showStartup`（30148）那两处传 `{ storagePath: '' }`（**清空**）。
     */
    activateStorage: (project) =>
      project
        ? activateProjectStorage({ project: ports.host.project }, project, store.useStore.getState().projects)
        : ports.host.project.activateStorage({ projectId: '', projectName: '', storagePath: '' }),
    /** 立即落盘（源 `showStartup` 30146 的 `flushPersist()`）—— `persist` 在下面创建（闭包延迟取） */
    flushPersist: () => persist.flush(),
  });

  const persist = createPersistController({
    clock,
    lifecycle: host.lifecycle,
    persist: {
      storage,
      migrationCtx: {
        saveImage: (dataUrl) => host.media.saveImageSync(dataUrl),
        now: () => clock.now(),
      },
      saveBackup: (json) => host.project.saveBackup(json),
      saveSnapshot: (p) => host.project.saveSnapshot(p),
    },
    readState: () => {
      const s = store.useStore.getState();
      return {
        projects: s.projects,
        activeId: s.activeId,
        // ★ 账号族（`docs/过程.md` §2 ⭐：原实现只读不写 ⇒ 账号增删改刷新即丢）
        accounts: s.accounts,
        groups: s.groups,
        proxyPool: s.proxyPool,
        poolStrategy: s.poolStrategy,
        // ★ Lovart 画廊（同账号族：不接这一步就只在内存）
        lovartGalleries: s.lovartGalleries,
        scanHistory: s.scanHistory,
        // ★ 节点 / 提示词预设（同上：不接这一步就只在内存）
        presets: s.presets,
        // ★ 风格预设（`doubao-styles`）：不接这一步 ⇒ 改风格重启即丢
        styles: s.styles,
        // ★ 遮脸参数（`doubao-face-mask-opts`）：同上
        faceMaskOpts: s.faceMaskOpts,
      };
    },
    // 原则 6：错误原样写入 saveError（不改写 message）
    //   ⚠️ 经**具名 action**（`AppStoreHook` 已摘掉 `setState`）—— 顺带清偿 TD-16-5（`setSaveError` 曾是死 action）
    onError: (message) => store.useStore.getState().setSaveError({ message, at: clock.now() }),
    onOk: () => store.useStore.getState().setSaveError(null),
  });

  // ★ 把 persist 接到 store：**只有"该存的数据"变了才安排落盘**
  //   （不订阅 toast 这类纯 UI 状态 —— 避免无意义写盘）
  const pick = (s: ReturnType<typeof store.useStore.getState>) => [
    s.projects,
    s.activeId,
    s.nodes,
    s.edges,
    s.library,
    s.videoShares,
    // ★ 账号族：变了也要安排落盘（否则账号增删改不落盘 —— `docs/过程.md` §2 ⭐）
    s.accounts,
    s.groups,
    s.proxyPool,
    s.poolStrategy,
    // ★ Lovart 画廊：变了也要安排落盘（否则加图/清理都不落盘）
    s.lovartGalleries,
    s.scanHistory,
    // ★ 预设：变了也要安排落盘（否则导入并入的预设不落盘）
    s.presets,
    // ★ 风格预设：变了也要安排落盘（否则改风格 / 恢复默认重启即丢）
    s.styles,
    // ★ 遮脸参数：同上
    s.faceMaskOpts,
  ];
  let last = pick(store.useStore.getState());
  store.useStore.subscribe((s) => {
    const cur = pick(s);
    if (cur.some((v, i) => v !== last[i])) {
      last = cur;
      persist.schedule();
    }
  });

  /**
   * ★ 「CDP 媒体推送」控制器（原 `onDolaMedia` 回调，`_Component43.jsx:130-345`）
   *
   * ⚠️ **先于订阅创建**（订阅要转发给它）＋ **单例**（自己持有待归属队列与已见集合）。
   */
  const dolaMedia = createDolaMedia(store, ports);

  // ★ 宿主事件订阅（唯一写入点）：`onApiJobEvent` → `settings.upsertApiJob`；`onDolaMedia` → `dolaMedia`
  //   —— 原实现适配器早就暴露了订阅，但 state 侧无人订阅 ⇒ API 任务结果回不来（docs/过程.md §4）
  const subscriptions = createSubscriptions(store, ports, { dolaMedia });

  // ★ 视频本地化（`core/usecases/localizeVideos` 的**唯一**接线处 —— 此前 0 调用方：
  //   链 18「视频必须落盘」整条没接，`MediaPort.saveVideoFromUrl` 也一直无人消费）
  const localizeOps = createLocalizeOps(store, ports);
  /**
   * ★ 「发送后监测」控制器（原 `_Component43.jsx:3010` 的 `watchSendReply`）
   *
   * ⚠️ 先于 `gen` 创建（`gen` 要它来在发送成功后起监测）—— 它自己只依赖 `store`/`ports`，
   *   **不反向依赖 `gen`** ⇒ 无环。
   */
  const sendWatch = createSendWatchController(store, ports);
  /**
   * ★ 「发送后检测」控制器（原 `it` / `postSendDetect`，`_Component43.jsx:2943-2955`）
   *
   * ⚠️ **单例**（自己持有「哪个账号在跑 / 待归属任务队列」）⇒ 在此建一次、注入 `accountOps`。
   */
  const postSendDetect = createPostSendDetect(store, ports);
  /**
   * ★ **「生成确认」控制器**（原 `kt` / `autoConfirm`，`_Component43.jsx:1738-2052`）
   *
   * ⚠️ **单例**（自己持有 running / onceKey 两张表 + 独立租约）⇒ 在此建一次、注入 `accountOps`。
   */
  const autoConfirm = createAutoConfirm(store, ports);

  /**
   * ★ **待归属尝试写入器**（原 `_Component43` 的 `sendPayload` 里那两处 `_pendingAttempt(s)` 写入）
   *
   * ⚠️ **单例**：它持有尝试 id 计数器（源 `O$` 的模块级 `Gl`）；在别处现建会让 id 撞车。
   */
  let attemptSeq = 0;
  const pendingAttempt = createPendingAttempt(store, ports, {
    now: () => ports.clock.now(),
    makeAttemptId: () => {
      attemptSeq += 1;
      return makeAttemptId(ports.clock.now(), attemptSeq);
    },
    sleep,
  });

  return {
    store,
    ports,
    gen: createGenController(store, ports, sendWatch, postSendDetect, dolaMedia, pendingAttempt),
    analyze: createAnalyzeController(store, ports),
    accountOps: createAccountOps(store, ports, {
      // ⚠️ 与下面 `capture` 同法：**运行环境在组合根读**，`state` 层不碰 `document`（TD-16-54 的教训）
      //   —— 原 `_Component26` 的 `Ee:478` 用 `document.hidden` 决定「页面隐藏时这一轮不扫」。
      isHidden: () => typeof document !== 'undefined' && document.hidden,
      // ⚠️ 同法：宿主平台在组合根读（`host.os` 来自 preload 的 `process.platform`）
      //   —— `state` 层**不读 `navigator`**（TD-16-54）；供「指纹诊断按钮只在 Windows 显示」
      os: readHostOs(host.os),
      postSendDetect,
      dolaMedia,
      autoConfirm,
      pendingAttempt,
    }),
    batchSend: createBatchSendController(store, ports, pendingAttempt),
    capture: createCaptureController(store, ports, {
      // ⚠️ 运行环境在这里读（`container` 是组合根）—— `state` 层不碰 `window`
      dpr: () => (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1),
    }),
    licenseOps: createLicenseOps(ports),
    hostOps: createHostOps(ports),
    projectOps: createProjectOps(store, ports, {
      // ⚠️ 时序职责走注入：选保存路径前必须先把当前画布落盘（源版 `flushPersist()`）
      flush: () => persist.flush(),
    }),
    apiOps: createApiOps(store, ports),
    pullResult: createPullResultController(store, ports, { postSendDetect }),
    localizeOps,
    /**
     * ★ 启动后 **5s** 回填视频直链（源 `_Component48.jsx:92-99`：挂载 5s 后 `backfillLocalVideos()`）
     *
     * ⚠️ 定时器走**注入时钟**（`ports.clock`，原则 4）；触发方是**组合根**（`main.tsx` 调一次），
     *   **不需要 `ui` 参与** —— 所以不必新增 Context / hook。
     */
    startVideoBackfill: () => {
      ports.clock.setTimeout(() => {
        void localizeOps.backfill();
      }, VIDEO_BACKFILL_DELAY_MS);
    },
    sendQueue: (() => {
      const c = createSendQueueController(store, ports);
      /**
       * ★ **启动队列的泵**（原 `TS` 在进入队列工作台时被调一次）
       * ⚠️ 只在**一次性**的装配处启动 —— 泵自己靠 `schedule()` 的 50ms 节流自触发，
       *   不需要（也不该）由 UI 再起一個定时器。
       */
      c.start();
      return c;
    })(),
    hydrate: () => {
      const r = hydrate(store, ports);
      // ★ TD-06-1：把「读不出来的键」交给 `persist` —— 它**跳过这些键的写回**，
      //   否则下一次防抖写盘就会把**可恢复的坏数据覆盖掉**（真丢数据）。
      persist.setSkipKeys(r.corruptKeys);
      return r;
    },
    persist,
    subscriptions,
  };
}
