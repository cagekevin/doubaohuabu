# 02 · 跨区 · `as unknown as` 母体收口（`TD-02-17` 施工 · 含**根因证伪**）

> **日期**：2026-10-11 ｜ **区域**：02（跨区：`state` + `ui` + `core/rules` 只读）｜ **触发**：债务优先级 **P2**（架构级母体）
> **债**：`TD-02-17`（「母体：`as unknown as` 全仓 20 处，**根因 `core/rules` 24 个 Lite 接口与 `stable` 类型双轨**」）

---

## 一、做之前：数清楚（先证伪"根因"，再动手）

### ① 枚举：**21 处命中 / 20 处活代码**（1 处在注释里）

| 组 | 形状 | 处数 |
|---|---|---|
| A | `node.data as unknown as Record<string, unknown>` | 5 |
| B | `s.nodes / plan.nodes / anchor as unknown as *Like`（Lite 接口方向） | 12 |
| C | `nodes as unknown as RFCanvasNode`（ReactFlow 桥） | 3 |

### ② 先验假设（**被自己的实验推翻**）

假设：「`interface` 没有隐式索引签名 ⇒ 赋给 `Record<string, unknown>` 失败」。最小实验（`/tmp/ts-probe.ts`）**证实该规则本身**：
```
error TS2322: Type 'IData' is not assignable to type 'Record<string, unknown>'.
  Index signature for type 'string' is missing in type 'IData'.   ← 只有 interface 那行报错
```
**但本仓不适用** —— `stable/model/node.ts:88-90` 的 `NodeDataBase` **本身就有** `[k: string]: unknown`，
且所有 `*NodeData` 都 `extends` 它 ⇒ 入参方向**本就不需要**断言。

### ③ 决定性测量：**一次摘光 20 处，看 tsc 到底报几条**

```bash
node /tmp/strip-casts.cjs        # 摘掉全部 20 处（备份在 /tmp/td0217/）
npm run typecheck                # ⇒ 只报 12 条
```
| 报错类型 | 条数 | 含义 |
|---|---|---|
| `TS6133`（import 未使用） | **6** | 那些断言**本就多余** |
| `TS2322 / TS2345` | **5** | **真需要**：`*Like[] → CanvasNode[]`（`canvas.ts:452/470/479/488`）· `RFCanvasNode[] → CanvasNode[]`（`CanvasHost.tsx:122`） |

⇒ ★ **20 处里 15 处是多余断言**；**债的"根因 = Lite 接口与 stable 双轨"不成立**。
真因是：**纯层出参把节点类型擦宽**（`*Like[]`）+ **1 处第三方类型边界**。

---

## 二、改了什么

| 动作 | 内容 |
|---|---|
| **删 15 处多余断言** | A 组 5 处（`node.data as … Record<string, unknown>`：`TextNode` · `analyze` · `apiLanding` · `batchSend`×2）· B 组入参方向 8 处 · C 组 2 处（`nodes as unknown as RFCanvasNode` —— ReactFlow **接受**本仓节点形状） |
| **4 处收成 1 处**（判据 C1） | `state/slices/canvas.ts` 新增 `asCanvasNodes(nodes)`，供 `renameMaterialNode` / `groupSelectedNodes` / `ungroupNodes` / `arrangeNodes` **共用** |
| **保留 1 处第三方边界** | `CanvasHost.tsx:125` 的 `next as unknown as CanvasNode[]` —— 加注释写明**这是类型边界**（`@xyflow/react` 的 `Node[]` ↔ 本仓 `CanvasNode`），**不是**"双轨" |
| **删 6 个多余类型 import** | `ScreenshotAnchorLike` · `GroupNodeLike`（×2 文件）· `RecipeAnchorLike` · `MaterialNodeLike` · `RenamableLibraryItem` |

---

## 三、数清楚（做前 → 做后）· 度量

