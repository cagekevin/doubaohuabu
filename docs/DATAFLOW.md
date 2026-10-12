# DATAFLOW · 数据流（谁经过谁）

> **本文件只放数据流**：每条链 = **触发 → 经过（`文件` + 唯一入口符号）→ 落点**，外加一句**断点**（这条链哪一段没接）。
> 口径：① 只写**现状**（链路变了才改）；② 不写本仓行号（源出处可写"原版文件:行"，原版不会变）；③ **不引用其他文档**（章节号 / 债号 / 用例号一律不写）。
> 判据、红线、进度、缺口编号**不在本文件**。

## 读法（先看这里）

| 想找什么 | 看哪节 |
|---|---|
| 应用怎么起来、数据怎么灌进来 | §一 |
| 什么时候落盘 / 读回 | §二 |
| 错误从哪来到哪去 | §三 |
| 谁有资格写 store | §四 · §十八 |
| 画布：节点 / 连线 / 撤销 / 复制粘贴 | §五 |
| 出图（网页通道 / API 通道） | §六 |
| 宿主怎么接进来（真机 / mock） | §七 |
| 图片 / 视频 / 缩略图 / 遮脸 / 去重 | §八 |
| 宿主事件（API 任务）回流画布 | §十 |
| 文件 / 素材导入导出 / 工程存储 | §十一 |
| **哪些模块没有链**（0 消费） | §十二 · §二十四 |
| 站点抓取 / 自动值守 | §十三 |
| 截图（后台页快照 / 节点截图） | §十四 |
| 画廊 / 批量加素材 | §十五 |
| 账号 / 指纹 / 后台页租约 | §十六 |
| 发送队列 | §十七 |
| 豆包后台域（视图读面 / 发送 / 检测 / 监测 / 追问） | §十九 ~ §二十四 |

---

## 一、启动 / 水合链

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

**关键边**：`hydrate` 是**唯一**批量写 store 的启动入口（不经 usecase，因为它写的是"装载"而非"业务动作"）。
★ 写入形态：经具名 action `state/slices/global.loadHydrated` **一次原子灌入** —— store 的对外句柄 `AppStoreHook` **类型上不含 `setState`** ⇒ 直写**编译不过**。
启动授权门（旁支）：`bootstrap/main.tsx` 的 Root（**fail-close**：只有 `ok` 放行）⇄ `ui/pages/ActivatePage`（`useLicenseOps`：`readMachineCode` / `checkStatus` / `activateWithCode` / `exportMachineCode`）→ `state/licenseOps` → `core/usecases/license` → `HostPort.license.{getMachineCode, getStatus, activateWithCode, exportMachineCode}` → `core/rules/license`（`formatLicenseRemaining`）

---

## 二、持久化链

```
state 变更（slices）
  → state/persist                      【何时存：防抖 600ms（ClockPort）+ beforeunload flush + 失败写 store】
        ├─ core/usecases/persistProject    【工程：序列化 → 图片外置 → 写键 → 备份/快照】
        ├─ core/usecases/persistAccounts   【账号列表落盘】
        └─ core/usecases/persistLsKey      【单键落盘通用件 ← 画廊 / 体检历史 / 预设】
  → core/ports/storage.port.ts          【端口：只有类型】
  → adapters/storage/local              【唯一实现：localStorage（磁盘快照经 HostPort.project）】
  → bootstrap/hydrate.ts                【读回：画廊 `?? {}` · 体检历史 `?? []` · 预设 `?? []`】
键 → 读写的唯一映射表 = state/persistKeys.ts 的 PERSIST（rw() 三态 read/write）；哪些片落盘由 state/persist.ts 的 pick() 决定
```

**关键边**：
- 防抖窗口与 `beforeunload` flush **同址**在 `state/persist`（`ClockPort` 注入，可单测）。
- 失败**不吞**：写 `saveError`。
- 图片外置（base64 → `img://`）在 `usecases/persistProject` 内调 `HostPort.media.saveImageSync`，**唯一出口**。
- 画廊（`LS_LOVART_GALLERIES`）· 体检历史（`LS_SCAN_HISTORY`）· 预设（`LS_PRESETS`）都经 `usecases/persistLsKey`（不复制第二份落盘件）。
- ★ **预设**：`slices/global.presets` ⇄ `doubao-presets`。**写方** = 导入工程并入（`state/projectOps`）+ 文本节点「保存预设」（`slices/global.addPreset` ← `ui/nodes/TextNode`）+ 节点预设（`slices/global.addNodePreset` ← 右键菜单「保存为节点预设」· `NodePresetModal`）；**读方** = 导入时按 `id` 判重（`usecases/importProject`）+ 拆分并套用（`canvas.splitApplyPreset` ← `ui/SplitPresetPickerModal`）。⚠️ 提示词预设源里**只写不读**（没有列表 / 套用 UI）⇒ 不是缺口。

---

## 三、错误 / 失败链（横切）

```
生产者：adapters/**、core/rules/**   → 产生 {ok:false, reason, message}（message = 原始原文）
   ↓
消费者：core/usecases → state → ui    → 只能转发（不得改写 / 吞掉 / 编造，也不得空 catch）
   ↓
展示：constants/failure.ts            → reason → 文案映射（FAIL_LABEL / BACKEND_ERROR_LABEL 真源）
      constants/index.ts              → export * 统一出口（消费方从 @/constants 或 @/constants/failure 拿）
      ⛔ constants/text.ts **不得**再导出这两张表（与 index 的 export * 歧义重名 ⇒ TS 静默丢名）
   ↓
渲染：ui/common/ErrorBanner（BACKEND_ERROR_LABEL[kind] · 直接 import @/constants/failure）· ToastHost
```

⚠️ **断点**：`err(reason, 字面量)` 这一形态**漏检** ⇒ 用例层仍可能自造错误文案。

---

## 四、状态写入链

```
ui/**  →  调用 state 暴露的 action  →  state/**（唯一写入点）
core/usecases  →  只返回 Result<T>（不得写 store）
adapters/**    →  只转发事件（subscribeXxx(cb): () => void），不得写 store
```

