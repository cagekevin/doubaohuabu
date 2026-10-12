/**
 * UI 文案（★ SSOT：全部面向用户的字符串的唯一真源）
 *
 * 依据：docs/03-人类版.md §8（文案归类）+ docs/04-AI协议版.md 附表（14 项失败分类）
 * 铁律：**文案只允许出现在本文件**（store / core / ui 都不得硬编码）
 *
 * ⚠️ 原则 6（错误透传）：这里的文案是**展示层映射**，**不得覆盖**原始错误 message。
 *    原始 message 必须一路透传到 UI，本表只提供「按 reason 分类的提示语」。
 */

// 文案只依赖 L0（constants）内的 kind 联合，不依赖 core（分层：L0 不得依赖 L2）
export { FAIL_LABEL, BACKEND_ERROR_LABEL } from './failure';
// ⚠️ 发送/面板文案的**分片转发**（定义在 `sendPanelText.ts`，见那里的头注释）
export { ACCOUNT_NODE_TEXT, ACCOUNT_PICKER_TEXT, AUTO_MATCH_TEXT, BATCH_SEND_TEXT, DOWNLOAD_NODE_TEXT, EDGE_TEXT, EXPORT_TEXT, FP_DIAG_TEXT, FUZZY_TEXT, FP_SCAN_TEXT, GALLERY_TEXT, GEN_IMAGE_TEXT, GEN_PANEL_TEXT, GEN_VIDEO_TEXT, GROUP_MANAGER_TEXT, GROUP_NODE_TEXT, IMAGE_EDITOR_TEXT, MATERIAL_NODE_TEXT, MEDIA_PLAYER_TEXT, NODE_CTX_TEXT, PRESET_TEXT, PROXY_TEXT, SELECT_TOOLBAR_TEXT, SEND_QUEUE_TEXT, SPLIT_TEXT, STYLE_LIB_TEXT, VIDEO_NODE_TEXT, WATERMARK_PANEL_TEXT } from './sendPanelText';
// ⚠️ 以下三处分片由 eslint `max-lines`(400) 触发 —— **该规则已于 2026-10-11 关闭**（分片的"各组彼此内聚"理由仍成立，但不再有"必须 <400 行"的硬约束）。
// ⚠️ 2026-10-11：从 `sendPanelText.ts` **拆出**（那个文件代码行越过 eslint `max-lines`(400)）——
//    「出新图」那一族彼此内聚，独立成 `newImagesText.ts`。**公开入口不变**（仍从 `@/constants/text` 取）。
export { NEW_IMAGES_TEXT } from './newImagesText';
// ⚠️ 2026-10-11：从 `text.ts` **拆出**（本文件又撞 `max-lines`：432 > 400）——
//    「API 服务」面板那一族彼此内聚，独立成 `apiSettingsText.ts`。**公开入口不变**。
export { API_SETTINGS_TEXT } from './apiSettingsText';
// ★ 2026-10-11 从本文件拆出（`max-lines` 同先例）：项目**保存路径**那一族 ⇒ `PROJECT_STORAGE_TEXT`
//   独立成 `projectStorageText.ts`（它刻意不反向 import 本文件，避免成环）。**公开入口不变**。
export { PROJECT_STORAGE_TEXT } from './projectStorageText';

/**
 * toast 语气（原 `showToast(text, 'info' | 'warn' | 'err')`）
 *
 * ★ **2026-10-10 补**：`state/slices/ui.ts` 的 `pushToast` 原先**只有 message + duration**、
 *   没有语气 ⇒ 源版「同一句话按 info / warn / err 分级」的信息**全丢了**（都用同一个样式）。
 *
 * ⚠️ **放 `constants/` 而不是 `state/`**：`core/usecases`（如 `analyzePrompt`）要产出这个语气，
 *   而 core **不得向上依赖 state** ⇒ 与 `BackendErrorKind`（在 `constants/failure`）同法收口。
 * ⚠️ 源版第三档写作 `'err'`，本工程统一为 `'error'`（与 `BackendErrorKind` 的命名一致）。
 * ★ **2026-10-11 补 `'success'`**：源 `showToast` 的 `type` 实测有 **5 档**
 *   （`info`/`warn`/`err`/`error`/`success`，全仓 14 处用 `'success'`），而本工程此前**漏了 `'success'`**
 *   ⇒ API 回灌的「API 图片已存入资源库」这类成功提示**传不进来**（类型不认）。
 *   ⚠️ 诚实标注：`ui/common/ToastHost` 给 `warn` / `error` / **`success`** 各上一色
 *   （`success` 用 `--color-success`，2026-10-11 补）—— 与源 `.app-toast-${type}` 四档对齐。
 */
export const TOAST_LEVELS = ['info', 'warn', 'error', 'success'] as const;
export type ToastLevel = (typeof TOAST_LEVELS)[number];

/**
 * 通用文案（**跨域复用** —— 避免同一句在多个域各写一遍，判据 C1）
 *
 * ⚠️ 声明在所有域常量之前（下面的域常量会引用它）。
 */
export const COMMON_TEXT = {
  /**
   * 后端没给原因时的兜底原文
   *
   * 来源：原版多处写 `Ze.error || '未知错误'`（`_Component42.jsx:318`）与
   * `E?.error || '未知错误'`（`W3.jsx:96`）—— **同一句**，故只留一处真源。
   */
  unknownReason: '未知错误',
  /**
   * ★ **2026-10-11 收口（判据 C1）**：下载相关的 4 句**同时出现在**文生视频（`YL.jsx:363,370,391,392`）
   *   与文生图（`ZL.jsx:120,127,148,149`）**两个域**、且**逐字相同** ⇒ 收到 `COMMON_TEXT`（跨域复用）。
   *   各节点自己的「下载」按钮文案仍留在各自域（`GEN_VIDEO_TEXT.download` / `GEN_IMAGE_TEXT.download`）。
   */
  /** 下载失败前缀（两处源均：`'下载失败：' + (error || '未知错误')`，逐字） */
  downloadFailed: (reason: string) => `下载失败：${reason}`,
  /** 「另存为」成功（两处源均：`已下载到：${path}`，逐字） */
  downloadedTo: (path: string) => `已下载到：${path}`,
  /** 下载 toast 的操作按钮（两处源均，逐字） */
  revealInFolder: '在文件夹中显示',
  /** 「另存为」过滤器名（两处源均：`'图片文件'`，逐字） */
  imageFilter: '图片文件',
  /**
   * ★ **2026-10-11 收口（判据 C1）**：**历史版本**弹层里这 3 个「缺省值」在
   *   文生视频（`YL.jsx:595,596,609,615`）与文生图（`ZL.jsx:305,307,309`）**逐字相同**
   *   ⇒ 收到 `COMMON_TEXT`。各节点独有的（`历史 N` / 标题 / 条目 title）仍在各自域。
   */
  /** 比例兜底（两处源均：`|| '自动'`，逐字） */
  autoLabel: '自动',
  /** 空值占位（两处源均：账号 / 时长兜底 `'—'`，逐字） */
  dash: '—',
  /** 无提示词（两处源均：`'（无提示词）'`，逐字） */
  noPrompt: '（无提示词）',
  /**
   * 宿主边界契约违约（后端返回的形状与声明契约不符）
   *
   * ⚠️ 与 `unknownReason` 的区别：那句是「后端说了失败但没给原因」；
   *    本句是「后端连 `ok` 标志 / 必需字段都没给」—— 是**形状漂移**（schema drift），
   *    必须如实报出来，**不能静默当成功**（否则失败被伪装成「成功且值为空」）。
   */
  boundaryViolation: (field: string) => `宿主返回缺少必需字段 ${field}（契约违约）`,
  /**
   * 提示词为空时的占位（**本工程新增** —— 回源 0 命中）
   *
   * ★ **2026-10-12（`TD-09-1`）**：`GenImageNode` 与 `GenVideoNode` **各写了一遍**同一句
   *   ⇒ 两份（母体 M3）⇒ 收在这里一处，两处委托。
   * ⚠️ 收它的理由**不是"源里有"**（源里没有）—— 而是「**用户可见文案只写一遍**」：
   *   本文件的自述就是「只放 UI 独有文案」。判据用错会留下下一处漂移
   *   （同轮刚修掉一处：`Thumb` 写"无图"、源写"暂无图片"）。
   */
  emptyPrompt: '（空提示词）',
  /**
   * 「正在生成」的按钮/占位文案（**本工程新增** —— 回源 0 命中；源里那个**无省略号**的
   *   `生成中` 是 API 任务状态条的标签（`ZL.jsx:324`），**不是同一句**，别混）
   *
   * ★ **2026-10-12（`TD-09-1`）**：两处消费者 —— `GenPanel` 的运行按钮（`busy ? … : …`）
   *   与 `GenImageNode` 的占位（`data.generating ? …`）⇒ 放通用层，各自委托。
   */
  generating: '生成中…',
  /** 关闭按钮的无障碍名（**本工程新增** —— 源里没有对应 aria） */
  closeAria: '关闭',
} as const;

