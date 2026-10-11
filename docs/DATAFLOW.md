# DATAFLOW · 数据流现状（链路拓扑）

> **本文件只回答一件事：谁经过谁。** 判据不在这里（判据 → `docs/adr/`）；红线不在这里（红线 → `docs/11-架构与契约定稿.md` §三/§六/§六·五）。
> **不放灯**：审计进度灯在 `daily/架构日志/`（细粒度在轮次文件覆盖度表，区域级由 `index.md` 派生）。
> **唯一入口**：链路漂移时改本文件。

---

## 维护规矩

1. **只写现状**：改本文件 = 现实链路变了；不是"我觉得应该这样"。
2. **关键边必须可取证**：每条边写**唯一入口函数名**（`文件` + 符号名）—— **不写行号**（行号易漂）；不用"大概/可能"。
3. **与 `判据登记表.md` 成对读**：本文件说"谁经过谁"，判据表说"哪件事归谁定、副本几份"。**读一张、只更新一张 = 亲手让两面地图不一致。**
4. **冲突以代码取证为准**，并改正错的那张。
5. **不写过程叙事**：轮次 / 日期 / 审计经过归 `daily/架构日志/`；本文件只放**现状**（禁追加 `更新(<日期>…)` 叙事段）。

---

## 一、启动 / 水合链（M0 · M1 已落地）

```
bootstrap/main.tsx
  → bootstrap/container.ts            【装配：唯一知道用哪个 adapter 的地方】
        host = hasElectronHost() ? adapters/host/electron（window.api） : adapters/host/mock   （运行期判定）
        site / clock / storage 各自唯一实现
  → bootstrap/hydrate                  【读键 → 启动归位 → 只写 changed 的键 → 灌入 store】
        stable/contracts/keys.ts       20 键唯一真源（LsKey 字面量联合）
        stable/migrations/resetStaleJobs  启动归位（清在途任务；**不是**"迁移"）
  → state/store（zustand 5）            【唯一写入点】
```

**关键边**：`container → hydrate → store`；`hydrate` 是**唯一**批量写 store 的启动入口（不经 usecase，因为它写的是"装载"而非"业务动作"）。
★ 写入形态：`hydrate`（bootstrap）**经具名 action** `state/slices/global.loadHydrated` **一次原子灌入** —— store 的对外句柄 `AppStoreHook` **类型上不含 `setState`** ⇒ 直写**编译不过**（原则 1 的结构承载，不是闸）。

---

## 二、持久化链（M1 已落地）

```
state 变更（slices）
  → state/persist                      【何时存：防抖 600ms（ClockPort）+ beforeunload flush + 失败写 store】
        ├─ core/usecases/persistProject    【工程：序列化 → 图片外置 → 写键 → 备份/快照】
        ├─ core/usecases/persistAccounts   【账号列表落盘】
        └─ core/usecases/persistLsKey      【单键落盘通用件（判据 C1）← 画廊 / 体检历史 / 预设】
  → core/ports/storage.port.ts          【端口：只有类型】
  → adapters/storage/local              【唯一实现：localStorage（磁盘快照经 HostPort.project）】
  → bootstrap/hydrate.ts                【读回：画廊 `?? {}` · 体检历史 `?? []` · 预设 `?? []`】
```

**关键边**：
- 防抖窗口与 `beforeunload` flush **同址**在 `state/persist`（`ClockPort` 注入，可单测）。
- 失败**不吞**：写 `saveError`（原则 6 错误透传）。
- 图片外置（base64 → `img://`）在 `usecases/persistProject` 内调 `HostPort.media.saveImageSync`，**唯一出口**。
- 画廊（`LS_LOVART_GALLERIES`）· 体检历史（`LS_SCAN_HISTORY`）· **预设（`LS_PRESETS`）** 经 **`usecases/persistLsKey`**（判据 C1：单键落盘第 2 处抽出，不复制第二份）。
- ★ **预设（2026-10-11 接通）**：`slices/global.presets` ⇄ `doubao-presets`。**写方** = 导入工程并入（`state/projectOps`）+ 文本节点「保存预设」按钮（`slices/global.addPreset` ← `ui/nodes/TextNode`）；**读方** = 导入时按 `id` 判重（`usecases/importProject` 的 `existingPresets`）。⚠️ UI 侧读方（拆分挑预设 / 提示词预设列表）**未落**（`docs/13`）。

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
⚠️ 现状：后者**仍只匹配 `message:` 属性形态** ⇒ 漏 `err(reason, 字面量)` ⇒ 见 TD-16-9。