**关键边**：`ui` 不得直改 store；`core/usecases` 不得 import `state`（反向依赖 = 环）。
★ 写入口只有一个：具名 action（`setSaveError` / `setAccounts` / `pushBackendError` / `loadHydrated` …）→ 镜像点 `setPartial`；`AppStoreHook`（`state/store.ts`）**类型上不含 `setState`** ⇒ 别处直写**编译不过**。
✅ 现状：`ui` 不再持 `Ports`（`usePorts` 已从 `@/state` 移除）；宿主能力经 `state/hostOps` 等控制器 —— 见 §十八。

---

## 五、画布链

```
ui/canvas/CanvasHost.tsx        【ReactFlow 宿主；8 类节点经 ui/nodes 注册】
  → state/slices/canvas          【唯一写入点：nodes / edges / library + undo 栈】
       ├─ core/rules/undo        【撤销栈纯逻辑（快照时机 = 变更之前）】
       ├─ core/rules/graph       【连线环检测 applyConnection / detachConnection】
       ├─ core/rules/project     【makeNodeId / makeLibraryId】
       └─ core/rules/arrange     【选中节点网格排布 planSelectedGrid（右键「自动排列」）】
  → state/store 的 setPartial     【画布 → 工程的镜像：唯一同步点】

复制 / 粘贴：CanvasHost（Ctrl/⌘+C/V）→ canvas: copyNodes / pasteNodes + clipboard   【{nodes,edges} 内存态，源亦不落盘】
剪贴板图片回落：CanvasHost.pasteClipboardImage → hostOps.readClipboardImage → addMaterialFromDrop   【图仍落 img://】
拖放：CanvasHost → lib/readDroppedFile → addMaterialFromDrop
右键菜单：ui/canvas/NodeContextMenu → canvas.arrangeSelectedNodes / pasteNodes · hostOps.revealPath
音效：CanvasHost（`video` 节点数变多 ∧ `soundEnabled`）→ lib/chime.playChime（纯排期 chimePlan + 播放；音型逐字对源 C5→E5→G5→C6）
拆分：ui/nodes/SplitKeywordModal → state/slices/canvas.splitTextNode → openSplitPresetPicker → ui/panels/SplitPresetPickerModal → canvas.splitApplyPreset
```

**关键边**：`state/store.setPartial` 是 `projects[activeId].data` 的唯一同步点；纯规则全在 `core/rules`（`state/slices/canvas` 只接线 + 注入时钟）。

---

## 六、生成链（网页通道 / API 通道）

```
入口：ui/panels/GenPanel.tsx   ①「生成」 → state/generate.runForNode
                              ②「批量出片」 → state/generate.runVideoBatchForNode
      ui/panels/BatchSendPanel → state/batchSend.run        ui/panels/SendQueuePanel → state/sendQueue.enqueue
  → state/generate（GenController）【★ 唯一写 store 处】
       前置：节点存在 · 类型 ∈ {imggen, genvideo} · 可用账号 > 0 或配了 API provider
       引用改写：parseRefChips(stripHtml(text)) → 视频⇒素材 rawName / 图片⇒「参考图N」；
                 引用素材 dataUrl 收成 refSources（resolveRefMaterial）
       patchNodeData({generating:true})
  → core/usecases/generate
       ├─ node.data.channel === 'api' ⇒ ports.host.api.jobSubmit / jobBatch → adapters/host/electron/api   【回流见 §十】
       └─ 网页 ⇒ pickAccount（带 busy）→ holdAccount → SitePort.send → finally releaseAccount           【send 分段见 §二十】
  → 成功落节点：imggen ⇒ results[] · genvideo ⇒ resultUrl（+ localizeNodeInto 落盘）
  → 网页成功 ⇒ state/sendWatch.start（180s 监测，见 §二十二）
  → 站点实现：adapters/site/doubao（同一工厂产出 doubao / dola）· adapters/site/gpt；注册表 adapters/site/registry.ts（createSiteRegistry）
  → 视频海报：ui/nodes/GenVideoNode.tsx → lib/videoPoster.generateVideoPoster（源 YL.jsx:450 那条 lazy；源另一处 eager 未落，结果等价）
```

**读面（生成链吃的 store 字段）**：`nodes` / `library` / `videoShares`（`slices/canvas`）· `accounts` / `accountBusy`（`slices/global`）· `poolStrategy` · `apiSetup` / `apiConfigs` / `apiProvidersMeta`（`slices/settings`）· 节点发送态（`slices/ui`）。

**分析支（AI 提示词分析 / 调整）**：

```
ui/nodes/AnalyzePrompt.tsx（useAnalyze）
  → state/analyze（analyzeNodePrompt / reviseNodePrompt ← core/usecases/analyzePrompt）
  → 落点 state/slices/global.patchNodeData(nodeId, { analyzePrompt: outcome.patch }) + pushToast
  → 模型走 deps（state/sendDeps 的 sendToSiteDeps）
```

**API 配置支**：

```
ui/panels/ApiSettings → state/apiOps（load / saveProvider / saveSetup / test）
  → core/usecases/apiConfig
  → ApiPort.{providersList, configGet/Set/SetKey/SetSecret, configTest, setupGet/Set}
  → 落点 state/slices/settings（apiProvidersMeta / apiConfigs / apiSetup / apiUsage）
```

**风格库支**：

```
ui/panels/StyleLibraryModal（← ui/panels/GenPanel）
  → state/slices/styles（StylePreset 族）→ state/persist → usecases/persistLsKey(LS_STYLES) → bootstrap/hydrate 读回
```

**关键边**：
- 选号 = `core/rules/accountPool.pickAccount`（`busy` 由 `state` 实时注入）；选不到三档 = `no-account` / `all-busy` / `all-excluded`。
- 失败 = `core/rules/failure.ts` 分类 → `decideByReason` → `give-up` / `retry-switch` / `retry`；`retry-switch` ⇒ `excluded.push(account.id)`；`retry` 上限 `FAILURE_MAX_RETRY`。
- 报文 = `core/rules/payload.ts` 的 `buildImagePayload` / `buildVideoPayload` → `toSitePayload`（**扁平形态** = `SitePort.send` 入参）★ 跨进程报文（`content.*` 嵌套，`batchSend` 用）与扁平形态是两套，`toSitePayload` 是唯一转换点。
- API 提交：图片 = `jobBatch(base, N 个 {})`（**N 张 = N 个任务**）；视频单发 = `jobSubmit`；视频批量 = `jobBatch(base, BATCH_RATIOS.map(…))` —— ⚠️ `matrix` **必须是数组**（后端按 `Array.isArray` 判，传对象 ⇒ **提交 0 个却报成功**）。报文形状契约住 `electron/api/job-manager.js`。
- attempt 记录 = `core/rules/genHistory.ts`（`makeGenAttempt` / `patchGenHistoryAttempt` / `appendGenHistoryAttempt`）+ `state/generate.makeAttemptId`（时间经 `ClockPort`，序号在闭包内自增）。

