# AGENTS.md · 豆包画布（渲染层重写）

> 给 AI 代理的项目说明书：**先读它，再动手**。
> 红线真源 = `docs/11-架构与契约定稿.md`（§三 依赖规则 · §六 契约边界 · §六·五 八原则）；CSS 真源 = `docs/17-CSS规范.md`。本文件**只做索引**，不复述判据正文；冲突以真源为准。

---

## 一、这是什么

- **Electron 桌面无限画布应用**的**渲染层重写**：从还原产物（`_ComponentNN.jsx` / 5,486 行单 store）改为**端口-适配器分层**的 TS/TSX。
- 目标：**行为等价 + 数据兼容**（不是代码等价）。
- 技术栈：React 19 · `@xyflow/react` 12 · zustand 5 · Vite 8 · Vitest 5 · TS 6（strict）· `@mediapipe/tasks-vision`。
- 宿主能力经 `HostPort` 抽象，DEV 走 mock；**无 SSR / RSC**。
- 编号约定：**M0~M14** 里程碑（`docs/16` §7）· **W1~W17** 验收用例（`docs/08`）· **TD-xx** 技术债 · **ADR-xxxx** 判据决议。

---

## 二、常用命令

> **首次上手**：`npm install` → `npx playwright install chromium`（运行时验证要用）→ `npm run check`（应全绿）。`public/mediapipe/` 随仓库走，勿删。

```bash
npm run dev              # Vite 开发服务器（5175）
npm run build            # check + vite build → dist/
npm run check            # ★ 门禁（清单真源 scripts/gates.manifest.json）：typecheck + lint + boundaries + dead-code + gate-vitals + test
npm run gate:status      # 闸开关注态（真源 = manifest 的 `disabled`；闸仍登记，只是被跳过）
npm run gate:off -- <id> # 临时关某道闸（例 `npm run gate:off -- dead-code`）；恢复 `npm run gate:on -- <id>`
npm run lint:gates       # 元层闸（闸的闸）：扫描根存在 + 基数自检 + 申诉口三问
npm run lint:dead-code   # knip 死代码闸（基线「永不复涨」；新增即红）
npm run test             # vitest run
npm run spec:ui          # 生成 docs/12 UI 对照表
npm run pack:win         # 打包（另有 pack:dir / pack:mac / icon）
```

> 改完代码**必跑 `npm run check`**。

治理工具（**走脚本，禁手写产物**）：

```bash
node scripts/arch-index.mjs            # 区域清单/审计进度（--write 重生成 index.md）
node scripts/debt.mjs list             # 技术债（add / resolve / audit 见头注）
node scripts/adr.mjs doctor            # ADR 体检（add --user-approved 落一条）
node scripts/mv-sync-refs.mjs rename|move|move-dir   # 移动/改名（禁手写 mv）
node scripts/probe.mjs                 # 先红后绿探针（闸会咬的凭证）
node scripts/check-dead-code.mjs --update-baseline   # 死代码基线重生成（清偿后跑；有新增会拒绝）
```

---

## 三、分层与依赖铁律

```
L0 lib/constants/styles · L1 stable · L2 core · L3 adapters · L4 state · L5 ui · L6 bootstrap
```

**三条铁律**（`lint:boundaries` 强制）：

1. `core` 不得 import `adapters` / `state` / `ui`。
2. `ui` 不得调 `window.api` / import `adapters`（走 `state → usecases → ports`）。
3. `stable` 不得 import 上层。

其他约束：无依赖环 · `adapters/site/*` 只许 `adapters`/`bootstrap` 依赖（volatile 隔离）· `core` 禁 `react`/`react-dom`/`@xyflow` · 共 10 条 depcruise 规则 · 禁 barrel files。

### 状态与接线约定

- **单 slice ≤ 300 行（建议 · 人工把关）· state 字段 ≤ 25 个 · action 只编排**（业务在 `core/rules`/`usecases`）；~~`max-lines` 400 由 eslint 强制~~ **2026-10-11 已关闭**（行数是代理指标；留痕见 `eslint.config.js`）。
- `state/store.ts` 的 `setPartial` = **画布 → 工程（`projects[activeId].data`）的唯一镜像点**。
- `state/subscriptions.ts` = **宿主事件订阅的唯一写入点**。

---

## 四、职责归位八原则（`docs/11` §六·五）