---

## 四、状态写入链（原则 1）

```
ui/**  →  调用 state 暴露的 action  →  state/**（唯一写入点）
core/usecases  →  只返回 Result<T>（不得写 store）
adapters/**    →  只转发事件（subscribeXxx(cb): () => void），不得写 store
```

**关键边**：`ui` 不得直改 store；`core/usecases` 不得 import `state`（反向依赖 = 环）。

★ **结构承载（原则 1）**：store 的对外句柄 `AppStoreHook`（`state/store.ts`）**类型上不含 `setState`** ⇒ 非 `state/**` 直写**编译不过**（tsc 报 `TS2551`）；写入一律经**具名 action**（`setSaveError` / `setAccounts` / `pushBackendError` / `loadHydrated` …），且全部过镜像点 `setPartial`。**不建闸**。
✅ 现状（**`ui` 经端口直调已清零**）：`ui` 不再持 `Ports`（`usePorts` 已从 `@/state` 删除）；宿主能力经 `state/hostOps` 等控制器 —— 见 §十八。

---

## 五、画布链（M2 已落地）

```
ui/canvas/CanvasHost.tsx        【ReactFlow 宿主；8 类节点经 ui/nodes 注册】
  → state/slices/canvas          【唯一写入点：nodes / edges / library + undo 栈】
       ├─ core/rules/undo        【撤销栈纯逻辑（快照时机 = 变更之前）】
       ├─ core/rules/graph       【连线环检测 applyConnection / detachConnection】
       ├─ core/rules/project     【makeNodeId / makeLibraryId】
       └─ core/rules/arrange     【选中节点网格排布 planSelectedGrid（右键「自动排列」）】
  → state/store 的 setPartial     【画布 → 工程的镜像：唯一同步点】

复制 / 粘贴：CanvasHost（Ctrl/⌘+C/V）→ canvas: copyNodes / pasteNodes + clipboard   【{nodes,edges} 内存态，源亦不落盘】
剪贴板图片回落：CanvasHost.pasteClipboardImage → hostOps.readClipboardImage → addMaterialFromDrop   【图仍落 img://；TD-16-95 已结】
拖放：CanvasHost → lib/readDroppedFile → addMaterialFromDrop
右键菜单：ui/canvas/NodeContextMenu → canvas.arrangeSelectedNodes / pasteNodes · hostOps.revealPath
```

**关键边**：`ui → state`（ui 不得 import `adapters`）；`state/store.setPartial` 是 `projects[activeId].data` 的唯一同步点；纯规则全在 `core/rules`（`state/slices/canvas` 只接线 + 注入时钟）。

---

## 六、生成链（M5 / M6 已落地）

```
ui/panels/GenPanel.tsx          【触发】
  → state/generate（GenController）【唯一把生成结果写进 store 的地方（原则 1）】
  → core/usecases/generate         【编排：网页通道 / API 通道 + 失败决策】
       ├─ core/rules/{payload,prompt,accountPool,failure}（纯规则）
       ├─ ports.sites[account.type].send → adapters/site/doubao（同一工厂产出 doubao / dola）· adapters/site/gpt（volatile）
       └─ ports.host.api.jobSubmit / jobBatch → adapters/host/electron/api
```

**关键边**：`state/generate → usecases/generate → ports`；站点适配器**收注入 `HostPort`**（TD-05-1），注册表 `adapters/site/registry.ts`（`createSiteRegistry`）。

---

## 七、宿主真实实现（M4 已落地）

```
bootstrap/container.ts 的 hasElectronHost()   【真实宿主优先】
   hasElectronHost() ? adapters/host/electron（唯一接触 window.api） : adapters/host/mock
  → 注入 state / usecases（端口的唯一实现处）
```

**关键边**：`window.api` 只允许出现在 `adapters/host/electron/**`；`ProjectPort.saveBackup/saveSnapshot/logOperation` 与 `MediaPort.saveImageSync` 均为 `Result`（TD-04-2）。

---

