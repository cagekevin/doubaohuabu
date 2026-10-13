/**
 * store 组装（zustand 5）
 *
 * 依据：docs/11 §二 / §5
 *   - 单一 store，按**共享范围**切 slice（不是按业务域）
 *   - `bootstrap/container.ts` 是**唯一**注入 ports 的地方
 *
 * ⚠️ 原则 1：**只有 state 能写 store**。usecases / adapters 只能返回 Result，由本层写入。
 */

import { create } from 'zustand';
import type { Ports } from '@/core/ports';
import { EDGE_MARKER, EDGE_STYLE } from '@/constants';
import { createCanvasSlice, type CanvasSlice, type CanvasSliceDeps } from './slices/canvas';
import { createGlobalSlice, type GlobalSlice, type GlobalSliceDeps } from './slices/global';
import { createUiSlice, type UiSlice, type UiFlagKey } from './slices/ui';
import { PERSIST } from './persistKeys';
import { LS_AUTO_VIDEO_DETECT, LS_CANVAS_DEFAULTS } from '@/stable/contracts/keys';
import { makeId } from '@/core/rules/project';
import { createQueueSlice, type QueueSlice } from './slices/queue';
import { createGallerySlice, type GallerySlice } from './slices/gallery';
import { createScanSlice, type ScanSlice } from './slices/scan';
import { createSettingsSlice, type SettingsSlice } from './slices/settings';
import { createStylesSlice, type StylesSlice } from './slices/styles';
import { createFaceMaskSlice, type FaceMaskSlice } from './slices/faceMask';
import { createNodeStatusSlice, type NodeStatusSlice } from './slices/nodeStatus';
import { isInlineImage } from '@/stable/protocols/img';

export type AppState = GlobalSlice &
  CanvasSlice &
  UiSlice &
  SettingsSlice &
  QueueSlice &
  GallerySlice &
  ScanSlice &
  StylesSlice &
  FaceMaskSlice &
  NodeStatusSlice;

/**
 * store 的**对外句柄**类型 —— ★ 结构上**不可写**
 *
 * 原则 1「只有 state 能写 store」的**结构承载**（不是闸）：
 * 对外类型**不含 `setState`** ⇒ 除 `state/**` 的**具名 action** 之外，
 * 任何地方写 `useStore.setState(…)` 都是**编译错误**。
 *
 * ★ 为什么这样最省（vs 加闸）：闸只能事后报红，且「合法通过成本 > 绕行成本」时
 *   反而在教人绕行；**把写能力从类型上摘掉**后，绕过它需要先改类型 —— 成本瞬间倒挂。
 * ★ 顺带保住的两条既有红线：
 *   ① **唯一镜像点**（`setPartial`）：直写 `nodes/edges/library` 会**跳过**
 *      「画布 → 工程」的镜像 ⇒ 刷新即丢 / 切项目串数据（见 `setPartial` 注释）；
 *      摘掉 `setState` 后这条路径**结构上不存在**。
 *   ② 非 state 层不得写 store（`ui` / `adapters` / `usecases` / `bootstrap`）。
 *
 * ⚠️ **写 store 的正确姿势**：调**具名 action**（`setProjects` / `setAccounts` /
 *   `setSaveError` / `pushBackendError` / `loadHydrated` …）——
 *   它们住在 `state/**`，且都经 `setPartial`（镜像点）。
 */
export interface AppStoreHook {
  (): AppState;
  <T>(selector: (state: AppState) => T): T;
  getState(): AppState;
  getInitialState(): AppState;
  subscribe(listener: (state: AppState, prevState: AppState) => void): () => void;
}

export interface AppStore {
  /** 注入的端口（usecases 的依赖来源；state 自身不 import adapters —— 见 .dependency-cruiser.cjs） */
  readonly ports: Ports;
  readonly useStore: AppStoreHook;
}

