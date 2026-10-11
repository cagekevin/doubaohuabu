/**
 * 模型表（★ SSOT）
 * 依据：docs/07-领域规则.md §四「模型与参数边界」（原 `ML` 40230-40235 / `Rp` 43374-43391 / `rf` 43400-43401）
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
