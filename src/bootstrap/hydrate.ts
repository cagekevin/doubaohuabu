/**
 * 启动加载（**接线**，属 bootstrap 层）
 *
 * 依据：docs/过程.md §0.10 + docs/11 §八
 *
 * 职责边界：
 *   - 读键 / 写键的**编排**在 bootstrap（唯一可 import 全部的地方）
 *   - 数据归一逻辑是纯函数（`stable/migrations`）
 *   - 结果写入 store 由 state 层负责（这里只调 action）
 *
 * ⚠️ **没有"启动迁移"**（2026-10-10 删）：原 5 条迁移经真实样本实测**全部空转**
 *    ⇒ 它们服务的是**不存在的用户**（旧版本数据），按铁律 2 已删。
 *    详见 `stable/migrations/index.ts` 的头注。
 *
 * ⚠️ 但**启动归位**保留：上次崩掉时残留的"在途任务"不会有结果 ⇒ 每次启动都要清
 *    （`resetStaleJobs`，不是"为旧版本"，是"为上次运行"）。
 *
 * ⚠️ 原则 6：过程中的错误**原样上报**，不吞
 */

import type { Project } from '@/stable/model/project';
import type { Ports } from '@/core/ports';
import type { StorageRead } from '@/core/ports/storage.port';
import { PERSIST, type AppStore } from '@/state';
import { resetStaleJobs } from '@/stable/migrations';
import { ensureAccountPartitions } from '@/core/rules/accountRoster';
import { validateNodes } from '@/core/rules/node';
import { ensureLovartGalleries } from '@/core/rules/lovartGallery';
import { normalizePoolStrategy, pickInitialActiveAccount } from '@/core/rules/accountPick';
import {
  LS_ACCOUNT_GROUPS,
  LS_ACCOUNT_POOL_STRATEGY,
  LS_ACCOUNTS,
  LS_LOVART_GALLERIES,
  LS_PRESETS,
  LS_PROJECTS,
  LS_FACE_MASK_OPTS,
  LS_PROXY_POOL,
  LS_SCAN_HISTORY,
  LS_STYLES,
  type LsKey,
} from '@/stable/contracts/keys';
import { defaultStyles } from '@/core/rules/style';
import { normalizeFaceMaskOpts } from '@/core/rules/facemask';

export interface HydrateResult {
  /** 启动归位日志（供控制台/诊断） */
  notes: string[];
  /** 是否发生了归位（决定是否写回） */
  changed: boolean;
  /**
   * ★ **读不出来的键**（数据损坏 ／ 存储不可用；TD-06-1）
   *
   * ⚠️ `container` 把它交给 `persist` ⇒ **跳过这些键的写回** ——
   *    否则下一次防抖写盘就会把**可恢复的坏数据**覆盖掉（真丢数据）。
   */
  corruptKeys: LsKey[];
}

/**
 * 读一个键并归一到「值或默认」—— ★ **`corrupt` 会被记账**（TD-06-1）
 *
 * ⚠️ `corrupt`（有数据但读不出来）与 `missing`（本来就没有）**语义不同**：
 *    前者要进 `corruptKeys`（**防覆盖** + 可见），后者是正常态（走默认值即可）。
 */
function readOrDefault<T>(
  r: StorageRead<T>,
  key: LsKey,
  fallback: T,
  notes: string[],
  corruptKeys: LsKey[],
): T {
  if (r.kind === 'ok') return r.value;
  if (r.kind === 'corrupt') {
    corruptKeys.push(key);
    notes.push(`[hydrate] ${key} 数据损坏，已跳过（**不覆盖**）：${r.message}`);
  }
  return fallback;
}

