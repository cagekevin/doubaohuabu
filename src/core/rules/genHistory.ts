/**
 * 生成历史（`genHistory`）—— **纯规则**
 *
 * 依据（**逐行回源抄录**）：原 `Uy` `shared.js:25577-25605` · 原 `Fc`（尝试构造器）`shared.js:25518-25552`
 *
 * ⚠️ **与 `docs/16` §1.3 的「撤销 `genHistory.ts`」不冲突**：
 *    那条撤销针对的是「**追加 / 切换版本**」—— 现已确认它们是**散在 store action 里的副作用**
 *    （`selVer` 切换、`_pendingAttempt` 回填），确实不该有独立 rules 模块。
 *    但 `Uy`（按 attemptId 打补丁）与 `Fc`（构造一条尝试）**输入输出都是纯数据** ⇒ 是纯函数，故落在这里。
 *
 * ⚠️ `Uy` 在原版有 **2 处调用点**（`shared.js:28084` 与 `30819`）⇒ 抽成共享函数是恰当的。
 * ⚠️ `Fc` 原本自己 `Date.now()` + 模块计数器 `O$()`（`a${now36}${seq36}`）；按原则 4，
 *    本仓把 **`id` / `at` 改为注入**（时间只能经端口）。
 */

import { GEN_HISTORY_KEY } from '@/stable/model/node';
import { GEN_HISTORY_ATTEMPT_LIMIT } from '@/constants';
import { COMMON_TEXT, VIDEO_NODE_TEXT } from '@/constants/text';
import { asRecord } from '@/lib/object';
import { normalizeModelLabel } from './prompt';

/**
 * 构造一条「生成尝试」记录（原 `Fc` `shared.js:25518-25552`）
 *
 * ★ **谁用它**：API 通道提交任务时随报文带上（`Z3_1.jsx:810-828` 的单发 / `:904-927` 的批量），
 *   后端把它存进 `job.attempt`（`job-manager.js:442`），出片事件再带回来
 *   ⇒ `applyApiJobEvent` 才能 `appendGenHistoryAttempt`（成功）/ `patchGenHistoryAttempt`（失败、取消）。
 *   ⚠️ **不带它 ⇒ 版本历史对 API 出片永远是空的**（`docs/14` §4 的 `TD-03-6`）。
 *
 * ⚠️ 与源逐字对齐（含两处怪癖）：
 *   · `params` 为**假值** ⇒ `null`（不是 `{}`）；真值 ⇒ **浅拷贝**一份
 *   · `edit` 为**假值** ⇒ **整个键都不出现**（源 `...(s ? {edit:{...s}} : null)`）
 *   · `prompt` 空 ⇒ `''`（`|| ''`）
 *   · 其余可空键恒写出（`null`），**不省略** —— 源也是恒写
 * ⚠️ `id` / `at` **由调用方注入**（源版是 `O$()` + `Date.now()`，原则 4 禁 `core` 自己取时间）。
 */
export interface GenAttemptInput {
  id: string;
  at: number;
  accountId?: string | null;
  accountName?: string;
  params?: Record<string, unknown> | null;
  prompt?: string;
  edit?: Record<string, unknown> | null;
  conversationId?: string | null;
  messageId?: string | null;
  vid?: string | null;
  resourceId?: string | null;
  status?: string;
  note?: string;
}

export function makeGenAttempt(input: GenAttemptInput): Record<string, unknown> {
  const {
    id,
    at,
    accountId = null,
    accountName = '',
    params = null,
    prompt = '',
    edit = null,
    conversationId = null,
    messageId = null,
    vid = null,
    resourceId = null,
    status = 'pending',
    note = '',
  } = input;
  return {
    id,
    at,
    accountId,
    accountName,
    params: params ? { ...params } : null,
    prompt: prompt || '',
    ...(edit ? { edit: { ...edit } } : null),
    conversationId,
    messageId,
    vid,
    resourceId,
    status,
    note,
  };
}

