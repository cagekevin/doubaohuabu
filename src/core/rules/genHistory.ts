/**
 * 生成历史（`genHistory`）—— **纯规则**
 *
 * 依据（**逐行回源抄录**）：原 `Uy` `shared.js:25577-25605`
 *
 * ⚠️ **与 `docs/16` §1.3 的「撤销 `genHistory.ts`」不冲突**：
 *    那条撤销针对的是「**追加 / 切换版本**」—— 现已确认它们是**散在 store action 里的副作用**
 *    （`selVer` 切换、`_pendingAttempt` 回填），确实不该有独立 rules 模块。
 *    但 `Uy` 是「**按 attemptId 打补丁**」，输入输出都是纯数据 ⇒ **是纯函数**，故只落这一个。
 *
 * ⚠️ `Uy` 在原版有 **2 处调用点**（`shared.js:28084` 与 `30819`）⇒ 抽成共享函数是恰当的。
 */

import { GEN_HISTORY_KEY } from '@/stable/model/node';
import { GEN_HISTORY_ATTEMPT_LIMIT } from '@/constants';

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