/** 品牌 / 启动页 */
export const BRAND = {
  name: '豆包画布',
  tagline: '无限画布 · 素材连线 · 智能创作',
  newProject: '＋ 新建项目',
  openHistory: '打开历史项目',
  emptyHistory: '暂无历史项目，点击上方新建一个吧',
  importProject: '导入项目文件（.json）',
  untitledProject: '未命名项目',
} as const;

/**
 * 授权 / 加载
 *
 * ★ 2026-10-10 修正（按原版 `H3` 42609-42623 **逐字对齐**）：
 *   · `永久授权` → **`永久`** —— `永久授权` 在**原版全仓 0 命中**（已 `grep` 核实）
 *   · `剩余 N 天/小时` → **`剩余约 N 天/小时`**（原版有「约」字）
 *   ⇒ 这是**行为不等价**（用户可见文案），不是风格差异。
 */
export const LICENSE_TEXT = {
  checking: '正在校验授权…',
  fetchFailed: '授权状态获取失败',
  /** 原 `W3.jsx:55` 的 `(S?.error) || '导出已取消'` */
  exportCanceled: '导出已取消',
  /** 原 `H3` 42616 */
  permanent: '永久',
  /** 原 `H3` 42612 */
  expired: '已过期',
  /** 原 `H3` 42619 */
  remainingDays: (d: number) => `剩余约 ${d} 天`,
  /** 原 `H3` 42622（`Math.max(h, 1)` ⇒ 剩 5 分钟也显示 1 小时） */
  remainingHours: (h: number) => `剩余约 ${h} 小时`,

  // ── 激活页（原 `W3.jsx` 192 行 = 授权门的**视图半**）──
  /** 品牌（原 115 的 `alt` 与 116） */
  brand: '豆包画布',
  sub: '软件授权激活',
  /** 四条 banner 的标题与描述（原 121-149，**逐字**） */
  bannerOk: '已激活',
  bannerOkDesc: (at: string, left: string) => `有效期至 ${at}（${left}）`,
  bannerExpired: '授权已过期',
  /** 原 131 */
  bannerExpiredDesc: (at: string) => `已于 ${at} 到期，请重新激活以继续使用`,
  bannerInvalid: '授权无效',
  /** 原 139 的兜底 */
  bannerInvalidFallback: '授权文件异常，请重新激活',
  bannerTampered: '检测到系统时间篡改',
  /** 原 148（**逐字**，含「重新检测」的书名号） */
  bannerTamperedDesc:
    '系统时间被回拨或发生异常跳变，已拒绝激活与验证（安全告警）。请恢复正确的系统时间后点击「重新检测」。',
  /** 原 156 */
  recheck: '重新检测授权状态',
  /** 机器码区（原 158-172） */
  machineLabel: '本机机器码（发送给开发者以获取激活码）',
  machineGenerating: '正在生成…',
  machineCopy: '复制',
  machineExport: '导出文件',
  machineHint: '机器码由本机硬件信息离线生成，与设备绑定。请将它提供给开发者，获取对应时长的激活码。',
  /** 激活码区（原 175-186） */
  codeLabel: '输入激活码',
  codePlaceholder: '粘贴开发者提供的激活码',
  activate: '激活',
  activating: '验证中…',
  reactivate: '重新激活',
  /** 页脚（原 188） */
  foot: '激活状态已安全保存在本机，支持离线验证。',
  /** 提示消息（原 26/46/50/67-101 的 `u(...)`，**逐字**） */
  msgFetchFailed: (reason: string) => `获取授权信息失败：${reason}`,
  msgMachineCopied: '机器码已复制到剪贴板',
  msgMachineCopyFailed: '复制失败，请手动选择复制',
  msgMachineExported: (path: string) => `机器码已导出：${path}`,
  msgEnterCode: '请输入激活码',
  msgActivated: (at: string) => `激活成功，有效期至 ${at}`,
  msgTampered: (reason: string) =>
    `拒绝激活：检测到系统时间异常（${reason}）。请恢复正确的系统时间后重试。`,
  msgUsed:
    '激活失败：该激活码已被使用，无法重复激活。每个激活码仅可成功激活一次，请使用新的激活码。',
  msgActivateFailed: (err: string) => `激活失败：${err}`,
  /** 原 98 的兜底 */
  unknownError: '未知错误',
  /** 原 54 的兜底（`导出已取消` 已在上面，这里补「导出失败：」前缀） */
  msgExportFailed: (reason: string) => `导出失败：${reason}`,
} as const;

/**
 * API 通道（原 `applyApiJobEvent` `shared.js:30708-30838`）
 *
 * ⚠️ 逐字对齐源版（含全角括号 / 空格与 ` · ` 分隔符）。
 */
export const API_TEXT = {
  /** 原 `` `API 图片 ${new Date().toLocaleTimeString('zh-CN', { hour12: false })}` `` */
  imageName: (clock: string) => `API 图片 ${clock}`,
  /** 生成图片流里的固定名（不带时刻） */
  feedName: 'API 图片',
  /** 落节点时无标签的兜底（原 `o.data && o.data.label || 'API 视频'`） */
  videoFallbackName: 'API 视频',
  /** 原 `` `API · ${n.providerName}` `` —— 注意中间是**空格 + 中点 + 空格** */
  videoAccount: (providerName: string) => `API · ${providerName}`,
  /**
   * ★ **提交时写进 `attempt.accountName` 的批量变体**（原 `Z3_1.jsx:908`，逐字）
   * ⚠️ 与 `videoAccount` 不是一回事：那条是「落节点时的账号标签」，这条是「尝试记录里的账号名」。
   */
  videoAccountBatch: (providerName: string, ratio: string) => `API · ${providerName} · ${ratio}`,
  /** ★ 单发 `attempt.note`（原 `Z3_1.jsx:827`，逐字） */
  attemptNote: (providerName: string) => `API 通道 · ${providerName}`,
  /** ★ 批量 `attempt.note`（原 `Z3_1.jsx:924`，逐字） */
  attemptNoteBatch: (providerName: string, ratio: string) =>
    `API 批量 · ${providerName} · ${ratio}`,
  /** 原 `showToast('API 图片已存入资源库', 'success')` */
  imageStored: 'API 图片已存入资源库',
  /** 原 `API 生成失败：${d}` */
  failed: (msg: string) => `API 生成失败：${msg}`,
  /** 原 `API 生成失败（额度异常）：${d}${u ? ' · ' + u : ''}` */
  failedQuota: (msg: string, advice?: string) =>
    `API 生成失败（额度异常）：${msg}${advice ? ` · ${advice}` : ''}`,
  /** 原 `note: '已取消'`（写进 genHistory 尝试记录） */
  cancelledNote: '已取消',
  /** 原 `note: n.error && n.error.message || 'API 生成失败'` */
  failedNote: (msg?: string) => msg || 'API 生成失败',
  /** 原 `d = n.error && n.error.message || '未知错误'` */
  unknownError: COMMON_TEXT.unknownReason,
} as const;

