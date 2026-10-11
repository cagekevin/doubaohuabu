# 16 · 跨区 · `presets` 落 store（P1 序 9「共用 store 字段」）

> **日期**：2026-10-11 ｜ **区域**：16（跨区）｜ **触发**：`docs/18-剩余工作优先级排序.md` 的 **P1 序 9**
> **范围**：`doubao-presets` 这个键 —— 它**读都不读、写都不写**，是 3 处功能的**共同落脚点**。
> **红线**：`docs/11` §六·五 原则 1（只有 state 能写 store）· 原则 5（SSOT）· 原则 6（错误透传）

---

## 一、做之前：普查（**债务是线索，不是结论**）

| 线索 | 复测结论 |
|---|---|
| `docs/15` §1 #5：`doubao-presets` **空** | ✅ 属实 —— **`LS_PRESETS` 全仓只在 `keys.ts` / `persistKeys.ts` 出现**，`hydrate` **不读**、`persist` **不写** |
| `docs/15` §2：`GraphPreset` **幽灵形状** | ✅ 属实 —— 只有 `lsValues` 的类型引用 + `mergeImportedPresets`（而它自己也是死路：`projectOps` 传空表） |
| `docs/14` §4：**节点图预设**零消费 | ✅ 属实 |
| `TD-16-69`：导入工程**丢弃预设** | ✅ 属实 —— `projectOps` 传 `existingPresets: []` 且**无处回写** |

### ★ 普查的**新发现**（债里没写）：值形状是**错的**

源 `doubao-presets` 数组**混装两种形状** —— 两者都 `push` 进 `t().presets`、都调 `wo()` 落盘：

| 形状 | 写方 | 判据 |
|---|---|---|
| `{id, name, content}`（**提示词预设**，无 `kind`） | `addPreset` 27863-27873（`CL.jsx:774` 的「保存预设」按钮） | `_Component42.jsx:196` 用 **`p.kind === 'graph'`** 把它**筛掉** |
| `{id, name, kind:'graph', nodes, edges}`（**节点图预设**） | `addNodePreset` 28363-28403（右键菜单） | 同上，筛出来 |

而本仓把它写成 **`GraphPreset[]`** ⇒ 真实用户数据里的**提示词预设会被误标成图预设**（静默失真）。
⇒ 这正是「契约形状」要修的那一条。

---

## 二、改了什么

| 文件 | 改动 |
|---|---|
| `src/stable/model/project.ts` | **新增 `PromptPreset`** + **`Preset = PromptPreset \| GraphPreset`**（形状更正，附源证据） |
| `src/stable/contracts/lsValues.ts` | `'doubao-presets': GraphPreset[]` → **`Preset[]`** |
| `src/core/rules/project.ts` · `usecases/importProject.ts` | `mergeImportedPresets` / `existingPresets` / `addedPresets` 全部改 `Preset` |
| `src/state/slices/global.ts` | **新增 `presets: Preset[]`** + `setPresets` + `HydratedSnapshot.presets` |
| `src/bootstrap/hydrate.ts` | **读回** `PERSIST[LS_PRESETS] ?? []` → `loadHydrated` |
| `src/state/persist.ts` | `PersistSnapshot.presets` + `doWrite` 第 **⑤** 步（`persistLsKey`） |
| `src/bootstrap/container.ts` | `readState` / `pick` 都带上 `presets`（否则改了不落盘） |
| `src/state/projectOps.ts` | **导入工程接线**：`existingPresets: s.presets` + 并入结果**写回** ⇒ **清偿 TD-16-69** |
| `src/core/rules/tests/project.test.ts` | **+1 条**：提示词预设（无 `kind`）也照收（锁住联合形状） |

---

## 三、数清楚（做前 → 做后）

| 口径 | 做前 | 做后 |
|---|---|---|
| store 里的 `presets` 字段 | ❌ 无 | ✅ 有 |
| `doubao-presets` 的**读**方 | **0** | **1**（`hydrate`） |
| `doubao-presets` 的**写**方 | **0** | **1**（`persist` 的 `persistLsKey`） |
| `importProject` 的 `addedPresets` 落点 | **0**（静默丢弃） | **1**（写回 store） |
| 值形状正确性 | ❌ `GraphPreset[]`（会误标真实数据） | ✅ `Preset[]`（联合） |
| `mergeImportedPresets` 的单测 | 4 条 | **5 条**（+联合形状） |

---

## 四、一凭证 · 探针（先红后绿）

