/**
 * 模型表（★ SSOT）
 * 依据：docs/过程.md §四「模型与参数边界」（原 `ML` 40230-40235 / `Rp` 43374-43391 / `rf` 43400-43401）
 */

/** 图片分辨率档位（原 `rf`，默认 2K） */
export const IMAGE_RESOLUTIONS = ['1K', '2K', '4K'] as const;
export type ImageResolution = (typeof IMAGE_RESOLUTIONS)[number];
export const DEFAULT_IMAGE_RESOLUTION: ImageResolution = '2K';

/**
 * 文生图的**出图张数**：默认值与上下界 —— ★ SSOT（`TD-16-35`）
 *
 * 依据（**回源**）：原 `_Component45.jsx:146` / `:189`
 *   `Math.max(1, Math.min(4, imageCount | 0 || 1))` ⇒ **默认 1、钳到 [1,4]**。
 * ⚠️ 本仓此前 5 处各写裸 `?? 1` / `|| 1`（`GenPanel` ×2 · `core/model/defaults` · `apiLanding` · `generate`）
 *   ⇒ 同一真相抄 5 份（M3）；且**都没钳**（见 `TD-16-35` 的回源发现，另立一笔）。
 */
export const DEFAULT_IMAGE_COUNT = 1;
export const IMAGE_COUNT_MIN = 1;
export const IMAGE_COUNT_MAX = 4;

/** 视频模型（原 `ML` 40230-40235） */
export const VIDEO_MODELS = ['seedance-2.5', 'seedance-2.0', 'seedance-2.0-fast', 'seedance-2.0-mini'] as const;
export type VideoModel = (typeof VIDEO_MODELS)[number];

/**
 * 视频模型 id → 展示名（原 `eR` 35405-35410 与 `ML` 40230-40235，**两处同表**）
 * ⚠️ 写进提示词的是**展示名**（`Seedance 2.0 Mini`），不是 id（`seedance-2.0-mini`）
 */
export const VIDEO_MODEL_LABELS: Record<string, string> = {
  'seedance-2.5': 'Seedance 2.5',
  'seedance-2.0': 'Seedance 2.0',
  'seedance-2.0-fast': 'Seedance 2.0 Fast',
  'seedance-2.0-mini': 'Seedance 2.0 Mini',
};

/** 未知/空模型时的默认（原 `io` 的 `|| 'Seedance 2.0 Mini'`） */
export const DEFAULT_VIDEO_MODEL = 'seedance-2.0-mini';

/**
 * 视频**默认时长**（秒，原 `ES = 5`，`shared.js:41135`）
 *
 * ⚠️ **2026-10-12 收口**：这个 `5` 此前在仓里**散了三处字面量**
 *   （`GenPanel` 的时长下拉 + meta、`GenVideoNode` 的 `plannedDuration`）——
 *   改一处另两处静默漂。现只此一处。
 * ⚠️ 与 `NODE_DEFAULTS.genvideo.duration`（新节点的初值，同为 5）**不是同一个槽**：
 *   那个是"建节点时写进 data 的值"，这个是"data 里没写时 UI 的显示兜底"（源 `ES` 就是这个角色）。
 */
export const DEFAULT_VIDEO_DURATION = 5;

/** 图片模型（按生成通道） */
export const IMAGE_MODELS = {
  doubao: ['Seedream 5.0 Flash', 'Seedream 5.0 Pro'],
  gpt: ['Image 2', 'Image 2.5 Sunburst', 'Image 2.5 Flare'],
} as const;

/** 生成通道 */
export const GEN_CHANNELS = ['doubao', 'api'] as const;
export type GenChannel = (typeof GEN_CHANNELS)[number];

/** 画布比例选项 */
export const ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;
export type AspectRatio = (typeof ASPECT_RATIOS)[number];

/**
 * ★★ **节点新建时的默认比例 = 4:3** —— **用户 2026-10-12 裁定**
 *
 * ★ **它是唯一真源**，五个消费者全部从这里取（**不许各写各的**）：
 *   ① `core/model/defaults.ts` 的 `NODE_DEFAULTS.{text,genvideo,imggen}.aspectRatio`；
 *   ② 同文件 `NODE_CREATE_SIZES`（新建节点的框宽高比，高 = 宽 ÷ 比例）；
 *   ③ 同文件 `nodeCreateSize` 的兜底（缺尺寸的节点类型）；
 *   ④ `core/rules/materialGrid.ts` 的 `fitMaterialSize`（素材落画布的显示框）；
 *   ⑤ `core/rules/genVideo.ts` 的 `stageRatio`（生成节点舞台的 `aspect-ratio`）。
 *
 * ⚠️ **这是对源版的**有意偏离**，且只改这一处**：源里素材框按**图片自身比例**、
 *   文本/生成节点的默认比例分别是 `16:9` / `16:9` / `1:1`。
 *   用户明确要求「所有节点的初始比例都是 4:3」⇒ 统一到本常量。
 * ⚠️ 只影响**新建**（以及"还没被用户改过"的默认值）；已存在的节点数据不动。
 */
