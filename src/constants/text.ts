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

/** 授权 / 加载 */
export const LICENSE_TEXT = {
  checking: '正在校验授权…',
  fetchFailed: '授权状态获取失败',
  permanent: '永久授权',
  expired: '已过期',
  remainingDays: (d: number) => `剩余 ${d} 天`,
  remainingHours: (h: number) => `剩余 ${h} 小时`,
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
