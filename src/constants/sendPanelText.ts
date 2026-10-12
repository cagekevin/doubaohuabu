/**
 * 发送 / 面板相关的 UI 文案（★ SSOT 的**分片**，由 `constants/text.ts` 转发导出）
 *
 * ★ **2026-10-10 拆出来**：`text.ts` 撞上 `eslint` 的 `max-lines`（405 > 400）——〔⚠️ **该规则已于 2026-10-11 关闭**；本文件内所有 `max-lines` 提及同此〕。
 *   它的头写着「文案只允许出现在本文件」，**但同一文件早已 re-export `./failure`**
 *   （`FAIL_LABEL` / `BACKEND_ERROR_LABEL`）⇒ 按**同一先例**分片：
 *   定义住在这里，`constants/text.ts` 转发导出 ⇒ 调用方 `@/constants/text` **零改动**。
 *
 * ⚠️ 铁律的**本意**是「面向用户的字符串不得散落在 store/core/ui」—— 本文件仍在 `constants/`，
 *   符合本意；真正的违规是"在组件里内联中文"，不是"SSOT 分片"。
 *
 * ★ **2026-10-11 再拆一次（同一先例）**：本文件又被 `max-lines` 拦（代码行 402 > 400，落完
 *   「自动值守 + 长按拖出」的文案之后）⇒ 把**彼此内聚**的「出新图」那一族（`NEW_IMAGES_TEXT`）
 *   挪到 `newImagesText.ts`。公开入口不变（`constants/text.ts` 转发）。
 *
 * ⚠️ **2026-10-12**：本文件**破了"纯文案、零 import"的惯例一次** ——
 *   `GEN_IMAGE_TEXT.metaDefaultRatio` 要吃**默认比例真源** `NODE_DEFAULT_RATIO_LABEL`
 *   （`./models`，同层 `constants`，**不成环**）。⚠️ 漏 import 的后果是**整站白屏**
 *   （`ReferenceError`，实测踩过）⇒ 改本文件后**必须**跑一次 `tsc`。
 */

import { NODE_DEFAULT_RATIO_LABEL } from './models';

/**
 * 执行账号选择器（原 `_Component45.jsx:1265-1374` 的 `.gp-acc-*`；`fL.jsx`/`ZL.jsx` 同款）
 *
 * ⚠️ 逐字对齐源版（含 `←` / ` · ` / 全角括号）。
 */
export const ACCOUNT_PICKER_TEXT = {
  /** 按钮 `title`（原 1266，逐字） */
  buttonTitle: '执行账号：选分组/账号即按其类型走豆包/Dola/GPT 后台，选 API 则走 API 服务商出图',
  /** 未选中时的兜底（原 `Se` 的最后一档） */
  auto: '自动',
  /** 根层第一项（原 1315） */
  allAccounts: '全部账号（自动）',
  /** 根层空态（原 1339） */
  empty: '暂无账号，请先在「账号」页登录',
  /** API 项（原 1337：`API` / `API（未配置）`） */
  api: 'API',
  apiUnconfigured: 'API（未配置）',
  /** API 项 `title`（原 1333 的三目） */
  apiTitleReady: '走图片 API 服务商出图（不占用登录账号）',
  apiTitleMissing: '未配置图片 API 服务商（到「API 服务」设置）',
  /** 分组层返回（原 1356：`← {组名}`） */
  back: (label: string) => `← ${label}`,
  /** 分组层「自动选择」（原 1361：`自动选择可用{组名}`，**无空格**） */
  autoInGroup: (label: string) => `自动选择可用${label}`,
  autoInGroupTitle: '在该分组内自动挑空闲账号执行文生图',
  autoInGroupDisabledTitle:
    '该分组内暂无可执行文生图（豆包/Dola/GPT）的账号：可先选组内账号或改用 API',
  /** 逐账号项 `title`（原 1366：`${名} · ${可用 ? '可用' : 状态 || '不可用'}`） */
  accountTitle: (name: string, usable: boolean, status: string) =>
    `${name} · ${usable ? '可用' : status || '不可用'}`,
  accountUnavailable: '不可用',
} as const;

/**
 * 批量发送面板（原 `L3.jsx` 256 行 = `x3` 的**视图半**）
 *
 * ⚠️ 逐字对齐源版（含 `·` 分隔符、全角括号与 `＋`）。
 * ⚠️ **状态文案是 `D3`（42452-42458），不是 `O3`** —— 后者是**发送队列**（`z3.jsx` 的
 *    `sendQueue.items`）的映射，键集不同（`failed`/`cancelled` vs `error`/`skipped`）。
 */
export const BATCH_SEND_TEXT = {
  /** `D3`（原 42452-42458）—— `x3` 的五个节点状态 */
  status: {
    waiting: '等待中',
    sending: '发送中',
    success: '成功',
    error: '失败',
    skipped: '已跳过',
  } as Readonly<Record<string, string>>,
  /** 原 179 的按钮文案（`·` 两侧是**半角空格**） */
  trigger: (n: number) => `批量发送 · ${n}`,
  /** 原 179 的 `title`（逐字） */
  triggerTitle: (n: number) => `按位置顺序（先上后下、同行先左后右）批量发送这 ${n} 个节点（文本框 / 文生视频）`,
  /** 原 187-189 的第二个按钮（**这段功能未落地**，见下方的「未落地」注释） */
  triggerQueue: '加入队列',
  triggerQueueTitle: '加入右下角发送队列：可暂停 / 取消单条 / 失败重跑，适合大批量',
  /** 原 197 —— 运行中标题 */
  running: (done: number, total: number) => `批量发送中 · ${done}/${total}`,
  /** 原 197 —— 完成标题（`跳过` 段仅在 `C > 0` 时出现） */
  done: (ok: number, fail: number, skipped: number) =>
    `批量发送完成 · 成功 ${ok} · 失败 ${fail}${skipped ? ` · 跳过 ${skipped}` : ''}`,
  /** 原 199-205 */
  abortAll: '全部中止',
  close: '关闭',
  /** 原 229-232 的决策区 */
  decisionReason: (name: string, msg: string) => `「${name}」发送失败：${msg}`,
  decisionRemaining: (n: number) => `（还有 ${n} 个节点未发送）`,
  decisionLast: '（已是最后一个节点）',
  /** 原 234-238 */
  continueRest: (n: number) => `继续发送后续 ${n} 个`,
  abortNow: '立即中止',
  /** 原 244 */
  decisionNoNeed: '已是最后一个节点，无需决策',
  /** 原 248-251 的汇总 */
  summaryAborted: '本次批量已被中止，后续节点未发送。',
  summaryNote:
    '执行顺序为节点位置顺序（先上后下、同行先左后右）；账号发成功后保持占用，失败已自动释放。',
} as const;

/**
 * 生成面板（原 `_Component45.jsx` 的 `.gp-*` 工具条）
 *
 * ★ **2026-10-10 补**：`GenPanel.tsx` 里 `比例`/`分辨率`/`张数`/`模型` 四个标签
 *   （内联中文字面量违反原则 5 ⇒ 一律从本表取）。
 * ⚠️ 源版这些按钮**没有可见标签**（说明都写在 `title` 里）⇒ 这五个标签是**本工程新增**
 *    （本工程的面板是纵向表单式，不是横向工具条，需要标签才读得懂）。
 */
export const GEN_PANEL_TEXT = {
  /** 面板标题 —— 文生图（原 `_Component45.jsx` 的 `Ge`） */
  imageTitle: '文生图',
  /** 提示词正文的 `aria-label`（原 `Z3_1.jsx:1005`，逐字） */
  promptAria: '提示词正文',
  /** 提示词占位 —— 文生视频（原 `Z3_1.jsx:1005` 的 `data-placeholder`，逐字） */
  promptPlaceholderVideo: '描述想生成的视频画面…（输入 @ 引用素材）',
  /** 提示词占位 —— 文生图（原 `_Component45.jsx:1211`，逐字） */
  promptPlaceholderImage: '描述想要画的内容…（输入 @ 引用素材）',
  /** 工具条上的 `@` 按钮 `title`（原 `Z3_1.jsx:1013`，逐字） */
  atTitle: '引用素材（弹出素材列表，选中后以「微缩图 + 素材名」插入正文）',
  /** `.gp-meta` 尾项：已引用几张参考（原 `Z3_1.jsx:967`，**含前导分隔符**，逐字） */
  metaRefs: (n: number) => ` · ${n} 张参考`,
  /** 时长按钮 `title`（原 `Z3_1.jsx:1147`，逐字 —— 上下界来自 SSOT） */
  durationTitle: (seconds: number) => `视频时长：${seconds} 秒（4–30 秒可调）`,
  /** 生成按钮 `title` —— 走 API 通道（原 `1197` 的 `Je === 'api'` 支，逐字） */
  runApiTitle: (providerName: string) =>
    `走 API 通道生成${providerName ? `（${providerName}）` : '（未配置可用服务商）'}`,
  /** 生成按钮 `title` —— 已有结果（原 `1197` 的 `Le` 支，逐字） */
  regenerateTitle: '按当前提示词与参数重新生成（可连点：自动换另一个空闲账号并行）',
  /** 生成按钮 `title` —— 首次生成（原 `1197` 的 else 支，逐字） */
  generateTitle: '按当前提示词与参数生成视频（可连点：自动换另一个空闲账号并行）',
  /** 拖高手柄 `aria-label`（原 `Z3_1.jsx:1203`，逐字） */
  resizeAria: '拖动调整输入框高度',
  /** 拖高手柄 `title`（原 `Z3_1.jsx:1203`，逐字；`h` = 复位高度） */
  resizeTitle: (h: number) => `拖动调整输入框高度（双击复位 ${h}px）`,
  /** 执行账号行（原 1266 的按钮，标签语义取自它的 `title` 首四字） */
  accountLabel: '执行账号',
  ratioLabel: '比例',
  resolutionLabel: '分辨率',
  countLabel: '张数',
  modelLabel: '模型',
  /** 关闭按钮 `title`（原 `Z3_1.jsx:969`，逐字） */
  closeTitle: '保存并关闭（Esc）',
  /** 关闭按钮字形（原 `Z3_1.jsx:970`，逐字） */
  closeGlyph: '✕',

  // ── 批量出片（原 `Z3_1.jsx:856-944` 的 `st`）─────────────────────────────
  /** 按钮文案（原 1201，逐字） */
  batchLabel: '批量出片',
  // ── 风格库入口（原 `Z3_1.jsx:1021-1045` 的 `.gp-style-*`）───────────────
  /** 未选风格时的按钮内文（原 1024 的 `◇ 风格 ` —— **尾部有一个空格**，逐字） */
  styleIdle: '◇ 风格 ',
  /** 未选风格时的按钮 `title`（原 1021，逐字） */
  styleIdleTitle: '风格库：发送时注入的修饰前缀（单选；「不使用风格」则不传）',
  /** 药丸号/前缀字形（原 1034 的 `◇`） */
  styleChipGlyph: '◇',
  /** 药丸主按钮 `title`（原 1031，逐字） */
  styleChipTitle: (name: string) => `风格「${name}」：点击打开风格库`,
  /** 药丸移除按钮 `title`（原 1036，逐字） */
  styleChipRemove: (name: string) => `移除风格「${name}」`,
  /** 药丸移除字形（原 1039，逐字） */
  styleChipRemoveGlyph: '×',
  /** 按钮 `title`（原 1200，逐字；`name` = provider 展示名） */
  batchTitle: (name: string) =>
    `批量出片：同一提示词 + ${name}，按 16:9 / 9:16 / 1:1 三个比例各出一片（复用并发队列）`,
  /** 提示词为空（原 858，逐字；文生图面板同句，见 `_Component45.jsx:862`） */
  batchNoPrompt: '请先输入提示词',
  /** 无可用视频 provider（原 862，逐字） */
  batchNoProvider: '没有可用的 API 服务商：请到顶栏「API 服务」启用并保存密钥',
  /** 提交成功（原 940，逐字；`count` = 真正提交成功的任务数、`name` = provider 名） */
  batchSubmitted: (count: number, name: string) =>
    `已批量提交 ${count} 个任务（多比例 · ${name}），出片后自动连到本节点`,
  /** 提交失败（原 942，逐字；`msg` = **后端原文**，原则 6 不得改写） */
  batchFailed: (msg: string) => `批量提交失败：${msg}`,
} as const;

