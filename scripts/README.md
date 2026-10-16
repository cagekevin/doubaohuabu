# scripts/ —— 治理 / 门禁 / 构建 / 验证脚本登记表

> **为什么有这份表**：本目录混着**常驻**（被 `npm scripts` 或治理流程引用）与**任务期验证器**（不进 `check`），
> 没有登记表时，AI 进来分不清哪个是活的、哪个是一次性的 —— 会去改一个没人跑的死件，或把验证器当门禁。
> **纪律**：**新增/删除脚本必须同步本表**（一行：用途 ＋ 判据 ＋ 入口）；`dead-code` 闸不覆盖 `scripts/`，所以本表就是它的账。
>
> **归属规则**：临时/一次性/探索性脚本**禁止丢在本目录** —— 住任务目录（例：`docs/plan/后端TS迁移/scripts/`，随任务封板），
> 或用完即删；本目录只留**常驻**件与**长期验证器**。

## 一、门禁与元层闸（真源 = `gates.manifest.json`）

| 脚本 | 用途 | 判据 | 入口 |
|---|---|---|---|
| `gates-run.mjs` | 门禁执行器（`check` / `health` / `list` / `status` / `off` / `on`） | **清单真源 = `gates.manifest.json`**，禁把闸手写进 npm script | `npm run check` |
| `gates.manifest.json` | 门禁清单真源（数据，非脚本） | 闸的开/关只改这里的 `disabled`（用 `gate:off/on`，禁手写） | `npm run gate:status` |
| `check-gate-vitals.mjs` | **元层闸（闸的闸）** | ① 在册闸的扫描根必须存在 ② 「扫到 0 即 fail-loud」的基数自检不得缺失 ③ 脚本闸头部【申诉口】三问（`Q1 守什么 / Q2 何时该改 / Q3 怎么改`） | `npm run lint:gates` |
| `check-dead-code.mjs` | knip 死代码闸 | 基线**永不复涨**：新增即红；清偿后 `--update-baseline` 重生成。判活但消费者在分析边界外（`scripts/**` · `electron/**`）⇒ 在**声明处**打 `@public 跨边界消费者：<路径>` | `npm run lint:dead-code` |
| `check-targets.mjs` | 扫描根 ＋ 扩展名无关解析的**唯一事实源** | 扫描根写死在各自脚本里 ⇒ 目录一调整就有文件**逃出所有校验且不报错** | 被 `check-*` require，不单独跑 |
| `census-ssot.cjs` | Step 0 普查：SSOT「第二份」的**份数** | 同一真相写在 ≥2 处 ⇒ 收口到拥有真相的那一层；输出「真相 → 定义处 ＋ 硬编码副本处」 | `npm run census:ssot` |

## 二、构建 / 冒烟 / 打包

| 脚本 | 用途 | 判据 | 入口 |
|---|---|---|---|
| `build-electron.mjs` | 后端产物：`tsc -p electron/tsconfig.json` → `electron/dist/` ＋ 同目录资源拷贝 | 漏拷同目录资源 ⇒ **启动即报错**（`MODULE_NOT_FOUND`）或静默回落空 pack；故有 `REQUIRED` 自检 | `npm run build:electron` |
| `smoke-electron.mjs` | 后端**最低限度**冒烟：起产物、判存活 / stderr 无致命错 / READY 标记 | 只判存活，**不判"窗口就绪"**（那是端到端的事） | `npm run smoke:electron` |
| `pack-mac.sh` | mac 打包（`--target=dir` 走目录态） | 产物面由 `packing/mac/electron-builder.yml` 定义 | `npm run pack:mac` |

## 三、治理工具（走脚本，禁手写产物）

