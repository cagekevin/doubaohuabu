/**
 * 报文构造（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据（**逐行回源抄录**）：
 *   - `PL` shared.js:40361-40410 —— 图片报文（`source: 'canvas-image-gen'`）
 *   - `TL` shared.js:40318-40360 —— 视频报文（`source: 'canvas-text-node'`）
 *   - `$L` shared.js:40236-40317 —— 账号节点报文（`source: 'canvas-account-node'`）
 *
 * ⚠️ 原则 4：`core` **不得用 `Date.now()`** ⇒ `timestamp` 由外部注入（`ClockPort`）
 * ⚠️ 协议形状（`apiVersion` / `action` / `source` / 字段名）是**冻结契约**（跨进程），不得改
 */

import { composeImagePrompt, composeVideoPrompt } from './prompt';
import { isRecord } from '@/lib/object';

/**
 * ★ **两个品牌 symbol（结构约束 M1，`docs/11` §六·六）—— 故意不导出**
 *
 * 效果：`WirePayload` / `SiteSendPayload` 只能由**本文件**产出
 *   （`build*Payload` 与 `toSitePayload`）⇒ 别的模块**只能引用类型、造不出来**。
 */
const WIRE: unique symbol = Symbol('doubao.wirePayload');
const SITE: unique symbol = Symbol('doubao.siteSendPayload');
// ★ **2026-10-12（`TD-16-109`）**：时间戳格式化收口到 `lib/time.toIsoTimestamp`（此前本文件 ×3 各写一份）
import { toIsoTimestamp } from '@/lib/time';
// ★ 2026-10-12（`TD-04-11`）：分区前缀取值收口到**唯一真源**（此前此处是第二套写死值）
import { defaultPartitionOf } from '@/core/rules/partition';

/** 发送来源（原实现三种；跨进程契约，不得改名） */
export const SEND_SOURCES = ['canvas-image-gen', 'canvas-text-node', 'canvas-account-node'] as const;
export type SendSource = (typeof SEND_SOURCES)[number];

/**
 * `SitePort.send` 要的**已组装**形态 —— 从跨进程报文里取出那半边（原 `_Component44` 的
 *   `a.sendPayload(o.account.id, o.content, o.sourceNodeId)`：它传的是 **`content`**，不是整份报文）
 *
 * ⚠️ **为什么必须有这一步**：`build*Payload` 产出的是**跨进程报文**（字段都在 `content` 下），
 *   而 `site.send` 收的是**扁平形态**（`text` / `images` / `params` / `autoSend` / `source`）。
 *   两者**不能互传** —— 传错时 `payload.text` / `payload.images` 恒为 `undefined`
 *   （而 `payload.images.length` 会**直接抛**），且 `as` 会把类型检查糊掉。
 * ⚠️ 三个调用方共用这一份（判据 C1）：`usecases/generate`（网页通道）· `state/batchSend`
 *   （批量发送的 transport）· `state/accountOps`（账号节点「填入」）。
 */
export interface SiteSendPayload {
  /**
   * ★ **品牌（结构约束 M1，`docs/11` §六·六）** —— `SITE` **不导出** ⇒ 本类型**只能**由
   *   `toSitePayload` 产出；别的模块只能**引用**它，**造不出来**（手写一个字面量编译不过）。
   */
  readonly [SITE]: true;
  text: string;
  /** ★ **参考图引用**（`{label, dataUrl}`）—— 保留 `label`，见下方 `normalizeImages` / `RefImageRef` */
  images: readonly RefImageRef[];
  params: Record<string, unknown>;
  autoSend: boolean;
  source: SendSource;
}

/**
 * 一张参考图引用（源 `$L` / `state/batchSend` 的 `{label, dataUrl}` 元素）
 *
 * ⚠️ **`label` 不是装饰**（源两处读它）：
 *   · 去重键 `vD`（`shared.js:38638-38642`）= `dataUrl 前 80 字 :: label`；
 *   · 后端拼**临时文件名**（`electron/main.js:1426` 的 `img.label || 'image'`）。
 *   ⇒ 丢掉它会让去重键失真、附件文件名全同。
 */
export interface RefImageRef {
  /** 素材标签（源 `$L` 的 `d.label || '素材'`；无标签的通道 ⇒ 空串，由下游兜底） */
  label: string;
  /** `img://` 或 `data:` 地址 */
  dataUrl: string;
}

