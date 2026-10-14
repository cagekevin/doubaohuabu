# 11 · 跨区 · 文案 SSOT 死键 + adapter 裸文案 · 2026-10-13

> **触发**：用户「积极深入探索还有哪些债务」。
> **射程**：① **文案 SSOT 的消费面**（`constants/*Text*.ts` 每个键 → 全仓是否有人读）；② **适配器自造文案**（`fallback:` / `?? '<中文>'`）；③ 顺带复核上一轮 `TD-04-12` 的「唯一推送通道」措辞。
> **方法**：**双证据法** —— 对每个文案键，先查 `OBJ.key` 静态引用，再查**键名本身**在 `constants/` 之外是否出现（防 `const T = OBJ` 别名 / `OBJ[kind]` 动态索引两类假阳性）。
> **只读审计**：`src/**`、`electron/**`、`scripts/**` 一行未改；**测试执行 0 次**。
> **判据来源**：`docs/判据登记表.md` §3（文案 SSOT = `constants/text.ts`，**禁裸字面量**）· `AGENTS.md` §五 · `docs/DATAFLOW.md` §三（错误链：生产者 `adapters/**` 产生 `message`，文案映射真源 = `constants/failure.ts`）· 母体表。

---

## 一、取证

| 关键事实 | 证据 |
|---|---|
| **41 个文案键**在 `constants/` 之外**键名 0 出现**（含别名 / 动态索引都救不了）⇒ 硬证据的「定义即死」 | 见 §二 TD-11-7 清单（方法 = §五 第 1、2 条命令） |
| 其中 **8 个**属**整对象已在死代码基线**（`GEN_TEXT` / `FINGERPRINT_TEXT` / `SIDE_TEXT`）⇒ 净 **33** 键死在**活对象**里 | `scripts/dead-code-baseline.json`（`constants/text.ts::exports::{GEN_TEXT,FINGERPRINT_TEXT,SIDE_TEXT}`） |
| `OBJ.key` 静态引用查不出死键：多个消费点用**局部别名** `const T = SCAN_DIAG_TEXT` / `const t = SCAN_DIAG_TEXT` | `core/rules/scanDiag.ts:96` · `core/rules/queuePing.ts:83` |
| `adapters/host/electron/index.ts` 有 **9 处** 中文 fallback 文案**硬编码在适配器**里，全部经 `err(...)`/`failures.push` 成为**用户可见**的 `Result.message` | `:178` `'无效图'` · `:181` `'失败'` · `:206` `'批量取图提交失败'` · `:224` `'多帧扫描返回失败'` · `:235` `'视频检测返回失败'` · `:254` `'attach-dola-debugger 失败'` · `:266` `'inject-dola-duration-main 失败'` · `:278` `'dola-duration-diag 失败'` · `:307` `'清理浏览器缓存返回失败'` |
| 同处还有 **假收窄**：只过 `isRecord` 就断言元素形状 | `:182-184` `if (isRecord(p.item)) { … items.push(p.item as unknown as FetchImagesItem); }` |
| 推送订阅**不止一处**裸断言（上一轮 `TD-04-12` 只写了 `onJobEvent`） | `api.ts:183`（`as ApiJobEvent`）· `index.ts:245`（`as DolaMediaEvent`） |

---

## 二、探债