/** 画布空态 / 提示 */
export const CANVAS_TEXT = {
  emptyTitle: '画布为空',
  emptyHint: '双击画布创建文本框，或从右侧资源库拖入素材',
  dropHint: '松开鼠标，将图片 / Markdown 文件添加到画布',
  /**
   * 拖入的素材**画布上本来就有**（原 `_Component42.jsx:1355`，逐字）
   * ⚠️ 只有 `ensureMaterialNode` 返回 `reused: true` 时才提示（此时节点是被**移动**到落点的）。
   */
  materialReused: (name: string) => `「${name}」已在画布上，已移到落点（同一素材不重复创建）`,
  /** 拖入 `.md` 文件时**文件名取空**的兜底标题（原 `_Component42.jsx:1416` 的 `|| 'Markdown'`） */
  mdFallbackTitle: 'Markdown',
  /** `s` 快捷键截图**失败**（控制器一般会带 `reason`，这是兜底） */
  captureFailed: '截图失败',
  /**
   * `Ctrl+V` 粘进来的图**没有文件名**时的素材名（原 `_Component42.jsx:1262-1266` 的 `` `粘贴图片 ${Dt}:${St}:${cn}` ``）
   * @param clock `HH:MM:SS`（`lib/time.ts` 的 `formatClockTime`）
   */
  pastedImageName: (clock: string) => `粘贴图片 ${clock}`,
  /** 组连线锚点的 title（原 `_Component37.jsx:184`，逐字） */
  groupConnectHint: '拖拽此锚点，将所选节点一次性连接到目标节点',
} as const;

/**
 * 循环引用提示（原 27000 附近）
 * ⚠️ 单独导出为**顶层常量**，供 `core/rules/graph.ts` 直接引用
 *    （规则层不得硬编码文案 —— 原则 5 SSOT）
 */
export const CIRCULAR_REF_MESSAGE = '这样连会形成循环引用，已阻止';

/** 项目 / 顶栏（⚠️ 保存路径那一族已拆到 `PROJECT_STORAGE_TEXT` —— 见本文件末的转发） */
export const PROJECT_TEXT = {
  renameHint: '双击重命名项目',
  deleteConfirm: (name: string) => `删除项目「${name}」？此操作不可撤销。`,
  /** 原 `_Component47.jsx:39` 的 `alert('项目文件解析失败')` */
  parseFailed: '项目文件解析失败',
  /** 原 `_Component42.jsx:318` 的 `Ze.error || '未知错误'`（后端没给原因时的兜底原文） */
  unknownReason: COMMON_TEXT.unknownReason,
  doubaoBackend: '豆包后台',
  export: '导出工程',
  generate: '生成',
  regenerating: '重新生成',
} as const;

/**
 * 账号导入 / 导出（原 `OP.jsx:585-699` + `PP.jsx:36-94`）
 *
 * ⚠️ 这些字符串**会出现在用户看到的状态栏里** ⇒ 按原则 5 归 SSOT。
 * ⚠️ 逐字对齐源版（含 `✓` 前缀与全角标点）—— 它们是**用户可见文案**。
 */
export const ACCOUNT_TRANSFER_TEXT = {
  /** 原 `OP.jsx:637` / `addAccount` 的 `豆包00`（`Mk('doubao')` + `padStart(2,'0')`） */
  defaultName: '豆包00',
  unsupportedExport: '当前环境不支持导出',
  unsupportedImport: '当前环境不支持导入',
  pickNone: '请至少选择一个账号',
  exporting: '正在导出账号数据…',
  exportingOne: (name: string) => `正在导出 ${name}…`,
  exported: (n: number) => `✓ 已导出 ${n} 个账号`,
  /** 原 `PP.jsx:87` 的 `v.error || '保存取消'`（后端取消时它自己会给 `已取消`） */
  saveCanceled: '保存取消',
  exportFailed: (msg: string) => `导出失败: ${msg}`,
  openingFile: '正在打开文件…',
  /** 原 `OP.jsx:601` */
  badFile: '文件格式错误',
  /** 原 `OP.jsx:609` */
  noAccountsInFile: '文件中无账号数据',
  restoringOne: (name: string) => `正在恢复 ${name} 的登录态…`,
  imported: (n: number) => `✓ 导入 ${n} 个账号`,
  skippedExisting: (n: number) => `跳过 ${n} 个（已存在）`,
  restoredCredentials: (n: number) => `恢复 ${n} 个登录凭证`,
  importFailed: (msg: string) => `导入失败: ${msg}`,
  /**
   * cookie 读写失败（原版只有 `console.warn`，**用户看不到** ⇒ 重写改为上报，原则 6）
   * ⚠️ 前缀逐字取自源版的 `console.warn` 文案。
   */
  exportCookieFailed: (name: string, reason: string) => `获取 ${name} 的 cookie 失败: ${reason}`,
  restoreCookieFailed: (name: string, reason: string) => `恢复 ${name} 的 cookie 失败: ${reason}`,
  /** 原版拼接用的分隔符（`$t.join('，')`） */
  summarySep: '，',
} as const;

/** 保存错误 */
export const PERSIST_TEXT = {
  /** ⚠️ 查 7：原文案含实现黑话「序列化」—— 本工程自造，非源版原文，已改写为用户语 */
  serializeFailed: '保存失败：工程数据无法写入本地存储，本次改动未生效',
  quotaExceeded: '保存失败：工程数据未能写入本地存储（本地存储空间不足）',
  /** 保存失败横幅的关闭按钮 `title`（原 `Z0.jsx:25` 逐字） */
  close: '关闭提示',
} as const;

/** 错误横幅按钮 */
export const BANNER_TEXT = {
  dismiss: '关闭此提示',
  clearAll: '全部清除',
} as const;

/** 资源库 / 素材 */
/**
 * 外壳（三栏）的**地标无障碍名**（**本工程新增** —— 源里只有 `展开/收起账号栏` 那类
 * side-toggle 按钮的 title，**没有** `<aside>` 的 aria-label）
 *
 * ★ **2026-10-12（`TD-09-1`）**：按「用户可感知的文案只写一遍」收于此
 * （读屏软件会把它们念出来 ⇒ 是用户可感知文案，不该散在两个 JSX 属性里）。
 */
export const SHELL_TEXT = {
  /** 左栏（账号）—— ⚠️ 与源 `_Component48.jsx:163` 的 `展开账号栏`/`收起账号栏` **不是同一句**（那是折叠按钮的 title，且随状态变），别合并 */
  accountsAria: '账号栏',
  /** 右栏（资源库）—— 同理，源 `:182` 是折叠按钮的 title */
  libraryAria: '资源栏',
} as const;