| 脚本 | 用途 | 判据 | 入口 |
|---|---|---|---|
| `adr.mjs` | **ADR 决议系统唯一入口**（`add` / `list` / `audit` / `hygiene` / `doctor` / `refs` / `index` / `status`） | 索引是**产物**（禁手改）；`add` 需 `--user-approved`（缺则拒写） | `node scripts/adr.mjs doctor` |
| `debt.mjs` | **技术债账本唯一入口**（`add` / `resolve` / `list` / `audit` / `archive`） | 禁手写 `daily/架构日志/债务.md`（账本只此一个写入者） | `node scripts/debt.mjs list` |
| `arch-index.mjs` | 区域清单 / 审计进度（`--write` 重生成 `index.md`） | `index.md` 是**产物**：过期是「该重生成」而非「违规」⇒ 幂等生成器，不成闸 | `node scripts/arch-index.mjs` |
| `extract-detours.mjs` | 弯路提取器：扫 `daily/架构日志/**` 汇总「走过的弯路/教训」 | 防「我看到的 = 全部」（工具按相关性截断输出正是弯路本身） | `node scripts/extract-detours.mjs` |
| `mv-sync-refs.mjs` | 改名 / 移动文件 ＋ AST 全库同步引用（`refs` 顺链查到底） | **禁手写 `mv`**（手改必漂 import 与字符串残留） | `node scripts/mv-sync-refs.mjs rename\|move\|refs` |
| `probe.mjs` | **「先红后绿」探针执行器**（注入 → 跑命令 → 精确断言 → **无条件还原**） | 注入点必须唯一（0/多处即拒，防"红的不是那点"）；还原后 sha256 自校验；journal 兜底断电残留 | `node scripts/probe.mjs --label … --file … --find … --replace … --run …` |
| `ts-exts.cjs` | TS 期「扩展名无关解析 ＋ 永久豁免」的唯一事实源 | 被 `.mjs` 与 `.cjs` 双方 require ⇒ 只维护一份清单 | 被其它脚本 require |
| `extract-host-api.cjs` | 抽 `electron/preload.ts` 暴露的 `window.api` **方法名集合** | 复核期做名面差集用（多/少即点名）；两侧同源已由类型层承载 | 手动（复核期用） |

## 四、CSS / UI 工具（**手动工具，不是闸** —— 不进 `npm run check`）

| 脚本 | 用途 | 判据 | 入口 |
|---|---|---|---|
| `css.mjs` | CSS 效率工具箱：`check`（override/missing/order/dead/dupe/near/vars/hard）· `show`（一个类全貌）· `rename`（三处同步改名）· `stats` | CSS 有一层**构建期查不出**的静默错（`composes` 合成）⇒ 靠它量 | `npm run css -- check` |

## 五、运行时验证器（改了 `src/` **必须先 `npx vite build`** 再跑，吃 `dist/`）

> 用途：`ui/**` 与 `adapters/**` **不写组件测试**（假守卫）⇒ 这些端到端链路只能靠它们验。
> 启动策略只有一份：`_pw.cjs`（走**本机 Chrome**，避免 Playwright 升版后自带浏览器 build 号失效）。

| 脚本 | 覆盖 | 判据 |
|---|---|---|
| `verify-run.cjs` | M0「能渲染」 | 起静态服务 → 无头 Chromium 加载 → 抓错 → 看 `#root` 是否渲染 |
| `verify-w2.cjs` | W2 老数据兼容（**P0**） | 真实样本注入 → 启动 → 迁移 → 断言：无应用级错误 / 工程数据不丢 / 迁移幂等 |
| `verify-w4.cjs` | W4 持久化链路 | ① 600ms 内只写 1 次 localStorage（防抖生效）② `projects-autobackup.json` 同步更新（**需真实宿主**，mock 里是 no-op ⇒ 标 N/A 不假装通过） |
| `verify-canvas.cjs` | W13 画布完整性 | 8 类节点全部渲染 / 边渲染 / 撤销快捷键可用 |
| `verify-del.cjs` | 删除链路 | 删除生效 / **不留悬空边** / 撤销可回 |
| `verify-e2e.cjs` | W15 端到端（真实用户路径） | 新建工程 → 拖素材 → 建文本 → 连线 → 触发（mock 通道）→ 刷新还原 |
| `verify-config-store.cjs` | TD-13-5（配置损坏的处置） | 三态必须区分：损坏 ⇒ **备份 ＋ 报错**，**不静默重置** |
| `extract-real-sample.cjs` | 取证工具（非断言） | 从旧版 leveldb 提取 localStorage **真值**（老数据形状的唯一真身；别拿推理当事实） |

## 六、测试射程（**定位**用，不是交付门禁）

| 脚本 | 用途 | 判据 | 入口 |
|---|---|---|---|
| `test-affected.mjs` | 按改动反查该跑哪几个测试文件（三条规则：`self` / `stem` / `import`） | **全量＝验收，射程＝定位**；命中 0 ≠ 安全（打印「未命中」清单并点名该走哪条验路） | `npm run test:affected`（`--dry` 只算不跑 · `--json` 机器读 · `--files a,b` 手工指定） |
