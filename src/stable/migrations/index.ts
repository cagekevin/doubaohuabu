/**
 * 数据归一的入口
 *
 * ⚠️ **本目录不再有"启动迁移"**（2026-10-10 删）：
 *    原 5 条迁移（`legacyCanvas` / `globalizePresets` / `normalizeAccounts` /
 *    `migrateNodes` 的旧类型与补字段 / 启动时图片外置）经**真实样本实测全部空转** ——
 *    它们服务的是**不存在的用户**（旧版本数据）。
 *    判据（7步法 铁律 2）：「留这个是为了谁？」→ 答案若是"老用户旧数据/旧版本" ⇒ 直接删。
 *
 * ⚠️ **本目录保留的都是「每次都要跑」的数据归一**，不是"一次性迁移"：
 *    | 文件 | 何时跑 | 为什么每次都要 |
 *    |---|---|---|
 *    | `imageExternalize` | **每次落盘前**（`usecases/persistProject`） | base64 不许进 JSON（配额根因） |
 *    | `resetStaleJobs` | **每次启动**（`bootstrap/hydrate`） | 上次崩掉的在途任务不会有结果 |
 */

export * from './types';
// ⚠️ `isInlineImage` 已**不是**本目录的导出（2026-10-11）：它提为协议真源
//    `stable/protocols/img.ts`（判据 C1）。此处原有一个转发导出，本来也无人 import（在死代码基线里）。
export { externalizeProjectImages, externalizeDeep } from './imageExternalize';
export { resetStaleJobs } from './resetStaleJobs';
