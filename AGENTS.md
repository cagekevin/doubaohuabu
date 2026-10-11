# AGENTS.md · 豆包画布（渲染层重写）

> 本文件是**给 AI 代理的项目说明书**：先读它，再动手。
> 红线真源 = `docs/11-架构与契约定稿.md`（§三 依赖规则 · §六 契约边界 · §六·五 职责归位八原则）。本文件**只做索引与摘要，不复述判据正文**；冲突以 `docs/11` 为准。

---

## 一、这是什么

豆包画布是 **Electron 桌面无限画布应用**。本仓库 `app/` 是它的**渲染层重写**：

- 从**还原产物**（原 `_ComponentNN.jsx` / 5,486 行单 store）重写为 **端口-适配器（Hexagonal）分层**的 TS/TSX 工程。
- 目标：**行为等价 + 数据兼容**（不是代码等价）。
- 宿主能力经 `HostPort` 抽象；**默认不依赖 Electron**（DEV 下走 mock）。
- 技术栈：React 19 + `@xyflow/react` 12 + zustand 5 + Vite 8 + Vitest 5 + TypeScript 6（strict）+ `@mediapipe/tasks-vision`（人脸检测）。
- **是 git 仓库**（`git log`：初始化 M0~M7 → 同步重构与治理产物 → 归档 HANDOFF）；**无 SSR / RSC**。

### 当前状态（2026-10-11）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0~M7 | 骨架 / 数据层 / 画布 / 素材 / 宿主 / 生成 / 站点 / 端到端 | ✅ **已提交基线** |
| M8 | 契约与状态地基（`lsValues` / `settings` / `persistKeys` / `subscriptions`） | ✅（工作区） |
| M9 | 内核纯规则（`core/rules/*` 20+ 模块） | ✅（工作区） |
| M10 | 边界层（5 个站点适配器 + `adapters/media` + `site/shared`） | ✅（工作区） |
| M11 | 用例编排（`core/usecases/*` 14 个） | ⏳ 进行中 |
| M12 | UI 公共件 + 8 类节点功能 | ⏳ 进行中 |
| M13 | 面板 / 页面（21 个） | ⏳ 起步 |

进度真源：`docs/00-进度台账.md`；里程碑重排与逐项落点：`docs/16-缺口落点与写法定稿.md` §7。
> ⚠️ **M8 起的产出大多尚未提交**（`git status` 有大量改动 / 新增）；换机或交接先看 `docs/归档/17-交接-HANDOFF.md`。

### 已知缺口（照实列出，勿当已完成）

- **缺口三登记**（性质：**里程碑未到 ≠ 债**）：`docs/13-原版功能缺口登记.md`（UI 层）· `docs/14-功能层缺口登记.md`（宿主能力 / 域链路，**41/53 端口方法零调用**）· `docs/15-数据与持久化缺口登记.md`（20 键 **3 用 17 空**）。
- **未接线**（有实现、无链路）：`core/rules` 的 `dedupe` / `facemask` / `faceDetect` / `fingerprint` / `sendGuard` / `replyKind` / `genProgress` / `license` / `node` 等（生产 0 消费），`adapters/media/facemask`。清单见 `docs/DATAFLOW.md` §十二。
- W3 图片外置幂等的**磁盘侧**、W4 的 `projects-autobackup.json` 同步 → 需**在 Electron 内**验证（mock 是 no-op）。
- W6 连线环检测的 **UI toast 接线**未做运行时验证（单测已过）。
- 豆包后台视图（原 `_Component43`）已落 `ui/panels/BackendView.tsx`；**分组 / 账号导入导出 UI / 指纹诊断 / 静默快照**等子面板仍缺。
- **活跃技术债**见 `daily/架构日志/债务.md`（读写走 `node scripts/debt.mjs`，**禁手写、禁全量 Read**）。

---

## 二、常用命令

```bash
npm run dev            # Vite 开发服务器（端口 5175）
npm run build          # check + vite build（产物 dist/，Electron 加载）
npm run check          # ★ 完整门禁：typecheck + lint + boundaries + invariants + host-api + test
npm run typecheck      # tsc --noEmit
npm run lint           # eslint（含 react-hooks）
npm run lint:boundaries  # dependency-cruiser（分层方向 + 无环 + volatile 隔离）
npm run lint:invariants  # 职责归位八原则的 grep 型不变量
npm run lint:host-api    # W1：调用面 ⊆ preload 暴露面
npm run test           # vitest run
npm run spec:ui        # 抽原版 UI 清单 + 生成 docs/12 对照表
npm run census:ssot    # SSOT 普查（同一真相的副本份数）
npm run pack:win       # 打包 Windows（electron-builder；另有 pack:dir / pack:mac / icon）
```

