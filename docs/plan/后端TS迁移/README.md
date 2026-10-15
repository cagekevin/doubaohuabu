# 后端 TS 迁移（专项任务）

> **定位**：把 `electron/**` 从 CommonJS JS 迁到**真 TS**（最严格档 · 收窄 · 无 any 兜底），并让前后端 IPC 契约**机器受检**（消灭人工对账）。
> **为什么做**：① 契约漂移是本仓**唯一实证过的 bug 类**（剪贴板三 bug · `jobId` vs `id` · `size` vs `bytes` · `pickStorage` 漏 payload）；② **TD-13-26**（electron 零闸：tsconfig/eslint/vitest 三方都不含）的既定解法就是把它拉进类型覆盖。
> **状态**：**B0-a ＋ B0-b 已完成**（地基、旗组合、两闸落地 —— 检查点 **C1 已过**，逐条凭证见 `日志.md`；弯路见 `弯路.md` W21–W26）。下一批 ＝ B1。
> **粒度**：**执行级** —— 裁决与顺序已写死；凡遇本文没写到的情形，**停下来改本文**，别就地决定。
> **本目录**：`README.md`（计划 · 本文）· `日志.md`（批次日志）· `弯路.md`（弯路台账）· `scripts/`（任务脚本）。

---

## §1 目标与覆盖边界

### 1.1 目标

| # | 目标 | 判据 |
|---|---|---|
| G1 | 编译收口（**最严格档**） | `tsc -p electron --noEmit` 零红（**范围见 1.2**）；B0-b 一次锁死，之后只许改本文留痕 |
| G2 | 契约机器校验（**名面 ＋ 字段面**） | 真源 ＝ 频道表；渲染层原始面 ＝ 由表在**类型层**派生的 mapped type（§5：**无生成器 · 无产物 · 无顺序耦合**）；handler 返回型 ＝ 表 `ret`；适配层收窄点编译期受检 |
| G3 | 载体数 ＝ 1 | `api/types.js` 的 JSDoc typedef 删副本、改引共享形状；频道名/种类/参数/回执形状**只在表里写一次**；`window-api.d.ts` 不再是手写副本 |
| G4 | 类型质量 | 显式 `any` ＝ 0 · `@ts-ignore` ＝ 0 · **`any` 泄漏 ＝ 0**（`no-unsafe-*`）· `as` 每批只降不升且每处注依据 · **`!` 禁** |
| G5 | **行为等价 ＋ 数据兼容** | 模块求值拓扑不变（§7）；**落盘格式与既有文件兼容**（§4.2 样本对照）；转换 commit 零逻辑改动；等价微改逐处留痕；真 bug 走债务／正确性通道 |
| G6 | 治理闭环 | TD-13-26 走 `debt.mjs` 销账（**写清销了什么／没销什么**）；eslint 的 electron 排除理由改当下口径；两闸 B0-b 落地（§8 落地清单） |

### 1.2 ★ 覆盖边界（**任何"绿"必须能回答：覆盖了什么、没覆盖什么**）

| 范围 | 覆盖情况 | 验证手段 |
|---|---|---|
| `electron/**/*.ts`（已转文件） | 类型（满载档）＋ lint（type-aware） | `typecheck:electron` ＋ eslint（**进 `npm run check`**） |
| `electron/**/*.js`（未转） | **不检查**（passthrough 过桥） | 登记在 `日志.md` 未转清单；运行期冒烟 |
| `electron/dola-duration-main.js`（2,190 行） | **永不进程序**（guest 主世界文本注入，不能 `require`） | diag 日志 ＋ 手工域名判定探针 —— **如实：零类型覆盖**，**B5 另立一笔债**（不塞进已销的 TD-13-26） |
| `build/shared-types/**` | 生成物（**禁手改**）：`@shared/*` 的声明层落点（§5 的 mapped type 方案**没有**第二份产物） | `build:shared` 每次重建（**过期结构上不可能**） |
| **生成的注入代码**（`fingerprint-preload.js` 产出的账号 preload 字符串模板） | **零类型覆盖**（它是字符串，不是模块） | 与 `dola-duration-main.js` 同判：如实登记，不假装覆盖 |
| 行为等价 | 只有部分可机器对照 | **黄金样本对照**（§4.2）＋ 冒烟；其余手测清单；**没做的写"未验"** |
| **数据兼容**（落盘格式） | **只能靠样本对照** | 迁移前录真实样本 → 前后跑同一读写 → diff（§4.2） |

## §2 现状基线

- `electron/**` ＝ **28 个文件 / 11,343 行** CommonJS（`dola-duration-main.js` 2,190 行是 guest 注入脚本），直跑不编译，打包原样进 `electron/**` 的 glob。
- **零闸事实**：根 `tsconfig.json` 的 include 只有 `src` · `eslint.config.js` 排除 `electron/**` · vitest include 只有 `src/**`。
- **外部耦合（已取证）**：`chrome-cdp.js` 有 `require('ws')`，`ws` 装在 **`electron/node_modules`**；根 `package.json` 是 `"type":"module"`，`electron/package.json` 是 `"type":"commonjs"`（其注释记着 `require is not defined` 的踩坑）⇒ 决定 §4.1 的地基。
- **落盘面（数据兼容的对象）**：见 §4.2 D-13（**格式一律不改**）。
- **后端对 `src` 零运行时依赖**（已取证）⇒ 只做**类型消费**。

### 2.1 ★ 清点表（B0-a 的**唯一**产出 —— 同时承载「待验证断言」「三清单」）

> 本文多数结论有源码/命令证据；**下表 A-x 是抽样推理**，B0-a 必须现场核。核实结果**不另开清单** —— 就地填进**同一张清点表的列**（表落 `日志.md`；**推翻即改本文**）。

**清点表列**（28 个文件逐行）：`require('electron')?` · 顶层副作用? · 惰性 require? · 有环? · 单函数导出(`module.exports = fn`)? · 消费方改其导出值? · 顶层 `this`? · 核实结论。

⛔ **不许人肉从零读 28 个文件**（7 列里 5 列机器一次扫得出）：
- **脚本扫候选**（一次，几十行）：`require('electron')` · `module.exports =` 单函数形态 · 函数内/动态 `require` · `require(...).x =` 形态 · 顶层 `this`；
- **`depcruise` 出环**（一条命令）；
- **人只判例外**：脚本报出的候选里，**哪个顶层副作用真的依赖 main 侧初始化**（这才是需要判断的部分）。

⛔ **不许把这张表拆成"三清单 + 断言清单"三份**（那是同一真相三处 —— 本仓母体）。§7 的 C-1/C-2/C-3 就是它的三列。

