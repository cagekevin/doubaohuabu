# HANDOFF · 交接给下一个 AI

> **一次性文件**：接手读完可以删，或把还有用的部分并进 `AGENTS.md` / `docs/plan/05`。
> **先读**：`AGENTS.md`（入口 + 铁律 + 真源索引）→ 本文件 → `docs/plan/05-断点清零计划.md`（当前断点账）。

---

## 一、一句话现状

**豆包画布（Electron 无限画布）的渲染层重写**，已完成到「**P0 链级断点只剩 1 条**」：
`docs/plan/05` §1 的四条链 A/B/C/D 里，**A（图像回流）· B（发送前置校验）· C（检测）已闭环**，
**只剩链 D = BP-15**。`npm run check` 6 道闸全绿，单测 1974 条 / 110 文件。

---

## 二、两个真源（别搞混）

| | 是什么 | 怎么用 |
|---|---|---|
| **原版可读源码** `docs/豆包画布原版参考/inputs/pipeline_step/project/src/expanded_components/` | `shared.js`（43545 行）+ 116 个 `_ComponentNN.jsx` —— **未混淆、可读** | ★ **这是真源**。凡是不确定的（行为 / 节奏 / 文案 / 字段 / 分支 / 该不该有）**一律先来这里读，再逐字照抄**；别推理、别先问人 |
| **BUILD-SPEC** `docs/豆包画布原版参考/outputs/BUILD-SPEC/` | 从上面机械抽的**二手索引** | **当对账清单用**（查"漏调了哪个 action / 漏落了哪个字段"），**别当照写蓝图**。组件函数体已内联（`05-组件/组件/<名>.md`）可照抄；`shared.js` 的**页面脚本与纯 helper** 在 `10-shared工具/`（用该目录 `99-定义索引.md` 按名字 grep 到分片 + 源行）。它有**新鲜度闸门**：`node scripts/99-build-spec.cjs` 在 `outputs/*.json` 过期时 **exit 1** 并点名该补跑哪个脚本 |

`AGENTS.md` §七 的真源集（架构与契约定稿 / CSS规范 / 判据登记表 / DATAFLOW / adr/）才是判据正文；其余全是参考资料。

---

## 三、下一步（按优先级）

1. **链 D · BP-15**（唯一的 P0 残留）：取片去重三段 —— `RR` 有效性滤网 · `wl` 近重复 · `QM` 无水印直链。
   落点 `core/rules/resultScan.ts` + `adapters/site/doubao/index.ts`。
   ⚠️ `QM` 与 BP-03 的图像键表（`core/rules/imageGenKey.ts`）有交集，**同批做**。
2. **BP-12 待裁**：Dola 强开是页面注入，撞「站点层零注入」—— 已有先例口径（扩例外表，同 `inputLock`）。
3. **BP-32 待验**（不是"待落"）：代码都落了，缺的是**在 Electron 里真跑一次**。`scripts/verify-*.cjs` 吃 `dist/`，
   所以要先 `npx vite build`。**闸绿 ≠ 健康**，这条是唯一解药。
4. 其余 P1/P2 见 `docs/plan/05` §0 总表。

---

## 四、口径与坑（都是这轮真踩过的）

### 1. 断点先问「**有没有调用方**」

本仓的缺口**大量不是"少了个文件"，而是"件都在、缺接线"**。这轮两次都这样：

- 链 B 的 Phase 3a：纯判据 `shouldStartTimer` + 页内脚本都在，**消费点恒传 `probedHit=false`** ⇒ 只走兜底档。
- 链 C 的「已提交」探测：脚本 `GEN_SUBMITTED_COUNT_SCRIPT` 早在 `scripts.ts`，**0 调用方**。

⇒ **先 grep 那个能力的调用方，别先找"没落的文件"**；断点绝大多数落在 `state/**`。

### 2. 计划里的「落点」经常是错的 —— **回源优先于计划**

这轮三处落点被回源推翻：

| 计划说 | 实际 |
|---|---|
| BP-06 补 `shared/attachImage.ts` 的"第三档" | 源里 `hS`（服务 `askWithImage`）与 `Be` 的 Phase 2（服务**发送管线**）是**两个不同函数** ⇒ 分落 `shared/attachImage.ts` + `doubao/attachPhase2.ts` |
| BP-04 落 `doubao/analyze.ts` | `Hd` 与 `dD`/`fD`/`pD`/`hD` 同族（都住 `doubao/watch.ts`）⇒ 落 `watch.ts` |
| — | `cD`/`uD`/`_a` 等脚本**不在** spec 的组件分片里（住 `shared.js`） |

### 3. 源行为也会读错 —— 交叉验证再下结论

