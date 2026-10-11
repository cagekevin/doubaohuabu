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
export { ACCOUNT_NODE_TEXT, ACCOUNT_PICKER_TEXT, BATCH_SEND_TEXT, DOWNLOAD_NODE_TEXT, FP_SCAN_TEXT, GALLERY_TEXT, GEN_PANEL_TEXT, GROUP_NODE_TEXT, MATERIAL_NODE_TEXT, SEND_QUEUE_TEXT, VIDEO_NODE_TEXT } from './sendPanelText';

/**
 * toast 语气（原 `showToast(text, 'info' | 'warn' | 'err')`）
 *
 * ★ **2026-10-10 补**：`state/slices/ui.ts` 的 `pushToast` 原先**只有 message + duration**、
 *   没有语气 ⇒ 源版「同一句话按 info / warn / err 分级」的信息**全丢了**（都用同一个样式）。
 *
 * ⚠️ **放 `constants/` 而不是 `state/`**：`core/usecases`（如 `analyzePrompt`）要产出这个语气，
 *   而 core **不得向上依赖 state** ⇒ 与 `BackendErrorKind`（在 `constants/failure`）同法收口。
 * ⚠️ 源版第三档写作 `'err'`，本工程统一为 `'error'`（与 `BackendErrorKind` 的命名一致）。
 */
export const TOAST_LEVELS = ['info', 'warn', 'error'] as const;
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
   * 宿主边界契约违约（后端返回的形状与声明契约不符）
   *
   * ⚠️ 与 `unknownReason` 的区别：那句是「后端说了失败但没给原因」；
   *    本句是「后端连 `ok` 标志 / 必需字段都没给」—— 是**形状漂移**（schema drift），
   *    必须如实报出来，**不能静默当成功**（否则失败被伪装成「成功且值为空」）。
   */
  boundaryViolation: (field: string) => `宿主返回缺少必需字段 ${field}（契约违约）`,
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
} as const;

/**
 * 循环引用提示（原 27000 附近）
 * ⚠️ 单独导出为**顶层常量**，供 `core/rules/graph.ts` 直接引用
 *    （规则层不得硬编码文案 —— 原则 5 SSOT）
 */
export const CIRCULAR_REF_MESSAGE = '这样连会形成循环引用，已阻止';

/** 项目 / 顶栏 */
export const PROJECT_TEXT = {
  renameHint: '双击重命名项目',
  storageHint: '设置当前项目保存路径；工程、数据、操作记录、缓存、图片和视频会分类保存',
  setStoragePath: '设置保存路径',
  openStorageDir: '打开项目保存目录',
  counting: '统计占用…',
  storageBusy: '占用空间：统计中…',
  /**
   * 保存路径不可用（原 `openProject` 29904）—— `：` 后接**原始错误原文**
   * ⚠️ 原版是 `'项目保存路径不可用，已暂时回退到应用默认存储：' + (f.error || '')`
   *    ⇒ 无原因时**不带冒号**，故做成函数（原则 6：不覆盖原始 message，只拼接）。
   */
  storageFallback: (reason?: string) =>
    `项目保存路径不可用，已暂时回退到应用默认存储${reason ? `：${reason}` : ''}`,
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
  serializeFailed: '工程数据序列化失败，未保存',
  quotaExceeded: '保存失败：工程数据未能写入本地存储（本地存储空间不足）',
} as const;

/** 错误横幅按钮 */
export const BANNER_TEXT = {
  dismiss: '关闭此提示',
  clearAll: '全部清除',
} as const;

/** 画布选中工具条 */
export const SELECT_TOOLBAR_TEXT = {
  selected: (n: number) => `已选 ${n}`,
  group: '打组',
  groupHint: '至少选中 2 个非组节点才能打组',
  arrange: '整齐排列',
  ungroup: '取消组',
  ungroupHint: '释放组内节点，仅删除组容器',
  smartArrange: '智能整齐排列（网格）',
} as const;

/** 资源库 / 素材 */
export const LIBRARY_TEXT = {
  empty: '资源库为空，请先从右侧资源库或文件添加素材。',
  pickFromLibrary: '从资源库选择素材进行更换',
  pickFromFile: '从文件选择',
  alreadyOnCanvas: (name: string) => `「${name}」已在画布上，已移到落点（同一素材不重复创建）`,
} as const;

/** 代理池 */
export const PROXY_TEXT = {
  title: 'Lovart 出口代理池',
  hint: '每行一个代理（支持 http://host:port / socks5://host:port / host:port）',
  save: '保存并自动分配',
  assignment: '当前 Lovart 账号出口分配',
} as const;

/**
 * 指纹诊断（**只放 UI 独有文案**）
 *
 * ⚠️ **分级文案（ok/critical/warn）的真源不在这里**（2026-10-10，TD-02-1）：
 *    真源是 `core/rules/fingerprint.ts` 的 `COLLISION_LEVEL_LABEL`
 *    —— 它是 `Record<CollisionLevel, string>`，**带类型约束**（加一个 level 编译器会逼你补）。
 *    本文件原先的 `noMatch`/`critical`/`warn` 是**松散副本**（无约束，靠人维护）⇒ 已删。
 *    UI 需要分级文案时**直接 import `COLLISION_LEVEL_LABEL`**（ui 是上层，可依赖 core/rules）。
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
  title: {
    doubao: '豆包对话后台',
    dola: 'dola 对话后台',
    lovart: 'Lovart 后台',
    tapnow: 'Tapnow 后台',
    other: '自定义网站',
  } as Record<string, string>,
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
  /** 引用预览行的前缀（`参考图1` 由 `formatReferenceLabel` 给，这里只给分隔符） */
  previewSep: ' · ',
  /** 引用指向的素材**找不到**时的标注（原 `CL.jsx` 用 `.ref-missing` 样式表达，没有文案） */
  previewMissing: '（找不到该素材）',
} as const;

/**
 * 节点内编辑（文本正文 / 节点名 / 提示词）
 *
 * ★ **2026-10-10 补**：此前应用里**没有任何地方能写 `data.text`**（`patchNodeData`
 *   只被用来写 `aspectRatio`/`igResolution`/`imageCount`/`model`）⇒ 双击建出的文本节点
 *   永远空串、生成节点没有提示词 ⇒ `generate` 发出去的是**空提示词**。这是与
 *   「8 类节点只建得出 2 类」同批的**未登记断链**。
 *
 * ⚠️ **两处占位文案有意短于源版**（已留痕）：源版写的是
 *   `输入文字，输入 @ 从资源库引用素材…`（`CL.jsx:818`）与
 *   `描述想要画的内容…（输入 @ 引用素材）`（`_Component45.jsx:1211`）——
 *   但 **`@` 引用特性尚未落地** ⇒ 显示原文就是**对用户承诺不存在的能力**（违背判据 B4）。
 *   故当前只显示前半段；源版全文保留在 `*WithRefs` 字段里，**该特性落地后改回**。
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
  groupPending: '（分组功能尚未落地）',
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
