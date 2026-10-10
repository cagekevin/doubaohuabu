# AGENTS.md · 豆包画布（渲染层重写）

> 本文件是**给 AI 代理的项目说明书**：先读它，再动手。
> 红线真源 = `docs/11-架构与契约定稿.md`（§三 依赖规则 · §六 契约边界 · §六·五 职责归位八原则）。本文件**只做索引与摘要，不复述判据正文**；冲突以 `docs/11` 为准。

---

## 一、这是什么

豆包画布是 **Electron 桌面无限画布应用**。本仓库 `app/` 是它的**渲染层重写**：

- 从**还原产物**（原 `_ComponentNN.jsx` / 5,486 行单 store）重写为 **端口-适配器（Hexagonal）分层**的 TS/TSX 工程。
- 目标：**行为等价 + 数据兼容**（不是代码等价）。
- 宿主能力经 `HostPort` 抽象；**默认不依赖 Electron**（DEV 下走 mock）。
- 技术栈：React 19 + `@xyflow/react` 12 + zustand 5 + Vite 8 + Vitest 5 + TypeScript 6（strict）。
- **无 git 仓库**（还原产物工程）；**无 SSR / RSC**。

### 当前状态（2026-10-10）

| 里程碑 | 内容 | 状态 |
|---|---|---|
| M0 | 骨架 + 契约 + 规约 | ✅ |
| M1 | 数据层（迁移 / 持久化 / 水合） | ✅ |
| M2 | 画布（ReactFlow + 8 类节点） | ✅ |
| M3 | 素材与媒体（去重 / 缩略图 / 遮脸） | ✅ |
| M4 | 宿主真实实现（`adapters/host/electron`） | ✅ |
| M5 | 生成（网页 / API 双通道） | ✅ |
| M6 | 站点适配（doubao / dola / lovart） | ✅ |
| M7 | 端到端 | ✅ |

进度真源：`docs/00-进度台账.md`（含每个里程碑的验收输出与"抓出的真问题"）。

### 已知缺口（照实列出，勿当已完成）

- W3 图片外置幂等的**磁盘侧**、W4 的 `projects-autobackup.json` 同步 → 需**在 Electron 内**验证（mock 是 no-op）。
- W6 连线环检测的 **UI toast 接线**未做运行时验证（单测已过）。
- `tapnow` / `gpt` 站点适配器**未实现**（注册表缺项 ⇒ 调用方报明确错误，不是静默失败）。
- 豆包后台视图（原 `_Component43`，3304 行）只实现了「webview 容器 + 发送」，**未做后台视图 UI**。
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
```

> **改完代码必跑 `npm run check`。** 它是 5 道静态闸的合体，任一不过即为失败。

治理工具（**走脚本，禁手写产物**）：

```bash
node scripts/arch-index.mjs            # 区域清单/审计进度（--write 重生成 daily/架构日志/index.md）
node scripts/debt.mjs list [--area 07] # 读技术债；add / resolve / audit 见脚本头注
node scripts/adr.mjs doctor            # ADR 一键体检（list/audit/hygiene/refs/extract-detours）
node scripts/adr.mjs add --title "…" --conclusion "…" --user-approved   # 落一条 ADR
node scripts/mv-sync-refs.mjs rename|move|move-dir   # 移动/改名文件（自动同步 import，禁手写 mv）
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
| 工程 JSON / 快照格式 | `src/stable/contracts/schemas.ts` | 同上 |
| `img://` 协议规则（sha1 前 16 位 + `?w=`） | `src/stable/protocols/img.ts` | — |
| 数据形状（Node/Project/Account/Gen） | `src/stable/model/` | — |
| UI 文案 / 失败 label / 错误横幅映射 | `src/constants/text.ts` | — |
| 模型表 / 风格预设 | `src/constants/models.ts` · `src/constants/stylePresets.ts` | — |
| 失败分类（14 项）+ 决策 | `src/core/rules/failure.ts` | `原则4/core-purity` + 表驱动单测 |
| 设计 token（颜色 / 间距 / 圆角） | `src/styles/tokens.css`（CSS 变量） | `原则5/ssot-color`（字面量色值只许在 `tokens.css`，例外 `src/constants/**` 供 canvas 2D 用色） |
| 端口类型（4 个） | `src/core/ports/` | `原则3/ports-type-only` |
| 依赖方向 | `.dependency-cruiser.cjs` | `npm run lint:boundaries` |

**样式方案**：原生 CSS + CSS Modules；ReactFlow **只用官方 `--xy-*` CSS 变量**主题化（`src/styles/theme.css`），**不写 `.react-flow__*` 类名覆写**；组件禁硬编码色值 / 间距，只引用 `var(--...)`。

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
| 定架构 / 求最优 | `架构5步法.md` |
| 登记技术债 | `债务登记5步法.md` |
| 排查 bug | `排查5步法.md` / `画布debug法.md` |
| 测试门禁 | `测试门禁5步法.md` |
| 系统治理 | `系统治理5步法.md` |
| 写 ADR / 守护 ADR | `ADR守护者.md` |
| 记录流水账 / 校准日志 | `记一下.md` |

**动手前先定数据流**：走既有唯一入口（4 个端口 + adapters 唯一实现 + state 唯一写入点 + `constants/text.ts` 文案 + `stable/contracts/` 键与格式），**禁止自建旁路**；**禁裸字面量**（先查 §五 登记源）。文件移动/改名走 `scripts/mv-sync-refs.mjs`。

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
- ⚠️ 站点层**零注入**（不得用 JS 改 `navigator` / `screen` / `webgl`）、**不开自动轮询抓取**（`SitePort.scan` 必须显式调用）。

---

## 十、目录速览

```
app/
├── src/
│   ├── lib/         无状态工具（hash / phash / url / image / dom / time）
│   ├── constants/   业务常量 + 文案（SSOT）
│   ├── styles/      tokens.css(SSOT) / reset.css / theme.css
│   ├── stable/      contracts(20键+格式) · model(数据形状) · protocols · migrations
│   ├── core/        model · rules(纯函数) · usecases(编排) · ports(4 端口，只有类型)
│   ├── adapters/    host(electron|mock) · site(doubao|dola|lovart) · storage/local · clock · media
│   ├── state/       store(zustand5) · slices · persist · generate(生成控制器) · context
│   ├── ui/          shell · pages · canvas · nodes(8类) · edges · panels · common(共享交互件)
│   └── bootstrap/   main.tsx(StrictMode) · container.ts(唯一接线处) · hydrate.ts
├── electron/        ★ 宿主壳（继承约束；按成本判据可改，默认不动）
├── scripts/         治理与验证脚本（arch-index / debt / adr / check-* / verify-*）
├── docs/            逆向事实 + 架构定稿 + ADR + DATAFLOW + 判据登记表
├── daily/架构日志/  审计轮次 + 债务索引
├── tests/           fixtures（含 real-sample 真实样本）
└── .codebuddy/      工作流命令 + memory（**非临时缓存，勿删**）
```

> `electron/`、`docs/`、`.codebuddy/` 已排除出 eslint 范围；`tsconfig` 的 `include` 只有 `src`。

### 后端边界（成本优先）

`electron/**` **不是绝对冻结**：**若动后端比动前端便宜，就动后端**。改后端的 3 条硬性约束：① 不破坏已有方法签名（只新增/重载）；② 不改变数据格式（localStorage / 磁盘 / 协议）；③ **改动必须回写 `docs/05-配置契约层.md`**。