**断点**：
- 网页通道 Phase 2 的**回退链**（附图的剪贴板回落 + 按键补充）与 **2b 增量重试**未落 —— `send` 只走 CDP 一级，失败即 `err('unknown')`。
- Phase 3a 只有**文本**那档硬闸；**图数 / 图序**未落。
- `_pendingAttempt` / `_pendingAttempts` **无写入方**（只有 `stable/migrations/resetStaleJobs` 清）⇒「本账号待确认尝试」语义在本仓不存在。
- 网页通道的 `send` **图 / 视频共用同一份 `pollResults`**（逐行对的是源图片通道 `DR`）⇒ 图片等价；**视频与源偏离**（源：`Be` 发完即返回、由异步检测补）。

---

## 七、宿主装配链

```
bootstrap/container.ts 的 hasElectronHost()   【真实宿主优先】
   hasElectronHost() ? adapters/host/electron（唯一接触 window.api） : adapters/host/mock
  → 注入 state / usecases（端口的唯一实现处）
```

**关键边**：`window.api` 只允许出现在 `adapters/host/electron/**`；`ProjectPort.saveBackup/saveSnapshot/logOperation` 与 `MediaPort.saveImageSync` 均为 `Result`。

---

## 八、媒体链

```
图片外置：core/usecases/persistProject → stable/migrations/imageExternalize(externalizeProjectImages)
            → adapters/host/electron(media).saveImageSync        【base64 → img://；唯一出口】
缩略图：ui/common/Thumb · ui/nodes/MaterialNode · ui/panels/{GalleryCard,NewImagesThumb,NewImagesPanel} · core/rules/richText(chip)
            → stable/protocols/img.withThumb(?w=)                【只对 img:// 拼；不加载原图】
遮脸：ui/nodes/FaceMarksLayer → state/hostOps → MediaPort.applyFaceMask
            → adapters/media/facemask.ts + core/rules/facemask.ts
人脸检测：ui/nodes/FaceMarksLayer → state/hostOps → MediaPort.detectFaces
            → adapters/media/faceDetect.ts + core/rules/faceDetect.ts
去重：core/rules/dedupe.createDedupe（上游 lib/phash.ts）→ adapters/site/doubao/index.ts 的**占位图判定**（`placeholderDetector.isPlaceholder`，出片轮询取回后先过它）；另 `core/rules/resultScan` 承担「同一 URL/hash 反复出现 ⇒ 固有素材」计数
视频本地化：state/generate（写完 `resultUrl` 后）＋ bootstrap/container 的 startVideoBackfill（启动 5s 全量回填）
            → state/localizeOps（★ usecases/localizeVideos 的唯一调用方）→ MediaPort.saveVideoFromUrl → 回写 `vid://`
            （stable/protocols/vid.ts 只放契约派生的形状/判定，前端**零解析** —— 解析在主进程）
遮脸参数：ui/panels/FaceMaskPanel ⇄ state/slices/faceMask（faceMaskOpts / faceMarks / setFaceMaskOpts）
            → ui/nodes/FaceMarksLayer（角标 → 单击遮脸 / 双击设参数）→ state/hostOps → MediaPort.applyFaceMask
图片编辑器：ui/panels/ImageEditor（imggen 浮动编辑器）→ state/hostOps.detectFaces + applyFaceMask（涂抹 / 裁剪 / 遮脸共用）
```

---

## 九、端到端

接 Electron 跑通（冒烟脚本 `scripts/verify-*.cjs`）。

---

## 十、宿主事件回灌链

```
adapters/host/electron/api.onJobEvent(cb)   【只订阅、只转发】
  → state/subscriptions.ts（createSubscriptions）  【★ 唯一把宿主事件**写进 store** 的订阅点】
  → settings.upsertApiJob(job)              【按 jobId 覆盖 / 追加】
  → core/usecases/applyApiJobEvent          【纯决策：事件 + 当前节点 → 「要做哪些事」】
  → state/slices/apiLanding.ts（canvas 片） 【★ 落点，顺序逐条对源】
      addToLibrary → attachVideoResultToNode → patchNodeData → attachImageResultToNode → pushToast
  → state/store

adapters/host/electron/media.onDolaMedia(cb)  → state/subscriptions.ts → state/dolaMedia   【视频支；图像支见 §二十四】
adapters/host/electron/clipboard.onChanged(cb) → state/hostOps ← ui/canvas/CanvasHost      【★ 只读不写 store：Ctrl+V 图片回落 + 时间戳】
```

**关键边**：`onJobEvent` 是 `ApiPort` 唯一的订阅方法；`createSubscriptions` 由 `container.ts` 装配一次。`applyApiJobEvent` **零 store 依赖**（决策与落点分开）；事件缺 `jobId` ⇒ 什么都不做。
⚠️ **断点**：决策里的 `feed` 字段**算了但没人落、也没人读**（源 `imageGenFeed` 无读者 —— 源把它当 state 维护这件事，本仓不落）。

---

## 十一、文件 / 素材链

```
ui/shell/TopBar.tsx             → hostOps.saveTextFile(json)          【导出当前工程】
ui/panels/LibraryPanel.tsx      → hostOps.importFiles()               【从文件添加素材】
   → state/hostOps                  【★ ui 需要的 ports.host.* 唯一落点（只转发，不写第二份判据）】
   → ports.host.file.{saveFile, importFiles}
   → state/slices/canvas: commit('library') + setLibrary(...)         【唯一写入点】
   → state/store 的 setPartial                                       【镜像进 projects[activeId].data】
