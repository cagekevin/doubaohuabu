# AGENTS.md · 豆包画布（渲染层重写）

> 给 AI 代理的项目说明书：**先读它，再动手**。
> **真源集（只维护这几份）** = `docs/架构与契约定稿.md`（§三 依赖规则 · §六 契约边界 · §六·五 八原则）· `docs/CSS规范.md` · `docs/判据登记表.md` · `docs/DATAFLOW.md` · `docs/adr/`（判据决议**完整系统**）。**其余文档一律是参考资料**。本文件**只做索引**，不复述判据正文；冲突以真源为准。

---

## 一、这是什么

- **Electron 桌面无限画布应用**的**渲染层重写**：从还原产物（`_ComponentNN.jsx` / 5,486 行单 store）改为**端口-适配器分层**的 TS/TSX。
- 目标：**行为等价 + 数据兼容**（不是代码等价）。
- 技术栈：React 19 · `@xyflow/react` 12 · zustand 5 · Vite 8 · Vitest 5 · TS 6（strict）· `@mediapipe/tasks-vision`。
- 宿主能力经 `HostPort` 抽象，DEV 走 mock；**无 SSR / RSC**。
- 编号约定：**M0~M14** 里程碑（`docs/架构与契约定稿.md` §十）· **W1~W17** 验收用例 · **TD-xx** 技术债 · **ADR-xxxx** 判据决议（`docs/adr/`）。

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
npm run spec:ui          # 生成 UI 对照表（产物）
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
npm run css -- <命令>                  # ★ CSS 效率工具箱（**手动、非闸**）：
                                       #   check [名称] 诊断（override/missing/order/dead/dupe/near/vars/hard；不填=全跑）
                                       #   show <类> 一个类全貌（定义 · composes 链 · 消费者 · 最终生效声明）
                                       #   rename <旧> <新> [--write] 三处同步改名 · stats 总览
                                       #   全局开关：--json · --top N · --changed（只报 git 改动文件）
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

## 四、职责归位八原则

> **判据正文 + 机器守卫载体 = `docs/架构与契约定稿.md` §六·五**（谁拥有状态谁写 · 事件只订阅转发 · 端口只有类型 · 纯归 core 脏归 adapters · SSOT · 错误透传 · 只测纯逻辑 · 三振出局）。**本文件不复述**。

交付契约（`core/model/result.ts`）：`{ ok:true, value } | { ok:false, reason, message }`（`message` = 原始原文）。

**React 规约**：`<StrictMode>` + `eslint-plugin-react-hooks` 为机器强制（`docs/架构与契约定稿.md` §9.1）；**渲染期禁 `Date.now()` / `Math.random()`**（收进 `useState(() => …)`）。

---

## 五、SSOT（禁裸字面量）

> ★ **每件事的唯一真源 + 机器守卫 = `docs/判据登记表.md`**（那张表**只在那份文件里**，本文件不复述）。要用某个常量 / 键名 / 文案，先去那里看它归谁。

**铁律**：**禁裸字面量** —— 文案 / 常量 / token / 键名 / 依赖方向一律引真源。`core/usecases` 禁自造 `message` 字面量。

**样式**：唯一契约 = **`docs/CSS规范.md`**（token 四层 · 新样式放哪 · `composes` 规则 · 例外表；**那份文件可改** —— 改它 + 写理由，别绕过它自造）。
原生 CSS + CSS Modules；ReactFlow 只用官方 `--xy-*` 变量（不写 `.react-flow__*` 覆写）；组件禁硬编码色值 / 间距，只引用 `var(--...)`。

★ **「能一种的别搞两种」**（用户裁定 · 界面统一的**总原则**）：同一形态有 N 份实现 ⇒ **收成一份**；**不要**用「变体 / 分档 / 别名 / 本地覆盖」保留**不影响功能**的差别。判据一句话：**它影响用户什么功能吗？** 不影响 ⇒ **并掉**。
落点：**节点 → `ui/nodes/NodeShell.tsx`**（8 类全走它）· **面板 / 弹窗 → `ui/common/PanelShell.tsx`**（**遮罩只有一种 · 关闭钮只有一种 `✕`**）。

---

## 六、测试边界