| # | 断言（待核） | 若被推翻 | **B0-a 核实**（2026-10-15 · 脚本与证据见 `日志.md` / `evidence/`） |
|---|---|---|---|
| A-1 | `api/**` 是"最干净的纯子域"（不 import `electron`） | 批内划分与"可测"边界要改；含 electron 的模块不测 | **基本成立，一处例外**：`api/bridge.js` 顶层 `require('electron')`（另 2 处惰性）⇒ 它**不可单测**；其余 14 个 `api/**` 文件零 `electron` |
| A-2 | 5 个 providers 的 `buildSubmit`/`parseSubmit`/`parsePoll` 是纯函数 | 测试面缩小 | **成立**（5 个 provider 零 `electron`、零顶层副作用）；注意同形 5 处 `testConnection` 里的**函数内 `require('../http')`** ⇒ 按 C-3 处置 |
| A-3 | `license.js` 的机器码/验签路径**可注入**（能做样本对照） | 改手工清单，如实标"未验" | **推翻**：导出面只有 `initLicense` / `__setTrustedTimeOverride` ⇒ 验签/机器码**不可注入** ⇒ 走"被推翻"那一档（手工清单 ＋ **未验**，见 `evidence/golden`） |
| A-4 | 各域自注册的 IPC 频道总数（`dola-media` 5 个等） | 表覆盖不完整 ⇒ C2 判据不成立 | **成立，且抓到 1 处真缺口**：preload **81** 成员（invoke 69 · send 4 · sendSync 2 · on 5 · value 1）、后端 `handle` 70 ＋ `on` 6；三侧对账后 **`open-lovart-chrome` 未暴露**（后端注册、preload 无名面、`src/` 零消费）⇒ B1 必须显式处置它 |
| A-5 | 28 个文件的 `require` 关系**无环** | 环上模块保留 CJS 形态 | **成立**（两法一致：脚本自建图 0 环 · `depcruise electron` = 67 modules / 0 violations） |
| A-6 | 没有"消费方改已转模块的导出值"的写法（§7 I-4） | 那些模块**保留 CJS 形态** | **成立**（28 文件该列全空）。⚠️ 脚本口径只认「直接 `require(..).x =`」与「顶层 `const m = require(..)` 后改 `m.x`」；经别名/参数传递的改法**扫不到** |
| A-7 | guest 注入脚本只有 `dola-duration-main.js` 一个（`fingerprint-preload` 生成物除外，见 1.2） | §3 批次与 §4 地基加特例 | **成立**（`main.js` 只有一处 `readFileSync('dola-duration-main.js')` 注入源；`fingerprint-preload.js` 是产出字符串的**生成器模块**，属 1.2 已登记项） |

## §3 顺序

**三条排序规则**：① **依赖序**（callee 先于 caller，`main.js` 最后）② **价值序破平**（契约面优先）③ **簇序优先于文件序**。

**为什么不返工**：依赖序 ⇒ 每文件开转时依赖已 typed；价值序 ⇒ 唯一实证过的 bug 类最先拿到防线；簇序 ⇒ 最少手工改动；**频道表先行** ⇒ B1 的读人工作把 B4 变成机械批；**B0-a 试红 ＋ 基线快照先行** ⇒ 地基与旗组合在任何转换之前定死。

⚠️ **不打乱依赖序去缩短"规格未核"窗口**（`main.js` 的 handler 区依赖 B3 的域模块，提前会让依赖序失效）⇒ 用**基线快照 ＋ 黄金样本**（§4.2）在 B1 就把 handler 回执录成**证据**。

| 批次 | 内容 | 完成判据 |
|---|---|---|
| **B0-a 试红 spike**（不写业务代码） | ① 最小样例逐项实测 §6 S0-6 清单；② 样板试转：挑**中位难度**的一个（如 285 行的 `api/config-store.js`，含 `fs`/`crypto`）量**真实单文件代价** —— ⛔ 别拿最容易的 `api/redact.js`（纯函数）当样板，那会**系统性低估**代价；③ 外部引用清单；④ `.js` 源/产物 diff 抽查；⑤ **§2.1 那张清点表**（28 文件逐行：`require('electron')`? / 顶层副作用? / 惰性 require? / 环? / 单函数导出? / 消费方改导出值? / 顶层 `this`? —— **三清单与此表是同一件东西**）；⑥ **基线快照**（**频道清单** —— 转换后 `preload` 就没了，必须迁移前录）；⑦ **样本**（复用 `tests/` fixtures，见 §4.2） | 地基与旗组合**定稿**（＝ `electron/tsconfig.json` 落地）；产出写进 `日志.md`（**清点表是批次划分的依据 —— 它推翻哪条断言就改本文**） |
| **B0-b 运行地基与接入** | §4.1 的 D-1…D-9 ＋ §4.2 的 D-10…D-13 ＋ 两闸落地（§8 落地清单） | **检查点 C1**（§4.3） |
| **B1 契约面**（382 ＋ 表） | `ipc.ts`(39) · `preload.ts`(173) · `api/bridge.ts`(170) ＋ **频道表**（`src/stable/ipc-channels.ts`；**脚本出草稿**，人补类型/形状/note）＋ mapped type 派生 `WindowApi` ＋ `extract-host-api.cjs` **并入草稿生成** | **检查点 C2**（§9.4，**名面闭环**） |
| **B2 api/ 子域**（2,078） | `types`(57)→`redact`·`quota`·`domains`·`http`(283)→`_shared`(20)→5 个 providers(852)→`registry`(38)→`config-store`(285)→`job-manager`(545) | tsc ＋ lint 零红；同批落纯逻辑测试；**config-store 过数据兼容样本** |
| **B3 域模块**（4,288） | `dola-media`(1551)→`license`(758)→`chrome-cdp`(465)→`lovart-fetch`(379)→`clipboard-image`(327)→`lovart-scan`(255)→`fingerprint-preload`(226)→`firefox`(231)→`site-hosts`(96) | 各域零红；**冒烟只要求「起窗 ＋ 打开相关面板不崩」**（真实站点/CDP 链路**不可达 —— `verify-e2e` 从未跑过**，行为如实标未验）；**license 过黄金样本** |
| **B4 main.js**（2,403） | handler 区（回归频道表）→ 项目存储迁移 → settings 读写 → 窗口/会话/胶水 | 零红 ＋ **冒烟＝起窗/加载工程/打开设置**（需登录账号的链路标未验）；**存储布局/settings 过样本** |
| **B5 收尾** | `pack:dir` · TD-13-26 销账（＋ `dola-duration-main` 与账号 preload 生成物的零覆盖**另立债**）· 长期工具搬 `scripts/` · `弯路.md` 升华（含**规矩寿命**处置）· knip 覆盖 electron **先基线化、不当批硬清** | G1–G6 全绿 |

## §4 ★ 运行地基与基线证据

### 4.1 运行地基（**约束 → 违反后果 → 验证手段**）

> 这些不是"配置条目"，而是**运行期成立的前提**。任一条错 ⇒ 编译绿但跑不起来，且**每批冒烟都会断**。