工程存储：ui/shell/TopBar（保存路径 / 打开目录 / 占用统计）→ state/projectOps → usecases/projectStorage → ports.host.project.{pickStorage,revealStorage,getStorageSize,activateStorage}
导入工程：ui/pages/StartPage → state/projectOps.importProjectFile → usecases/importProject → state/slices/global.addImportedProject
下载（gv-dl）：ui/nodes/{GenVideoNode,GenImageNode} → hostOps.downloadFileAs → ports.host.file.downloadFileAs   【成功 toast 的「在文件夹中显示」→ hostOps.revealPath；NodeContextMenu 同用】
```

**关键边**：前两条**不从 `ui` 直调端口** —— 走 `state/hostOps`（`ui` **结构上拿不到 `Ports`**）。详见 §十八。

---

## 十二、没有链的模块（**有实现、0 消费**）

> **判"没有链"必须追到链尾**：端口方法**被某个 `core/usecases` 调用 ≠ 有链** —— 还要看**该用例本身有没有生产消费方**。
> ⚠️ `find-dead` 抓不到它们：它把**测试引用**也算作引用（另：`index.` 关键字文件直接跳过）。
> **逐文件清单的真源 = `scripts/dead-code-baseline.json`** —— 本文件**不维护清单**（会漂）；下表只留**已裁定"判不落"**与**该删的**（证据 = `node scripts/mv-sync-refs.mjs refs <file>` 的「① 模块引用」或 `find-dead`）。

| 落点 | 0 消费的符号 | 证据（`refs` ① / `find-dead`） | 处置 |
| --- | --- | --- | --- |
| `adapters/site/tapnow/api.ts` | `tapnowListCanvases` | 该文件被 `tapnow/index.ts` import（文件活），**符号** 0 调用 | **判不落**：源里那条分支不可达（三处调用全传了 `canvasId`）⇒ 保留能力位、不接线、不造 UI |
| `HostPort.api` | `jobCancel` | 端口声明在、调用点 0 | **判不落**：源有该能力位但源内 0 调用 ⇒ 保留、不为它造 UI |
| `BackendPagePort` | `runScript` | 端口声明在、调用点 0 | **判不落**：预备消费者是源内 0 调用的那三个对外方法 |
| `core/rules/fingerprint.ts` | 整文件 | `refs` ① = **1**（`core/rules/tests/fingerprint.test.ts`）⇒ **仅 tests** | **回源定消费者**（别与 `fingerprintScan` / `fingerprintDiagnosis` / `fingerprintGenerator` 混）⇒ 无双端即删 |
| `lib/selection.ts` | 整文件 | `refs` ① = **0** · `find-dead` 命中 | 同上（回源无消费者 ⇒ 删） |
| `stable/protocols/vid.ts` | 整文件 | `refs` ① = **0**（连 tests 都没有） | **判不落**：`vid://` 前端零处理是**正确形态**（解析在主进程）⇒ 保留能力位；若要收窄则整文件删 |
| `adapters/site/doubao/scripts.ts` | `DEEP_QUERY_SCRIPT` · `DOLA_FORCE_SCRIPT` · `READ_INPUT_SCRIPT` | 死导出（在 `dead-code-baseline.json`） | `DEEP_QUERY_SCRIPT` **该删**；后两条是**残留条目**（`DOLA_FORCE_SCRIPT` 已落 `doubao/dolaForce.ts` 且已接线 · `READ_INPUT_SCRIPT` 现名 `READ_INPUT_STATE_SCRIPT`）⇒ 随基线 `--update-baseline` 清 |

> ⚠️ **`find-dead` 的 .d.ts 是假阳**：它报 `adapters/host/electron/window-api.d.ts` / `ui/panels/webview.d.ts` 无引用，但前者就被 `host-api.ts` `import type { HostApi }`（工具不认 type-only / 全局声明）⇒ **别按它删**。
> ⚠️ **基线里另有两条已过期**（东西已接线，条目还在）：`tapnowCurrentCanvasId`（`tapnow/index.ts:112/139` 经 `peekCanvas` 真消费）· `core/rules/videoLocalize.ts`（← `state/localizeOps`）⇒ 清偿后跑 `--update-baseline`。

---

## 十三、素材抓取链（含自动值守）

```
ui/panels/NewImagesPanel.tsx        【「立即抓取」】
  → state/accountOps.scanGallery      【逐账号扫描；失败原样上报；写库走 addLovartImages】
  → core/usecases/scanGallery         【编排：查站点适配器 → SitePort.scan → 映射成 LovartImageInput】
  → ports.sites[type].scan            【volatile：适配器内部 frames→webview 降级链】
       → adapters/site/shared/materializeScan（scanAttemptFromRaw；内部 materializeScannedImages 逐张落盘）
                                     【落盘成 `img://`（ref）；落不出 ⇒ failed++，不编造引用】
  → state/slices/gallery.addLovartImages        【唯一写入点：去重由纯层兜底】
  → state/persist → usecases/persistLsKey(LS_LOVART_GALLERIES)   【落盘（见 §二）】

自动值守（显式调用，编排层驱动）：
ui/panels/NewImagesPanel.tsx（开关）→ state/accountOps.setAutoWatch(on)
  → core/rules/autoWatch              【纯决策：抖动 / 退避 / 空转上限；节奏由 adapter 声明】
  → ports.clock（setTimeout）         【定时器在编排层，非适配器】
  → 复用 scanGallery                  【手动与值守共用同一条】
```

**关键边**：谁能值守 = `SitePort.autoWatch?` **能力声明**（`tapnow` 声明、`lovart` 刻意不声明 —— 风控；后端 `electron/main.js` 有「Lovart 容器隔离」）；`core` / `state` / `ui` **零站点名判断**。扫描枚举真源 = `core/rules/scanChain.ts`（`SCAN_CHAIN` / `SCAN_PHASES` / `SCAN_SCOPES`），端口只 `import type` 转发。
⚠️ **DEV 断点**：mock 的 `imageFetchDataUrl` 恒 `ok(null)` ⇒ 抓取必然「没有新的图」（mock 不撒谎）。端到端要在 Electron 里跑 `scripts/verify-*.cjs`。

---

## 十四、截图链（**两套，勿混**）

```
(a) 后台页静默快照：ui/panels/AccountPanel(.autostartSwitch) → accountOps.toggleAutoStart
      → BackendPagePort.captureSnapshot（webview.capturePage → resize 960 → snapshots 表）
      → BackendView 的 img.silent-snap（snapshotOf）；恢复 = setAccountAutoStart(id,true) + dropSnapshot
      【源 `je`（:461-502）+ `Wc`/`zT`/`UT`/`Xy`（shared.js:32379-32414）+ `Yy`（:32389）】

