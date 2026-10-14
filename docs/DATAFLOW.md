# DATAFLOW · 数据流（谁经过谁）

> **本文件只放数据流**：每条链 = **触发 → 经过（`文件` + 唯一入口符号）→ 落点**，外加一句**断点**（这条链哪一段没接）。
> 口径：① 只写**现状**（链路变了才改）；② 不写本仓行号（源出处可写"原版文件:行"，原版不会变）；③ **不引用其他文档**（章节号 / 债号 / 用例号一律不写）。
> 判据、红线、进度、缺口编号**不在本文件**。
>
> ⚠️ **「本文件没提」= 缺口 ⇒ 当场把整条链补上**（不是「无需改」）：本文件是数据流现状图 —— **链不在图上 = 图不全**。
>   ⇒ ① 按上面的链形状（**触发 → 经过（`文件` + 唯一入口符号）→ 落点** ＋一句**断点**）**整条**写进去，不许只补一句引用；
>     ② 补完立刻回查该链的**上下游**（入口 / 回流 / 落盘）；③ 一次补到齐。

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

**关键边**：`hydrate` 是**唯一**批量写 store 的启动入口（不经 usecase，因为它写的是"装载"而非"业务动作"）；写入形态见 §四。
启动授权门（旁支）：`bootstrap/main.tsx` 的 Root（**fail-close**：只有 `ok` 放行）⇄ `ui/pages/ActivatePage`（`useLicenseOps`：`readMachineCode` / `checkStatus` / `activateWithCode` / `exportMachineCode`）→ `state/licenseOps` → `core/usecases/license` → `HostPort.license.{getMachineCode, getStatus, activateWithCode, exportMachineCode}` → `core/rules/license`（`formatLicenseRemaining`）

---

## 二、持久化链

```
state 变更（slices）
  → state/persist                      【何时存：防抖 600ms（ClockPort）+ beforeunload flush（HostPort.lifecycle）+ 失败写 store】
        ├─ core/usecases/persistProject    【工程：序列化 → 图片外置 → 写键 → 备份/快照】
        ├─ core/usecases/persistAccounts   【账号列表落盘】
        └─ core/usecases/persistLsKey      【单键落盘通用件 ← 画廊 / 体检历史 / 预设】
  → core/ports/storage.port.ts          【端口：只有类型】
  → adapters/storage/local              【唯一实现：localStorage（磁盘快照经 HostPort.project）】
  → bootstrap/hydrate.ts                【读回：画廊 `?? {}` · 体检历史 `?? []` · 预设 `?? []`】
键 → 读写的唯一映射表 = state/persistKeys.ts 的 PERSIST（rw() 三态 read/write）；哪些片落盘由 state/persist.ts 的 pick() 决定
```

**关键边**：
- 防抖窗口（`ClockPort`）与 `beforeunload` flush（`HostPort.lifecycle`）**同址**在 `state/persist` —— 两者都**走端口注入**，`state` 层**不直挂 `window`**。
- 失败**不吞**：写 `saveError`。
- 画廊（`LS_LOVART_GALLERIES`）· 体检历史（`LS_SCAN_HISTORY`）· 预设（`LS_PRESETS`）都经 `usecases/persistLsKey`。
- ★ **预设**：`slices/global.presets` ⇄ `doubao-presets`。**写方** = 导入工程并入（`state/projectOps`）+ 文本节点「保存预设」（`slices/global.addPreset` ← `ui/nodes/TextNode`）+ 节点预设（`slices/global.addNodePreset` ← 右键菜单「保存为节点预设」· `NodePresetModal`）；**读方** = 导入时按 `id` 判重（`usecases/importProject`）+ 拆分并套用（`canvas.splitApplyPreset` ← `ui/SplitPresetPickerModal`）。
- ⚠️ **断点**：预设的**提示词**那一支**只写不读**（源里就没有列表 / 套用 UI）⇒ 该支无消费方。

---

## 三、错误 / 失败链（横切）

```
生产者：adapters/**、core/rules/**   → 产生 {ok:false, reason, message}（message = 原始原文）
   ↓
消费者：core/usecases → state → ui    → 只能转发（不得改写 / 吞掉 / 编造，也不得空 catch）
   ↓
展示：constants/failure.ts            → reason → 文案映射（FAIL_LABEL / BACKEND_ERROR_LABEL 真源）
      constants/index.ts              → export * 统一出口（消费方从 @/constants 或 @/constants/failure 拿）
   ↓
渲染：ui/common/ErrorBanner（BACKEND_ERROR_LABEL[kind] · 直接 import @/constants/failure）· ToastHost
```

⚠️ **断点**：`err(reason, 字面量)` 这一形态**无守卫**（新增不会被拦）—— 当前 `core/usecases` 生产代码 **0 例**（命中只在 `core/usecases/tests/**` 的假 deps 与断言里）。

---

## 四、状态写入链

```
ui/**  →  调用 state 暴露的 action  →  state/**（唯一写入点）
core/usecases  →  只返回 Result<T>（不得写 store）
adapters/**    →  只转发事件（subscribeXxx(cb): () => void），不得写 store
```