```
A「presets 真的进了 PersistSnapshot」：删掉 `presets: Preset[]` → tsc 退出 2 · 命中 presets        ✅
B「presets 真的由 hydrate 读出并灌入」：把局部变量改名 → tsc 退出 2 · 命中 Cannot find name 'presets' ✅
（两者还原 sha256 均一致）
```
> 探针 A 同时证明 `container.readState` **真的**在喂它（多喂一个字段 = 编译不过）。

---

## 五、逐闸凭证

| 闸 | 结果 |
|---|---|
| `typecheck` | ✅ |
| `lint`（改动文件） | ✅ |
| `lint:boundaries` | ✅ **271 模块 / 947 依赖 / 0 违规** |
| `test` | ✅ **1384 / 1384**（+1） |
| `check:dead-code` | ❌ **3 条基线外**（`activateProjectStorage` · `HostOpsController` · `ProjectOpsController`）—— **均非本轮引入**（并发线在飞） |

---

## 六、未落（如实标注 · 判据 B5）

| 缺 | 源 | 为什么现在不落 |
|---|---|---|
| 「保存为节点预设」（右键菜单） | `addNodePreset` 28363 | 右键菜单那一条**整体未落**（`docs/13` §节点右键菜单）⇒ 单落 action 会「无人调」 |
| `save-preset-btn`（提示词预设） | `CL.jsx:774` → `addPreset` 27863 | 属 `TextNode` 工具条，**同批还有别的按钮**未落 ⇒ 归那一批 |
| `splitPresetPicker`（拆分并套用节点预设） | 28524-28546 · `splitApplyPreset` 28646 | 它是**一整套**（弹窗 + 纯层几何 + 应用）；且源只在「有图预设时」才走它 ⇒ 归 P3 |
| 源里提示词预设的**列表 / 套用 UI** | — | **源本身就没有**（`_Component42.jsx:91` 选了 `presets` 却**从未使用**）⇒ 不假装 |

> ⚠️ **`presets` 目前的读方只有「导入判重」**（`projectOps`）。UI 侧读方要等上面那三件 —— 这是**有意的**
> （P1 买的是「落脚点」，不是功能本身；`docs/18` 的排序理由就是这个）。

---

## 七、决策留痕

1. **值形状改联合（而不是新开一个键）**：源把两种预设塞**同一个数组**（靠 `kind` 区分）
   ⇒ 拆成两个键 = **改数据格式**（违背"数据兼容"目标）。只改**类型**，不改格式。
2. **`persist` 每次都写 `doubao-presets`**（哪怕没变）：与 `lovartGalleries` / `scanHistory` **同法**
   —— 本仓的 `persist` 是"整批落盘"，不是"按需落单键"。源是**变更时才写**（`wo()`）⇒ 本仓多写一次**同值**，
   幂等、无副作用（不为此给 `persist` 加"脏标记"机制 —— 那是更大的改造）。
3. **不做 `addPreset` / `addNodePreset` / `loadNodePreset`**：判据 B5 —— 没有 UI 调用方。
4. **`mergeImportedPresets` 的判重仍按 `id`、不分形状**：与源 30025-30033 逐字一致。

---

## 八、落账

- **清偿**：`TD-16-69`（导入工程丢弃预设）
- **成对回写**：`docs/15` §1 #5 / §2 · `docs/14` §4 · `docs/DATAFLOW.md` §二
- **本文件** = 上述债的**锚点**

---

## 九、探债（本轮的债明细真源）

### TD-16-69 · 导入工程丢弃预设 —— **[已解决]**

- **现象**：`state/projectOps` 传 `existingPresets: []`，且 store 无 `presets` 字段 ⇒
  `usecases/importProject` 算出的 `addedPresets` **无处可写**（源版 30034-30040 会并入并落盘）。
- **修法**：见 §二（store 字段 + hydrate + persist + `projectOps` 写回）。
- **凭证**：探针 A/B（§四）· 单测 `mergeImportedPresets`（+1 条联合形状）。

### TD-16-85 · `debt.mjs show` 的状态行在 note 含方括号时打印残段 —— **[待还]**

- **现象**：`resolve` 把 note 写进**状态列的方括号内**（`[已解决 <日期> · <note>]`），而 `show` 的
  状态行按 `^\[[^\]]*\]` 截断 ⇒ note 里一旦出现 `[`（如 `GraphPreset[]`），就只截到那个 `]`
  ⇒ 打印出 `[已解决] 会误标真实数据]` 这种**残段**。
- **影响面**：**仅显示**。`list --status` 用 `^\[(状态词)` 前缀匹配 ⇒ 正常；表结构无损（无裸 `|`）。
- **本轮为什么不动它**：属 `scripts/debt.mjs` 的解析语义，改它要确认「note 在括号内」是不是**唯一**
  格式（历史行可能是另一种）⇒ 零炸（目标之外的事不顺手改）。