| ID | 位置（文件:行号 / refs） | 债的形态 | 归属(模块) | 爆炸半径 | 利息 | 根因(母体?/孤例) | 大致解法（一句话） | 状态 |
|---|---|---|---|---|---|---|---|---|
| TD-11-7 | `src/constants/text.ts` · `sendPanelText.ts`（清单见下） | **文案 SSOT 死键（M6 幽灵预留）＋ 闸盲区**：**41 键**在 `constants/` 之外**键名 0 出现** ⇒ 既无静态消费、也无别名/动态索引消费。⚠️ **knip 结构性看不见**（`const OBJ = {…}` 的**对象属性**不在符号图里，`ignoreExportsUsedInFile` 更让它连"同文件内被用"都不报）⇒ `TD-11-1`（导出级 45 条）与 `TD-11-4`（2 个样本）都只是**同一盲区的零头**。清单（对象分类）：`ANALYZE_TEXT` 7（`askFailed`/`clipboardException`/`phaseAnalyzing`/`phaseReviseNewSession`/`phaseRevising`/`phaseSendingImage`/`reviseAskFailed`/`sendImageFailed`）· `ACCOUNT_TRANSFER_TEXT` 4 · `GEN_TEXT` 4 · `SIDE_TEXT` 3 · `MATERIAL_NODE_TEXT` 3 · `PERSIST_TEXT` 2 · `DETECT_TEXT` 2 · `GALLERY_TEXT` 2 · `ACCOUNT_PICKER_TEXT` 1 · `ATTACH_PRECHECK_TEXT` 1 · `BACKEND_VIEW_TEXT` 1 · `BATCH_TEXT` 1 · `FINGERPRINT_TEXT` 1 · `FP_SCAN_TEXT` 1 · `LIBRARY_TEXT` 1 · `LICENSE_TEXT` 1 · `NODE_STATUS_TEXT` 1 · `REF_TEXT` 1 · `SEND_TEXT` 1 · `VIDEO_NODE_TEXT` 1 · `ACCOUNT_TRANSFER_TEXT`（见 §五 命令输出） | constants（11） | ① AI/人据文案表**误判能力已备**（如 `LICENSE_TEXT.checking`、`ANALYZE_TEXT.phase*` 看着像有 UI）；② 文案表虚胖、真实 UI 文案无从对照；③ **无任何闸** 覆盖对象属性级死键 | 中 | 母体 **M6**（`TD-16-27`）+ 检测母体 **M2**（闸声索「0 消费即死」> 覆盖）；同族 `TD-11-1` / `TD-11-4` / `TD-16-42`（grep 型闸退役后判据失守） | 逐键判「删 or 接线」；**并立一道可跑的对象属性死键扫描**（把 §五 的双证据法脚本化，纳入死代码闸或 `npm run css` 式的**手动工具箱**） | 待还 |
| TD-04-14 | `src/adapters/host/electron/index.ts:178,181,206,224,235,254,266,278,307` | **裸字面量（违 `§五 禁裸字面量`）+ 文案越权**：9 处用户可见的兜底文案**由适配器自造**（`fallback:` / `?? '…'`）⇒ 违反「生产者的 `message` 只能是**原文**；文案映射真源 = `constants/failure.ts` / `constants/text.ts`」。对照同文件已收口的写法（`host-api.ts` 用 `COMMON_TEXT.boundaryViolation(...)` / `COMMON_TEXT.unknownReason`）—— 即**同一文件里两套口径** | adapters/host（04） | 9 句用户可见文案游离于 SSOT ⇒ 无法统一改写（改文案要搜适配器）；同族 `TD-16-132`（state 侧 `「视频」`/空串）、`TD-10-1`（UI 硬写 `unknown`）、`TD-16-51`（`accountOps` 编 reason） | 中 | 孤例（同族已有 3 笔，均在账）—— `@见 TD-16-132` | 9 句收进 `constants/text.ts`（`HOST_BOUNDARY_TEXT`），适配器只引键 | 待还 |
| TD-04-15 | `src/adapters/host/electron/index.ts:184` | **假收窄（同 `TD-16-50` 家族复发）**：`if (isRecord(p.item))` 只收窄到 `Record<string,unknown>`，却用 `as unknown as FetchImagesItem` **一步跳过**形状校验塞进 `items` ⇒ 后端把元素字段改名（如 `url`→`src`）时**静默通过**，坏 item 直达画布/画廊。`TD-16-50` 在 `materializeScan` 用的是「元素级 `isRecord` 收窄」，此处**没跟上** | adapters/host（04） | 批量取图（Lovart 采集）的单图形状漂移不可见；下游按空字段建素材 | 低 | 同 `TD-16-50` 母体（假收窄）；孤例 | 给元素加最小形状守卫（`url` 为 string 等），不过 ⇒ 计入 `failures`（不静默） | 待还 |

**账本描述修正（非新债）**：`TD-04-12` 的现象写「**唯一的**推送通道裸断言」**不准确** —— 同一族在 `adapters/host/electron/index.ts:245` 还有 `onDolaMedia`（`payload as DolaMediaEvent`）。走 `debt.mjs edit --field summary` 修正为「推送**订阅族**（`onJobEvent` / `onDolaMedia`）」，避免读者以为只有 `api.ts` 一处。