/**
 * 创建应用 store 所需的**额外注入**（除端口之外的宿主侧输入）
 *
 * ★ 为什么单独一个参数而不塞进 `Ports`：`roster()` 读的是**渲染层自己的**环境
 *   （真实窗口尺寸 / 真实 GPU —— 原 `M$`/`$$` 的输入），它**不经 IPC**，
 *   与「端口＝宿主能力」不是一回事。
 */
export interface AppStoreDeps {
  /** 新增账号所需环境（**getter**：源版就是调用时才读，见 `slices/global.ts`） */
  roster: GlobalSliceDeps['roster'];
  /**
   * ★ **操作日志**（原 `commit` 尾部的 `window.api.logProjectOperation`，`shared.js:26912-26928`）
   *
   * ⚠️ 由 `bootstrap/container` 注入：它补 `projectId` 与「当前工程有保存路径」的守卫，
   *   并把端口失败上报（源那里是 `try{}catch{}` 静默）—— 与 `persistImage` 同法，
   *   `state` 不 import adapters。
   */
  logOperation?: CanvasSliceDeps['logOperation'];
  /**
   * ★ **激活工程存储目录**（原 `activateProjectStorage`）—— 新建 / 打开 / 重命名当前工程时调
   *
   * ⚠️ 由 `bootstrap/container` 注入（它调 `core/usecases/projectStorage.activateProjectStorage`
   *   并补「当前工程列表」）—— 与 `logOperation` 同法，`state` 不 import adapters。
   */
  activateStorage?: GlobalSliceDeps['activateStorage'];
  /** 立即落盘（`PersistController.flush`）—— 回启动页前先落盘（源 `showStartup` 30146） */
  flushPersist?: GlobalSliceDeps['flushPersist'];
}

/**
 * 创建应用 store
 * @param ports 由 `bootstrap/container.ts` 组装并注入
 * @param deps 额外的宿主侧输入（见 `AppStoreDeps`）
 */