/**
 * 风格库弹窗（原 `US.jsx`，294 行 —— 本仓落其**视图半**）
 *
 * ⚠️ 全部**逐字对齐源版**（含全角标点 / 空格）。
 * ⚠️ 源版 CSS 未入库、mockup 也未收录 `.slm-*` / `.style-lib-*` ⇒ 样式为**推断值**
 *    （全 token，见 `StyleLibraryModal.module.css`）—— 并入 `TD-16-87` 家族。
 */
export const STYLE_LIB_TEXT = {
  title: '风格库',
  /** ✕ 的 `title`（原 154） */
  close: '关闭',
  /** ✕ 字形（原 155） */
  closeGlyph: '✕',
  /** 卡片选中勾（原 200） */
  checkGlyph: '✓',
  // ── 顶部三颗 tab（原 158-179）──
  tabNew: '新建风格',
  tabNone: '不使用风格',
  tabReset: '恢复默认',
  hint: '点击卡片选用并关闭 · 「不使用风格」则不传风格',
  /** 空表（原 182-184） */
  empty: '风格库为空。点「新建风格」添加，或点「恢复默认」载入内置风格集。',
  // ── 卡片（原 185-217）──
  cardPick: (selected: boolean, name: string) => `${selected ? '取消选用' : '选用'}「${name}」并关闭`,
  cardEdit: '编辑',
  cardRemove: '删除',
  /** 无封面时的字形（原 199 的 `(D.name || '风').slice(0, 1)` —— 兜底字 `风`） */
  cardGlyph: (name: string) => (name || '风').slice(0, 1),
  // ── 编辑页（原 224-292）──
  editTitleNew: '新建风格',
  editTitle: (name: string) => `编辑：${name}`,
  editClose: '关闭编辑',
  uploadCover: '上传封面',
  clearCover: '清除封面',
  nameLabel: '名称',
  namePlaceholder: '风格名称，如：国风二次元',
  prefixLabel: '提示词（会注入生成）',
  prefixPlaceholder: '发送时注入到账号对话框的修饰文字，如：国风二次元插画风格，工笔线条，青绿山水配色，',
  cancel: '取消',
  save: '保存',
  confirmDelete: (name: string) => `确定删除风格「${name}」？`,
  /**
   * ★ **本工程新增**（源版是 `console.warn('[style-lib] 封面解析失败:', …)` **静默**）——
   *   按「失败可见」给一条 toast（**有意差异**，并入 `TD-16-87` 家族说明）。
   */
  coverFailed: '封面读取失败，请重试',
} as const;


/**
 * 账号节点（原 `OL.jsx` 525 行 = 账号节点的**视图半**）
 *
 * ★ 节点的语义（源 `OL.jsx:498-501` 的按钮 `title` 逐字）：**同步比例/时长/模型，
 *   并把文本框与素材填入所选账号对话框（不触发发送）** —— 它是「填表」节点，不是「发送」节点。
 */
export const ACCOUNT_NODE_TEXT = {
  /** 节点头部文本（原 `OL.jsx:414` 的裸文本 `发送节点`，逐字） */
  title: '发送节点',
  /** 未绑定时的按钮文案（原 `OL.jsx:289` 的 `'选择账号'`） */
  pickAccount: '选择账号',
  /** 绑定菜单的「未绑定」项（原 `OL.jsx:456` 的 `foot-menu-grid-header`） */
  noneBound: '未绑定',
  /** 发送前守卫：没绑号（原 `OL.jsx:298`） */
  needAccount: '请先选择账号',
  /** 发送前守卫：没输入（原 `OL.jsx:305`；判据是 `total === 0`） */
  noInput: '未连接文本框或素材',
  /** 进行中（原 `OL.jsx:323`） */
  filling: '正在同步参数并填入…',
  /**
   * 重试中（原 `OL.jsx:334`，由 `onProgress.type === 'retry'` 触发）
   *
   * ★ **`TD-07-9` 结清（2026-10-11，回源）**：本条**当前 0 消费者** —— 它的触发链在
   *   **「仅填入」半**（`OL.jsx:329` 的 `Bu(pe, {onProgress})`），而该半**未落**：
   *   `AccountNode.tsx:16-22` ⛔ 如实标注 · `docs/13` §1.3 `[~]` · `docs/14`「3 账号节点发送」`[~]`。
   *   ⇒ **保留不删**（那条链落时即用）；**也不给它造消费者**（那是另一条链的事）。
   */
  retrying: '重试中…',
  /** 失败兜底（原 `OL.jsx:367`） */
  fillFailed: '填入失败',
  /** 成功摘要的三段（原 `OL.jsx:342-352`） */
  textsFilled: '文本已填',
  imagesAttached: (n: number, total: number) => `图片 ${n}/${total}`,
  autoSent: '已自动发送',
  /** ⚠️ 全角括号（原 352 逐字） */
  filledOnly: '（仅填入，未发送）',
  /** 发送前校验未通过（原 `OL.jsx:340` 的兜底文案） */
  precheckFallback: '发送前校验未通过',
  /** 校验告警后缀（原 `OL.jsx:355`） */
  precheckWarn: (issue: string) => `；⚠ ${issue}（请人工核对后发送）`,
  /** 按钮 `title`（原 `OL.jsx:501` 逐字） */
  sendTitle: '同步比例/时长/模型，并把文本框与素材填入所选账号对话框（不触发发送）',
  /** 按钮文案（原 `OL.jsx:504-506`：`↑ 发送` / `⟳ 发送中…`）—— 源版标签就是「发送」，语义由 `title` 补 */
  send: '发送',
  sendBusy: '发送中…',
  /** 自动发送开关的 `title`（原 `OL.jsx:418` 逐字） */
  autoSendTitle: '开启后，填入内容+参数后将自动点击发送按钮',
  /**
   * ★ **本工程新增**：说明「填入」这条通道还没接通（不静默、不假装）
   *
   * 原 `OL.jsx:329` 走的是 `Bu(pe, {onProgress})` —— 它的返回里有
   * `imagesAttached`/`imagesTotal`/`autoClicked`/`precheck`，语义是**「填入（可选连发送一起做）」**；
   * 而本工程已落的 `SitePort.send` 是**「发送 + 等生成结果」**（`doubao/index.ts:185` 里带
   * `pollResults`）⇒ **两者不是同一个操作，不能拿它冒充**（否则"仅填入"会变成"真发出去并等出片"）。
   * ⇒ 按钮**禁用**并把原因写在 `title` 里（判据 B4：不对用户承诺不存在的能力）。
   */
  channelPending: '该通道尚未接通：原 Bu 的「填入」语义与已落的 SitePort.send（发送+等结果）不同',
  /**
   * 汇总行（原 `OL.jsx:522`：`` `已链接 ${x.materials.length} 张素材 · ${x.texts.length} 个文本框` ``，逐字）
   * ⚠️ 与「本工程新增的输入预览」不同 —— 源里**只有这一行**（没有逐条列出"将要填入什么"）。
   */
  linkedSummary: (materials: number, texts: number) =>
    `已链接 ${materials} 张素材 · ${texts} 个文本框`,
} as const;

/**
 * 组节点（原 `GL.jsx` 39 行 = 组节点的**视图半**）
 *
 * ★ 组的语义：**容器**（`zIndex = -1001`，在其它节点之下），成员靠 `parentId` 归属。
 */
export const GROUP_NODE_TEXT = {
  /** 默认名（原 `GL.jsx:17` 的 `data.label || '组'`） */
  defaultLabel: '组',
  /** 组头 `title`（原 20，逐字） */
  headTitle: '拖动标题栏可整体移动该组',
  /** 计数 `title`（原 27，逐字） */
  countTitle: '组内节点数',
  /** 取消组按钮 `title`（原 30，逐字 —— **与选择工具条上的那句不同**，见下） */
  ungroupTitle: '取消组：释放内部节点，仅删除组容器',
  /** 取消组按钮文案（原 36） */
  ungroup: '取消组',
  /**
   * ⚠️ **选择工具条上的「打组」/「取消组」文案不在这里** —— 它们（连同源版工具条那句
   *   「释放**组内**节点」）已归 `SELECT_TOOLBAR_TEXT`（`SelectionToolbar` 的唯一文案源）。
   *   本组只留**组节点自身**用到的文案（`ungroupTitle` 那句「释放**内部**节点」）。
   *   **不留没有落点的文案**（判据 B5）。
   */
} as const;

/**
 * 素材节点（原 `fL.jsx` 270 行 —— 素材节点的**视图半**）
 *
 * ⚠️ 源版有两条**未落地**的动作，本工程**渲染但禁用**并写明原因（判据 B4）：
 *   ① 「编辑图片」→ `openImageEditor`（遮脸 / 裁剪）—— 需要一个独立的图片编辑器
 *   ② 图片上的**人脸遮罩层**（`iL.jsx` 191 行：识别人脸 + 单击遮脸 + 双击设参数）
 *      它甚至不在 `fL.jsx` 里，而是挂在图片上的独立组件 ⇒ 独立大件。
 */
/** 节点标题（`NodeTitle`）—— 显示态 ↔ 改名态的公共文案 */
export const NODE_TITLE_TEXT = {
  /** 名称的 `title`（双击改名；与素材 / 视频 / 分组三处既有文案同字） */
  renameTitle: '双击重命名',
} as const;

export const MATERIAL_NODE_TEXT = {
  /** 标题前缀（原 154：`素材 · {名字}`，**逐字**含 ` · `） */
  headPrefix: '素材',
  /** 名字兜底（原 19：空或字面量 `undefined` ⇒ `素材`） */
  fallbackName: '素材',
  /** 标题 `title`（原 153，逐字） */
  renameTitle: '双击重命名',
  /** 没有图片时（原 161，逐字） */
  noImage: '暂无图片',
  /** 编辑图片按钮（原 163 的文案与 title，逐字） */
  editImage: '编辑图片',
  editImageTitle: '编辑图片（遮脸 / 裁剪）',
  /** 分析提示词按钮（原 179-190，与生成节点**逐字相同**） */
  analyze: '分析提示词',
  analyzeBusy: '分析中…',
  analyzeTitle: '用后台空闲豆包 / Dola 账号反推图片提示词',
  /**
   * ★ **本工程新增**：说明「编辑图片」为何点不动
   *    源版 `openImageEditor({nodeId, imgRef, label})` 会开一个遮脸/裁剪编辑器
   *    （连同图片上的 `iL.jsx` 人脸遮罩层）—— 那是一整个独立功能，**尚未落地**。
   *    按钮**禁用**并把原因写在 `title` 里（判据 B4），同时**可见地**标出来。
   */
  editImagePending: '「编辑图片」（遮脸 / 裁剪）尚未实现',
} as const;

