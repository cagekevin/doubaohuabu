/**
 * 生成历史（`genHistory`）—— **纯规则**
 *
 * 依据（**逐行回源抄录**）：原 `Uy` `shared.js:25577-25605` · 原 `Fc`（尝试构造器）`shared.js:25518-25552`
 *
 * ⚠️ **与 `docs/过程.md` §1.3 的「撤销 `genHistory.ts`」不冲突**：
 *    那条撤销针对的是「**追加 / 切换版本**」—— 现已确认它们是**散在 store action 里的副作用**
 *    （`selVer` 切换、`_pendingAttempt` 回填），确实不该有独立 rules 模块。
 *    但 `Uy`（按 attemptId 打补丁）与 `Fc`（构造一条尝试）**输入输出都是纯数据** ⇒ 是纯函数，故落在这里。
 *
 * ⚠️ `Uy` 在原版有 **2 处调用点**（`shared.js:28084` 与 `30819`）⇒ 抽成共享函数是恰当的。
 * ⚠️ `Fc` 原本自己 `Date.now()` + 模块计数器 `O$()`（`a${now36}${seq36}`）；按原则 4，
 *    本仓把 **`id` / `at` 改为注入**（时间只能经端口）。
 */

import { GEN_HISTORY_KEY } from '@/stable/model/node';
import type { ApiJobAttempt } from '@/stable/model/gen';
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
 *   ⚠️ **不带它 ⇒ 版本历史对 API 出片永远是空的**（`docs/过程.md` §4 的 `TD-03-6`）。
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

/**
 * 造尝试 id（原 `O$` `shared.js:25514-25517`）
 *
 * ```js
 * let Gl = 1;
 * const O$ = () => `a${Date.now().toString(36)}${(Gl++).toString(36)}`;
 * ```
 * ⚠️ **只收形状**：`now` / `seq` 由调用方给（原则 4 禁 `core` 自取时间；`seq` 由各调用方
 *    持自己的计数器 —— 本仓 `test.isolate:false`，模块级计数器会跨测试文件泄漏）。
 */
export function makeAttemptId(now: number, seq: number): string {
  return `a${now.toString(36)}${seq.toString(36)}`;
}

export function makeGenAttempt(input: GenAttemptInput): ApiJobAttempt {
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

// ─────────────────────────── 「拉取结果」（原 `xk` / `z$` / `pullResult`）───────────────────────────

/**
 * 最后一条生成尝试（原 `xk`，`shared.js:25606-25613`）
 *
 * 源（逐字）：`const t = tm(e); return t.length ? t[t.length - 1] : null;`
 *
 * ⚠️ **两个消费者**（判据 C1）：`z$`（「可拉取」判据）与 `pullResult`（拉取动作）——
 *    两处都要"最后一条"，故抽成共享函数。
 */
export function latestAttempt(data: Record<string, unknown>): Record<string, unknown> | null {
  const list = attemptsOf(data);
  if (!list.length) return null;
  return asRecord(list[list.length - 1]);
}

/** 「拉取结果」的目标（原 `z$` 的判据 + `pullResult` 的取数 —— 合体为**一处**判断） */
export interface PullTarget {
  /** 要打补丁的那条尝试 id（原 `ve.id`；老数据可能没有 ⇒ 空串） */
  attemptId: string;
  /** 视频 id（原 `ve.vid`）—— **有它才走「按 vid 拉无水印」那条路** */
  vid: string;
  /**
   * 会话 id（原 `ve.conversationId`）
   * ★ **只有它（没有 `vid`）⇒ 走「回对话页 → 登记 `pull:true` 任务 → 交给发送后检测」那条路**
   *   （`_Component43.jsx:3180-3210`）。
   */
  conversationId: string;
  /**
   * 该次尝试的写入时刻（原 `ve.at`）—— 检测任务的 `sendTime` 基准（源 `ve.at || Date.now()`）。
   * ⚠️ 老数据可能没有 ⇒ `0`（调用方回落「当前时刻」）。
   */
  at: number;
  /** 该次生成用的账号（原 `ve.accountId`；缺 ⇒ `null`，由调用方回落「当前账号」） */
  accountId: string | null;
}

/**
 * 取「可拉取」的那条尝试（原 `z$` `shared.js:25614-25620` + `pullResult` 的取数）
 *
 * 源（逐字）：
 *   ```js
 *   if (!e || !e.data || e.data.url) return false;
 *   const t = xk(e);
 *   return !!t && (!!t.conversationId || !!t.vid);
 *   ```
 * ⇒ 三条件：**① 还没有 `url`**（结果已在手上就不必再拉）· **② 有尝试** ·
 *   **③ 那条尝试记了 `conversationId` 或 `vid`**（否则无从拉取）。
 *
 * ⚠️ `vid` 为空 = 只剩「回对话页拉取」那条路（原 `pullResult` 的第二个分支）；
 *    调用方据此决定能不能直接拉（见 `state/pullResult.ts`）。
 */
export function pullTargetOf(data: Record<string, unknown>): PullTarget | null {
  if (data.url) return null;
  const a = latestAttempt(data);
  if (!a) return null;
  const vid = typeof a.vid === 'string' ? a.vid : '';
  const conversationId = typeof a.conversationId === 'string' ? a.conversationId : '';
  if (!vid && !conversationId) return null;
  return {
    attemptId: typeof a.id === 'string' ? a.id : '',
    vid,
    conversationId,
    at: typeof a.at === 'number' && a.at > 0 ? a.at : 0,
    accountId: typeof a.accountId === 'string' && a.accountId ? a.accountId : null,
  };
}
