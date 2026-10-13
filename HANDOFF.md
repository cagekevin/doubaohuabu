# HANDOFF · 交接给下一个 AI

> **一次性文件**：接手读完可以删，或把还有用的部分并进 `AGENTS.md` / `docs/plan/05`。
> **先读**：`AGENTS.md`（入口 + 铁律 + 真源索引）→ 本文件 → `docs/plan/05-断点清零计划.md`（当前断点账）。
> **动任何一行之前**：读 `.codebuddy/commands/架构师改码7步法`（本仓强制 SOP）。

---

## 一、一句话现状

**豆包画布（Electron 无限画布）的渲染层重写** —— `docs/plan/05` §1 的四条 P0 链 **A / B / C / D 已全部闭环**，
§7 的 ④「依赖链先立链」两组也已立完（`BP-13 → BP-26` · `BP-18 → BP-14`）。

`npm run check` **6 道闸全绿**，单测 **2025 条 / 112 文件**。

⚠️ **有一个提交点 + 五轮未提交的改动**：最后一次提交是 `8231fda`（全量提交，含原版参考 `inputs/`、`scripts/`）。
此后落的五轮（见 §六）**还在工作区里**，`30 files changed, +1284 / -116`。**接着做之前先决定是否提交。**

---

## 二、两个真源（别搞混）

| | 是什么 | 怎么用 |
|---|---|---|
| **原版可读源码** `docs/豆包画布原版参考/inputs/pipeline_step/project/src/expanded_components/` | `shared.js`（43545 行）+ 116 个 `_ComponentNN.jsx` —— **未混淆、可读** | ★ **这是真源**。凡是不确定的（行为 / 节奏 / 文案 / 字段 / 分支 / 该不该有）**一律先来这里读，再逐字照抄**；别推理、别先问人 |
| **BUILD-SPEC** `docs/豆包画布原版参考/outputs/BUILD-SPEC/` | 从上面机械抽的**二手索引** | **当对账清单用**（查"漏调了哪个 action / 漏落了哪个字段"），**别当照写蓝图**。组件函数体已内联（`05-组件/组件/<名>.md`）；`shared.js` 的**页面脚本与纯 helper** 在 `10-shared工具/`（用该目录 `99-定义索引.md` 按名字 grep 到分片 + 源行）。⚠️ 它有**新鲜度闸门**：`node scripts/99-build-spec.cjs` 在 `outputs/*.json` 过期时 **exit 1** 并点名该补跑哪个脚本 |

`AGENTS.md` §七 的真源集（架构与契约定稿 / CSS规范 / 判据登记表 / DATAFLOW / adr/）才是判据正文；其余全是参考资料。

---

## 三、下一步（按 `docs/plan/05` §7 的排序）

| 档 | 内容 | 备注 |
|---|---|---|
| **⑤ 清算** | `BP-30` 零消费清算（清单真源 = `scripts/dead-code-baseline.json`）· `BP-24` `[未识别]` 23 条（约 330 行） | **先接线再删**，避免误删；死代码闸已全开（`BP-36` 已失效） |
| **⑥ 待验** | `BP-32` **行为未验**：★8 挂载 / Dola 30s / Phase 2c / 快照底图 / 自动确认 —— 只过了静态闸 | ★ **只出凭证、不改代码**。`scripts/verify-*.cjs` 吃 `dist/` ⇒ 先 `npx vite build`。**闸绿 ≠ 健康**，这条是唯一解药 |
| **⑦ 其余 P3** | `BP-33`（CSS Modules 命名显式化 / git tag / C2 补 handle）· `BP-34`（Tapnow 仅剩 `pP`）· `BP-37`（参数面板定位 `yD`）· `BP-38`（节点类型标签） | 小件，可独立验 |
| **待落** | `BP-16` 额度读取 · `BP-17` 主进程下载/取图降级 · `BP-19` 风控正则 · `BP-20` 选号范围 · `BP-25` 视口联动浮层 · `BP-29` 建面板后选中态 + UI 抽取器 · `BP-31`（低）mock 抓取恒空 · `BP-39` 视频提示胶囊 · `BP-40` `gv-waiting` 后两态 · `BP-45` P4 符号级核对 · `BP-46` Lovart 采集两处旁路（perf 取图通道 + 诊断弹窗/`lovartDiag`） | `BP-46` 是落诊断时**新查出**的缺口，已登记 |
| **待裁** | `BP-12` Dola 强开 = 页面注入，撞「站点层零注入」—— 已有先例口径（扩例外表，同 `inputLock`） | 需用户拍板（改的是**对外行为面**） |