export const LIBRARY_TEXT = {
  /** 面板标题（原 `RT.jsx:254` 的 `<span className="library-title">资源库</span>`，逐字） */
  title: '资源库',
  /** 条目删除按钮的无障碍名（**本工程新增** —— 源里没有对应 aria） */
  deleteAria: '删除',
  empty: '资源库为空，请先从右侧资源库或文件添加素材。',
  /** 素材选择器标题（原 `DT.jsx:33` 的 replace 档，逐字） */
  pickFromLibrary: '从资源库选择素材进行更换',
  /** 素材选择器/资源库的「从文件选择」（原 `DT.jsx:47` / `RT.jsx:256`，逐字） */
  pickFromFile: '从文件选择',
  /** 素材选择器的「取消」（原 `DT.jsx:49`，逐字） */
  pickerCancel: '取消',
  /**
   * 资源库**右键菜单**的「替换素材」（原 `RT.jsx:351`，逐字）
   * ⚠️ 与 `NODE_CTX_TEXT.replaceMaterial`（「更换素材」）**是两个不同的动作**：
   *    这个是**换库条目自身的图**，那个是**换节点绑到哪张图**。
   */
  libReplace: '替换素材',
  /** 资源库条目的「双击重命名」提示（原 `RT.jsx:301` 的 `title`，逐字） */
  libRenameHint: '双击重命名',
  /** 改名输入框的失焦/回车兜底名（原 `RT.jsx:248` 的 `|| '未命名'`，逐字） */
  libUnnamed: '未命名',
  /**
   * 换图失败（守卫没过 / 外置失败）—— ⚠️ **源里没有这句**：`RT.jsx:151-153` 只在
   * `!V.ok` 时 `alert`，且走的是**后端错误文案**域 ⇒ 本仓按原则 6 给 toast，原文透传。
   */
  libReplaceFailed: '替换素材失败',
  /**
   * 换图失败（守卫没过）—— ⚠️ **源里没有这句**：`_Component42.jsx:967` 把
   * `replaceMaterialWithLib` 的返回值**直接丢掉**（完全静默）⇒ 本仓按原则 6 不静默。
   * 原文来自 `core/rules/materialReplace.ts` 的 `err('bad-input', …)`。
   */
  replaceFailed: '更换素材：节点不是素材节点或未选择图片',
  alreadyOnCanvas: (name: string) => `「${name}」已在画布上，已移到落点（同一素材不重复创建）`,
} as const;

/**
 * 指纹诊断（**只放 UI 独有文案**）
 *
 * ⚠️ **分级文案（ok/critical/warn）不在这里**（2026-10-10，`TD-02-1` 删掉了本文件的松散副本）。
 *
 * ★ `core/rules/fingerprint.ts` 的 `COLLISION_LEVEL_LABEL` **整文件 0 生产消费**
 *   （只有 `tests/fingerprint.test.ts` 引它）⇒ **别把它当"要用就去 import 的真源"**
 *   （照做会给一个死文件造出第一个消费者）。
 *   **指纹诊断的活真源是 `core/rules/fingerprintDiagnosis.ts`**（段标签 / 4 个伪装状态 label，
 *   已被 `ui/panels/AccountPanel.tsx:46` + `state/accountOps.ts:35` 消费）。
 *   ⚠️ `fingerprint.ts` / `COLLISION_LEVEL_LABEL` 自身的归属（删 or 接线）见「未接线／死代码批」那笔债。
 */
export const FINGERPRINT_TEXT = {
  title: '跨账号指纹关联扫描',
  dimDist: '维度分布（不同值数量，越少越容易被关联）',
} as const;

/** 豆包后台视图 */
export const BACKEND_VIEW_TEXT = {
  refresh: '刷新',
  openInBrowser: '浏览器打开',
  watermarkFree: (n: number) => `无水印资源（${n}）`,
  backToCanvas: '返回画布',
  silent: (name: string) => `「${name}」处于静默状态 · 页面已暂停（不占用内存 / CPU）`,
  /**
   * 站点标题（原 `_Component43.jsx:3231` 的**五路三目** —— **源里没有 `gpt` 分支**，它落 else ⇒「豆包对话后台」；
   *   故本仓照源**不列** `gpt`）
   * ⚠️ 这里的类型**故意不是 `Record<string,string>`**：`doubao` 声明为**必有**键 ——
   *   源的 `else` 分支就是豆包文案 ⇒ 查表未命中回落它时，**知道它一定在**（故消费侧**无需 `?? ''`**）。
   */
  title: {
    doubao: '豆包对话后台',
    dola: 'dola 对话后台',
    lovart: 'Lovart 后台',
    tapnow: 'Tapnow 后台',
    other: '自定义网站',
  } as { readonly [k: string]: string | undefined; readonly doubao: string },
  /** 标题里没选账号时的占位（原 `_Component43.jsx:3232` 的 `|| '未选择账号'`，逐字） */
  noAccount: '未选择账号',
  /** 头部折叠按钮的 `title`／`aria-label`（原 `3268` 那两个三目，逐字） */
  collapseHead: '收起顶部工具栏',
  expandHead: '展开顶部工具栏',
  /** 点「刷新」时账号已被删（防的是"点了之后才发现没了"）—— 原则 6：不静默 */
  accountGone: '账号已不存在，无法刷新后台页',
  /**
   * 顶栏的「豆包后台」入口（原 `_Component42.jsx:1606` —— 逐字：图标 `▦` ＋ 文字 `豆包后台`）
   * ⚠️ 与 `title.doubao`（`豆包对话后台`，后台视图**头部标题**）**不同字**：那是标题、这是按钮。
   */
  entry: '豆包后台',
  /** 该按钮的 `title`（原 `:1606` 逐字） */
  entryTitle: '查看账号节点发送后的豆包对话',
} as const;

/** 侧栏折叠 */
export const SIDE_TEXT = {
  toggleAccounts: '展开/收起账号栏',
  toggleLibrary: '展开/收起资源栏',
  apiService: 'API 服务',
} as const;

/** 生成面板 */
export const GEN_TEXT = {
  model: '生成模型',
  duration: (cur: number, min: number, max: number) => `视频时长：${cur} 秒（${min}–${max} 秒可调）`,
  generate: '生成',
  regenerate: '重新生成',
  batch: '批量出片',
  batchHint: '同一提示词 + 服务商，按 16:9 / 9:16 / 1:1 三个比例各出一片',
  viaApi: '走 API 通道生成',
  accountAvailable: '可用',
  accountUnavailable: '不可用',
  resolution: '图片分辨率',
  ratio: '画面比例',
  count: '生成数量',
} as const;

/**
 * 遮脸面板（**只放面板独有文案**）
 *
 * ⚠️ **效果标签与错误文案的真源不在这里**（2026-10-10，TD-11-2）：
 *    · 效果标签 → `constants/facemask.ts` 的 `FACE_MASK_EFFECT_LABEL`
 *      （`Record<FaceMaskEffect, {label,hint}>`，**带类型约束**；本文件原先是只含 2/4 个效果的松散副本）
 *    · 错误文案 → `constants/facemask.ts` 的 `FACE_MASK_ERROR`
 *      （**生产者原文**，被 `adapters/media/facemask.ts` 抛出 —— 原则 6：消费者不得改写）
 */
export const FACEMASK_TEXT = {
  title: '遮脸参数',
  mode: '遮脸方式',
  strength: '强度',
  expand: '范围外扩',
  hint: (n: number) => `单击角标即按此参数遮脸（当前 ${n} 张脸）`,
  /** 关闭按钮 `title`（原 `_Component40.jsx:68`，逐字） */
  closeTitle: '关闭（Esc）',
  /** 关闭字形（原 69） */
  closeGlyph: '✕',
  /** 强度值的后缀（原 88：`{t.strength.toFixed(1)}×`） */
  strengthSuffix: '×',
  // ── 角标层（原 `iL.jsx:170-190`）──
  /** 检测中（原 171，逐字） */
  detecting: '识别人脸…',
  /** 角标文字（原 173，逐字） */
  badge: '检测到人脸',
  /** 角标 `title`（原 172，逐字；`n` = 脸数） */
  badgeTitle: (n: number) => `检测到 ${n} 张人脸 · 单击角标遮脸，双击设置参数`,
  /** 人脸框 `title`（原 181：当前参数摘要） */
  markTitle: (effect: string, strength: number, padPercent: number) =>
    `单击：用当前参数（${effect} · 强度${strength}× · 外扩${padPercent}%）一键遮脸；双击：设置遮脸参数`,
  /** 人脸框里的提示（原 188） */
  markTip: '单击遮脸 · 双击设置',
  /** 正在遮这张（原 176/181/188 的 `遮脸中…`） */
  masking: '遮脸中…',
  /** 遮脸后给素材名加的后缀（原 `iL.jsx:127`，逐字） */
  nameSuffix: '·已遮脸',
  /** 外置失败（原 `iL.jsx:124` 抛的 `图片保存失败`，逐字 —— 生产者原文，不得改写） */
  saveFailed: '图片保存失败',
  /**
   * ★ **本工程新增**（源 `iL.jsx:135` 是 `console.warn` **静默**吞掉）——
   *   按「失败可见」给一条 toast（**有意差异**，见 `TD-03-20`）。
   */
  failed: '遮脸失败',
} as const;