## 八、媒体链（M3：**外置 / 缩略图已接线，去重 / 遮脸未接线**）

| 环节 | 落点 | 现状 |
| --- | --- | --- |
| 图片外置（base64 → `img://`） | `stable/migrations/imageExternalize`（`externalizeProjectImages`）← `core/usecases/persistProject` | ✅ 已接线 |
| 缩略图（`?w=`） | `stable/protocols/img.ts`（`withThumb`，**只对 `img://` 拼**）← `ui/common/Thumb` · `ui/nodes/MaterialNode` · `ui/panels/{GalleryCard, NewImagesThumb, NewImagesPanel}`（另 `core/rules/richText` 的 chip 也经它） | ✅ 已接线 |
| 去重（精确哈希 / 感知哈希） | `core/rules/dedupe.ts`（`createDedupe`，唯一上游 `lib/phash.ts`） | ⚠️ **生产 0 消费**（仅 tests）—— TD-16-11 |
| 遮脸 / 马赛克 | `adapters/media/facemask.ts` + `core/rules/facemask.ts` | 已接线：`MediaPort.applyFaceMask` ← `state/hostOps` ← `ui/nodes/FaceMarksLayer` |
| 人脸检测 | `adapters/media/faceDetect.ts` + `core/rules/faceDetect.ts` | 已接线：`MediaPort.detectFaces` ← `state/hostOps` ← `ui/nodes/FaceMarksLayer` |

---

## 九、端到端（M7 已落地）

接 Electron 跑通（冒烟脚本 `scripts/verify-*.cjs`）。进度真源 = `docs/00-进度台账.md`。

> 每落地一个里程碑，**在本文件补对应链路**（同时更新 `docs/11` §八 的落点表），别等到审计时才发现地图过期。

---

## 十、宿主事件回灌链（M8 已落地）

```
adapters/host/electron/api.onJobEvent(cb)   【只订阅、只转发（原则 2）】
  → state/subscriptions.ts（createSubscriptions）  【★ 唯一把宿主事件**写进 store** 的订阅点（不写 store 的宿主订阅可住 ui —— 见 §五 CanvasHost 的剪贴板时间戳）】
  → settings.upsertApiJob(job)              【按 jobId 覆盖 / 追加】
  → core/usecases/applyApiJobEvent          【纯决策：事件 + 当前节点 → 「要做哪些事」】
  → state/slices/apiLanding.ts（canvas 片） 【★ 落点，顺序逐条对源】
      addToLibrary → attachVideoResultToNode → patchNodeData → attachImageResultToNode → pushToast
  → state/store
```

**关键边**：`onJobEvent` 是 `ApiPort` 唯一的订阅方法；`createSubscriptions` 由 `container.ts` 装配一次。
**决策与落点分开**：`applyApiJobEvent` **零 store 依赖**（原则 4）；写入只发生在 `state/`（原则 1）。
**已接线（2026-10-11）**：`usecases/applyApiJobEvent` 的产物落点 —— 至此「API 出片落画布」闭环。
**仍待接线**：仅 `host.media.onDolaMedia`（无水印资源，**需先扩 `HostPort`**）。★ `host.clipboard.onChanged` + `readImage` 已接但**不写 store**（`state/hostOps` ← `ui/canvas/CanvasHost`：Ctrl+V 图片回落 + 失焦/剪贴板时间戳，TD-16-95 已结）——故本文件仍是唯一 store 写入点；
⚠️ 决策的 `feed` 字段**有意不落**（源 `imageGenFeed` 无读者，判据 B5）—— TD-16-84。

---

## 十一、文件 / 素材链（M2+ 已落地；★ 已收口）

```
ui/shell/TopBar.tsx             → hostOps.saveTextFile(json)          【导出当前工程】
ui/panels/LibraryPanel.tsx      → hostOps.importFiles()               【从文件添加素材】
   → state/hostOps                  【★ ui 需要的 ports.host.* 唯一落点（只转发，不写第二份判据）】
   → ports.host.file.{saveFile, importFiles}
   → state/slices/canvas: commit('library') + setLibrary(...)         【唯一写入点】
   → state/store 的 setPartial                                       【镜像进 projects[activeId].data】
缩略图：ui/common/Thumb → stable/protocols/img.withThumb(?w=)         【★ 只对 img:// 拼；不加载原图，docs/10 #7】
工程存储：ui/shell/TopBar（保存路径 / 打开目录 / 占用统计）→ state/projectOps → usecases/projectStorage → ports.host.project.{pickStorage,revealStorage,getStorageSize,activateStorage}
导入工程：ui/pages/StartPage → state/projectOps.importProjectFile → usecases/importProject → state/slices/global.addImportedProject
下载（gv-dl）：ui/nodes/{GenVideoNode,GenImageNode} → hostOps.downloadFileAs → ports.host.file.downloadFileAs   【成功 toast 的「在文件夹中显示」→ hostOps.revealPath；NodeContextMenu 同用】
```