/**
 * 下载节点（原 `WL.jsx` 150 行 = 下载节点的**视图半**）
 *
 * ★ 语义：把**连到它的视频节点**的 `url` 批量落盘（源版空态原文见 `empty`）。
 * ⚠️ `unknownError` 是**本工程新增**（源版直接写 `'未知错误'` 字面量，未入 SSOT —— 顺手收口）。
 */
export const DOWNLOAD_NODE_TEXT = {
  /** 标题（原 108，逐字） */
  title: '下载节点',
  /** 目录行前缀（原 113，逐字含全角冒号） */
  folderLabel: '目录：',
  /** 未选目录（原 114 的 `title={a || '未选择'}`） */
  folderNone: '未选择',
  /** 选目录按钮（原 `WL.jsx:118` 的 `选择…`，逐字含省略号） */
  chooseFolder: '选择…',
  /** 空态（原 140，逐字） */
  empty: '从视频节点连线至此处以批量下载',
  /** 下载中（原 129-130 的 `⬇` 图标；本工程配文字以免只靠符号） */
  statusDownloading: '⬇',
  /** 成功（原 131-133 的 `✓`） */
  statusOk: '✓',
  /** 失败（原 134-136 的 `✗`） */
  statusErr: '✗',
  /** 批量下载按钮（原 `WL.jsx:129`：`` `全部下载 (${o.length})` ``，逐字含括号与空格） */
  downloadAll: (count: number) => `全部下载 (${count})`,
  downloading: '下载中…',
  /** 每条的兜底名（原 127 的 `title={y}` 用的是名字本身） */
  untitled: '未命名',
  /** 已下载总量（原 145：`已下载 {Kd(m)}`） */
  downloaded: (size: string) => `已下载 ${size}`,
  /** 失败兜底（原 75：`(S == null ? undefined : S.error) || '未知错误'`） */
  unknownError: '未知错误',
} as const;

/**
 * 视频节点（原 `BL.jsx` **492 行** = 视频节点的**视图半**；本工程落**最小可用子集**）
 *
 * ★ 语义：一条**成片**（`url` 指向本地/远程视频），带**来源**（哪个节点产出的）与
 *   **配方**（`recipe`：产出它的提示词与参数）。
 */
/**
 * `auto:<channel>` 的频道显示名（原 `YL.jsx:93-99` 的**内联字面量映射**）
 *
 * ⚠️ 与 `ACCOUNT_TYPE_LABEL`（`豆包后台` / `自定义网站`）、`SITE_DISPLAY_NAME`（无 `lovart`/`tapnow`）
 *    **都不是同一张表** —— 源在这里另写了一份 ⇒ 逐字保留，不合并。
 */
const GEN_VIDEO_CHANNEL_LABELS: Readonly<Record<string, string>> = {
  doubao: '豆包',
  dola: 'Dola',
  lovart: 'Lovart',
  tapnow: 'Tapnow',
  other: '其他',
};

/**
 * 文生视频节点（`type: 'genvideo'` —— 原 `YL.jsx` 的 `gv-*`）
 *
 * ★ **2026-10-11 补** `gv-stage` + `gv-waiting` + `gv-preview-empty` + `gv-media-fallback`
 *   （原 `YL.jsx:485-530`），并**修正** `gv-meta` 第 2 项（原误用 `aspectRatio`，
 *   源实为 `y` = **执行账号标签** —— 见 `core/rules/genVideo.nodeAccountLabel`）。
 *
 * ⚠️ 仍未落：`gv-dl` / `gv-tl` / `gv-play` / `gv-dur-badge` / `gv-apijob` / `gv-hist-btn` /
 *    `gv-frame-btn`×3（整块，见 TD-16-79）；`gv-waiting` 的**后两态**（`p` = `nodeNotices`
 *    的 `generation-confirm`）**无数据源** —— 见 TD-16-81。
 */
export const GEN_VIDEO_TEXT = {
  /** 节点标题（原 `YL.jsx`；禁裸字面量 —— 原则 5） */
  title: '文生视频',
  /** `gv-meta` 的「已连接 N 个输入」（原 558，逐字） */
  metaInputs: (n: number) => `已连接 ${n} 个输入`,
  /** meta 各项之间的分隔（原 558 的 ` · `，逐字） */
  metaSep: ' · ',

  // ── `gv-meta` 第 2 项：执行账号标签（原 `y`，`YL.jsx:62-109`）──────────────────
  /** 空 / `'auto'`（与 `ACCOUNT_PICKER_TEXT.allAccounts` 逐字相同，但**分属两处源**） */
  accountAll: '全部账号（自动）',
  /** `auto:group:ungrouped` */
  accountUngrouped: '未分组（自动）',
  /** `auto:group:<id>` 命中组 */
  accountInGroup: (name: string) => `${name}（自动）`,
  /** `auto:group:<id>` 组名缺失时的兜底（原 `'分组'`） */
  accountGroupFallback: '分组',
  /** `auto:<channel>` */
  accountAutoChannel: (label: string) => `${label}账号（自动）`,
  /** 显式账号 id 查不到时的兜底（原 `'豆包账号（自动）'`） */
  accountFallback: '豆包账号（自动）',
  /** 频道显示名表（原 93-99 的内联映射，逐字） */
  channelLabels: GEN_VIDEO_CHANNEL_LABELS,

  // ── `gv-stage` / `gv-waiting` / `gv-preview-empty` / `gv-media-fallback`（原 485-530）──
  /** 等待浮层 `aria-label`（原 488；源另一支 `'等待后台确认'` 属**无数据源**的那两态 —— TD-16-81） */
  waitingAria: '正在生成',
  /** 等待文案 —— 已有结果时（原 492 的 `h` 支，逐字） */
  waitingRegenerate: '正在生成新的一条…',
  /** 等待文案 —— 首次生成时（原 492，逐字） */
  waitingFirst: '正在生成 · 出片后展示在这里',
  /** 空舞台标题（原 498，逐字） */
  stageEmptyTitle: '文生视频 · 在下方输入提示词',
  /** 空舞台副标题（原 500，逐字） */
  stageEmptySub: '点击卡片打开生成面板，出片直接展示在这里',
  /** 有结果但既无 `resultUrl` 也无 `resultPoster`（原 498 的 `gv-media-fallback`，逐字） */
  mediaFallback: '视频已生成',
  /** 缩略图/海报的按需宽度（原 `Xt(d.resultPoster, 480)` 的 `480`） */
  posterThumbWidth: 480,

  // ── 自绘播放控件（`gv-play` / `gv-dur-badge` / `gv-tl`，原 502-555）──────────────
  /** `gv-dur-badge` 的 `aria-label`（原 510：`真实时长 ${D} 秒`，逐字） */
  durBadgeAria: (seconds: string) => `真实时长 ${seconds} 秒`,

  // ── `gv-dl` 下载（原 `ke`，`YL.jsx:349-400`）──────────────────────────────────
  /** `gv-dl` 的 `title` / `aria-label`（原 513，逐字） */
  download: '下载',
  /**
   * 另存为对话框的过滤器名 —— **视频支**（原 363：`X ? '视频文件' : '图片文件'`，逐字）。
   * ⚠️ 「图片文件」与「下载失败 / 已下载到 / 在文件夹中显示」4 句**两域逐字相同**
   *    ⇒ 已收口到 `COMMON_TEXT`（判据 C1，2026-10-11）。
   */
  videoFilter: '视频文件',

  // ── `gv-apijob` API 任务状态条（原 561-563）──────────────────────────────────
  /** 状态条的 `title`（原 561，逐字） */
  apiJobTitle: 'API 通道任务状态',
  /** `queued`（原 562，逐字） */
  apiJobQueued: '⏳ API 排队中',
  /** `submitting`（原 562，逐字） */
  apiJobSubmitting: '⏳ API 提交中',
  /** `running` 但**无进度**（原 562 的 `'…'` 支，逐字） */
  apiJobRunning: '🎬 API 生成中…',
  /** `running` 且有进度（原 562：`🎬 API 生成中 ${progress}%`，逐字） */
  apiJobRunningProgress: (progress: number) => `🎬 API 生成中 ${progress}%`,
  /** `downloading`（原 562，逐字） */
  apiJobDownloading: '⬇️ API 结果接收中',
  /** `failed`（原 562：`⚠️ API 失败：${error.message || '未知错误'}`，逐字） */
  apiJobFailed: (message: string) => `⚠️ API 失败：${message}`,
  /** `cancelled`（原 562，逐字） */
  apiJobCancelled: '⏹ API 任务已取消',

  /** 卡片 `title`（原 471，逐字）—— 三帧按钮 / 下载 / 播放 / 时间线**均已落**（2026-10-11） */
  cardTitle:
    '点击卡片（除正中播放按钮 / 时间线 / 下载 / 三帧按钮外）打开生成面板；正中按钮内联播放暂停；时间线拖动定位当前帧；↧ 下载结果；卡片下方三帧按钮把对应画面落到画布作参考图',

  // ── 「三帧→画布参考图」（原 `se`，`YL.jsx:206-348,564-584`）──────────────────────
  /** 三个按钮文案（原 572/577/582，逐字） */
  frameHead: '头帧→画布参考图',
  frameCurrent: '当前帧→画布参考图',
  frameTail: '尾帧→画布参考图',
  /** 取帧后的素材名（原 294-298 的内联映射，逐字） */
  frameLabels: { head: '视频首帧', current: '视频当前帧', tail: '视频尾帧' } as const,
  /** 映射查不到时的兜底（原 298 的 `|| '视频当前帧'`，逐字） */
  frameFallbackLabel: '视频当前帧',
  /** 成功提示（原 335：`` `已把「${名}」放到画布作参考图` ``，逐字） */
  frameToast: (name: string) => `已把「${name}」放到画布作参考图`,
  /** 失败提示前缀（原 337：`'截帧失败：' + (msg || '未知错误')`，逐字） */
  frameFailed: (reason: string) => `截帧失败：${reason}`,
  /** 取帧内部错误原文（原 218/249/264 的三个 `throw`，逐字） */
  frameNoUrl: '无视频地址',
  frameLoadFailed: '视频加载失败',
  frameNoSize: '视频尺寸未就绪',
  frameTimeout: '取帧超时',
  /** 取帧总超时（原 227 的 `8000`） */
  frameTimeoutMs: 8000,

  // ── 历史版本（`gv-hist-btn` / `gv-hist-pop`，原 401-470,479-483,585-620）──────
  /** 头部按钮（原 482：`` `历史 ${V.length}` ``，逐字） */
  histBtn: (n: number) => `历史 ${n}`,
  /** 按钮 `title`（原 479，逐字） */
  histBtnTitle: '历史版本：查看 / 切换历次生成的视频',
  /** 弹层标题（原 593：`` `历史版本 · 共 ${V.length} 版` ``，逐字） */
  histTitle: (n: number) => `历史版本 · 共 ${n} 版`,
  /** 条目 `title` —— 可切换（原 600：`` `切换到版本 #${n}` ``，逐字） */
  histItemTitle: (n: number) => `切换到版本 #${n}`,
  /** 条目 `title` —— 未出片（原 600，逐字） */
  histItemDisabledTitle: '该版本未出片（无视频）',
  /** 缩略图缺位文案（原 605，逐字） */
  histNoVideo: '无片',
  /** 缩略图缺位字形（原 605，逐字） */
  histPlayGlyph: '▶',
  /**
   * 缩略图按需宽度（原 604 的 `Xt(X.poster, 120)`）
   * ⚠️ 文生图（`ZL.jsx:302`）**同一个 120** ⇒ 两域各留一份（判据 C1 第 2 次出现；第 3 次须收口）。
   */
  histThumbWidth: 120,
} as const;

