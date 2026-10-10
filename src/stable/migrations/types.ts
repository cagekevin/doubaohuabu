/**
 * 数据归一的类型契约
 *
 * ⚠️ 原 `MigrationContext` / `MigrationInput` / `MigrationOutput` 已删（2026-10-10）——
 *    它们服务的是**启动迁移**，而 5 条迁移经真实样本实测全部空转 ⇒ 已删（铁律 2）。
 *    现在只剩「一次归一」的入参与出参。
 */

/** 归一可用的副作用（由 `bootstrap/container` 注入） */
export interface NormalizeContext {
  /**
   * `dataUrl` → `img://` 引用（**同步**，来自 `MediaPort.saveImageSync`）
   *
   * ⚠️ 返 `Result` 而非 `string`（TD-04-2 同款地基问题）：落盘**会失败**
   *    （宿主缺失 / 磁盘写失败），契约必须说出来 —— 否则每个调用点都要自己 `try`（那就是兜底）。
   */
  saveImage(dataUrl: string): { ok: true; value: string } | { ok: false; message: string };
  /** 当前时间（来自 `ClockPort`，原则 4：core/stable 不直接调 Date.now） */
  now(): number;
}

/** 单次归一的结果 */
export interface MigrationOutcome<T> {
  value: T;
  /** 是否真的改了（false 时调用方**不应写盘**） */
  changed: boolean;
  /** 归一日志（原实现有对应 console 串，如「图片外置: X MB → Y MB」） */
  notes: string[];
  /**
   * ★ **没能处理的值**（原文）—— 归一**不假装成功**
   *
   * 例：图片外置失败 ⇒ 该值**保持内联**（数据不丢）但必须**如实上报**（原则 6）
   */
  failures?: string[];
}
