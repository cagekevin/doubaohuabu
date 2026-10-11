# 17 · 交接（换机继续）

> 写于 2026-10-10。**先读 §1，再读 §5（下一步），其余按需。**
> 规范文档是 `docs/00`~`docs/16`（尤其 `16-缺口落点与写法定稿.md` = 落点/写法/判据/验法总表）。

---

## 1. ⚠️ 换机第一件事：**工作全在未提交状态**

```
git log     → 只有 1 个提交：6249948 chore: 初始化仓库（豆包画布渲染层重写 M0~M7）
git status  → 94 项：45 个已跟踪改动(M/D) + 49 个未跟踪(??)（含整个 src/ docs/ public/ scripts/ tests/）
```

**M8~M11 的全部产出都还没提交** ⇒ 换机必须二选一：

- **(a) 先提交**（推荐）：
  ```
  cd app
  git add -A
  git commit -m "M8~M11：契约与状态地基 / 内核纯规则 / 边界层 / 用例起步 + 若干数据完整性修复"
  ```
  ⚠️ `public/mediapipe/`（**12.77 MB**，4 个文件）会一起入库 —— `.gitignore` 只排除 `dist/`。**有意为之**（它是 `appasset://mediapipe/...` 的落点），但若不想入库请先确认。
- **(b) 整树拷贝**：连 `app/` 一起拷走（**别只拷 `src/`** —— `public/mediapipe/` 缺了人脸检测就跑不起来）。

---

## 2. 新机准备

```bash
cd app
npm install                 # 依赖（含 playwright ^1.64.0 与 @mediapipe/tasks-vision ^1.1.0）
npx playwright install chromium   # ★ 运行时验证要用；浏览器落在 %LOCALAPPDATA%\ms-playwright
npm run check               # 基线门禁，应全绿
```

**新机必须补的东西**：

| 项 | 说明 |
|---|---|
| `public/mediapipe/`（12.77 MB） | 人脸检测的模型 + wasm 运行时。**不在 npm 里**，随仓库走（见 §1） |
| playwright 浏览器 | 包在 `devDependencies`，但**浏览器二进制不在仓库** ⇒ 必须 `npx playwright install chromium` |
| 兄弟目录（可选） | `../逆向工程/`（回源管线 + `_pipeline_step/analysis/shared-decls.json`）；`../逆向专用/`（逆向工具链）。**验证脚本已不再依赖它们**（见 §7） |

---

## 3. 这是什么 / 做到哪了

把一份**逆向出来的原版应用**（Electron + React，函数名混淆）**按既定架构重写**成 TS。
核心要求：**行为等价 + 数据兼容**，且遵守 `docs/11` 的八原则（分层 / SSOT / Result / 无断言 / 测试边界…）。

| 里程碑 | 状态 |
|---|---|
| M0~M7 | ✅ 已提交（基线：壳 + 画布 + 持久化 + 8 类节点骨架） |
| **M8 契约与状态地基** | ✅ `stable/contracts/lsValues.ts` · `stable/protocols/vid.ts` · `state/slices/settings.ts` · `state/persistKeys.ts` · `state/subscriptions.ts` |
| **M9 内核纯规则** | ✅ 23 个 `core/rules/*`（`replyKind`/`license`/`sendGuard`/`genProgress`/`refs`/`recipe`/`proxy`/`media`/`accountPick`/`faceDetect`/`facemask`…）+ `lib/{text,time,selection,async}`。**3 轮独立质量审查已过** |
| **M10 边界层** | ✅ 5 个站点适配器（`doubao`/`dola`/`lovart`/`tapnow`/`gpt`）+ `adapters/media/faceDetect.ts` + `site/shared/{webview,waits,inputLock,scanScripts}`。**仅 `tapnow` 的 `pP` 未落**（依赖不在声明表里的 `mp`） |
| **M11 用例层** | ⏳ **起步**：`core/usecases/` 只有 `persistProject` · `persistAccounts` · `generate`。**`docs/16` 规划了 14 个** |
| M12 UI 公共件 + 8 类节点 | ⏳ **起步**：`ui/nodes/NodeShell.tsx` 已落（C1 收口，见 §5） |
| M13 20 个面板 | ⏳ 未开始 |