/**
 * 往 `genHistory.attempts` **追加**一条尝试记录（原 `U$` `shared.js:25564-25574`）
 *
 * ⚠️ 与源逐字对齐的两个行为：
 *   · `attempt` 为**假值** ⇒ **原样返回**（不做任何补救 —— 源 `if (!t) return e;`）
 *   · 追加后 **只留最后 20 条**（源 `.slice(-20)`）；`genHistory` 缺失 / `attempts` 非数组 ⇒ 视作空表
 *   · 恒返回**新对象**（不可变；`v` 固定为 `1`）
 *
 * @param data    节点 `data`（不可变）
 * @param attempt 要追加的尝试（源传的是 `{...attempt, status:'success'}`）
 */
export function appendGenHistoryAttempt(
  data: Record<string, unknown>,
  attempt: unknown,
): Record<string, unknown> {
  if (!attempt) return data;
  const history = data[GEN_HISTORY_KEY] as { attempts?: unknown } | undefined;
  const prev = history && Array.isArray(history.attempts) ? history.attempts : [];
  const attempts = [...prev, attempt].slice(-GEN_HISTORY_ATTEMPT_LIMIT);
  return { ...data, [GEN_HISTORY_KEY]: { v: 1, attempts } };
}

/**
 * 按 `attemptId` 给 `genHistory.attempts` 里的**那一条**打补丁（原 `Uy`）
 *
 * ⚠️ 与源逐字对齐的三个行为：
 *    · `genHistory` 不存在 / `attempts` 不是数组 ⇒ **原样返回**（不做任何补救）
 *    · `attemptId` **没命中** ⇒ **原样返回**（不是"追加一条" —— 追加是别处的职责）
 *    · 命中 ⇒ 返回**新对象**（`{...data, genHistory: {...h, attempts}}`），不改原对象
 *
 * @param data     节点 `data`（不可变）
 * @param attemptId 要打的尝试 id
 * @param patch    合并进该条尝试的字段（源版 `{status, note}`）
 */
export function patchGenHistoryAttempt(
  data: Record<string, unknown>,
  attemptId: string,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const history = data[GEN_HISTORY_KEY];
  if (!history || typeof history !== 'object') return data;

  const h = history as { v?: unknown; attempts?: unknown };
  if (!Array.isArray(h.attempts)) return data;

  let hit = false;
  const attempts = h.attempts.map((item) => {
    const a = item as { id?: unknown } | null;
    if (!a || typeof a !== 'object' || a.id !== attemptId) return item;
    hit = true;
    return { ...a, ...patch };
  });

  if (!hit) return data;
  return { ...data, [GEN_HISTORY_KEY]: { ...h, attempts } };
}

// ─────────────────────────── 尝试表（`genHistory.attempts`）───────────────────────────

/**
 * 读 `genHistory.attempts`（原 `tm`，`shared.js:25553-25563`）
 *
 * 源（逐字）：
 *   ```js
 *   if (!e || !e.data) return [];
 *   const t = e.data['genHistory'];
 *   if (!t || !Array.isArray(t.attempts)) return [];
 *   return t.attempts;
 *   ```
 * ⚠️ **两处消费者**（判据 C1）：`VideoNode` 的「出片记录」面板（原 `BL.jsx:32`）与
 *   `GenVideoNode` 的「历史版本」弹层（原 `YL.jsx:402`）—— 此前本文件只服务后者，
 *   故叫 `versionAttempts`；现按源的真名与用途**提升为公开**（名字就是源的 `tm` 语义）。
 */
export function attemptsOf(data: Record<string, unknown>): unknown[] {
  const h = asRecord(data[GEN_HISTORY_KEY]);
  return Array.isArray(h.attempts) ? h.attempts : [];
}

/** 一次出片统计（原 `F$`，`shared.js:25621-25652`） */
export interface AttemptStats {
  total: number;
  success: number;
  /** ⚠️ `failed` 把 **`cancelled` 也计进去**（源：`status === 'failed' || status === 'cancelled'`） */
  failed: number;
  /** 其余全部（含**没有 `status`** 的）—— 源是 `else` 分支，不是"只数 pending" */
  pending: number;
  /** 出现过的 `accountName`（**首次出现顺序**、去重、空串不收） */
  accounts: string[];
}