**关键边**：`ui` 不得直改 store；`core/usecases` 不得 import `state`（反向依赖 = 环）。
★ 写入口只有一个：具名 action（`setSaveError` / `setAccounts` / `pushBackendError` / `loadHydrated` …）→ 镜像点 `setPartial`；`AppStoreHook`（`state/store.ts`）**类型上不含 `setState`** ⇒ 别处直写**编译不过**。
★ 启动期那一次批量灌入（`loadHydrated`）的链路见 §一；`ui` 侧拿端口能力的链路见 §十八。

---

## 五、画布链

```
ui/canvas/CanvasHost.tsx        【ReactFlow 宿主；8 类节点经 ui/nodes 注册】
  → state/slices/canvas          【唯一写入点：nodes / edges / library + undo 栈】
       ├─ core/rules/undo        【撤销栈纯逻辑（快照时机 = 变更之前）】
       ├─ core/rules/graph       【连线环检测 applyConnection / 批量连线 planConnectBatch】
       ├─ core/rules/project     【makeNodeId / makeLibraryId】
       └─ core/rules/arrange     【选中节点网格排布 planSelectedGrid（右键「自动排列」）】
  → state/store 的 setPartial     【画布 → 工程的镜像：唯一同步点】

复制 / 粘贴：CanvasHost（Ctrl/⌘+C/V）→ canvas: copyNodes / pasteNodes + clipboard   【{nodes,edges} 内存态，源亦不落盘】
删除：CanvasHost.onNodesChange（Delete/Backspace 或 ReactFlow 的 remove 变更）→ canvas.removeNodes   【commit 快照 + 清相关边 + 清幸存节点的 referenceOrder 引用 + 删的是**组**时释放成员（core/rules/group.releaseDeletedGroupChildren：剥 parentId/extent + 叠加父坐标）】
剪贴板图片回落：CanvasHost.pasteClipboardImage → hostOps.readClipboardImage → addMaterialFromDrop   【图仍落 img://】
拖放：CanvasHost → lib/readDroppedFile → addMaterialFromDrop
右键菜单：ui/canvas/NodeContextMenu → canvas.arrangeSelectedNodes / pasteNodes / clipboard · hostOps.revealPath（`img://` 与真实路径同一个入口）
音效：CanvasHost（`video` 节点数变多 ∧ `soundEnabled`）→ ui/lib/chime.playChime（播放，碰 WebAudio）+ lib/chime.chimePlan（**纯排期**，可单测；音型逐字对源 C5→E5→G5→C6）
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
  → 成功落节点：imggen ⇒ results[] · genvideo ⇒ **发完即返回**（resultUrl 由 §二十一 `addVideoNode` 异步落）
  → 网页成功 ⇒ state/sendWatch.start（180s 监测，见 §二十二）；视频生成另按站点能力分流 → postSendDetect.notifySent（见 §二十一）
  → 站点实现：adapters/site/doubao（同一工厂产出 doubao / dola）· adapters/site/gpt；注册表 adapters/site/registry.ts（createSiteRegistry）
  → 视频海报：ui/nodes/GenVideoNode.tsx → ui/lib/videoPoster.generateVideoPoster（源 YL.jsx:450 那条 lazy；源另一处 eager 未落，结果等价）
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
  → ApiPort.{configGet/Set/SetKey/SetSecret, configTest, setupGet/Set}   【provider 元信息随 `configGet` 一次返回（`loadApiProviders`）】
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
- 报文 = `core/rules/payload.ts` 的 `buildImagePayload` / `buildVideoPayload` → `toSitePayload`（**唯一转换点**，产出品牌类型 `SiteSendPayload` = `SitePort.send` 入参）。
- API 提交：图片 = `jobBatch(base, N 个 {})`（**N 张 = N 个任务**）；视频单发 = `jobSubmit`；视频批量 = `jobBatch(base, BATCH_RATIOS.map(…))`。报文形状真源 = `src/stable/model/gen.ts` 的 `ApiJobPayload` / `ApiJobVariant`（端口入参就用它 ⇒ 形状漂移**编译期**即拦）。
- attempt 记录 = `core/rules/genHistory.ts`（`makeGenAttempt` / `patchGenHistoryAttempt` / `appendGenHistoryAttempt`）+ `state/generate.makeAttemptId`（时间经 `ClockPort`，序号在闭包内自增）。
- 发送管线的**五段**（`doubao/index.ts` 的 `send`，顺序即语义）：① 文本填入（原 Phase 1）→ ② **附图 = Phase 2 全段 + 2b**（`doubao/attachPhase2.ts`：CDP 主通路 + 8×1.2s 确认 → 剪贴板逐张回退 → 按键补充 → 2b 增量重试；纯判据住 `core/rules/attachRefImages.ts`）→ ③ 生成参数（Phase 2c）→ ④ **发送前完整性校验 = Phase 3a**（`core/rules/precheckAttach.ts` + `doubao/scripts.ts` 的指纹脚本）→ ⑤ Dola 面板（Phase 2d）→ ⑥ 点发送（Phase 3b）。
- **Phase 3a 的硬闸只在 `autoSend` 分支**：只填入（`autoSend=false`）时照走 `ok` 带 `precheck.pass=false` ⇒ 账号节点反馈条显示成 `err` + 警告（`accountSendFeedback` 读 `precheck`，源 `OL.jsx:353-355`）。
- `_pendingAttempt` / `_pendingAttempts` 的**写入方 = `state/pendingAttempt.ts`**（三条发送路径：`accountOps` 直调 · `generate.ts` 走 `GenDeps.onSent` 钩子 · `batchSend.transport` 直调），消费方 = `videoLanding` / `addVideoNode`（认领归属 + `conversationId`）。

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
出片去重（adapters/site/doubao/index.ts 的 pollResults，原 DR）：扫描项先过 **RR 有效性滤网**（core/rules/resultScan.isValidScan / filterValidScans —— data:/blob:/.svg/装饰图/过小过大全丢）→ 宽限与跨会话 URL 桶 → **QM 换无水印原图直链**（doubao/scripts.ts 的 WATERMARK_FREE_DIRECT_SCRIPT，失败回落扫描 URL）→ 取回 → 感知哈希与跨会话 hashes 桶 → **占位图判定**（core/rules/dedupe.createDedupe 的 placeholderDetector.isPlaceholder，上游 lib/phash.ts）→ **近重复窗口**（core/rules/resultScan.createNearDupWindow，模块级、最近 120 个感知哈希、汉明距离 ≤ 8）→ 落盘
视频本地化：**写入口内建** —— state/slices/canvas 的 `addVideoNode`（源 `shared.js:28140` genvideo 支 / `:28308` 网格支）
            与 `writeVideoUrl`（源 `_Component43.jsx:3160`）写完 `url` 后调**注入的** `localizeVideoNode`
            ＋ bootstrap/container 的 startVideoBackfill（启动 5s 全量回填）
            → state/localizeOps（★ usecases/localizeVideos 的唯一调用方；`localizeNodeInto` 的唯一调用点 = state/store 的注入实现）
            → MediaPort.saveVideoFromUrl → 回写 `vid://`
            （`vid://` 引用由**宿主独占**：主进程产生 + 注册协议 handler 供给；前端零解析、零拼装）
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
      addToLibrary → pushImageGenFeed → addVideoNode → patchNodeData → attachImageResultToNode → pushToast
  → state/store