**门禁（本机实测，最后状态）**：`149 模块 / 406 依赖 / 0 违规 · 474 tests` ✅
**运行时验证**：W2 **6/6** · W4 **4/4** · W13 **6/6** · `verify-del` **5/5** ✅

---

## 4. 怎么验（命令 + 期望）

```bash
cd app
npm run check                       # 类型 + lint + 分层 + 不变量 + W1 + 单测  → 应全绿
npx vite build                      # ★ 运行时验证都吃 dist/，改完源码必须重建
node scripts/verify-w2.cjs          # 启动链路            期望 6/6
node scripts/verify-w4.cjs          # 持久化（防抖/不丢）  期望 4/4
node scripts/verify-canvas.cjs      # W13 八类节点渲染     期望 6/6
node scripts/verify-del.cjs         # 删除链路（悬空边/撤销）期望 5/5
node scripts/verify-run.cjs / verify-e2e.cjs / verify-config-store.cjs
```

⚠️ **`dist/` 是过期构建时，运行时验证会验到旧代码** —— 改了 `src/` 必须 `npx vite build` 再跑。
⚠️ 单测跑不到 UI 层（原则 7：测试只在 `core/**/tests`、`stable/**/tests`、`lib/tests`）⇒ UI 的行为**只能**靠上面这些脚本验。

---

## 5. 下一步（按 `docs/16`，不用再问）

1. **M11 用例层**（最大缺口）：`docs/16` §1.6 的 14 个 —— `sendToSite` · `sendQueue` · `applyApiJobEvent` · `apiConfig` · `captureMedia` · `localizeVideos` · `fetchWatermarkFree` · `scanGallery` · `projectStorage` · `importProject` · `license` · `prepareSession` · `accountTransfer` · `generateImage`(原 `aO`/`tO`)
   ⇒ `docs/14` §1 记着「**41/53 端口方法零调用**」，缺口全在这里。
2. **`docs/14` §2 剩下的「已坏」项**（按严重度）：
   - `setBusyAccounts` **无写入方** ⇒ `all-busy` 排队永不触发（写入时机在发送编排里，属 M11）
   - **授权校验完全没接**（`LicensePort` 4/4 未用 ⇒ 不校验就进画布）
   - `setSnap` / `disconnect` / `canUndo` 等 UI 接线（M13）
3. **M12 接着做**：`docs/16` §1.4 的 `nodes/*.tsx` 的 34 按钮 + 功能区 · `canvas/CanvasHost.tsx` 的拖放/框选/右键/快捷键/音效 · `common/{AccountPicker,RatioPicker,DurationPicker,SplitKeywordModal}`
4. **照抄未完成的部分**（`docs/16` 变更记录里有清单）：`onNodesChange` 里**删 group 时给孩子解绑 + 平移** · `dimensions` 后跑 `Hy`（= 文本节点最小尺寸钳制 `440×300`，我尚未落）· 一批 ReactFlow props（`multiSelectionKeyCode` / `selectionMode` / `zoomOnDoubleClick={false}` / `connectionRadius={60}` / **`snapToGrid`+`snapGrid`（我们有 `snap` 状态却没用上）** / `colorMode` / `fitView` options / `onEdgeClick` 等）

---

## 6. ★★ 两条纪律（我这轮踩过，务必遵守）

### ① **能抄就别推** —— 原版前端源码就在仓库里

