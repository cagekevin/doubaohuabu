# DATAFLOW · 数据流现状（链路拓扑）

> **本文件只回答一件事：谁经过谁。** 判据不在这里（判据 → `docs/adr/`）；红线不在这里（红线 → `docs/11-架构与契约定稿.md` §三/§六/§六·五）。
> **不放灯**：审计进度灯在 `daily/架构日志/`（细粒度在轮次文件覆盖度表，区域级由 `index.md` 派生）。
> **唯一入口**：链路漂移时改本文件；**禁追加 `更新(<日期>…)` 叙事段**（叙事归轮次文件）。

---

## 维护规矩

1. **只写现状**：改本文件 = 现实链路变了；不是"我觉得应该这样"。
2. **关键边必须可取证**：每条边写 `文件:行` 或"唯一入口函数名"，不用"大概/可能"。
3. **与 `判据登记表.md` 成对读**：本文件说"谁经过谁"，判据表说"哪件事归谁定、副本几份"。**读一张、只更新一张 = 亲手让两面地图不一致。**
4. **冲突以代码取证为准**，并改正错的那张。

---

## 一、启动 / 水合链（M0 · M1 已落地）

```
bootstrap/main.tsx
  → bootstrap/container.ts            【装配：唯一知道用哪个 adapter 的地方】
        host   = DEV ? mock : electron(window.api)
        site / clock / storage 各自唯一实现
  → bootstrap/hydrate                  【读键 → 跑迁移 → 只写 changed 的键 → 灌入 store】
        stable/contracts/keys.ts       20 键唯一真源（LsKey 字面量联合）
        stable/migrations/runMigrations  5 条纯函数迁移（按序执行）
  → state/store（zustand 5）            【唯一写入点】
```

**关键边**：`container → hydrate → store`；`hydrate` 是**唯一**批量写 store 的启动入口（不经 usecase，因为它写的是"装载"而非"业务动作"）。

---

## 二、持久化链（M1 已落地）

```
state 变更（slices）
  → state/persist                      【何时存：防抖 600ms（ClockPort）+ beforeunload flush + 失败写 store】
  → core/usecases/persistProject        【怎么存：序列化 → 图片外置 → 写键 → 备份/快照】
  → core/ports/storage.port.ts          【端口：只有类型】
  → adapters/storage/local              【唯一实现：localStorage（磁盘快照经 HostPort.project）】
```

**关键边**：
- 防抖窗口与 `beforeunload` flush **同址**在 `state/persist`（`ClockPort` 注入，可单测）。
- 失败**不吞**：写 `saveError`（原则 6 错误透传）。
- 图片外置（base64 → `img://`）在 `usecases/persistProject` 内调 `HostPort.media.saveImageSync`，**唯一出口**。

---

## 三、错误 / 失败链（横切）

```
生产者：adapters/**、core/rules/**   → 产生 {ok:false, reason, message}（message = 原始原文）
   ↓
消费者：core/usecases → state → ui    → 只能转发，不得改写 / 吞掉 / 编造（原则 6 四条禁止）
   ↓
展示：constants/text.ts               → reason → 文案映射（唯一真源）
   ↓
渲染：ui/common/ErrorBanner · ToastHost
```

**可执行检查**：`npm run lint:invariants`（`catch {}` 0 命中 · `core/usecases` 无 `message:` 字面量）。

---

## 四、状态写入链（原则 1）

```
ui/**  →  调用 state 暴露的 action  →  state/**（唯一写入点）
core/usecases  →  只返回 UsecaseResult<T>（不得写 store）
adapters/**    →  只转发事件（subscribeXxx(cb): () => void），不得写 store
```

**关键边**：`ui` 不得 `useStore.setState()` 直改；`core/usecases` 不得 import `state`（反向依赖 = 环）。

---

## 五、未落地链路（M2~M7，**尚未实现，勿按本文件当现状引用**）

| 链路 | 计划落点（`docs/11` §八 / §十） | 里程碑 |
| --- | --- | --- |
| 画布节点 / 连线 / 撤销重做 | `ui/canvas` + `ui/nodes` + `state/slices/canvas` | M2 |
| 素材与媒体（去重 / 缩略图 / 外置幂等） | `core/rules/dedupe` + `usecases/captureMedia` | M3 |
| 宿主真实实现（替换 mock） | `adapters/host/electron` | M4 |
| 生成（网页通道 / API 通道） | `core/rules/prompt` + `usecases/generate*` | M5 |
| 站点适配（doubao / dola / lovart） | `adapters/site/*`（volatile） | M6 |
| 端到端 | 接 Electron 跑通 | M7 |

> 每落地一个里程碑，**在本文件补对应链路**（同时更新 `docs/11` §八 的落点表），别等到审计时才发现地图过期。

---

## 六、已退役

| 链路 / 机制 | 退役于 | 原因 |
| --- | --- | --- |
| （暂无） | — | — |
