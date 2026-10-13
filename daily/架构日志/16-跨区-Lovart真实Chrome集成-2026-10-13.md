# 16 · 跨区 · Lovart 真实 Chrome 集成（BP-13 ＋ BP-26）· 2026-10-13

> **触发**：用户「继续往下做 `plan/05`·`13`·`14`·`15`」。按 `plan/05` §7 收口口径，取 **④ 依赖链先立链**（BP-13 → BP-26）。
> **口径**：照抄原版 `_Component25`（`shared.js` 组件侧）＋ 后端既有 IPC；纯判据归 `core/rules`，宿主调用归 `AccountPort`，呈现归 UI。
> **性质**：施工（`src/**` 10 文件，含 3 个新文件）＋ 文档回写（`plan/05` · `plan/13` · `plan/14` · `DATAFLOW`）。

---

## 一、回源要点（真源 = `docs/豆包画布原版参考/inputs/`）

| 件 | 源 | 关键事实 |
|---|---|---|
| **唯一消费者** | `_Component25.jsx:229-340` | `ensureLovartChrome` / `syncLovartSession` / `closeLovartChrome` 的**全部调用点都在这里**（全会话条三键）；`_Component25` 的 `<webview>` 那半本仓**早已落**（`BackendView`） |
| **面板条件** | `:359` | `p && t` = `account.type === 'lovart' && isActive`；条在 `<webview>` **之前**（同 Fragment） |
| **提示行** | `:366` | 五档三目（`open` 再分 `alreadyOpen`） |
| **三键禁用** | `:369` / `:372` / `:375` | `opening‖open` · `syncing` · `status !== 'open'` |
| **两处错误行** | `:379` / `:380` | 同步（前缀 `同步失败：`）· 打开（`xD[error]` → `message` → `打开失败`） |
| **错误码表** | `xD` `shared.js:38652-38662` | 9 个码（`no-chrome` / `no-account` / `spawn-failed` / `chrome-no-port` / `chrome-no-ws` / `cdp-connect-failed` / `no-api` / `empty-result` / `exception`） |
| **后端契约** | `preload.js:110-114` · `main.js:2887/2907/2924` · `chrome-cdp.js:156/211` | `ensure` ⇒ `{ok, alreadyOpen?, profileDir?, error?, message?}`；`close` ⇒ `{ok, wasOpen}`；`sync` ⇒ `{ok, count, total}` / `{ok:false, error, message?}`。**后端早已实现**，缺的只是前端调用面 |
| **Lovart 站点地址** | `_p` `shared.js:36769` | `https://www.lovart.ai/zh` —— 同时是 `<webview src>` 与 `ensure` 的初始网址（本仓此前**未声明** ⇒ webview 落 `about:blank`） |
| **★ 判不落（三处）** | `preload.js:103-106` · `main.js:2982` | ① `ensureLovartFirefoxProfile` / `openLovartFirefox` / `removeLovartFirefoxProfile` / `getFirefoxStatus`：**源前端 0 调用**；② `lovartChromeIsOpen`：后端**明写恒返 `{ok:true,open:false}`**（注释：「故意恒返 false：采集统一走内嵌 webview」）⇒ 落它 = 落了没人用；③ `lovartChromeEval`：**后端根本没有这个方法** ⇒ `Lc`/`t$` 的 CDP 档是真死代码（`docs/09` C2 裁定不变） |

---

## 二、施工清单

| 文件 | 改动 |
|---|---|
| `core/ports/host.port.ts` | `AccountPort` 新增 3 方法 ＋ 类型 `LovartChromePayload` / `LovartChromeOpen` / `LovartSessionSync`（**嵌套判别联合**：外层 `Result` = IPC 通没通，内层 = 业务成败） |
| `adapters/host/electron/session.ts` | 三方法实现（**fail-closed** `ok !== true`；后端错误码原样带出，**不吞**） |
| `adapters/host/electron/window-api.d.ts` | 声明 3 个 `window.api` 方法 |
| `adapters/host/mock/index.ts` | 三方法**如实报错**（mock 没有真实 Chrome / profile ⇒ 不假装成功） |
| `adapters/site/lovart/index.ts` | 补 `chatUrl`（= 源 `_p`）—— 同时修好 Lovart `<webview src>`（此前落 `about:blank`） |
| `constants/text.ts` | 新增 `LOVART_SESSION_TEXT`（提示行五档 · 三键 · 两处前缀 · **错误码表 9 条逐字**） |
| `core/rules/lovartSession.ts`（新） | 纯判据：`lovartHint` / `lovartOpenDisabled` / `lovartSyncDisabled` / `lovartCloseDisabled` / `lovartSyncLabel` / `lovartSyncErrorText` / `lovartOpenErrorText` / `lovartOpenErrorOf` |
| `core/rules/tests/lovartSession.test.ts`（新） | 14 例 |
| `state/accountOps.ts` | 3 个转发方法（**单端口调用、无编排** ⇒ 同 `reloadBackend`，不建 usecase）；`closeLovartChrome` 失败 `log.warn` **留痕不吞** |
| `ui/panels/LovartSessionBar.tsx`（新） | 会话条：3 个 handler ＋ 2 档状态 ＋ 折叠（与头部同步） |
| `ui/panels/BackendView.tsx` | `AccountWebview` 改成 Fragment：`type === 'lovart' && active` 时渲染会话条（在 `<webview>` 之前） |
| `ui/panels/BackendView.module.css` | `.webviews` 改**纵向 flex**（会话条是 webview 的流内兄弟）· `.active` 由 `height:100%` 改 `flex:1` · 新增 7 个 `.session*` 类（全走 token） |