---

## 三、裁定（非债 —— 留痕防重审）

| 项 | 裁定 | 证据 |
|---|---|---|
| `ui/canvas/CanvasHost.tsx:368` `hostOps.onClipboardImageChanged(mark)`（订阅注册在 **ui**，不在 `state/subscriptions.ts`） | **非债（已如实标注）**：该订阅**不写 store**（只写 `lastClipboardChangeRef`），不触「唯一写入点」；`subscriptions.ts:43-44` 已把它标为**未来的收口落点**，`DATAFLOW` §十 亦记为「只读不写 store」 | `CanvasHost.tsx:362-373` · `subscriptions.ts:43-44` |
| `ui/**` 的 `Date.now()` / `Math.random()`（20 处命中） | **非债**：**逐处**都在 `useState(() => Date.now())`（挂载取一次）或**事件回调**里；无渲染期不纯调用。`AGENTS.md` §四 的规约被遵守 | `TextNode:89` · `AccountNode:95` · `SendQueuePanel:99` · `ApiSettings:101` · `ActivatePage:76` … |
| `core/**` 的 `Date.now` / `window` / `setTimeout` 命中 | **非债**：**全部**是注释里复述「源版内联 ❌ / 本仓注入 ✅」（`project.ts:8` · `queuePing.ts:30` · `panelAnchor.ts:49` …）⇒ 实码无违规 | 逐文件读 |
| `state/**` 的 `Date.now` 命中 | **非债**：同为注释（`apiLanding.ts:15` · `queue.ts:46`）；实码走注入时钟 | 同上 |
| `adapters/host/electron/{api,project,session}.ts` 拉取侧 | **非债**：`callOk`/`need`/`checkOk` fail-closed；`session.ts` 20 处 catch 全 `return err(...原文, cause)` | 逐行 |
| `OBJ[key]` 动态索引族（`SCAN_DIAG_TEXT` / `QUEUE_PING_TEXT` / `GPT_TEXT` …） | **非债（假阳性已剔除）**：这些对象的键经**局部别名** `const T = OBJ` 消费 ⇒ 未计入 TD-11-7 | `scanDiag.ts:96` · `queuePing.ts:83` |

---

## 四、覆盖度表（增量）

| 文件 | 层 | 覆盖状态 | 灯 | 轮次/日期 | 证据 | 债/裁定 |
|---|---|---|---|---|---|---|
| `constants/text.ts` | L0 | 深审（**消费面全量**） | 🔴 | 本轮 | 41 键硬证据（§五） | TD-11-7 |
| `constants/sendPanelText.ts` · `apiSettingsText.ts` · `newImagesText.ts` · `projectStorageText.ts` | L0 | 深审 | 🔴/🟢 | 本轮 | 同上（后两者 0 死键） | TD-11-7（限前两） |
| `adapters/host/electron/index.ts` | L3 | 深审 | 🔴 | 本轮 | `:155-215` · `:218-310` | TD-04-14 · TD-04-15 |
| `adapters/host/electron/api.ts` | L3 | 回查 | 🟡 | 上轮+本轮 | `:183` | TD-04-12（描述修正） |
| `ui/**`（`Date.now`/订阅面） | L5 | 抽审 | 🟢 | 本轮 | 20 处 Date.now + 1 处订阅 | 非债（见 §三） |
| `core/rules/**`（禁区面） | L2 | 抽审 | 🟢 | 本轮 | 命中全为注释 | 非债 |
| `constants/{models,dedupe,failure,fingerprint,facemask,inputLock,groupPalette,stylePresets,analyzePrompts}.ts` | L0 | 抽审 | 🟢 | 11（2026-10-11）+ 本轮 | 本轮只扫文案对象 | 不重查（代码未变） |

**覆盖账**：本轮审 **7** 文件（深审 3 · 回查 1 · 抽审 3）；**未审**（逐个列名 + 理由）：`constants/text.ts` 的**非文案导出**（常量 / 类型）与 `index.ts` 聚合面（理由：本轮射程 = 文案键消费面）；`ui/**` 全量（理由：本轮只抽查 `Date.now`/订阅两个形态）；`adapters/**` 其余文件（`site/*` 9 个 `scripts.ts` 为区 05 未审项，属 volatile 页内脚本）。**不宣称任何区「审完」**。