export const NODE_DEFAULT_RATIO = 4 / 3;
/** 同上，**字符串形态**（`aspectRatio` 字段的写法，如 `'16:9'`） */
export const NODE_DEFAULT_RATIO_LABEL = '4:3';

/** 批量出片用的三比例（原 Z3_1.jsx） */
export const BATCH_RATIOS: readonly AspectRatio[] = ['16:9', '9:16', '1:1'];

/**
 * API 视频提交的**固定参数**（原 `Z3_1.jsx:804-809` 的 `$` —— 逐字）
 *
 * ⚠️ 源版把这两项**硬编码**进 `params`（与面板里选的模型无关 —— 模型只进 `attempt.edit`）。
 */
export const API_VIDEO_RESOLUTION = '1080p';
export const API_VIDEO_WATERMARK = 'off';

/** 视频时长范围（秒）—— 站点正则 `(?:[4-9]|1[0-9]|2[0-9]|30)` */
export const VIDEO_DURATION_MIN = 4;
export const VIDEO_DURATION_MAX = 30;

/**
 * 视频**比例**选项（原 `K0`，`shared.js:42748-42769`）—— 生成面板工具条上那个下拉
 *
 * ⚠️ **与 `ASPECT_RATIOS` 不是同一张表**：这张多 `auto`（「自动」）与 `21:9`，且顺序不同；
 *   `ASPECT_RATIOS` 是**画布 / 文本节点**用的那张。各自逐字对各自的源，**不合并**。
 */
export const VIDEO_RATIO_OPTIONS = [
  { value: 'auto', label: '自动' },
  { value: '3:4', label: '3:4' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
  { value: '16:9', label: '16:9' },
  { value: '1:1', label: '1:1' },
  { value: '21:9', label: '21:9' },
] as const;

/**
 * 视频**模型**选项（原 `Y0`，`shared.js:42770-42779`）—— 工具条上那个下拉的**短名**
 * （`Fast` / `Mini` / `Seedance 2.5`）
 *
 * ⚠️ **与 `VIDEO_MODEL_LABELS` 不是同一套**：那张是写进提示词 / meta 的**全名**
 *   （`Seedance 2.0 Mini`），且多 `seedance-2.0` 一项。两张表**各自逐字对源**。
 */
export const VIDEO_MODEL_OPTIONS = [
  { value: 'seedance-2.0-fast', label: 'Fast' },
  { value: 'seedance-2.0-mini', label: 'Mini' },
  { value: 'seedance-2.5', label: 'Seedance 2.5' },
] as const;

/**
 * 提示词编辑器的默认高（原 `Or = 104`，`shared.js:42657`）
 * 与上下界（原 `RS` 的 `Or` / `Y3 = 320`，`:42659-42662`）
 */
export const PROMPT_EDITOR_HEIGHT = { default: 104, min: 104, max: 320 } as const;

/** 账号类型标签（原 41005-41007） */
export const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  doubao: '豆包后台',
  dola: 'Dola',
  lovart: 'Lovart',
  tapnow: 'Tapnow',
  gpt: 'GPT',
  other: '自定义网站',
  api: 'API',
};

/**
 * 各站点的**登录页**（原 `shared.js:34197-34201` 的 `SP`/`NP`/`CP`/`EP`/`jP`，逐字）
 *
 * ★ 用途：登录弹窗（原 `$P.jsx:17` 的 `h`）里那个 `<webview>` 的起始地址。
 *
 * ⚠️ **与 `SitePort.chatUrl`（会话页）不是同一个地址**，别合并：
 *   · doubao 登录页 = `https://www.doubao.com`（**站点首页**），会话页 = `…/chat/`；
 *   · 源版登录完成后由后台视图（`_Component43`）再把页面导航到会话页。
 * ⚠️ `other` 没有固定地址（用户手输，原 `c ? u.trim() || 'about:blank' : …`）⇒ **不在表内**。
 */
export const SITE_LOGIN_URL: Record<string, string> = {
  doubao: 'https://www.doubao.com',
  dola: 'https://www.dola.com/chat/',
  lovart: 'https://www.lovart.ai/zh',
  tapnow: 'https://app.tapnow.media/home',
  gpt: 'https://chatgpt.com',
};
