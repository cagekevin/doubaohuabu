/**
 * 「API 服务」面板的 UI 文案（★ SSOT 的**分片**，由 `constants/text.ts` 转发导出）
 *
 * ★ **2026-10-11 拆出来**：`text.ts` 撞上 `eslint` 的 `max-lines`（432 > 400）——〔⚠️ **该规则已于 2026-10-11 关闭**〕
 *   按**同一先例**分片（`sendPanelText.ts` / `newImagesText.ts` 都是这么来的）：
 *   定义住在这里，`constants/text.ts` 转发导出 ⇒ 调用方 `@/constants/text` **零改动**。
 *
 * ⚠️ 铁律的**本意**是「面向用户的字符串不得散落在 store/core/ui」—— 本文件仍在 `constants/`，符合本意。
 *
 * ⚠️ 逐字对齐源版（`_Component46.jsx`，含全角括号 / ` · ` 分隔符 / `…`）。
 */

export const API_SETTINGS_TEXT = {
  title: 'API 服务',
  sub: '对接第三方图像 / 视频生成服务；密钥经系统安全存储加密，明文不落盘、不显示',
  closeTitle: '关闭（Esc）',
  channelSection: '通道配置',
  imageChannel: '图片通道',
  videoChannel: '视频通道',
  fallbackChannel: '兜底服务商',
  concurrency: '队列并发数',
  /** 三个下拉的「不选」档 */
  autoOption: '自动（首个可用）',
  noFallback: '不兜底（主服务商失败即失败）',
  /** 未启用 / 无密钥的 provider 在下拉里的后缀 */
  unavailableOption: '（未启用/无密钥）',
  /**
   * 「今日额度」拆成两段：源版把数字包在 `<b>` 里（`今日额度：图片 <b>N</b> · 视频 <b>M</b>`），
   * ⇒ 面板按「文案段 + `<b>数字</b>`」拼，**文案仍只有这一份**。
   */
  usageLabel: '今日额度：图片',
  usageMid: '· 视频',
  loadingProviders: '正在加载服务商列表…（主进程未就绪时为空）',
  baseUrl: '接口地址',
  baseUrlPlaceholder: 'https://…',
  apiKey: 'API 密钥',
  keyPlaceholderNew: '粘贴服务商控制台生成的 API Key',
  keyPlaceholderReplace: '输入新密钥以更换',
  secret: 'Secret Key',
  secretPlaceholder: '（可选）部分服务商需要的二次密钥',
  secretSaved: '已保存',
  save: '保存',
  test: '测试连接',
  testing: '测试中…',
  enableTitle: '停用后生成面板不再显示该服务商',
  testTitle: '先保存草稿，再向服务商发一次鉴权探测请求',
  /** 能力标签（源把 `capabilities` 里的 `video`/`image` 映射成中文） */
  capVideo: '视频',
  capImage: '图片',
  /** 入口按钮（原 `_Component48.jsx:156` 的 `.side-api-btn`） */
  entryLabel: 'API 服务',
  entryTitle: '对接第三方图像 / 视频生成服务（API 密钥与参数）',
  /** `` `「${name}」配置已保存${note}` ``（`note` 形如 `，密钥已保存`） */
  saved: (name: string, note: string) => `「${name}」配置已保存${note}`,
  /** `` `保存失败：${message}` `` */
  saveFailed: (message: string) => `保存失败：${message}`,
  keySaved: '，密钥已保存',
  keySaveFailed: (message: string) => `，密钥保存失败：${message}`,
  /** ⚠️ 与上面的「已保存」**不是同一句**（那句是卡片里的常驻提示，这句是保存提示的后缀）⇒ 不同键名 */
  secretSavedNote: '，Secret 已保存',
  secretSaveFailed: (message: string) => `，Secret 保存失败：${message}`,
} as const;