| # | 原则 | 要点 |
|---|---|---|
| 1 | 谁拥有状态谁写 | 只有 `state/**` 写 store；`usecases`/`adapters` 绝不；`ui` 只调 state action。 |
| 2 | 事件只订阅转发 | adapter 暴露 `subscribeXxx(cb): () => void`；**state 是唯一写入点**。 |
| 3 | 端口只有类型 | `core/ports/**` 零实现；实现只在 `adapters/**`。 |
| 4 | 纯归 core，脏归 adapters | `core/**` 无 `window`/`Date.now()`/`Math.random()`/`localStorage`/`setTimeout`。 |
| 5 | SSOT | 文案/常量/token/键名唯一真源，见 §五。 |
| 6 | 错误透传 | 生产者产错、消费者只转发；禁吞错/改 message/编 reason/兜底造错。 |
| 7 | 只测纯逻辑 | 见 §六。 |
| 8 | 三振出局 | 同段代码第 3 次出现 ⇒ 抽出。 |

交付契约（`core/model/result.ts`）：`{ ok:true, value } | { ok:false, reason, message }`（`message` = 原始原文）。

> **机器守卫的载体**（2026-10-11 调整）：原则 4（core 禁宿主/时间/随机）· 原则 5（冻结契约字符串）· 原则 6（usecases 禁自造 message）· TD-05-1（禁直调 `window.api`）**已由 eslint（AST）承载**；原则 7（测试边界）由 eslint 原生规则承载。**grep 型 `check-invariants.cjs` 已退役**（行级文本匹配 → 形态漏检，见 TD-14-1/14-2/04-4/16-9）。

**React 规约**：`<StrictMode>` + `eslint-plugin-react-hooks` 为机器强制（`docs/11` §9.1）；**渲染期禁 `Date.now()` / `Math.random()`**（收进 `useState(() => …)`）。

---

## 五、SSOT 真源清单（禁裸字面量）

| 内容 | 唯一真源 | 机器守卫 |
|---|---|---|
| 20 个 localStorage 键名（`LsKey`） | `src/stable/contracts/keys.ts` | eslint（`doubao-*` 字面量选择器） |
| 20 键的值形状 | `src/stable/contracts/lsValues.ts` | 编译期穷尽断言 |
| 工程 JSON / 快照格式 | `src/stable/contracts/schemas.ts` | — |
| `img://` 协议规则（sha1 前 16 位 + `?w=`） | `src/stable/protocols/img.ts` | — |
| 数据形状（Node/Project/Account/Gen） | `src/stable/model/` | — |
| 数据归一（落盘前外置 / 启动归位） | `src/stable/migrations/` | — |
| UI 文案 / 失败 label / 错误横幅映射 | `src/constants/text.ts` | — |
| 模型表 / 风格预设 | `src/constants/models.ts` · `stylePresets.ts` | — |
| 失败分类 kind + label（14 项） | `src/constants/failure.ts` | 表驱动单测 |
| 失败分类表 + 决策 | `src/core/rules/failure.ts` | 表驱动单测 |
| 设计 token（颜色 / 间距 / 圆角） | `src/styles/tokens.css` | 人工（`docs/17-CSS规范.md`；机器闸已按「只留非常可靠的」弃用） |
| 端口类型 | `src/core/ports/`（`clock`/`host`/`site`/`storage`/`backendPage`） | 人工（原 `ports-type-only` 会误伤合法 `as const`，已弃） |
| 依赖方向 | `.dependency-cruiser.cjs`（10 条） | `npm run lint:boundaries` |

**样式**：原生 CSS + CSS Modules；ReactFlow 只用官方 `--xy-*` 变量（不写 `.react-flow__*` 覆写）；组件禁硬编码色值/间距，只引用 `var(--...)`。

★ **「能一种的别搞两种」**（2026-10-12 用户裁定 —— 界面统一的总原则）：
同一形态**有 N 份实现时收成一份**，**不要**用「变体 / 分档 / 别名 / 本地覆盖」去保留**不影响功能**的差别 ——
那只会**越漂移越不统一**。判据一句话：**它影响用户什么功能吗？** 不影响 ⇒ **并掉**。
落点：**节点 → `ui/nodes/NodeShell.tsx`**（8 类节点全走它）· **面板 / 弹窗 → `ui/common/PanelShell.tsx`**
（★ **遮罩只有一种**、**关闭钮只有一种 `✕`**、头只有一种）· 样式真源 → `ui/common/shared.module.css`
（token 四层契约见 `docs/17-CSS规范.md`）。⚠️ 面板模块**只许保留尺寸 / 定位**（`className`），
**禁止用本地 `padding` 等覆盖表达差异**（构建产物里使用方的规则在真源之前 ⇒ 覆盖**不生效且不报错**）。