---

## 三、度量

| 口径 | 做前 | 做后 |
|---|---|---|
| BP-13 / BP-26 | 待落（**无调用面**） | **已落**（端口 → adapter → 会话条，同批闭环） |
| Lovart `<webview src>` | `about:blank`（适配器未声明 `chatUrl`） | **站点真源** `https://www.lovart.ai/zh`（原 `_p`） |
| 「真实 Chrome」能力入口 | **0**（后端 IPC 有、前端无调用面） | **1**（会话条三键） |
| 错误码 → 文案 | 无（源 `xD` 未移植） | **1 份**（`LOVART_SESSION_TEXT.openError`，9 条） |
| 改动半径 | — | 10 个 `src` 文件（3 新增） |
| 单测 | 1994 | **2008**（111 文件全绿） |

---

## 四、探针凭证（先红后绿 · 一凭证闸的执行面）

三条探针各注入一处**违规**，证明对应判据**真的被测到**（`scripts/probe.mjs`，注入点唯一 + 还原 sha256 自校验）。

**① 提示行的 `alreadyOpen` 档**（注入语义：把 `open` 的两档压成一档）

```
🧪 probe ｜ BP-26 提示行 alreadyOpen 档
   journal: .probe\2026-10-13T09-40-57-498Z
   注入：if (state.status === 'open') return state.alreadyOpen ? t.alreadyOpen : t.opened → if (state.status === 'open') return t.opened;
   先红：退出码 1（期望 1）· expect-out 命中
   ✅ 还原校验通过（1 个文件 sha256 一致）
   后绿：退出码 0（期望 0）
   ✅ 探针成立（先红后绿）
```

**② 「关闭 Chrome」的禁用判据**（注入语义：`status !== 'open'` → 恒 `false`）

```
🧪 probe ｜ BP-26 关闭键禁用判据
   journal: .probe\2026-10-13T09-41-10-666Z
   注入：return state.status !== 'open'; → return false;
   先红：退出码 1（期望 1）· expect-out 命中
   ✅ 还原校验通过（1 个文件 sha256 一致）
   后绿：退出码 0（期望 0）
   ✅ 探针成立（先红后绿）
```

**③ 错误行的三级回落**（注入语义：去掉「错误码表」这一级）

```
🧪 probe ｜ BP-26 错误行三级回落
   journal: .probe\2026-10-13T09-41-21-297Z
   注入：lovartOpenErrorOf(state.error) ?? state.message ?? LOVART_SESSION_TEXT.openFailedFallback → state.message ?? LOVART_SESSION_TEXT.openFailedFallback
   先红：退出码 1（期望 1）· expect-out 命中
   ✅ 还原校验通过（1 个文件 sha256 一致）
   后绿：退出码 0（期望 0）
   ✅ 探针成立（先红后绿）
```

**反向探针（零炸闸）**：`npm run check` → **6 道全绿**（111 文件 / **2008** 测试）—— 本轮碰到的既有测试全绿。
`npm run css -- check --changed` → 本轮新样式 **0 条新增告警**（全走 token；报出的 7 条 `hard` 全在**既有行**）。
「改前已知会失败」的路径：本轮射程内**无**（改前 `check` 即全绿）⇒ 该半条不适用，如实说明。

**测不了的部分（不许拿层面当免死金牌）**：会话条**接线**（三条 IPC 真跑）需要**真实 Chrome ＋ Electron** ⇒ 只能端到端
（与 `BP-32` 同批）。纯判据（提示行 / 禁用 / 错误行 / 错误码表）已由单测 ＋ 三条探针锁住。

---

## 五、交付闸自查（逐闸结论 · 证据唯一落点 = §四）