/**
 * GPT 站点 —— 页内发送脚本的失败文案（原 `sO` 42998-43133）
 *
 * ⚠️ 这些字符串**由页内脚本返回给用户看** ⇒ 按原则 5 归 SSOT。
 */
export const GPT_TEXT = {
  /** 原 `sO`：12×500ms 仍找不到输入框 */
  noComposer: 'GPT 页面没有找到聊天输入框（可能未登录或页面未加载完成）',
  /**
   * 原 `sO` 的 `'写入提示词失败：' + msg` —— **前缀单独导出**，
   * 因为页内脚本要在**页面里**拼（不能把整个函数塞进去）。
   */
  insertFailPrefix: '写入提示词失败：',
  /** 原 `sO`：10×400ms 找不到可用发送按钮，且回车兜底也失败 */
  noSend: '找不到可用的发送按钮，且回车兜底未生效',
  /** 原 `sO`：点了发送但 16×500ms 内没确认到新消息 */
  notConfirmed: '已点击发送，但没有检测到新消息（请检查 GPT 页面状态：是否未登录/额度用尽/弹了验证）',
  /** 原 `oO`：找不到该账号的 webview */
  pageNotOpen: '没有找到该 GPT 账号的页面：请先在左侧选中该账号，等 ChatGPT 加载完成',
  /** 原 `oO`：页内脚本执行超时（`nO` = 30000） */
  sendTimeout: 'GPT 页面发送超时（页面可能卡住，请刷新该账号页面重试）',
  /** 原 `oO`：页内脚本抛错（前缀，后接原始错误） */
  sendErrorPrefix: 'GPT 页面执行失败：',
  /** 原 `oO` 的兜底文案 */
  sendFailed: '发送未成功',
  /** 原 `aO`：页面拿不到 webContentsId 或宿主没有 attachImagesToWebview */
  attachUnsupported: '该 GPT 页面暂无法附加参考图：请先打开该 GPT 账号后台，或移除引用后重试',
  /** 原 `aO`：3 次重试后仍附加失败（前缀 + 原因 + 后缀） */
  attachFailedPrefix: '参考图发送失败：',
  attachFailedSuffix: '（可移除引用后重试）',
  /** 原 `aO`：附加失败但拿不到具体原因 */
  attachUnknownReason: '未知原因',
} as const;

/**
 * 站点显示名（原 `eO` 42819）
 *
 * ⚠️ 只收 `string`（不引 `stable` 的 `SiteType`）—— `constants` 是 L0，
 *    引 `stable` 会与 `stable → constants` 形成**环**。
 */
const SITE_DISPLAY_NAME: Readonly<Record<string, string>> = {
  dola: 'Dola',
  gpt: 'GPT',
  doubao: '豆包',
};

/** 站点显示名（原 `eO` 42819）—— 未知类型取**大写**（与源一致：`String(e || 'doubao').toUpperCase()`） */
export function siteDisplayName(type: unknown): string {
  const t = String(type ?? '') || 'doubao';
  return SITE_DISPLAY_NAME[t] ?? t.toUpperCase();
}

/**
 * 发送账号解析（原 `FS` 42830-42890）
 *
 * ⚠️ 这些字符串**会出现在用户看到的错误里** ⇒ 按原则 5 归 SSOT。
 */
export const ACCOUNT_PICK_TEXT = {
  /** 原 `FS`：显式指定但账号不存在 / 未登录 */
  missing: '所选账号不存在或未登录',
  /** 原 `FS`：显式指定但站点类型不符 */
  typeMismatch: '所选账号与当前出图通道不匹配',
  /** 原 `FS`：显式指定但该号正在生成 */
  busy: '所选账号正在生成中，请稍后再试',
  /** 原 `FS`：池里没有可用账号 */
  noneConfigured: (site: string) => `未配置已登录的${site}账号`,
  /** 原 `FS`：★ 与源一致 —— **除 `no-account` 外一律用这句**（含 `all-busy`） */
  allBusy: (site: string) => `${site}账号都在忙，请稍后再试`,
  /**
   * 原 `Fi` 占用失败（`gS` 39109 / `tO` 的 `hold-failed`）：
   * 选号与占用之间被别的任务抢先（两个函数用的是不同状态量）
   */
  holdFailed: '该账号刚被占用，请重试',
} as const;

/**
 * `@` 引用（**作者侧**自动补全 —— 原 `CL.jsx:512-540` 的 `me`/`ve` 与下拉）
 *
 * ⚠️ 源版**没有这些文案**（它的 `@` 是 contentEditable 里的药丸 + 一个无文字的候选浮层）。
 *    本组是**新增的诊断性文案**（按钮/列表/空态要说清"这是什么、点了会怎样"）。
 */
export const REF_TEXT = {
  /** 正文占位里的引导（拼在 `NODE_EDIT_TEXT.textPlaceholder` 后面用） */
  triggerHint: '输入 @ 引用素材',
  /** 候选为空 */
  noMatch: '资源库里没有匹配的素材',
  /** 候选列表底部提示 */
  pickHint: '点一条插入引用（也可用 ↑↓ 选择 / Enter 确认 / Esc 取消）',
  /** 收起 */
  close: '收起',
  /** ★ 「@ 引用素材」按钮（原 `CL.jsx:789`，逐字） */
  atRef: '@ 引用素材',
  /** 它的 `title`（原 `CL.jsx:786`，逐字） */
  atRefTitle: '从资源库选择素材，以 @ 引用形式插入到文本框（单击即插入）',
  /** 素材缩略条空态（原 `CL.jsx:793`，逐字） */
  stripHint: '尚未连接素材 · 点左侧「@」引用素材',
  /** 缩略图 `title`（原 `CL.jsx:802`，逐字含「（拖拽调整顺序）」） */
  thumbDragTitle: (name: string) => `${name}（拖拽调整顺序）`,
  /** 引用预览行的前缀（`参考图1` 由 `formatReferenceLabel` 给，这里只给分隔符） */
  previewSep: ' · ',
  /** 引用指向的素材**找不到**时的标注（原 `CL.jsx` 用 `.ref-missing` 样式表达，没有文案） */
  previewMissing: '（找不到该素材）',
} as const;

/**
 * 节点内编辑（文本正文 / 节点名 / 提示词）
 *
 * ★ 本文件是 `data.text` 的**唯一写入点**（没有它，双击建出的文本节点永远空串、
 *   生成节点没有提示词 ⇒ `generate` 发出去的是**空提示词**）。
 *
 * ⚠️ **两处占位文案有意短于源版**（已留痕）：源版写的是
 *   `输入文字，输入 @ 从资源库引用素材…`（`CL.jsx:818`）与
 *   `描述想要画的内容…（输入 @ 引用素材）`（`_Component45.jsx:1211`）——
 *   ★ `@` 引用特性**已落地**（`ui/nodes/RefAutocomplete.tsx` + `core/rules/refs.ts` + `richText.ts` 的
 *   `refChipHtml`/`textToEditorHtml`，已被 `TextNode`/`GenPanel` 消费）⇒ 下面两处 `*WithRefs` 全文**待启用**（`TD-11-5`）。
 */