`app/docs/豆包画布原版参考/expanded_components/` = 原版**展开后的 JSX + shared.js**（可读）。
- **UI 接线 / handler / props / 字段默认值** ⇒ **先去这里读**，抄完再改
- 后端更直接：原版安装目录 `resources/app/electron/`（`main.js` / `preload.js` / `fingerprint-preload.js`）是**可读源**
- 声明名 → 行号 的索引在 `../逆向工程/_pipeline_step/analysis/shared-decls.json`

**反面教材**：我修 `CanvasHost` 的删除链路时**自己推理根因 + 自己设计修法**，方向对但**漏了三处**（原版从 store 读当前值 / 删边也 commit / 删 group 时给孩子解绑）。照抄后 5/5 通过。

### ② **先读文档再动手**

`docs/16` 把每项的**落点 / 写法 / 判据 / 验法**都写好了。
**反面教材**：`NodeShell` 我先去翻代码、准备自己设计 API —— 而 `docs/16` §1.4/§2.1 连「复合组件传 `children`」和验法「**`'dot'` 类名只出现在 `NodeShell`**」都定好了。

---

## 7. 已知坑 / 环境依赖

| 坑 | 说明 |
|---|---|
| **兄弟目录会"消失"** | `../逆向专用/`（逆向工具链，playwright 原本住这儿）**会话中途消失过一次**，导致 6 个验证脚本当场 `MODULE_NOT_FOUND`。⇒ 已把 **playwright 装进 `app/` 作 devDependency**，脚本改用**裸模块名** `require('playwright')`，**不再依赖工程外路径** |
| **验证脚本吃 `dist/`** | 见 §4 |
| **临时脚本跑完即删** | 回源用的 `scripts/_tmp-*.cjs`、一次性探针（`src/**/tests/_tmp-*.test.ts`）**都不留在仓库**。仓库规约：需要核对时临时跑，跑完即弃 |
| **`state` 层能偷藏测试** | 原则 7 的 eslint 规则只拦 `ui/**` 与 `adapters/**`，**没拦 `state/**`** ⇒ 在那儿放测试能溜过检查（已登记，按用户裁定**不新增闸**，靠"跑完即删"的纪律兜） |
| **`emptyOutDir: false`** | `dist/` 旧哈希文件会累积（本机安全护栏拦了 `fs.rmSync`），需要时手工清 |
| **`docs/豆包画布原版参考/`** | 已被 eslint/depcruise 排除（`docs/**`）⇒ 不会污染门禁 |

---

## 8. 唯一还等你拍板的（不阻塞 M11 前半）

**指纹注入**（`TD-13-2`）：后端 `fingerprint-preload.js` 在注入 `navigator`/`screen`/`webgl`（7 维指纹 + `fpSalt` 轮换），而技能判据 **J4 要求"零注入"**。

- **J4 原文的检查项是「站点适配器无注入代码」** ⇒ 它约束"注入代码住哪"，不是"能不能用指纹"
- 原版注入在**后端**（我们不改后端）；前端只**调**端口 `ensureFingerprint`（`preload.js:89`）
- ⇒ **兼容读法**：前端调它、前端不写注入代码 = J4 满足。**但风险是**：改指纹可能被站点判伪造（Cloudflare 403），原版是**主动承担该风险换"账号间不关联"**
- **影响面**：仅 M11 的 `prepareSession.ts`（要不要调 `ensureFingerprint`）

> 另两项（人脸检测方案 / 队列浮窗做不做）**已定**：前者由证据定案 mediapipe（原版 `package.json` + `appasset://` 已铺路）；后者建议搁置到 M11 之后。

---

## 9. 本机最后状态快照

```
门禁     149 模块 / 406 依赖 / 0 违规 · 474 tests        ✅
运行时   W2 6/6 · W4 4/4 · W13 6/6 · verify-del 5/5      ✅
未提交   94 项（45 M/D + 49 ??）                          ⚠️ 见 §1
临时文件 无（scripts/_tmp-*.cjs 与 tests/_tmp-*.test.ts 均已清）
```