> **改完代码必跑 `npm run check`。** 它是 5 道静态闸的合体，任一不过即为失败。

治理工具（**走脚本，禁手写产物**）：

```bash
node scripts/arch-index.mjs            # 区域清单/审计进度（--write 重生成 daily/架构日志/index.md）
node scripts/debt.mjs list [--area 07] # 读技术债；add / resolve / audit 见脚本头注
node scripts/adr.mjs doctor            # ADR 一键体检（list/audit/hygiene/refs/extract-detours）
node scripts/adr.mjs add --title "…" --conclusion "…" --user-approved   # 落一条 ADR
node scripts/mv-sync-refs.mjs rename|move|move-dir   # 移动/改名文件（自动同步 import，禁手写 mv）
node scripts/probe.mjs                 # ★ 先红后绿探针（给"闸会咬"留凭证，跑完自动还原）
node scripts/check-targets.mjs         # 扫描根 / 扩展名解析的唯一事实来源
node scripts/ui-spec/extract-ui-inventory.cjs && node scripts/ui-spec/gen-ui-spec.cjs  # 重生 docs/12
```

---

## 三、分层与依赖铁律（最重要）

```
L0  lib / constants / styles      谁都能用，它不依赖谁
L1  stable                        只依赖 L0（冻结契约，永不 import 上层）
L2  core                          依赖 stable；不依赖 adapters / state / ui
L3  adapters                      依赖 core/ports（实现它）+ stable
L4  state                         依赖 core/usecases + core/ports（用注入的 adapter）
L5  ui                            依赖 state + core/model（只读类型）
L6  bootstrap                     唯一可以 import 全部的地方（组合根）
```

**三条铁律**（`npm run lint:boundaries` 强制）：

1. `core` **不得** import `adapters` / `state` / `ui` —— 保证领域核心可纯测。
2. `ui` **不得**直接调 `window.api` / import `adapters` —— 必须经 `state → usecases → ports`。
3. `stable` **不得** import 任何上层 —— 冻结契约不可被业务污染。

**额外机器约束**：

- **无依赖环**（`no-circular`）。
- **`adapters/site/*` 是 volatile 层**：站点选择器**只允许 `adapters` 内部与 `bootstrap` 依赖**，不得泄进 `core` / `state` / `ui` / `stable`。
- **`core` 不得依赖 `react` / `react-dom` / `@xyflow`**（纯领域）。
- **依赖规则共 10 条**（`.dependency-cruiser.cjs`，全部 `error`）：层向 · 无环 · `state` 禁 `adapters` · volatile 隔离 · `core` 禁 react。
- **禁 barrel files**：每层暴露若干小入口点，不要巨型 `index.ts` 再导出全部。

### volatile 在哪

`adapters/site/*`。**站点改版只动它**，`stable` / `core` 零改动 → 回归面最小。

---

## 四、职责归位八原则（`docs/11` §六·五）

违反即架构退化。`npm run lint:invariants` 覆盖原则 3/4/5/6/7/8。

| # | 原则 | 落地要点 |
|---|---|---|
| 1 | **谁拥有状态，谁负责写** | 只有 `state/**` 能写 store。`core/usecases` / `adapters` **绝不能**；`ui` 只能调 state 暴露的 action，不得 `useStore.setState()`。 |
| 2 | **事件推送只能订阅转发** | adapter 暴露 `subscribeXxx(cb): () => void`（只订阅），**state 层是唯一写入点**。adapter 不解释、不存储。 |
| 3 | **端口只有类型** | `core/ports/**` 只有 `interface` / `type`，**零实现**；实现只在 `adapters/**`。 |
| 4 | **纯的归 core，脏的归 adapters** | `core/**` 不得出现 `window` / `document` / `Date.now()` / `Math.random()` / `localStorage` / `setTimeout` —— 一律经端口注入。 |
| 5 | **SSOT** | 文案 / 常量 / token / 键名各有唯一真源，见 §五。 |
| 6 | **错误透传** | 生产者（`adapters` / `core/rules`）产错，消费者（`usecases` / `state` / `ui`）**只转发**。禁吞错、禁改写 message、禁编造 reason、禁兜底造错。 |
| 7 | **只测纯逻辑，不测 UI** | 见 §六。 |
| 8 | **三振出局** | 同一段代码第 **3** 次出现 ⇒ **必须抽出**（UI 交互 → `ui/common/`，逻辑 → `core/rules/`，工具 → `lib/`，常量 → `constants/`）。 |

