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
import { createCanvasSlice, type CanvasSlice } from './slices/canvas';
import { createGlobalSlice, type GlobalSlice, type GlobalSliceDeps } from './slices/global';
import { createUiSlice, type UiSlice, type UiFlagKey } from './slices/ui';
import { PERSIST } from './persistKeys';
import { createQueueSlice, type QueueSlice } from './slices/queue';
import { createGallerySlice, type GallerySlice } from './slices/gallery';
import { createScanSlice, type ScanSlice } from './slices/scan';
import { createSettingsSlice, type SettingsSlice } from './slices/settings';
import { isInlineImage } from '@/stable/protocols/img';

export type AppState = GlobalSlice & CanvasSlice & UiSlice & SettingsSlice & QueueSlice & GallerySlice & ScanSlice;

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
    return r.ok ? r.value : url;
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
        const touchesCanvas = 'nodes' in partial || 'edges' in partial || 'library' in partial;
        /**
         * ★ **同一批里换了 `activeId` ⇒ 绝不镜像**（`docs/14` §2 的 ⭐⭐ 数据损坏 bug）
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
        return {
          ...partial,
          projects: s.projects.map((p) =>
            p.id === s.activeId ? { ...p, data: { ...p.data, nodes, edges, library } } : p,
          ),
        } as AppState;
      });
    const getState = () => get() as AppState;

    return {
      ...createGlobalSlice(setPartial, getState, { now: () => ports.clock.now(), roster: deps.roster }),
      ...createCanvasSlice(setPartial, getState, {
        now: () => ports.clock.now(),
        makeEdge: (conn) => ({
          id: `e_${ports.clock.now().toString(36)}_${++edgeSeq}`,
          source: conn.source,
          target: conn.target,
          type: 'interactive',
          style: { ...EDGE_STYLE },
          markerEnd: { ...EDGE_MARKER },
        }),
        // ⚠️ 与下面的 `GallerySliceDeps.normalizeImage` 是**同一个东西**（原 `Tn`）
        persistImage,
      }),
      // ★ UI 开关（折叠 / 只留本画布）的读写在 `persistKeys` 的**唯一落点**上（原版直接 `localStorage`）
      ...createUiSlice({
        now: () => ports.clock.now(),
        readFlag: (key: UiFlagKey) => PERSIST[key].read(ports.storage) === '1',
        writeFlag: (key: UiFlagKey, value: boolean) => {
          PERSIST[key].write(ports.storage, value ? '1' : '0');
        },
      })(setPartial, getState),
      ...createQueueSlice(() => ports.clock.now())(setPartial, getState),
      // ★ Lovart 画廊（独立成片，见 slices/gallery.ts 头注释）。
      //   ⚠️ `normalizeImage` 与 `canvas` 的 `persistImage` 是**同一实现**（原 `Tn`）⇒ 共用上面那个闭包。
      ...createGallerySlice({
        now: () => ports.clock.now(),
        idFactory: () => `lg_${ports.clock.now().toString(36)}_${++lgSeq}`,
        normalizeImage: persistImage,
      })(setPartial, getState),
      // ★ 指纹体检历史（独立成片，见 slices/scan.ts 头注释）
      ...createScanSlice(() => ports.clock.now())(setPartial, getState),
      // ★ settings：API 配置族（判据 C2 —— `global` 超 25 字段即按共享范围再分）
      ...createSettingsSlice(setPartial, getState),
    };
  });

  return { ports, useStore };
}