**每项 DoD（缺任一处 ⇒ 账立刻过期）**：① `npm run check` 全绿；② 闸类改动给「先红后绿」凭证（`node scripts/probe.mjs`）；
③ 往 `daily/架构日志/<NN>-*.md` 追加一条（跨区只写**一份**）；④ **判据 B5：不留「落了但没人调」**；
⑤ **回写三处**：`docs/DATAFLOW.md` 改对应链路句 ＋ `docs/plan/13|14|15` 勾对应行 ＋ `docs/plan/05` 断点表改类；
⑥ 债号流转走 `node scripts/debt.mjs`（别手写账本）。

---

## 四、口径与坑（都是真踩过的）

### 1. 断点先问「**有没有调用方**」

本仓的缺口**大量不是"少了个文件"，而是"件都在、缺接线"**。实证：
链 B 的 Phase 3a 消费点**恒传 `probedHit=false`** ⇒ 只走兜底档；链 C 的「已提交」脚本**0 调用方**。
⇒ **先 grep 那个能力的调用方**，别先找"没落的文件"；断点绝大多数落在 `state/**`。

**反面同样成立（判据 B5）**：**落了没人调 = 违规**。本轮的 `BP-13`（真实 Chrome）唯一消费者是 `BP-26`（会话条）
⇒ 两者**必须同批落**；`BP-18`（诊断摘要）的消费者与 `BP-14`（画布导出）**同住源 `wp` 的一段** ⇒ 也是同批。

### 2. 计划里的「落点 / 入口 / 依赖」经常是错的 —— **回源优先于计划**

本轮被回源推翻的（都已**就地改正原文**）：

| 计划说 | 实际 |
|---|---|
| `BP-14` 落 `usecases/captureText?` | 它是**抓取链的一档兜底**（`scanGallery` + `SitePort.exportCanvas?` + 页内 `Ay`），**不是独立入口** |
| `BP-14` 依赖 `BP-13` | 依赖**倒挂**：门的输入是诊断的 `canvasCount`/`canvases` ⇒ 真前置是 `BP-18` |
| `BP-18` = 「页面类型判定（`KT`）」 | `KT` = **值守的轻量探测**；页面类型判定是 `_d`（早已落）。而 `KT` 的唯一调用点是**值守循环** ⇒ **判不落** |
| `BP-13` 含 `ensureLovartFirefoxProfile` 等 | 那四个 IPC **源前端 0 调用**；`lovartChromeIsOpen` 后端**明写恒返 `false`** ⇒ 一并判不落 |
| 源提示「诊断 →『导出画布』手动抓取」 | 那个按钮**在源里根本不存在**（`YT` 全仓仅 1 个调用点） |

### 3. 源行为也会读错 —— 交叉验证再下结论

曾判「账号节点不经 `sendPayload`」，实际 **`Bu`（`shared.js:40411`）才是全仓唯一发送入口**。
⇒ **别只看一处调用点就下结论**，`grep` 全仓 + 看 wrapper。

### 4. **行匹配不能用来判"有没有重复"**

「行集 Jaccard + 逐字连续块」**方法不成立**（不认结构也不认语义：同构骨架误报、换写法的同义代码漏报）。
工具已删，相关数字已撤。**要回答"有没有重复"，用 AST/符号级分析，否则别下结论。**

### 5. **别把推断写成"用户裁定"**

文档/注释里**只写可核事实与依据**（源出处、判据、债号）。拿不准的口径**问**，别替用户拍板。

### 6. 写作口径：**只写当下，不留过程**

注释与文档只回答「现在是什么 / 为什么必须这样」；不写「原写 X / 此前 / 已更正」。
改动过程归 `daily/架构日志/`，债的状态流转归 `node scripts/debt.mjs`。

### 7. **页内脚本是模板字符串** ⇒ 注释里**不许出现反引号**

`adapters/site/*/scripts.ts` 的页内脚本住在 TS 模板字面量里 —— 注释里写 `` `hp` `` 会**直接截断模板**
（本轮踩过：`tsc` 一次报 15 条语法错）。页内脚本里**只用中文引号或裸名字**。
改完页内脚本**必须真跑一次解析自查**（`tsc` 管不到它）：

```bash
# 临时脚本，跑完即删。⚠️ 函数表达式要按「表达式」解析，不能当语句
npx vite-node .tmp-check.ts   # 内容：new Function(`return (${src})`)
```

### 8. **自查工具报错时，先怀疑自查**

本轮自写的解析自查对画布导出脚本报 `Function statements require a function name` —— **不是脚本坏了**，
是自查把**函数表达式**当**语句**解析了（调用方是 `(${SRC})(...)`）。与「测试红 ≠ 测试错」同款。

---

## 五、常用命令