**错误交付契约**（唯一交付方式，`core/model/result.ts`）：

```ts
type UsecaseResult<T> =
  | { ok: true;  value: T }
  | { ok: false; reason: FailureKind; message: string };  // message = 原始错误原文
```

**四条禁止**：① 禁 `catch {}` / 无形参 `.catch`；② 禁改写 `message`（友好文案在 `constants/text.ts` 按 `reason` 映射，不覆盖原文）；③ 禁编造 `reason`（缺分类 → 去 `core/rules/failure.ts` 补）；④ 禁消费者兜底造错。

---

## 五、SSOT 真源清单（禁裸字面量）

| 内容 | 唯一真源 | 机器守卫 |
|---|---|---|
| 20 个 localStorage 键名（`LsKey`） | `src/stable/contracts/keys.ts` | `原则5/ssot-keys`（`doubao-*` 字面量只许在此目录） |
| 20 键的**值形状** | `src/stable/contracts/lsValues.ts`（`LsValueMap` + 编译期穷尽断言） | 结构穷尽（少一键编译不过） |
| 工程 JSON / 快照格式 | `src/stable/contracts/schemas.ts` | 同上 |
| `img://` 协议规则（sha1 前 16 位 + `?w=`） | `src/stable/protocols/img.ts` | — |
| 数据形状（Node/Project/Account/Gen） | `src/stable/model/` | — |
| 数据归一（2 条：落盘前外置 / 启动归位） | `src/stable/migrations/`（`imageExternalize` · `resetStaleJobs`） | — |
| UI 文案 / 失败 label / 错误横幅映射 | `src/constants/text.ts`（`FAIL_LABEL` 等真源在 `constants/failure.ts`） | — |
| 模型表 / 风格预设 | `src/constants/models.ts` · `src/constants/stylePresets.ts` | — |
| 失败分类 kind + label（14 项） | `src/constants/failure.ts` | `原则4/core-purity` + 表驱动单测 |
| 失败分类表 + 决策（`decideByReason`） | `src/core/rules/failure.ts` | 同上 |
| 设计 token（颜色 / 间距 / 圆角） | `src/styles/tokens.css`（CSS 变量） | `原则5/ssot-color`（字面量色值只许在 `tokens.css`，例外 `src/constants/**` 供 canvas 2D 用色） |
| 端口类型 | `src/core/ports/`（`clock`/`host`/`site`/`storage`；M11 增 `backendPage`） | `原则3/ports-type-only` |
| 依赖方向 | `.dependency-cruiser.cjs`（10 条规则） | `npm run lint:boundaries` |

**样式方案**：原生 CSS + CSS Modules；ReactFlow **只用官方 `--xy-*` CSS 变量**主题化（`src/styles/theme.css`），**不写 `.react-flow__*` 类名覆写**；组件禁硬编码色值 / 间距，只引用 `var(--...)`。

**Token 三层架构（2026-10-11 升级）** —— `tokens.css` 现在是：

```
L1  PRIMITIVE  原始值（颜料盒）· ★ 全仓唯一允许十六进制 / px 的层
L1.5 BRAND     品牌槽位 · 指向 L1，可被 data-brand 整体换掉
L2  SEMANTIC   语义层（意图）· 组件**只准引用这一层**
L3  COMPONENT  组件旋钮 · 每个控件自己的可调参数
```

| 想改什么 | 动哪层 | 动几行 |
|---|---|---|
| 整体换品牌（紫→蓝） | L1.5 的 `--brand-500` | 1 行 |
| 换整套明暗 | 切 `data-theme`（L2 已有 light / dark 两套） | 0 行 |
| 只改按钮，不动选中框 | L3 的 `--btn-primary-bg` | 1 行 |
| 只改选中框，不动按钮 | L3 的 `--node-selected-ring` | 1 行 |
| 切圆角风格（方正↔圆润） | 切 `data-shape` | 0 行 |
| 切紧凑 / 宽松 | 切 `data-density` | 0 行 |