| # | 约束 | 违反后果（本仓已取证） | 验证手段 |
|---|---|---|---|
| D-1 | **产物住 `electron/dist/`**（必须在 `electron/` 内） | 根 `package.json` 是 `"type":"module"` ⇒ 产物被判 ESM ⇒ `require is not defined` | 冒烟：起窗 |
| D-2 | 产物同层能解析 **`ws`** | `ws` 在 `electron/node_modules`；产物挪到仓根 ⇒ `Cannot find module 'ws'`（`chrome-cdp.js:36`） | 冒烟：走 Chrome/CDP 集成链 |
| D-3 | `exclude: ["node_modules", "dist", "dola-duration-main.js"]` | `include: ["**/*"]` ＋ `allowJs` 把产物与 `node_modules` 当源码 ⇒ **自噬** | `tsc --listFiles` 数文件数（应 ≈ 28） |
| D-4 | **入口切产物 ＋ `dist` 基准同批改**：`package.json` 的 `main` → `electron/dist/main.js`，`main.js` 里 `'../dist/index.html'` / `path.resolve(__dirname,'..','dist')` → **上两级**。⛔ **`app.getAppPath()` 不可用**：B0-a 实测它 ＝ **入口所在目录**（文件入口 ⇒ 文件所在目录；目录入口 ⇒ 该目录），**不是"仓根"** ⇒ 拿它拼 `dist` 会在某种启动方式下指错 | 渲染层入口找不到 ⇒ 白屏 | 冒烟：**产物**起窗 ＋ stderr 无「`[main] 找不到 …index.html`」 |
| D-5 | **同目录资源全清单**（`__dirname` 基准，B0-a grep 实算）：`preload.js`（tsc 产出）· `dola-duration-main.js`（拷）· **`dola-skill-pack.json` ＋ `doubao-skill-pack.json`（拷 —— 漏了会**静默回落成空 pack**，只判存活的冒烟抓不到）** | 预加载 / 注入 / skill-pack 注入失败 | 冒烟：stderr 无「`[dola-media] 读取 … 失败`」＋ 注入 diag |
| D-6 | **构建链**：`build:electron` 进 `npm run build`（`pack:*` 依赖它） | 打包发**旧产物或无产物** | `pack:dir` 查产物 |
| D-7 | 打包 `files`：`electron/**` ＋ `!electron/**/{*.ts,tsconfig*.json,*.tsbuildinfo}` | 连源码与配置一起发 | `pack:dir` 查 asar 清单 |
| D-8 | ignore：`build/` · `.migration-backup/` · `*.tsbuildinfo` · 本任务 `evidence/`（B0-a 已加）；**`electron/dist` 已被现有 `.gitignore` 的非锚定 `dist/` 命中**（实证 `git check-ignore -v`） | 产物/备份进 git | `git status` |
| D-9 | eslint ignores 加**全部产物目录**；**保留 `electron/**/*.js` 的 ignore** | 未转 `.js` 被通用 TS 规则扫红 ⇒ 误判"代码太差"⇒ 降档 | `npm run lint` **当天绿** |

### 4.2 ★ 基线证据与黄金样本（**没有 before，就无法证明 after**）

> 这是本计划原缺的一整块：G5 的"等价/兼容"若没有**迁移前的快照**，就只能靠人嘴说"我小心了"。四条产出在 B0-a 完成，之后每批按需取用。

| # | 机制 | 内容 | 用途 |
|---|---|---|---|
| D-10 | **频道清单快照** | **＝ 草稿生成脚本的产物**（`preload.js` 还在时跑一次；含成员名单 · 种类 · 频道名）。**成员数以快照为准** —— B0-a 实测 **81**（invoke 69 · send 4 · sendSync 2 · on 5 · value 1）；此前写的「82」是估值，已废，⛔ 不再在别处复述这个数 | B1 写表的**起点**（B0-a 已录）；B5 与最终表对照 —— **不另存一份快照** |
| D-11 | （**已删**）回执形状快照 ⇒ 与「表条目自带精确回执形状 ＋ 取证锚点」（§5）**是同一件东西**，另存一份即第二载体 | — |
| D-12 | **黄金样本（行为）** | **只给"单测覆盖不到、又不会崩"的部分**：**`license` 的机器码/验签** · 存储布局探测 `detectStorageLayout` / `migrateEngineeringToFile`。⛔ **不含 `providers` 的 parse / `job-manager`** —— 那两处由 **B2 同批单测**覆盖，样本对照是重复（且单测更持久） | 行为等价的**机器证据**（补 G5 无强手段的缺口） |
| D-13 | **数据兼容样本** | 录文件样本：`settings.json` · `项目工程.json` · `api/config-store` 配置 · 账号导出 · skill-pack 缓存；迁移后**用旧样本读一遍、再写回对比** | 旧数据读不出/格式漂移**当场暴露** |

**样本纪律（防过度设计）**：① **复用仓里 `tests/` 的 fixtures（含 real-sample）**，**不新造样本体系**；② **一个通用 replay 脚本即可，⛔ 不为每个样本写专用 harness**（那会长出第二套测试框架）；③ **样本里不得有真实密钥 / cookie / 账号**（只录结构或脱敏 —— 即便 gitignore 也不放）。

**规则**：样本与快照是**证据**（进 `build/` 或本目录，gitignore），**不是第二种真源**；它们只服务"证明等价"，`src`/`electron` 里的实现不许读它们。

| # | 机制 | 内容 | 用途 |
|---|---|---|---|
| D-14 | **未转清单可重算** | 清单＝`electron/**/*.js` 实算（census 顺带输出文件数），`日志.md` 里只是**转录** | 手写台账必腐（本仓母体）⇒ 清单以**命令输出**为准 |

**★ 配置类"镜像/差一个键"的声明必须用 `extends` 落实**：`tsconfig.census.json` 与 `tsconfig.shared.json` 都**extends 对应的执法配置**、只覆盖必要键；**脚本校验键集差异**（否则"镜像 `src` 的旗"只是口头约定，迟早漂 —— R4 同类）。

### 4.3 检查点

- **C1（B0-b 末）**：D-1…D-13 全通过 ＋ census 出全量基线 ＋ **两闸已接且当天绿** ＋ 冒烟脚本可跑。**过不了不进 B1。**

## §5 ★ 契约模型（真源 / 派生 / 适配层）

**真源 ＝ `src/stable/ipc-channels.ts`**（频道表：**名 · 种类（invoke/send/sendSync/on）· 参数元组 · 回执原始形状 · `note`**）

- 住 `stable` 是**按定位**：它就是"冻结契约"的家（与那 20 键同族）；契约是**共享物**，不归某一端私有。
- `note` 承载判据（「fail-closed：必判内层 `ok`」「`sendSync` 不得 `await`」）—— **判据随真源**。

**渲染层原始面 ＝ `WindowApi` 的 mapped type 派生**：由表的键/值在**类型层**派生出 `{ importFiles(…): Promise<…>, … }`（`sendSync` 类派生为同步返回）。
⇒ ⛔ **无生成器 · 无产物 · 无 prebuild 顺序耦合 · 无 src 侧 import 改动** —— 上一版的「生成器 ＋ `build/host-api` ＋ 3 处 import ＋ 顺序耦合」**整包删除**（mapped type 让 TS 自己算）。

**后端消费**：`electron/preload.ts` 的对象 `satisfies WindowApi`，经 `@shared` **type-only** 引入表 ⇒ 名字/种类/参数/回执形状**两端同源受检**。

**适配层** ＝ `src/core/ports/host.port.ts`（`HostPort`）⇒ **另一层**（`Result` 包装 ＋ 接口隔离），**各归各家**。
**形状归属判定规则**：**两侧同形 ⇒ 归 `src/stable`；分层不同形 ⇒ 各归各家**。⛔ 不许把后端独有的原始回执形状塞进 `src/stable`。

### 5.1 ★ 表怎么来：**脚本草稿 ＋ 人补判断位**（不人肉读 82 个方法）

| 列 | 谁做 |
|---|---|
| **名 · 种类 · 频道名 · 参数名** | **脚本草稿**（从 `preload.js` 抽，§11） |
| **参数类型 · 回执形状 · `note`** | **人/AI 判断**（脚本抽不出的部分 ⇒ **留 `TODO(…)` 占位**） |

**完成判据 ＝ `TODO` 清零 ＋ `preload.ts satisfies WindowApi` 通过。**
⇒ 草稿**不可能被静默当成真源**：漏方法/多方法/名字不符，编译期**当场必红**（这就是"草稿 + 交叉校验"比"人抄"可靠的地方）。

### 5.2 ★ 分阶段（字段面**不**一次性写全）

- **B1 只锁名面**（名/种类/参数/判别位）⇒ **C2 判据 ＝ 名面闭环**；
- **字段面精确化随 handler 转换同批**（转到哪个 handler 就补那一行的精确 `ret`）—— 避免"B1 读一遍、B4 再读一遍"；
- 字段面最终精确 ⇒ 适配层的 `asRecord` / `checkOk` / `normalize` 收窄点**编译期受检**（`handler → 表 → mapped type → 适配层 → HostPort` 全链机器化）。