**关键边**：前两条**已不再从 `ui` 直调端口** —— 改走 `state/hostOps` 控制器（`usePorts` 已从 `@/state` 删除，`ui` **结构上拿不到 `Ports`**）。素材入库后经 `canvas` slice 正常落库。详见 §十八。

---

## 十二、未接线（**有实现、无链路**）

> 下列模块**已实现且有单测，但生产代码 0 消费** ⇒ 画不出链（是"缺口"，不是"漏画"）。
> ⚠️ `find-dead` 抓不到它们：它把**测试引用**也算作引用（另：`index.` 关键字文件直接跳过）。
> ⚠️ **判"未接线"必须追到链尾**：端口方法**被某个 `core/usecases` 调用 ≠ 已接线** —— 还要看**该用例本身有没有生产消费方**。例（**2026-10-11 换例**）：`MediaPort.resolveImageRef` / `showInFolder` **无任何调用方**（连用例层都没有）⇒ 未接线。（**原例已失效**：`saveVideoFromUrl` ← `usecases/localizeVideos` 那条链**已接线**，见本表。）

| 层 | 未接线 | 证据 |
| --- | --- | --- |
| `core/rules` | `node`（部分） | ★ **已接线（2026-10-11）**：`replyKind`（`classifyReply`）· `genProgress`（`resolveGenProgress`）—— 由 `state/sendQueue` 的**排队追问链**消费（← `ui/panels/SendQueuePanel`）。仍仅 tests：`selfCheckDefaults` / `NODE_TYPES`（`validateNodes` 已接 `bootstrap/hydrate`） |
| `core/rules` | `dedupe`（`createDedupe`，及其唯一上游 `lib/phash.ts`） | `dedupe` 0 消费 —— TD-16-11 |
| `core/rules` | `refs` 的 `renumberRefs` | 0 生产消费；`refs` 其余纯规则**已接线**（`parseRefChips` / `refsToReferenceLabels` / `matchRefTrigger` / `toRefMarker` / `filterRefCandidates` —— 消费方 `ui/nodes/TextNode` · `ui/nodes/RefAutocomplete` · `ui/panels/GenPanel` · `state/batchSend` · `core/rules/accountNode`） |
| `core/rules` | `fingerprint`（整文件，`COLLISION_LEVEL_LABEL` 所在）· `media` · `videoLocalize` · `index`（barrel） | `fingerprint` / `media` / `index` **整文件 0 生产消费**（knip 判死，已核）；`videoLocalize` ★ **已接线（2026-10-11）**（← `state/localizeOps` ← `usecases/localizeVideos`）。★ **已接线（2026-10-11）**：`genHistory`（`patchGenHistoryAttempt` / `appendGenHistoryAttempt` ← `usecases/applyApiJobEvent` + `state/slices/apiLanding`） |
| `adapters/media` | `facemask.ts`（`applyFaceMask`） · `faceDetect.ts`（`detectFaces` / `detectFacesInImage`） | 已接线（链路见上表）：`MediaPort` ← `state/hostOps` ← `ui/nodes/FaceMarksLayer` |
| `adapters/site/doubao/scripts.ts` | `READ_INPUT_SCRIPT` · `DEEP_QUERY_SCRIPT` · `DOLA_FORCE_SCRIPT`（后两者含**桩**） | **死导出**（在 `dead-code-baseline.json`） |
| `adapters/site/tapnow/api.ts` | `tapnowListCanvases` · `tapnowCurrentCanvasId` | 死导出（画布节点 API 抓取未接） |
| `lib` | `url` · `selection`（**直接 0 消费**） · `hash` · `phash`（**传递性**：仅被未接线模块 `dedupe` 引用）。⚠️ **`image` 已接线**（2026-10-12 复核：`adapters/media/facemask.ts:28` · `adapters/media/faceDetect.ts:41` · `ui/nodes/GenVideoNode.tsx:82` 消费）—— 原写"传递性"是**表漂移** | 见 `dead-code-baseline.json` |
| `core/usecases` | （本行原为 `localizeVideos`） | ★ **`localizeVideos` 已接线（2026-10-11）**：`state/localizeOps` ← `state/generate`（写完 `resultUrl` 后）＋ `container.startVideoBackfill()`（启动 5s 全量回填）。其余已接线：`license` · `scanGallery` · `prepareSession`（`state/accountOps`）· `sendQueue`（`state/sendQueue`）· `importProject` · `projectStorage`（均经 `state/projectOps` ← `ui/pages/StartPage` · `ui/shell/TopBar`）· **`apiConfig`（2026-10-11 ← `state/apiOps` ← `ui/panels/ApiSettings`）** |
| `lib/captureRegistry` | `clearCaptureRegistry` | 0 生产 / 0 测试消费（幽灵导出）—— TD-02-3 余项 |
| `ui/common` | `ContextMenu.tsx`（**整文件幽灵**：全仓 0 `import`） | 0 生产 / 0 测试消费（⚠️ 与已接线的 `ui/canvas/NodeContextMenu.tsx` 是**两个文件**） |
| `HostPort.clipboard` | —（全族已接线） | ★ `writeText`（`hostOps.copyText`）· `readImage` + `onChanged`（`hostOps` ← `ui/canvas/CanvasHost`：Ctrl+V 图片回落 + 时间戳）· `writeImage`（`adapters/site/shared/attachImage` ← `doubao/analyze` 附参考图回落档）· `attachImages`（`doubao` / `gpt` 发送链） |
| `HostPort.file` | —（全族已接线） | ★ `loadFile` / `selectFolder` / `downloadFile` / `openExternal` / `saveFile` / `importFiles`（原已接线，均经 `state/hostOps` 除 `loadFile`）+ `downloadFileAs` / `revealPath`（`hostOps` ← `GenVideoNode` / `GenImageNode` 的 `gv-dl` + `NodeContextMenu`，2026-10-11） |
| `HostPort.media` | `resolveImageRef` · `showInFolder` | ★ **`saveVideoFromUrl` 已接线（2026-10-11）**（← `state/localizeOps`）；其余 0 命中。**已接线**：`captureRect`（`state/capture`）· `clearBrowserCache`（`state/accountOps` ← `AccountPanel`）· `startFileDrag`（`state/hostOps.dragFileOut` ← `NewImagesPanel`）。⚠️ 右键菜单把源的 `showInFolder` 改道走 `revealPath`（端口方法本身仍 0 消费） |
| `HostPort.api` | `jobCancel` · `jobList` | 0 生产消费。★ **已接线（2026-10-11）**：`providersList` / `configGet` / `configSet` / `configSetKey` / `configSetSecret` / `configTest` / `setupGet` / `setupSet`（`state/apiOps` ← `ui/panels/ApiSettings`）+ `jobSubmit` / `jobBatch` / `onJobEvent`（生成链 / 订阅） |
| `BackendPagePort` | `isMounted` · `runScript` · `reload` · `setMuted` | 0 生产消费（仅实现处 + tests）；已接线：`prepareForSend` / `release` / `probeFingerprint` |

