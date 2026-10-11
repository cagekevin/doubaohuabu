/**
 * 自动值守的**纯决策**（原 `_Component26.jsx` 的 `Ee` 428-592 的取值半）★ 必测
 *
 * ★★ **它回答两个纯问题**：
 *   ① 一轮跑完后**该等多久**（基础间隔 / 退避），以及按账号 id 的**错峰抖动**
 *   ② 一轮跑完后**进度怎么变**（连续空转计数 / 累计新增）
 *
 * ⚠️ **IO 一概不在这里**：真的去扫在 `SitePort.scan`（**由适配器声明能力**），
 *    真的定时在**编排层** `state/accountOps.ts`（走 `ClockPort`）。
 *    ⇒ 本文件无 `setTimeout` / 无 `window`（原则 4），可纯函数单测。
 *
 * 依据（**逐行回源** `Ee` 471-592）：
 *   | 源 | 语义 | 本仓 |
 *   |---|---|---|
 *   | `te(acc)` = `ho(acc) ? qR : KR` · `X(acc)` = `ho(acc) ? YR : XR` | 基础 / 退避间隔**按站点**分档 | `autoWatchBaseDelay(p, cadence)` —— ⚠️ **节奏由 adapter 声明**（`SitePort.autoWatch`），本层不认站点名 |
 *   | `je.idleRounds >= xl`（`xl` = 4） | 连续空转达上限 ⇒ 转退避 | 同左（`AUTO_WATCH_IDLE_ROUNDS_MAX`） |
 *   | `je.autoCount >= QR`（`QR` = 40） | 单账号累计新增超限 ⇒ 转退避 | 同左（`AUTO_WATCH_MAX_NEW`） |
 *   | `tD(acc.id)` = djb2 `% 8000` | 按账号 id **错峰** | `autoWatchJitter(acc.id)` |
 *   | `idleRounds += 1` / `= 0`；`autoCount += 1`（**每张**） | 进度推进 | `advanceAutoWatch(p, added)` |
 *
 * ⚠️ 抖动是**加性**的：源版是 `re(je, X(Ve) + je.jitter)` ⇒ 调用方用 `base + jitter`。
 * ⚠️ **「谁能值守」不在本层** —— 那是 adapter 的 `autoWatch?` 能力声明；
 *    本层只吃 `AutoWatchCadence` 这个形状（**永不判站点名**）。
 */

import {
  AUTO_WATCH_IDLE_ROUNDS_MAX,
  AUTO_WATCH_JITTER_MOD,
  AUTO_WATCH_MAX_NEW,
} from '@/constants';

/** 值守节奏 —— 形状等同 `SitePort.autoWatch`（由 adapter 声明） */
export interface AutoWatchCadence {
  intervalMs: number;
  idleBackoffMs: number;
}

/** 单账号值守进度（原 `je.idleRounds` / `je.autoCount`） */
export interface AutoWatchProgress {
  /** 连续**空转**轮数（本轮没新增 ⇒ +1；有新增 ⇒ 归 0） */
  idleRounds: number;
  /** 本账号**累计新增**条数（≥ `AUTO_WATCH_MAX_NEW` ⇒ 转退避） */
  autoCount: number;
}

/** 初始进度（原 `Ee` 建条目时的 `{autoCount: 0, idleRounds: 0}`） */
export function initialAutoWatchProgress(): AutoWatchProgress {
  return { idleRounds: 0, autoCount: 0 };
}

/**
 * 按账号 id 的**错峰抖动**（原 `tD` 36685-36691：djb2 → `% 8000`）
 *
 * ⚠️ 与源**同算法**（含 `>>> 0` 的无符号回绕）。它是**确定性**的（同 id 恒同值）
 *    ⇒ 「多账号同时开值守」不会同拍打页面（源版正是为此写的）。
 * ⚠️ 空 id ⇒ `5381 % 8000` = **5381**（源 `tD` 对空串也是这个值）—— 不编造、不特判。
 */
export function autoWatchJitter(accountId: string): number {
  let h = 5381;
  const s = String(accountId || '');
  for (let i = 0; i < s.length; i += 1) {
    h = (((h << 5) + h + s.charCodeAt(i)) >>> 0);
  }
  return h % AUTO_WATCH_JITTER_MOD;
}

/**
 * 本轮跑完后**该等多久**（**不含**抖动）—— 原 `Ee` 的 `te(acc)` / `X(acc)`
 *
 * 转退避的两个条件（原 486-489 与 517-521）：
 *   · `idleRounds >= AUTO_WATCH_IDLE_ROUNDS_MAX`（连续空转够久 ⇒ 放慢）
 *   · `autoCount >= AUTO_WATCH_MAX_NEW`（这个账号已经喂饱了 ⇒ 放慢）
 */
export function autoWatchBaseDelay(p: AutoWatchProgress, cadence: AutoWatchCadence): number {
  return p.idleRounds >= AUTO_WATCH_IDLE_ROUNDS_MAX || p.autoCount >= AUTO_WATCH_MAX_NEW
    ? cadence.idleBackoffMs
    : cadence.intervalMs;
}

/**
 * 一轮跑完后**推进进度**（原 `Ee` 里对 `idleRounds` / `autoCount` 的增减）
 *
 * @param added 本轮**真正新增**的条数（去重后；`addLovartImages` 的返回）
 */
export function advanceAutoWatch(p: AutoWatchProgress, added: number): AutoWatchProgress {
  return added > 0
    ? { idleRounds: 0, autoCount: p.autoCount + added }
    : { idleRounds: p.idleRounds + 1, autoCount: p.autoCount };
}

/**
 * 这一轮**还要不要真的去扫**（原 `Ee` 486-489：`if (je.autoCount >= QR) { 顺延; return; }`）
 *
 * ⚠️ 与源一致：**喂饱了就只顺延、不再打页面**（不是"换个间隔继续扫"）。
 *    ⇒ 调用方拿到 `false` 时应**直接排下一次**（用 `autoWatchBaseDelay` 给的退避），不调 `scan`。
 */
export function shouldAutoWatchScan(p: AutoWatchProgress): boolean {
  return p.autoCount < AUTO_WATCH_MAX_NEW;
}