> ★ **旧 token 名（`--color-primary` / `--space-2` / `--radius-md` …）全部保留为 L2 别名**，
>   `density=1` 时间距数值与旧值完全一致 ⇒ **默认态视觉与升级前零差异**。
>   后续可按切片逐个把旧名换成语义名，换完再删 `tokens.css` 底部的别名块。
>   设计过程与切法演示见 `docs/mockup/`（切换器在页面顶部）。

> ⚠️ **inline style 判据**：只有**运行时动态值**才允许内联 —— 浮层坐标（`left/top` 跟随鼠标或锚点）、
>   进度条实时百分比、xyflow `<Background>` 的 `opacity`（用 CSS 覆写会违反
>   「不写 `.react-flow__*` 类名」铁律）。**其余静态样式一律进 CSS Modules**，不得内联。

---

## 六、测试边界

- **只测纯逻辑**：`core/rules/**`、`core/usecases/**`（注入 mock adapter）、`stable/migrations/**`、`state` 的纯 reducer。
- **不测** `adapters/**`（薄封装，测它 = 测别人）、**不写 `ui/**` 组件测试**（会产生"假守卫"）。
- 测试文件位置：`src/**/tests/**/*.test.ts`（Vitest，`environment: node`）。**`ui/` 与 `adapters/` 下不得有测试文件**（`原则7/test-boundary` 会拦）。
- UI 用**端到端冒烟**验（`scripts/verify-*.cjs`），测真实用户路径。
- 断言红线：**实现一变必红**；自证式断言（仅验不崩 / mock 被调用）无效。

---

## 七、文档地图（每份只干一件事）

| 想知道什么 | 读哪 |
|---|---|
| **物理红线 / 依赖规则 / 契约边界 / 八原则** | `docs/11-架构与契约定稿.md` ★ |
| 实现进度 / 里程碑验收 / 已知缺口 | `docs/00-进度台账.md` |
| 数据流现状（谁经过谁） | `docs/DATAFLOW.md` |
| 判据真源与副本数（哪件事归谁定） | `docs/判据登记表.md` |
| 已裁定 / 被推翻的判据与约定 | `docs/adr/`（README 有索引与 6 问） |
| 审计进度 / 区域清单 / 灯 | `daily/架构日志/index.md`（脚本产物） |
| 技术债 | `daily/架构日志/债务.md`（走 `scripts/debt.mjs`） |
| 原版 vs 重写 UI 对照（8 节点 / 面板） | `docs/12-UI对照表.md`（脚本产物） |
| 缺口登记：UI / 功能 / 数据 | `docs/13-原版功能缺口登记.md` · `docs/14-功能层缺口登记.md` · `docs/15-数据与持久化缺口登记.md` |
| **缺口落点与写法定稿**（放哪层 / 哪个文件 / 怎么验） | `docs/16-缺口落点与写法定稿.md` ★ |
| 换机 / 交接继续 | `docs/归档/17-交接-HANDOFF.md` |
| 原版前端源码参考（可读 JSX + shared.js） | `docs/豆包画布原版参考/`（`expanded_components/`） |
| 逆向事实层（事实，非判据） | `docs/00` ~ `docs/10` |
| 后端继承约束 / 踩坑 | `docs/10-后端踩坑与继承约束.md` |

> **读债 / 想引用"仓里一直这么写"之前，先过 `docs/adr/` 索引** —— 既有约定可能正是要消灭的对象。

---

## 八、工作流（`.codebuddy/commands/`）

按任务性质选：

| 场景 | 命令文件 |
|---|---|
| 分配任务 / 写任务书 | `任务安排工作流.md` |
| 写新业务代码（契约→数据流→测试→施工） | `写代码4步法.md` / `架构师写新业务代码.md` |
| 改既有代码 | `架构师改码7步法.md` |
| 定架构 / 求最优 | `架构5步法.md` / `架构师心法.md` |
| 登记技术债 | `债务登记5步法.md` |
| 排查 bug | `排查5步法.md` / `画布debug法.md` |
| 测试门禁 | `测试门禁5步法.md` |
| 系统治理 | `系统治理5步法.md` |
| 写 ADR / 守护 ADR | `ADR守护者.md` |
| 记录流水账 / 校准日志 | `记一下.md` |
| 地基前瞻 / 推演 | `地基前瞻5步法.md` / `推演5步法.md` |
| 代码生命周期 / PRD / Skill | `代码生命周期工作流.md` / `PRD5步法.md` / `Skill5步法.md` |
| UI 细节自检 / 作图 | `UI细节8查.md` / `作图3步法.md` / `作图4步法.md` |
| Mac 依赖适配 | `Mac依赖适配5步法.md` |