`scripts/extract-host-api.cjs` ⇒ **并入草稿生成**（它的抽取逻辑正是 M1 的起点），不再是"人工对账"的主力。

## §6 严格度（S0 满载档）

**S0-1 严格族（全开）**：`strict` 全族（含 `useUnknownInCatchVariables` · `strictBuiltinIteratorReturn`）· `noUncheckedIndexedAccess` · **`exactOptionalPropertyTypes`** · `noImplicitOverride` · `noImplicitReturns` · `noPropertyAccessFromIndexSignature` · `noFallthroughCasesInSwitch` · `noUnusedLocals`/`Parameters`（认 `_`）· `allowUnreachableCode: false` · `allowUnusedLabels: false` · `noUncheckedSideEffectImports` · `moduleDetection: "force"` · `noErrorTruncation`。

**S0-2 模块与产物**（**定稿值**，B0-a 实测 —— ⛔ 别再写"待测"，也别在别处复述第二遍）：`module: node16` · `moduleResolution: node16` · **`verbatimModuleSyntax: false`** · `isolatedModules` · **`erasableSyntaxOnly: true`** · `esModuleInterop` · **`noEmitOnError: true`** · `sourceMap` · `incremental` · `target/lib: ES2023`（含 `DOM`：`electron.d.ts` 需要）· `types: ["node"]` · **`rootDir: "."` · `outDir: "dist"` · exclude 见 D-3** · `allowJs: true` ＋ `checkJs: false`（S0-3）。

**S0-3 明确"不开"**：`skipLibCheck: true`（三方 d.ts 的错不可行动）· `isolatedDeclarations`（为 DTS 并行构建设计；效果由「导出面显式标注」＋ lint 达成）· `checkJs` 执法口径 `false`（测量归 census；B5 终态置 `true`）。

**★ 迁移期不升 TypeScript 版本**（旗的语义会随版本变 ⇒ 属 P6 同类）。

**S0-4 lint 层**（`no-explicit-any` 只拦**写出** `any`；最大来源是**收到** `any` ⇒ 必须 type-aware）：

| 层 | 规则 | 可调性 |
|---|---|---|
| **类型安全层** | `no-unsafe-assignment`/`-member-access`/`-call`/`-return`/`-argument` · `no-floating-promises` · `no-misused-promises` · **`no-non-null-assertion`** · `consistent-type-assertions` · `no-explicit-any` · **`no-restricted-imports`（`@shared/*` ＋ `allowTypeImports`）** · **`no-restricted-globals`（`window`/`document`）** · `no-empty` | **不可去** |
| **风格层** | `strictTypeChecked` 的 `no-unnecessary-condition` / `prefer-nullish-coalescing` 等 | B0-a 实测是噪声 ⇒ 关（**不动类型安全轴，不算降档**） |

> ★ **`no-restricted-imports`（`@shared/*` ＋ `allowTypeImports`）为什么必须留在不可去层**：B0-a 实测本目录**必须**关 `verbatimModuleSyntax`（TS1295/1287），
>   于是「`@shared` 只许类型导入」**唯一的机器载体**就是这条 eslint 规则 —— 它漏接不是"判据变松"，是**判据静默消失**（`@shared` 的任何 runtime 值都会被后端打进产物）。
>   ⇒ 它与 `no-unsafe-*` 同级：只许改载体，**不许去掉**。
>   ⚠️ 另一面（B2 起要注意）：`verbatimModuleSyntax` 关掉后，**仅用作类型的 import 会被自动擦除** ⇒ 只为副作用的**裸** `import './x'` **不会**被擦（安全），但"看着没用"就删掉它 = 改行为；见 §11.2 `codemod-boundary` 的拒绝清单。

**S0-5 闸接线（与直觉相反）**：`allowJs` passthrough ⇒ 未转 `.js` 不报错 ⇒ **B0-b 当天即绿**，**立刻进 `npm run check`**，此后每转一个文件自动变严。拖到 B5 ＝ 整个迁移期无守卫（正是 TD-13-26 的病）。

**S0-6 实测点（B0-a 逐项**跑**）＋ 替代阶梯**：

| 待测 | 若不成立 ⇒ |
|---|---|
| `module: node16` ＋ `verbatimModuleSyntax` 在 `"type":"commonjs"` 下**是否允许 ESM 语法** | 换 `commonjs` ＋ `node10`（技术性替代）；若 `verbatimModuleSyntax` 与该组合不相容 ⇒ 「`@shared` 只许类型导入」从 tsconfig 降级为 **eslint `no-restricted-imports`**（仍是机器检查，载体换了） |
| `erasableSyntaxOnly` 与既有写法冲突（**可提前 grep** `enum `/`namespace `/参数属性） | 改 const 对象；仍不行则去掉（便携性项） |
| type-aware lint 挂载（`projectService`） | 改显式 `project: ['./electron/tsconfig.json']` |
| 风格层是否只是噪声 | 关掉（不算降档） |
| `build:shared` 最小 include 是否绿 | `--explainFiles` 定位；缩 include；**若某形状文件依赖 DOM ⇒ 那些形状不该被后端消费，后端定义局部接口并登记** |
| `.js` 产出与源是否一致 · `noEmitOnError` 产出是否完整 | 有差异 ⇒ 记日志，B3/B4 逐个核对 |

**★ B0-a 逐项实测结论**（原始命令与输出见 `日志.md`；定稿 ＝ `electron/tsconfig.json`）：

1. **`module: node16` ＋ `verbatimModuleSyntax: true` 不成立** —— TS1295/TS1287（本目录最近 package.json 是 `"type":"commonjs"` ⇒ 文件按 CJS 处理，开 verbatim 时 ESM 语法被拒）。⇒ 走替代阶梯的**第二档**：「`@shared` 只许类型导入」交给 eslint `no-restricted-imports`（`allowTypeImports`）。
2. **阶梯第一档 `node10` 也不可用** —— TS 6.0.3 报 TS5107「已弃用，TS 7.0 起停止工作」（要靠 `ignoreDeprecations` 才跑得动，那是降噪开关）。⇒ **定稿 `module/moduleResolution: node16` ＋ `verbatimModuleSyntax: false`**：实测绿，且产物是 `require` / `exports.x`（运行期形态不变）。
3. **`erasableSyntaxOnly` 保留**：`electron/**` 里 `enum` / `namespace` / 参数属性 **grep 零命中**（探针实测这四类形态确实会被 TS1294 拒；`import x = require()` 同样被拒——本仓不需要它，因为 verbatim 关了、ESM 语法可用）。
4. **type-aware lint 用 `projectService` 挂得上**（探针实测：故意违规文件被 `no-unsafe-*` / `no-explicit-any` / `no-non-null-assertion` / `no-floating-promises` / `consistent-type-assertions` 全数抓住）⇒ 不必退到显式 `project`。
5. **风格层实测**：在真转完的 `config-store` 上只报 5 处，全是**与源逐字等价**的写法（`${number}` 模板 ×2 · `String(unknown)` ×3）⇒ 属噪声（关这两条，**不动类型安全轴**）；同批 `no-unnecessary-condition` / `no-unnecessary-type-assertion` 各抓到 1 处**真冗余** ⇒ 风格层**不是**整片噪声，按条处置、别整族关。
6. **`build:shared` 机制成立**（声明层产物 → `paths` 消费 → `satisfies` 编译期受检）：一个真 `src/stable` 文件在**无 DOM**、`types: []` 下绿，产物落点随 `rootDir`。⚠️ 实测要求 `rootDir` **显式**给（否则 TS6059/TS5011）。
7. **过桥核对（`.js` 源/产物）**：AST 级比 ⇒ **实质 0**，唯一差异是 tsc 注入的 `"use strict"`（sloppy→strict 的语义风险面另做扫描：`with` / `arguments.callee` / 八进制 / `delete 变量` / 给未声明名赋值 **均零命中**）⇒ B3/B4 不必逐个手核。