- 只测纯逻辑：`core/rules` · `core/usecases`（注入 mock）· `stable/migrations` · state 纯 reducer。
- 不测 `adapters/**`；`ui/**` 不写组件测试（假守卫）。
- 测试位置 `src/**/tests/**/*.test.ts`（Vitest, node）；`ui/` 与 `adapters/` 下不得有测试文件。
- UI 用端到端冒烟验（`scripts/verify-*.cjs`）。
- 断言红线：**实现一变必红**；自证式断言（仅验不崩 / mock 被调用）无效。
- ⚠️ **闸绿 ≠ 健康**：闸只查形式。已知盲区 —— `state/**` 可藏测试（原则 7 只拦 `ui`/`adapters`）· depcruise 拦不到**类型重复** · 已弃的 grep 型不变量（色值 / 端口纯净 / `.catch` 形态）现**无机器守卫**。
- **死代码闸**（`lint:dead-code`，knip `--production`）：只被测试引用的导出 / 文件 / 依赖判死。存量在 `scripts/dead-code-baseline.json`（**永不复涨**：新增即红，清偿后跑 `--update-baseline`）。判死 → 先 `node scripts/mv-sync-refs.mjs refs <file>` 顺链查到底再删；判活但消费者在分析边界外（`scripts/**` · `electron/**`）→ 在**声明处**打 `@public 跨边界消费者：<路径>`（机器核验三条件）。详见 `scripts/check-dead-code.mjs` 头。
- ⚠️ **测试复用 worker**（`vite.config.ts` 的 `test.isolate: false`，省去每文件 spawn 开销）：**新增模块级可变状态前必须先清理**（否则跨文件泄漏 → flaky）。有意保留的进程级状态见该配置注释。

---

## 七、文档地图（**结果只有一份**）

> ★ **判据**：**下一个 AI 干活时会不会打开它**。会 ⇒ 它是「结果」，**全库只有一份**，要维护；不会 ⇒ 它是「过程」。
> ⛔ **同一个结果不许抄到第二处** —— 别处**只许写指针**（`见 docs/XX`）。**改一个结果只改一处**；要改两处以上就是抄了副本。

### 7.1 真源（**唯一载体，要维护**）

| 想知道什么 | 读哪 |
|---|---|
| **物理红线 / 依赖规则 / 契约边界 / 八原则** | `docs/架构与契约定稿.md` ★ |
| **CSS 唯一契约** | `docs/CSS规范.md` ★ |
| **每件事归谁定 + 载体几份** | `docs/判据登记表.md` ★ |
| **谁经过谁**（数据流） | `docs/DATAFLOW.md` ★ |
| **已裁定 / 被推翻的判据**（**完整系统**：状态机 · 落一条 6 问 · 审计） | `docs/adr/` ★（走 `adr.mjs`，禁手写索引） |
| 入口 / 铁律 / 命令 / 本表 | `AGENTS.md`（本文件 = **索引**，不复述判据正文） |

> ★ **真源集 = 上表 6 行**（`架构与契约定稿` · `CSS规范` · `判据登记表` · `DATAFLOW` · `adr/` + 本入口）。**其余文档一律是参考资料**。
> **读债 / 想引用"仓里一直这么写"之前，先过 `docs/adr/` 索引** —— 既有约定可能正是要消灭的对象。

> **其余文档**（过程记录 · 缺口登记 · UI 对照 · 后端契约 · 原版参考材料 …）**一律是参考资料** —— 可引，**不可当真源**；本索引**不复述、也不逐个列它**。



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
| **删 + 做**（清障 —— 删与做必须同批） | `删.md` ★ |

**动手前先定数据流**：走既有唯一入口（端口 + adapters 唯一实现 + state 唯一写入点 + `constants/text.ts` 文案 + `stable/contracts/` 键与格式），**禁止自建旁路**；**禁裸字面量**（先查 §五）。文件移动/改名走 `scripts/mv-sync-refs.mjs`。

**两条纪律**（都是踩出来的）：

1. **能抄就别推 —— ★ 源代码就是真源**（2026-10-11 用户裁定，**适用于一切"不知道"**）：
   原版可读源码在 `docs/豆包画布原版参考/expanded_components/`。
   **凡是不确定的**（不只是 UI handler / props / 默认值）—— **行为、节奏、文案、字段、分支、
   该不该有、该放哪、算不算违规** —— **一律先去这里读，再照抄（逐字对源）**；
   **别自己推理，也别先问人**。
   ⚠️ 它**同时压住 M4**：注释与文档会漂移，**原版代码不会**。
   ⚠️ 只有**读不到**（原版没有这段 / 不可读）时，才轮到"问用户"或"自己设计"。