/** 读取 → 启动归位 → 写回 → 灌入 store */
export function hydrate(store: AppStore, ports: Ports): HydrateResult {
  const { storage } = ports;
  const notes: string[] = [];
  /** ★ 读不出来的键（TD-06-1）—— 交给 `container` → `persist` 跳过写回 */
  const corruptKeys: LsKey[] = [];

  // ── 1. 读原始值（缺失即空数组 —— 「本来就没有」是正常态）──
  //    ⚠️ 一律走 `state/persistKeys` 的 `PERSIST`（**键的唯一落点**；用 `LS_*` 常量下标 ⇒ 类型精确）
  //    ★ TD-06-1：读结果是**三态**（`missing` / `ok` / `corrupt`）—— `corrupt` 走默认值**并记账**（防覆盖）
  const projects = readOrDefault(PERSIST[LS_PROJECTS].read(storage), LS_PROJECTS, [], notes, corruptKeys);
  const accounts = readOrDefault(PERSIST[LS_ACCOUNTS].read(storage), LS_ACCOUNTS, [], notes, corruptKeys);
  // ★ **账号分组 / 出口代理池 / 选号策略**（`doubao-account-groups` / `doubao-proxy-pool` /
  //   `doubao-account-pool-strategy`）—— **2026-10-12 补读回**。
  //   ⚠️ 此前这三键**只写不读**（`usecases/persistAccounts` 写 · 本文件不读）⇒ **重启即丢**
  //     （与 `docs/过程.md` §2 的 ⭐ 同型；那次只修了 accounts / 画廊 / 体检历史 / 预设 / 风格 / 遮脸）。
  //   ⚠️ 源读方：`CT()`（groups，26600）· `hT()`（proxyPool，26251）· `Ou()`（策略，34480）。
  const groups = readOrDefault(PERSIST[LS_ACCOUNT_GROUPS].read(storage), LS_ACCOUNT_GROUPS, [], notes, corruptKeys);
  const proxyPool = readOrDefault(PERSIST[LS_PROXY_POOL].read(storage), LS_PROXY_POOL, [], notes, corruptKeys);
  // 策略另有**合法性校验**（源 `Ou`：不在选项表 ⇒ 回落 `'round-robin'`）—— 与 `faceMaskOpts` 同法
  const poolStrategy = normalizePoolStrategy(
    readOrDefault(PERSIST[LS_ACCOUNT_POOL_STRATEGY].read(storage), LS_ACCOUNT_POOL_STRATEGY, null, notes, corruptKeys),
  );
  // ★ Lovart 画廊（原 `ET` 26637：读不到 ⇒ `{}`）
  //   ⚠️ **2026-10-12（`TD-02-3`）接线**：源 `ET` 的判据是「**是对象才收，否则 `{}`**」——
  //     此前该判据半**无任何消费者**，而 `readOrDefault` 的 ok 分支**不做形状判定**
  //     ⇒ 盘上若是 `"null"` / `"[1,2]"` 这类**合法 JSON 但非对象**，会漏进 store
  //     ⇒ 在这里补上源的那道防线（`ensureLovartGalleries`；parse 半归读层，不双解析）。
  const lovartGalleries = ensureLovartGalleries(
    readOrDefault(
      PERSIST[LS_LOVART_GALLERIES].read(storage),
      LS_LOVART_GALLERIES,
      {},
      notes,
      corruptKeys,
    ),
  );
  // ★ 指纹体检历史（源 `fT` 26232：读不到 ⇒ 空数组）
  const scanHistory = readOrDefault(PERSIST[LS_SCAN_HISTORY].read(storage), LS_SCAN_HISTORY, [], notes, corruptKeys);
  // ★ 节点 / 提示词预设（源 `Tk` 26618：读不到 ⇒ 空数组）
  //   ⚠️ 此前该键**读都不读** ⇒ 用户已有预设重启即不可见（`docs/过程.md` §1 #5）
  const presets = readOrDefault(PERSIST[LS_PRESETS].read(storage), LS_PRESETS, [], notes, corruptKeys);
  /**
   * ★ **风格预设**（`doubao-styles`，源 store 的 `styles: kT()`）—— 2026-10-11 补：
   *   此前该键只在**死导出** `loadStylePresets` 里被读过（**从无调用方**）⇒ `styles` 从不进 store。
   *   ⚠️ 兜底与源同法：读不到 / 读出来是**空表** ⇒ 用**内置表**（不是空表 —— 空表会让风格按钮无处可点）。
   */
  /**
   * ★ **遮脸参数**（`doubao-face-mask-opts`）—— 2026-10-11 补：此前该键只在 `persistKeys` 登记，
   *   **读都没读**（源 `D$()` 开机就读）。
   *   ⚠️ 兜底走 `normalizeFaceMaskOpts`（顺带 clamp 手改过的脏值）。
   */
  const faceMaskOpts = normalizeFaceMaskOpts(
    readOrDefault(PERSIST[LS_FACE_MASK_OPTS].read(storage), LS_FACE_MASK_OPTS, null, notes, corruptKeys),
  );
  const readStyles = PERSIST[LS_STYLES].read(storage);
  const stylesRead = readOrDefault(readStyles, LS_STYLES, defaultStyles(), notes, corruptKeys);
  // ⚠️ 冻结契约把该键标成 `readonly StylePreset[]` ⇒ 拷一份**可变**数组进 store
  const styles = stylesRead.length > 0 ? [...stylesRead] : defaultStyles();

  // ── 2. 启动归位：清在途任务状态（每次启动都要；不是迁移）──
  const reset = resetStaleJobs<Project>(projects);
  notes.push(...reset.notes);

  // ── 2.1 启动归位：给缺分区的账号补一个账号专属分区（见 `ensureAccountPartitions` 头注）──
  //   ⚠️ 必须在**写回之前**：补出来的值要落盘，**数据本身**才满足 `Account.partition: string`
  //      这条不变量 ⇒ 消费侧（发送入口 / `<webview partition>`）因此**一行兜底都不需要**。
  //   ⚠️ 不这么做 ⇒ 盘上那些 `partition: null` 的账号**永久不可用**（发送入口第一句就拒），
  //      用户唯一出路是删号重建 —— 那是把本仓缺陷的代价转嫁给用户。
  const accFix = ensureAccountPartitions(accounts, {
    now: ports.clock.now(),
    // ⚠️ 随机源在**接线层**取：原则 4 只禁 `core` / `stable` 自取（与 `container` 的 `roster()` 同法）
    rand: () => Math.random(),
  });
  notes.push(...accFix.notes);

  // ── 2.5 ★ **节点体检**（接线 `TD-02-13`）──
  //   ⚠️ 此前 `core/rules/node.ts` 的 `validateNode` / `validateNodes` 已实现且**有单测**，
  //      但**零生产消费** ⇒ `stable/model/node.ts` 里「字段级不变量由 … 在**运行时**校验」
  //      是**假声称**（该处已按本债改成如实）。现在在**加载**时真跑一次：
  //      老工程数据 / 手改过的文件能被体检出来。
  //   ⚠️ **只如实上报，不拦不修**（原则 6 —— 修数据是用户的决定，不是我们的）。
  const issues = reset.value.flatMap((p) => validateNodes(p.data.nodes));
  if (issues.length > 0) {
    const MAX_LOGGED = 20;
    const shown = issues.slice(0, MAX_LOGGED);
    for (const it of shown) notes.push(`[hydrate] 节点体检 ${it.nodeId}.${it.field}：${it.message}`);
    if (issues.length > shown.length) {
      notes.push(`[hydrate] 节点体检：另有 ${issues.length - shown.length} 条未列出（共 ${issues.length} 条）`);
    }
  }

  // ── 3. 写回（**只写真的改了的情况**；失败原样上报，不吞）──
  //   ★ TD-06-1：`doubao-projects` **读不出来时绝不写回**（否则覆盖可恢复的坏数据）。
  //     （当前逻辑下 `corrupt ⇒ projects=[] ⇒ reset.changed=false` —— 本守卫把那个**隐含耦合显式化**）
  if (reset.changed && !corruptKeys.includes(LS_PROJECTS)) {
    try {
      storage.writeRaw(LS_PROJECTS, JSON.stringify(reset.value));
    } catch (e) {
      // ★ 原样透传（原则 6）
      notes.push(`[hydrate] 归位结果写回失败 → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ★ 账号归位**同理**：`doubao-accounts` 读不出来时**绝不写回**（否则覆盖可恢复的坏数据）
  if (accFix.changed && !corruptKeys.includes(LS_ACCOUNTS)) {
    try {
      storage.writeRaw(LS_ACCOUNTS, JSON.stringify(accFix.value));
    } catch (e) {
      // ★ 原样透传（原则 6）
      notes.push(`[hydrate] 账号归位结果写回失败 → ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── 4. 灌入 store（**经 state 的具名 action** —— 本文件在 bootstrap，不得写 store）──
  //   ⚠️ 这里**没有** `setState` 可用：`AppStoreHook` 的对外类型已摘掉它
  //      ⇒ 直写是**编译错误**（原则 1 的**结构承载**，不是靠闸拦）。
  const first = reset.value[0];
  store.useStore.getState().loadHydrated({
    projects: reset.value,
    // ⚠️ 用**归位后**的数组（消费侧直读 `partition` ⇒ store 里必须是补齐过的）
    accounts: accFix.value,
    groups,
    proxyPool,
    poolStrategy,
    lovartGalleries,
    scanHistory,
    presets,
    styles,
    faceMaskOpts,
    activeId: first?.id ?? null,
    ...(first ? { canvas: first.data } : {}),
  });

  // ★ **「当前账号」的初值**（原 `shared.js:26791-26805` 的 IIFE）—— **2026-10-12 补**
  //
  //   ⚠️ 在此处种，是因为 hydrate 是**唯一**从盘里读出 `accounts` 的地方（上面 `:86`）；
  //      `ui` 切片那一写入 `activeAccountId: null` 只是**兜底**，真正的初值语义在
  //      `core/rules/accountPick.pickInitialActiveAccount`（三级回退：已登录+autoStart → 已登录 → 首个）。
  //   ⚠️ 不另写第二份判定（"已登录"复用 `isAccountUsable`）；也不新增第二个读盘点。
  store.useStore.getState().setActiveAccountId(pickInitialActiveAccount(accFix.value));

  return { notes, changed: reset.changed || accFix.changed, corruptKeys };
}