adapters/host/electron/media.onDolaMedia(cb)  → state/subscriptions.ts → state/dolaMedia   【视频支 + 图像支，见 §二十四】
adapters/host/electron/clipboard.onChanged(cb) → state/hostOps ← ui/canvas/CanvasHost      【★ 只读不写 store：Ctrl+V 图片回落 + 时间戳】
```

**关键边**：`onJobEvent` 是 `ApiPort` 唯一的订阅方法；`createSubscriptions` 由 `container.ts` 装配一次。`applyApiJobEvent` **零 store 依赖**（决策与落点分开）；事件缺 `jobId` ⇒ 什么都不做。

---

## 十一、文件 / 素材链

```
ui/panels/LibraryPanel.tsx      → hostOps.importFiles()               【从文件添加素材】
   → state/hostOps                  【★ ui 需要的 `ports.host.*` **唯一落点**】
   → ports.host.file.importFiles
   → state/slices/canvas: commit('library') + setLibrary(...)         【唯一写入点】
   → state/store 的 setPartial                                       【镜像进 projects[activeId].data】
工程存储：ui/shell/TopBar（保存路径 / 打开目录 / 占用统计）→ state/projectOps → usecases/projectStorage → ports.host.project.{pickStorage,revealStorage,getStorageSize,activateStorage}
导入工程：ui/pages/StartPage → state/projectOps.importProjectFile → usecases/importProject → state/slices/global.addImportedProject
下载（gv-dl）：ui/nodes/{GenVideoNode,GenImageNode} → hostOps.downloadFileAs → ports.host.file.downloadFileAs
「在文件管理器里定位」：ui/nodes/{GenVideoNode,GenImageNode}（下载 toast）· ui/canvas/NodeContextMenu（「打开文件所在位置」）→ hostOps.revealPath → ports.host.file.revealPath   【真实路径与 `img://` **同一个入口**，判别在 electron/main.js 的 handler 里】
```

**关键边**：前两条**不从 `ui` 直调端口** —— 走 `state/hostOps`（`ui` **结构上拿不到 `Ports`**）。详见 §十八。

---

## 十二、没有链的模块（**有实现、0 消费**）

> **判"没有链"必须追到链尾**：端口方法**被某个 `core/usecases` 调用 ≠ 有链** —— 还要看**该用例本身有没有生产消费方**。
> **逐文件清单的真源 = `scripts/dead-code-baseline.json`** —— 本文件**不维护清单**（会漂）；下表只留**已裁定"判不落"**与**该删的**。

| 落点 | 0 消费的符号 | 证据（`refs` ① / `find-dead`） | 处置 |
| --- | --- | --- | --- |
| `adapters/site/tapnow/api.ts` | `tapnowListCanvases` | 该文件被 `tapnow/index.ts` import（文件活），**符号** 0 调用 | **判不落**：源里那条分支不可达（三处调用全传了 `canvasId`）⇒ 保留能力位、不接线、不造 UI |
| `HostPort.api` | `jobCancel` | 端口声明在、调用点 0 | **判不落**：源有该能力位但源内 0 调用 ⇒ 保留、不为它造 UI |
| `BackendPagePort` | `runScript` | 端口声明在、调用点 0 | **判不落**：预备消费者是源内 0 调用的那三个对外方法 |



---

## 十三、素材抓取链（含自动值守）

```
ui/panels/NewImagesPanel.tsx        【「立即抓取」】
  → state/accountOps.scanGallery      【逐账号扫描；失败原样上报；写库走 addLovartImages】
  → core/usecases/scanGallery         【编排：查站点适配器 → SitePort.scan → 映射成 LovartImageInput】
  → ports.sites[type].scan            【volatile：适配器内部 frames→webview 降级链】
       → adapters/site/shared/scanScripts.buildLibraryScanScript（页内脚本，原 `hp`）
                                     【产出 images + unread + **diag**（原 `hp` 的 `p`：文档/iframe/shadowRoot/img/可用/canvas/候选）】
       → adapters/site/shared/materializeScan（scanAttemptFromRaw；内部 materializeScannedImages：**远端图走批量取图 fetchImages**（`session.fromPartition(partition).fetch` ⇒ 带账号 cookie；**载荷收窄只在** `adapters/host/electron/lovartFetch` —— 缺必需字段 ⇒ 计 failed），内联/`img://` 就地落盘）
                                     【落盘成 `img://`（ref）；落不出 ⇒ failed++，不编造引用；diag 经 normalizeScanDiag 收窄】
  一张都没扫到时 → core/rules/scanDiag.formatScanDiag（原 `GT`）→ 阶段文案「没扫到图片（文档 1 · img 32（可用 0） · 候选 32→0）」
  一张都没扫到时（**且站点声明了 `exportCanvas`**）→ **canvas 兜底**（原 `wp:32610-32651`）
       → ports.sites[type].exportCanvas（门：`lovartPageKind(href) === CANVAS` ∧ `shouldExportCanvas(diag)`）
       → 页内 lovart/scripts.ts 的 CANVAS_EXPORT_SCRIPT（原 `Ay`，超时 25s）→ 落盘 `img://` → 追加进 items（**不参与 limit**）
  → state/slices/gallery.addLovartImages        【唯一写入点：去重由纯层兜底】
  → state/persist → usecases/persistLsKey(LS_LOVART_GALLERIES)   【落盘（见 §二）】