2. **先读真源再动手** —— 落点看 `docs/判据登记表.md`、判据看 `docs/架构与契约定稿.md`、链路看 `docs/DATAFLOW.md`。

### ★★ 用 BUILD-SPEC 定位源 —— **动手前的第一步，别直接 grep 43545 行**

原版可读源码是 `shared.js`（**43545 行**）+ **116 个 `.jsx`**。按符号直接 grep，一个名字常常牵出多个文件、几千行 ——
**这是整个流程里最贵的一步**，也是"照抄"能不能落地的瓶颈。

`docs/豆包画布原版参考/outputs/BUILD-SPEC/` 就是为这一步做的**按主题切片 + 带源行号的索引**：
把"该读哪一段"从**几分钟压到一步**，并且**组件函数体与 `shared.js` 的全部定义都已原文内联**（不是签名、不是摘要）。

| 你要找什么 | 打开哪 | 怎么用 |
|---|---|---|
| **某个组件的实现**（含 `sendPayload` / 事件处理这类**组件内**函数） | `05-组件/组件/<组件名>.md` | 一组件一文件：**规格 + 按钮解析链 + 源码原文**。`grep -n '## 源码原文'` 之后就是逐字原文 ⇒ **组件侧不用回 `inputs/`** |
| **`shared.js` 的页面脚本 / 纯 helper**（`cD` · `_a` · `uD` · `Ap` · `vD` · `_0` …） | `10-shared工具/99-定义索引.md` | 按名字 grep → 拿到**分片 + 源行 + 行数** → 打开分片看 `### <名>（源行 N…）` 下的完整代码块（**2062 个定义全量内联**） |
| **store action** | `04-store/00-索引.md` → 对应分片 | 索引给「**写哪些字段 / 调哪些 action**」，分片给**函数体原文** |
| **★ 防漏调 / 防漏落**（它最大的用处） | `04-store` 的 action 表 ＋ `06-数据流.md` | 「这个 action 该调哪些别的 action」「这个字段的写方/读方是谁」—— **本仓多起缺口就是靠它对出来的**（例：`addImageGenResult` 漏调 `addToLibrary`/`showToast`；`06` 的字段表还漏过两行，所以**只能当线索，真源是源码**） |
| **谁渲染谁 / 谁触发谁** | `05-组件/00-索引.md`（组件树）＋ `05-组件/99-交互链路.md`（246 条链路） | 追「这个按钮最后调到哪个 action」 |
| **回源核对** | 每处都带 `（源行 N）` | spec 只是索引 ⇒ **用它定位，回 `inputs/pipeline_step/project/src/expanded_components/**` 核对**（真源永远是源码） |

**★ 铁律：读 spec 之前先跑新鲜度闸**（它防的是「照抄过期蓝图」）：

```bash
cd docs/豆包画布原版参考
node scripts/99-build-spec.cjs    # 过期 ⇒ exit 1 ＋ 点名该补跑哪个脚本；按提示补跑，再重跑它
```

`outputs/*.json` 一旦与源不同步，它会**拒绝生成**并打印「哪个 facts 过期 + 先跑哪个脚本」。
⚠️ **跳过它 = 拿过期 spec 当依据** —— 而错的是**源行号**（照抄会抄到**别的函数**上去）。**闸绿才读。**

**边界（别误用）**：
- **它不是真源**，是二手索引；**别当照写蓝图** —— 它的工程结构（`src/main` + `src/renderer`）与本仓（`electron/` + `src/{core,adapters,state,ui}`）**不同**。
- **它不覆盖全部**：`00-总览.md` 的「**覆盖边界**」写明了 —— **组件看 `05-组件/`，`shared.js` 的任何东西看 `10-shared工具/`**（别以为"125 个组件文件"= `shared.js` 也覆盖了）。
- **minified 局部名**（`n`/`r`/`l`）**不可恢复** ⇒ 照写时按语义改名。