---

## 五、凭证（只读可复现）

```bash
cd /Users/kevin/Documents/doubaohuabu
# TD-11-7：双证据扫（① 静态 OBJ.key ② 键名在 constants 外是否出现）
for f in src/constants/text.ts src/constants/sendPanelText.ts src/constants/apiSettingsText.ts; do
  awk '/^export const [A-Z_]+ = \{/{obj=$3; ino=1} ino && /^};/{ino=0} ino && /^  [a-zA-Z_][a-zA-Z0-9_]*:/ \
      {gsub(/^  /,""); split($0,a,":"); print obj" "a[1]}' "$f" | while read obj key; do
    use=$(grep -rn "\b$obj\.$key\b" src --include='*.ts' --include='*.tsx' | grep -v tests | grep -v "^$f:" | wc -l)
    [ "$use" != "0" ] && continue
    cnt=$(grep -rn "\b$key\b" src --include='*.ts' --include='*.tsx' | grep -v tests | grep -v '^src/constants/' | wc -l)
    [ "$cnt" = "0" ] && echo "$obj.$key"
  done
done | sort        # ⇒ 41 行
# TD-04-14：适配器裸文案
grep -rn "fallback: '[^']*'" src/adapters/host/electron/index.ts
grep -rn "?? '\S*[一-龥]" src/adapters/host/electron/index.ts
# TD-04-15：假收窄
sed -n '182,185p' src/adapters/host/electron/index.ts
# 推送订阅族（TD-04-12 描述修正的依据）
grep -rn "as ApiJobEvent\|as DolaMediaEvent" src/adapters/host/electron/
```

---

## 六、状态行

- 本区域状态：`已验证(有债待还)`
- 本轮**新登记 3 笔**：`TD-11-7`（中，文案 SSOT 死键 ×41 + 闸盲区）· `TD-04-14`（中，adapter 裸文案 ×9）· `TD-04-15`（低，假收窄）；**账本描述修正 1 处**（`TD-04-12` 补 `onDolaMedia`）；**判非债 6 项**。
- ⚠️ **对用户命题的回应**：
  - **「未接线」的另一种形态** ⇒ `TD-11-7`：**文案备了、没人读** —— 41 键是「幽灵预留」在**对象属性**这一层的规模化样本；根因是**闸盲区**（knip 不看对象属性），所以它既没被死代码闸发现、`TD-11-1`（导出级 45 条）也**覆盖不到**。
  - **「契约 / 错误」** ⇒ `TD-04-14`：**用户可见文案由适配器自造**（9 句），而 `§五` 要求文案唯一真源；**同文件里 `host-api.ts` 已是正确写法** ⇒ 是「同一件事两种口径」的又一个实例。
  - **「复发」** ⇒ `TD-04-15`：`TD-16-50` 在 `materializeScan` 修掉了「`Array.isArray`/`isRecord` 后直接断言元素类型」的假收窄，**同类在 `adapters/host/electron/index.ts:184` 未跟上** —— 修一处、漏一处的典型。
- `docs/DATAFLOW.md`：链路未漂移 ⇒ **不改现状图**（§三 的「文案真源 = `constants/failure.ts`」与 `TD-04-14` 冲突点属**债**、不属链路）。
- `docs/判据登记表.md`：§3「UI 文案」行仍准（真源 = `constants/text.ts`，载体 1）；本轮无就地改正项。
- 测试执行 **0** 次；本轮**自己**一行未改。⚠️ **取证快照边界**：工作区同时有并发会话在改 `src/**` —— **收尾时** `constants/text.ts` · `constants/sendPanelText.ts` · `adapters/host/electron/index.ts` **已被并发改动**。已在收尾**逐条复查本轮全部取证点**（`index.ts` 的 9 处裸文案仍在 `:178/181/206/224/235/254/266/278/307` · `:184` 假收窄仍在 · 41 个死键抽样 21 个**仍 0 引用**）⇒ **三笔债的理由均未失效**。