自动值守（显式调用，编排层驱动）：
ui/panels/NewImagesPanel.tsx（开关）→ state/accountOps.setAutoWatch(on)
  → core/rules/autoWatch              【纯决策：抖动 / 退避 / 空转上限；节奏由 adapter 声明】
  → ports.clock（setTimeout）         【定时器在编排层，非适配器】
  → 复用 scanGallery                  【手动与值守共用同一条】
```

**关键边**：谁能值守 = `SitePort.autoWatch?` **能力声明**（`tapnow` 声明、`lovart` 刻意不声明 —— 风控；后端 `electron/main.js` 有「Lovart 容器隔离」）；`core` / `state` / `ui` **零站点名判断**。扫描枚举真源 = `core/rules/scanChain.ts`（`SCAN_CHAIN` / `SCAN_PHASES` / `SCAN_SCOPES`），端口只 `import type` 转发。
⚠️ **DEV 断点**：mock 的 `imageFetchDataUrl` / `fetchImages` 都**合成内联图**（同 url 同图，不联网）⇒ 抓取链在 DEV 可验证；端到端要在 Electron 里跑 `scripts/verify-*.cjs`。

---

## 十四、截图链（两条：后台页快照 / 节点截图）

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

**关键边**：(a) 对象是**后台页 webview**、表在 `adapters/site/shared/backendPage.ts`（不导出）；(b) 对象是**节点 DOM 元素**、表在 `lib/captureRegistry`。`state/capture` 返回 `{ok, reason}`（源版静默 `null`，本工程如实上报）；`dpr` 由 `bootstrap` 注入（`state` 不读 `window`）。

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

会话准备（挂 `<webview>` 前 · 建号弹窗里；**两种模式由站点能力位分流**）：
ui/panels/{LoginModal,BackendView} → state/accountOps.prepareWebviewSession（`lovart: capsOf(type).usesLovartContainer`）
  → core/usecases/prepareSession
       容器模式（lovart）⇒ AccountPort.ensureLovartContainer（`{partition, proxy}`）→ 回 `{userAgent, preloadUrl: null}`
             ⇒ 落点 `ui` 的 `useState`（`containerUA`）→ `<webview>` 的 `useragent` + `webpreferences`
       指纹模式（有指纹的站点）⇒ AccountPort.ensureFingerprint（`{partition, fingerprint}`）→ 回 `{preloadUrl}`
             ⇒ 落点 `ui` 的 `useState`（`preloadUrl`）→ `<webview>` 的 `preload`
⚠️ 断点：两种模式都没有的站点（`other`）⇒ 不跑准备、恒就绪、不挂 preload。

账号指纹生成：core/rules/fingerprintGenerator ← state/slices/global
              （环境值经 adapters/host/shared/env 注入 —— 不纯那半不进 core）
指纹体检：ui/panels/FingerprintScanPanel → core/rules/fingerprintScan（scanFingerprintCollisions）
              + state/slices/scan（recordScan）→ persistLsKey(LS_SCAN_HISTORY)

会话分区（**恒有值**的不变量）：core/rules/partition（键形状，两种：newAccountPartition 建号 / makeImportedPartition 导入）
              ← **产生方** = core/rules/accountRoster.buildNewAccount（账号诞生那一刻；addAccount 与 buildPendingAccount 共用）
              ← **存量归位** = bootstrap/hydrate → core/rules/accountRoster.ensureAccountPartitions（幂等，补齐后写回 LS_ACCOUNTS）
              消费方**直读** account.partition（零兜底，四处）：doubao/index.send 入口守卫 · BackendView 的 <webview partition> · accountOps.prepareWebviewSession · adapters/site/shared/materializeScan.scanFetchContext（批量取图走 session.fromPartition 带 cookie）
                        （另：adapters/site/shared/webview.findWebview 用它定位 `<webview>` 元素 —— 经 account 间接取）
站点类型（`SiteType`）—— 账号域全链路的根
              真源 = src/constants/siteTypes.ts 的 SITE_TYPES（L0）；stable/model/account.ts 只转发
              形状 + 归一：stable/model/account.ts 的 Account.type: SiteType · normalizeAccountType（不在表里 ⇒ 回落 doubao）· isSiteType（类型谓词）
              按类型声明的能力位（各自真源，只声明子集；`ui`/`state` **零站点字面量**）：
                · 站点展示/流程策略表 → core/rules/siteCaps.SITE_CAPS（`Record<SiteType, SiteCaps>` 穷尽）→ 各领域模块**派生**自己的子集（accountPick.NEW_IMAGES_SITES / lovartGallery.GALLERY_SITES / lovartSession.CHROME_SESSION_SITES / accountPick 的可执行站点）
                · 会话页地址 → SitePort.chatUrl（各适配器声明）→ **唯一取值处** state/accountOps.chatUrlOf（未声明 ⇒ about:blank，不编造）
                · 登录页地址 → constants/models.ts 的 SITE_LOGIN_URL
                · 适配器 → adapters/site/registry.ts 的 createSiteRegistry（Partial；doubao / dola 同工厂；无 other）
                · 出新图条 → core/rules/accountPick.NEW_IMAGES_SITES（派生自 siteCaps 的 `hasNewImagesPanel`）
                · 画廊入口 → core/rules/lovartGallery.isGallerySite（`GALLERY_SITES` 派生自 siteCaps 的 `gallerySource !== null`，源 OP.jsx:710 的 fe）
                │            ＋ gallerySiteLabelOf（画廊名，源 :711 的 Te）
                · 值守能力 → SitePort.autoWatch?（tapnow 声明；lovart 不声明，见 §十三）
                · 豆包系媒体链声明位 → SitePort.mediaSource?（adapters/site/doubao 工厂声明，值 = 工厂的 `kind`）⇒ CDP 挂载（§十九）· 30s 主世界钩子注入（§二十三）· CDP 回流的源标签（§二十四）三处消费者**只问注册表**
                · 主进程域名 → electron/site-hosts.js 的 SITE_HOSTS（层 1）
                · 渲染侧域名 → src/constants/siteHosts.ts 的 SITE_HOSTS（层 1 值）+ core/rules/siteHost.isHostOfSite（层 2 判定）
                  消费：adapters/site/lovart/pageKind · tapnow/pageKind · tapnow/api（判归属）· doubao/dolaForce（注入载荷）
                  ⚠️ 与主进程那份**不是镜像对账**：两个世界没有共享代码的路（主进程 CJS／渲染侧 ESM bundle）⇒ 各 1 份
              消费：ui/panels/AccountTypePicker（遍历 SITE_TYPES；文案 = ACCOUNT_TYPE_PICKER_TEXT.cards[type]）
                  · ui/panels/AccountPanel（画廊入口 = isGallerySite；按钮提示语 = gallerySiteLabelOf）
                  · ui/panels/BackendView（出新图条 = NEW_IMAGES_SITES；无水印面板 ⟷ 出新图条互斥，见 §十九）

分组：ui/panels/GroupManagerModal → state/slices/global（六个 action）+ core/rules/accountGroup

后台视图：ui/panels/BackendView（渲染 .doubao-view-webviews 容器）
              ├─ mounted = 已登录 ∩ (autoStart ∪ leasedAccounts ∪ accountBusy)   ← 没人用的账号不挂 <webview>
              │    leases → BackendPagePort.subscribeLeases → state/subscriptions.ts → store.leasedAccounts
              ├─ 刷新 → accountOps.reloadBackend → BackendPagePort.reload（先撤就绪标记再 reload）
              ├─ 静默开关 → accountOps.toggleAutoStart → BackendPagePort.captureSnapshot/dropSnapshot
              ├─ <webview> 的**显隐/尺寸**：BackendView.module.css 两态类（照原版 index-Dg_Oc7MR.css）
              │        基础态 = position:absolute;inset:0（**尺寸恒定** = 铺满 .webviews）+ visibility:hidden + pointer-events:none
              │        可见态 = + z-index:2 + visibility:visible + pointer-events:auto   【原 dv-wv-active】
              │        视图隐藏 = .viewHidden（visibility，**非 display:none**）＋ .viewHidden .webviews{1280×800}
              └─ adapters/site/shared/webview（findWebview）→ 供 send / analyze / scan / 检测 复用

后台页租约：BackendPagePort（core/ports/backendPage.port.ts ← adapters/site/shared/backendPage.ts）
              prepareForSend（取租约 + 建记录）→ release（末条 ⇒ 1500ms drain 后删记录）→ leases/subscribeLeases
```