**完成定义（DoD）**：① 跑 `npm run check` 全绿（**改样式另按 `UI细节8查` 人工跑判据**）；② 给闸留「**先红后绿**」凭证（`scripts/probe.mjs`）；③ 每轮往 `daily/架构日志/<NN>-*.md` 追加一条（落点 / 判据 / 教训）；④ **判据 B5：不留「落了但没人调」**（没调用方就先别落，或同批落调用方）；⑤ **债号流转**走 `node scripts/debt.mjs`（别手写账本）＋ **回写三处**：`docs/DATAFLOW.md` 删对应断点句 · `docs/plan/13|14|15` 勾对应行 · `docs/plan/05` 断点表改类（**缺任一处 ⇒ 账立刻过期**）。

**★ 清断点先问「有没有调用方」**（2026-10-13 两次踩到）：本仓的缺口**大量是「件都在、缺接线」** ——
页内脚本落了没消费、纯判据落了没接线。⇒ 别先找"没落的文件"，先 grep 那个能力的**调用方**；
断点绝大多数落在 `state/**`（`core/rules` 的判据往往早就写好了）。

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
- ⚠️ 调用不存在的宿主方法 `lovartChromeEval`（死代码）。
- ⚠️ `saveImageSync` / `activateProjectStorage` 是 **`sendSync`**，**不得 `await`**。
- ⚠️ 站点层**零注入**（不得改 `navigator`/`screen`/`webgl`）、**不开自动轮询**（`SitePort.scan` 必须显式调用）。例外 = 输入锁（`site/shared/inputLock.ts`）＋ Dola 强开（`site/doubao/dolaForce.ts`：**功能层** patch `fetch`/XHR 改报文 `duration`/`model`，**非指纹伪装**）。
- ⚠️ **验证脚本吃 `dist/`** —— 改了 `src/` 必须 `npx vite build` 再跑 `scripts/verify-*.cjs`。

---

## 十、目录速览

分层：`lib/constants/styles`(L0) → `stable`(L1) → `core`(L2) → `adapters`(L3) → `state`(L4) → `ui`(L5) → `bootstrap`(L6)。

| 目录 | 装什么 |
|---|---|
| `src/lib` | **无状态工具**（不碰**宿主**；Web 标准能力工具归**消费层**，仅「≥2 层共用」才留此）—— 见 `docs/架构与契约定稿.md` 原则 4 后半 |
| `src/constants` · `src/styles` | 业务常量 / 文案 / 设计 token（SSOT） |
| `src/stable` | 冻结契约：`contracts`（20 键）· `model`（数据形状）· `protocols` · `migrations` |
| `src/core` | `model` · `rules`（纯函数）· `usecases`（编排）· `ports`（**零实现**） |
| `src/adapters` | 脏活实现：`host`（electron / mock / shared）· `site/*`（volatile）· `media` · `storage` · `clock` |
| `src/state` | store + slices + 落盘 + 订阅（**唯一能写 store 的地方**） |
| `src/ui` | shell · pages · canvas · nodes · edges · panels · common |
| `src/bootstrap` | `main.tsx`（StrictMode）· `container.ts`（**唯一接线处**）· `hydrate.ts` |
| `electron/` | 宿主壳（默认不动；**按成本判据可改**，见下） |
| `scripts/` | 治理与验证脚本 |
| `docs/` | 见 §七（**真源 4 份 + `docs/adr/` 系统**；其余参考资料） |
| `daily/架构日志/` | 审计轮次 + 债务（脚本产物） |
| `tests/` · `public/mediapipe/` · `.codebuddy/` | fixtures（含 real-sample）· 人脸模型（**勿删**）· 工作流（**勿删**） |

> **文件级清单不写在这里**（必漂）—— 看实际目录；`docs/` 的每份装什么见 §七。

> `electron/`、`docs/`、`.codebuddy/`、`public/**` 已排除出 eslint 范围；`tsconfig` 的 `include` 只有 `src`。

**读代码入口**：`bootstrap/main.tsx` → `container.ts`（唯一接线）→ `hydrate.ts`；状态在 `state/store.ts`；站点注册在 `adapters/site/registry.ts`。
**别名 / 构建**：`@/` → `src`（vite + tsconfig）；`base:'./'`（Electron 加载）、`emptyOutDir:false`（旧哈希会累积，需手工清 `dist/`）；`dist/` 是 `scripts/verify-*.cjs` 的输入。**真实样本**：`tests/fixtures/real-sample/`。

### 后端边界（成本优先）

`electron/**` **不是绝对冻结**：**若动后端比动前端便宜，就动后端**。3 条硬约束：① 不破坏已有方法签名（只新增/重载）；② 不改变数据格式；③ 改动**回写后端契约文档**。
