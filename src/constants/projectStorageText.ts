/**
 * 项目**保存路径**文案（原 `_Component42.jsx` 顶栏存储区 `1583-1602`）
 *
 * ★ **2026-10-11 从 `constants/text.ts` 拆出**：`text.ts` 的**代码行**越过了 eslint `max-lines`(400)〔⚠️ **该规则已于 2026-10-11 关闭**〕
 *   （本轮接「设置保存路径 / 打开目录 / 占用统计」时）。这一族（项目保存路径）彼此内聚 ⇒ 独立成文件
 *   —— 与 `newImagesText.ts` 从 `sendPanelText.ts` 拆出是**同一先例**。
 * ⚠️ **公开入口不变**：`constants/text.ts` 转发 `PROJECT_STORAGE_TEXT`，消费方仍从 `@/constants/text` 取。
 * ⚠️ **本文件刻意不 import `text.ts`**（否则与被转发语句成环）⇒ `PROJECT_TEXT.unknownReason` 仍留在 `text.ts`。
 * ⚠️ 全部**逐字对齐源版**（含全角标点）；用户可见字符串按原则 5 归 SSOT。
 */

/** 顶栏「项目保存路径」区 */
export const PROJECT_STORAGE_TEXT = {
  /** 无路径时的按钮 `title`（原 1585，逐字） */
  storageHint: '设置当前项目保存路径；工程、数据、操作记录、缓存、图片和视频会分类保存',
  /** 无路径时的按钮文案（原 1595，逐字） */
  setStoragePath: '设置保存路径',
  /** 「打开项目保存目录」按钮的 `title`/`aria-label`（原 1600，逐字） */
  openStorageDir: '打开项目保存目录',
  /** 有路径但占用未出、且**正在统计**（原 1595 的 `统计占用…`） */
  counting: '统计占用…',
  /** 占用统计中的 tooltip 行（原 1588，逐字） */
  storageBusy: '占用空间：统计中…',
  /** 占用取不到时的 tooltip 行（原 1588 的 `占用空间：—`，逐字） */
  storageUsageDashLine: '占用空间：—',
  /** 选择路径进行中（原 1595 的 `正在选择…`） */
  storagePicking: '正在选择…',
  /** 有路径但占用未出且**不在**统计（原 1595 的 `占用 —`） */
  storageUsageDash: '占用 —',
  /** 占用行（原 1587 的三目）—— `size` 由 `core/rules/storageSize.formatStorageSize` 给 */
  storageUsageLine: (size: string, partial: boolean, files: number) =>
    `占用空间：${size}${partial ? '（仍在统计）' : ''}（${files} 个文件）`,
  /** 有路径时的按钮 `title`（原 1588-1590 的三行，逐字） */
  storageTooltip: (path: string, usageLine: string) =>
    `当前项目保存路径：${path}\n${usageLine}\n点击可更改；工程、数据、操作记录、缓存、图片和视频会分类保存`,
  /**
   * 保存路径不可用（原 `openProject` 29904）—— `：` 后接**原始错误原文**
   * ⚠️ 原版是 `'项目保存路径不可用，已暂时回退到应用默认存储：' + (f.error || '')`
   *    ⇒ 无原因时**不带冒号**，故做成函数（原则 6：不覆盖原始 message，只拼接）。
   */
  storageFallback: (reason?: string) =>
    `项目保存路径不可用，已暂时回退到应用默认存储${reason ? `：${reason}` : ''}`,
  /** 设置成功 toast（原 324；`migrated` 为空串时**不带那半句**） */
  storageSetToast: (migrated: string) => `项目保存路径已设置${migrated}`,
  /** 迁移归档半句（原 323，逐字） */
  storageMigrated: (images: number, videos: number) => `，已归档 ${images} 张图片、${videos} 个视频`,
  /** 设置失败（原 318/326；`：` 后接**原始错误原文**） */
  storageSetFailed: (reason: string) => `保存路径设置失败：${reason}`,
  /** 打开目录失败（原 341；同法接原文） */
  storageRevealFailed: (reason: string) => `无法打开项目目录：${reason}`,
} as const;
