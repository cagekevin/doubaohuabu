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
  /** 原 `H3` 42616 */
  permanent: '永久',
  /** 原 `H3` 42612 */
  expired: '已过期',
  /** 原 `H3` 42619 */
  remainingDays: (d: number) => `剩余约 ${d} 天`,
  /** 原 `H3` 42622（`Math.max(h, 1)` ⇒ 剩 5 分钟也显示 1 小时） */
  remainingHours: (h: number) => `剩余约 ${h} 小时`,
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
  storageFallback: '项目保存路径不可用，已暂时回退到应用默认存储',
  deleteConfirm: (name: string) => `删除项目「${name}」？此操作不可撤销。`,
  parseFailed: '项目文件解析失败',
  doubaoBackend: '豆包后台',
  export: '导出工程',
  generate: '生成',
  regenerating: '重新生成',
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