**已接线（不在本表）**：`core/rules/fingerprintDiagnosis` · `core/rules/fingerprintScan`（`ui/panels/AccountPanel` · `ui/panels/FingerprintScanPanel`）· `core/rules/fingerprintGenerator`（`bootstrap/container` · `state/slices/global`）· `core/rules/sendGuard`（`adapters/site/gpt`）· `core/rules/license`（`bootstrap/main` · `ui/pages/ActivatePage`）· `HostPort.account` 全族（`ui/panels/BackendView` + `usecases/prepareSession` ← `state/accountOps`）· `HostPort.license` 全族（经 `state/licenseOps`）· `HostPort.media.startFileDrag`（`state/hostOps.dragFileOut`）· `HostPort.clipboard.writeText`（`state/hostOps.copyText`）。

---

## 十三、素材抓取链（M11 / M13 已落地）

```
ui/panels/NewImagesPanel.tsx        【「立即抓取」按钮】
  → state/accountOps.scanGallery      【逐账号扫描；失败原样上报（原则 6）；写库走 addLovartImages】
  → core/usecases/scanGallery         【编排：查站点适配器 → SitePort.scan → 映射成 LovartImageInput】
  → ports.sites[type].scan            【volatile：适配器内部 frames→webview 降级链】
       → adapters/site/shared/materializeScan（scanAttemptFromRaw；内部 materializeScannedImages 逐张落盘）
                                     【落盘成 `img://`（ref）；落不出 ⇒ failed++，不编造引用】
  → state/slices/gallery.addLovartImages        【唯一写入点：去重由纯层兜底】
  → state/persist → usecases/persistLsKey(LS_LOVART_GALLERIES)   【落盘（见 §二）】