| 闸 | 结论 | 凭证 |
|---|---|---|
| **一归** · 判据归一 | 提示行 / 禁用 / 文案 / 错误码表**各只 1 份**（纯层 `core/rules/lovartSession` ＋ `constants/text`）；UI **只转发**（零自造文案）；站点 URL 只 1 份（`SitePort.chatUrl`，`BackendView` 与 `ensure` 共用） | `grep -rn "lovartHint\|lovartOpenDisabled" src/` ⇒ 定义 1 · 消费 1 |
| **减一** · 兜底净减 | **未新增兜底**；反而**拆掉 2 处源的空吞**（关闭失败 / 同步后 reload 失败 ⇒ `log.warn` / toast 留痕）。mock 三方法**如实报错**（不假装成功） | §二 · `git diff -U0 -- src \| grep "^+.*catch"` ⇒ 本轮 0 命中 |
| **减二** · 复杂度实减 | 「错误码 → 文案」从**源内联在组件里**收口为**纯层 + 文案表**（可测）；「站点 URL」从**源 6 处三目**收口为 `SitePort.chatUrl` 一处 | §三 度量表 |
| **一诚实** · 失败诚实可见 | 三层失败各归其位：**IPC 故障**（外层 `Result`）· **业务失败**（内层 `{ok:false, error}`，**错误码不丢**）· **降级留痕**（关闭失败 `log.warn`、reload 失败 toast）。**没有一处假成功** | §二 · `session.ts` 的 `ok !== true` fail-closed |
| **零炸** · 防回归防副作用 | 只碰 Lovart 会话条 ＋ 端口新增（**纯新增，无签名改动**）；`.webviews` 改纵向 flex 对无会话条的站点**等价**（webview 仍 `flex: 1` 铺满） | §四 · 反向探针 |
| **一凭证** · 证据可复现 | 三条探针结论块原样粘贴，`--verify-green` 已跑 | §四 |

---

## 六、决策留痕

| # | 决定 | ① 正确性 | ② 职责边界 | ③ 复杂度 | SSOT | 结论 |
|---|---|---|---|---|---|---|
| 1 | **BP-13 与 BP-26 同批落**（不单独落端口） | 判据 B5：**不留「落了但没人调」** —— 三条 IPC 的**唯一消费者**是会话条 | — | 同批 = 一次闭环，不产生过渡态 | — | **做** |
| 2 | 三方法落 `AccountPort`（而非新端口） | 它与 `ensureLovartContainer` 同族（都是"账号的 Lovart 会话"） | 宿主能力归端口；UI 经 `accountOps` | 不新增端口面 | 只 1 份 | **做** |
| 3 | 用**嵌套判别联合** `Result<LovartChromeOpen>` | 外层 = IPC 通没通（可重试/重启），内层 = 业务失败（带**错误码**，用户要看具体指引）—— 压成一层会**丢错误码** | 后端是真相源，前端只转发 | 两层各司其职 | 文案表 1 份 | **做** |
| 4 | 补 `SitePort.chatUrl`（原 `_p`） | 不补则 webview 落 `about:blank`、`ensure` 也没有初始网址 | 站点 URL **只能住适配器** | 一处真源替源内 6 处三目 | 只 1 份 | **做** |
| 5 | 关闭失败 / reload 失败**留痕不吞**（源是空 catch） | 一诚实：失败不能伪装成成功 | 留痕给开发者（`log.warn`）＋ reload 失败给用户（toast） | 拆掉 2 处源兜底 | — | **做**（**有意差异**，已留痕） |
| 6 | 四个 Firefox IPC ＋ `lovartChromeIsOpen` **不落** | 源前端 0 调用 / 后端恒返 `false` ⇒ 落了没人用 | — | — | — | **不做**（登记改判） |
| 7 | `.webviews` 改纵向 flex（`.active` 由 `height:100%` 改 `flex:1`） | 会话条是 webview 的流内兄弟（源同结构）⇒ 不改成 flex 会撑出容器被裁 | 布局归 CSS | 语义更准（"铺满剩余高度"） | — | **做** |

**存在性凭证**：

```bash
grep -n "## 六、决策留痕" daily/架构日志/16-跨区-Lovart真实Chrome集成-2026-10-13.md
```

---

## 七、状态行与教训

- 本区域状态：已验证(有债待还)
- 教训（**契约分层**）：后端把「业务失败」放在**一次成功的 IPC 调用**里 ⇒ 若把它压进外层 `err`，
  **错误码就丢了**，`xD` 那张文案表（9 条具体指引）随即变成死表。**两层都要留** —— 这是本仓
  `license.activateWithCode` 已有的同款口径（"那是一次成功的 IPC 调用 ⇒ 归一成 `ok(status)`"）。
- 顺手查实并**改判**：`plan/14` §6 原写「画布导出 `t$` 与 `_Component25` 的 Chrome 集成同一半（未落）」——
  本半**已落**，但 `t$`/`Lc` 的 **CDP 档仍是死代码**（调**不存在**的 `lovartChromeEval`）⇒ 已就地改正该行，
  防后人误以为"Chrome 落地了 ⇒ CDP 档也活了"。
