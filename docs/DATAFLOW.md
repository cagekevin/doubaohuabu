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
        host   = hasElectronHost() ? electron(window.api) : mock   （container.ts:35，**运行期判定**）
        site / clock / storage 各自唯一实现
  → bootstrap/hydrate                  【读键 → 启动归位 → 只写 changed 的键 → 灌入 store】
        stable/contracts/keys.ts       20 键唯一真源（LsKey 字面量联合）
        stable/migrations/resetStaleJobs  启动归位（清在途任务；**不是**"迁移"）
  → state/store（zustand 5）            【唯一写入点】
```

**关键边**：`container → hydrate → store`；`hydrate` 是**唯一**批量写 store 的启动入口（不经 usecase，因为它写的是"装载"而非"业务动作"）。
⚠️ 现状（2026-10-10）：原「5 条启动迁移 + `runMigrations`」已按 TD-16-2 删除；`hydrate` 以 `store.useStore.setState` 直写（**非** state action）—— 见 TD-16-7。

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
展示：constants/failure.ts            → reason → 文案映射（FAIL_LABEL / BACKEND_ERROR_LABEL 真源）
      constants/text.ts               → 再导出上述映射（UI 侧入口）
   ↓
渲染：ui/common/ErrorBanner · ToastHost
```

**可执行检查**：`npm run lint`（eslint）—— 空 `catch {}`（`no-empty`）0 命中；`core/usecases` 无 `message:` 属性字面量（「原则6」AST 选择器）。
⚠️ **2026-10-11 更正**：原「文本不变量闸」（`scripts/check-invariants.cjs` / `npm run lint:invariants`）**已退役** ⇒ 这两条检查现由 **eslint（AST）** 承载。
⚠️ 现状：换成 AST 后，后者**仍只匹配 `message:` 属性形态** ⇒ 依旧漏 `err(reason, 字面量)`（如 `usecases/generate.ts:125/133`）—— 见 TD-16-9（**该盲区未随退役而修复**）。

---

## 四、状态写入链（原则 1）

```
ui/**  →  调用 state 暴露的 action  →  state/**（唯一写入点）
core/usecases  →  只返回 Result<T>（不得写 store）
adapters/**    →  只转发事件（subscribeXxx(cb): () => void），不得写 store
```

**关键边**：`ui` 不得 `useStore.setState()` 直改；`core/usecases` 不得 import `state`（反向依赖 = 环）。

⚠️ 现状（2026-10-10，两处偏离本链，均无机器守卫）：
- `bootstrap/container.ts:84/85` 与 `bootstrap/hydrate.ts:38/61/69` 以 `useStore.setState` **直写**（非 state action）—— 见 TD-16-7。
- `ui/shell/TopBar.tsx:24` 与 `ui/panels/LibraryPanel.tsx:31` 经 `usePorts()` **直调 `host.file.*`**，绕过 `state → usecases` —— 见 TD-16-8。

---

## 五、画布链（M2 已落地）

```
ui/canvas/CanvasHost.tsx        【ReactFlow 宿主；8 类节点经 ui/nodes 注册】
  → state/slices/canvas          【唯一写入点：nodes / edges / library + undo 栈】
       ├─ core/rules/undo        【撤销栈纯逻辑（快照时机 = 变更之前）】
       ├─ core/rules/graph       【连线环检测 applyConnection / detachConnection】
       └─ core/rules/project     【makeNodeId】
  → state/store 的 setPartial     【画布 → 工程的镜像：唯一同步点（store.ts:48-62）】
```

**关键边**：`ui → state`（ui 不得 import `adapters`）；`state/store.setPartial` 是 `projects[activeId].data` 的唯一同步点；纯规则全在 `core/rules`（`state/slices/canvas` 只接线 + 注入时钟）。

---

## 六、生成链（M5 / M6 已落地）

```
ui/panels/GenPanel.tsx          【触发】
  → state/generate（GenController）【唯一把生成结果写进 store 的地方（原则 1）】
  → core/usecases/generate         【编排：网页通道 / API 通道 + 失败决策】
       ├─ core/rules/{payload,prompt,accountPool,failure}（纯规则）
       ├─ ports.sites[account.type].send → adapters/site/{doubao,dola,lovart}（volatile）
       └─ ports.host.api.jobSubmit / jobBatch → adapters/host/electron/api
```

**关键边**：`state/generate → usecases/generate → ports`；站点适配器**收注入 `HostPort`**（TD-05-1），注册表 `adapters/site/registry.ts:25-31`。

---

## 七、宿主真实实现（M4 已落地）

```
bootstrap/container.ts:35       【真实宿主优先】
   hasElectronHost() ? adapters/host/electron（唯一接触 window.api） : adapters/host/mock
  → 注入 state / usecases（端口的唯一实现处）
```

**关键边**：`window.api` 只允许出现在 `adapters/host/electron/**`；`ProjectPort.saveBackup/saveSnapshot/logOperation` 与 `MediaPort.saveImageSync` 均为 `Result`（TD-04-2）。

---

## 八、媒体链（M3：**外置 / 缩略图已接线，去重 / 遮脸未接线**）

