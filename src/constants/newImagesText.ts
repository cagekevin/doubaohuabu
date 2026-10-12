/**
 * 「出新图」面板文案（原 `_Component26.jsx`）
 *
 * ★ **2026-10-11 从 `sendPanelText.ts` 拆出**：那个文件的**代码行**越过了 eslint `max-lines`(400)〔⚠️ **该规则已于 2026-10-11 关闭**〕
 *   ⇒ 按「一个文件只干一件事」，把这一族（全属「出新图」面板、彼此内聚）独立成文件。
 *   ⚠️ **公开入口不变**：`constants/text.ts` 仍转发 `NEW_IMAGES_TEXT`，消费方无需改 import。
 *
 * ⚠️ **文案逐字对源**（含源版拼写 `Tanpnow`、全角括号与「」）—— **例外只有两处**
 *   （`liveTitle` / `autoOnTitle`）：源版写「对**全部 Lovart / Tapnow** 账号」，而本工程
 *   **刻意跳过 Lovart**（`docs/过程.md` #11 · `main.js:2749` **只点名 Lovart**）⇒ 让 UI **说真话**
 *   优先于与源逐字（**行为本身就偏离**，文案不该假装没偏）。
 *
 * ⚠️ 本工程**已落**：聚合列表 / 发送到画布 / 从列表移除 / 折叠 / 只留本画布 /
 *   **立即抓取（四阶段状态机）** / ★ **自动值守**（`Ee` 428-592；能力由适配器声明
 *   `SitePort.autoWatch` —— `tapnow` 声明、`lovart` 刻意不声明） / ★ **长按拖出到系统**（`se`；6px 阈值）。
 *
 * ⛔ **不落**（逐条给理由，判据 B4/B5）：
 *   · `.nip-drop-active` 落点高亮（原 258-263）—— 它要给**跨层容器**（`.doubao-view-webviews`）挂
 *     **全局**类，而本仓只有 CSS Modules ⇒ 不为它开全局 CSS 例外（见 `NewImagesPanel.module.css` 头注）。
 */