/**
 * 文生图节点（原 `ZL.jsx`）
 *
 * ⚠️ 与 `GEN_VIDEO_TEXT` **逐字相同**的下载 4 句（`下载失败：` / `已下载到：` /
 *    `在文件夹中显示` / `图片文件`）**已收口到 `COMMON_TEXT`**（判据 C1，两域共用）；
 *    此处只放**本域独有**的文案。
 */
/**
 * 提示词预设（原 `addPreset` `shared.js:27857-27873` + 按钮 `CL.jsx:774-779`）
 *
 * ⚠️ 源里提示词预设**只写不读**（没有列表 / 套用方 —— 119 个展开组件里都没有）
 *    ⇒ 本仓照实建模，**不假装它有 UI**（同 `stable/model/project.ts` 的 `PromptPreset` 头注）。
 */
export const PRESET_TEXT = {
  /** 按钮 `title`（原 `CL.jsx:774`，逐字） */
  saveTitle: '保存到提示词预设',
  /** 空闲态按钮（原 778，逐字） */
  save: '保存预设',
  /** 保存后 **1.5s** 的按钮态（原 778 + 222-224，逐字） */
  saved: '✓ 已保存',
  /** `name` 兜底（原 `shared.js:27864`，逐字） */
  unnamed: '未命名预设',
  /** **节点预设**的 `name` 兜底（原 `shared.js:28391` 的 `'未命名节点预设'`，逐字） */
  unnamedNode: '未命名节点预设',

  // ── 「保存为节点预设」模态（原 `_Component42.jsx:1745-1773`，逐字）──
  /** 模态标题（原 1749，逐字） */
  saveNodeTitle: '保存为节点预设',
  /**
   * 模态副标题（原 1750-1753）：`已选中 N 个节点` ＋ **有连线时**才追加 `，含 M 条连线`
   * ⚠️ 源是两段 JSX 条件拼接，这里是等价模板（`edges === 0` **不出现**后半句）。
   */
  selectedSummary: (nodes: number, edges: number): string =>
    `已选中 ${nodes} 个节点${edges > 0 ? `，含 ${edges} 条连线` : ''}`,
  /** 名称输入框占位（原 1754，逐字） */
  namePlaceholder: '请输入节点预设名称',
  /** 主按钮（原 1766，逐字）—— ⚠️ 与 `save: '保存预设'`（节点上的按钮）**不同字**，别合并 */
  modalSave: '保存',
  /** 次按钮（原 1769，逐字） */
  modalCancel: '取消',
} as const;

/**
 * 文生图 `gv-meta` 的**频道显示名**（原 `QL`，`shared.js:41004-41008`）
 *
 * ⚠️ 源是**独立的一张表**（只有 3 项）—— 与 `ACCOUNT_TYPE_LABEL`（7 项）、
 *    `GEN_VIDEO_CHANNEL_LABELS`（`doubao → 豆包`）**都不是同一张**：
 *    `QL['lovart']` 是 `undefined` ⇒ 走 `|| '豆包后台'` 兜底（而 `ACCOUNT_TYPE_LABEL` 会给 `'Lovart'`）
 *    ⇒ 逐字保留，不合并。
 */
const GEN_IMAGE_CHANNEL_LABELS: Readonly<Record<string, string>> = {
  doubao: '豆包后台',
  dola: 'Dola',
  api: 'API',
};

/**
 * 「自动匹配」—— 资源库素材名 ↔ 正文（原 `Jh`，`shared.js:24280`）
 *
 * ⚠️ **两个消费者是同一个功能、两个入口**（源就是同一个 `Jh`，判据 C1 的正例）：
 *   · 文本框 `auto-match-btn`（`CL.jsx:243-264,745-750`）—— **只有按钮文案，没有提示**；
 *   · 生成面板 `gp-automatch-btn`（`Z3_1.jsx:630-674,962-964`）—— 另有**三条提示**。
 * ⇒ 共用一份文案（不各写一遍），差异只体现在各自的 `title`。
 */
export const AUTO_MATCH_TEXT = {
  /** 空闲态按钮（两处源均，逐字） */
  idle: '自动匹配',
  /** 命中态按钮（两处源均，逐字） */
  ok: '✓ 已匹配',
  /** 未命中态按钮（两处源均，逐字） */
  none: '无匹配',
  /** 文本框按钮 `title`（原 `CL.jsx:745`，逐字） */
  textNodeTitle:
    '将资源库素材名称与文本匹配（精确 / 字母数字组合自动匹配；部分重叠将列出待确认项），命中后追加 @素材 引用',
  /** 生成面板按钮 `title`（原 `Z3_1.jsx:962`，逐字） */
  panelTitle:
    '自动匹配：把资源库素材名与正文比对（精准 / 「参考图」前缀 / 字母数字组合），命中后追加 @素材 引用',
  /** 资源库为空（原 `Z3_1.jsx:639`，逐字） */
  emptyLibrary: '资源库为空：先添加素材再自动匹配',
  /** 未匹配到（原 `Z3_1.jsx:651`，逐字） */
  noMatch: '未匹配到资源库素材：正文里没有与素材同名的文字',
  /** 完成（原 `Z3_1.jsx:670`：`` `自动匹配完成：新增 ${be} 处素材引用` ``，逐字） */
  done: (count: number) => `自动匹配完成：新增 ${count} 处素材引用`,
  /** 三条提示的时长（原 639 的 `3200` / 651 的 `3500` / 670 的 `3000`） */
  emptyLibraryMs: 3200,
  noMatchMs: 3500,
  doneMs: 3000,
  /** 按钮态复位延时（原 653 / 671 的 `1500`，两处源相同） */
  resetMs: 1500,
} as const;

/**
 * 节点右键菜单（原 `node-ctx-menu`，`_Component42.jsx:1685-1726` + 处理函数 `1093-1160`）
 *
 * ⚠️ **本仓只落 4/6 项** —— 「更换素材」（要素材选择器）与「保存为节点预设」（`addNodePreset`
 *    未移植）**不渲染**（渲染一个点了没反应的按钮 = 假装功能在）。
 */
export const NODE_CTX_TEXT = {
  /** 「自动排列（整理所选节点）」（原 1695，逐字） */
  arrange: '自动排列（整理所选节点）',
  /** 「更换素材」（原 1700，逐字）—— 仅 material 节点显示 */
  replaceMaterial: '更换素材',
  /** 「打开文件所在位置」（原 1711，逐字） */
  reveal: '打开文件所在位置',
  /** 该项的 `title`（原 1710，逐字） */
  revealTitle: '在 Finder 中显示图片文件',
  /** 「复制 Ctrl+C」（原 1714，逐字） */
  copy: '复制 Ctrl+C',
  /** 「保存为节点预设」（原 `_Component42.jsx:1717`，逐字） */
  saveNodePreset: '保存为节点预设',
  /** 「粘贴 Ctrl+V」（原 1724，逐字） */
  paste: '粘贴 Ctrl+V',
} as const;

export const GEN_IMAGE_TEXT = {
  /** `gv-dl` 的 `title`（原 `ZL.jsx:244`，逐字） */
  download: '下载这张图',
  /** `gv-dl` 的 `aria-label`（原 244，逐字） */
  downloadAria: '下载',
  /**
   * 下载文件名（原 114：`` `文生图_${Date.now()}.png` ``，逐字）
   * ⚠️ 与文生视频的 `genVideoDownloadName`（走 `label` + 后缀参数）**不同** —— 源这里**写死** `png`。
   */
  downloadName: (now: number) => `文生图_${now}.png`,
  /** 卡片 `title`（原 `ZL.jsx:210`，逐字） */
  cardTitle: '点击卡片打开文生图面板（填提示词与参数，出图直接展示在这里）',
  /** 节点头部文本（**本工程新增** —— 源里那个 `文生图` 是下载文件名前缀，不是标题） */
  title: '文生图',

  // ── `gv-stage` / `gv-waiting` / `gv-preview-empty`（原 `ZL.jsx:230-243`）────────
  /** 等待浮层 `aria-label`（原 230，逐字） */
  waitingAria: '正在生成',
  /** 等待文案 —— 已有图时（原 237 的 `u` 支，逐字） */
  waitingRegenerate: '正在生成新的一张…',
  /** 等待文案 —— 首次生成时（原 237，逐字） */
  waitingFirst: '正在生成 · 出图后展示在这里',
  /** 空舞台标题（原 241，逐字） */
  stageEmptyTitle: '文生图 · 在下方输入提示词',
  /** 空舞台副标题（原 242，逐字） */
  stageEmptySub: '点击卡片打开生成面板，出图直接展示在这里',
  // ⚠️ `generating: '生成中…'` **不在这里** —— 它与 `GenPanel` 的运行按钮**同一句**（跨两处）
  //   ⇒ 已上移到 `COMMON_TEXT.generating`（`constants/text.ts`），此处再留就是同值两份（M3）。

  // ── 头部：`ig-chip-status` API 任务芯片（原 `ZL.jsx:218-220`）──────────────────
  /** 未完成（原 219：`API {… ? '失败' : '进行中'}` 的**进行中**支，逐字含前缀） */
  apiChipRunning: 'API 进行中',
  /** 失败（同上**失败**支，逐字含前缀） */
  apiChipFailed: 'API 失败',

  // ── 历史版本（`gv-hist-btn` / `gv-hist-pop`，原 `ZL.jsx:221-225,288-314`）──────
  /**
   * 头部按钮（原 224：`` `历史 ${c.length}` ``，逐字）
   * ⚠️ 与 `GEN_VIDEO_TEXT.histBtn`（`YL.jsx:482`）**逐字相同** ⇒ 两域各留一份
   *    （判据 C1 第 2 次出现；第 3 次须收口到 `COMMON_TEXT`）。
   */
  histBtn: (n: number) => `历史 ${n}`,
  /** 按钮 `title`（原 221，逐字 —— ⚠️ 与文生视频只差「图片 / 视频」二字） */
  histBtnTitle: '历史版本：查看 / 切换历次生成的图片',
  /** 弹层标题（原 296：`` `历史版本 · 共 ${c.length} 张` ``，逐字 —— 视频那边是「版」） */
  histTitle: (n: number) => `历史版本 · 共 ${n} 张`,
  /** 条目 `title`（原 299：`` `切换到这张（#${pe + 1}）` ``，逐字） */
  histItemTitle: (n: number) => `切换到这张（#${n}）`,
  /** 缩略图按需宽度（原 302 的 `Xt(V.dataUrl, 120)`）—— 与文生视频同一个 120 */
  histThumbWidth: 120,

  // ── `gv-meta`（原 `ZL.jsx:960-962`）──────────────────────────────────────────
  /** `gv-meta` 的「已连接 N 个输入」（原 961，逐字）—— ⚠️ 与 `GEN_VIDEO_TEXT.metaInputs` **逐字相同**（C1 第 2 次） */
  metaInputs: (n: number) => `已连接 ${n} 个输入`,
  /** meta 各项之间的分隔（原 961 的 ` · `，逐字）—— 同上，两域各留一份 */
  metaSep: ' · ',
  /** 频道显示名表（原 `QL`，`shared.js:41004`） */
  channelLabels: GEN_IMAGE_CHANNEL_LABELS,
  /** 频道查不到时的兜底（原 961 的 `|| '豆包后台'`，逐字） */
  metaChannelFallback: '豆包后台',
  /**
   * 比例兜底（原 961 的 `f = l.aspectRatio || '1:1'`）
   *
   * ⚠️ **2026-10-12 收口**：此前是**源的字面量 `'1:1'`** —— 与「空节点默认比例 4:3」
   *   （用户裁定）**不是一个值** ⇒ 改吃真源 `NODE_DEFAULT_RATIO_LABEL`。
   *   它只是 `data.aspectRatio` 为空时的**显示兜底**（节点上那行 `gv-meta` 与面板的 meta）。
   */
  metaDefaultRatio: NODE_DEFAULT_RATIO_LABEL,
  /** 已出张数（原 962：`` ` · 已出 ${c.length} 张` ``，逐字含前缀分隔） */
  metaOutput: (n: number) => ` · 已出 ${n} 张`,
} as const;

