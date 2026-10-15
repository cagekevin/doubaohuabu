// ============================================================
// API 接入 · 类型契约（**纯类型**，无运行时逻辑 —— 本文件编译后不产出任何代码）
// ------------------------------------------------------------
// 设计要点见 docs/API接入功能-实现方案.md：
//   · 所有第三方请求只在主进程发出（无 CORS、可走代理、密钥不过桥）；
//   · 每个服务商一个 ProviderAdapter，全部解析函数是纯函数（body 进 / 结构出），
//     可用 fixture 直接跑测试；
//   · job-manager 只认统一输出，不感知任何具体服务商。
//
// ★ 形状的**取证锚点**（不照文档抄，照调用方）：
//   · 引擎给 adapter 的 `config` 五字段 = `job-manager` 的 `const config = { baseUrl, model, params, apiKey, secretKey }`；
//     `bridge` 的 `api-config:test` 只给三字段（无 params/secretKey）⇒ 后两者可选。
//   · `defaults` / `paramSchema` 的实际写法见 5 个 providers；`registry` 对两者做了兜底归一。
// ============================================================

/** 设置页 / 生成面板动态表单的字段描述（schema 驱动，新服务商零 UI 代码） */
export interface ParamField {
  /** 参数键（写入 config.params / 提交 params） */
  key: string;
  /** 中文标签 */
  label: string;
  /** 控件类型 */
  type: 'select' | 'number' | 'text';
  /**
   * `select` 的可选项。
   * ⚠️ `value` 是 `string | number`：**取证自 provider**（geeknow/kling/vidu 的「时长」项用数字值
   * `[5, 10, 15].map((v) => ({ value: v, … }))`；Ark 的时长项同样）。
   */
  options?: { value: string | number; label: string }[];
  /** `number` 的下界 */
  min?: number;
  /** `number` 的上界 */
  max?: number;
  /** 默认值（类型随具体参数而定 —— 这里只能给 unknown） */
  default?: unknown;
}

/**
 * 引擎传给 adapter 的 provider 配置（**已解密的密钥在内**）。
 * ⚠️ `params` / `secretKey` 可选：`api-config:test` 那条路径只传 `baseUrl` / `model` / `apiKey`。
 */
export interface ProviderRunConfig {
  baseUrl: string;
  model: string;
  apiKey: string;
  params?: Record<string, unknown>;
  secretKey?: string;
  /**
   * 每类任务的超时（秒）。★ **读了没人写**（全仓取证：只有 `job-manager` 的 `doPoll` 读它，
   *   而 `config` 是在 `runJob` 里按 5 个字段现搭的）⇒ 当前恒为 undefined ⇒ 兜底到 `DEFAULT_TIMEOUT`。
   *   与 `auth`/`frameSupport`（写了没人读）**同族**：登记在案、本任务不处置。
   */
  timeoutSec?: Partial<Record<'image' | 'video', number>>;
}

/** 提交阶段参数（渲染层传来，已经过 schema 校验） */
export interface SubmitInput {
  /** provider 配置（含已解密 apiKey） */
  config: ProviderRunConfig;
  kind: 'image' | 'video';
  /** paramSchema 对齐的参数 */
  params: Record<string, unknown>;
  /** 提示词正文 */
  prompt: string;
  /** 参考图：本地绝对路径 / img:// 引用 / http(s) 直链 */
  refPaths: string[];
}

/**
 * 提交阶段的产物：一条可直接 fetch 的请求。
 * ⚠️ `body` 是 `string | Buffer`：JSON 形态是字符串，而 **multipart 形态（geeknow 的
 *   `buildMultipartEdits`）产出的是 `Buffer`**（二进制分帧不能过字符串）。
 */
export interface SubmitRequest {
  url: string;
  headers: Record<string, string>;
  body: string | Buffer;
}