export const NODE_EDIT_TEXT = {
  /**
   * 文本节点正文占位（原 `CL.jsx:818` 的 `data-placeholder`，**逐字**）
   * ★ 2026-10-10：`@` 引用作者侧落地 ⇒ **改回源版全文**（此前为不承诺不存在的能力而砍掉了 `@` 段）
   */
  textPlaceholder: '输入文字，输入 @ 从资源库引用素材…',
  /** 生成面板提示词字段名 */
  promptLabel: '提示词',
  /** 生成面板提示词占位（源 `_Component45.jsx:1211`；当前去掉 `@` 段） */
  promptPlaceholder: '描述想要画的内容…',
  /** 源版全文（`@` 引用落地后改回这个） */
  promptPlaceholderWithRefs: '描述想要画的内容…（输入 @ 引用素材）',

  // ── 节点「发送状态」前缀图标（原 `CL.jsx:760`，逐字；⚠️ **都带一个尾空格**）──────
  /** `sending`（原 760，逐字） */
  sendSendingIcon: '⏳ ',
  /** `success`（原 760，逐字） */
  sendSuccessIcon: '✓ ',
  /** 其余（含 `waiting` / `skipped` / 未知）一律这个（原 760，逐字） */
  sendErrorIcon: '⚠ ',
} as const;




/**
 * 建节点浮层（原 `create-panel` `_Component42.jsx:1634-1680`）
 *
 * ⚠️ 标题**只有两档**（源版就是个二元三目；边模式下 `sourceIds` 缺失 ⇒ 也显示「引用该节点生成」）。
 */
export const CREATE_PANEL_TEXT = {
  /** 原 1643：`sourceIds.length > 1` */
  multiTitle: '引用所选节点生成',
  /** 原 1643：其余情况（含**边模式**） */
  singleTitle: '引用该节点生成',
  /** 三个选项（原 1655 / 1666 / 1677） */
  image: '文生图',
  video: '文生视频',
  text: '文字',
} as const;

/**
 * 批量发送队列（原 `x3` shared.js:41615-41822 + `PS` 42354-42447）
 *
 * ⚠️ 逐字对齐源版（`…` 是**单个省略号字符**，不是三个点）。
 */
export const BATCH_TEXT = {
  /** 原 `x3` 41628：互斥锁已在跑 */
  busy: '已有批量发送正在进行',
  /** 原 `x3` 41668 / 41672 */
  abortedSkipped: '已中止，未发送',
  /** 原 `x3` 41678：防重复发送 */
  alreadySending: '该节点正在发送中，已跳过（防止重复发送）',
  /** 原 `x3` 41693 */
  waiting: '等待中',
  /** 原 `x3` 41723 / `PS` 42391 */
  sendingTo: (name: string) => `正在发送至 ${name}…`,
  /** 原 `x3` 41755 */
  sendBusyRetry: '正在发送中，请稍候再试',
  /** 原 `x3` 41762 / 41770 / `PS` 42372 的兜底 */
  sendFailed: '发送失败',
  /** 原 `x3` 41770 / `PS` 42406 / 42412 */
  sendException: '发送异常',
  /** 原 `x3` 41804 */
  nodeMissing: '节点已不存在',
  /** 原 `x3` 41748 / 41733 / `PS` 42422 */
  sentTo: (name: string) => `已发送至 ${name}`,
  /** 原 `PS` 42361 */
  queueing: '排队发送中…',
  /** 原 `PS` 42426 */
  sentToast: (name: string) => `已发送至 ${name}，出片后自动回画布`,
  /**
   * 决策请求里的原因（原 `x3` 41788：`` `${j.label}（${P.msg}）` ``，**全角括号**）
   * ⚠️ `kind === 'unknown'` 时**不加标签**（直接用原文）
   */
  withLabel: (label: string, msg: string) => `${label}（${msg}）`,
} as const;

/**
 * 提示词分析 / 调整（原 `gS` shared.js:39044-39255 + `yS` 39256-39449）
 *
 * ⚠️ 逐字对齐源版（含 `：` 全角冒号与 `（已保留原文）` 全角括号）。
 * ⚠️ **模型提示词不在这里** —— 那是「发给模型的指令」不是 UI 文案，见 `constants/analyzePrompts.ts`。
 */
export const ANALYZE_TEXT = {
  /** 原 `gS` 39080：写进 `analyzePrompt.error` 的**入参缺失**原文 */
  badArgs: '缺少素材节点或图片地址',
  /** 原 `gS` 39095（两个站点都没账号 / 都忙）—— 与 `SEND_TEXT` 同字面量，只留一处真源 */
  noAccount: '未配置已登录的豆包 / Dola 账号',
  allBusy: '豆包 / Dola 账号都在忙，请稍后再试',
  /** 原 `gS` 39158 / 39178 的两个阶段 */
  phaseSendingImage: '正在发送图片…',
  phaseAnalyzing: 'AI 正在分析图片…',
  /** 原 `yS` 39365 / 39379 的两个阶段 */
  phaseReviseNewSession: '正在新建会话并发送图片…',
  phaseRevising: '正在按你的意见调整提示词…',
  /** 原 `gS` 39210：分析完成 */
  analyzeDone: '提示词分析完成',
  /** 原 `gS` 39226：模型没回标准 JSON */
  analyzeNonJson: '提示词已生成，但模型未返回标准 JSON（已保留原文）',
  /** 原 `yS` 39403：按意见更新完成 */
  reviseDone: '提示词已按你的意见更新',
  /** 原 `yS` 39418 */
  reviseNonJson: '已生成新版本，但未返回标准 JSON（已保留原文）',
  /** 原 `gS` 39242：写进 error 与 toast 的前缀 */
  analyzeFailed: (msg: string) => `分析失败：${msg}`,
  /** 原 `yS` 39431 / 39436 */
  reviseFailed: (msg: string) => `调整失败：${msg}`,
  /** 原 `yS` 的四条前置提示（都是 `warn`，且**不改节点数据**） */
  needAnalyzeFirst: '请先完成一次提示词分析，再进行调整',
  noSourceImage: '找不到原素材图片，请重新分析',
  noAnalyzeAccount: '找不到原分析账号，请重新分析',
  analyzeAccountGone: '原分析账号已不可用，请重新分析',
  /** 原 `yS` 39308 —— **与 `ACCOUNT_PICK_TEXT.holdFailed` 不同**（这句是"正在忙别的"） */
  accountBusy: '该账号正在处理其他任务，请稍后再试',
  /**
   * 附参考图失败（原 `hS` 38945：`` `图片发送失败：${r.slice(0,3).join('；') || '未知原因'}` ``）
   * ⚠️ 源版 `'；'` 是**全角分号**
   */
  attachFailed: (reasons: readonly string[]) =>
    `图片发送失败：${reasons.slice(0, 3).join('；') || '未知原因'}`,
  /** 原 `hS` 38895 的守卫分支（宿主没有该方法 / 拿不到 `webContentsId`） */
  attachApiUnavailable: 'attachImagesToWebview API 或 webContentsId 不可用',
  /** 原 `hS` 38937 / 38940 的两条剪贴板诊断（前缀含全角冒号） */
  clipboardFailed: (reason: string) => `剪贴板: ${reason}`,
  clipboardException: '剪贴板: 异常',
  /** 原 `mS` 38997 */
  fillTextFailed: '提示词填入失败',
  /** 原 `mS` 39014 */
  sendButtonMissing: '未找到发送按钮（豆包 / Dola 界面可能已更新，请手动发送）',
  /** 原 `mS` 39035 */
  replyMissing: '未读到模型回复（可能发送未成功或账号已掉登录）',
  /** 原 `gS` 39171 / `yS` 39373 的兜底 */
  sendImageFailed: '图片发送失败',
  /** 原 `gS` 39191 的兜底 */
  askFailed: '问答失败',
  /** 原 `yS` 39387 的兜底 */
  reviseAskFailed: '调整失败',
} as const;