export const VIDEO_NODE_TEXT = {
  /** 名称兜底（原 `BL.jsx:14`） */
  fallbackName: '视频',
  /** 双击改名（原 318，逐字） */
  renameTitle: '双击重命名',
  /** 加载失败（原 400，逐字） */
  loadFailed: '视频加载失败',
  /** 来源 chip（原 330：`来自：{M}`，`title` 原 330 逐字） */
  fromChip: (label: string) => `来自：${label}`,
  fromChipTitle: (label: string) => `来自：${label}（点击定位到源节点）`,
  /** 源节点已不存在（原 119，逐字） */
  sourceMissing: '源节点已不存在',
  /** 配方 chip（原 341-342：有配方显示摘要，没有显示 `查看配方`） */
  recipeChip: (summary: string) => summary,
  recipeChipNone: '查看配方',
  recipeChipTitle: '查看配方',
  /** 没记录配方（原 343，逐字） */
  noRecipeTitle: '该视频没有记录生成配方（多为旧版本产出或手动添加）',
  noRecipeText: '无配方',
  /** 面板（原 406-407 的标题、416-427 的内容） */
  panelTitle: '生成配方',
  panelClose: '✕',
  noPrompt: '（无提示词）',
  /** 规格前缀（原 418-421：`模型 X` / `{n}s` / `{ratio}` …） */
  specModel: (name: string) => `模型 ${name}`,
  /** 面板脚（原 437-442） */
  copyRecipe: '复制配方',
  rerunRecipe: '按配方重跑',
  /** ★ **2026-10-11 已接通**（原 `addTextNodeFromRecipe` 29450）—— 此前它**禁用**并写明原因，
   *  现在队列旁的最后一个「未落地」按钮变成了真的：点它会在该视频节点**正下方**建一个文本框，
   *  把配方里的提示词/模型/时长/比例填进去。 */
  /** 反建出来的文本框的默认名（原 29483 的 `c || '重跑'`） */
  rerunLabel: '重跑',
  /**
   * ★ 截图（原 `BL.jsx:535-537` 的 `.vt-btn.vt-shot`，在**播放条**里、时间文字之后）
   * ⚠️ **2026-10-12 归位**：此前它被放在**节点头部右槽**（源里没有这一颗）⇒ 移进播放条。
   */
  captureGlyph: '📷',
  /** 忙碌时的字形（原 536 的 `re ? '…' : '📷'`，逐字） */
  captureBusyGlyph: '…',
  /** `title`（原 535，逐字） */
  captureTitle: '截取当前画面为图片素材（快捷键 S）',
  /** 出片记录面板标题（原 447，逐字） */
  historyTitle: (n: number) => `出片记录（${n}）`,
  /**
   * ★ **2026-10-11 接通**（原 `BL.jsx:346-354` 的 `vn-hist-chip`）—— 此前本工程**未落地**
   *   （见文件头「⛔ 出片记录」那条）。
   * ⚠️ 源版**只在 `total > 1` 时**渲染它（判据在调用方）；内文是 `×N`（**不是**「出片记录」四个字），
   *    `title` 才是那句话。
   */
  historyChip: (n: number) => `×${n}`,
  historyChipTitle: (n: number) => `出片记录：共 ${n} 次`,
  /** 尝试行（原 457-462 的 `vn-attempt` / `vn-at-*`） */
  attemptAccountFallback: '—',
  /** 状态标签（原 `FL`，`shared.js:40772-40777` —— 逐字；⚠️ 命中不到时**原样回显**状态串） */
  attemptStatus: {
    pending: '进行中',
    success: '成功',
    failed: '失败',
    cancelled: '已取消',
  },
  /**
   * ★ 「拉取结果」（原 `BL.jsx:355-381` 的 `vn-pull-chip`）—— 2026-10-12 接通
   *
   * ⚠️ 失败文案由**生产者**给全（`state/pullResult.ts` 是这几条业务判断的产者，原则 6）；
   *    `fetchWatermarkFreeByVid` 的失败**原样透传**，不在这里兜底造句。
   */
  pull: '可拉取',
  pulling: '拉取中…',
  pullTitle: '该次生成已记录会话/视频 id，可回到豆包拉取结果（不重发、不扣额度）',
  pulled: '已拉取到结果',
  pullNoNode: '节点已不存在',
  pullNotAvailable: '该节点没有可拉取的生成记录',
  pullNeedConversation: '该次生成只记录了会话 id，需回豆包对话页拉取（本工程尚未落地）',
  pullNoAccount: '找不到该次生成所用的账号',
} as const;

/**
 * 「模糊匹配待确认」面板（原 `CL.jsx:834-892` 的 `.fuzzy-*`）
 *
 * ⚠️ 全部**逐字对齐源版**；⚠️ 源版 CSS 未入库、mockup 也**未收录** `.fuzzy-*` ⇒ 样式为推断值
 *    （见 `ui/nodes/FuzzyConfirmPanel.module.css`）—— 并入 `TD-03-17`。
 */
export const FUZZY_TEXT = {
  /** 头部前缀（原 837，逐字，含全角冒号） */
  matchPrefix: '疑似匹配：',
  /** 走「最长公共子串」那条路时的括注（原 838） */
  same: '大致相同',
  /** 走「分词命中」那条路时的括注（原 838 的三元另一支） */
  byKeyword: '关键词命中',
  /** 上一个（原 841 的 `title`，逐字） */
  prevTitle: '定位文本框内上一处疑似匹配文字',
  /** 下一个（原 850 的 `title`，逐字） */
  nextTitle: '定位文本框内下一处疑似匹配文字',
  /** 两个字形（原 845 / 854） */
  prevGlyph: '‹',
  nextGlyph: '›',
  /** 计数器（原 848：`{ut + 1} / {he.length}` —— 数字与斜杠之间有空格） */
  counter: (index: number, total: number) => `${index} / ${total}`,
  /** 卡片 `title`（原 860，逐字） */
  cardTitle: (name: string) => `素材：${name}`,
  /** 无图占位（原 871，逐字） */
  noPreview: '无预览',
  /** 卡片脚（原 879） */
  matchFuzzy: '大致匹配',
  /** 卡片脚（原 879 的另一支） */
  matchKeyword: '关键词命中',
  /** 脚注提示（原 884，逐字） */
  tip: '选择一个素材确认，自动跳到下一处疑似匹配',
  /** 忽略当前**位置**（原 889，逐字） */
  ignore: '忽略此位置',
} as const;

/**
 * 连线（边）的悬停气泡（原 `B3.jsx:129-150` 的 `.edge-actions` / `.edge-act`）
 *
 * ⚠️ 两个按钮都**只有 SVG 图标**（源即如此），文案只出现在 `title` 上 —— 逐字抄源 138/144。
 */
export const EDGE_TEXT = {
  insertNode: '插入节点',
  disconnect: '断开连线',
} as const;

/**
 * 自绘播放器文案（**两个节点共用**）
 *
 * ★ **2026-10-11 收口（判据 C1）**：同一对 `播放`/`暂停`（以及 `▶`/`❚❚` 两个字形）
 *   在源里**出现两次**：文生视频节点 `YL.jsx:502`（`gv-play`）与视频节点 `BL.jsx:471`（`vt-btn`）
 *   —— 逐字相同。此前只有前者有常量（且字形是**内联字面量**）；现在两处都从本表取，
 *   **两份实现 → 一份**（第 2 处消费者出现即收口，正合「三振出局」）。
 */
export const MEDIA_PLAYER_TEXT = {
  /** 播放（原 `YL.jsx:502` / `BL.jsx:471` 的 `'播放'`，逐字） */
  play: '播放',
  /** 暂停（同上） */
  pause: '暂停',
  /** 播放字形（原两处都是内联 `▶`） */
  playGlyph: '▶',
  /** 暂停字形（原两处都是内联 `❚❚`） */
  pauseGlyph: '❚❚',
  /** 时间线 `title`（原 `BL.jsx:474`，逐字） */
  timelineTitle: '点击或拖动选择时间点',
} as const;

/**
 * 发送队列面板（原 `z3.jsx` 288 行 = 队列面板；`O3` 的**状态标签**）
 *
 * ⚠️ 与批量发送面板（`BATCH_SEND_TEXT`）**不是一套**：那个是 `x3` 的节点级五态
 *   （`等待中/发送中/成功/失败/已跳过`），这个消费的是 `sendQueue.items`。
 */