**动手前先定数据流**：走既有唯一入口（端口 + adapters 唯一实现 + state 唯一写入点 + `constants/text.ts` 文案 + `stable/contracts/` 键与格式），**禁止自建旁路**；**禁裸字面量**（先查 §五 登记源）。文件移动/改名走 `scripts/mv-sync-refs.mjs`。

---

## 九、禁区速查

- ❌ `core/**` 里写 `window` / `Date.now()` / `Math.random()` / `localStorage` / `setTimeout`。
- ❌ `ui/**` 直接 `window.api` 或 import `adapters`。
- ❌ `core/usecases` / `adapters` 写 store。
- ❌ `core/usecases` 里出现 `message: '…'` 字面量（只能转发 `e.message` / 上游 Result）。
- ❌ 空 `catch {}` / 无形参 `.catch`。
- ❌ `stable` import 上层；站点选择器泄进 `core`/`state`/`ui`/`stable`。
- ❌ 硬编码色值（`tokens.css` 之外）、`doubao-*` 键名字面量（`stable/contracts/` 之外）。
- ❌ 手写 `债务.md` / `index.md` / ADR 索引（都是脚本产物）；手写 `mv` 改文件。
- ❌ `ui/**` 下写测试文件。
- ⚠️ 调用不存在的宿主方法 `lovartChromeEval`（Chrome CDP 采集通道是**死代码**，见 `docs/09-校验记录.md` C2）。
- ⚠️ `saveImageSync` / `activateProjectStorage` 是 **`sendSync`**，**不得 `await`**。
- ⚠️ 站点层**零注入**（不得用 JS 改 `navigator` / `screen` / `webgl`）、**不开自动轮询抓取**（`SitePort.scan` 必须显式调用）。唯一例外 = 输入锁（`site/shared/inputLock.ts`：只挂监听 + 提示条，不改环境）。
- ⚠️ **验证脚本吃 `dist/`** —— 改了 `src/` 必须 `npx vite build` 再跑 `scripts/verify-*.cjs`，否则验的是旧代码。

---

## 十、目录速览

```
app/
├── src/
│   ├── lib/         无状态工具（hash / phash / url / image / text / time / selection / hostEnv / editorText）
│   ├── constants/   业务常量 + 文案（SSOT）
│   ├── styles/      tokens.css(SSOT) / reset.css / theme.css
│   ├── stable/      contracts(20键+值形状) · model(数据形状) · protocols(img/vid) · migrations(2 条)
│   ├── core/        model · rules(纯函数 20+) · usecases(编排 14) · ports(clock/host/site/storage/backendPage)
│   ├── adapters/    host(electron|mock) · site(doubao|dola|lovart|tapnow|gpt|shared) · media · storage/local · clock
│   ├── state/       store(zustand5) · slices · persist · persistKeys · subscriptions · generate · batchSend · analyze · accountOps · context
│   ├── ui/          shell · pages · canvas · nodes(8类) · edges · panels · common(共享交互件)
│   └── bootstrap/   main.tsx(StrictMode) · container.ts(唯一接线处) · hydrate.ts
├── electron/        ★ 宿主壳（继承约束；按成本判据可改，默认不动）
├── public/mediapipe/ 人脸检测模型 + wasm（随仓库走，勿删）
├── scripts/         治理与验证脚本（arch-index / debt / adr / probe / check-* / verify-* / ui-spec）
├── docs/            逆向事实(00~10) · 架构定稿(11) · UI对照(12) · 缺口登记(13~15) · 落点定稿(16) · DATAFLOW · 判据登记表 · 豆包画布原版参考 · 归档
├── daily/架构日志/  审计轮次 + 债务索引
├── tests/           fixtures（含 real-sample 真实样本）
└── .codebuddy/      commands(工作流) + skill（**非临时缓存，勿删**）
```

> `electron/`、`docs/`、`.codebuddy/`、`public/**` 已排除出 eslint 范围；`tsconfig` 的 `include` 只有 `src`。

### 后端边界（成本优先）

`electron/**` **不是绝对冻结**：**若动后端比动前端便宜，就动后端**。改后端的 3 条硬性约束：① 不破坏已有方法签名（只新增/重载）；② 不改变数据格式（localStorage / 磁盘 / 协议）；③ **改动必须回写 `docs/05-配置契约层.md`**。