```

**自动值守（显式调用，编排层驱动）**：

```
ui/panels/NewImagesPanel.tsx        （开关）→ state/accountOps.setAutoWatch(on)
  → core/rules/autoWatch              【纯决策：抖动 / 退避 / 空转上限；节奏由 adapter 声明】
  → ports.clock（setTimeout）         【定时器在编排层，非适配器（docs/11 §六 约束 4）】
  → 复用 scanGallery（判据 C1：手动与值守共用同一条）
```

**关键边**：
- 「谁能值守」= `SitePort.autoWatch?` **能力声明**（`tapnow` 声明、`lovart` 刻意不声明 —— 风控 `docs/10` #11 / `electron/main.js`「Lovart 容器隔离」章）；`core` / `state` / `ui` **零站点名判断**（注册制）。
- 扫描枚举真源 = `core/rules/scanChain.ts`（`SCAN_CHAIN` / `SCAN_PHASES` / `SCAN_SCOPES`）；端口只 `import type` 转发（TD-04-4）。
- ⚠️ DEV 现状：mock 的 `imageFetchDataUrl` 恒 `ok(null)` ⇒ 抓取必然「没有新的图」（mock 不撒谎）。端到端要在 Electron 里跑 `scripts/verify-*.cjs`。

---

## 十四、截图链（M11 / M13 已落地）

```
ui/nodes/VideoNode.tsx              【「截图」按钮】
  → lib/captureRegistry               【nodeId → HTMLElement（<video> 登记 / 注销）】
  → state/capture（CaptureController）【取元素 → 算矩形 → 宿主截图 → 落素材节点】
       ├─ core/rules/capture（toCaptureRect）   【纯：DOM 矩形 × dpr；宽或高 < 2px ⇒ null】
       └─ ports.host.media.captureRect          【宿主截图】
  → state/slices/canvas.addScreenshotMaterial   【唯一写入点】
```

**关键边**：`state/capture` 返回 `{ok, reason}`（源版静默 `null` ⇒ 本工程如实上报，否则用户反复点）；`dpr` 由 `bootstrap` 注入（`state` 不读 `window`）。

---

## 十五、画廊链（M12 已落地，四层齐备）

```
ui/panels/AccountPanel「画廊」→ ui/panels/GalleryPanel.tsx（覆盖层）
  → state/slices/gallery            【唯一写入点：add / remove / clear / purge 七 action；无变化不写】
  → core/rules/lovartGallery        【纯：addLovartImages / removeLovartImages / purge* / captureImageName / captureSource】
  → state/persist → persistLsKey(LS_LOVART_GALLERIES)   【落盘（同 §二）】
  → bootstrap/hydrate               【读回（?? {}）】

「添加到画布 (N)」→ state/slices/canvas.addMaterialsBatch
  → state/slices/materialBatch（buildMaterialBatch）   【判据 C1：主体抽片】
       ├─ core/rules/materialGrid   【网格布局纯规则（planMaterialGrid / fitMaterialSize / autoPlaceCenter）】
       └─ persistImage（MediaPort.saveImageSync，同步 IPC，不得 await）
  → library 去重 → 建素材节点