export function createAppStore(ports: Ports, deps: AppStoreDeps): AppStore {
  /** 连线 id 序号（原实现用 `Pt('e')` 的计数；这里用闭包序号） */
  let edgeSeq = 0;
  /** 画廊图 id 的序号（原 `Pt('lg')`） */
  let lgSeq = 0;

  /**
   * 图片外置（原 `Tn` 22578-22596）—— **只有内联 base64 图才落盘**，其余原样返回。
   *
   * ⚠️ **2026-10-11 回源纠错**：此前两处调用方都是**无条件**调 `saveImageSync`
   *   ⇒ 已是 `img://` 的引用会被**二次外置**成坏引用（`img://` 不再是合法 dataUrl）。
   *   真判据是 `if (Kh(e) || !fp(e)) return e;` —— `Kh` = 已是 `img://`，`fp` = 是内联 base64
   *   ⇒ 提为协议真源 `stable/protocols/img.ts` 的 `isInlineImage`。
   * ⚠️ `saveImageSync` 是**同步 IPC**（W1 明列的两处 `sendSync` 之一，**不得 await**）；
   *   失败**原样返回入参**（与源 `Tn` 的 `catch { return e }` 同法）。
   */
  const persistImage = (url: string): string => {
    if (!isInlineImage(url)) return url;
    const r = ports.host.media.saveImageSync(url);
    if (r.ok) return r.value;
    // ★ 原则 6 / 母体 M5：落盘失败**不静默** —— 源 `Tn` 的 `catch { return e }` 把失败吞成「回内联」
    //   （后果：大 base64 混进工程 JSON，用户无感；同后端侧 TD-13-7）。本仓保留源的**回内联**行为
    //   （图仍可见），但把失败**如实上报**到错误横幅。
    useStore.getState().pushBackendError('unknown', r.message);
    return url;
  };

  // ★ 显式标成 `AppStoreHook`（对外句柄）⇒ 返回出去的 `useStore` **不带 `setState`**
  //   （`create()` 的返回值本身有 setState，但**类型**上在这里被摘掉 —— 这就是结构收口处）
  const useStore: AppStoreHook = create<AppState>()((set, get) => {
    /**
     * slice 只拿到 set / get，拿不到 ports —— 端口只能经 usecase 使用（原则 1）
     *
     * ★ **画布 → 工程的镜像**（唯一的同步点）
     *   `nodes`/`edges`/`library` 是**画布的实时状态**，而 `projects[activeId].data` 才是
     *   **被持久化的真相**（`usecases/persistProject` 只写 `projects`）。
     *   若两者不同步 ⇒ 画布上的改动**刷新即丢**（W15 实测抓到）。
     *   放在这里而不是各 slice 里：**跨 slice 的一致性只该有一个同步点**。
     */
    const setPartial = (partial: Partial<AppState>) =>
      set((s) => {
        const touchesCanvas = 'nodes' in partial || 'edges' in partial || 'library' in partial || 'videoShares' in partial;
        /**
         * ★ **同一批里换了 `activeId` ⇒ 绝不镜像**（`docs/过程.md` §2 的 ⭐⭐ 数据损坏 bug）
         *
         * 不设这道闸的话：`setActiveId(newId)` 之后任何画布改动都会把**旧画布**
         * 写进**新工程** ⇒ 切项目即串数据。
         * 正解在 `slices/global.ts` 的 `openProject`（它**原子地**把新工程的画布数据带进来）；
         * 这里只是**兜底**，让"忘了带数据"也**不会**造成损坏。
         */
        const switchesProject = 'activeId' in partial && partial.activeId !== s.activeId;
        if (!touchesCanvas || !s.activeId || switchesProject) return partial as AppState;

        const nodes = partial.nodes ?? s.nodes;
        const edges = partial.edges ?? s.edges;
        const library = partial.library ?? s.library;
        const videoShares = partial.videoShares ?? s.videoShares;
        return {
          ...partial,
          projects: s.projects.map((p) =>
            p.id === s.activeId ? { ...p, data: { ...p.data, nodes, edges, library, videoShares } } : p,
          ),
        } as AppState;
      });
    const getState = () => get() as AppState;

    return {
      ...createGlobalSlice(setPartial, getState, {
        now: () => ports.clock.now(),
        roster: deps.roster,
        activateStorage: deps.activateStorage,
        flushPersist: deps.flushPersist,
      }),
      ...createCanvasSlice(setPartial, getState, {
        now: () => ports.clock.now(),
        makeEdge: (conn) => ({
          // ★ **2026-10-12 越权收口**：改走**唯一工厂** `makeId('edge', …)` —— 此前自拼
          //   `e_<base36>_<十进制 seq>`（形状也漂：源 `Pt` 的 seq 段是 base36）
          id: makeId('edge', ports.clock.now(), ++edgeSeq),
          source: conn.source,
          target: conn.target,
          type: 'interactive',
          style: { ...EDGE_STYLE },
          markerEnd: { ...EDGE_MARKER },
        }),
        // ⚠️ 与下面的 `GallerySliceDeps.normalizeImage` 是**同一个东西**（原 `Tn`）
        persistImage,
        logOperation: deps.logOperation,
        // ★ 跨片注入（判据 D1）：`apiLanding.addImageGenResult` 要写 `ui` 的 toast 与 `global` 的占用表。
        //   ⚠️ 经 `getState()` 转发 —— 这两个 action 在**同一批** slice 里定义，构造期拿不到引用，
        //      但调用期 store 已装配完整（与 `videoLanding` 等处的跨片调用同法）。
        pushToast: (message, duration, level) => getState().pushToast(message, duration, level),
        releaseAccount: (accountId) => {
          getState().releaseAccount(accountId);
        },
      }),
      // ★ UI 开关（折叠 / 只留本画布）的读写在 `persistKeys` 的**唯一落点**上（原版直接 `localStorage`）
      ...createUiSlice({
        now: () => ports.clock.now(),
        // ★ TD-06-1：`read` 是三态判别联合 —— 只有 `ok` 且值为 `'1'` 才算开
        readFlag: (key: UiFlagKey) => {
          const r = PERSIST[key].read(ports.storage);
          return r.kind === 'ok' && r.value === '1';
        },
        writeFlag: (key: UiFlagKey, value: boolean) => {
          PERSIST[key].write(ports.storage, value ? '1' : '0');
        },
        /**
         * 画布默认值（原 `NT()`，`shared.js:26491-26503`）—— ★ 2026-10-12
         *
         * ⚠️ 源的三处兜底：`getItem` 抛 / `JSON.parse` 抛 / 结果不是对象 ⇒ **一律** `{model,duration,ratio}` 三空。
         *   本仓 `PERSIST[...].read` **本就是三态**（`TD-06-1`：`ok` / `empty` / `error`）⇒
         *   只有 `ok` 才取值，其余走同一份兜底 —— **不必自己再包 `try`**。
         * ⚠️ 源兜底给的是 `null`（`{model:null,…}`），而本仓契约（`lsValues.ts:27` 的 `CanvasDefaults`）
         *   声明为**非空** `string`/`number` ⇒ 这里兜 `''`/`0`。两者**等价**：消费点都是 `x || 静态默认`
         *   （源 `29440-29442`），`null` 与 `''`/`0` 同为 falsy。
         */
        readCanvasDefaults: () => {
          const r = PERSIST[LS_CANVAS_DEFAULTS].read(ports.storage);
          const v = r.kind === 'ok' ? r.value : null;
          return {
            model: v?.model ?? '',
            duration: v?.duration ?? 0,
            ratio: v?.ratio ?? '',
          };
        },
        writeCanvasDefaults: (value) => {
          PERSIST[LS_CANVAS_DEFAULTS].write(ports.storage, value);
        },
      })(setPartial, getState),
      ...createQueueSlice(() => ports.clock.now())(setPartial, getState),
      // ★ Lovart 画廊（独立成片，见 slices/gallery.ts 头注释）。
      //   ⚠️ `normalizeImage` 与 `canvas` 的 `persistImage` 是**同一实现**（原 `Tn`）⇒ 共用上面那个闭包。
      ...createGallerySlice({
        now: () => ports.clock.now(),
        // ★ **2026-10-12 越权收口**：原在此自拼 `lg_…` —— 改委托唯一工厂
        idFactory: () => makeId('lovartGallery', ports.clock.now(), ++lgSeq),
        normalizeImage: persistImage,
      })(setPartial, getState),
      // ★ 指纹体检历史（独立成片，见 slices/scan.ts 头注释）
      ...createScanSlice(() => ports.clock.now())(setPartial, getState),
      // ★ settings：API 配置族（判据 C2 —— `global` 超 25 字段即按共享范围再分）
      ...createSettingsSlice(setPartial, getState),
      // ★ styles：风格预设族（同为判据 C2 的独立成片，见 slices/styles.ts 头注释）
      ...createStylesSlice({ now: () => ports.clock.now() })(setPartial, getState),
      // ★ faceMask：遮脸族（角标层 / 参数面板 / 检测结果，见 slices/faceMask.ts 头注释）
      ...createFaceMaskSlice()(setPartial, getState),
      // ★ nodeStatus：节点状态族（`TD-16-93` 数据层 —— 通知 / 等待 / 换号 / 计时器 / 检测调试）
      ...createNodeStatusSlice({
        now: () => ports.clock.now(),
        // ★ 自动视频检测开关（原 `autoVideoDetect`，键 `doubao-auto-video-detect`）
        readAutoDetect: () => {
          const r = PERSIST[LS_AUTO_VIDEO_DETECT].read(ports.storage);
          return r.kind === 'ok' && r.value === '1';
        },
        writeAutoDetect: (on: boolean) => {
          PERSIST[LS_AUTO_VIDEO_DETECT].write(ports.storage, on ? '1' : '0');
        },
      })(setPartial, getState),
    };
  });

  return { ports, useStore };
}
