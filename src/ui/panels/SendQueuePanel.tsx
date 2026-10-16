/**
 * 发送队列面板 —— 对应原 `z3.jsx`（**288 行** = `TS` 的**视图半**）
 *
 * ★★ **它补的是队列的最后一环**：控制器（泵 + 逐项操作）与四块纯逻辑都就绪了，
 *   但此前**没有 UI 能触发 `enqueue`** —— 于是「加入队列」按钮也一直没渲染。
 *
 * 逐条对源：
 *   | 件 | 源 | 说明 |
 *   |---|---|---|
 *   | **1 秒 tick** | 58-66 | 只要有 `sending` 或"还在生成中"的项 ⇒ 每秒 bump 一次 state，**让等待时长刷新**（`tc` 只算到调用那一刻） |
 *   | 拖动 | 90-140 | `pointerdown` 记起点 ⇒ `pointermove` 算位移 ⇒ 夹进视口 ⇒ `pointerup` 落 `localStorage` |
 *   | ~~位置持久化~~ | ~~`U3`/`Pp`~~ | ⛔ **不做**：抽屉钉在画布左缘、满高，**没有可移动的余地**（`C25`）⇒ 拖拽与落盘都无消费者。
 *     ⚠️ **契约键 `LS_SENDQUEUE_POS` 与 `persistKeys` 里的条目保留** —— 它是 `stable/contracts` 里的
 *     **冻结字符串**（老数据 / 迁移可能仍要认它），删它属动契约、收益不成比例 |
 *   | 折叠 | 196-206 | `.sq-chevron` |
 *   | 进度条 | 209-215 | 完成数 / 总数 |
 *   | 列表 | 216-269 | 序号 + 名称 + 账号（未分配 ⇒ 待分配）+ 第N次 + note + 两个动作 + **成片行** |
 *   | 暂停/清空 | `j3`/`_3`/`A3` | 走控制器 |
 *
 * ✅ **2026-10-11 已接通（`TD-16-103`）**：源版的「成片行」吃三样 —— 队列项 + 节点 + **`queueProgress`**
 *   （`z3.jsx:13` 的 `A.queueProgress`）。此前本工程**没有这个 store 字段** ⇒ 这里硬写
 *   `progress: null`，第 ④ 组恒走"生成中"兜底。现在**生产者已归位**：`state/sendQueue` 的
 *   `runQueuePing` 在发出后追问页面一次（源 `_Component43.jsx:2200-2266`），把 `classifyReply`
 *   （源 `WR`）的产物写进 `store.queueProgress[itemId]` ⇒ 本组件直接读它喂第三参。
 *   ⚠️ **同日勘误**：原文写「由**发送端的 `onProgress` 回写**」**不成立** —— 回源后**唯一写入方**
 *   是队列泵里的「排队追问」轮询。证据见 `TD-16-103` 的日志 §八。
 * ★ **「查看」定位画布已接**（原 `z3.jsx` 的 `sq-btn ok` → `I(nodeId)` → `store.fitViewAction([nodeId])`，
 *   `z3.jsx:80-89`）：该节点已有出片（`data.resultUrl || data.resultPoster`）时渲染，点了经
 *   `state.requestFocusNodes([nodeId])` 请求，由 `CanvasHost`（持有 `useReactFlow().fitView`）消费。
 *   ⚠️ 面板与画布是 `AppShell` 里的**兄弟** ⇒ 走 store 传**请求数据**（与 `splitKeywordModal` 同法），
 *   **视图能力仍归 `ui`**。
 * ⚠️ **原则 1 + 铁律 2**：本组件只调 `useSendQueue()` 与 store action，不写 store、**也不持 `Ports`**
 *   —— 面板位置的读写经控制器，`ports.storage` 不进 `ui`（TD-16-8）。
 */

import { useEffect, useMemo, useState } from 'react';
import { cssVars } from '@/ui/common/cssVars';
import { useSendQueue, useStore } from '@/state';
import {
  formatElapsed,
  resolveGenProgress,
  type GenNodeLite,
  type GenProgressState,
  type GenReplyLite,
} from '@/core/rules/genProgress';
import { isActiveQueueStatus, queueStats } from '@/core/rules/sendQueueOps';
import type { QueueItem } from '@/core/rules/sendQueuePlan';
import { nextPoolStrategy } from '@/core/rules/accountPick';
import { SEND_QUEUE_TEXT } from '@/constants/text';
import { Icon } from '@/ui/common/Icon';
import styles from './SendQueuePanel.module.css';
import shared from '@/ui/common/shared.module.css';
import { PanelShell } from '@/ui/common/PanelShell';

