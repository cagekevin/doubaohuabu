/**
 * 「生成确认」链的**纯判据**（原 `_Component43.jsx` 的 `Ge` + `kt`，`:2838` / `:1738-2052`）
 *
 * ★ **它解决什么**：豆包 / Dola 后台收到生成请求后，有时**不直接开工**，而是先回一句
 *   「确认后我再开始生成视频」——必须再点一次内联按钮（或回一句确认语）它才开始。
 *   这条链在发送成功后独立跑一个循环：盯「已提交」回执 + 盯「要确认」提示。
 *
 * ⚠️ 原则 4：本文件**纯**（无 `Date.now()` / `window` / 定时器）——
 *   循环与等待住 `state/autoConfirm`，这里只回答"这一轮读数算不算命中"。
 * ⚠️ 判据 C1：源把同一条"新增回复"规则**写了两遍**（`kt` 的 `dt` 与循环体的确认支）
 *   ⇒ 本文件收成**一份** `detectNewReply`。
 */

/**
 * 「这条发送需不需要后台生成确认」的**粗筛**（原 `Ge`，`:2838`）
 *
 * 逐字对源（`:2838` 的六个子句，**顺序即语义**）：
 *   ```
 *   Q.autoSend && !Q.imageParams && (
 *        images.length > 0
 *     || (Q.genParams) != null && !!Q.genParams.model
 *     || (Q.genParams) != null && !!Q.genParams.duration
 *     || (Q.params)    != null && !!Q.params.model
 *     || (Q.params)    != null && !!Q.params.duration
 *     || /视频生成|duration\s*=/i.test(Q.text || '')
 *   )
 *   ```
 *
 * ⚠️ `!Q.imageParams` 子句（**文生图不做生成确认**）—— 源判的是报文里的 `imageParams`
 *   字段；本仓 `SiteSendPayload` **不带它**（它只给后端读）⇒ 用**同源的标记**
 *   `source === 'canvas-image-gen'` 代替（`PL` 是**唯一**产 `imageParams` 的报文，
 *   见 `payload.ts`）。由调用方算好传 `isImageGen`。
 * ⚠️ 源是 `!!` **真值**判定（`duration: 0` 不算）—— 照抄，别改成 `!= null`。
 */
export function needsGenerationConfirm(input: {
  autoSend: boolean;
  /**
   * ★ 是否**文生图**通道（源 `!Q.imageParams`）—— 由调用方按 `payload.source === 'canvas-image-gen'` 给。
   * 缺省 `false`（= 不是文生图 ⇒ 该子句放行）。
   */
  isImageGen?: boolean;
  /** `Q.images.length` */
  imageCount: number;
  /** 源 `Q.params`（站点参数：账号节点报文有 `{aspectRatio,duration,model}`） */
  params: Record<string, unknown> | null | undefined;
  /**
   * ★ 源 `Q.genParams`（**视频报文独有**：`{duration, model}`）。
   * ⚠️ 缺了它 ⇒ 视频发送**认不出"要生成"** ⇒ 生成确认永不触发（源读的就是这个字段）。
   */
  genParams?: Record<string, unknown> | null;
  /** `Q.text` */
  text: string;
}): boolean {
  if (!input.autoSend) return false;
  if (input.isImageGen === true) return false;
  const p = input.params ?? {};
  const g = input.genParams ?? {};
  if (input.imageCount > 0 || g.model || g.duration) return true;
  if (p.model || p.duration) return true;
  return /视频生成|duration\s*=/i.test(input.text || '');
}

/** 一次探测的读数（`null` = **读数无效**：探针失败 / 脚本自报 `error` / 没有 `count`） */
export type ReplyReading = { count: number; text: string } | null;

/**
 * 「这一轮算不算**新增**回复」（原 `kt` 的 `dt` 与确认支 —— 同一条规则）
 *
 * 逐字对源：
 *   ① `count < baseline`（SPA 切换 / 会话裁剪导致计数回退）⇒ **baseline 归零**
 *   ② `count > baseline` ∧ `text` 非空 ∧ `ownText` **不含** `text` ⇒ 命中
 *      （`text` 是我们自己刚发出去的内容 ⇒ 不算后台的新回复）
 *
 * @returns 新的 baseline（**调用方必须回写** —— 它是跨轮状态）+ 本轮是否命中
 */
export function detectNewReply(input: {
  reading: ReplyReading;
  baseline: number;
  /** 本轮发送的原始正文（原 `ve.ownText`）—— 用于排除自触发 */
  ownText: string;
}): { baseline: number; hit: boolean } {
  const reading = input.reading;
  if (!reading) return { baseline: input.baseline, hit: false };
  const baseline = reading.count < input.baseline ? 0 : input.baseline;
  const ownerEcho = !!reading.text && input.ownText.includes(reading.text);
  return {
    baseline,
    hit: reading.count > baseline && !!reading.text && !ownerEcho,
  };
}

/**
 * 「页面刚跳到 `/chat/<id>`」⇒ **基线全部归零**（原 `kt` 的 `ge()`，`:1785-1795`）
 *
 * ⚠️ 只在**首次**成立时归零（源用哨兵 `de`）；且只在 URL **变了**且落在 `/chat/` 上时算。
 */
export function didEnterChatPage(input: {
  beforeUrl: string;
  currentUrl: string;
  alreadyDone: boolean;
}): boolean {
  if (input.alreadyDone) return false;
  const now = input.currentUrl;
  return !!input.beforeUrl && !!now && now !== input.beforeUrl && /\/chat\//.test(now);
}