export const SEND_QUEUE_TEXT = {
  /** 面板标题（原 197，逐字） */
  title: '发送队列',
  /** 并发上限的 `title`（原 198：`每账号并发上限 ${n}：同一账号同一时刻只处理一个任务`） */
  concurrencyTitle: (n: number) => `每账号并发上限 ${n}：同一账号同一时刻只处理一个任务`,
  /** 防重复跳过的 toast（原 41922，逐字） */
  skipToast: (n: number) => `跳过 ${n} 个与上次发送内容相同的节点（防重复发送）`,
  /** 暂停 / 恢复（原 202-205 的 `w ? '继续' : '暂停'` 语义） */
  pause: '暂停',
  resume: '继续',
  /** 清掉已结束的项（原 `A3`；按钮文案源版在 `.sq-foot`，本工程给文字） */
  clearDone: '清除已完成',
  /** 状态行：暂停中（**本工程新增**，源版只有图标变色） */
  paused: '已暂停',
  /** 状态行：进行中（源版用 `.sq-statusline` 表达，本工程给文字） */
  running: (done: number, total: number) => `${done}/${total}`,
  /** 每项的取消 / 重试（原 248-258 的两个按钮，源版是图标 + `title`） */
  cancel: '取消',
  cancelTitle: '取消这一条（不打断其它）',
  retry: '重试',
  retryTitle: '重新排到队尾（会自动占用空闲账号）',
  /** 拖动 `title`（原 196，逐字） */
  dragTitle: '拖动可移动面板位置',
  /** 账号未分配（原 233，逐字） */
  accountPending: '待分配',
  /** 第 N 次重试（原 236：`· 第{N}次`） */
  attempt: (n: number) => `· 第${n}次`,
  /** 成片行的标签（原 261，逐字） */
  genLabel: '成片',
  /**
   * ★★ **成片状态四组九态**（原 `B0` 42493-42567 的 `text`/`note`）
   * ⚠️ `cls` 是样式类名（`idle`/`na`/`unknown`/`failed`/`done`/`queued`/`generating`），
   *   也一并放这里 —— 文案与样式成对出现，分开会漂。
   */
  /*
   * ⚠️ **2026-10-11（`TD-16-103`）删除 `gen: {…}` 一整段** —— 它与 `GEN_PROGRESS_TEXT`
   *   （`constants/text.ts`）**逐字重复**（同 13 个键、同 13 句文案，只是键名不同）：
   *   `gen.unknownNote` ≡ `noProgress`、`gen.queuedNote` ≡ `waitingStart`、`gen.idleNote` ≡ `noRecord`。
   *   成片文案的**唯一真源 = `GEN_PROGRESS_TEXT`**（由 `core/rules/genProgress.ts` 消费）。
   *   本段原先的唯一消费者是 `core/rules/sendQueuePanel.ts` 里那份 `deriveGenView` 抄本 —— 同批已删。
   */
  /**
   * 调度泵在"拿不到账号"时写进队列项的等待原因（原 `TS` 42134-42167 的四句）
   * ⚠️ 逐字对齐源版（含「排队等待」与「已排队等待」两种措辞 —— 源版就不一致，照抄）。
   */
  dispatchNotes: {
    /** 固定账号不存在/未登录（原 42134） */
    fixedUnavailable: '所选账号不存在或未登录，排队等待',
    /** 固定账号正忙（原 42143） */
    fixedBusy: '所选账号正在生成中，排队等待空闲',
    /** 分组/类型池里没有可用账号（原 42162 的 `no-account` + 有 scope） */
    scopeNoAccount: '所选分组暂无已登录的可用账号，排队等待',
    /** 全局池里没有可用账号（原 42162 的 `no-account` + 无 scope） */
    poolNoAccount: '账号池暂无已登录账号，排队等待',
    /** 分组/类型池里都在忙（原 42162 的兜底 + 有 scope） */
    scopeAllBusy: '所选分组内账号都在生成中，已排队等待空闲账号',
    /** 全局池都在忙（原 42162 的兜底 + 无 scope） */
    poolAllBusy: '所有账号都在生成中，已排队等待空闲账号',
  },
  /** 发送结果结算时的两句兜底（原 `TS` 42219：`'发送异常'` / `'发送失败'`） */
  settle: {
    exception: '发送异常',
    failed: '发送失败',
    /** 放弃时把分类标签前缀到原因上（原 42249：`` `${label}：${C}` ``，**全角冒号**） */
    labelPrefix: (label: string, reason: string) => `${label}：${reason}`,
    /** 等待重试的原因（原 42271：`` `${label}（将自动重试 ${S}/${n}）` ``，**全角括号**） */
    retryNote: (label: string, attempt: number, maxRetry: number) =>
      `${label}（将自动重试 ${attempt}/${maxRetry}）`,
  },
  /**
   * ⚠️ **面板位置的 localStorage 键不在这里** —— 它是**冻结契约字符串**，
   *   真源是 `stable/contracts/keys.ts` 的 **`LS_SENDQUEUE_POS`**（原 `Pp` 42568）。
   *   我第一版把它写在这儿 ⇒ 被 `原则5/ssot-keys` 拦下（**两处定义迟早漂**）。
   */
} as const;

/**
 * 画廊面板（原 `_Component23.jsx` 605 行 = **单账号**画廊面板）
 *
 * ★ 源版它是**覆盖层模态**：`.login-backdrop` + `.lovart-gallery`，从账号面板打开。
 * ⚠️ 本工程落**最小可用**版：查看 / 单张移除 / 清空 / 从画布收藏 / **大图预览**（2026-10-11）。
 *   ⛔ **仍未落地**（逐条标注，判据 B4 —— 见 `pending*` 两句）：
 *     扫描画布取图 · 从磁盘导入 · 全选/反选 · **添加到画布 (N)**
 *     （最后一条需 `addMaterialsBatch`：居中网格布局 + 远程图落盘外置 + library 去重，见 `GalleryPanel` 文件头）。
 */
export const GALLERY_TEXT = {
  /** 标题（原 417：`🎨 Tapnow 画廊 · {账号名}`，**逐字**） */
  title: (accountName: string) => `🎨 Tapnow 画廊 · ${accountName}`,
  /** 副标题（原 419-421，逐字拼） */
  sub: (selected: number, total: number) =>
    `已选 ${selected} / 共 ${total} 张 · 点「扫描 Tapnow 画布」读取当前打开画布节点里的图片；点缩略图可预览大图`,
  /** 关闭（原 446 的按钮，源版无文字） */
  close: '关闭',
  /** 清空（原 443：`btn sm danger`，源版无文字） */
  clear: '清空',
  clearTitle: '清空该账号的画廊（保留条目本身）',
  /** 空态（原 468-470，逐字） */
  emptyIcon: '🖼️',
  emptyTitle: '画廊为空',
  emptyDesc: '点上面的「扫描 Tapnow 画布」从当前画布取图，或「从磁盘导入」本地图片',
  /** 单张移除 */
  remove: '移除',
  removeTitle: '从画廊里删掉这一张',
  /** 尺寸徽标（原 501：`尺寸较大：{大小} {尺寸}`） */
  bigBadge: (size: string, dims: string) => `尺寸较大：${size} ${dims}`,
  /** 张数（原 417 附近的状态行；本工程给一行计数） */
  count: (n: number) => `共 ${n} 张`,
  /** 扫描按钮文案（原 423 是无文字按钮 + `title`；本工程给文字 —— 它看起来就是个按钮） */
  scan: '扫描 Tapnow 画布',
  /** 张数（原来那个禁用按钮的位置改用它显示） */
  /** 「加入画布选中素材」（原 440 的 `Ie`）—— ★ 2026-10-11 接通（写入方早已就位） */
  addSelected: '加入画布选中素材',
  addSelectedTitle: '把画布上当前选中的素材节点加入此画廊',
  /** 三条提示（原 341/355/357，**逐字**） */
  addSelectedNone: '画布上尚未选中任何素材节点（先在画布框选素材，再回到画廊点本按钮）',
  addSelectedOk: (n: number) => `已从画布加入收藏 ${n} 张`,
  addSelectedDup: '这些素材已在画廊中（重复跳过）',
  /** ⛔ 未落地三条（按钮禁用时的 `title`，如实说明原因） */
  pendingScan:
    '「扫描 Tapnow 画布」尚未实现。可先在画布上框选素材，再点「加入选中素材」',
  pendingImport: '「从磁盘导入」尚未实现。可把图片直接拖入资源库',

  // ── 大图预览 lightbox（原 `_Component23.jsx:550-602` 的 `.tg-lightbox-*`）──
  /** 缩略图上的预览按钮（原 504-509，`title` 逐字） */
  preview: '⤢',
  previewTitle: '预览大图（也可双击缩略图）',
  /** 上一张 / 下一张（原 569 / 575，`title` 逐字） */
  prev: '上一张（←）',
  next: '下一张（→）',
  /** 元信息一行（原 559-560，**逐字拼接**：`尺寸 · 大小 · 时间 · i/n`） */
  lightboxMeta: (dims: string, size: string, at: string, i: number, n: number) =>
    `${dims} · ${size} · ${at} · ${i}/${n}`,
  /** 打开原始图片（原 590-594，逐字） */
  openOriginal: '打开原始图片',
  openOriginalTitle: (url: string) => `在浏览器打开：${url}`,
  openOriginalNone: '这条没有记录来源地址（可能是从磁盘导入的）',
  openOriginalOk: '已在浏览器打开原始图片',
  openOriginalFailed: (msg: string) => `打开失败：${msg}`,
  /** 从画廊移除（原 595-599） */
  removeFromGallery: '从画廊移除',
  /** lightbox 的勾选（原 583 的三目） */
  checkImage: '勾选此图',
  uncheckImage: '取消勾选',

  // ── 画廊选择 / 添加到画布（原 `_Component23.jsx:427-435` + 537-548）──
  /** 全选 / 反选 / 清空选择（原 427-435，`title` 逐字） */
  selectAll: '全选',
  invert: '反选',
  clearSelection: '清空选择',
  /** 勾选复选框的无障碍名（源版无文字标签） */
  checkTitle: '勾选 / 取消勾选',
  /** 底部提示（原 539，逐字） */
  footHint: '添加后会以「居中网格」展开在画布，原始分辨率保留不变；显示尺寸自动缩到 ≤ 260px 长边。',
  /** 底部「取消」（原 542-544） */
  cancel: '取消',
  /** 「添加到画布 (N)」（原 545-547，逐字） */
  addToCanvas: (n: number) => `添加到画布 (${n})`,
  addToCanvasNone: '先在画廊中勾选要添加的图片',
  addToCanvasTitle: (n: number) => `添加 ${n} 张到画布`,
  /** 大图确认（原 367-370，逐字；含**两处换行**） */
  bigConfirm: (name: string, meta: string) =>
    `「${name}」尺寸较大（${meta}）。\n添加到画布会保持原始分辨率与画质，仅显示尺寸自动缩放。\n\n继续添加该图吗？（点击「取消」将中止本次添加）`,
  /** 添加结果（原 308，逐字） */
  addOk: (n: number) => `已添加 ${n} 张到画布（无损，居中网格布局）`,
  /** 加载更多（原 530-533，逐字） */
  loadMore: (shown: number, total: number) => `加载更多（已显示 ${shown} / ${total}）`,
} as const;

/**
 * 指纹撞车体检面板（原 `DP.jsx` = 体检报告 + 历史列表的**视图半**）
 *
 * ★ 语义（源 `DP` 的头几行）：报告**是实时算的**（`useMemo(() => zk(accounts))`），
 *   **不进 store**；只有 `history` 是持久化的（由 `OP.jsx` 调 `recordScan` 写入）。
 * ⚠️ 逐字对齐源（含 `🔴`/`🟡` emoji、全角括号、「⇄」、`、` 分隔）。
 */