**关键边**：`state/accountOps` 与 `state/hostOps` / `state/licenseOps` 同法 —— **只转发 + 归一**（业务判据在 `core/rules` / `usecases`）。

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
       ├─ Lovart 会话条 → ui/panels/LovartSessionBar.tsx   （源 _Component25.jsx:358-382；守卫 = lovartSession.isChromeSessionSite ← 能力表 `hasChromeSession` ∧ active）
       │      → accountOps.openLovartChrome / closeLovartChrome / syncLovartSession → AccountPort → electron/chrome-cdp.js
       │      【真实 Chrome 人工登录 → cookie 同步进 webview 分区；提示行/禁用/错误码表 = core/rules/lovartSession】
       ├─ 无水印面板 → ui/panels/WatermarkPanel.tsx      （源 SD.jsx）
       ├─ **CDP 挂载**（无水印捕获的**前置**；捕获回流走 §二十二 的「CDP 支」= media.onDolaMedia → state/subscriptions → state/dolaMedia）
       │      两个入口调**同一个幂等实现**，且都只表达意图（dola-media.js 的门面 onGuestReady）：
       │        (a) 渲染层 dom-ready → accountOps.onWebviewDomReady（守卫 = `SitePort.mediaSource?`）→ HostPort.media.attachDolaDebugger
       │            → invoke 'attach-dola-debugger'（handler 随 `electron/dola-media.js` 的 initDolaMedia **自注册**）        【准】
       │        (b) 主进程 did-attach-webview（早，此时 URL 多为 about:blank）→ did-navigate 再试   【早】
       │      「谁该挂」由 dola-media.js 的 shouldAttach 内部判（按 ATTACH_SOURCES 的源声明；
       │        host 判定走 electron/site-hosts.js 的 isHostOf）—— 调用方不判、不兜
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
      ❌ 不造：R（Uu 快照）/ isForced / dv-send-overlay / dv-wv-* / has-snap（消费者全在没造的 UI 态里）