/**
 * 抽屉宽（★ **唯一真源** —— `SendQueuePanel.module.css` 经 `--sq-panel-w` 消费）
 *
 * ⚠️ 原还有一个 `PANEL_H`（260）：那是**浮窗**形态的高度上界（配 `clampPanelPosition` 把坐标夹进视口）。
 *    改成抽屉后它是**满高**的（真值 = `mockup.css` 的 `.mk-sq { height: 100%; max-height: none }`）
 *    ⇒ `PANEL_H` 与 `--sq-panel-h` 一起**删**。
 */
const PANEL_W = 320;
/** tick 间隔（原 61-65 的 `setTimeout(…, 1000)`） */
const TICK_MS = 1000;

/**
 * `GenProgressState` → CSS 类后缀（`SendQueuePanel.module.css` 的 `gen_*`）
 *
 * ★ **表驱动**（不是把 `state` 直接当类名拼）：`Record<GenProgressState, string>` 逼**穷尽** ——
 *   `core` 将来新增/改名一个状态，这里就**编译不过**（不靠"两边都记得改"的约定）。
 * ⚠️ 类名归属 `ui`：`core/rules/genProgress` 只给**语义状态**，不认识 CSS（判据 A1）。
 */
const GEN_CLS: Record<GenProgressState, string> = {
  idle: 'idle',
  na: 'na',
  unknown: 'unknown',
  failed: 'failed',
  done: 'done',
  queued: 'queued',
  generating: 'generating',
};

/**
 * 队列项 `status` → 任务卡**状态点**档（真值 = 设计层 `.mk-task-state` 的四态；`mockup.css:743-754`）
 *
 * ⚠️ 五态的字面值 = 源版 `O3`（42459）的键：`waiting` / `sending` / `success` / `failed` / `cancelled`。
 * ⚠️ `cancelled` 归**灰**：源里 `.sq-status.cancelled` 就是 `panel-3` / `text-faint`（不是红）。
 * ⚠️ `QueueItem.status` 是 `string`（照源版字面形状 `$S` 41903，**故意不用联合类型**）⇒
 *   表外状态（将来新增 / 脏数据）统一落 `.st_queued` —— **不猜、也不新造第五色**。
 */
const QUEUE_DOT_CLS: Record<string, string> = {
  sending: 'running',
  waiting: 'queued',
  success: 'done',
  failed: 'failed',
  cancelled: 'queued',
};