/**
 * 提示词分析 **UI**（原 `ZL.jsx` 的 `.mpp-*` 面板 + `fL.jsx` 同款；两者逐字相同 ⇒ 判据 C1 抽共享组件）
 *
 * ⚠️ 逐字对齐源版（含徽章四态、全角括号、` · ` 分隔符）。
 */
export const ANALYZE_UI_TEXT = {
  /** 节点浮动按钮（原 `ZL.jsx:273-286`） */
  buttonLabel: '分析提示词',
  buttonBusy: '分析中…',
  /** 原按钮 `title`（逐字） */
  buttonTitle: '用后台空闲豆包 / Dola 账号反推图片提示词',
  /** 面板头（原 322-331） */
  panelTitle: (accountName?: string) => `AI 提示词${accountName ? ` · ${accountName}` : ''}`,
  collapse: '收起',
  /** 徽章四态（原 323-325）—— `analyzing`/`revising` 同一档，`done` 再按 `ok` 分档 */
  badgeBusy: '生成中',
  badgeDone: '完成',
  badgeRaw: '原文',
  badgeFailed: '失败',
  /** 等待态兜底（原 337） */
  waitDefault: '正在分析，请稍候…',
  /** 三个 tab（原 346-360） */
  tabZh: '中文',
  tabEn: '英文',
  tabJson: 'JSON',
  copy: '复制',
  /** 原 362 的 `title={`复制${…}`}` */
  copyTitle: (label: string) => `复制${label}`,
  /** 原 383：`json_prompt` 不是对象时的占位 */
  noJson: '(无结构化 JSON)',
  /** 复制到剪贴板（原 `JL` 40996-41003） */
  copied: '已复制到剪贴板',
  copyFailed: '复制失败',
  /** 调整区（原 389-406） */
  revisePlaceholder: '想怎么改？如：改成夜景、换成俯拍镜头…',
  reviseSubmit: '调整',
} as const;

/**
 * 账号面板（原 `OP.jsx` 991 行 —— 此处只落**最小可用子集**）
 *
 * ⚠️ 源版那段「＋ 添加账号」是**两步**：先 `_ComponentTP` 选平台类型，再 `$P` 打开登录表单
 *    （登录成功后才 `addAccount`）。本工程把顺序**倒过来**：先建号（`未登录`）→ 在
 *    `BackendView` 的 `<webview>` 里真人登录 → 探针回填 `已登录`。
 *    ⇒ 因此本组文案里有源版**没有**的几句（`probe*` / `notLoggedIn`），已逐条注明。
 */
export const ACCOUNT_PANEL_TEXT = {
  /** ★ 指纹撞车体检（原 `OP.jsx` 打开 `DP` 的那个动作） */
  scan: '指纹体检',
  scanTitle: '跨账号指纹关联扫描：看哪些账号的环境指纹高度重合（重合越多越像同一台设备）',
  /** ★ 打开该账号的画廊（原 `OP.jsx` 里 `_Component23` 的入口；源版是账号卡片上的一个动作） */
  gallery: '画廊',
  galleryTitle: '查看该账号的 Tapnow / Lovart 画廊',
  /** 源版空态提示（`_Component43.jsx:3297`，逐字） */
  emptyHint: '请先在左侧添加并登录账号',
  /** 原 `OP.jsx:827` 的按钮（**逐字**，含全角 `＋`） */
  addAccount: '＋ 添加账号',
  /** 新增：选平台（源版是 `_ComponentTP` 弹窗的标题感文案） */
  pickType: '选择平台',
  /** 新增：建号后的引导（源版没有——它建号即已登录） */
  loginHint: (name: string) => `「${name}」已创建，请在下方页面里登录，然后点「检测登录」`,
  /** 新增：探针按钮（用既有 `SitePort.probe`，不是新机制） */
  probe: '检测登录',
  probing: '检测中…',
  /** 新增：探针结果（源版没有这个状态，见 `ACCOUNT_STATUS.loggedOut` 的长注释） */
  notLoggedIn: '尚未登录',
  /** 新增：探针成功 */
  loggedInOk: '已登录',
  /** 原 `OP.jsx:801` 的移除按钮 title（逐字） */
  removeTitle: '移除账号（同时清理该账号的数据）',
  remove: '移除',
  /** 新增：确认（源版 `OP.jsx:801` 的 onClick 里自带确认逻辑，此处用最简单的一种） */
  confirmRemove: (name: string) => `确定移除「${name}」？其登录数据会一并清理。`,
  /** 新增：去掉分组概念的说明（源版有分组，本工程尚未落地） */
  groupPending: '（分组功能尚未实现）',

  // ── 面板底部操作条（原 `OP.jsx:925-941` 的 `.panel-foot`）──
  /** 网格吸附（原 926 的 `.snap-toggle` 文案，逐字） */
  snapLabel: '网格吸附',
  /** 网格吸附 `title`（原 926，逐字） */
  snapTitle: '开启后节点移动自动吸附到网格线',
  /** 返回首页（原 933，逐字） */
  backHome: '返回首页',
  /** 清空画布（原 940，逐字） */
  clearCanvas: '清空画布',
  /** 清空画布的确认（原 936，逐字） */
  clearCanvasConfirm: '确定清空当前画布？此操作不可撤销。',

  // ── 清理浏览器缓存（原 `OP.jsx:181-213` 的 `he()` + 850-852 的按钮）──
  /** 按钮文案（原 851 的**非忙**态） */
  clearCache: '🧹 清理缓存',
  /** 按钮文案（原 851 的**忙**态） */
  clearCacheBusy: '🧹 清理中…',
  /** 按钮 `title`（原 850，逐字） */
  clearCacheTitle:
    '清理各账号页面的浏览器缓存（Cache / Code Cache 等），可释放数 GB 磁盘空间；登录态不受影响，账号不会掉线',
  /** 确认框（原 191-194，逐字；含**两处换行**） */
  clearCacheConfirm:
    '将清理全部账号页面的浏览器缓存（可释放数 GB 空间）。\n登录态不受影响，账号不会掉线；清理后页面首次打开会稍慢。\n\n确定继续？',
  /** 成功（原 199，逐字；`failed` 非 0 时带括号后缀） */
  clearCacheDone: (cleared: number, failed: number) =>
    `✓ 已清理 ${cleared} 个缓存目录${failed ? `（${failed} 个被占用，下次启动会自动清理）` : ''}`,
  /** 失败（原 201 / 204 —— 统一成「后端原文」一句，不编造） */
  clearCacheFailed: (msg: string) => `清理失败：${msg}`,
} as const;

/**
 * 后台页就绪链（原 `gS` 39125-39154 / `vr` 26024-26108）
 *
 * ⚠️ 这些是**失败原因**（进 `Result.message`），源版逐字为「豆包 / Dola …」——
 *    因为这条链**只在 doubao↔dola 之间退级**（见 `SEND_TEXT`）。
 */
export const BACKEND_PAGE_TEXT = {
  /** 原 `vr` 26068（租约被 TTL / 取消） */
  leaseCanceled: '后台账号加载已取消',
  /** 原 `gS` 39131 的兜底（后端没给 note 时用） */
  loadFailed: '豆包 / Dola 后台页面加载失败',
  /** 原 `gS` 39135（找到账号但视图没挂上） */
  webviewMissing: '该账号的 webview 未初始化',
  /** 原 `gS` 39141（拿不到 `webContentsId` ⇒ 后续 CDP 直喂/多帧扫描全做不了） */
  webContentsIdMissing: '无法获取 webview 的 webContentsId',
  /** 原 `gS` 39152（导航后页面没起来） */
  navTimeout: '豆包 / Dola 页面加载超时',
  /** 新增：`<webview>` 元素上既没有 `reload` 也没有 `loadURL`（视图未挂载/已销毁） */
  webviewNoCommands: '该账号的 webview 不支持刷新 / 导航（视图可能未挂载）',
} as const;