/**
 * 汇总一次节点的出片尝试（原 `F$`，`shared.js:25621-25652`）
 *
 * 源（逐字）：
 *   · 空表 ⇒ `{total:0, success:0, failed:0, pending:0, accounts:[]}`
 *   · `success` 计数；`failed` / `cancelled` 都累进 **`failed`**；**其余**（含 `pending` 与无状态）累进 `pending`
 *   · `accountName` 非空且未出现过 ⇒ 追加（保持首次出现顺序）
 *
 * ⚠️ 「`total > 1` 才显示出片记录 chip」的判据在**调用方**（源 `BL.jsx:346`），不在本函数。
 */
export function attemptStats(data: Record<string, unknown>): AttemptStats {
  const list = attemptsOf(data);
  if (!list.length) return { total: 0, success: 0, failed: 0, pending: 0, accounts: [] };

  const accounts: string[] = [];
  let success = 0;
  let failed = 0;
  let pending = 0;
  for (const item of list) {
    const a = asRecord(item);
    if (a.status === 'success') success += 1;
    else if (a.status === 'failed' || a.status === 'cancelled') failed += 1;
    else pending += 1;
    if (typeof a.accountName === 'string' && a.accountName && !accounts.includes(a.accountName)) {
      accounts.push(a.accountName);
    }
  }
  return { total: list.length, success, failed, pending, accounts };
}

/**
 * 尝试状态 → 中文标签（原 `FL`，`shared.js:40772-40777`）
 *
 * 源：`FL[Be.status] || Be.status || ''`（命中不到就**原样回显状态字符串**，再空就空串）。
 * ⚠️ 表在 SSOT（`VIDEO_NODE_TEXT.attemptStatus`）—— 本函数只负责**回落链**（纯逻辑）。
 */
export function attemptStatusLabel(status: unknown): string {
  const key = typeof status === 'string' ? status : '';
  if (!key) return '';
  return VIDEO_NODE_TEXT.attemptStatus[key as keyof typeof VIDEO_NODE_TEXT.attemptStatus] ?? key;
}

// ─────────────────────────── 历史版本（原 `YL.jsx:401-470,585-620`）───────────────────────────

/**
 * 当前选中的版本下标（原 `pe`，`YL.jsx:402`）
 *
 * `selVer` 是**有效下标**就用它，否则回落**最后一条**（`length - 1`；空表 ⇒ `-1`）。
 */
export function currentVersionIndex(data: Record<string, unknown>): number {
  const attempts = attemptsOf(data);
  const sel = data.selVer;
  return typeof sel === 'number' && sel >= 0 && sel < attempts.length ? sel : attempts.length - 1;
}

/**
 * 「切换到第 N 版」要写进节点 `data` 的**补丁**（原 `selectVersion` 的纯半，`shared.js:31068-31140`）
 *
 * 源按 `c.url` / `c.edit` / `c.params` 三段有条件地覆盖：
 *   · 有 `url` ⇒ 覆盖 `resultUrl` / `resultPoster` / `resultVid` / `resultAt`（**显式写 `null`**）
 *   · 有 `edit`（对象）⇒ `text`（非空串才写）/ `aspectRatio` / `duration` / `model` / `sendAccount` / `styleIds`（**拷贝**）
 *   · **否则**有 `params` ⇒ 只取 `ratio` / `duration` / `model`
 * 恒写 `selVer`。
 *
 * @returns 补丁；`genHistory` 缺失 / 下标越界 ⇒ `null`（源 `return false`，什么都不做）
 */