**总则**：**技术性替代可自行采用 ＋ 日志留痕**；**真降档必须用户拍板 ＋ `弯路.md` 一条**（点名：`exactOptionalPropertyTypes` · `noUncheckedIndexedAccess` · 类型安全层任何一条）。**不许静默降。**

## §7 ★ 改写不变量（防"编译绿、行为变"）

**I-1 模块图与求值顺序，改写前后必须同构。** 判据 ＝ **§2.1 那张清点表的三列**（不另立清单）：

| 列 | 内容 | 命中时的动作 |
|---|---|---|
| **C-1 顶层副作用** | 模块顶层读 `app.getPath('userData')` / 读写 `fs` / 读 `process.env` / 调 `init*` 自注册 | 该 `require` **保留原样**（`import` 提前求值；`main.js` 的 `app.setPath('userData')` 与其后 require 的顺序即此类） |
| **C-2 环** | `depcruise` 对 `electron/` 跑 `no-circular` | 环上边界保持命名导出；必要时保留惰性 `require` |
| **C-3 惰性 require** | 函数内 / 动态 `require()` | **保留原样** ＋ 注释理由 ＋ eslint 局部放行 |

**I-2 导出形态**：统一**命名导出**。⛔ **禁 `export default`**（tsc 的 CJS 产出是 `exports.default`，未转 `.js` 用 `require()` 拿到 `{default: fn}` ⇒ **运行期断、编译期不报**）· ⛔ `export =`（被 `verbatimModuleSyntax` 拒）· `module.exports = fn` ⇒ 具名函数 ＋ named export。

**I-3 任何"看起来等价"的时机改写都要论证 ＋ 留痕**；论证不出来 ⇒ 保留 CJS 形态。

**I-4 ★ 模块级可变导出的语义差（新）**：CJS 的导出是**值快照**，ESM 是 **live binding**；tsc 的 ESM→CJS 产出里，`export let x` 的内部变量与 `exports.x` 是**两份** ⇒ **未转的 `.js` 去改已转 `.ts` 的导出值**（`require('./x').counter++`）会**改到副本上、模块内部读不到**（编译期不报、运行期静默漂移）。
⇒ **规矩**：转换前用清点表查有无此形态（A-6）；**命中 ⇒ 该模块保留 CJS 形态**（或在同批改成"经函数改"—— 属逻辑改动，须留痕）。不许把"跨模块可变状态 + 直接改导出"带进 ESM 产出。

## §8 每批 DoD（五项缺一不可）

> **DoD 按「批次」（§3 的 B*x*）交，⛔ 不按文件交。**「一个文件 ＝ 一个转换单元」说的是**改动单元**（好定位、好回滚），不是"每个文件跑一次 DoD／一个 commit" —— 27 个文件 27 次 DoD 会逼出糊弄式填表。

1. `tsc -p electron --noEmit` 零红 **且** `eslint electron` 零红（**没有"暂时红"**）；
2. **计数表 ＝ 直接贴 `census` 输出**（tsc 报错 / any / any 泄漏 / as / `!` / ts-ignore 的改前→改后）—— ⛔ **不手工填数**（手工数字可编；命令输出不可编，且省一步）。
3. 运行时冒烟 **或** 测试 **或** 样本对照（§4.2）——**验不了就写「未验」＋ 手测清单**；
4. **一批 ＝ 一个 commit**（开工前工作树干净，批外改动先 commit）；
5. `日志.md` 一条（含脚本变更登记与未转清单）。

> ⚠️ **「先红后绿」不是每批跑**：闸的效力在 B0-b 证明一次即可；此后每批只需**闸绿**。只有**改了闸配置或脚本**时才重跑 `probe.mjs` —— 每批都跑是重复劳动（§11.1 已有此分级）。
> ⚠️ **「生成步已跑」不列入 DoD**：它由命令串联（§8 末）**结构上保证**，写进 DoD 只是自我安慰。

**测试边界**：electron 测试**只许导入不依赖 `electron` 的纯模块**；`isolate: false` ⇒ 测试用工厂 ＋ 每例复位。

**通用战术**：先标导出面再填内部 · 形状**从调用方 grep** · deps 注入工厂的形状从**解构默认值**读 · 文件头注释即契约源 · `catch(err)` 全仓一个 sanctioned 微改（`err instanceof Error ? err.message : String(err)`，B1 在 `ipc.ts` 定形复用）· **拒绝清单**：无 any ／ 无 ts-ignore ／ 不放宽配置 ／ 无留痕的逻辑改动 ／ **不拆文件（重构≠转换）** ／ 不"先转了以后再收窄" ／ 禁 `export default` ／ 不动惰性 `require`。

**★ 闸落地清单（B0-b 执行，走 `lint:gates` 申诉口三问 ＋ 留痕）**：① `eslint.config.js`：从顶层 ignores **移出 `electron/**`**，新增 electron 块（**只匹配 `electron/**/*.ts`**），并**显式 ignore `electron/**/*.js` 与全部产物目录**（D-9）；② `package.json`：加 `typecheck:electron` / `build:electron`（§5 的 mapped type 方案下**没有** `gen:window-api`；`build:shared` 见 §11.4 的时机修正）；③ `gates.manifest.json`：登记 `typecheck:electron`（**理由 ＝ TD-13-26 既定解法，非新建闸**）；④ 两闸的**申诉三问**写进 `日志.md`。

**★ 生成步必须显式调用，不靠 npm 的 `pre*` 钩子魔法**：`gates-run.mjs` 内部若直接 spawn `tsc`（而不是 `npm run typecheck`），钩子**不会触发** ⇒ 用旧产物 ⇒ **假绿**。⇒ 生成步写在**脚本内部**（`build:shared && gen:window-api && tsc …` 串在同一条命令里），且 C1 要有一条"故意改表不重生成 ⇒ 检查必须红"的验证。

## §9 防返工

> 真源 ＝ `docs/plan/04-防返工-机制.md`。本节只写**本任务的实例化**。

### 9.1 四根因落到本任务

| 根因 | 本任务的形态 | 机制 |
|---|---|---|
| **R1 假证据当依据** | 照 JSDoc / `DATAFLOW` 叙述 / `HostPort` 的**期望**写后端类型 | 类型只认 **handler 源码** ＋ **`src/stable` 冻结形状**；表项带**取证锚点**（符号名，**禁行号**）；取不到证标 `TODO(取证)`，**不许猜**；D-11 快照供料 |
| **R2 纸面即交付** | 「转完了」＝ tsc 绿，而**编译绿 ≠ 能跑** | §4.1 地基表 ＋ §4.2 样本对照 ＋ 每批冒烟/测试 ＋ 验不了写「未验」 |
| **R3 半态留尾巴** | .js/.ts 混着没人知道哪些没转；顺手修 bug 混进转换 | 未转清单；一文件＝一单元；迁移期不新增导出；bug 单独 commit/记债 |
| **R4 一份真相两份** | typedef「以后再删」；频道名两侧各写；手改生成物；临时拷类型 | 副本同批删；**频道表＝真源，渲染层声明＝产物**（§5）；生成物禁手改；禁临时第二载体 |