/**
 * 图引用归一（**「能一种的别搞两种」**）
 *
 * 报文里 `content.images` 是**有意宽**的（`unknown[]`）：图片通道传 `string[]`、
 * 视频/账号节点传 `{label, dataUrl}[]`（`state/batchSend` / `accountOps` 都产出后者）。
 * ⇒ 在此**收成一份** `RefImageRef[]`：字符串原样留（无标签 ⇒ 空串）、对象取
 *   `{label, dataUrl}`、其余丢掉（空串也无意义）。
 *
 * ⚠️ **`label` 必须留**（源 `_Component43` 的 `Be` 读它做去重键 `vD` + 后端文件名）——
 *    此前这里把它抹成 `string[]`，是 `TD-16-116` 的根因。
 */
function normalizeImages(images: readonly unknown[]): RefImageRef[] {
  const out: RefImageRef[] = [];
  for (const it of images) {
    if (typeof it === 'string') {
      if (it) out.push({ dataUrl: it, label: '' });
      continue;
    }
    if (isRecord(it) && typeof it.dataUrl === 'string' && it.dataUrl) {
      out.push({ dataUrl: it.dataUrl, label: typeof it.label === 'string' ? it.label : '' });
    }
  }
  return out;
}

/**
 * 跨进程报文 → 站点适配器入参（见 `SiteSendPayload`）
 *
 * ★ **它是 `SiteSendPayload` 的唯一构造器**（品牌 `SITE` 不导出）⇒ 适配器入参在结构上
 *   只可能来自这里；「把报文直接传给 `send`」编译不过（不再依赖"记得看名字"）。
 */
export function toSitePayload<C extends Record<string, unknown>>(
  wire: WirePayload<C>,
): SiteSendPayload {
  return {
    [SITE]: true,
    text: wire.content.text,
    images: normalizeImages(wire.content.images),
    params: wire.content.params,
    autoSend: wire.autoSend,
    source: wire.source,
  };
}

/** 报文里的账号摘要（**不是完整 Account** —— 只传跨进程需要的三个字段） */
export interface PayloadAccount {
  id: string;
  name: string;
  /** 缺省走 `DEFAULT_PARTITION`（★ 2026-10-12 `TD-04-11`：值取自真源 `defaultPartitionOf`；⚠️ 因本形状**不带 `type`**，只能兜豆包） */
  partition?: string | null;
}

/** 跨进程报文的公共外形（`apiVersion: '1.0'`） */
export interface WirePayload<C extends Record<string, unknown>> {
  /** ★ **品牌（M1）**：`build*Payload` 是唯一构造器 ⇒ 手写字面量编译不过 */
  readonly [WIRE]: true;
  apiVersion: '1.0';
  action: 'account_node_send';
  /** ISO 8601（由外部注入的时间生成） */
  timestamp: string;
  account: { id: string; name: string; partition: string };
  content: C & {
    text: string;
    images: unknown[];
    texts: unknown[];
    params: Record<string, unknown>;
    /** ⚠️ 图片/视频报文恒为 `true`；账号节点报文由调用方决定（原 `$L` 的 `s`） */
    autoSend: boolean;
  };
  source: SendSource;
  sourceNodeId: string | null;
  /** 图片/视频报文恒为 `true`；账号节点报文由调用方决定 */
  autoSend: boolean;
}

/**
 * 缺省分区 —— ★ 2026-10-12（`TD-04-11`）：值改从**唯一真源**取（此前此处是第二套写死值）
 *
 * ⚠️ **这里只能兜 `doubao`**：跨进程报文里的 `account`（`PayloadAccount`）**只有 `id`/`name`/`partition`**
 *   三个字段、**不带 `type`** ⇒ 本函数拿不到类型，无法 type-aware（探债段症状③ 的根因就在这里）。
 *   要彻底修需给 `PayloadAccount` 加 `type`（**跨进程契约扩容**）—— 那属另一步，**不在这里擅自扩**。
 *   至少现在：**分区前缀的取值只有真源一处**，本行不再是自造的第二套。
 */
const DEFAULT_PARTITION = defaultPartitionOf('doubao');

function accountOf(a: PayloadAccount): { id: string; name: string; partition: string } {
  return { id: a.id, name: a.name, partition: a.partition || DEFAULT_PARTITION };
}