/** 单张产出（`url` 与 `b64` 二选一，`mime` 只在 b64 时有意义；`text` 是 LLM 通道的产物） */
export interface ResultItem {
  type: 'image' | 'video' | 'text';
  url?: string;
  b64?: string;
  mime?: string;
  /** LLM 通道：正文（`type: 'text'` 时） */
  text?: string;
}

/** `parseSubmit` 的产物：拿到 taskId、直接给结果（同步出图的通道），或**业务错误**（HTTP 200 + `error`） */
export interface SubmitOutcome {
  taskId?: string;
  /** 与 `PollOutcome.results` 同形（引擎的 `normalizeResult` 对两者走同一条规整链） */
  results?: ResultItem[];
  error?: { kind: string; message: string; advice?: string };
}

/** 轮询/查询阶段的统一输出 */
export interface PollOutcome {
  status: 'running' | 'succeeded' | 'failed';
  /** 0..100（可选） */
  progress?: number;
  results?: ResultItem[];
  error?: { kind: string; message: string; advice?: string };
}

/** 适配器能力（`llm` = 纯文本通道：不进双通道选择器、单独计费） */
export type AdapterCapability = 'image' | 'video' | 'llm';

/** 服务商适配器。注册进 registry 后，引擎 / 设置页 / 生成面板全部自动获得该服务。 */
export interface ProviderAdapter {
  id: string;
  name: string;
  capabilities: AdapterCapability[];
  paramSchema: ParamField[];
  /** baseUrl / model 等默认配置（用户未覆盖时使用） */
  defaults: {
    baseUrl: string;
    model: string;
    params?: Record<string, unknown>;
  };
  /**
   * ★ 下面两个字段**原 JSDoc 里没有**，是从**使用方**取到的（照调用方取证，不照文档抄）：
   *   · `quotaHints` —— `quota.js` 的 `matchQuotaHint` 读它；kling / llm-openai-compat 等写入；
   *   · `transientErrorHints` —— `job-manager` 的瞬时错误判定读它；4 个 provider 曾逐字重复
   *     （已收口到 `providers/_shared.ts` 的 `TRANSIENT_ERROR_HINTS`）。
   */
  /**
   * ★ 同族（也都不在原 JSDoc 里，同样是"照调用方取证"）：
   *   · `domains` —— `factory` 按它建域轮换器（`job-manager` 读）、`registry` 下发给渲染层；
   *   · `auth` / `frameSupport` —— **只有写、没有任何读者**（全仓 grep 实测）：属"登记在案的惰性元数据"，
   *     ⛔ 本任务不删（照抄源）；它们"该不该有"与 `open-lovart-chrome` 同族，见 日志 B2-b。
   */
  domains?: string[];
  auth?: { type: string; keyFields?: string[] };
  frameSupport?: { first?: boolean; last?: boolean; refs?: string };
  quotaHints?: QuotaHint[];
  transientErrorHints?: RegExp;
  buildSubmit(input: SubmitInput): SubmitRequest;
  parseSubmit(body: unknown): SubmitOutcome;
  /** 需要轮询的服务商才实现 */
  buildPoll?(input: { config: ProviderRunConfig; taskId: string }): { url: string; headers: Record<string, string> };
  parsePoll(body: unknown): PollOutcome;
  /** 测试连接（`fetchImpl` 为测试注入点；`null` = 走运行时默认） */
  testConnection?(input: { config: ProviderRunConfig; fetchImpl: FetchLike | null }): Promise<{ ok: boolean; message: string }>;
}

/** 可注入的 fetch（测试注入点）—— 直接用运行时 `fetch` 自己的类型，⛔ 不手抄一份形状 */
export type FetchLike = typeof fetch;

/** 额度文案库的一条（`re` 命中即归一为 `kind`）—— 「数据不是逻辑」，适配器可叠加/覆盖默认口径 */
export interface QuotaHint {
  re: RegExp;
  kind: string;
  advice?: string;
}
