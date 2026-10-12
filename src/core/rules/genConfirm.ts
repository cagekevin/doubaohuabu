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
 * 逐字对源：
 *   `autoSend && images.length > 0 || genParams.model || genParams.duration
 *    || params.model || params.duration || /视频生成|duration\s*=/i.test(text)`
 *
 * ⚠️ 源另有一个 `!Q.imageParams` 子句 —— **本仓的账号节点报文没有该字段**
 *   （`buildAccountNodePayload` 不产 `imageParams`；它是**图生成**通道的字段，
 *   且 `toSitePayload` 也不带）⇒ 该子句在此**恒真**，故不落（不留假判据）。
 */
export function needsGenerationConfirm(input: {
  autoSend: boolean;
  /** `Q.images.length` */
  imageCount: number;
  /** 源分别看 `genParams` 与 `params`；本仓 `toSitePayload` 只留 `params` ⇒ 合成一份 */
  params: Record<string, unknown> | null | undefined;
  /** `Q.text` */
  text: string;
}): boolean {
  if (!input.autoSend) return false;
  const p = input.params ?? {};
  // ⚠️ 源是 `!!` 真值判定（`duration: 0` 不算）—— 照抄，别改成 `!= null`
  if (input.imageCount > 0 || p.model || p.duration) return true;
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
