# ADR-0007 · 深拷贝＝结构化克隆（禁 JSON 往返）

- **状态**：生效
- **结论**：深拷贝唯一入口 structuredClone；禁 JSON 往返（丢 undefined／Date／Map／Set，且 as 假收窄）；含函数／Symbol／DOM 者**根部抛错**，不静默丢弃。
- **日期**：2026-10-16
- **裁定人**：架构师（取证后自定）
- **触发**：系统性搬运ADR-0007（本仓 1 处引用；执行面已有，且在册违规 = `src/core/model/defaults.ts:87`）

## 背景

**被推翻的旧形态**：`JSON.parse(JSON.stringify(v)) as T`。它在**类型层**和**运行时**同时说假话：

| 面 | 谎 |
| --- | --- |
| 类型 | 签名承诺 `T`，实现返回 `any` ⇒ 靠 **`as T` 假收窄**圆场 |
| 运行时 | **静默丢数据**：丢 `undefined` 字段 · `Date`→字符串 · `Map`/`Set`→`{}` · 循环引用抛 `TypeError` |
| 守卫 | 约束只写在注释里 = **假护栏**（无任何机器校验） |

**在册违规（搬运时实测）**：`src/core/model/defaults.ts:87` 现在仍是 `JSON.parse(JSON.stringify(d)) as NodeDataOf<T>`。⇒ 本条**有真实处置对象**；**修不修属改码动作（`架构师改码7步法`），不在本条范围**。

**本仓已有正确先例**（本条是"把既成事实写成判据"，不是新立规矩）：`core/rules/clipboard.ts:92`／`:94` · `state/slices/canvas.ts:109` · `ui/canvas/CanvasHost.tsx:611`（对源）。

## 判据（它凭什么成立 / 为什么不成立）

- **旧约定凭什么成立？答不出** —— 它既非物理红线，也非类型层约束，更无对账测试支撑 ⇒ 按 `ADR-0004`，它就是**待消灭的对象**。
- **能力取证**：`structuredClone` 在 node 与 jsdom（vitest）环境均可用，**仓内已有先例** ⇒ 不是新引入的重依赖。
- **浅拷贝不算深拷贝**：`{...x}` / `Object.assign` 只拷一层，语义上不能替代（本条只管**深**拷贝）。

## 决议

1. **唯一入口 `structuredClone`**：原生返回 `T`（**无需 `as`**）· 保留 `Date`/`Map`/`Set`/**循环引用** ⇒ 消除静默丢数据。
2. **失败根部炸开**：含**函数 / Symbol / DOM 节点**者抛 `DataCloneError` ⇒ 不静默丢弃（与 `ADR-0005`「失败不得伪装」同向）。
3. **禁止**：① `JSON.parse(JSON.stringify(` 用于**深拷贝** ② `deepClone` 类包装器里出现 `as T` ③ 第三份深拷贝实现（裸 `structuredClone` 允许，另造包装器不允许）。
4. **测试快照不在射程**：测试里用 `JSON.parse(JSON.stringify(...))` **造快照 / 断言**不是深拷贝（本仓现有 3 处：`core/rules/tests/dedupe.test.ts:144` · `videoLocalize.test.ts:143` · `stable/migrations/tests/imageExternalize.test.ts:84`）⇒ **不许据本条把它们当违规删掉**。

**边界（对方未搬 ⇒ 保留仓外指针，禁省略）**：`ADR-0011`（收口验收：载体账 N→M —— 落地本条时按它数"深拷贝实现份数"）· `ADR-0009`（已搬入 `ADR-0009`：深模块判据）。与 `ADR-0006` 的关系：JSON 往返"丢了字段还继续跑"属兜底形态②（失败归一空值）的一种 ⇒ 两条同向，**本条管数据拷贝形态，`ADR-0006` 管失败表达**。

**落点**：`src/core/model/defaults.ts`（在册违规，待处置）· `core/rules/clipboard.ts` · `state/slices/canvas.ts`（正确先例）· `.codebuddy/commands/架构师写新业务代码.md`（指针）。

## 后果

- ✅ **收益**：类型诚实（无 `as T`）· 不再静默丢数据 · 失败可见（根部抛错）· 深拷贝实现份数可数（目标 1）。
- ⚠️ **代价 / 行为变化**：含 `Date` 的数据由「变字符串」改为「保留 `Date`」；含 `Map`/`Set` 的由「变 `{}`」改为「保留」⇒ **新**消费方若依赖旧的归一化语义，必须显式走 JSON 序列化（那是**持久化层**的职责）。
- ⚠️ **回潮风险**：为"能塞进 localStorage"而顺手改回 JSON 往返 —— 持久化层的问题不许拿深拷贝解决。
- 📌 **违反时的判据**：
  1. `JSON.parse(JSON.stringify(` 出现在**深拷贝**语境（**须人读确认**：测试快照不算）⇒ 违规；
  2. 包装器里出现 `as T` 或 `JSON.` ⇒ 违规；
  3. 出现第三份深拷贝实现（裸 `structuredClone` 之外另造包装器）⇒ 违规。
  ⚠️ **诚实边界**：上述**不可机器判定**（同一形态在测试里合法）⇒ 按 `ADR-0002` 第 6 级给人工判据，**禁硬凑 grep**。
