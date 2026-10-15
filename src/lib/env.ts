/**
 * **运行环境单源**（`IS_DEV`）—— ★ 全仓**只许本文件**读 `import.meta.env`
 * ⚠️ **2026-10-12**：原同时导出的 `IS_PROD`（= `!IS_DEV`）已**删** —— 0 消费、且表达式冗余（死代码闸报它为「基线外新增」）。
 *
 * ★★ **为什么存在**（`TD-16-108`）：`lib/log.ts` 要一个「日志开关」的**判据来源**，
 *   而此前全仓 **`import.meta.env` 0 命中**、也没有任何 `config.ts` ⇒ 开关无处可依。
 *   本文件就是那个**唯一落点**：以后凡是要"看环境"的代码，**都从这里 import**，
 *   不许各写一份 `import.meta.env.X`（那会变成同一真相的第二份）。
 *
 * 依据：
 *   - `tsconfig.json:27` 已声明 `"types": ["vite/client", "node"]` ⇒ `import.meta.env` **有类型**；
 *   - 构建走 Vite（`vite.config.ts`），Electron 加载 `dist/index.html` 的**产物**
 *     ⇒ 构建期 `DEV=false`，dev server 期 `DEV=true`；
 *   - 测试（vitest，`environment: 'node'`）同样由 Vite 注入 ⇒ 测试期 `DEV=true`。
 *
 * ⚠️ **别与宿主探测混淆**（名字像，职责不同）：那类实现归 `adapters/host/`（例：
 *   `adapters/host/shared/env.ts` 读 GPU / 窗口尺寸），
 *   本文件是**构建期常量**，不碰任何宿主对象、不 import 任何东西。
 * ⚠️ 本模块**无状态、无副作用**（`vite.config.ts` 的"不得有跨文件共享的模块级可变状态"前提不受影响）。
 */

/** 是否开发/测试环境（Vite `DEV`；取不到时**按生产**处理 —— 宁可少打日志，不可多打） */
export const IS_DEV: boolean = import.meta.env?.DEV === true;