(b) 节点截图：ui/nodes/VideoNode.tsx（「截图」）→ lib/captureRegistry（nodeId → HTMLElement）
      → state/capture（CaptureController）→ core/rules/capture(toCaptureRect，DOM 矩形 × dpr；宽或高 < 2px ⇒ null)
      → ports.host.media.captureRect → state/slices/canvas.addScreenshotMaterial   【唯一写入点】
      【源 `Lu`（shared.js:32311）+ `$T`（:32328）+ `Rk`（:32351）】
```

**关键边**：两套是不同的东西 —— (a) 对象是**后台页 webview**、(b) 对象是**节点 DOM 元素**；(a) 的表在 `adapters/site/shared/backendPage.ts`（不导出），(b) 的表在 `lib/captureRegistry`。`state/capture` 返回 `{ok, reason}`（源版静默 `null`，本工程如实上报）；`dpr` 由 `bootstrap` 注入（`state` 不读 `window`）。

---

## 十五、画廊链

```
ui/panels/AccountPanel「画廊」→ ui/panels/GalleryPanel.tsx（覆盖层）
  → state/slices/gallery            【唯一写入点：add / remove / clear / purge 七 action；无变化不写】
  → core/rules/lovartGallery        【纯：addLovartImages / removeLovartImages / purge* / captureImageName / captureSource】
  → state/persist → persistLsKey(LS_LOVART_GALLERIES)   【落盘（同 §二）】
  → bootstrap/hydrate               【读回（?? {}）】

「添加到画布 (N)」→ state/slices/canvas.addMaterialsBatch
  → state/slices/materialBatch（buildMaterialBatch）   【主体抽片】
       ├─ core/rules/materialGrid   【网格布局纯规则（planMaterialGrid / fitMaterialSize / autoPlaceCenter）】
       └─ persistImage（MediaPort.saveImageSync，同步 IPC，不得 await）
  → library 去重 → 建素材节点

大图预览：ui/panels/GalleryLightbox.tsx → hostOps.openExternal
```

**关键边**：持久化形状真源在 `stable/contracts/lsValues.ts`（`LovartGalleriesMap` / `LovartGalleryImage`），`core` 只转发导出。

---

## 十六、账号管理链

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
              （环境值经 adapters/host/shared/env 注入 —— 不纯那半不进 core）
指纹体检：ui/panels/FingerprintScanPanel → core/rules/fingerprintScan（scanFingerprintCollisions）
              + state/slices/scan（recordScan）→ persistLsKey(LS_SCAN_HISTORY)
分组：ui/panels/GroupManagerModal → state/slices/global（六个 action）+ core/rules/accountGroup

后台视图：ui/panels/BackendView（渲染 .doubao-view-webviews 容器）
              ├─ mounted = 已登录 ∩ (autoStart ∪ leasedAccounts ∪ accountBusy)   ← 没人用的账号不挂 <webview>
              │    leases → BackendPagePort.subscribeLeases → state/subscriptions.ts → store.leasedAccounts
              ├─ 刷新 → accountOps.reloadBackend → BackendPagePort.reload（先撤就绪标记再 reload）
              ├─ 静默开关 → accountOps.toggleAutoStart → BackendPagePort.captureSnapshot/dropSnapshot
              └─ adapters/site/shared/webview（findWebview）→ 供 send / analyze / scan / 检测 复用

后台页租约：BackendPagePort（core/ports/backendPage.port.ts ← adapters/site/shared/backendPage.ts）
              prepareForSend（取租约 + 建记录）→ release（末条 ⇒ 1500ms drain 后删记录）→ leases/subscribeLeases
              ⚠️ 全部命令经端口；`ui` 不碰 DOM 命令
```

**关键边**：`state/accountOps` 与 `state/hostOps` / `state/licenseOps` 同法 —— **只转发 + 归一，不写第二份业务判据**（业务在 `core/rules` / `usecases`）。
⚠️ `reload` **必须先撤就绪标记**（源 `reloadAccount` `:428-435`），否则 `prepareForSend` 命中 `readyAccounts` 短路，页内脚本会打在白屏 / 半载页面上。

---

## 十七、发送队列链

```
ui/panels/BatchSendPanel「加入队列」→ state/sendQueue.enqueue
  → core/rules/sendQueuePlan       【入队规划：防重复（同节点 + 90s + 指纹相同 ⇒ 跳过）】
  → state/slices/queue             【唯一写入点：sendQueue.items / paused + accountConcurrency】
  → 泵（state/sendQueue；50ms 节流自触发 + 代次闸）
       → core/rules/sendQueueDispatch  【分发决策：按账号并发 / notBefore / 池分配】
       → core/rules/sendQueueSettle    【结算：成功记指纹 / 失败分类退避重试 / 换号排除表】
       → createSendPipeline（state/batchSend 抽出）  【与批量发送共用 prepare / transport】
  → ui/panels/SendQueuePanel.tsx   【面板：deriveGenView ← core/rules/sendQueuePanel】
```

**关键边**：批量入口 = `core/usecases/sendQueue.runBatchSend`；批量与队列共用 `createSendPipeline`（`prepare` = `resolveSendAccountForChain` + `buildVideoPayload`；`transport` = `SitePort.send`），否则是两份 `prepare`；占用释放经 store 的 `holdAccount` / `releaseAccount`（`itemId` 校验）。

---

## 十八、控制器层收口（★ `ui` 结构上拿不到 `Ports`）

```
ui/**  →  只调 state 的能力型 hook
          （useHostOps · useLicenseOps · useAccountOps · useCapture · useAnalyze · useSendQueue …）
          ✗ 不得 usePorts() · ✗ 不得 import adapters
state/{hostOps, licenseOps, projectOps, accountOps, capture, analyze, sendQueue}.ts  【控制器：只转发 ports → ui】
bootstrap/container.ts              【唯一装配：端口只在此注入】
```