| 环节 | 落点 | 现状 |
| --- | --- | --- |
| 图片外置（base64 → `img://`） | `stable/migrations/imageExternalize`（`externalizeProjectImages`）← `usecases/persistProject:72` | ✅ 已接线 |
| 缩略图（`?w=`） | `stable/protocols/img.ts`（`withThumb`）← `ui/common/Thumb` | ✅ 已接线 |
| 去重（精确哈希 / 感知哈希） | `core/rules/dedupe.ts`（`createDedupe`） | ⚠️ **生产 0 消费**（仅 tests）—— TD-16-11 |
| 遮脸 / 马赛克 | `adapters/media/facemask.ts` + `core/rules/facemask.ts` | ⚠️ **生产 0 消费**（仅 tests）—— TD-16-11 |

---

## 九、端到端（M7 已落地）

接 Electron 跑通（冒烟脚本 `scripts/verify-*.cjs`）。进度真源 = `docs/00-进度台账.md`。

> 每落地一个里程碑，**在本文件补对应链路**（同时更新 `docs/11` §八 的落点表），别等到审计时才发现地图过期。

---

## 十、宿主事件回灌链（M8 已落地）

```
adapters/host/electron/api.onJobEvent(cb)   【只订阅、只转发（原则 2）】
  → state/subscriptions.ts:42-45            【★ 唯一写入点：全仓宿主订阅只许出现在本文件】
  → settings.upsertApiJob(job)              【按 id 覆盖 / 追加（state/slices/settings.ts:72-76）】
  → state/store
```

**关键边**：`onJobEvent` 是 `ApiPort` 唯一的订阅方法；`state/subscriptions.ts` 由 `container.ts:102` 装配一次（`createSubscriptions`）。
**同文件头注列出的待接线**：`host.clipboard.onChanged`（剪贴板图片，M11）· `host.media.onDolaMedia`（无水印资源，**需先扩 `HostPort`**）。

---

## 十一、文件 / 素材链（M2+ 已落地）

```
ui/shell/TopBar.tsx:24          → ports.host.file.saveFile(json)     【导出当前工程】
ui/panels/LibraryPanel.tsx:31   → ports.host.file.importFiles()      【从文件添加素材】
   → state/slices/canvas: commit('library') + setLibrary(...)         【唯一写入点】
   → state/store 的 setPartial                                       【镜像进 projects[activeId].data】
缩略图：ui/common/Thumb → stable/protocols/img.withThumb(?w=)         【不加载原图，docs/10 #7】
```

**关键边（⚠️ 现状偏离）**：前两条**从 `ui` 直接调端口**，绕过 `state → usecases`（见 §四 现状偏离 · TD-16-8）；素材入库后经 `canvas` slice 正常落库。

---

## 十二、未接线（**有实现、无链路**）

> 下列模块**已实现且有单测，但生产代码 0 消费** ⇒ 画不出链（是"缺口"，不是"漏画"）。
> ⚠️ `find-dead` 抓不到它们：它把**测试引用**也算作引用（另：`index.` 关键字文件直接跳过）。

| 层 | 未接线 | 证据（2026-10-10 实测） |
| --- | --- | --- |
| `core/rules` | `fingerprint` · `sendGuard` · `replyKind` · `genProgress` · `license` · `node` | 全部符号只出现在 `core/rules/tests/**` |
| `core/rules` | `dedupe`（`createDedupe`）· `facemask` | 同上 —— TD-16-11 |
| `core/rules` | `refs` 的 3 个文本操作（`parseRefChips` / `renumberRefs` / `refsToReferenceLabels`） | 仅 tests；`REF_CHIP_RE` 已被 `prompt.ts:21` 复用 |
| `adapters/media` | `facemask.ts`（`applyFaceMask`） | `refs` 0 引用 —— TD-16-11 |
| `HostPort.account` | `ensureFingerprint` · `ensurePlainSession` · `ensureLovartContainer` · `clearSession` · `setProxy` · `fpNetDiag` | 全仓 `host.account.*` 0 命中 |
| `HostPort.license` | `getMachineCode` · `getStatus` · `activateWithCode` · `exportMachineCode` | 全仓 `host.license.*` 0 命中（`StartPage` 不涉许可） |
| `HostPort.file` | `loadFile` · `selectFolder` · `downloadFile` · `downloadFileAs` · `openExternal` · `revealPath` | 0 命中（只用 `saveFile` / `importFiles`） |
| `HostPort.clipboard` | `readImage` · `writeImage` · `onChanged` | 0 命中（只用 `attachImages` / `pasteToWebview`） |
| `HostPort.media` | `saveVideoFromUrl` · `resolveImageRef` · `captureRect` · `showInFolder` · `startFileDrag` · `clearBrowserCache` | 0 命中（只用 `saveImageSync` / `imageFetchDataUrl` / `scanFrames`） |
| `HostPort.api` | `providersList` · `configGet` · `configSet` · `configSetKey` · `configSetSecret` · `configTest` · `jobCancel` · `jobList` · `setupGet` · `setupSet` | 0 命中（只用 `jobSubmit` / `jobBatch` / `onJobEvent`） |

---

## 十三、已退役

| 链路 / 机制 | 退役于 | 原因 |
| --- | --- | --- |
| （暂无） | — | — |