大图预览：ui/panels/GalleryLightbox.tsx → hostOps.openExternal
```

**关键边**：持久化形状真源在 `stable/contracts/lsValues.ts`（`LovartGalleriesMap` / `LovartGalleryImage`），`core` 只转发导出。

---

## 十六、账号管理链（M12 / M13 已落地）

```
ui/panels/AccountPanel.tsx
  → state/accountOps                  【控制器：唯一把账号域端口 / 用例接给 ui 的地方】
       ├─ addAccount / removeAccount        → state/slices/global + core/rules/accountRoster
       ├─ probeLogin                        → SitePort.probe
       ├─ prepareWebviewSession             → core/usecases/prepareSession
       ├─ exportAccounts / importAccounts   → core/usecases/accountTransfer + core/rules/accountTransfer
       ├─ saveProxyPool                     → core/rules/proxy + usecases/prepareSession.applyProxyAssignments
       ├─ diagnoseAccount                   → BackendPagePort.probeFingerprint + core/rules/fingerprintDiagnosis
       └─ clearBrowserCache                 → MediaPort.clearBrowserCache

账号指纹生成：core/rules/fingerprintGenerator ← state/slices/global
              （依赖 lib/hostEnv 注入的真实窗口 / GPU —— 不纯那半不进 core）
指纹体检：ui/panels/FingerprintScanPanel → core/rules/fingerprintScan（scanFingerprintCollisions）
              + state/slices/scan（recordScan）→ persistLsKey(LS_SCAN_HISTORY)
分组：ui/panels/GroupManagerModal → state/slices/global（六个 action）+ core/rules/accountGroup
后台视图：ui/panels/BackendView（渲染 .doubao-view-webviews 容器）
              → adapters/site/shared/webview（findWebview）→ 供 send / analyze / scan 复用
```

**关键边**：`state/accountOps` 与 `state/hostOps` / `state/licenseOps` 同法 —— **只转发 + 归一，不写第二份业务判据**（业务在 `core/rules` / `usecases`）。

---

## 十七、发送队列链（M12 收口，五件齐）

```
ui/panels/BatchSendPanel「加入队列」→ state/sendQueue.enqueue
  → core/rules/sendQueuePlan       【入队规划：防重复（同节点 + 90s + 指纹相同 ⇒ 跳过）】
  → state/slices/queue             【唯一写入点：sendQueue.items / paused + accountConcurrency】
  → 泵（state/sendQueue；50ms 节流自触发 + 代次闸）
       → core/rules/sendQueueDispatch  【分发决策：按账号并发 / notBefore / 池分配】
       → core/rules/sendQueueSettle    【结算：成功记指纹 / 失败分类退避重试 / 换号排除表】
       → createSendPipeline（state/batchSend 抽出）  【与批量发送共用 prepare / transport —— 判据 C1】
  → ui/panels/SendQueuePanel.tsx   【面板：deriveGenView ← core/rules/sendQueuePanel】
```

**关键边**：泵与批量发送共用 `createSendPipeline`（否则是两份 `prepare`）；占用释放经 store 的 `holdAccount` / `releaseAccount`（`itemId` 校验）。

---

## 十八、控制器层收口（★ `ui` 结构上拿不到 `Ports`）

```
ui/**  →  只调 state 的能力型 hook
          （useHostOps · useLicenseOps · useAccountOps · useCapture · useAnalyze · useSendQueue …）
          ✗ 不得 usePorts()（已从 @/state 删除）· ✗ 不得 import adapters
state/{hostOps, licenseOps, projectOps, accountOps, capture, analyze, sendQueue}.ts  【控制器：只转发 ports → ui】
bootstrap/container.ts              【唯一装配：端口只在此注入】
```

**关键边**：`grep -rn "ports\.\|usePorts" src/ui` = **空**；`state/context.tsx` 已删 `usePorts`（**结构封堵**，不靠 grep 闸）。

---

## 十九、已退役

| 链路 / 机制 | 退役于 | 原因 |
| --- | --- | --- |
| `ui` 经 `usePorts()` 直调端口 | 控制器收口（§十八） | 收窄 `ui` 可用面：`usePorts` 从 `@/state` 删除 ⇒ 新面板写不出来（结构封堵） |
| `scripts/check-invariants.cjs` / `lint:invariants`（grep 型不变量） | 换 eslint（AST） | 行级文本匹配 → 形态漏检；判据改由 eslint 承载 |
| `scripts/check-host-api.cjs` / `lint:host-api`（W1） | 换 eslint（AST） | 同上 |
