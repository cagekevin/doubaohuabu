/**
 * 冻结数据格式（★ SSOT：所有「一旦发版不能再动」的字符串/结构的唯一真源）
 *
 * 依据：docs/05-配置契约层.md §六「存储契约」+ docs/过程.md §0.8 §0.9
 * 铁律：**老用户数据必须能直接读**（docs/08 W2，P0）
 *
 * ⚠️ 本目录（`stable/contracts/`）是**唯一**允许出现这些字面量的地方
 */

/**
 * ★ **后台 webview 容器的 DOM 钩子类名**（原 `_Component43.jsx:3272` 的 `doubao-view-webviews`）
 *
 * ⚠️ 它是**跨层契约**：`ui/panels/BackendView` **挂**它、`adapters/site/shared/webview.ts`
 *    的 `findWebview` **找**它 ⇒ **必须唯一**（两处各写一份字面量正是母体 M3 的老路）。
 * ⚠️ 住这里的原因：`^doubao-[a-z0-9-]+$` 形态的字符串被 eslint「原则5」限定只能出现在
 *    `stable/contracts/`（它是**冻结契约串**，与 `PROTOCOL_IMG` 同族）。
 * ⚠️ **2026-10-11 修正**：此前 `BackendView` 挂的是 **CSS-module 哈希类**，而 `webview.ts`
 *    找的是**字面量** ⇒ 该定位**恒为 `null`**，只靠 `|| document` 的静默兜底才"看起来能用"
 *    （**假定位 + 静默兜底**；已登记并清偿）。
 */
export const WEBVIEWS_HOST_CLASS = 'doubao-view-webviews';

/** 自定义协议前缀（原 `img://` / `vid://` / `appasset://`） */
export const PROTOCOL_IMG = 'img://';
/**
 * ⚠️ 这里**没有** `PROTOCOL_VID` —— `vid://` 由**宿主独占**：主进程产生引用
 *   （`main.js:787` 返回 `{ref: 'vid://<sha1>.mp4'}`）并注册 handler 供给（`main.js:1017-1059`）；
 *   前端把该引用当**不透明串**渲染，从不自己拼 / 拆它 ⇒ 前端不需要这个常量（曾误判为"前端使用"）。
 */

/**
 * `appasset://` —— ★ **不是前端业务协议**，是主进程**专为 MediaPipe 人脸检测**注册的特权 scheme
 * （`main.js:652-656` 注册 + `main.js:1060-1098` handler）：
 * `appasset://mediapipe/vision_wasm_internal.wasm` → `dist/mediapipe/vision_wasm_internal.wasm`。
 *
 * 为什么要它：生产环境页面由 `file://` 加载，而 Chromium **禁止 `file://` 页面 fetch 本地文件**
 * ⇒ MediaPipe 无法据此加载 wasm；故由主进程读盘返回，并给正确的 `application/wasm` MIME
 * （**流式编译校验 MIME，错了会拒绝编译**）。
 *
 * ⚠️ 前端**只**在 `adapters/media/faceDetect.ts` 里拼这个 URL（M10），**不要**当业务协议用。
 */
export const PROTOCOL_APPASSET = 'appasset://';

/** 缩略图查询参数（原 handler `?w=N`） */
export const THUMB_QUERY_KEY = 'w';

/** 旧单工程迁移后的名字（真值在用户数据里：`p_migrated` 那条 id 由后端写，前端 0 消费 ⇒ 不留常量） */
export const LEGACY_PROJECT_NAME = '导入的项目';

/** 工程 id 前缀（原 `Pt('p')` → `p_<base36>_<计数>`） */
export const PROJECT_ID_PREFIX = 'p_';

/**
 * 账号导出文件格式版本（原 `PP.jsx:76` 的 `version: 1`）
 * ⚠️ 导入侧同时接受「带 `accounts` 的对象」与「裸数组」两种历史格式（原 `OP.jsx:607`）。
 */
export const ACCOUNTS_EXPORT_VERSION = 1;

/**
 * 导入账号时补的会话分区前缀（原 `OP.jsx:636` 的 `persist:import_`）
 * ⚠️ 分区名会**落进账号数据**（`doubao-accounts`）⇒ 属冻结契约。
 */
export const IMPORTED_PARTITION_PREFIX = 'persist:import_';
/** 账号 id 前缀（原 `acc_<base36>`） */
export const ACCOUNT_ID_PREFIX = 'acc_';
/** 预设 id 前缀（原 `pre_...`） */
export const PRESET_ID_PREFIX = 'pre_';
/** 素材库 id 前缀（原 `lib_...`） */
export const LIBRARY_ID_PREFIX = 'lib_';
/**
 * ⚠️ **`IMAGE_GEN_FEED_ID_PREFIX = 'ig_'` 已删**（`TD-01-7`）：它与
 *   `core/rules/project.ts` 的 `ID_PREFIX.imggen`（`'ig'`）**同值**（母体 M3）。
 *   ⇒ `imageGenFeed` 的项 id **复用节点那一份**（`makeId('imggen', …)`，原 `Pt('ig')`）。
 */
/** 连线 id 前缀（原 `e_...`） */
export const EDGE_ID_PREFIX = 'e_';
