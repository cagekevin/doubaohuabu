/**
 * 冻结数据格式（★ SSOT：所有「一旦发版不能再动」的字符串/结构的唯一真源）
 *
 * 依据：docs/05-配置契约层.md §六「存储契约」+ docs/03-人类版.md §0.8 §0.9
 * 铁律：**老用户数据必须能直接读**（docs/08 W2，P0）
 *
 * ⚠️ 本目录（`stable/contracts/`）是**唯一**允许出现这些字面量的地方
 */

/** 磁盘快照格式标识（原 `main.js:290-328`） */
export const SNAPSHOT_FORMAT = 'doubao-canvas-project';
/** 快照版本（原 `version: 1`） */
export const SNAPSHOT_VERSION = 1;

/** 项目级分类存储的目录名（原 `PROJECT_STORAGE_DIRS`，`main.js:31-41`） */
export const PROJECT_STORAGE_DIRS = {
  engineering: '工程文件',
  data: '项目数据',
  operations: '操作记录',
  cache: '缓存',
  images: '图片',
  videos: '视频',
} as const;

/** 项目级存储的内层目录名（原 `INNER_FOLDER_NAME`） */
export const INNER_FOLDER_NAME = '资源';

/** 工程文件名（new-file 布局：`wrapper/<项目名>.json`） */
export const PROJECT_FILE_SUFFIX = '.json';

/** 自定义协议前缀（原 `img://` / `vid://` / `appasset://`） */
export const PROTOCOL_IMG = 'img://';
/**
 * `vid://` —— 视频落盘后的引用（`userData/videos/<name>`）
 * ⚠️ 归属更正（2026-10-10）：`docs/03` §0.9 曾记「前端未使用」并标注 `[待验证]`；
 *    回源 `main.js:1017-1059` 确认**后端已完整实现**（Range→206/416、MIME 按扩展名、CORS），
 *    且 `docs/10 #9`「视频必须落盘」⇒ **本轮开始在前端使用**（见 `docs/16` §1.1）。
 */
export const PROTOCOL_VID = 'vid://';
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

/** 旧单工程迁移后的 id（原 `p_migrated`） */
export const LEGACY_PROJECT_ID = 'p_migrated';
/** 旧单工程迁移后的名字 */
export const LEGACY_PROJECT_NAME = '导入的项目';

/** 工程 id 前缀（原 `Pt('p')` → `p_<base36>_<计数>`） */
export const PROJECT_ID_PREFIX = 'p_';
/** 账号 id 前缀（原 `acc_<base36>`） */
export const ACCOUNT_ID_PREFIX = 'acc_';
/** 预设 id 前缀（原 `pre_...`） */
export const PRESET_ID_PREFIX = 'pre_';
/** 素材库 id 前缀（原 `lib_...`） */
export const LIBRARY_ID_PREFIX = 'lib_';
/** 生成图片流 id 前缀（原 `ig_...`） */
export const IMAGE_GEN_FEED_ID_PREFIX = 'ig_';
/** 连线 id 前缀（原 `e_...`） */
export const EDGE_ID_PREFIX = 'e_';
