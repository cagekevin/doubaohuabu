/**
 * 账号名册（新增 / 移除）—— **纯半**（★ 必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `addAccount` shared.js:30159-30217
 *   - `removeAccount` shared.js:30218-30247（**只取纯的那半**：写 store / 清会话是 state 与宿主的活）
 *   - `nextAccountName` 30167-30180 见 `./accountName`
 *
 * ★ **为什么要有这一层**：实测本工程**没有 `addAccount`/`removeAccount`**、`state` 里只有
 *   `setAccounts`（批量覆盖）、`ui/` 里没有任何账号界面 ⇒ **加不了账号** ⇒ `generate` 的选号池
 *   永远为空 ⇒ 必然报「未配置已登录的豆包 / Dola 账号」。这是链上第 4 环的断点。
 *
 * ⚠️ **两处依赖被显式注入（分层要点）**：
 *   ① **指纹生成器**（原 `zc`）—— `addAccount` 在 `hostOS` 不符/版本过期时要**重新生成**指纹；
 *      生成器本身（表 + 种子 PRNG）是**另一块**，且它的两个输入 `M$()`/`$$()` 会读
 *      **真实窗口尺寸与真实 GPU**（`window` / 宿主 webgl）⇒ **不纯** ⇒ 由 state/adapter 注入。
 *   ② **当前 OS**（原 `Uc()`，同样读宿主）与**指纹版本**（原 `Zh` = 3）。
 *
 * ⚠️ 原则 4：本模块不碰 `Date` / `window` / 宿主；`now` 一律注入。
 */

import type { Account, Fingerprint } from '@/stable/model/account';
import { normalizeAccountType } from '@/stable/model/account';
import { ACCOUNT_ID_PREFIX } from '@/stable/contracts/schemas';
import { nextAccountName, renumberAccounts } from './accountName';

/** 新账号的输入（原 `addAccount` 的入参 `n`） */
export interface NewAccountInput {
  type: string;
  /** 不给 ⇒ 按分组自动编号（`豆包01`） */
  name?: string;
  id?: string;
  groupId?: string | null;
  status?: string;
  partition?: string | null;
  addedAt?: number;
  autoStart?: boolean;
  fpSalt?: number;
  fingerprint?: Fingerprint | null;
  /** 仅 `other` 类型用（原 `s === 'other' && n.url || ''`） */
  url?: string;
  /** 仅 `lovart` 用；**传了就用它**（包括空串），不传才按池轮询 */
  proxy?: string;
}

export interface RosterDeps {
  /** 时间（原 `Date.now()`）—— 原则 4 注入 */
  now: number;
  /** 当前宿主 OS（原 `Uc()`） */
  os: Fingerprint['hostOS'];
  /** 指纹版本（原 `Zh` = 3） */
  fingerprintVersion: number;
  /** 指纹生成器（原 `zc(\`${id}#${fpSalt}\`)`） */
  generateFingerprint: (seed: string, os: Fingerprint['hostOS']) => Fingerprint;
  /** Lovart 代理池（原 `t().proxyPool`） */
  proxyPool?: readonly string[];
}

/** 默认登录态（原 `n.status || '已登录'`） */
const DEFAULT_STATUS = '已登录';

/**
 * 沿用传入的指纹，还是要重算？（原 `addAccount` 30194 的那个长三目）
 *
 * 规则：指纹存在 **且** `hostOS` 与当前 OS 相符 **且**（不是 windows **或** 版本一致）⇒ 沿用。
 * ⚠️ 与源逐字一致：**只有 windows 才校验版本号**（mac/linux 只比 `hostOS`）。
 */
function canReuseFingerprint(
  fp: Fingerprint | null | undefined,
  os: Fingerprint['hostOS'],
  version: number,
): fp is Fingerprint {
  if (!fp) return false;
  if (fp.hostOS !== os) return false;
  if (os !== 'windows') return true;
  return fp.ver === version;
}

/**
 * 组装一个新账号（原 `addAccount` 30159-30211 的**纯半**）
 *
 * ⚠️ **不含**「追加 + 重编号」——那步在 `addAccountToList`（源版是同一次 `vo([...r, u])`，
 *    拆开是为了能单独测"一个账号长什么样"）。
 */
export function buildNewAccount(
  accounts: readonly Account[],
  input: NewAccountInput,
  deps: RosterDeps,
): Account {
  const type = normalizeAccountType(input.type);
  const groupId = input.groupId ?? null;
  const fpSalt = input.fpSalt || 0;
  const id = input.id || `${ACCOUNT_ID_PREFIX}${deps.now.toString(36)}`;

  // 名字：给了就用，不给 ⇒ **其分组内同类型的下一个编号**
  const name = input.name || nextAccountName(accounts, type, groupId);

  const account: Account = {
    id,
    name,
    type,
    status: input.status || DEFAULT_STATUS,
    partition: input.partition ?? null,
    addedAt: input.addedAt || deps.now,
    groupId,
    autoStart: input.autoStart === true,
    fpSalt,
  };

  // 指纹：`other` 类型**没有**（原 `s === 'other' ? undefined : …`）
  if (type !== 'other') {
    account.fingerprint = canReuseFingerprint(input.fingerprint, deps.os, deps.fingerprintVersion)
      ? input.fingerprint
      : deps.generateFingerprint(`${id}#${fpSalt}`, deps.os);
  }

  // URL：只有 `other` 有（原 `s === 'other' && n.url || ''`）
  if (type === 'other') account.url = input.url || '';

  // Lovart 出口代理：**传了就用**（含空串），不传才按池轮询
  if (type === 'lovart') {
    if (input.proxy !== undefined) {
      account.proxy = input.proxy;
    } else {
      const pool = deps.proxyPool ?? [];
      const lovartCount = accounts.filter((a) => normalizeAccountType(a.type) === 'lovart').length;
      account.proxy = pool.length ? pool[lovartCount % pool.length] : '';
    }
  }

  return account;
}

/**
 * 加一个账号到名册（原 `addAccount` 的**整体纯半**：`vo([...r, u])`）
 *
 * ⚠️ 追加之后**必须重编号** —— 源版每次加号都跑 `vo`，于是删除留下的空洞会被补齐
 *    （`豆包01`/`豆包03` 再加一个 ⇒ 变成 `01`/`02`/`03`）。
 */
export function addAccountToList(
  accounts: readonly Account[],
  input: NewAccountInput,
  deps: RosterDeps,
): Account[] {
  return renumberAccounts([...accounts, buildNewAccount(accounts, input, deps)]);
}

/**
 * 从名册移除（原 `removeAccount` 30229-30236 的纯半）
 *
 * ⚠️ 源的完整流程还包含：**清该分区会话**（`clearAccountSession`，宿主调用，归 state/usecase）、
 *    清 `lovartGalleries[id]`（归 state）。本函数只负责**列表**。
 * ⚠️ 与源一致：移除后**也重编号**（`vo(o)`）。
 */
export function removeAccountFromList(accounts: readonly Account[], accountId: string): Account[] {
  return renumberAccounts(accounts.filter((a) => a.id !== accountId));
}