### 9.2 迁移特有的返工源

| # | 形态 | 机制 |
|---|---|---|
| P1 | **地基选错** ⇒ 每批冒烟都断 | §4.1 约束表 ＋ C1「过不了不进 B1」 |
| P2 | **类型方向写反**（表 `ret` 照期望写） | **以后端 handler 实际为准**；与 `HostPort` 不一致的**逐条登记并裁定**（要么前端 bug、要么后端不合契约 ⇒ **正是价值产出**） |
| P3 | 一次转太多 ⇒ 红字混团 | 一文件／一小簇为单元；批内不做两件事 |
| P4 | 接口改了、实现或测试留到下一批 | 接口 ＋ 实现 ＋ 测试同批 |
| P5 | 批边界不清 ⇒ 无法回滚/二分 | 一批 ＝ 一个 commit |
| P6 | **严格度晚开** ⇒ 已转文件成片回炉 | B0-b 一次锁死满载档；降档 ＝ 改本文 ＋ 弯路 ＋ 留痕 |
| P7 | **旗组合不成立 / 单文件摩擦未知** | B0-a 试红 spike ＋ S0-6 逐项实测 ＋ 替代阶梯 |
| P8 | **地基与配置被当"清单条目"**（违反后果没人写、没人验） | §4.1 三列强制（约束／后果／验证手段）＋ C1 |
| P9 | **契约只收口一半**（后端自洽、名面仍手写） | §5 三段式 ＋ 生成物 ＋ prebuild |
| **P10** | **没有 before 证据**（无快照/样本）⇒ 等价与兼容**无法证明**，只能靠"我小心了" | §4.2 D-10…D-13：快照 ＋ 黄金样本 ＋ 数据兼容样本，**B0-a 就录** |
| **P11** | **规矩没有寿命** ⇒ 混合期专属规矩（禁 `export default` 等）任务后变僵尸约束 | §12「规矩寿命」：每条标注 **混合期 / 永久**；任务结束时按寿命处置 |
| **P12** | **数据兼容未列**（只看"行为等价"，忘了旧文件要能读） | G5 拆成**行为 ＋ 数据**两面；D-13 样本对照进相关批次 DoD |
| **P13** | **计划自身的断言被当事实用**（§2.1 里靠推理的 A-1…A-7）⇒ 执行者照信 ⇒ 在错前提上排批次/定可测边界，返工在后面才暴露 | §2.1 的**清点表**（断言与三清单**同一张表**）逐条核实；**推翻即改本文** |
| **P14** | **台账靠手写**（未转清单）⇒ 必腐 | D-14：清单＝**命令实算**，日志里只是转录 |
| **P15** | **"镜像/差一个键"的配置靠口头** ⇒ 执法口径改了它没跟 ⇒ 检查口径漂移 | **优先不建第二份配置**（census 用 CLI `--checkJs`）；确需第二份时**必须 `extends` ＋ 脚本校验键集差异** |
| **P16** | **同一件事写成多份近似清单**（三清单 ＋ 断言清单 ＋ 清点表 ＝ 本仓母体"同一真相多处"） | **合并为 §2.1 一张清点表**；⛔ 不许再拆 |

### 9.3 失败信号（出现即**停手回查**）

计数不降 ⇒ 方向错 · 冒烟红 ⇒ 先查 §4.1 再查 §7 · 样本对照失败 ⇒ **先想"是不是我改了行为/格式"**，不许改样本 · 出现 `any`/`@ts-ignore` ⇒ 该单元未完成 · 自己在**让表迁就期望** ⇒ P2 · 想关旗 ⇒ P6 · **B0-b 当天红（非未转文件引起）⇒ 回 B0-a**。

### 9.4 检查点

- **C1（B0-b 末）**：D-1…D-13 全过；census 出基线；两闸接进 `check` 且当天绿；冒烟脚本可跑。
- **C2（B1 末）**：频道表覆盖全仓 `ipcMain.handle/on`（含各域自注册）；**名面**生成物已产出且 prebuild 生效；`preload` 与生成声明编译期对齐；src 侧 3 处 import 已改且 `src` 的闸仍绿；**先红后绿探针**（单侧改频道名／形状 ⇒ `npm run check` 必红；改回绿）。

## §10 故障处置

### 10.1 红了先分类

| 码段 / 症状 | 处置 |
|---|---|
| **TS1xxx**（语法/产出流程） | **先修配置或语法形态，别动业务代码** |
| **TS2xxx** | 工单，按簇修 |
| **TS6xxx**（tsconfig 选项组合） | 回 §6 S0-6 |
| **TS7xxx**（缺注解） | 按「形状从调用方 grep」修 |
| `Cannot find module` | 先跑 `build:shared` / `gen:window-api`；再查 `paths` 与 `rootDir` |
| **未转 `.js` 报错** | 不应发生 ⇒ 配置错，**别去改那些 `.js`** |
| **冒烟红** | 先查 §4.1 地基表逐条核对，再查 §7 不变量 |
| **样本对照失败**（行为/格式漂移） | 当成**真 bug** 处理（正确性优先）＋ 留痕；**不许动样本** |

### 10.2 转换阶段（阶梯，**从便宜到贵**）

| 症状 | 应对 |
|---|---|
| 某文件**收不窄** | ① 补**局部接口** → ② 调用点结构收窄 → ③ **允许局部留 `unknown` ＋ 注理由** → ④ 整文件**停在 `.js` passthrough**（登记未转清单 ＋ 理由）——**不是降档** |
| 微改**越积越多** | 每处「改前改后行为可论证等价」＋ 注释 ＋ commit message；真 bug 单独 commit／记债 |
| lint 与 tsc 矛盾 | 只可能在**风格层** ⇒ 关该条；类型安全层不会矛盾 |
| 转完的文件**测不了** | 只测纯模块；顶层 `require('electron')` 的模块 ⇒ 不测（登记"不可测"＋因），**不许为可测拆文件** |

### 10.3 收尾与外部引用

| 项 | 应对 |
|---|---|
| `extract-host-api.cjs` 读 `electron/preload.js` | B1 同批改路径（正则仍匹配 `.ts`）；B5 判去留 |
| 外部引用（`scripts/` · `packing/*.yml` · `docs/` · 根 `package.json`） | B0-a 出清单，B0-b/B5 逐个同步；`pack:dir` 至少跑一次 |
| knip 覆盖 electron | 从 `knip.json` ignore 移出 ⇒ 存量死代码暴露；**基线 ＋ 当批清偿**；量大先基线化记债 |
| `docs/**` 路径过期 | `mv-sync-refs.mjs` 顺链 ＋ B5 统一核一次 |
| **与常驻台账的边界** | 本任务只动 **TD-13-26（销账，写清销了什么/没销什么）＋ `dola-duration-main` / 账号 preload 生成物的零覆盖新债**；**不新增缺口行**（迁移不是功能缺口）⇒ DoD 的「三处回写」**对本次不适用**（`dataflow`/`plan 13·14·15` 均无对应行），B5 一句说明即可 —— ⛔ 不为"豁免"写论证（零收益的仪式） |
| **不碰跨世界重复** | `electron/site-hosts.js` 层 2 判定 vs `dola-duration-main.js` 的主机名判定（已裁定"保留 ＋ 如实登记为跨世界残留"，**值 1 / 判定 2**）⇒ 本任务**不顺手合并**（那是重构夹带）；只登记不改 |