export const NEW_IMAGES_TEXT = {
  /** 面板标题（原 605） */
  title: '出新图',
  /**
   * 自动值守中的小圆点 `title`（原 606）
   * ⚠️ **据实改**（同下条按钮的说明）：源版写「Lovart / Tapnow」，本工程**跳过 Lovart**。
   */
  liveTitle: '自动值守中：已开启「自启动」的账号出新图会自动出现（★ 跳过 Lovart —— 见 docs/过程.md #11），无需手动抓取',
  /** 聚合徽标 `title`（原 607，逐字） */
  aggTitle: '聚合自以下账号',
  /** 聚合徽标（原 607） */
  aggLabel: (n: number) => `聚合 ${n} 个账号`,
  /** 状态机文案（原 614 的三目） */
  statusIdle: '待机',
  statusScanning: '正在读取页面…',
  statusWorking: '抓取中…',
  /** 抓取按钮文案（原 `De` 599 的四路三目） */
  fetch: '⟳ 立即抓取',
  fetchCurrentPage: '⟳ 抓取本页图',
  fetchAll: '⟳ 抓取全部',
  fetchBusy: '抓取中…',
  /** 抓取按钮 `title`（原 671，逐字 —— 含源版拼写 `Tanpnow`） */
  fetchTitle: '立即抓取（当前活跃账号 / 全部 Lovart+Tanpnow）',
  /** 「只留本画布」开关（原 668-669） */
  onlyCurrent: '只留本画布',
  onlyCurrentOn: '● 只留本画布',
  onlyCurrentOnTitle: '当前仅显示当前账号画布图片，点击显示全部账号',
  onlyCurrentOffTitle: '当前显示全部账号图片，点击仅显示当前账号画布',
  onlyCurrentSwitchedOn: '已切换：只显示当前账号画布图片',
  onlyCurrentSwitchedOff: '已切换：显示全部账号画布图片',
  /** 缩略图 `title`（原 633，逐字；含**换行**） */
  thumbTitle: (name: string, dims: string, from: string) =>
    `点击发送到画布；长按拖拽可放入后台页面（Lovart / Tapnow / 其他网站）：${name}${dims ? `（${dims}）` : ''}\n来自：${from}`,
  /** 缩略图悬停遮罩（原 636，逐字） */
  overlay: '＋ 发送到画布 · 长按可拖入',
  /** 「NEW」徽标（原 637） */
  badgeNew: 'NEW',
  /** 「已发送」徽标（原 638，逐字） */
  badgeSent: '✓ 已发送',
  /** 大图徽标 `title`（原 639，逐字） */
  badgeBigTitle: '尺寸较大，发送前会确认',
  /** 大图徽标字（原 640） */
  badgeBig: '⚠',
  /** 移除按钮 `title`（原 646，逐字） */
  delTitle: '从列表移除（不影响画布）',
  /** 移除成功（原 330，逐字） */
  removed: '已从列表移除（不影响画布）',
  /** 元信息 `title`（原 652-654，逐字；含**换行**） */
  metaTitle: (name: string, host: string, acc: string) =>
    `${name}${host ? `\n来自 ${host}` : ''}\n账号：${acc}`,
  /** 折叠按钮 `title`（原 683，逐字） */
  foldCollapse: '收起出新图面板',
  foldExpand: '展开出新图面板',
  /** 折叠按钮字（原 684：`f ? '∨' : '∧'`） */
  foldExpandGlyph: '∨',
  foldCollapseGlyph: '∧',
  /** 大图确认（原 196-199，逐字；含**两处换行**） */
  bigConfirm: (name: string, meta: string) =>
    `「${name}」尺寸较大（${meta}）。\n发送到画布会保持原始分辨率与画质，仅显示尺寸自动缩放。\n\n继续发送吗？`,
  /** 发送成功（原 217，逐字） */
  sent: (name: string) => `已发送到画布 · ${name}`,
  /** 发送失败（原 220，逐字） */
  sendFailed: '发送失败：图片数据无效',
  /** 空态提示（本工程新增：源版空态只有一个抓取按钮） */
  emptyHint: '暂无新图。可点下面的按钮抓取，或先在「画廊」里把画布上的图收进来。',
  /** 抓取结果（原 411，逐字） */
  fetched: (n: number, failed: number) => `已抓取 ${n} 张新图${failed ? `，${failed} 张失败` : ''}`,
  /** 只失败（原 413，逐字） */
  failedOnly: (n: number) => `${n} 张取值失败`,
  /** 没有新的（原 415，逐字） */
  noNew: '没有新的图（页面上的图都已在列表里）',
  /** 没有可抓取的账号（原 343，逐字） */
  noAccounts: '没有可抓取的账号',
  /** 抓取中点了按钮（原 336，逐字；`warn` 2000ms）—— 面板入口的忙提示 */
  fetching: '正在抓取中，请稍候',
  /**
   * ★ **抓取编排**的忙 message（原 `wp:32535` 逐字）—— 抓取互斥闩被占时由
   * `core/usecases/scanGallery` 返回（源 `wp` 的 `error:'busy'`）。
   */
  busy: '上一次抓取还没结束',
  /**
   * ★ **自动值守按钮**（原 674-677 的三态：`dot` / `label` / `title`）
   *
   * ⚠️ **两处不逐字照抄的原因（写明）**：源版那两句写的是「**全部 Lovart / Tapnow** 账号」，
   *   而本工程**刻意跳过 Lovart**（`docs/过程.md` #11 · `electron/main.js:2749` **只点名 Lovart**；
   *   见 `adapters/site/lovart/index.ts` 为何不声明 `autoWatch`）⇒ 让 UI **说真话**优先于与源逐字。
   *   （可逐字的那些：`已暂停` / `自动抓取中` / 两条 toast —— 见下。）
   */
  autoRunning: '自动抓取中',
  /** 暂停态（原 676，逐字） */
  autoPaused: '已暂停',
  /** 未开启时的 `title`（原 674 的 `else` 分支，逐字） */
  autoOffTitle: '已暂停自动抓取，点击恢复',
  /** 开启时的 `title`（原 674 的 `if` 分支 —— 据实改：**跳过 Lovart**） */
  autoOnTitle:
    '当前对已开启「自启动」的账号每数秒自动抓取新图（★ 跳过 Lovart —— 见 docs/过程.md #11），点击暂停',
  /** 开关 toast（原 426 / 427，逐字；均 2000ms） */
  autoOnToast: '已开启全账号自动抓取',
  autoOffToast: '已暂停自动抓取',
  /** 拖拽幽灵里的提示（原 692，逐字） */
  ghostTip: '拖入当前页面',
  /** 拖出失败（宿主缺失 / 调用抛出）—— 原文透传上报（原则 6）；⚠️ 拖拽**成败本身不可知**（TD-16-63） */
  dragFailed: (why: string) => `拖出失败：${why}`,
} as const;