export const FP_SCAN_TEXT = {
  title: '跨账号指纹关联扫描',
  /** 报告头两行（原 24-25，逐字） */
  scanned: (withFp: number, noFp: number) => `扫描账号: ${withFp} 个（${noFp} 个无指纹记录已跳过）`,
  pairs: (total: number) => `比对配对: ${total} 对`,
  /** 分级计数（原 26-27，逐字） */
  critical: (n: number) => `🔴 完全关联(全维重合): ${n} 对`,
  warn: (n: number) => `🟡 高度相似(≥70%重合): ${n} 对`,
  /** 无配对（原 16，逐字） */
  none: '未检测到任何指纹重合配对 ✓',
  /** 一条配对（原 17，逐字：`⇄` + `重合 n/N 维 [a、b]`） */
  pairLine: (level: string, a: string, b: string, matched: number, total: number, dims: string) =>
    `${level === 'critical' ? '🔴' : '🟡'} ${a} ⇄ ${b}：重合 ${matched}/${total} 维 [${dims}]`,
  /** 维度离散度一行（原 20，逐字；`distinct <= 1` 时后缀「（无隔离力）」） */
  dimLine: (label: string, distinct: number) =>
    `  ${label}: ${distinct} 个不同值${distinct <= 1 ? ' （无隔离力）' : ''}`,
  /** 按钮（原 `DP.jsx:106` 的「清空」） */
  copyReport: '复制报告',
  clearHistory: '清空历史',
  close: '关闭',
  /** 历史区标题（**本工程新增**：源版历史列表在面板内，标题由 `.title` 承担） */
  historyTitle: (n: number) => `历史（${n}）`,
  /** 历史一条的摘要（原 118，逐字：`· N 账号 / M 对`） */
  historyLine: (total: number, totalPairs: number) => `· ${total} 账号 / ${totalPairs} 对`,
  /**
   * ★ **工具条上的「实时隔离体检」状态按钮**（原 `OP.jsx:854-858`，逐字）
   *
   * ⚠️ 它不是新面板 —— 与工具条的「关联扫描」打开**同一个** `FingerprintScanPanel`；
   *    区别只是这个入口**自带状态摘要**（🔴 / 🟡 / ✅ 三态）。
   */
  healthCrit: (n: number) => `🔴 隔离风险：${n} 对完全关联`,
  healthWarn: (n: number) => `🟡 隔离提示：${n} 对高度相似`,
  healthOk: '✅ 隔离体检：全部账号相互隔离',
  healthTitle: '实时隔离体检：点击查看跨账号指纹关联扫描详情',
} as const;

/**
 * 「按关键词拆分」弹窗 + 文本节点上的拆分按钮
 * （原 `_Component42.jsx:1774-1813` 的 `.modal-*` + `CL.jsx:751-756` 的 `.split-md-btn`）
 *
 * ⚠️ 弹窗说明那段源版带 `<b>` 强调（三处）；本工程按**纯文本**渲染（同一句，只是不加粗）。
 * ⚠️ **失败文案不在这里** —— 真源是 `core/rules/splitText.ts` 的 `SPLIT_FAIL_REASON_LABEL`
 *    （带类型的 label；且 `constants` 是 L0，不能 import `core`）。
 *    ⚠️ **2026-10-11 更正（`TD-02-12`）**：原句把 `COLLISION_LEVEL_LABEL` 当同形例子 ——
 *    但**那个文件 0 生产消费** ⇒ 已删该引用（`SPLIT_FAIL_REASON_LABEL` 本身就是活的同形实例）。
 */
export const SPLIT_TEXT = {
  title: '按关键词拆分',
  /** 弹窗说明（原 1782-1786，逐字；源版的三处 `<b>` 未保留） */
  sub: '输入关键词（多个用逗号 / 空格 / 换行分隔）。每个出现关键词的行将作为新片段的起点， 系统按原文顺序把文本切成多个文本框，前置内容不丢失、顺序保持不变。 关键词大小写不敏感；建议用能唯一标识每个片段起始的词（如「场景」「分镜」「提示词组」），避免使用正文中频繁出现的词以免过度切分。',
  /** 文本域占位（原 1788，逐字） */
  placeholder: '例如：场景, 分镜, 提示词组',
  cancel: '取消',
  /** 「用默认关键词」（原 1803-1806） */
  useDefault: '用默认关键词',
  useDefaultTitle: '未输入关键词时，使用默认关键词（提示词组/分镜/镜头/场景/Prompt）拆分',
  /** 「按关键词拆分」（原 1808-1810） */
  submit: '按关键词拆分',

  // ── 「拆分并套用节点预设」弹窗（原 `_Component42.jsx:1816-1863`，逐字）──
  /** 标题（原 1822，逐字） */
  presetTitle: '拆分并套用节点预设',
  /** 说明（原 1824，逐字） */
  presetSub: '选中一个预设：将用拆分结果替换该预设的第一个节点，其余节点与连线保持不变',
  /** 说明里的关键词尾注（原 1825：`（当前关键词：k1 / k2）`） */
  presetKeywords: (kws: readonly string[]): string => `（当前关键词：${kws.join(' / ')}）`,
  /** 列表每项的第二行（原 1841：`N 节点 · M 连线`） */
  presetMeta: (nodes: number, edges: number): string => `${nodes} 节点 · ${edges} 连线`,
  /** 底部「直接拆分（不使用预设）」（原 1850，逐字） */
  presetDirect: '直接拆分（不使用预设）',
  /** 该项的第二行（原 1852 的三目，逐字） */
  presetDirectMeta: (hasKeywords: boolean): string =>
    hasKeywords ? '按自定义关键词拆成多个文本框' : '按关键词+数字拆成多个文本框',
  /** 失败原因：找不到预设（本工程 toast 用；源只写 `reason` 不改文案） */
  presetMissing: '没有找到这个节点预设',
  /** 失败原因：预设是空的 */
  presetEmpty: '这个节点预设是空的',
  /** 文本节点上的按钮（原 `CL.jsx:751` 的按钮文字；`title` 逐字） */
  button: '拆分',
  buttonTitle:
    '按自定义关键词拆分：弹窗输入关键词，每个出现关键词的行作为新片段起点，按原文顺序生成文本框，内容不丢失',
  /** 成功（本工程用 toast 报告 —— 源版是按钮上的瞬时态，且那档 `✓ 已拆分` 不可达） */
  done: (n: number) => `已拆分为 ${n} 个文本框`,
} as const;

/**
 * 画布选中工具条（原 `_Component42.jsx:1490-1562` 的 `.sel-toolbar`）
 *
 * ★ **2026-10-11 起有了真实消费者**：`ui/canvas/SelectionToolbar.tsx` 用它渲染
 *   已选计数 / 打组 / 整齐排列（下拉）/ 取消组 —— 此前它**定义但零消费者**（判据 B5）。
 * ⚠️ 与 `GROUP_NODE_TEXT` 的分工：本组是**工具条**文案；「取消组」工具条那句是
 *   「释放**组内**节点」，而组节点自身那句是「释放**内部**节点」（`GROUP_NODE_TEXT.ungroupTitle`）——
 *   源版两句不同，**不合并**。
 */
export const SELECT_TOOLBAR_TEXT = {
  /** 计数（原 1491：`已选 {U.length}` —— 含组节点） */
  selected: (n: number) => `已选 ${n}`,
  /** 打组按钮文案（原 1495；⚠️ 源版就是「打组」，此前误写成「成组」，本轮改回） */
  group: '打组',
  /** 打组按钮 `title`（原 1492 三目的**可用**态） */
  groupTitle: '把所选节点归入一个组（类文件夹）',
  /** 打组按钮 `title`（原 1492 三目的**禁用**态） */
  groupHint: '至少选中 2 个非组节点才能打组',
  /** 整齐排列按钮（原 1504） */
  arrange: '整齐排列',
  /** 整齐排列 `title`（原 1498 三目的**可用**态） */
  arrangeTitle: '整齐排列所选节点：对齐 / 等间距 / 智能网格',
  /** 整齐排列 `title`（原 1498 三目的**禁用**态） */
  arrangeDisabled: '至少选中 2 个非组节点才能整齐排列',
  /** 取消组（原 1560） */
  ungroup: '取消组',
  /** 取消组 `title`（原 1558 逐字） */
  ungroupHint: '取消组：释放组内节点，仅删除组容器',
  /** 菜单首项（原 1510） */
  smartArrange: '智能整齐排列（网格）',
  /** 菜单分组头（原 1513 / 1534） */
  headH: '水平',
  headV: '垂直',
  /** 菜单项（原 1517-1553，逐字）—— 键与 `core/rules/arrange.ts` 的 `ArrangeMode` 对应 */
  mode: {
    left: '左对齐',
    hcenter: '水平居中',
    right: '右对齐',
    hdist: '水平等间距',
    top: '顶对齐',
    vcenter: '垂直居中',
    bottom: '底对齐',
    vdist: '垂直等间距',
  } as Readonly<Record<string, string>>,
} as const;

/**
 * 账号导入 / 导出（原 `OP.jsx:829-843` 的 `.account-tool-row` + `PP.jsx` 的导出弹窗）
 *
 * ⚠️ 逐字对齐源版（含 `导出选中 (N)` 的**半角空格**与括号）。
 * ⚠️ **结果 / 失败文案**的真源在 `ACCOUNT_TRANSFER_TEXT`（`text.ts`）—— 本组只放**控件标签**。
 */
export const EXPORT_TEXT = {
  /** 工具条：导入按钮（原 831 文案；`title` 原 830 逐字） */
  importBtn: '导入',
  importTitle: '从备份文件导入豆包账号（含登录状态）',
  /** 工具条：导出按钮（原 838 文案；`title` 原 837 逐字） */
  exportBtn: '导出',
  exportTitle: '导出已登录账号（含登录凭证）',
  /** 导出弹窗（原 `PP.jsx`） */
  title: '导出账号',
  selectAll: '全选',
  deselectAll: '取消全选',
  exporting: '导出中…',
  exportSelected: (n: number) => `导出选中 (${n})`,
  empty: '暂无已登录账号',
} as const;

/**
 * Lovart 出口代理池面板（原 `LP.jsx`，2,648 B / 2 按钮 / 7 文案）
 *
 * ⚠️ 逐字对齐源版（含 `✓ 已保存 N 个出口…` 与 ` —— ` / 全角引号）。
 * ★ **2026-10-11 从 `text.ts` 迁来**（同一分片先例）：`text.ts` 贴 `max-lines`，且本组此前
 *   **零消费者** —— 本轮 `ui/panels/ProxyPoolPanel.tsx` 成为其唯一消费者。
 */
export const PROXY_TEXT = {
  /** 标题（原 `LP.jsx:33`，逐字） */
  title: 'Lovart 出口代理池',
  /** 说明**前半**（原 42-43 的 `<code>` 段） */
  hint: '每行一个代理（支持 http://host:port / socks5://host:port / host:port）',
  /** 说明**后半**（原 43-47，逐字） */
  hintRest:
    '，留空则全部走直连。 保存后，新增 Lovart 账号会自动按序循环分配不同出口 IP，已登录账号也会立即重新分配 —— 对应 Firefox 容器 + Mozilla VPN「每个容器独立 IP」的效果，站点无法用「同 IP 多账号」判定关联。',
  /** 文本域占位（原 50-52 三行，逐字） */
  placeholder: 'http://127.0.0.1:7890\nsocks5://127.0.0.1:1080\nhttp://user:pass@proxy.example.com:8080',
  /** 保存按钮（原 55，逐字） */
  save: '保存并自动分配',
  /** 保存结果（原 28，逐字） */
  saved: (n: number) => `✓ 已保存 ${n} 个出口，Lovart 账号已自动重新分配`,
  /** 清空结果（原 28，逐字） */
  cleared: '✓ 已清空代理池，全部 Lovart 账号恢复直连',
  /** 分配区标题（原 60，逐字） */
  assignment: '当前 Lovart 账号出口分配',
  /** 无 Lovart 账号（原 61，逐字） */
  noLovart: '暂无 Lovart 账号',
  /** 直连（原 67 的 `h || '直连'`） */
  direct: '直连',
  /** 工具条按钮（原 `OP.jsx:848` 文案；`title` 原 847 逐字） */
  trigger: '🌐 出口代理',
  triggerTitle:
    '配置 Lovart 出口代理池：每个 Lovart 账号自动分配一个独立出口 IP（对应 Firefox 容器 + Mozilla VPN 的「每容器独立 IP」），仅需在此配置一次，无需每次登录手动设置',
} as const;