**关键边**：`grep -rn "ports\.\|usePorts" src/ui` = **空**；`state/context.tsx` 没有 `usePorts`（**结构封堵**，不靠 grep 闸）。

---

# 豆包后台域

## 十九、后台域 · 入口 / 读面 / 运行时数据 / 挂载

> 源里「豆包后台」= **`_Component43.jsx`（3303 行）一个组件**承载的整个功能域：视图 + 发送调度 + 视频回流 + 参数自检。拆法：容器 → `adapters` · 调度 → `usecases` · 视图 → `ui`。

**入口（ui → 落点）**：

```
ui/shell/AppShell.tsx（centerStage · doubaoViewVisible 默认 false · openDoubaoView 来自顶栏）
  → ui/panels/BackendView.tsx                【域主视图；源 _Component43 挂载点 _Component48.jsx:171-178】
       ├─ 每账号一个 <webview>                （源 _Component25.jsx）
       ├─ 无水印面板 → ui/panels/WatermarkPanel.tsx      （源 SD.jsx）
       ├─ 出新图条   → ui/panels/NewImagesPanel.tsx      （源 _Component26.jsx）
       └─ 静默开关   → ui/panels/AccountPanel.tsx 的 .autostartSwitch
                          → accountOps.toggleAutoStart   （源 OP.jsx:509-559）
源对外 API（`:2698-3219`）拆进 adapters/site/doubao + state/{generate,pullResult,postSendDetect,autoConfirm}
  ★ 源里消费它们的只有桥组件 _Component44（shared.js:41013-41057）：sendPayload → 静默发送注册器 L0；
    pullResult → store 的 pullResultFn（← BL.jsx:47/:355 的 vn-pull-chip）；其余 6 个 .current.X 0 命中
```

**读面（视图直读的 store 字段）**：

```
BackendView ← slices/ui        : activeAccountId / setActiveAccountId     【≠ 画布 activeId】
            ← slices/global    : accounts · leasedAccounts
            ← slices/canvas    : nodes / edges / videoShares
            ← slices/nodeStatus: autoVideoDetect                          【初值读盘 doubao-auto-video-detect】
★ leasedAccounts ← state/subscriptions.subscribeLeases（唯一写入点）
⚠️ autoVideoDetect 源 setter 0 UI 调用（源里没有 UI 开关）—— 本仓 setAutoVideoDetect 同样无 UI 消费者
```

**不在 store 里的运行时数据（落点）**：

```
后台页租约   → adapters/site/shared/backendPage.ts 的 pageRecords（表不导出）+ DRAIN_DELAY_MS = 1500
                 ← 端口 prepareForSend / release
                 （源 Jn shared.js:25893；vr 建 :26024 · rn 释放 :26109 · eT drain 到期删 :25916-25938）
就绪 / 找页  → 同文件 readyAccounts（reload 里 delete）· viewOf（= findWebview；源那张 DOM 缓存恒为空）
                 （源 u / an+rT shared.js:25946-25961 → 端口 BackendPagePort）
静默快照     → 同文件 snapshots（表不导出）← 端口 captureSnapshot / snapshotOf / dropSnapshot
                 （源 Wc shared.js:32379-32414；触发由 accountOps.toggleAutoStart 直接调，源的回调槽 Ni 无对应）
占用         → core/rules/accountBusy.holdAccount → store accountBusy（slices/global）   （源 Fi shared.js:34596-34610）
节点截图表   → lib/captureRegistry                                       （源 Lu shared.js:32311-32320；见 §十四）
检测态       → state/postSendDetect.ts 的 seen（基线）/ jobs（待归属）/ running（在跑的账号）   见 §二十一
回流态       → state/dolaMedia.ts 的 queues（CDP 待归属，30min 过期）/ satisfiedAt（12s 节流）/ seenVideos / seenImages
追问表       → state/sendQueue 的 queueProgress                         见 §二十三
❌ 不造：任务占用表 Uu（源 shared.js:35353-35404）—— 消费者 dv-send-overlay / isForced 本仓都没造
```

**视图态只有两档**：`mounted` / `isActive`（见下）；`dv-send-overlay` / `dv-wv-*` / `has-snap` 本仓不产出。

**挂载**（哪些账号有 `<webview>`）：

```
源：h = 已登录 c ∩ (autoStart=true ∪ 租约快照 d)     ← 没人用的账号不挂（元素不在 ⇒ guest 进程不在 ⇒ 才叫不占内存/CPU）
本仓：mounted = 已登录 ∩ (autoStart ∪ leasedAccounts ∪ accountBusy)     → BackendView 的 mounted / isActive
      ★ 多 OR 一档 accountBusy 是**有意的**：本仓 holdAccount 在取租约之前就置好（选号阶段），只留租约快照会「瞬时卸载再重挂」
      ★ leasedAccounts 这一档不能省：autoConfirm 申请独立租约（不占 accountBusy）
      ❌ 不造：R（Uu 快照）/ isForced / dv-send-overlay / dv-wv-* / has-snap（消费者全在没造的 UI 态里）
```

**面板分支**：无水印 `SD` ⟷ 出新图条 `_Component26` 互斥（`type ∈ {dola,doubao}` vs `{lovart,tapnow,other}`）；本仓 = `BackendView` 的 `watermarkOpen` vs `NEW_IMAGES_SITES`。
**头部工具栏触发**（源 `:3235-3268`）：刷新 → `accountOps.reloadBackend`（`disabled` 随 `autoStart !== true`）· 浏览器打开 → `hostOps.openExternal` + `accountOps.chatUrlOf`（`other` 支照抄 `url || 'about:blank'`）· 无水印 → 面板 toggle · 折叠 → 键 `doubao-view-head-collapsed`。
**无水印面板的流**：`ui/panels/WatermarkPanel.tsx` 读 `videoShares`（开合 = `BackendView.watermarkOpen`）；下载 / 删除走 `hostOps.downloadFile` + `removeVideoShare`（源走 `getDownloadSettings` / `pickDownloadPath` / `downloadDolaMedia` / `clearDolaMedia`）。