| 口径 | 做前 | 做后 |
|---|---|---|
| `as unknown as`（生产代码） | **20** | **2** ✅ |
| ├ 多余断言 | **15**（未识别） | **0** |
| ├ 4 处调用点断言 | 4 | **1**（共享件） |
| └ 确证必要的 | 未验证 | **2**（1 收窄件 + 1 第三方边界，**均有注释说明为什么必要**） |
| 多余类型 import | 6 | **0** |
| 债的「根因」声索 | "Lite 接口与 stable 双轨" | **证伪**（`NodeDataBase` 本就有索引签名） |
| 改动半径 | — | **5 文件** |

---

## 四、探针

> ⚠️ **本轮为纯类型改动（零运行时行为变化）** ⇒ 按 SOP「纯结构改动走现有测试 + 反向探针」，**不硬造探针**。

**决定性凭证 = ③ 的那次测量本身**（可复现）：
```bash
node /tmp/strip-casts.cjs && npm run typecheck   # ⇒ 12 条：6 × TS6133 + 5 × TS2322/2345
node /tmp/strip-casts.cjs --restore              # 可完全还原
```
**它同时证明了"删掉那 15 处不会破坏类型"** —— 比任何"先红后绿"更直接（**先红** = 删掉后仍绿 ⇒ 断言无价值）。

---

## 五、反向探针（零炸）

| 口径 | 命令 | 结果 |
|---|---|---|
| 类型 | `npm run typecheck` | ✅ 0 错 |
| 全量门禁 | `npm run check` | ✅ 5 道闸全过（**1387 tests**） |

**零炸三问**：

1. **哪些行为被改了？** —— **无**（`as` 断言在运行时**不存在**；纯类型层）。
2. **改前能走的路径仍能走吗？** —— 1387 tests 绿；`typecheck` 0 错。
3. **改前会失败的仍失败吗？** —— 本轮**不碰**任何运行时路径。

**用户可感知变化：无**。
⚠️ 对**下一个 AI** 的变化：原来 20 处断言会让它以为"这里有 20 个类型冲突（双轨）"，从而**不敢动**或**照着复制**。

---

## 六、交付闸自查

| 闸 | 本轮结论 | 可复现凭证 |
|---|---|---|
| 一归 · 判据归一 | "断言是否必要"的判据从**无** → **`tsc` 实测**（摘掉后仍绿 = 多余） | §一 ③ 的测量 |
| 减一 · 兜底净减 | 多余断言 **15 → 0**；4 处调用点 → 1 处共享件 | §三 表 |
| 减二 · 复杂度实减 | 删 6 个类型 import；`asCanvasNodes` 一处集中说明"为什么必要" | §二 表 |
| 一诚实 · 失败诚实可见 | 债的**错误根因**被证伪并回改（`docs`/账本）；保留的 2 处**写明理由**（不再是裸断言） | §一 ② ③ + §七 |
| 零炸 · 防回归防副作用 | 见 §五 | §五 表 + 零炸三问 |
| 一凭证 · 证据可复现 | 即上五条凭证本身（**摘光-测量**脚本可复跑 + 可还原） | §四 / §五 |

---

## 七、结论与下一步

- **结清**：`TD-02-17`（20 → 2；**其"根因"声索经实测证伪**，已按 A7 回改）。
- **新登记**：`TD-02-19`（中）—— 纯层出参擦宽（`group.ts` 3 个函数 + `materialRename` 计划类型）：
  现靠 **1 个共享断言**收窄；**泛型化**（`<T extends *Like>`）可彻底消掉那 1 处。
- **成对回写**：本轮**未改变任何缺口状态**（纯类型）⇒ `docs/13/14/15` **无需更新**（已逐节核对）。
- **P7 候选**：本轮的判据可固化成一条**检测母体**（"`as unknown as` 新增即红"），
  但要先处理例外（第三方类型边界 `CanvasHost` ⇒ 需白名单）。