我一度判「账号节点不经 `sendPayload`」，实际 **`Bu`（`shared.js:40411`）才是全仓唯一发送入口**（`IL()` 的唯一调用者），
`_pendingAttempt(s)` 对**每条**发送路径都会写。⇒ **别只看一处调用点就下结论**，`grep` 全仓 + 看 wrapper。

### 4. **行匹配不能用来判"有没有重复"**

我用过「行集 Jaccard + 逐字连续块」去量化重复度 —— **方法不成立**：它不认结构也不认语义，
同构骨架会误报、换了写法的同义代码会漏报。工具已删，相关数字已撤。详见 `daily/架构日志/16-跨区-发送前置校验链-2026-10-13.md` §七。
**要回答"有没有重复"，用 AST/符号级分析，否则别下结论。**

### 5. **别把推断写成"用户裁定"**

文档/注释里**只写可核事实与依据**（源出处、判据、债号）。拿不准的口径**问**，别替用户拍板 ——
我犯过一次（把自己的一条工程主张标成"用户裁定"），已撤。

### 6. 写作口径：**只写当下，不留过程**

注释与文档只回答「现在是什么 / 为什么必须这样」；不写「原写 X / 此前 / 已更正」。
改动过程归 `daily/架构日志/`，债的状态流转归 `node scripts/debt.mjs`。

### 7. 每项 DoD（缺任一处 ⇒ 账立刻过期）

① `npm run check` 全绿；② 闸类改动给「先红后绿」凭证（`node scripts/probe.mjs`）；
③ 往 `daily/架构日志/<NN>-*.md` 追加一条；④ **判据 B5：不留「落了但没人调」**；
⑤ **债号流转** `node scripts/debt.mjs`（别手写）＋ **回写三处**：`docs/DATAFLOW.md` 删对应断点句 ·
`docs/plan/13|14|15` 勾对应行 · `docs/plan/05` 断点表改类。

---

## 五、常用命令

```bash
npm run check                    # ★ 6 道闸（typecheck/lint/boundaries/dead-code/gate-vitals/test）
npm run test                     # 单测（1974 条 / 110 文件）
node scripts/debt.mjs list       # 债务账（add / resolve / edit / archive）
node scripts/arch-index.mjs --write   # 刷新区域索引
node scripts/check-dead-code.mjs      # 死代码闸（新增即红；清偿后 --update-baseline）
node scripts/probe.mjs                # 先红后绿探针
node scripts/mv-sync-refs.mjs rename|move|move-dir   # 移动/改名（禁手写 mv）
# 原版参考产物（在 docs/豆包画布原版参考/ 下）
node scripts/99-build-spec.cjs   # 生成/校验 BUILD-SPEC（过期会 exit 1）
```

---

## 六、这轮落地的代码（可核）

| 断点 | 落点 |
|---|---|
| BP-03 图像回流（两条通道） | `core/rules/imageGenKey.ts` · `state/slices/apiLanding.ts` · `state/dolaMedia.ts` · `state/subscriptions.ts` |
| BP-07 `_pendingAttempt(s)` 写入 | `core/rules/pendingAttempt.ts` · `state/pendingAttempt.ts` · `core/usecases/generate.ts`（`GenDeps.onSent` 钩子）· `accountOps` · `batchSend` |
| BP-06 Phase 2 全段 + 2b | `doubao/attachPhase2.ts` · `core/rules/attachRefImages.ts` · `doubao/scripts.ts`（`_a`） |
| BP-05 Phase 3a 图数/图序 | `core/rules/precheckAttach.ts` · `doubao/scripts.ts`（`cD`）· `doubao/index.ts` 硬闸 |
| BP-04 「已提交」探测 | `core/ports/site.port.ts`（`probeGenSubmitted`）· `doubao/watch.ts` · `state/postSendDetect.ts` |
| 顺手清的死代码 | 删 `detachConnection`（源里没有）· `FINGERPRINT_VERSION` 收口到 `constants/` |

**未清偿的债**（`node scripts/debt.mjs list --area 16`）：`TD-16-115`~`TD-16-120` —— 多为「落点/形状与计划不同」的记账
（例：`TD-16-117` = Phase 3a 的 `precheck` 回执**未接线**，`accountOps` 的 feedback 还没读它）。

---

## 七、验证状态（**别把"闸绿"当"验过"**）

- ✅ **静态**：`npm run check` 6 道闸全绿。
- ✅ **纯层**：新增判据都有单测（`attachRefImages` 13 · `precheckAttach` 22 · `imageGenKey` 等）。
- ⚠️ **运行时未验**：Phase 2 的四档附图（CDP 确认 / 剪贴板回退 / 按键补充 / 2b）· Phase 3a 的页内探测 ·
  「已提交」探测的计时器启动 —— **都需要真豆包后台页**。与 `BP-32` 同批。