> ★ **CSS 唯一契约 = `docs/17-CSS规范.md`**：token 四层（L1 原始值 → L2 语义 → L3 组件旋钮）· 新样式放哪 · `composes` 规则 · 例外表。**那份文件可改**（改它 + 写理由，别绕过它自造）。

---

## 六、测试边界

- 只测纯逻辑：`core/rules` · `core/usecases`（注入 mock）· `stable/migrations` · state 纯 reducer。
- 不测 `adapters/**`；`ui/**` 不写组件测试（假守卫）。
- 测试位置 `src/**/tests/**/*.test.ts`（Vitest, node）；`ui/` 与 `adapters/` 下不得有测试文件。
- UI 用端到端冒烟验（`scripts/verify-*.cjs`）。
- 断言红线：**实现一变必红**；自证式断言（仅验不崩 / mock 被调用）无效。
- ⚠️ **闸绿 ≠ 健康**：闸只查形式。已知盲区 —— `state/**` 可藏测试（原则 7 只拦 `ui`/`adapters`）· depcruise 拦不到**类型重复** · 已弃的 grep 型不变量（色值 / 端口纯净 / `.catch` 形态）现**无机器守卫**（见 `daily/架构日志/债务.md`）。
- **死代码闸**（`lint:dead-code`，knip `--production`）：只被测试引用的导出 / 文件 / 依赖判死。存量在 `scripts/dead-code-baseline.json`（**永不复涨**：新增即红，清偿后跑 `--update-baseline`）。判死 → 先 `node scripts/mv-sync-refs.mjs refs <file>` 顺链查到底再删；判活但消费者在分析边界外（`scripts/**` · `electron/**`）→ 在**声明处**打 `@public 跨边界消费者：<路径>`（机器核验三条件）。详见 `scripts/check-dead-code.mjs` 头。
- ⚠️ **测试复用 worker**（`vite.config.ts` 的 `test.isolate: false`，省去每文件 spawn 开销）：**新增模块级可变状态前必须先清理**（否则跨文件泄漏 → flaky）。有意保留的进程级状态见该配置注释。

---

## 七、文档地图（每份只干一件事）

| 想知道什么 | 读哪 |
|---|---|
| **物理红线 / 依赖规则 / 契约边界 / 八原则** | `docs/11-架构与契约定稿.md` ★ |
| 实现进度 / 里程碑验收 | `docs/00-进度台账.md` |
| 数据流现状（谁经过谁） | `docs/DATAFLOW.md` |
| 判据真源与副本数 | `docs/判据登记表.md` |
| 已裁定 / 被推翻的判据 | `docs/adr/` |
| 审计进度 / 技术债 | `daily/架构日志/`（`index.md` · `债务.md`，均脚本产物） |
| 原版 vs 重写 UI 对照 | `docs/12-UI对照表.md`（脚本产物） |
| 缺口登记：UI / 功能 / 数据 | `docs/13` · `docs/14` · `docs/15` |
| **缺口落点与写法定稿**（放哪层 / 怎么验） | `docs/16-缺口落点与写法定稿.md` ★ |
| **CSS 唯一契约** | `docs/17-CSS规范.md` ★ |
| **待执行的移植 / 改造计划** | `docs/plan/` ★ |
| 最新交接 / 换机说明 | `docs/归档/19-交接-HANDOFF.md` · `docs/归档/18-交接-HANDOFF.md` · `docs/归档/17-交接-HANDOFF.md` |
| UI 预演（CSS/token） | `docs/mockup/` |
| 原版前端源码参考（可读 JSX） | `docs/豆包画布原版参考/expanded_components/` |
| 逆向事实层（事实，非判据） | `docs/00` ~ `docs/10`（后端坑见 `docs/10`） |

> **读债 / 想引用"仓里一直这么写"之前，先过 `docs/adr/` 索引** —— 既有约定可能正是要消灭的对象。

