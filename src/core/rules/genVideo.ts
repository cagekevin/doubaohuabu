/**
 * 文生视频节点 —— 纯规则（原 `YL.jsx`）
 *
 * 依据：`docs/12` §1.7（源结构树）+ `docs/13` §1.7（缺口登记）
 * 归属：数据推导是纯逻辑 ⇒ 归 `core`（原则 4：本文件无 `window` / `Date.now()` / `Math.random()`）。
 *
 * ★ 本文件对应的三段源推导（逐字对源，行号 = `YL.jsx`）：
 *   | 本函数 | 源符号 | 行 | 含义 |
 *   | - | - | - | - |
 *   | `stageRatio` | `v` | 64-75 | `gv-stage` 的 `aspect-ratio` |
 *   | `hasResult` | `h` | 42 | 有结果（`resultUrl` 或 `resultPoster`） |
 *   | `nodeAccountLabel` | `y` | 62-109 | `gv-meta` 第 2 项：执行账号标签 |
 *
 * ⚠️ **`nodeAccountLabel` 与 `accountPick.accountPickerLabel`（原 `Se`）是两套**：
 *   源在**两个地方**各写了一份账号标签，**格式不同**（`未分组 · 自动` vs `未分组（自动）`、
 *   `自动` vs `全部账号（自动）`）⇒ 各自逐字对各自的源，**不合并**（原则 8 的适用前提是"同一处"）。
 */

import { GEN_VIDEO_TEXT } from '@/constants/text';
import type { Account } from '@/stable/model/account';
import { UNGROUPED } from './accountPick';

/**
 * `gv-stage` 的 `aspect-ratio`（原 `v`，`YL.jsx:64-75`）
 *
 * ⚠️ 源**只有三个分支**：`9:16` → `9 / 16`，`1:1` → `1 / 1`，**其余一律** `16 / 9`
 *    （含空值、含 `4:3`/`3:4` —— 它们**不是**各自的比例，这是源的既有行为，逐字保留）。
 */
export function stageRatio(aspectRatio: string | undefined): string {
  const r = aspectRatio || '16:9';
  if (r === '9:16') return '9 / 16';
  if (r === '1:1') return '1 / 1';
  return '16 / 9';
}

/** 有结果（原 `h` = `!!resultUrl || !!resultPoster`，`YL.jsx:42`） */
export function hasResult(data: { resultUrl?: string; resultPoster?: string }): boolean {
  return !!data.resultUrl || !!data.resultPoster;
}

/**
 * `gv-meta` 第 2 项：**执行账号标签**（原 `y`，`YL.jsx:62-109`）
 *
 * ⚠️ 源共 4 档（顺序敏感，`auto:group:` **先于** `auto:`）：
 *   | 输入 | 输出 |
 *   | - | - |
 *   | 空 / `'auto'` | `全部账号（自动）` |
 *   | `auto:group:ungrouped` | `未分组（自动）` |
 *   | `auto:group:<id>` | `<组名 / 分组>（自动）` |
 *   | `auto:<channel>` | `<频道名 / 原文>账号（自动）` |
 *   | 其它（显式账号 id） | `<账号名 / 豆包账号（自动）>` |
 *
 * ⚠️ 源**不看 `channel`**（即便 `channel === 'api'`，`sendAccount === 'auto'` 也显示「全部账号（自动）」）
 *    —— 与 `accountPickerLabel`（那里 `api` 优先）**不同**，逐字保留。
 */
export function nodeAccountLabel(input: {
  sendAccount?: string;
  accounts?: readonly Account[];
  groups?: readonly { id: string; name?: string }[];
}): string {
  const v = input.sendAccount;
  if (!v || v === 'auto') return GEN_VIDEO_TEXT.accountAll;
  if (v.startsWith('auto:group:')) {
    const gid = v.slice('auto:group:'.length);
    if (gid === UNGROUPED) return GEN_VIDEO_TEXT.accountUngrouped;
    const g = (input.groups || []).find((x) => x.id === gid);
    return GEN_VIDEO_TEXT.accountInGroup(g?.name || GEN_VIDEO_TEXT.accountGroupFallback);
  }
  if (v.startsWith('auto:')) {
    const ch = v.slice('auto:'.length);
    // 原：`{…}[X.slice(5)] || X.slice(5)` —— 查不到频道名就**回落到原文**
    const label = GEN_VIDEO_TEXT.channelLabels[ch] || ch;
    return GEN_VIDEO_TEXT.accountAutoChannel(label);
  }
  const hit = (input.accounts || []).find((a) => a.id === v);
  return hit ? hit.name : GEN_VIDEO_TEXT.accountFallback;
}