export function selectVersionPatch(data: Record<string, unknown>, index: number): Record<string, unknown> | null {
  const attempts = attemptsOf(data);
  if (index < 0 || index >= attempts.length) return null;
  const a = asRecord(attempts[index]);
  const patch: Record<string, unknown> = { selVer: index };

  if (a.url) {
    patch.resultUrl = a.url || null;
    patch.resultPoster = a.poster || null;
    patch.resultVid = a.vid || null;
    patch.resultAt = a.at || data.resultAt;
  }

  const edit = asRecord(a.edit);
  if (a.edit && typeof a.edit === 'object') {
    if (typeof edit.text === 'string' && edit.text) patch.text = edit.text;
    if (edit.aspectRatio) patch.aspectRatio = edit.aspectRatio;
    if (edit.duration) patch.duration = edit.duration;
    if (edit.model) patch.model = edit.model;
    if (edit.sendAccount) patch.sendAccount = edit.sendAccount;
    if (Array.isArray(edit.styleIds)) patch.styleIds = [...edit.styleIds];
  } else if (a.params) {
    const params = asRecord(a.params);
    if (params.ratio) patch.aspectRatio = params.ratio;
    if (params.duration) patch.duration = params.duration;
    if (params.model) patch.model = params.model;
  }
  return patch;
}

/**
 * 给某条尝试**补上海报**（原 `setGenvideoVersionPoster` 的纯半，`shared.js:31141-31198`）
 *
 * ⚠️ 源的两个分支（`u` = "要写节点级 `resultPoster`"）：
 *   · `attemptId == null` ⇒ `u = true`（**直接**写节点 `resultPoster`）
 *   · 命中某条尝试 ⇒ 给那条打 `poster`；**若它正是当前版本**（`selVer === 下标`）⇒ `u = true`
 *
 * @returns 补丁；`poster` 为空 / 没命中任何尝试且非 `null` 分支 ⇒ `null`（**不产生空补丁** —— 避免无谓的 undo 快照）
 */
export function setVersionPosterPatch(
  data: Record<string, unknown>,
  attemptId: string | null | undefined,
  poster: string,
): Record<string, unknown> | null {
  if (!poster) return null;
  const attempts = attemptsOf(data);
  const patch: Record<string, unknown> = {};
  let hit = attemptId == null;

  const idx = attempts.findIndex((item) => asRecord(item).id === attemptId);
  if (attemptId != null && idx >= 0) {
    patch[GEN_HISTORY_KEY] = {
      ...asRecord(data[GEN_HISTORY_KEY]),
      attempts: attempts.map((item, i) => (i === idx ? { ...asRecord(item), poster } : item)),
    };
    if (data.selVer === idx) hit = true;
  }
  if (hit) patch.resultPoster = poster;
  return Object.keys(patch).length > 0 ? patch : null;
}

/** 历史版本弹层里**一条**的展示字段（原 `YL.jsx:594-618` 的渲染表达式） */
export interface VersionItemView {
  /** 该版本**没有视频** ⇒ 条目禁用（原 `Qe = !X.url`） */
  disabled: boolean;
  /** 缩略图（缺 ⇒ 空串，UI 显示 `无片` / `▶`） */
  poster: string;
  ratio: string;
  duration: string;
  model: string;
  account: string;
  prompt: string;
}

/** 取字符串（源大量用 `||` 链，`unknown` 先收敛再回落） */
function textOf(value: unknown, fallback: string): string {
  if (typeof value === 'string') return value || fallback;
  if (typeof value === 'number') return String(value);
  return fallback;
}

/**
 * 一条历史版本的展示字段（原 `YL.jsx:594-618`）
 *
 * ⚠️ 时间戳（`at`）**不在这里格式化** —— `core` 不得出现 `new Date`（见 `lib/time.ts` 头注），
 *    由 UI 走 `lib/time.ts` 的 `formatMonthDayMinute`。
 */
export function versionItemView(attempt: unknown): VersionItemView {
  const a = asRecord(attempt);
  const params = asRecord(a.params);
  const duration = a.duration ?? params.duration;
  return {
    disabled: !a.url,
    poster: typeof a.poster === 'string' ? a.poster : '',
    ratio: textOf(params.ratio, COMMON_TEXT.autoLabel),
    duration: textOf(duration, COMMON_TEXT.dash),
    model: normalizeModelLabel(textOf(params.model, '')),
    account: textOf(a.accountName, COMMON_TEXT.dash),
    prompt:
      typeof a.prompt === 'string' && a.prompt
        ? a.prompt.slice(0, 24)
        : COMMON_TEXT.noPrompt,
  };
}