### 10.4 中断 / 并发 / 降档诱惑

| 情形 | 应对 |
|---|---|
| 中断数月 | 读法三部曲（§12）；**进度可测**：census 剩余红字数 ＋ 未转文件数 |
| 期间有人改 `electron/**` | 一批一 commit ＋ 开工前工作树干净 ⇒ 冲突范围 ＝ 一批 |
| **多会话并行** | **频道表与生成物是独占资源**（同一时间只允许一个批次改）；批次开工前在 `日志.md` 声明"本批是否动表" |
| 渲染层同时在改 `HostPort` | 形状被 `@shared` 编译期抓；名面靠生成物 |
| **红得受不了想降档** | 停手 → 记 `弯路.md` → 技术性替代自行采用，**真降档必须拍板** |

## §11 脚本

### 11.1 通用契约（所有脚本一律遵守）

| 约定 | 内容 |
|---|---|
| 落点 | 任务期内住本目录 `scripts/`；**B5 升华**把长期工具搬进根 `scripts/` |
| 形态 | Node ESM（`.mjs`，对齐仓里既有工具）；不引新依赖（可用已声明的 `typescript` / `@babel/parser`） |
| CLI | 每个脚本有 `--help`；需要机器读时给 `--json` |
| **写盘分两类** | ① **产物区**（`electron/dist/` · `build/**` —— gitignore、**可重生**）⇒ **默认写**，`--dry` 打印计划不落盘；② **受版本控制 / 手写文件** ⇒ **默认 dry**，`--write` 才落盘 |
| **可逆** | 靠「**产物可重生**」（删掉重跑即恢复）＋ 写盘前打印**受影响文件清单**；只有「会改受版本控制文件」的脚本才需 `.migration-backup/<ts>/` ＋ 打印回退命令。⚠️ **git 不可当回退**（见 `弯路.md` W1） |
| **幂等** | 连跑两次 ⇒ 结果相同、`git status` 无差异（这是可逆性的结构保证） |
| 退出码 | `0` 通过 · `1` **检查失败**（过期／新增／断言不成立）· `2` 用法或环境错 |
| **不静默** | 任何「跳过／缺失／降级」都**打印 ＋ 非零退出**（原则 6） |
| **确定性** | 生成物必须确定：**稳定排序 · 无时间戳 · 无绝对路径 · 无 `Date.now()`**（否则 `--check` 天天红） |
| **判据不许改软** | 检查逻辑只增不减（同 `check-dead-code.mjs` 的「闸成本守恒」之罪） |
| **自证（分级，别一刀切）** | `--help` ⇒ **所有脚本必需**；`--json` ⇒ **仅 census**（机器读）；**幂等自证**（跑两次无差异）⇒ **仅「写盘」脚本**；**先红后绿凭证**（`probe.mjs`）⇒ 落到闸上的脚本 |
| 登记 | 每次改动写进 `日志.md` 当批条目（改了什么／为什么／回退方法／验证） |

### 11.2 脚本契约（**现在定死**）与落地时机

| 脚本 | 契约 | 落地于 | 留给实测的空白 |
|---|---|---|---|
| `build-electron.mjs` | 步骤：`build:shared` → `tsc -p electron/tsconfig.json` → 拷 `dola-duration-main.js`；输出 `electron/dist/` ＋ **文件清单**；缺文件 ⇒ exit 2 | **B0-a 骨架 → B0-b 定稿** | `module`/`moduleResolution` 组合 · exclude 清单 · rootDir/outDir |
| `census-electron.mjs` | 输入：**同一个 `electron/tsconfig.json` ＋ CLI `--checkJs`**（⛔ **优先不建第二份配置**；B0-a 先实测 CLI 覆盖是否可行，不可行才退到 `tsconfig.census.json` ＋ extends）；输出：人读表（文件×码×簇）＋ 基线 `census-baseline.json`（本目录）；**默认只报告（天然 dry）** · `--update-baseline`（**带「不许涨」守卫**） · `--changed` · `--check` | **B0-a 骨架 → B0-b** | CLI 覆盖是否可行 · tsc 输出解析格式 · 簇分类规则 |
| **`draft-channel-map.mjs`** | 读 `electron/preload.js` → ① `--snapshot` 产**证据快照**（D-10：preload 侧名面）② `--write` 产 `src/stable/ipc-channels.ts` **草稿**（名 · 种类 · 频道名 · 参数名；**判不出的一律留 `TODO(…)`**）；**改源文件 ⇒ 默认 dry ＋ `--write`** | **① B0-a（抽取＋快照）/ ② B1（写草稿）** —— 快照必须在 `preload.js` 还在时录（D-10） | 抽取用 AST（已定：正则认不出 helper 转发，见 `弯路.md` W24） |
| **`draft-handler-returns.mjs`** | AST 抽每个 handler `return {…}` 的**字段名** → 输出「待补形状」清单（人补类型与判别联合） | **B1 起，B3/B4 反复用** | 多分支返回的合并规则 |
| **`codemod-boundary.mjs`** | **模块边界改写**（机械面）：顶层 `const {a} = require('x')` / `const x = require('x')` → `import`；顶层 `module.exports = {…}` → `export {…}`。**⛔ 拒绝并报告**（不猜）：函数内/动态 `require` · `module.exports = fn` · `default` 形态。★ **副作用导入不得被删**：只为副作用的裸 `require('./x')` → 裸 `import './x'` 是**安全**的（裸 import 不会被擦除），但**不许"看着没用"就删** —— `verbatimModuleSyntax` 已关（类型专用 import 会被自动擦除），"类型导入"与"副作用导入"在**擦除前后**的差别只能靠人看 ⇒ 逐处对照清点表的 **C-1 列**复核。**改源文件 ⇒ 默认 dry ＋ `--write`**；幂等；改前打印受影响文件与改动清单 | **B2 起，逐文件用**（输入＝清点表的拒绝清单） | 边缘形态（`exports.x =` · 重导出） |
| **`jsdoc-typedef-to-ts.mjs`** | `electron/api/types.js` 的 JSDoc `@typedef`/`@property` → TS `interface` 草稿（一次性） | **B2** | 联合类型 / 可选位映射 |
| `smoke-electron.mjs` | **最低限度**：跑**产物**（`electron/dist/main.js`），判「进程存活 N 秒 ＋ stderr 无致命错（`Cannot find module` / `require is not defined`）＋ 主进程 READY 标记」；失败 ⇒ exit 1 ＋ 打印 stdout/stderr。⛔ **不做断言框架、不判"窗口就绪"**（脆、且那是 W15 端到端的事） | **B0-b** | Windows 下启动／超时／取证方式 |
| `gen:shared`（无脚本） | `tsc -p tsconfig.shared.json` → `build/shared-types/` | B0-b | include 最小集（按需缩） |

### 11.3 ★ `--check` 的正确定位（纠正一处过度设计）

**产物在 gitignore ＋ 每次 prebuild 重建 ⇒ 过期在结构上不可能 ⇒ 不需要常规 `--check`。** `--check` 只保留两个用途：① **取证**（证明生成步真能拦住漂移：故意改表不重生成 ⇒ 必须红）；② 将来若某生成物改为**提交进 git**，则**必须**补 `--check`。
⇒ DoD 的「生成物「新鲜度」由 **prebuild 串联**保证；`--check` 不是常规项。

### 11.4 写脚本的时机（**现在写什么、做什么时写什么**）