```

**面板分支**：无水印 `SD` ⟷ 出新图条 `_Component26` 互斥（`type ∈ {dola,doubao}` vs `{lovart,tapnow,other}`）；本仓 = `BackendView` 的 `watermarkOpen` vs `NEW_IMAGES_SITES`。
**头部工具栏触发**（源 `:3235-3268`）：刷新 → `accountOps.reloadBackend`（`disabled` 随 `autoStart !== true`）· 浏览器打开 → `hostOps.openExternal` + `accountOps.chatUrlOf`（`other` 支照抄 `url || 'about:blank'`）· 无水印 → 面板 toggle · 折叠 → 键 `doubao-view-head-collapsed`。
**无水印面板的流**：`ui/panels/WatermarkPanel.tsx` 读 **`ui.dolaMediaItems`（CDP 捕获列表）**（开合 = `BackendView.watermarkOpen`；计数徽标同源 = 原 `ce.length`）；「下载到：」← `hostOps.getDolaMediaDownloadSettings`（「更改」= `pickDolaMediaDownloadPath`）·「清空」← `clearDolaMedia` · 下载 ← `downloadDolaMedia(url, type)` · 原链接 ← `openExternal` —— 源 `SD.jsx` 的 4 个专用宿主方法经 `ports.host.media` 逐字接上（`get-download-settings` / `pick-download-path` / `dola-media-download` / `dola-media-clear`）。
✅ **数据源已对源**（2026-10-14）：面板条目 = **CDP 捕获列表**（`state/dolaMedia` 在 `onDolaMedia` 里 `setDolaMediaItems` 整体替换，**图+视频**），计数「图 N · 视频 M」；`videoShares` 退回它的真用途（**持久化分享记录**，源里只用于检测播种 `_Component43.jsx:531`），不再当面板数据源。

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
- ⓪ 文本填入（`In` 归一 → 剪贴板 → 聚焦粘贴 → 验证）· ① 附图 = **Phase 2 全段 + 2b**（`doubao/attachPhase2.ts`：CDP 主通路 + 8×1.2s 确认 → 剪贴板逐张回退 → 按键补充 → 2b 增量重试；纯判据住 `core/rules/attachRefImages.ts`）
- ② **Phase 2c 生成参数** → `adapters/site/doubao/setGenParams.applyGenParams`（脚本 `yD` 逐字搬入；dola 跳过；失败只留痕）；取参闸 = `core/rules/genParams.collectGenParams`
- ③ **Phase 2d Dola 面板 UI** → `runDolaForcePanelUi`
- ④ 点发送 · ⑤ 等结果（**仅图片通道**走 `pollResults`（原 `DR`）轮询，**结束即停**；视频 / 账号节点**发完即返回**，交 §二十一异步归属）
- 发送成功后（`:2943-3013`）：按站点能力分流 —— 有 `site.detectVideos` ⇒ `postSendDetect.notifySent`；否则 ⇒ `dolaMedia.registerSent`；并按 `hasVideoDescendant` 登记 `setNodePendingTimer`。★ 触发点两处：账号节点（`accountOps.sendAccountNode`）· 视频生成（`state/generate.runForNode` 的 `genvideo` 支）
- `precheck` 已落**并已接消费端**：判据住 `core/rules/precheckAttach.ts`；适配器 `doubao/index.ts` 出 `precheck` / `precheckIssue`；账号节点反馈条 `core/rules/accountNode.accountSendFeedback` 读 `pass=false` ⇒ 显示成 `err` + 警告（源 `OL.jsx:353-355`）
- 幂等：`sessionId = ${account.id}:${payload.source}:${hash32(payload.text)}` → `sentSessions` 防重发

**断点**：源 ③ `Uu.hold` 不造（0 消费者）；`At` / `_t` / `runParamScript` 不落（源内 0 调用）⇒ 参数自检**只落了 `wt`**。

**配方链**（原 `oR` `:35525` / `d0` `:35676`）：发送时 `prepare` 产配方（`core/rules/recipe.makeRecipe`）→ `sendOneNode` 的 `setRecipe` → `canvas.setNodeRecipe` 写 `nodeRecipes`（原 `:30844`）→ **落库时** `addVideoNode` 走 `deriveNodeRecipe`（原 `d0`）把配方**拷进新视频节点**的 `data.recipe`（+ `sourceLabel`）⇒ 视频节点的配方 chip / 复制配方 / 按配方重跑读它。

---

## 二十一、后台域 · 发送后检测（**只属视频通道**）

> 源里**图片**通道的收片走另一条：`_Component45.jsx:1054` 的 `DR({account,key,source,onItem,…})`（**同步**等结果：3s 轮询 / 10min 超时 / `onItem` 流式交）。
> ⇒ `postSendDetect` 是**视频通道**因「`Be` 发完即返回、不等结果」才必须的后台补救；本仓图像回流走 `pollResults`（原 `DR`）。

```
触发：① sendPayload 成功 && store.autoVideoDetect（:2943-2955，先把 {nodeId,sendTime} 记进 k）—— 本仓 = 账号节点 `accountOps` ＋ 视频生成 `state/generate` 两处
      ② pullResult 的 conversationId 分支（:3196-3206，记 k 时带 pull:true）