export function SendQueuePanel() {
  const q = useSendQueue();
  const queue = useStore((s) => s.sendQueue);
  /** 后台进度（源 `A.queueProgress`）—— 「成片行」第三参；写入方 = `state/sendQueue` 的 `runQueuePing` */
  const queueProgress = useStore((s) => s.queueProgress);
  const concurrency = useStore((s) => s.accountConcurrency);
  const nodes = useStore((s) => s.nodes);
  /**
   * ★ **选号策略**（原 `z3.jsx:273` 的 `b`）—— 初值由 `bootstrap/hydrate` 从
   *   `doubao-account-pool-strategy` 读回；写方 = foot 的切换按钮。
   */
  const poolStrategy = useStore((s) => s.poolStrategy);
  const setPoolStrategy = useStore((s) => s.setPoolStrategy);
  /** ★ 「查看」→ 请求把画布定位到该出片节点（原 `I` → `store.fitViewAction([nodeId])`，`z3.jsx:80-89`） */
  const requestFocusNodes = useStore((s) => s.requestFocusNodes);

  const items = useMemo(() => queue?.items ?? [], [queue]);
  const paused = !!queue?.paused;

  /**
   * ★ **两级折叠**（真值 = `mockup.css:688-693` 与 `1201-1216`）—— 它们是**两个不同的动作**：
   *   ① `open` = **整个抽屉**开合：收起时面板 `translateX(-100%)` 滑出、**把手留在左缘**。
   *      默认 **收起** —— 设计稿原话：「默认收成一条竖钮（贴画布左缘），点开即本面板」
   *      （标记里那个 `is-open` 只是它要展示面板内容）。
   *   ② `collapsed` = **内容**折叠：只留头部 + 进度条（列表与脚藏起来）。
   */
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  /**
   * 当前时刻（ms）—— ★ **必须收进 state**：渲染期直接调 `Date.now()` 是**不纯调用**
   * （eslint `Cannot call impure function during render` 会拦）。
   * ⚠️ 与源一致：只在**忙**的时候由 1 秒 tick 刷新（闲下来就冻住，不影响显示
   *   —— 「已完成」那一档用的是 `resultAt`，不依赖"现在几点"）。
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  /*
   * ⚠️ 抽屉钉在画布左缘、满高 ⇒ **没有可移动的余地**：不做拖拽、不存位置。
   *   设计稿头上那句 `title="拖动可移动面板位置"` 是它照抄**原版浮窗**头的结果，不是抽屉的诉求 ⇒ 不实现。
   */

  const stats = useMemo(() => queueStats(items), [items]);
  const nodeById = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  /** 还有在做的事（原 58-60：有 `sending`，或某个成片行还是「生成中/排队中/状态未知」） */
  const busy = useMemo(
    () => items.some((it) => it.status === 'sending'),
    [items],
  );

  /**
   * ★ **1 秒 tick**（原 58-66）—— 让 `formatElapsed` 的"已等待"每秒往前走。
   * ⚠️ 只在**忙的时候**才排下一次（闲下来就停，不会白烧 CPU）。
   */
  useEffect(() => {
    if (!busy || collapsed) return;
    const id = setTimeout(() => setNowMs(Date.now()), TICK_MS);
    return () => clearTimeout(id);
  }, [busy, collapsed, items, nowMs]);

  /**
   * ★★ **左抽屉常驻**（★ **有意偏离源版**，用户裁定 2026-10-16）
   *
   * 设计层把 `.mk-drawer-handle` 当**外壳元素**：`mockup.css:91` 的壳元素组里就有它，
   * 且明写「默认收成一条竖钮（贴画布左缘），点开即本面板」——**它属于外壳，不随队列有无出现/消失**。
   * 源版相反：`z3.jsx:186-188` 是 `if (!m.length) return null;`（空队列**整块不出现**）。
   * 裁定：**按设计稿** —— 左侧栏是外壳的一部分，**"空队列时这条侧栏整个消失"比"开着是空的"更糟**
   * （用户实机观感即此，见 `daily/架构日志/16-跨区-…-2026-10-16.md`）。
   *
   * ⚠️ **空队列不新造空态**：设计稿没画「队列空态」那一格 ⇒ 面板就是**同一副壳、列表为空**
   *   （分组标题也随之为空 —— 见 `renderItem` 上方的分组注释），不写「暂无任务」这类自造文案。
   * ⚠️ 角标只在**有待办**时出现（设计稿给的是 `pending` 数；0 条时画个 `0` 是噪声）。
   */

  const done = stats.success + stats.failed + stats.cancelled;
  /** 待办（还没结束的）—— 把手上那个角标（真值 = `.mk-drawer-badge`）*/
  const pending = stats.total - done;
  /**
   * 总进度条 —— ★ 提出来是**为了让它不被内容折叠藏掉**：
   * 设计稿的「内容折叠」= 只留头部 + **进度条**（`mockup.css:688-690` 只 `display:none` 了列表与脚）。
   */
  const progressBar = (
    <div className={`${shared.progressTrack} ${styles.trackInset}`}>
      <div
        className={shared.progressFill}
        style={{ width: `${stats.total ? Math.round((done / stats.total) * 100) : 0}%` }}
      />
    </div>
  );

  /**
   * 一张**任务卡**（原 `z3.jsx:227-268` 的 `.sq-item`）
   *
   * ★ **真值 = 设计层 `index.html:464-517`**（`.mk-task` 一族）：状态点在左槽 · 名称是主 ·
   *   账号 / 状态 / 耗时在次行（`·` 分隔）· 说明行单行截断 · 操作是**靠右的图标钮**。
   * ⚠️ 与设计稿的一处**有意差异**：它 ② 那格把状态写作「排队中」，而本工程按源版 `B0` 推导 ——
   *   队列项还在 `waiting` 时**这个节点一次都没成功过** ⇒ 源给的是「生成未开始」
   *   （`GEN_PROGRESS_TEXT.notStarted`）。「排队」这件事由**状态点**（灰）表达 —— 正是设计稿 ② 的原话
   *   「不读字也能扫出状态」。
   */
  const renderItem = (it: QueueItem) => {
    const node = nodeById.get(it.nodeId);
    // ★ 该节点是否已有出片（原 `ke` = `H.data.resultUrl || H.data.resultPoster`）——
    //   决定「查看」渲不渲染（源同判据）
    const hasResult = !!(node?.data?.resultUrl || node?.data?.resultPoster);
    // ★ 后台进度（源 `A.queueProgress[item.id]`）—— 由 `state/sendQueue` 的 `runQueuePing` 写（`TD-16-103`）
    const progress: GenReplyLite | null = queueProgress[it.id] ?? null;
    const g = resolveGenProgress(
      {
        status: it.status,
        startedAt: it.startedAt ?? null,
        finishedAt: it.finishedAt ?? null,
        accountId: it.accountId ?? null,
      },
      node ? { data: node.data as GenNodeLite['data'] } : null,
      progress,
      nowMs,
    );
    // 字段改名只在这一处（`state`→`cls`、`elapsed`→`wait`）—— 视图要的四个名字就齐了
    const gen = { text: g.text, cls: GEN_CLS[g.state], wait: g.elapsed, note: g.note };
    /** 还在跑？（原 `z3.jsx:222` 的 `U`）—— 判据走真源 `isActiveQueueStatus`，别在这里重写字面量 */
    const active = isActiveQueueStatus(it.status);
    /** 成片状态那一格显不显示（源：`na` = 连生成记录都没有 ⇒ 次行只留账号） */
    const showGen = gen.cls !== 'na' || !!gen.wait;

    return (
      <div className={styles.item} key={it.id}>
        <div className={styles.itemTop}>
          {/* 状态点（装饰性：状态语义由次行的成片文案 + 规则里的状态推导承载，故对读屏隐藏） */}
          <span
            className={`${styles.stateDot} ${styles[`st_${QUEUE_DOT_CLS[it.status] ?? 'queued'}`]}`}
            aria-hidden="true"
          />
          <span className={styles.name} title={it.name || it.nodeId}>
            {it.name || it.nodeId}
          </span>
          <span className={styles.acts}>
            {/* ★ 「查看」（原 `z3.jsx` 的 `sq-btn ok`）—— 有出片才渲染；点了把画布定位过去 */}
            {hasResult ? (
              <button
                type="button"
                className={styles.iconBtn}
                title={SEND_QUEUE_TEXT.viewTitle}
                onClick={() => requestFocusNodes([it.nodeId])}
              >
                <Icon name="eye" />
              </button>
            ) : null}
            {active ? (
              <button
                type="button"
                className={styles.iconBtn}
                title={SEND_QUEUE_TEXT.cancelTitle}
                onClick={() => q.cancel(it.id)}
              >
                <Icon name="x" />
              </button>
            ) : (
              <button
                type="button"
                className={styles.iconBtn}
                title={SEND_QUEUE_TEXT.retryTitle}
                onClick={() => q.retry(it.id)}
              >
                <Icon name="refresh" />
              </button>
            )}
          </span>
        </div>

        {/* 次行：账号 · 成片状态 · 已耗时 · 第N次（真值 = 设计层 `.mk-task-meta`） */}
        <div className={styles.meta}>
          {it.accountName ? (
            <span className={styles.acc}>{it.accountName}</span>
          ) : (
            <span className={`${styles.acc} ${styles.accPending}`}>
              {SEND_QUEUE_TEXT.accountPending}
            </span>
          )}
          {showGen && (
            <>
              <span className={styles.sep}>·</span>
              <span className={styles[`gen_${gen.cls}`] ?? ''}>{gen.text}</span>
              {gen.wait && <span className={styles.genWait}>{gen.wait}</span>}
            </>
          )}
          {(it.attempt || 0) > 1 && (
            <span className={styles.attempt}>{SEND_QUEUE_TEXT.attempt(it.attempt)}</span>
          )}
        </div>

        {/* 说明行（原 `.sq-note` 与 `.sq-gen-note` 两处）—— 都收进同一行的样式里，单行截断 */}
        {it.note && (
          <div className={styles.note} title={it.note}>
            {it.note}
          </div>
        )}
        {gen.note && (
          <div className={styles.note} title={gen.note}>
            {gen.note}
          </div>
        )}
      </div>
    );
  };

  /** 分组（真值 = 设计层 `index.html:462` / `499` 的 `.mk-sq-group`）—— 在跑的在前、已结束的在后 */
  const activeItems = items.filter((it) => isActiveQueueStatus(it.status));
  const doneItems = items.filter((it) => !isActiveQueueStatus(it.status));

  return (
    /* ★ **抽屉**（真值 = `mockup.css:606-693`）：容器铺满画布左缘**只为定位**、且不吃指针；
       `--sq-panel-w` 下发在**容器**上 —— 把手（展开时要跟到面板右缘）与面板都要读它。 */
    <div
      className={`${styles.drawer}${open ? ` ${styles.drawerOpen}` : ''}`}
      style={cssVars({ '--sq-panel-w': `${PANEL_W}px` })}
      data-testid="send-queue-drawer"
    >
      {/* 抽屉开关（设计稿原话：「一个圆钮：图标 + 角标，**不写字**」）*/}
      <button
        type="button"
        className={styles.drawerHandle}
        title={SEND_QUEUE_TEXT.title}
        aria-label={SEND_QUEUE_TEXT.title}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <Icon name="queue" />
        {pending > 0 && <span className={styles.drawerBadge}>{pending}</span>}
      </button>

      <PanelShell
        variant="drawer"
        className={`${styles.panel}${collapsed ? ` ${styles.isCollapsed}` : ''}`}
        testId="send-queue-panel"
        /* ★ 头走**常驻面板头**那一档（真源 `.panelHeadCompact`，矮一档 + 36 高）。
           ⚠️ 本地 `.head` 此前**是死类** —— `PanelShell` 内部渲染 `shared.panelHead`，
              从来没被传进去；现在经 `headProps.className` 真接上。 */
        headProps={{ className: styles.head }}
        title={SEND_QUEUE_TEXT.title}
        meta={
          <>
            <span className={styles.conc} title={SEND_QUEUE_TEXT.concurrencyTitle(concurrency)}>
              {`×${concurrency}`}
            </span>
            <span className={styles.statusline}>
              {paused ? SEND_QUEUE_TEXT.paused : SEND_QUEUE_TEXT.running(done, stats.total)}
            </span>
          </>
        }
        actions={
          <button
            type="button"
            className={styles.chevron}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed((v) => !v);
            }}
          >
            <Icon name="chevron" className={collapsed ? shared.iconDown : shared.iconUp} />
          </button>
        }
      >
        {progressBar}

        {!collapsed && (
          <>
            <div className={styles.list}>
              {activeItems.length > 0 && (
                <>
                  <div className={styles.group}>{SEND_QUEUE_TEXT.groupActive}</div>
                  {activeItems.map(renderItem)}
                </>
              )}
              {doneItems.length > 0 && (
                <>
                  <div className={styles.group}>{SEND_QUEUE_TEXT.groupDone}</div>
                  {doneItems.map(renderItem)}
                </>
              )}
            </div>

          <div className={styles.foot}>
            {/* ★ **选号策略**（原 `z3.jsx:271-276`）—— foot 最左一颗；点一下在两种策略间切换 */}
            <button
              type="button"
              className={styles.btn}
              title={SEND_QUEUE_TEXT.strategyToggleTitle}
              onClick={() => setPoolStrategy(nextPoolStrategy(poolStrategy))}
            >
              {SEND_QUEUE_TEXT.pickAccountPrefix}
              {SEND_QUEUE_TEXT.strategyLabels[poolStrategy]}
            </button>
            <button type="button" className={styles.btn} onClick={() => (paused ? q.resume() : q.pause())}>
              {paused ? SEND_QUEUE_TEXT.resume : SEND_QUEUE_TEXT.pause}
            </button>
            {/* ⚠️ 源版这颗是**有门控**的（`z3.jsx:280` 的 `disabled={!D}`，`D` = 已结束计数）——
                `C42` 把面板改成"空队列也常驻"之后，没有门控就会出现"点了没反应"的死按钮 */}
            <button
              type="button"
              className={styles.btn}
              disabled={done === 0}
              onClick={() => q.clearFinished()}
            >
              {SEND_QUEUE_TEXT.clearDone}
            </button>
            <span className={styles.footHint}>{formatElapsed(items[0]?.startedAt ?? null, null, nowMs)}</span>
          </div>
        </>
      )}
      </PanelShell>
    </div>
  );
}