/**
 * 发送编排（原 `gS` 39086-39104 的选号与退级 + `tO`/`aO` 的同款外壳）
 */
export const SEND_TEXT = {
  /**
   * 退级链的两端（原 `gS` 39086-39093：先 `doubao`，不 idle 再 `dola`）
   * ⚠️ **硬编码在源码里**（不是 `siteDisplayName`）—— 逐字对齐。
   */
  pair: '豆包 / Dola',
  /** 原 `gS` 39095：两个站点都没账号 */
  noAccount: '未配置已登录的豆包 / Dola 账号',
  /** 原 `gS` 39095：两个站点都忙 */
  allBusy: '豆包 / Dola 账号都在忙，请稍后再试',
  /**
   * 站点适配器缺失（原 `generate.ts` 的内联字面量 —— 这是**第 2 处**出现
   * ⇒ 按判据 C1 抽出为 SSOT，`generate.ts` 同步改用）
   */
  noSiteAdapter: (site: string) => `无 ${site} 站点适配器`,
  /** 站点没声明会话页（`SitePort.chatUrl` 缺项）—— **明确报错，不回落**（判据 B4） */
  noChatUrl: (site: string) => `站点 ${site} 未声明会话页（chatUrl），无法准备后台页`,
} as const;

/**
 * 账号会话 / 代理（原 `reassignLovartProxies` shared.js:30331-30361）
 *
 * ⚠️ 源版对 `setAccountProxy` 的失败是 `.catch(() => {})` —— **没有任何文案**。
 *    本组是**新增的诊断文案**（原则 6：不静默），`reason` 处仍是后端原文。
 */
export const SESSION_TEXT = {
  /** 逐号设置出口代理失败 */
  proxyApplyFailed: (accountId: string, reason: string) =>
    `设置账号 ${accountId} 的出口代理失败：${reason}`,
} as const;

/**
 * 视频本地化（原 `localizeNodeVideos` 31017-31054）
 *
 * ⚠️ 源版**没有任何文案**（失败处是 `try{}catch{}` 静默吞掉）⇒ 本组是**新增的诊断文案**
 *    （原则 6：不静默，但也不改后端原文 —— 原文照旧跟在冒号后）。
 */
export const VIDEO_TEXT = {
  /** 单条直链落盘失败（`reason` = 后端原始 message） */
  saveFailed: (url: string, reason: string) => `视频落盘失败：${url}（${reason}）`,
  /**
   * 一批里有多少条没落盘（★ 视频本地化接线：用户侧**只报条数**，不刷屏；
   * 逐条原文走 `lib/log` 唯一入口 —— 读者分流：用户看 toast，开发者看 log）
   */
  localizeFailed: (n: number) => `有 ${n} 个视频未能落盘（原文见控制台）`,
} as const;

/**
 * Tapnow 站点（原 `Ok` 33272-33327 · `Uk` 33328-33353 · `Yl` 33401-33420）
 *
 * ⚠️ 这些字符串**会出现在用户看到的错误/提示里** ⇒ 按原则 5 归 SSOT，规则层不得硬编码。
 */
export const TAPNOW_TEXT = {
  /** 原 `Uk` 的 `l.name || l.title || '未命名画布'` */
  unnamedCanvas: '未命名画布',
  /** 原 `Ok` 的 `'缺少账号'` */
  missingAccount: '缺少账号',
  /** 原 `Ok`/`fP` 的 `'没有找到该账号的 Tapnow 页面'` */
  pageNotFound: '没有找到该账号的 Tapnow 页面',
  /** 原 `Ok` 的 `'webview 未就绪'` */
  webviewNotReady: 'webview 未就绪',
  /** 原 `Ok` 的 `'接口调用超时'` */
  apiTimeout: '接口调用超时',
  /** 原 `Ok` 的 `'接口调用异常'` */
  apiAbnormal: '接口调用异常',
  /** 原 `Ok` 的 `'接口返回不是 JSON'` */
  badJson: '接口返回不是 JSON',
  /** 原 `Ok` 调 `gn` 时的 label（超时文案前缀） */
  apiLabel: '接口调用',
  /** 原 `Yl` 调 `gn` 时的 label */
  hrefLabel: '读取页面地址',
} as const;

/**
 * 生成配方（原 `oR` 35525 / `uR` 35611 / `dR` 35641）
 * ⚠️ 分隔符也是 SSOT：`uR` 用 ` · `、`dR` 用换行 —— 别在规则里硬编码
 */
export const RECIPE_TEXT = {
  /** `uR` 的分隔符 */
  inlineSep: ' · ',
  /** `uR`：`参考图×N` */
  imagesCount: (n: number) => `参考图×${n}`,
  /** `uR`：`引用文本×N` */
  textRefsCount: (n: number) => `引用文本×${n}`,
  /** `dR`：`提示词：…` */
  prompt: (p: string) => `提示词：${p}`,
  /** `dR` 参数项：`模型 X` / `时长 Ns` / `比例 R` */
  model: (label: string) => `模型 ${label}`,
  duration: (s: number) => `时长 ${s}s`,
  ratio: (r: string) => `比例 ${r}`,
  /**
   * ★ `uR` 的时长**不带「时长」前缀**（原 `uR` 是 `` `${e.duration}s` ``）
   * ⚠️ 与 `dR` 的 `时长 Ns` **格式不同** —— 别合并成一个 formatter（曾因此写错，被单测抓出）
   */
  durationShort: (s: number) => `${s}s`,
  /** `dR`：`参数：A / B / C` */
  params: (joined: string) => `参数：${joined}`,
  /** `dR` 参数项分隔符 */
  paramSep: ' / ',
  /** `dR`：`风格：X` */
  style: (name: string) => `风格：${name}`,
  /** `dR`：`参考图：A、B` */
  refImages: (labels: string) => `参考图：${labels}`,
  /** `dR` 参考图名分隔符 */
  labelSep: '、',
  /** `dR`：`出片账号：X` */
  account: (name: string) => `出片账号：${name}`,
} as const;

/**
 * 生成进度回显（原 `B0` 42493-42567）
 *
 * ⚠️ 这些是**进度状态**文案，**不是**失败 label（失败 label 的真源是 `./failure` 的 `FAIL_LABEL`）。
 */
export const GEN_PROGRESS_TEXT = {
  notStarted: '生成未开始',
  dash: '—',
  unknown: '状态未知',
  nodeMissing: '节点不存在',
  failed: '失败',
  done: '已完成',
  queued: '排队中',
  idle: '未在生成',
  generating: '生成中',
  noProgress: '未能获取进度',
  waitingStart: '等待豆包开始生成',
  noRecord: '后台暂无该任务的生成记录',
} as const;

/**
 * 「排队追问」的文案（★ `TD-16-103` 生产者：源 `_Component43.jsx:2255-2262` 的 `st` 映射）
 *
 * 用途：追问页面「现在在排队吗」之后，把 `classifyReply` 的 `kind` 翻成**一句给用户看的话**，
 * 经 `core/rules/queuePing.queuePingText` 落到 `store.queueProgress[itemId].text`，
 * 最终显示在发送队列面板的「成片行」上。
 */
export const QUEUE_PING_TEXT = {
  none: '助手回复：当前没有正在生成的视频（仍在等待，未判定失败）',
  offer: '助手回复：是否要现在开始生成？（本次任务可能未被受理）',
  busy: '助手回复：任务正在排队 / 生成中',
  noReply: '已追问排队进度，暂未收到回复（继续等待出片）',
  /** `other` 的包装（源的 `` `助手回复：${…slice(0,80)}` `` —— 截断 80 由调用方做） */
  other: (excerpt: string): string => `助手回复：${excerpt}`,
} as const;