控制器：state/postSendDetect.ts（notifySent / stop）—— 不占租约（走 BackendPagePort.webContentsIdOf），轮询只在调用期间存在
  ① te(id) 取 webview；未就绪 ⇒ 轮询 executeJavaScript('!!document.body') 至多 15s（:1458-1479）
  ② URL 不含 /samantha/aispace ⇒ 导航过去（最多 2 次）+ 等 SPA 水合 1.5s（:1480-1513）
  ③ while (now - start < 3_000_000)（:1554）：
       SitePort.detectVideos（← HostPort.media.detectVideos，源 window.api.detectVideos :1564）
       首轮：建基线 = 旧视频 key 集 ⇒ 写回（源 b.current）；同时处理"首轮新片"（:1606-1655）
       后续轮：新片（key ∉ 基线 ∧ created_at > 基线时间）⇒ 分配 ⇒ 落库（:1657-1695）
       空闲 900_000ms 结束（:1696）
       xe(nodeId)（:1553-1583）：SitePort.probeGenSubmitted（原 ze(Y,Hd,'detect-gen-submit')）命中「已提交」回复
         ⇒ setNodeTimer(nodeId, now) + removeNodePendingTimer；探不到 ⇒ 等满 DETECT_TIMER_FALLBACK_MS 兜底起
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