### 写作口径：**只写当下，不留过程**（2026-10-12 用户裁定）

注释与文档**只回答「现在是什么 / 为什么必须这样」**，不回答「谁改过、原本写什么」。

| | |
|---|---|
| ❌ **改动史** | `原写 X` · `此前这里写…` · `已更正` · `本行原文是错的` · `XX 已结` · 日期 + 「收口 / 更正」 |
| ❌ **过程状态** | 「本轮迁移」「已切到…」「此前 N 处」—— 状态流转归 `债务.md`，改动过程归轮次日志 |
| ✅ **改了就写新的** | 直接把**当前口径**写上去；**不写"原来是别的"** |
| ✅ **依据照留** | 源出处（`原 \`Pk\` shared.js:26629`）· 判据 · 不变量 · 边界 · 债号（可追溯）—— 这些是「为什么」，**不是过程** |

**为什么**：改动史对读者**零信息量**（读一眼代码就知道现状），却要跟着代码一起维护，且会把"当前真相"埋进叙述里 ⇒ **弊大于利**。

**归属**：改动过程 → `daily/架构日志/<NN>-*.md`；债的状态流转 → `债务.md`。**都别往注释里搬**。

**判定**：把这句话删掉，会不会让人**误判当前代码**？不会 ⇒ **删**。

```ts
// ❌ 原写 `raw.ok === false` ⇒ fail-open，已更正（TD-04-5）
// ✅ 必须用 `ok !== true`：漏 `ok` 不能当成功（后端每条 return 都带 `ok` · TD-04-5）
```

---

## 八、工作流（`.codebuddy/commands/`）

| 场景 | 命令文件 |
|---|---|
| 分配任务 / 写任务书 | `任务安排工作流.md` |
| 写新业务代码 | `写代码4步法.md` / `架构师写新业务代码.md` |
| 改既有代码 | `架构师改码7步法.md` |
| 定架构 / 求最优 | `架构5步法.md` / `架构师心法.md` |
| 登记技术债 | `债务登记5步法.md` |
| 排查 bug | `排查5步法.md` / `画布debug法.md` |
| 测试门禁 / 系统治理 | `测试门禁5步法.md` / `系统治理5步法.md` |
| 写 / 守护 ADR | `ADR守护者.md` |
| UI 细节自检 / 作图 | `UI细节8查.md` / `作图3步法.md` / `作图4步法.md` |
| 地基前瞻 / 推演 / PRD / Skill | `地基前瞻5步法.md` / `推演5步法.md` / `PRD5步法.md` / `Skill5步法.md` |
| 记录流水账 | `记一下.md` |

**动手前先定数据流**：走既有唯一入口（端口 + adapters 唯一实现 + state 唯一写入点 + `constants/text.ts` 文案 + `stable/contracts/` 键与格式），**禁止自建旁路**；**禁裸字面量**（先查 §五）。文件移动/改名走 `scripts/mv-sync-refs.mjs`。

**两条纪律**（都是踩出来的）：

1. **能抄就别推 —— ★ 源代码就是真源**（2026-10-11 用户裁定，**适用于一切"不知道"**）：
   原版可读源码在 `docs/豆包画布原版参考/expanded_components/`。
   **凡是不确定的**（不只是 UI handler / props / 默认值）—— **行为、节奏、文案、字段、分支、
   该不该有、该放哪、算不算违规** —— **一律先去这里读，再照抄（逐字对源）**；
   **别自己推理，也别先问人**。
   ⚠️ 它**同时压住 M4**：注释与文档会漂移，**原版代码不会**。
   ⚠️ 只有**读不到**（原版没有这段 / 不可读）时，才轮到"问用户"或"自己设计"。
2. **先读文档再动手** —— `docs/16` 已对每项写好**落点 / 写法 / 判据 / 验法**。

**完成定义（DoD）**：① 跑 `npm run check` 全绿（**改样式另按 `UI细节8查` 人工跑判据**）；② 给闸留「**先红后绿**」凭证（`scripts/probe.mjs`）；③ 每轮往 `docs/16` 追加一条（落点 / 判据 / 教训）；④ **判据 B5：不留「落了但没人调」**（没调用方就先别落，或同批落调用方）。

---

## 九、禁区速查