/** 图片报文（原 `PL`） */
export function buildImagePayload(input: {
  account: PayloadAccount;
  /** ★ 必填（`TD-16-104` 收窄：唯一调用方 `core/usecases/generate` 传的是 `ImageGenInput.text: string`） */
  text: string;
  stylePrefix: string;
  ratio?: string;
  count?: number;
  model?: string;
  resolution?: string;
  /**
   * ⚠️ **有意宽**（不是偷懒）：`content.images` 是**跨进程黑盒载荷**（`WirePayload.content.images: unknown[]`，
   *   由后端读）—— 图片通道传 `string[]`、视频通道传 `{label,dataUrl}[]`，"形状不一致"本身是
   *   `TD-04-10`（IPC 载荷形状母体）家族的问题，**不在本刀收窄**（收窄会掩盖真正的通道分歧）。
   *   本刀只把它从"可选"改为**必填**（唯一调用方 `core/usecases/generate` 恒传）。
   */
  images: readonly unknown[];
  sourceNodeId?: string | null;
  now: number;
}): WirePayload<{ imageParams: { count: number; model: string | null; resolution: string | null } }> {
  const text = composeImagePrompt({
    text: input.text,
    stylePrefix: input.stylePrefix,
    ratio: input.ratio,
    count: input.count,
    model: input.model,
    resolution: input.resolution,
  });

  // 与 `PL` 一致：把已夹取的参数**再回填**到 imageParams（供后端读，不重新解析正文）
  const count = Math.max(1, Math.min(4, (Number(input.count) | 0) || 1));
  const model = (input.model ?? '').trim();
  const resolutionRaw = (input.resolution ?? '').trim();
  const resolution = /^(1K|2K|4K)$/.test(resolutionRaw) ? resolutionRaw : '';

  return {
    [WIRE]: true,
    apiVersion: '1.0',
    action: 'account_node_send',
    timestamp: toIsoTimestamp(input.now),
    account: accountOf(input.account),
    content: {
      text,
      images: [...input.images],
      texts: [],
      params: {},
      imageParams: { count, model: model || null, resolution: resolution || null },
      autoSend: true,
    },
    source: 'canvas-image-gen',
    sourceNodeId: input.sourceNodeId ?? null,
    autoSend: true,
  };
}

/** 视频报文（原 `TL`） */
export function buildVideoPayload(input: {
  account: PayloadAccount;
  /** ★ 必填（`TD-16-104` 收窄，与 `buildImagePayload` 同判据） */
  text: string;
  model?: string;
  duration?: number;
  ratio?: string;
  /** ⚠️ **有意宽** —— 同 `buildImagePayload.images`（视频侧调用方形状本就不同：`string[]` ／ `{label,dataUrl}[]`） */
  images: readonly unknown[];
  sourceNodeId?: string | null;
  stylePrefix: string;
  now: number;
}): WirePayload<{ genParams: { duration: number | null; model: string | null } }> {
  const text = composeVideoPrompt({
    text: input.text,
    model: input.model,
    duration: input.duration,
    ratio: input.ratio,
    stylePrefix: input.stylePrefix,
  });

  const duration = Number(input.duration);
  const model = input.model ?? '';

  return {
    [WIRE]: true,
    apiVersion: '1.0',
    action: 'account_node_send',
    timestamp: toIsoTimestamp(input.now),
    account: accountOf(input.account),
    content: {
      text,
      images: [...input.images],
      texts: [],
      params: {},
      // 原 `TL`：`Number(r) || null`（0/NaN → null）
      genParams: { duration: duration || null, model: model || null },
      autoSend: true,
    },
    source: 'canvas-text-node',
    sourceNodeId: input.sourceNodeId ?? null,
    autoSend: true,
  };
}

/** 账号节点报文（原 `$L`）—— 多段文案换行合并；无文案时用兜底句 */
export function buildAccountNodePayload(input: {
  account: PayloadAccount;
  /** 已解析（`@` 引用已替换）的文案段 */
  texts?: string[];
  images?: unknown[];
  params?: Record<string, unknown>;
  autoSend?: boolean;
  sourceNodeId?: string | null;
  now: number;
}): WirePayload<Record<string, unknown>> {
  const texts = (input.texts ?? []).map((t) => String(t ?? '').trim()).filter(Boolean);
  const images = Array.isArray(input.images) ? input.images : [];

  // 原 `$L`：无文案 → `请参考以下 N 张素材图片进行创作。`
  const text = texts.length > 0 ? texts.join('\n') : `请参考以下 ${images.length} 张素材图片进行创作。`;

  return {
    [WIRE]: true,
    apiVersion: '1.0',
    action: 'account_node_send',
    timestamp: toIsoTimestamp(input.now),
    account: accountOf(input.account),
    content: {
      text,
      images,
      texts,
      params: input.params ?? {},
      autoSend: input.autoSend !== false,
    },
    source: 'canvas-account-node',
    sourceNodeId: input.sourceNodeId ?? null,
    autoSend: input.autoSend !== false,
  };
}
