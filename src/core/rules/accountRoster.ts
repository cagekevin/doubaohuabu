/**
 * 账号名册（新增 / 移除）—— **纯半**（★ 必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - `addAccount` shared.js:30159-30217
 *   - `removeAccount` shared.js:30218-30247（**只取纯的那半**：写 store / 清会话是 state 与宿主的活）
 *   - `nextAccountName` 30167-30180 见 `./accountName`
 *
 * ★ **它在链上的位置**：`state/slices/global.ts:393` 的 `addAccount`（+ `state/accountOps`）的**纯半** ——
 *   写 store / 清会话归它们，本层只算「新名册」。
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
import { ACCOUNT_STATUS, normalizeAccountType } from '@/stable/model/account';
import { makeId } from './project';
import { nextAccountName, renumberAccounts } from './accountName';
import { newAccountPartition } from './partition';
// ★ 站点能力表（所有"某站点有没有 X"的唯一真源）—— 建号时那几处按类型分流**全问它**，
//   不在本文件另写站点名字面量（写两份 ⇒ 加站点时漏一处就是静默行为差）。
import { capsOf } from './siteCaps';
import type { MigrationOutcome } from '@/stable/migrations/types';

/** 新账号的输入（原 `addAccount` 的入参 `n`） */
export interface NewAccountInput {
  type: string;
  /** 不给 ⇒ 按分组自动编号（`豆包01`） */
  name?: string;
  id?: string;
  groupId?: string | null;
  status?: string;
  /** 显式给就用（导入路径 `persist:import_<id>`）；不给 ⇒ 由产生方生成账号专属分区 */
  partition?: string;
  addedAt?: number;
  autoStart?: boolean;
  fpSalt?: number;
  fingerprint?: Fingerprint | null;
  /** 仅**无固定地址**的站点用（能力表 `hasFixedUrl === false`；原 `s === 'other' && n.url || ''`） */
  url?: string;
  /** 仅**用代理池**的站点用（能力表 `usesProxyPool`）；**传了就用它**（包括空串），不传才按池轮询 */
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
  /**
   * `[0, 1)` 随机源（原 `Math.random()`）—— 原则 4：`core` 不得自取，由调用方注入。
   * 用途唯一：账号专属分区的随机后缀（源 `$P.jsx:32`）。
   */
  rand: () => number;
}

/**
 * 默认登录态（原 `n.status || '已登录'`）
 * ⚠️ **2026-10-12 越权收口**：原在此**又立了一个 `'已登录'` 字面量**（第三份）—— 改吃源头常量
 *    `ACCOUNT_STATUS.loggedIn`（`stable/model/account.ts:109` 的唯一定义）。
 */