- **现在**：只定 §11.1 通用契约 ＋ §11.2 脚本契约（**不写实现**）—— 实现依赖 spike 结论与频道表，提前写 ＝ 在未验证假设上写代码（P7 同类）。
- **B0-a**：写 `build-electron` / `census` 的**最小骨架**（spike 本身要用：要编译、要计数）＋ 清点表扫描脚本（**候选扫描**，非草稿）＋ **`draft-channel-map` 的抽取/快照部分**（⑥ 的 before 证据只能在此刻录，D-10）＋ `check-passthrough` / `replay-samples`（④/⑦ 的证据）。
- **B0-b**：脚本定稿 ＋ `smoke-electron` ＋ 闸接线 ＋ §11.1 的**分级自证**。
  ⚠️ **时机修正**：`build:shared` 的实际接线上限是 **B1** —— 它的 include 目标是 `src/stable/ipc-channels.ts`（B1 的产物），B0-b 落它只会得到一个空 include。⇒ B0-b 只接 **`typecheck:electron`**（+ eslint 块），`build:shared` 随 B1 同批接；`build-electron.mjs` 对缺失的共享配置**显式打印跳过**（不静默）。
- **B1**：`draft-channel-map`（**必须在 `preload.js` 还在时跑**）＋ `draft-handler-returns`。
- **B2**：`jsdoc-typedef-to-ts`（一次性）＋ `codemod-boundary`（逐文件起用）。
- **B3–B4**：`codemod-boundary` ＋ `draft-handler-returns` 为**主力工具**（不是"维护性变更"）；其他脚本只做维护性变更（登记进 `日志.md`）。
- **B5**：长期工具搬进根 `scripts/`。

### 11.5 ★ 原则：**机械活一律脚本，判断活才用人**

**什么算机械**（可脚本化）：**由语法/结构就能定**——名字、种类、频道名、参数名、`return` 的字段名、`require`/`exports` 形态、导入路径、JSDoc 类型注解。
**什么算判断**（必须人/AI）：**需要"为什么"**——字段的**类型**与判别联合怎么合、某个顶层副作用**是否依赖 main 的初始化**、某个形状该归 `src/stable` 还是后端专有、某处改动**是否等价**。

**草稿三条纪律**（防"草稿被当成真源"）：① 判不出的一律**留 `TODO(…)`**，⛔ 不许猜着填；② **完成判据 ＝ TODO 清零 ＋ 编译期交叉校验通过**（不是"脚本跑过"）；③ 草稿脚本**改源文件 ⇒ 默认 dry ＋ `--write`**（§11.1 分类）。

**一次性命令（不立脚本 —— 立了就是过度）**：`npx depcruise electron --output-type err`（出环：**v18 没有 `--no-circular` 这个 CLI 开关**，走仓里配置的规则即可）· `npx tsc -p electron/tsconfig.json --listFiles`（D-3 数文件数）· `grep -rn "enum \|namespace \|constructor(.*private"`（S0-6 便携性项预检）· `npx asar list <产物>`（D-7 查打包内容）。

### 11.6 ★ 授权：执行者**可以**自写脚本、改进方法、推翻本文裁决

**授权（不必先问）**：机械活一律自己写脚本（§11.5）；**方法与顺序可以改**（拆小批次 · 换更省的做法 · 改脚本）；**本文的裁决可以被推翻**（如 W20 用 mapped type 取代生成器那一整包）。

> **为什么给这个授权**：把机械活与探索成本压到最低 —— 而它成立的前提恰恰是**判据固定**。**方法自由 ＝ 判据不动**；判据一松，"自由"就退化成绕行。

**三条边界（缺一即不是授权，是绕行）**：

1. **判据不降**：不碰 §6 S1 红线 · S0 类型安全层 · §5 真源 · §4 地基；任何"降判据换进度"的方案**一律禁**（真降档必须用户拍板）。
2. **留痕可复核**：
   - **小改进**（新增辅助脚本 · 把一次性命令脚本化 · 拆小批次）⇒ `日志.md` 一条（做什么／为什么／回退方法）；
   - **大改动**（改顺序 · 改检查点 · 换真源 · 删改既有脚本 · 推翻某条裁决）⇒ **同批改本文** ＋ `日志.md` 一条。
   ⛔ 只在日志里说、本文不动 ＝ 留了两份相矛盾的指令（正是"同一真相两处"）。
3. **可逆 ＋ 默认 dry**：新脚本守 §11.1（产物区默认写；**改源文件默认 dry ＋ `--write`**；自备份；幂等；确定性）。

**"目标一致"怎么判（三问，任一为"坏"即不是改进）**：① 它让哪条 G 的判据**更早／更可靠**成立？② 它有没有让任何红线**变松**（含"把检查写得更松"）？③ 它有没有新增**第二载体／新闸／不可逆副作用**？

**⛔ 已知的"假改进"样本**（看着目标一致，实则降判据）：自造更松的检查（如只数部分文件的 `any`）· 用脚本把红线**自动改写掉**（批量 `any` → `unknown as`）· 自创流程绕过 C1/C2 · 把"验不了"用脚本输出糊成"已验"。

## §12 记录约定

| 记什么 | 哪里 | 纪律 |
|---|---|---|
| 计划 | `README.md`（本文） | 没写到的情形**改本文**，不就地决定 |
| 批次日志 | `日志.md` | 每批一条：范围 / 落点＋计数表 / 凭证 / 弯路 / 下一步；**脚本变更**、**未转清单**、**闸申诉三问**、**"本批是否动表"**也在这 |
| 弯路 | `弯路.md` | **任务专用、单独成册**（不进 `daily/架构日志/弯路汇编.md` —— 那本由 `extract-detours.mjs` 扫**常驻**日志生成，本任务是一次性的）· `W<n>` · **追加不删** · 每批必须回答有无新弯路 |
| 债 | 中央 `daily/架构日志/债务.md`（走 `node scripts/debt.mjs`） | 不另立账本 |

**★ 交付态**：**任何完成度都可运行、可打包**（`allowJs` passthrough ＝ 混合态合法）—— 不存在"必须全转完才能发版"。遇"摩擦 ≫ 价值"的文件走 §10.2 阶梯 ＋ 登记，**不硬扛**；是否继续 B3/B4 由用户定（不许静默漂移）。

**★ 规矩寿命**（P11）：**只标「混合期」的那些**（默认＝永久，不标 —— 省一半噪音）：禁 `export default` · 顶层 `require` 保留 · 未转清单 等**全转完即失效**。任务结束时：混合期规矩**删除**（或标注失效），永久规矩进 eslint 块 / `docs/判据登记表.md`。

**读法（每个新会话开工前）**：① 本文 §3 找当前批次 → ② `弯路.md`（**必读**）→ ③ `日志.md` 尾条（上批到哪、计数基线、未转清单、是否动表）→ ④ 开干。

**★ 授权**：**可自写脚本 · 可改方法与顺序 · 可推翻本文裁决** —— 三条边界见 §11.6（**判据不降 · 留痕可复核 · 可逆默认 dry**）。

**每批最小阅读集**：§3 当前批次行 ＋ §4（地基/样本）＋ §7（不变量）＋ §8（DoD）＋ §11.5–11.6（机械活/授权）＋ `弯路.md`；改契约时另加 §5。

**升华（任务完成时）**：逐条判 `弯路.md` 哪些对常驻工作有价值 —— 搬进真源（`docs/判据登记表.md` / `docs/adr/` / `docs/架构与契约定稿.md`）；长期工具（`build-electron` · `gen-window-api` · `census` 若仍需要）搬进 `scripts/`；混合期规矩按寿命处置；其余封板留本目录。