/**
 * 分组管理（原 `OP.jsx:862-922` 的分组工具条 + `RP.jsx` 的分组区段）
 *
 * ⚠️ 自启动两条 `title` **逐字**取自 `RP.jsx:204`（含 `—` 与全角括号）。
 * ⚠️ 与源的差异（留痕，见 `GroupManagerModal` 文件头）：源版分组**内联在账号列表**里
 *   （`RP.jsx` 带虚拟滚动），本工程做成**独立弹窗**；移组用原生 `<select>`（`docs/17` §8 未收口的表单层）。
 */
export const GROUP_MANAGER_TEXT = {
  /** 工具条按钮 */
  trigger: '分组',
  triggerTitle: '管理账号分组（新建 / 重命名 / 颜色 / 自启动 / 移组）',
  title: '分组管理',
  close: '关闭',
  create: '新建分组',
  /** 原 `OP.jsx:864` 的 placeholder（逐字） */
  namePlaceholder: '输入分组名称',
  noGroups: '暂无分组，先新建一个',
  renameTitle: '双击重命名',
  colorTitle: '设置分组颜色',
  pickColor: '选择该颜色',
  /** 原 `RP.jsx:235`，逐字 */
  noColor: '无颜色',
  deleteTitle: '删除分组',
  deleteConfirm: (name: string) => `删除分组「${name}」？组内账号会回到「未分组」。`,
  /** 自启动开关的两条 `title`（原 `RP.jsx:204`，逐字） */
  autoOnTitle: '自启动：全开（组内账号在软件启动时自动加载）— 点击全部关闭',
  autoOffTitle: '自启动：非全开 — 点击把组内全部账号设为开启',
  autoLabel: '自启动',
  /** 移组区（原 `OP.jsx:899-901` 的「未分组」分隔） */
  assignTitle: '账号分组',
  ungrouped: '未分组',
  noAccounts: '暂无账号',
} as const;

/**
 * 指纹诊断 / 重新生成指纹（原 `OP.jsx:751-765` 的账号行两个图标按钮 + 112 的 toast 前缀）
 *
 * ⚠️ **只放自由文案**：7 段摘要的**段标签**与 4 个**伪装状态**是带类型的真源，
 *    住在 `core/rules/fingerprintDiagnosis.ts`（与 `core/rules/splitText.ts` 的 `SPLIT_FAIL_REASON_LABEL`
 *    同一形态/理由 —— ★ **2026-10-11 更正（`TD-02-12`）**：原引 `COLLISION_LEVEL_LABEL`，
 *    但其所在文件 **0 生产消费** ⇒ 改引活的实例）。
 * ⚠️ 两条 `title` 逐字对源（含全角括号与「」）。
 * ⚠️ `diagTitle` 的按钮**只在 Windows 宿主显示**（源 `_P`，`shared.js:34202-34210`）——
 *    见 `AccountPanel` 的 `canDiagnose`。
 */
export const FP_DIAG_TEXT = {
  /** 🔍 按钮 `title`（原 751，逐字） */
  diagTitle:
    '指纹诊断：查看该账号页面实际生效的指纹身份与真实出口网络（排查「网络环境较差」风控误判用）',
  /** 🔍 按钮标签（原 755 的按钮文本） */
  diagLabel: '🔍',
  /** ↻ 按钮 `title`（原 757，逐字） */
  regenTitle: '重新生成该账号浏览器指纹（生成后后台以全新身份出现）',
  /** ↻ 按钮标签（原 764） */
  regenLabel: '↻',
  /** ↻ 的确认框（原 759-760，逐字；含**换行**） */
  regenConfirm: (name: string) =>
    `确认为「${name}」重新生成浏览器指纹？\n生成后该账号将以全新虚拟身份出现，原指纹失效。`,
  /** toast 前缀（原 112：`指纹诊断「${W.name}」：`） */
  prefix: (name: string) => `指纹诊断「${name}」：`,
  /** 段分隔（原 112 的 `$t.join(' · ')`） */
  separator: ' · ',
} as const;

/**
 * 图片编辑器（原 `G3.jsx` 1087 行）—— ★ **2026-10-12 落（`TD-09-4`）**
 *
 * ⚠️ 遮脸效果（`Fu`）与裁剪比例档（`ef`）的**标签/提示**不在此重复：
 *   效果 → `constants/facemask.ts` 的 `FACE_MASK_EFFECT_LABEL`；比例 → `core/rules/imageCrop.ts`
 *   的 `CROP_RATIO_PRESETS`（判据 C1：真源各一处）。
 * ⚠️ 逐字对源；带参的用函数（`${…}`）。
 */
export const IMAGE_EDITOR_TEXT = {
  /** 面板标题（原 864） */
  title: '图片编辑',
  /** 标题右侧的标签后缀（原 864 的 ` · {label}`） */
  titleSub: (label: string) => ` · ${label}`,
  /** tab「一键遮脸」（原 870） */
  tabMask: '一键遮脸',
  /** tab「裁剪」（原 875） */
  tabCrop: '裁剪',
  /** 关闭按钮 `title`（原 884） */
  close: '关闭',
  /** 遮脸效果分组 label（原 891） */
  effectLabel: '遮脸效果',
  /** 笔刷分组 label（原 904） */
  brushLabel: '笔刷',
  /** 笔刷大小 `title`（原 907：`笔刷大小 ${C}px`） */
  brushTitle: (size: number) => `笔刷大小 ${size}px`,
  /** 透明度分组 label（原 911） */
  opacityLabel: '透明',
  /** 不透明度 `title`（原 914：`不透明度 ${pct}%`） */
  opacityTitle: (pct: number) => `不透明度 ${pct}%`,
  /** 「显示脸框」勾选（原 921） */
  showBoxes: '显示脸框',
  /** 「识别脸框」按钮（原 925） */
  detectFaces: '识别脸框',
  /** 识别中（原 926） */
  detecting: '识别中…',
  /** 「一键遮脸」按钮（原 929） */
  applyAll: '一键遮脸',
  /** 「清空框」按钮（原 935） */
  clearBoxes: '清空框',
  /** 清空后的提示（原 934） */
  clearedBoxes: '已清空脸框',
  /** 脸框计数（原 938：`${n} 个脸框`） */
  boxCount: (n: number) => `${n} 个脸框`,
  /** 「撤销」按钮（原 941） */
  undo: '撤销',
  /** 「整图遮脸」按钮（原 944 文本） */
  applyWhole: '整图遮脸',
  /** 「整图遮脸」`title`（原 944） */
  applyWholeTitle: '不依赖脸框，直接对整张图应用效果',
  /** 比例分组 label（原 949） */
  ratioLabel: '比例',
  /** 「重置框」按钮（原 963） */
  resetBox: '重置框',
  /** 「应用裁剪」按钮（原 967） */
  applyCrop: '应用裁剪',
  /** 载入中（原 975） */
  loading: '正在载入图片…',
  /** 「适应」按钮（原 1065） */
  fit: '适应',
  /** 「取消」按钮（原 1076） */
  cancel: '取消',
  /** 「复制」按钮（原 1079） */
  copy: '复制',
  /** 「保存并替换」按钮（原 1082） */
  save: '保存并替换',

  // ── 提示 / 错误（逐字）──
  /** 图片尺寸异常（原 63） */
  badSize: '图片尺寸异常，无法编辑',
  /** 图片加载失败（原 97） */
  loadFailed: '图片加载失败（引用可能已失效）',
  /** 识别中提示（原 342） */
  detectingHint: '正在识别人脸…',
  /** 未识别到人脸（原 349 的回落） */
  noFaces: '未识别到人脸，可用效果笔刷手动涂抹遮脸',
  /** GPU/WebGL 不可用（原 349） */
  gpuUnavailable: '人脸识别失败：当前环境 GPU/WebGL 不可用，请改用笔刷手动涂抹遮脸',
  /** 人脸识别失败（原 349 的 `` `人脸识别失败：${Y || '检测器异常'}` ``） */
  detectFail: (msg: string) => `人脸识别失败：${msg || '检测器异常'}`,
  /** 识别到 N 个脸框（原 362） */
  detectedBoxes: (n: number) => `识别到 ${n} 个人脸框，可拖动调整后点「一键遮脸」`,
  /** 请先识别脸框（原 376） */
  needBoxes: '请先「识别脸框」或手动添加脸框',
  /** 已对 N 个脸框遮脸（原 397） */
  maskedBoxes: (n: number) => `已对 ${n} 个脸框遮脸`,
  /** 已整图遮脸（原 407） */
  maskedWhole: '已对整张图应用遮脸效果',
  /** 已裁剪（原 662：`已裁剪为 ${w} × ${h}`） */
  cropped: (w: number, h: number) => `已裁剪为 ${w} × ${h}`,
  /** 保存失败（原 819） */
  saveFailed: (msg: string) => `保存失败：${msg}（画布可能被跨源图片污染）`,
  /** 导出失败（原 832） */
  exportFailed: '导出失败',
  /** 已复制到剪贴板（原 837） */
  copied: '已复制到剪贴板',
  /** 复制失败（原 839） */
  copyFailed: (msg: string) => `复制失败：${msg}`,

  // ── 底部 hint（原 846 / 848）──
  /** 遮脸模式的 hint（原 846） */
  hintMask: '滚轮缩放，空格/右键拖拽，可多次涂抹',
  /** 裁剪模式的 hint（原 848） */
  hintCrop: '滚轮缩放，空格/右键拖拽，拖动裁剪框调整范围',
} as const;

/**
 * 无水印资源面板（原 `SD.jsx` 160 行）—— ★ **2026-10-12 落（`docs/14` §10 的 ⛔ 阻塞）**
 *
 * ⚠️ 逐字对源；`type`（图/视频）在 `VideoShare` 里**没有**字段 —— 源 `SD` 的「图」来自
 *   `onDolaMedia`（后端推送，未落），本仓**只展示视频**（`videoShares`），如实标注。
 */
export const WATERMARK_PANEL_TEXT = {
  /** 面板标题（原 63） */
  title: '无水印资源',
  /** 计数（原 64-66：`图 N · 视频 N`；本仓只有视频 ⇒ 简化） */
  count: (n: number) => `视频 ${n}`,
  /** 空态（原 105-107） */
  empty: '暂无。在 dola / 豆包 对话中生成或查看内容后，本面板会自动捕获无水印图片与视频。',
  /** 类型标签「视频」（原 114） */
  typeVideo: '视频',
  /** 「原链接」（原 123） */
  openLink: '原链接',
  /** 「下载」（原 154） */
  download: '下载',
  /** 下载中（原 132） */
  downloading: '下载中…',
  /** 「移除」—— 本仓新增（`removeVideoShare`；源无单条移除，只有「清空」） */
  remove: '移除',
  /** 清空（原 87） */
  clear: '清空',
  /** 关闭（原 90） */
  close: '关闭',
} as const;