const DEFAULT_STATUS = ACCOUNT_STATUS.loggedIn;

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
  // ★ **2026-10-12 越权收口**：原在此自拼 `acc_<base36>`（**无 seq 段**，源即如此）—— 委托唯一工厂
  //   （`makeId(kind, now)` 省略 seq 时就是这个形状）
  const id = input.id || makeId('account', deps.now);

  // 名字：给了就用，不给 ⇒ **其分组内同类型的下一个编号**
  const name = input.name || nextAccountName(accounts, type, groupId);

  /**
   * ★★ **分区的产生方就在此处（全仓唯一）**
   *
   * 显式给了就用（导入路径 `persist:import_<id>`，源 `OP.jsx:636`）；没给 ⇒ 生成**账号专属**分区
   * （源 `$P.jsx:35` 的 `persist:<type>_d_<ts36>_<rand36>`）。
   * ⇒ `Account.partition` 从此**恒有值**（类型已收窄为 `string`）——
   *   消费方一律直读，**不需要也不许**再兜一份「默认分区」。
   */
  const partition = input.partition || newAccountPartition(type, deps.now, deps.rand());

  const account: Account = {
    id,
    name,
    type,
    status: input.status || DEFAULT_STATUS,
    partition,
    addedAt: input.addedAt || deps.now,
    groupId,
    autoStart: input.autoStart === true,
    fpSalt,
  };

  // 指纹：只有需要指纹会话的类型才有（原 `s === 'other' ? undefined : …`；判据 = 能力表）
  if (capsOf(type).needsFingerprintSession) {
    account.fingerprint = canReuseFingerprint(input.fingerprint, deps.os, deps.fingerprintVersion)
      ? input.fingerprint
      : deps.generateFingerprint(`${id}#${fpSalt}`, deps.os);
  }

  // URL：只有**没有站点固定地址**的类型（自定义网站）才有（原 `s === 'other' && n.url || ''`；判据 = 能力表）
  if (!capsOf(type).hasFixedUrl) account.url = input.url || '';

  // 出口代理（只有用代理池的站点才有）：**传了就用**（含空串），不传才按池轮询（判据 = 能力表）
  if (capsOf(type).usesProxyPool) {
    if (input.proxy !== undefined) {
      account.proxy = input.proxy;
    } else {
      const pool = deps.proxyPool ?? [];
      const pooledCount = accounts.filter((a) => capsOf(a.type).usesProxyPool).length;
      account.proxy = pool.length ? pool[pooledCount % pool.length] : '';
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

/**
 * ★ **启动归位：给「缺分区」的账号补一个账号专属分区**（源 `$P.jsx:35` 的形状）
 *
 * ⚠️ **为什么它必须存在**（判据 = 「服务的是谁」）：
 *   本仓此前**没有任何分区产生方**（`buildNewAccount` 里写的是 `input.partition ?? null`）⇒
 *   盘上**所有**现存账号的 `partition` 都是 `null`。而分区是**消费侧直读**的身份字段 ——
 *   消费方拿它去定位 `<webview>`（`adapters/site/shared/webview.requireWebview`），定位不到就
 *   **如实抛错**（「未找到 partition=… 的 webview」）⇒ 不归位，这些账号**永久不可用**，
 *   唯一出路是「删号重建」= 把本仓缺陷的代价转嫁给用户。
 *
 * ⚠️ **它 ≠「为旧版本数据而写的迁移器」**（铁律 2 的判据仍是「留这个是为了谁」）：
 *   那些迁移服务**不存在的用户**（源版遗留格式，实测全空转，已删）；本函数服务**盘上真实存在的账号**。
 *   且**幂等** —— 补齐后 `changed === false`，此后不再命中。
 *
 * ⚠️ **它 ≠ 消费侧兜底**（兜底净减闸）：补出来的值由调用方**落盘**，
 *   此后**数据本身**满足不变量（`Account.partition: string`）⇒ 消费侧依旧**一行兜底都没有**。
 *   （若只在消费侧每次读时编一个默认值，那正是「默认值兜底」形态 —— 它会掩盖「产生方又缺了」。）
 *
 * @param accounts 盘上读出的账号（**不修改入参**）
 * @param opts.now / `opts.rand` 时间与随机一律注入（原则 4：`core` 不得自取）
 */
export function ensureAccountPartitions(
  accounts: readonly Account[],
  opts: { now: number; rand: () => number },
): MigrationOutcome<Account[]> {
  const notes: string[] = [];
  let fixed = 0;

  const value = accounts.map((a) => {
    if (a.partition) return a;
    const partition = newAccountPartition(a.type, opts.now, opts.rand());
    fixed += 1;
    notes.push(`[hydrate] 账号归位：给「${a.name}」补上会话分区 ${partition}`);
    return { ...a, partition };
  });

  if (fixed === 0) return { value: [...accounts], changed: false, notes: [] };
  notes.unshift(`[hydrate] 账号归位：${fixed} 个账号缺会话分区（此前无产生方）⇒ 已各补一个账号专属分区`);
  return { value, changed: true, notes };
}