---

## 二十、后台域 · 发送链

```
触发：ui/panels/BatchSendPanel · ui/nodes/{TextNode,GenPanel…}
  → state/generate · state/batchSend · state/sendQueue
  → core/usecases/sendToSite（withBackendPage）
  → adapters/site/doubao/index.ts 的 send
deps 组装：state/sendDeps.sendToSiteDeps —— sites / backendPage / holdAccount / releaseAccount 的**唯一组装点**
            （消费方：state/generate · state/accountOps · state/analyze · state/pullResult）
```

**源阶段**（`_Component43:807-1318` 的 `Be`）：① `vr(accountId,{jobId,purpose:'generation',timeoutMs:30000})` 取租约 → ② `te(id)` 取 webview → ③ `A(id)` = `Uu.hold` → ④ 文本（`copyTextToClipboard` → `Qe`：`pasteToWebview` + focus 脚本 → `Ql` 验证，失败重试）→ ⑤ 图片 `attachImagesToWebview`（`_a` 验证）→ ⑥ `precheck`（`:1143` 文本 + `:1153` order，不过则 `reason:'precheck-fail'`）；结果记 `_pendingAttempt` / `_pendingAttempts[accountId]` 落节点。

**本仓落下的阶段**：
- ⓪ 文本填入（`In` 归一 → 剪贴板 → 聚焦粘贴 → 验证）· ① 附图（**CDP 一次直喂**，不走源那条"逐图剪贴板 + 按键兜底"）
- ② **Phase 2c 生成参数** → `adapters/site/doubao/setGenParams.applyGenParams`（脚本 `yD` 逐字搬入；dola 跳过；失败只留痕）；取参闸 = `core/rules/genParams.collectGenParams`
- ③ **Phase 2d Dola 面板 UI** → `runDolaForcePanelUi`
- ④ 点发送 · ⑤ 等结果（`DR` 轮询，**结束即停**）
- 发送成功后（`:2943-3013`）：按站点能力分流 —— 有 `site.detectVideos` ⇒ `postSendDetect.notifySent`；否则 ⇒ `dolaMedia.registerSent`；并按 `hasVideoDescendant` 登记 `setNodePendingTimer`
- `precheck` 已落：`core/rules/accountNode.ts` + `constants/failure.ts` + `adapters/site/doubao/index.ts`
- 幂等：`sessionId = ${account.id}:${payload.source}:${hash32(payload.text)}` → `sentSessions` 防重发

**断点**：源 ③ `Uu.hold` 不造（0 消费者）；`At` / `_t` / `runParamScript` 不落（源内 0 调用）⇒ 参数自检**只落了 `wt`**。

---

## 二十一、后台域 · 发送后检测（**只属视频通道**）

> 源里**图片**通道的收片走另一条：`_Component45.jsx:1054` 的 `DR({account,key,source,onItem,…})`（**同步**等结果：3s 轮询 / 10min 超时 / `onItem` 流式交）。
> ⇒ `postSendDetect` 是**视频通道**因「`Be` 发完即返回、不等结果」才必须的后台补救；本仓图像回流走 `pollResults`（原 `DR`）。

```
触发：① sendPayload 成功 && store.autoVideoDetect（:2943-2955，先把 {nodeId,sendTime} 记进 k）
      ② pullResult 的 conversationId 分支（:3196-3206，记 k 时带 pull:true）
控制器：state/postSendDetect.ts（notifySent / stop）—— 不占租约（走 BackendPagePort.webContentsIdOf），轮询只在调用期间存在
  ① te(id) 取 webview；未就绪 ⇒ 轮询 executeJavaScript('!!document.body') 至多 15s（:1458-1479）
  ② URL 不含 /samantha/aispace ⇒ 导航过去（最多 2 次）+ 等 SPA 水合 1.5s（:1480-1513）
  ③ while (now - start < 3_000_000)（:1554）：
       SitePort.detectVideos（← HostPort.media.detectVideos，源 window.api.detectVideos :1564）
       首轮：建基线 = 旧视频 key 集 ⇒ 写回（源 b.current）；同时处理"首轮新片"（:1606-1655）
       后续轮：新片（key ∉ 基线 ∧ created_at > 基线时间）⇒ 分配 ⇒ 落库（:1657-1695）
       空闲 900_000ms 结束（:1696）—— ⚠️ 源日志文案写"5min"，与常量 900000 不符
       xe(nodeId)（:1523-1553）：探测「已提交」回复 ⇒ setNodeTimer + removeNodePendingTimer
       每轮纯决策：core/rules/genDetect.ts（classifyFirstRound 首轮分类 / pickFreshVideos 新片 / detectCutoff / shouldStartTimer）
分配（纯）：core/rules/media.matchVideosToNodes + filterLiveJobs（源 hR shared.js:35767 / Kk :35758）
        —— jobs 先按（nodeId 存在 ∧ 节点存活 ∧ now-sendTime ≤ maxAge）筛，再与视频按时间差做最小化总匹配（双向 DP，shared.js:35813-35905）
落库：state/videoLanding.landVideo（源 Z() :1380-1441：addVideoShare + addVideoNode + patchVideoAttempt + updateNodeData + releaseAccountBusy）
状态落点：state/postSendDetect.ts 的 seen（基线，懒种子 seedSeenKeys）/ jobs（{nodeId, sendTime, pull?}）/ running（在跑的账号）
          会话切换重建基线（seenProject + seedSeenKeys；同工程沿用同一份集）
CDP 支（源 onDolaMedia :130-351 视频分支）：adapters/host/electron/media.onDolaMedia → state/subscriptions.ts
          → state/dolaMedia.handle → handleVideos → state/videoLanding.landVideo
          节流 / 去重住 state/dolaMedia 的 queues（待归属，30min 过期）/ satisfiedAt（12s）/ seenVideos
取数：SitePort.detectVideos（adapters/site/doubao/analyze）；另有 leaveDetectPage（还原页面）
调试：setDetectDebugInfo（源 Ae() :1327-1345）—— store 只写不读（源自己的幽灵）
```

