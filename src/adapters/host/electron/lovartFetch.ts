/**
 * 批量取图（`lovart-fetch-images`）的**跨进程载荷解析** —— 唯一落点
 *
 * ★ **它解决什么**：`window.api` 的订阅与回执签名都是 `unknown`（`./window-api.d.ts`），
 *   载荷来自**另一个进程**（后端 `electron/lovart-fetch.js`）⇒ 这是本仓最该严的边界。
 *   本文件把「不可信载荷 → 领域形状」的收窄**只做一次**：调用方（`./index.ts`）不再自己
 *   `as Record` / `as unknown as`。
 *
 * ⚠️ **字段缺一即 `null`**（`parseItem`）—— 不把 `undefined` 塞进 `FetchImagesItem`
 *   （原则 6：失败必须可见）。调用方据此把这一条计成 `failed`，用户看得到「取回 N 张、M 张失败」。
 * ⚠️ 这不是"给端口套壳"：端口（`core/ports/host.port.ts`）只有类型、零实现（原则 3），
 *   **脏活（运行时校验）归 adapters**（原则 4）。
 */

import { isRecord } from '@/lib/object';
import { HOST_TEXT } from '@/constants/text';
import type { FetchImagesItem } from '@/core/ports/host.port';

/** 字符串字段（非字符串 ⇒ `''`，与源 `String(p.x ?? '')` 同口径） */
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
/** 数字字段（非有限数 ⇒ `null`） */
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null;

/**
 * 一条 `lovart-fetch-item` 推送（后端 `electron/lovart-fetch.js` 的三种回执）
 *
 * `kind` 即后端那三个分支之一：拿到一张 / 跳过 / 失败。**没有第四种**——
 * 形状不可识别的一律归 `failed`（可见），不静默丢弃。
 */
export type FetchItemEvent =
  | { kind: 'item'; accountId: string; total: number | null; item: FetchImagesItem }
  | { kind: 'skipped'; accountId: string; total: number | null; url: string; reason: string }
  | { kind: 'failed'; accountId: string; total: number | null; url: string; error: string };

/** `lovart-fetch-done` 的载荷（后端 `:349`）—— 只用到 `accountId`（计数以调用方**本地累加**为准） */
export interface FetchDoneEvent {
  accountId: string;
}

/** `lovart-fetch-images` 的提交回执（后端 `:236-246` 的成功 / 失败两条） */
export interface FetchSubmitAck {
  ok: boolean;
  /** 后端失败分支带原文 */
  error?: string;
}

/**
 * 一张图的领域形状（后端 `:314-322`）—— `name` / `dataUrl` / `sourceUrl` **必有**
 * @returns `null` = 缺必需字段 ⇒ 调用方**计失败**（不塞半成品进 `items`）
 */
function parseItem(v: unknown): FetchImagesItem | null {
  if (!isRecord(v)) return null;
  const name = str(v.name);
  const dataUrl = str(v.dataUrl);
  const sourceUrl = str(v.sourceUrl);
  if (!name || !dataUrl || !sourceUrl) return null;
  const sizeBytes = num(v.sizeBytes);
  const natW = num(v.natW);
  const natH = num(v.natH);
  return {
    name,
    dataUrl,
    sourceUrl,
    ...(sizeBytes === null ? {} : { sizeBytes }),
    ...(natW === null ? {} : { natW }),
    ...(natH === null ? {} : { natH }),
    ...(typeof v.source === 'string' ? { source: v.source } : {}),
  };
}

/** 解析一条 `lovart-fetch-item`（`null` = 不是本链路的载荷） */
export function parseFetchItemEvent(payload: unknown): FetchItemEvent | null {
  if (!isRecord(payload)) return null;
  const accountId = str(payload.accountId);
  if (!accountId) return null;
  const total = num(payload.total);
  if (payload.skipped) {
    return {
      kind: 'skipped',
      accountId,
      total,
      url: str(payload.url),
      reason: typeof payload.reason === 'string' ? payload.reason : HOST_TEXT.fetchInvalidImage,
    };
  }
  if (payload.failed) {
    return {
      kind: 'failed',
      accountId,
      total,
      url: str(payload.url),
      error: typeof payload.error === 'string' ? payload.error : HOST_TEXT.fetchFailed,
    };
  }
  const item = parseItem(payload.item);
  // ⚠️ `item` 缺失 / 半成品 ⇒ **计失败**（后端成功分支恒带那三个字段；缺了就是链路出问题）
  if (!item) {
    return { kind: 'failed', accountId, total, url: str(payload.url), error: HOST_TEXT.fetchFailed };
  }
  return { kind: 'item', accountId, total, item };
}

/** 解析 `lovart-fetch-done`（`null` = 不是本链路的载荷） */
export function parseFetchDoneEvent(payload: unknown): FetchDoneEvent | null {
  if (!isRecord(payload)) return null;
  const accountId = str(payload.accountId);
  return accountId ? { accountId } : null;
}

/**
 * 解析提交回执（`null` = 形状不认识 ⇒ 调用方按失败处理）
 *
 * ⚠️ `ok` 用 `=== true` 判（后端**每条 return 都带 `ok`**）—— 漏 `ok` **不能**当成功（`TD-04-5`）。
 */
export function parseFetchSubmitAck(value: unknown): FetchSubmitAck | null {
  if (!isRecord(value)) return null;
  return {
    ok: value.ok === true,
    ...(typeof value.error === 'string' && value.error ? { error: value.error } : {}),
  };
}