```bash
npm run check                    # ★ 6 道闸（typecheck/lint/boundaries/dead-code/gate-vitals/test）
npm run test                     # 单测（2025 条 / 112 文件）
npm run css -- check --changed    # CSS 工具箱（只诊断本轮改动）
node scripts/debt.mjs list       # 债务账（add / resolve / edit / archive / search / show）
node scripts/arch-index.mjs --write   # 刷新区域索引（daily/架构日志/index.md）
node scripts/probe.mjs           # 先红后绿探针（--dry 先看注入 diff）
node scripts/mv-sync-refs.mjs rename|move|move-dir|refs|find-dead   # 移动/改名/查引用（禁手写 mv）
# 原版参考产物（在 docs/豆包画布原版参考/ 下）
node scripts/99-build-spec.cjs   # 生成/校验 BUILD-SPEC（过期会 exit 1）
```

> ⚠️ **PowerShell 的坑**：`npm run check` 这类长命令直接 `| Select-String` 会因 watch 探测**吞掉输出**
> ⇒ 重定向到文件再 `Get-Content`；且**不要复用同一个临时文件名**（上一次的进程可能还占着句柄）。

---

## 六、未提交的五轮（`8231fda` 之后，可核）

| 轮 | 断点 | 落点 |
|---|---|---|
| 1 | `BP-15` 取片去重三段 | `core/rules/resultScan.ts`（`isValidScan`/`filterValidScans`/`createNearDupWindow`）· `doubao/scripts.ts`（`WATERMARK_FREE_DIRECT_SCRIPT`）· `doubao/index.ts`（`pollResults` 接线）· `constants/{index,dedupe}.ts` |
| 2 | `BP-35` 画布删组释放成员 | `core/rules/group.ts`（`detachFromGroup` 收口 + `releaseDeletedGroupChildren`）· `state/slices/canvas.ts`（`removeNodes` 第三步） |
| 3 | `BP-13` ＋ `BP-26` Lovart 真实 Chrome 集成 | `core/ports/host.port.ts`（`AccountPort` 三方法 + 嵌套判别联合）· `adapters/host/electron/{session.ts,window-api.d.ts}` · `adapters/host/mock/index.ts` · `adapters/site/lovart/index.ts`（补 `chatUrl`）· `state/accountOps.ts` · `core/rules/lovartSession.ts`（新）· `ui/panels/LovartSessionBar.tsx`（新）· `BackendView.tsx/.module.css` |
| 4 | `BP-18` 的 `GT` 半（抓取诊断） | `adapters/site/shared/scanScripts.ts`（产 `diag`）· `core/ports/site.port.ts`（`ScanDiag`）· `adapters/site/shared/materializeScan.ts` · `core/rules/scanDiag.ts`（新）· `lovart/index.ts`（空结果文案）· `constants/text.ts` |
| 5 | `BP-14` 画布导出兜底 | `core/ports/site.port.ts`（`exportCanvas?` + `CanvasExportOutcome`）· `core/rules/scanDiag.ts`（`shouldExportCanvas`）· `lovart/scripts.ts`（`CANVAS_EXPORT_SCRIPT`）· `lovart/index.ts`（`exportCanvas`）· `core/usecases/scanGallery.ts`（`tryExportCanvas`）· `constants/{index,text}.ts` |

**区域日志**（`daily/架构日志/`）：`16-跨区-取片去重三段` · `16-跨区-删组释放成员` · `16-跨区-Lovart真实Chrome集成` · `16-跨区-抓取诊断` · `16-跨区-画布导出兜底`（均 `2026-10-13`）。

---

## 七、验证状态（**别把"闸绿"当"验过"**）

- ✅ **静态**：`npm run check` 6 道闸全绿（2025 条 / 112 文件）。
- ✅ **纯层**：新增判据都有单测（`resultScan` 取片三段 · `group` 删组释放 · `lovartSession` 提示行/禁用/错误码表 · `scanDiag` 摘要/收窄/画布门）。
- ✅ **页内脚本**：三个脚本都过了「解析自查」（`library` / `result` / `canvas-export`）。
- ⚠️ **运行时未验**（都要真站点页面 / 真 Electron）：
  - `BP-32` 全量（★8 挂载 / Dola 30s / Phase 2c / 快照底图 / 自动确认）；
  - 取片三段（`QM` 直链 / `RR` 滤网 / 近重复）要**真豆包后台页**；
  - Lovart 会话条三键（真 Chrome 打开 / cookie 同步）要**真 Chrome + Electron**；
  - 画布导出的页内 `Ay` 与诊断计数要**真 Lovart 画布页**；
  - 页内 `ScanDiag` 的 9 个字段计数准不准，同上。
- ⚠️ **本仓 `adapters/**` 无单测**（既定口径）⇒ 适配器行为一律端到端验，不许用"层面如此"免掉。