⚠️ **断点**：源 `xe` 的「已提交」**页内探测**（`ze(Y,Hd,'detect-gen-submit')`）未落 ⇒ 计时器只走**兜底档**（等满 `DETECT_TIMER_FALLBACK_MS` 才启动）。

---

## 二十二、后台域 · 监测回复 / 自动确认 / 拉取结果

```
监测：state/generate（container.ts 注入）→ state/sendWatch.ts（循环 + 落 store）
        + core/rules/sendWatch.ts（纯判据）+ core/usecases/probeSendRound.ts（一轮编排）
        源 gt()（:2292-2700）：180s 窗口 × 每 2s 轮询，每轮 4 个页内探针
          ae(detect-gen-ack) · $(detect-wait-time) · Ne(detect-quota-usage) · ye(detect-reply-notice)
          命中 额度/通知 ⇒ be 换号重发（:2420-2559，写 setNodeSwitch）→ 本仓 performSwitch + reduceWatchRound 的 switchRequest
          命中「已接单」⇒ 启动排队追问（§二十三）；UI = ui/nodes/TextNode.tsx 的换号状态行

自动确认：发送链在 site.send 之前读基线（readBaselines）、之后 start
        → state/autoConfirm.ts（独立租约 purpose:'auto-confirm' / leaseTtlMs:900000 + 循环）
        + core/rules/genConfirm.ts（纯判据）+ adapters/site/doubao/genConfirm.ts（页内探针）
        源 kt()（:1738-2053）：探测「已提交」⇒ 点内联确认按钮 或 自动回复「确认，直接生成完整的一段视频」；写 setNodeTimer（:1862）

拉取结果：ui/nodes/VideoNode.tsx 的 vn-pull-chip → state/pullResult.ts
        fetchWatermarkFree：usecases/fetchWatermarkFree + state/pullResult（源 xt() :2053-2120）
        pullResult(vid 分支)：源 :3143-3173
        pullResult(conversationId 分支)：BackendPagePort.navigate 回会话页 → postSendDetect.notifySent({sentAt})
                                          （导航失败**不中止**，照源 ;3174-3216）
        resolveThreadAndFetch：adapters/site/doubao/analyze + SitePort.fetchWatermarkFreeByThread
                                          + usecases/fetchWatermarkFree.fetchWatermarkFreeByThread（源 :3045-3124）—— ⚠️ **0 调用方**（源 ref 上也 0 调用）
```

**断点**：自动确认链里源还调 `Uu.hold` ⇒ 不造（存活判据 `T()` 不依赖它）。

---

## 二十三、后台域 · 排队追问 / Dola 30s 强开 / 静默快照

```
排队追问（源 Nt() :2121-2291，由「已接单」分支 :2677 启动）：
  state/sendQueue.runQueuePing
    → core/rules/queuePing（shouldPingQueueProgress / queuePingText）
    → state/slices/queue.queueProgress（写 setQueueProgress；节点删/完成时 clearQueueProgress）
    → ui/panels/SendQueuePanel.tsx（成片行第三参 A.queueProgress）
  幂等键 `${accountId}::${nodeId}`（源 N.current :2133-2137 ⇒ skipped:'already-running'；键函数 eS shared.js:36563）
  节奏闸 GR（shared.js:36631）；文案映射 st（:2255-2262）

Dola 30s 强开（源 :758-806；仅"发送 Dola ∧ duration>15 ∧ model==='seedance-2.5'"）：
  adapters/site/doubao/dolaForce.ts（enableDolaForce30s / runDolaForcePanelUi / scheduleDolaForceCleanup）
    → 注入 JP（patch fetch/XHR）+ window['__DOLA_CANVAS_FORCE__'] = XP(duration)（shared.js:34756-34761）；3s 后删；QP 跑面板 UI（shared.js:34906）
  闸：core/rules/dolaForce.isDolaForceTarget
  挂进 send：发送前 enableDolaForce30s（源 Mt ← :2508 / :2832）→ Phase 2d runDolaForcePanelUi（源 Rt ← :1218）→ finally scheduleDolaForceCleanup（源 zt ← :2522 / :2919）
  ⚠️ 本链是**页面注入**（改 fetch/XHR + 写 window 全局）—— 已裁：**登记为例外**（功能层注入、非指纹伪装，同 inputLock）

静默快照：ui/panels/AccountPanel(.autostartSwitch) → accountOps.toggleAutoStart
  开启态：先 BackendPagePort.captureSnapshot（源 OP.jsx:515-531 的 Yy(id) → je）再置 autoStart=false
  静默态：setAccountAutoStart(id,true) + dropSnapshot（源 Ve(id) :516-524 = Xy(id) + updateAccount）
  底图：BackendView 的 img.silent-snap ← accountOps.snapshotOf
```

---

## 二十四、后台域 · 断点（不造 / 未落）

| 断的边（本仓侧） | 说明（源名见括注） |
|---|---|
| **图像回流（CDP 图片支）** | **未落**：需 `ingestImageGenCdp` + `addImageGenResult`（本仓皆无）；生产者 `bindImageGenKey` / `bindImageGenJobs` 未接线 ⇒ `imageGenKeyParams` 恒空 ⇒ 当前只记 `seenImages` 去重，事件不落库（不假装）。源 `onDolaMedia` 图片分支 `:185-231` + 节流 `I` |
| **生成参数派生** | **不落**：唯一消费者是源那两个 0 调用方法 + 自检面板态 ⇒ 一起不落（源 `le` `:352-395`） |
| **任务占用计数** | **不造**：消费者（`dv-send-overlay` / `isForced`）本仓没有 ⇒ 0 读者（源 `Uu` `shared.js:35353-35404`） |
| **参数自检（自动设置 / 测试 / 脚本）** | **不落**：源内全目录 0 调用 ⇒ 只服务它们的状态/派生一起不落（源 `At` / `_t` / `runParamScript`） |
| **附图按键兜底** | **不经过**：本仓附图 = CDP 一次直喂（源 `Je`） |
| **静默容器的回调 prop** | **不造**：已由 DOM 事件 + 端口承担（源 `_Component25` 的 `onLoadFailed` / `onUnmount`；`isForced` 依赖 `Uu`） |
| **拖放兜底脚本** | **不造**：站点层注入 —— 与「零注入」冲突（源 `c0`） |