**关键边**：计时器启动（`xe`）走 `SitePort.probeGenSubmitted`（第 5 个窄探测，原 `Hd`）—— 命中即起、探不到退回兜底档；调用是 **fire-and-forget**（源 `xe(Q).catch(()=>{})`）。

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
        ✅ 入口已放开（2026-10-14）：`vn-pull-chip` 的 `disabled` = 「`vid` 或 `conversationId` **任一存在**即可点」
                                      （与源 `disabled={!F || z}` 同）—— 此前仅 `vid` 时可点 ⇒ 该分支不可达
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
      ★ JP 形态 = **函数表达式 + 调用方传参**：(JP)(JSON.stringify(SITE_HOSTS)) —— 脚本里**零域名字面量**，
        值取自渲染侧层 1（constants/siteHosts）；判定形状与 core/rules/siteHost 同口径（跨世界消不掉）
  闸：core/rules/dolaForce.isDolaForceTarget
  挂进 send：发送前 enableDolaForce30s（源 Mt ← :2508 / :2832）→ Phase 2d runDolaForcePanelUi（源 Rt ← :1218）→ finally scheduleDolaForceCleanup（源 zt ← :2522 / :2919）

Dola 30s「主世界钩子」注入（★ **另一条 30s 路径**：那条**改请求体**，这条走**页面自己的开关 + 页面主世界钩子**；源两条都在，互不替代）：
  触发两处（源 _Component25.jsx:144 / :169；本仓 = state/accountOps）：
    onWebviewDomReady   ← <webview> dom-ready，**延迟 600ms**（INJECT_DURATION_DELAY_MS：等页面把输入区挂出来）
    onWebviewNavigated  ← <webview> did-navigate，**重注入**（钩子装在页面主世界，SPA 换页就没了）；守卫 = `SitePort.mediaSource?`（同 `onWebviewDomReady`）
  → HostPort.media.injectDolaDurationMain(webContentsId)   【adapters/host/electron/index.ts → checkOk **fail-closed**；mock 明确 notImplemented】
  → preload invoke 'inject-dola-duration-main' → electron/main.js 的 handler，做三件：
       ① 页内打开开关 localStorage['intl_doubao_enable_30s_v1'] = '1'（页内 catch **刻意静默**：那是注入到页面的串，打不了宿主日志）
       ② 读 electron/dola-duration-main.js 原文并注入 —— ★ **形态 = 函数表达式 + 宿主传参**：
          (script)(JSON.stringify({ SITE_HOSTS: siteHosts.SITE_HOSTS }))
          【脚本跑在 guest **主世界、不能 require** ⇒ 域名**没有位置**可写；层 1 真源 = electron/site-hosts.js】
       ③ 每 3s dump 一次时长 DOM（DUMP_EXPR）；变化即写 ~/dola-duration-debug.log；wc destroyed ⇒ 清定时器
  诊断回灌：页内 logDurationDiag → window.api.dolaDurationDiag → invoke 'dola-duration-diag' ⇒ **同一个日志文件**
            ⚠️ 发送链的**阶段行**同走这条路：adapters/site/doubao/index.ts 的 diag() → HostPort.media.logDolaDuration
            ⇒ 它是「30s 失效」排查的**唯一可观测面**（这条链断了只剩它）


静默快照：ui/panels/AccountPanel(.autostartSwitch) → accountOps.toggleAutoStart
  开启态：先 BackendPagePort.captureSnapshot（源 OP.jsx:515-531 的 Yy(id) → je）再置 autoStart=false
  静默态：setAccountAutoStart(id,true) + dropSnapshot（源 Ve(id) :516-524 = Xy(id) + updateAccount）
  底图：BackendView 的 img.silent-snap ← accountOps.snapshotOf
```

---

## 二十四、后台域 · 断点（不造 / 未落）

| 断的边（本仓侧） | 说明（源名见括注） |
|---|---|
| **`imageGenJobNode`** | **不落**：源 `bindImageGenJobs` 写它（`:27218`）但**全仓 0 读者** ⇒ 落它没有消费方（API 节点 id 由 `event.nodeId` 直给） |
| **`aspectRatio` 末档兜底** | **差异**：`resolveImageGenParams` 用 `NODE_DEFAULT_RATIO_LABEL`(4:3)，源是字面量 `'1:1'`（`:27251`）—— 复用本仓「节点默认比例」SSOT |
| **生成参数派生** | **不落**：唯一消费者是源那两个 0 调用方法 + 自检面板态 ⇒ 一起不落（源 `le` `:352-395`） |
| **任务占用计数** | **不造**：消费者（`dv-send-overlay` / `isForced`）本仓没有 ⇒ 0 读者（源 `Uu` `shared.js:35353-35404`） |
| **参数自检（自动设置 / 测试 / 脚本）** | **不落**：源内全目录 0 调用 ⇒ 只服务它们的状态/派生一起不落（源 `At` / `_t` / `runParamScript`） |
| **静默容器的回调 prop** | **不造**：已由 DOM 事件 + 端口承担（源 `_Component25` 的 `onLoadFailed` / `onUnmount`；`isForced` 依赖 `Uu`） |
| **拖放兜底脚本** | **不造**：站点层注入 —— 与「零注入」冲突（源 `c0`） |