- ❌ `core/**` 里写 `window` / `Date.now()` / `Math.random()` / `localStorage` / `setTimeout`。
- ❌ `ui/**` 直接 `window.api` 或 import `adapters`。
- ❌ `core/usecases` / `adapters` 写 store。
- ❌ `core/usecases` 里出现 `message: '…'` 字面量（只能转发 `e.message` / 上游 Result）。
- ❌ 空 `catch {}` / 无形参 `.catch`。
- ❌ `stable` import 上层；站点选择器泄进 `core`/`state`/`ui`/`stable`。
- ❌ 硬编码色值（`tokens.css` 之外）、`doubao-*` 键名字面量（`stable/contracts/` 之外）。
- ❌ 手写 `债务.md` / `index.md` / ADR 索引（脚本产物）；手写 `mv` 改文件。
- ❌ 注释 / 文档里写**过程**（`原写…` · `此前…` · `已更正` · `已结`）—— 只写**当下口径**，改了就写新的（详判据见 §七「写作口径」）。
- ❌ `ui/**` 下写测试文件。
- ⚠️ 调用不存在的宿主方法 `lovartChromeEval`（死代码，见 `docs/09` C2）。
- ⚠️ `saveImageSync` / `activateProjectStorage` 是 **`sendSync`**，**不得 `await`**。
- ⚠️ 站点层**零注入**（不得改 `navigator`/`screen`/`webgl`）、**不开自动轮询**（`SitePort.scan` 必须显式调用）。唯一例外 = 输入锁（`site/shared/inputLock.ts`）。
- ⚠️ **验证脚本吃 `dist/`** —— 改了 `src/` 必须 `npx vite build` 再跑 `scripts/verify-*.cjs`。

---

## 十、目录速览

```
app/
├── src/
│   ├── lib/         无状态工具（hash / phash / url / image / text / time / selection / hostEnv / editorText）
│   ├── constants/   业务常量 + 文案（SSOT）
│   ├── styles/      tokens.css(SSOT) / reset.css / theme.css
│   ├── stable/      contracts(20键+值形状) · model(数据形状) · protocols(img/vid) · migrations(2 条)
│   ├── core/        model · rules(纯函数) · usecases(编排 14) · ports(clock/host/site/storage/backendPage)
│   ├── adapters/    host(electron|mock) · site(doubao|dola|lovart|tapnow|gpt|shared) · media · storage/local · clock
│   ├── state/       store(zustand5) · slices · persist · persistKeys · subscriptions · generate · batchSend · sendQueue · analyze · accountOps · context
│   ├── ui/          shell · pages · canvas · nodes(8类) · edges · panels · common(共享交互件)
│   └── bootstrap/   main.tsx(StrictMode) · container.ts(唯一接线处) · hydrate.ts
├── electron/        ★ 宿主壳（默认不动；按成本判据可改）
├── public/mediapipe/ 人脸检测模型 + wasm（随仓库走，勿删）
├── scripts/         治理与验证脚本（arch-index / debt / adr / probe / check-* / verify-* / ui-spec）
├── docs/            逆向事实(00~10) · 架构定稿(11) · UI对照(12) · 缺口登记(13~15) · 落点定稿(16) · CSS规范(17) · 交接(18) · DATAFLOW · 判据登记表 · 原版参考 · mockup · 归档
├── daily/架构日志/  审计轮次 + 债务索引
├── tests/           fixtures（含 real-sample 真实样本）
└── .codebuddy/      commands(工作流) + skill（**非临时缓存，勿删**）
```

> `electron/`、`docs/`、`.codebuddy/`、`public/**` 已排除出 eslint 范围；`tsconfig` 的 `include` 只有 `src`。

**读代码入口**：`bootstrap/main.tsx` → `container.ts`（唯一接线）→ `hydrate.ts`；状态在 `state/store.ts`；站点注册在 `adapters/site/registry.ts`。
**别名 / 构建**：`@/` → `src`（vite + tsconfig）；`base:'./'`（Electron 加载）、`emptyOutDir:false`（旧哈希会累积，需手工清 `dist/`）；`dist/` 是 `scripts/verify-*.cjs` 的输入。**真实样本**：`tests/fixtures/real-sample/`。

### 后端边界（成本优先）

`electron/**` **不是绝对冻结**：**若动后端比动前端便宜，就动后端**。3 条硬约束：① 不破坏已有方法签名（只新增/重载）；② 不改变数据格式；③ 改动**回写 `docs/05-配置契约层.md`**。
