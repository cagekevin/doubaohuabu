# 豆包画布 · UI Mockup

> 打开 `index.html` 即可（纯静态，无需构建、无需 `npm install`）。

这个 mockup 有两个用途：

1. **界面预演** —— 把 `src/ui/**` 尚未完工的界面一次性画出来，先看清楚长什么样。
2. **Token 体系试验田** —— `assets/tokens.css` 是三层 token 架构的成品，**不碰 `src` 一行**就能试切，确认好用了再迁。

---

## 一、四个开关（都在页面顶部）

全部只改 `<html>` 上的一个属性，全局即时生效，**源码零改动**：

| 开关 | 属性 | 取值 |
|---|---|---|
| 品牌色 | `data-brand` | `indigo` · `blue` · `violet` · `green` |
| 明暗 | `data-theme` | `light` · `dark` |
| 圆角风格 | `data-shape` | `square`(2/4/6px) · `standard`(4/8/12px) · `round`(8/12/18px) |
| 密度 | `data-density` | `compact`(×0.75) · `standard`(×1) · `loose`(×1.25) |

还有一个 **★解耦演示** 按钮：只把节点选中框改成橙色，主按钮 / 连线 / 连接点 / focus 环 / 框选虚线**纹丝不动**。
改造前这 6 个语义共用一个 `--color-primary`，**做不到这件事** —— 这就是本次改造要解决的核心病灶。

---

## 二、三层架构（`assets/tokens.css`）

```
L1   PRIMITIVE   原始值（颜料盒）· ★ 全仓唯一允许十六进制 / px 的地方
L1.5 BRAND       品牌槽位 · 指向 L1，data-brand 整体换掉
L2   SEMANTIC    语义层（意图）· 组件只准引用这一层
L3   COMPONENT   组件旋钮 · 每个控件自己的可调参数
```

### 改视觉时，动哪一层？

| 你想改什么 | 动哪一层 | 动几行 |
|---|---|---|
| 整体换品牌（紫→蓝） | L1.5 的 `--brand-500` | 1 行 |
| 换整套明暗 | 切 `data-theme`（L2 已有两套） | 0 行 |
| 只改按钮，不动选中框 | L3 的 `--btn-primary-bg` | 1 行 |
| 只改选中框，不动按钮 | L3 的 `--node-selected-ring` | 1 行 |
| 切圆角风格 | 切 `data-shape` | 0 行 |
| 切紧凑 / 宽松 | 切 `data-density` | 0 行 |

### 拆开的那 6 个语义

改造前它们全是 `--color-primary`（实测 **44 次引用 / 11 种属性**）：

| 语义变量 | 用在哪 |
|---|---|
| `--color-action-primary` | 主按钮底色 |
| `--color-accent-text` | 强调文字 / 图标 |
| `--color-selected-border` | 选中框 |
| `--color-selected-ring` | 选中光环（box-shadow） |
| `--color-focus-ring` | 键盘 focus 环 |
| `--color-marquee-border` | 框选虚线 |
| `--color-handle` | 连线端点 |
| `--color-edge` | 连线本体 |

---

## 三、原版 UI 宏观结构（★ 真源：原版 jsx + 原版 CSS）

> 类名逐字取自 `docs/豆包画布原版参考/expanded_components/*.jsx`；
> 样式真值取自原版 `index-Dg_Oc7MR.css`（安装目录 `…/doubao-canvas/resources/app/dist/assets/`）。
> **看 mockup 前先读这张图**——它回答：有几个页面、哪些是常驻面板、哪些是浮层、哪些是弹窗、各挂哪。

### 3.1 三个页面（根组件 `_Component48.jsx`）

| 页面 | 出现条件 | 根类名 | 源码 |
|---|---|---|---|
| 加载态 | 授权校验中 | `.app-loading` | `_Component48.jsx:139` |
| 激活页 | 授权无效 | `.license-screen` | `W3.jsx` |
| 启动页 | 未选项目（`!started`） | `.startup` | `_Component47.jsx` |
| 工作台 | 已启动 | `.app` | `_Component48.jsx`（组装） |

### 3.2 工作台三栏（`.app › .main-area`）

| 栏 | 宽 | 内容 | 源码 |
|---|---|---|---|
| 左 `.side.left-side` | 256px（响应 220 / 196） | 账号面板 `.account-panel`（`OP.jsx`）+ 底部「⚡API 服务」`.side-api-btn` | `OP.jsx` |
| 中 `.center-stage` | 弹性 | 画布 `.canvas-wrap`（`_Component42.jsx`）＋ 后台视图 `.doubao-view`（`_Component43.jsx`，可切换显隐） | — |
| 右 `.side.right-side` | 248px（响应 214 / 190） | 资源库 `.library-panel` | `RT.jsx` |

- 两栏均可收起：`.side.collapsed` → 宽 0；`.side-toggle` 是 22×52 骑马钮（贴在栏边上）。
- **没有全宽顶栏**。项目名 / 保存路径 / 授权 / 「▦豆包后台」是浮在画布上方的居中条 `.canvas-topbar`（`_Component42.jsx:1563`）。
- 左栏底部还有「返回首页 / 清空画布 / 网格吸附」在 `.panel-foot`。

### 3.3 画布内浮层（`.canvas-wrap` 的子节点，随画布页面共存亡）

| 浮层 | 触发条件 | 定位 | 源码 |
|---|---|---|---|
| `.canvas-topbar` | 常驻 | absolute 顶部居中 | `_Component42.jsx:1563` |
| `.canvas-sel-toolbar` | 多选 | 跟随选区（算位同 `L3.jsx`） | `:1490` |
| `.sel-arrange-menu` | 点「整齐排列」 | 工具条下方 absolute | `:1506` |
| `.gc-handle` + `.gc-line` | 多选 ≥2 | 包围框右缘 30×30 圆锚点 | `_Component37.jsx` |
| `.bs-trigger-group` | 多选 text/genvideo ≥2 | 选区上/下方 | `L3.jsx:174` |
| `.bs-backdrop` › `.bs-card` | 批量发送中 | 全屏遮罩 + 540px 卡 | `L3.jsx:191` |
| `.drop-hint` | 拖文件经过画布 | **全屏 inset 12px 虚线大框** | `:1466` |
| `.canvas-empty-hint` | 空画布 | 居中 | `:1467` |
| `.app-toast` | 全局 toast | 固定底部居中（胶囊） | `:1474` |
| `.error-banner-container` | 后台报错 | 顶部居中（top 52px） | `:1610` |
| `.create-panel` | 从 handle 拖出连线 | 鼠标位置 fixed | `:1638` |
| `.node-ctx-menu` | 节点右键 | 右键处 fixed | `:1685` |
| `.face-mask-panel` | 点遮脸角标 | 232px 宽 fixed | `_Component40.jsx` |
| `.sq-panel` | 发送队列非空 | 左上 16px，320px 宽，可拖 | `z3.jsx`（memo 为 `F3`） |
| `.ie-overlay-root` | 编辑图片 | 全屏 | `G3.jsx`（`_Component41`） |

### 3.4 节点自身附着的浮层（挂在节点 DOM 里或旁）

| 浮层 | 宿主节点 | 形态 | 源码 |
|---|---|---|---|
| `.mat-prompt-pop` | material / imggen | 节点**下方** absolute（`top:calc(100% + 8px)`） | `fL.jsx` / `ZL.jsx` |
| `.mpp-json*` | 上一者内部 | AI 提示词 JSON 视图 | `_Component31/32.jsx` |
| `.gv-hist-pop` | genvideo / imggen | **portal 到 body**，264px | `YL.jsx:585` / `ZL.jsx` |
| `.reply-notice` | text | **浮在节点上方**（`bottom:calc(100% + 8px)`） | `CL.jsx` |
| `.vn-panel` | video | 视频区内 absolute 底部浮层 | `BL.jsx` |
| `.ref-menu` / `.fuzzy-panel` | text | 节点内 / 条件显隐 | `CL.jsx` |
| `.face-marks-layer` | material / imggen | 图片上方覆盖层（人脸框） | `iL.jsx` |

### 3.5 Portal 弹窗（`createPortal(…, document.body)`）

| 弹窗 | 根类名 | 打开方 | 源码 |
|---|---|---|---|
| 文生视频生成面板 | `.gen-panel-layer` | 点 genvideo 卡片 | `Z3_1.jsx` |
| 文生图生成面板 | `.gen-panel-layer` | 点 imggen 卡片 | `_Component45.jsx` |
| 风格库 | `.style-lib-layer` | 生成面板「◇ 风格」 | `US.jsx` |
| 引用素材选择器 | `.panel-backdrop › .lib-picker` | 「@ 引用素材」/ 文本框 | `_Component33.jsx` |
| 素材挑选器 | `.panel-backdrop` | 画布连线落选态 | `DT.jsx` |
| API 服务 | `.modal-overlay › .api-settings` | 左栏「⚡API 服务」 | `_Component46.jsx` |
| 账号登录 / 选择 / 导出 | `.login-backdrop` | 账号面板各按钮 | `TP` / `$P` / `PP` / `_Component23` / `_Component24.jsx` |
| 指纹关联扫描 | `.login-backdrop › .linkscan-*` | 「🔗 关联扫描」 | `DP.jsx` |
| 出口代理池 | `.login-backdrop` | 「🌐 出口代理」 | `LP.jsx` |
| 图片编辑器 | `.ie-overlay-root` | 「编辑图片」 | `G3.jsx` |

### 3.6 后台视图内部（`.center-stage` 里的 `.doubao-view`，`_Component43.jsx`）

- `.doubao-view-head`：账号标题 `.dv-title` + 操作 `.dv-actions`；整条可收起（`.dv-head-toggle` 52×24）。
- `.doubao-view-webviews`：每账号一个 webview（逻辑 1280×800 缩放适配）。
- `.silent-overlay`：静默期遮罩（页面快照 + 68×68 恢复钮）。
- `.dola-media-panel`（`SD.jsx`）：Dola 媒体面板（可 docked）。
- `.nip-wrap`（`_Component26.jsx`）：「出新图」聚合条（Lovart / Tapnow / 网页抓图 → 发到画布）。
- `.doubao-empty-hint`：无账号空态。

---

## 三·补 缺口全景（量化）

> 数据来自 `docs/12` §1.0 / §二、`docs/13` §0，`docs/16` 对 **280 项**逐项裁决。

> ⚠️ **2026-10-11 核实：本表已过时** —— 它是 **M12 之前的快照**，此后 M12/M13 落了大量节点按钮与面板
> （text 拆分 / 批量发送 / 提示词分析 / `@` 引用等）。**续修时先重新数，别直接引用下表。**
> 已核实的一条：`src/ui/nodes/` 现有 **24 个 `<button>`**（节点内 12 + 浮层/弹窗 12），**不是 0**。

| 类 | 原版 | 重写（**快照，已过时**）|
|---|---|---|
| 8 类节点按钮 | **34 个** | ~~0 个~~ → 2026-10-11 实测节点内 **12 个**（另有浮层 12 个）|
| 页面 / 面板 | 18 主 + 20 带 UI | 27 个完全没有（10 + 17 补登）—— **待重核** |
| 画布交互 | 10 按钮 / 25 交互 | 4 项 —— **待重核** |

**节点缺失倍数**（`docs/12` §1.0）：

| 节点 | 原版 | 重写 | 倍数 |
|---|---|---|---|
| text | `CL.jsx` 27,664 B / 8 按钮 | `TextNode.tsx` 658 B / 0 | **42.0×** |
| genvideo | `YL.jsx` 20,420 B / 4 | `GenVideoNode.tsx` 1,115 B / 0 | 18.3× |
| video | `BL.jsx` 15,232 B / 7 | `VideoNode.tsx` 936 B / 0 | 16.3× |
| material | `fL.jsx` 10,045 B / 5 | `MaterialNode.tsx` 731 B / 0 | 13.7× |
| account | `OL.jsx` 15,714 B / 1 | `AccountNode.tsx` 1,268 B / 0 | 12.4× |
| imggen | `ZL.jsx` 15,552 B / 6 | `GenImageNode.tsx` 1,320 B / 0 | 11.8× |
| download | `WL.jsx` 5,128 B / 2 | `DownloadNode.tsx` 622 B / 0 | 8.2× |
| group | `GL.jsx` 1,420 B / 1 | `GroupNode.tsx` 437 B / 0 | 3.2× |

**但要配合 `docs/00-进度台账.md` 一起读** —— 那里是 `M0~M7 全绿 / 117 模块 / 274 单测 / 17 个验收用例 15 通过`。
即：**地基稳，缺的是表皮**；且 `AGENTS.md` §一 列的 `dedupe / facemask / faceDetect / fingerprint / sendGuard / replyKind / genProgress / license`
都是「**有实现、生产 0 消费**」—— 芯已做好，只差接线。

### ③ 节点屏的还原口径

第③屏 **不是按理解摆的**，是逐字对照 `docs/豆包画布原版参考/expanded_components/*.jsx` 的 DOM：

| 节点 | 原版文件 | 关键位置事实 |
|---|---|---|
| text | `CL.jsx:714-818` | `reply-notice` 在节点最顶；`自动匹配`/`拆分` 在 **node-head 内**；`保存预设` 在 `head-actions` 内；`@ 引用素材` 在 `text-toolbar` 内（与素材缩略条同行） |
| material | `fL.jsx:157-197` | `mat-float-actions` 是**浮在图片上**的绝对定位组；`mat-prompt-pop` 是**节点外的兄弟弹层**，不在节点内；标题格式 `素材 · {name}` |
| account | `OL.jsx:412-524` | `auto-send-toggle` 在 **node-head 内最右**；账号下拉与发送按钮在 `account-top-row` **同一行**；`account-feedback` 在其下；`account-summary` 最底 |
| video | `BL.jsx` | `vn-provenance`（来源/配方/可拉取）在视频下方；`vn-panel` 的 foot 是左「复制配方」右「按配方重跑」；`video-controls` = 播放 ‖ 时间线 ‖ 截图(S) |
| download | `WL.jsx:111-147` | 「选择…」与「目录：」**同一行**；「全部下载」在 `dn-action-row` **左侧**，「已下载 X」在其右；错误态是 **✗** |
| group | `GL.jsx:20-38` | 取消组按钮在 `group-node-head` 内**最右**；组是容器不挂 handle |
| genvideo | `YL.jsx:474-585` | 历史按钮在 head **最右**（22px 高胶囊）；播放浮层在 stage **正中**（34×34）；**时长徽章在左上**（`gv-dur-badge` left 8px）、**下载在右上**（28×28）；**三帧按钮 `gv-frame-actions` 是 absolute 浮在 stage 下方**（`top:calc(100% + 8px)` 居中），不在文档流里 |
| imggen | `ZL.jsx:213-320` | head 内 grow 之后是 `ig-chip-status` 再是历史按钮；**无结果时是 `gv-preview-empty`**；有结果时浮出 `mat-float-actions`（编辑图片 / 分析提示词） |

**★ 关于「输入提示词」**：生成节点上**没有**输入框。空态只显示
`gv-preview-empty` —— 「文生图 · 在下方输入提示词」+「点击卡片打开生成面板，出图直接展示在这里」。
真正的输入在三处：

1. **生成面板**（`Z3_1.jsx` / `_Component45.jsx`）→ 见第⑥屏
2. **文本框** `text-edit`（contentEditable，占位「输入文字，输入 @ 从资源库引用素材…」）
3. **AI 提示词弹层的调整框** `mpp-revise-input`（占位「想怎么改？如：改成夜景、换成俯拍镜头…」）

---

### ★ 怎么保证骨架不再跑偏

之前出过问题：靠**手读 jsx 片段**去摆按钮，结果每读一段写一段，写完发现位置不对，改就成了打补丁。

现在的机制是**机器提取**：

```bash
# 重新抽取 8 类节点的 DOM 骨架，覆盖 SKELETON.md
cd 项目根
MD=1 node docs/mockup/tools/extract-skeleton.cjs CL fL OL BL WL GL YL ZL > docs/mockup/SKELETON.md
```

- `docs/mockup/SKELETON.md` —— **骨架真源**（460 行，机械抽取，非手写）
- `docs/mockup/tools/extract-skeleton.cjs` —— 提取器（`@babel/parser` 解析 JSX，输出纯 DOM 树）

图例：`?cond` 条件渲染 · `×N` 循环 · `[PORTAL]` 挂到 body · `「…」` 表达式文案 · `★` 已识别子组件。

**改 mockup 第③屏前，先重跑这条命令对照 SKELETON.md**，不要凭印象写。
新增节点类型时，把组件名加进命令即可。

已知抽取器把某些混淆变量折叠成了 `?` / `{…}`（如 `?o.length>?`），
需要精确条件时按行号回读原 jsx（SKELETON.md 的每个类名都能在原文件里 grep 到）。

---

### ★ 布局旋钮（原版 CSS 已入库，旋钮即真值）

`mockup.css` 顶部有一块**布局旋钮**，所有位置/尺寸集中在此。**原版 CSS 已随安装目录入库**
（`F:\Users\xinye\AppData\Local\Programs\doubao-canvas\resources\app\dist\assets\index-Dg_Oc7MR.css`），
旋钮值**逐条对照过原版规则**，不再是推断值：

| 旋钮 | 值 | 原版出处 |
|---|---|---|
| `--mk-head-gap` | 6px | `.node-head{gap:6px}` |
| `--mk-head-pad-x` | 10px | `.node-head{padding:8px 10px}` |
| `--mk-head-h` | 32px（= 8+8 padding + 16 行高） | 原版无固定高，padding 推成 |
| `--mk-node-fs` | 12px | `.node-head{font-size:12px}` / `.account-node{font-size:13px}` |
| `--mk-btn-h` | 22px | `.gv-hist-btn{height:22px}` |
| `--mk-thumb` | 36px | `.mat-thumb` / `.lib-thumb{width:36px;height:36px}` |
| `--mk-stage-ratio` | 16 / 9 | `.gv-stage{aspect-ratio:16/9}` |
| `--mk-side-w-left` | 256px | `.left-side{width:256px}` |
| `--mk-side-w-right` | 248px | `.right-side{width:248px}` |
| `--mk-cell-min-w` | 340px | mockup 专有（图鉴栅格，原版无此界面） |

**① 引用 token 的（守 SSOT，不用管）**

```css
--mk-head-gap:    var(--space-1);   /* = 6px，与原版 gap:6px 一致 */
--mk-head-pad-x:  var(--space-2);   /* = 10px，与原版 padding 一致 */
--mk-head-h:      var(--node-head-height);
--mk-node-fs:     var(--font-size-sm);
--mk-micro-fs:    var(--font-size-xs);
--mk-float-inset: var(--space-1);
```

**② ★例外：mockup 专有尺寸（**不是**待并入 L3）**

| 旋钮 | 值 | 为什么它只在 mockup |
|---|---|---|
| `--mk-cell-min-w` | 340px | 图鉴栅格最小宽 —— **src 里还没有这个界面**（图鉴未落地）|
| `--mk-btn-h` | 22px | 节点内微型按钮高 —— 原版 `.gv-hist-btn{height:22px}`；src 的 `.btn` 最小档 32px 没有对应档 |
| `--mk-thumb` | 36px | 素材缩略条 —— 原版 `.mat-thumb`/`.lib-thumb` 36px；src 的 `.thumb` 20px，形态不同 |
| `--mk-stage-ratio` | 16/9 | 预览区比例 —— src 里只有 `GalleryPanel` 的 `aspect-ratio: 1`（网格卡片，不是舞台）|
| `--mk-side-w-left/right` | 256 / 248px | 三栏宽 —— 原版写死在 `.left-side`/`.right-side`，无 token；两栏不同值，故不并 L3 |

> ✅ `--mk-micro-9`（9px 极小字）**已并入** —— 改用 `var(--font-size-2xs)`（`tokens.css` 里有这一档）。

**发现原版与旋钮不一致时**：改旋钮一行即可全局生效，不需要逐条翻规则。

### ★ 单规则独有的原版尺寸：随规则驻留（不进旋钮区）

**口径**：旋钮区只放**跨规则复用**的布局参数；**单条规则独有的原版尺寸**（面板宽 880/720/680、`sq-panel` 320、
`face-mask-panel` 232、`gv-hist-pop` 264、`bs-card` 540、`create-panel` 208、`gc-handle` 30、`side-toggle` 22×52 …）
**就近写在规则旁并标注原版出处**（`/* 原版 .gv-hist-pop：264px */`）。
理由：这些值原版自己也是散装硬编码、不复用；全塞进旋钮区只会让旋钮区失去"一眼可调"的意义。

### ★ mockup 新增的 L2 语义（迁移前必须过 `docs/17`）

本轮为忠实复刻原版，往 `tokens.css` 补了 4 个 L2 语义 + 1 个 L1 通道值。
它们**不是**原版 token 的翻版，而是**新语义** —— 迁移到 `src/styles/tokens.css` 前要按 CSS 契约（`docs/17`）登记：

| 新增 | 值 | 原版对应物 | 迁移前提 |
|---|---|---|---|
| `--color-info` / `-bg` / `-border` | blue-500 三件套 | 原版 `--info`/`--info-soft`/`--info-border` | 新增语义 → 过 `docs/17` 登记 |
| `--color-media-scrim` | `rgb(black / .55)` | 原版 `#10121b8c`（图/视频上按钮底） | 同上 |
| `--color-media-track` | `rgb(white / .45)` | 原版 `#ffffff73`（时间线轨道） | 同上 |
| `--color-action-download` | `blue-600`（暗色 blue-400） | 原版 `.dn-btn-download{background:#2563eb}` | 同上（下载动作色 ≠ 品牌色） |
| `--p-blue-500-ch` | `59 130 246` | 供 `rgb(var(--x-ch) / α)` 用 | L1 通道值，随上面几条一起过 |

另：`--shape-xs` / `--radius-xs`（2px）**已与 `src/styles/tokens.css` 对齐**（src 早有此档，mockup 原先漏了）。

### 原版设计变量（对照用，勿抄进 mockup）

原版 `:root` 是**另一套 token**（自己的命名），mockup 不继承它、只对照数值：

| 原版变量 | 值 | 备注 |
|---|---|---|
| `--primary` | `#5850ec` | 品牌靛蓝；hover `#4a42d8` |
| `--bg` / `--panel` / `--panel-2` / `--panel-3` | `#f4f5f7` / `#fcfcfd` / `#f7f8fa` / `#eff1f5` | 四级底 |
| `--border` / `--border-strong` | `#e8eaef` / `#d4d9e3` | 两级边 |
| `--text` / `--text-soft` / `--text-faint` | `#1a1d24` / `#6b7280` / `#9ca3af` | 三级字 |
| `--radius-xs…xl` | 4 / 6 / 8 / 12 / 16 | 节点用 lg(12)，面板内卡用 md(8) |
| `--shadow-1…4` | 0 1px 2 / 0 2px 8 / 0 8px 24 / 0 16px 48 | 节点用 2，浮层用 3 |
| `--accent-material` / `--accent-text` | `#6366f1` / `#f59e0b` | 节点圆点色 |
| `--success` / `--warn` / `--danger` / `--info` | `#15803d` / `#b45309` / `#dc2626` / `#0369a1` | 语义色 |

原版**只有亮色**（`color-scheme:light`）；mockup 的暗色是本文件的试验田，非原版事实。

### 防撑爆三原则

第③屏之前出过"撑爆 / 错乱 / 换行"，根因是**把原版的条件渲染元素全画了**（如 text 的
`foot-send-status` / `wait-countdown` / `switch-status` 是互斥状态，同时显示必挤）。现在：

1. **只画典型状态** —— 互斥元素同一时刻只显示其一
2. **`node-head` 用 `nowrap`** + 子元素 `min-width:0` + 长文本 `ellipsis`
3. **窄屏横滚不挤压** —— `.screen-body{overflow-x:auto}` + 第②屏演示框 `.app{min-width:1200px}`
   （1200 = 左右栏 256+248 + 画布 696；画布 696 才放得下节点 + 浮动顶栏）

### ★★ 节点骨架：原版只当「按钮位置」参考（2026-10-12 定）

**口径**：原版**只参考它的位置骨架**（哪个按钮在头/身/脚、左/中/右），**不参考它的类名与样式**。
原版 8 类节点本身就是 8 个物种（3 种头类 `.node-head`/`.gv-head`/`.group-node-head`、6 种身类、
圆点 7 个类、状态 4 个类），照抄只会得到"千差万别"。所以改成**一套自有骨架**：

```
.node[data-type="text|material|account|video|download|group|genvideo|imggen"]
├─ .node-head                头（高 32 · 下边框）
│   ├─ .node-dot             类型圆点 —— 颜色由 data-type 一处决定
│   ├─ .node-title           标题
│   ├─ .node-head-mid        中槽（状态 / 倒计时 / 账号 / 时长 / 数量）
│   └─ .node-head-actions    右槽（历史 / 保存预设 / 开关 / 取消组）
├─ .node-body                身（唯一保留类型差异处）
└─ .node-foot                脚（可选：播放条 / 帧按钮行）
```

小件只有两个：`.node-btn`（22px 描边钮，全类型共用）、`.node-chip`（药丸，`is-brand/is-info/is-warn/is-ok/is-count` 修饰）。

**按钮位置对照表**（这是必须对的，改版时按此核验）：

| 类型 | 头·中槽 | 头·右槽 | 身 | 脚 / 浮层 |
|---|---|---|---|---|
| text | 自动匹配 · 拆分 · 发送状态 | 保存预设 | @引用素材(左) + 缩略条(右) + 正文 | 提示条浮在**节点上方** |
| material | — | — | 图片区 | 底部居中：编辑图片 · 分析提示词 |
| account | 倒计时 | 自动发送开关 | 下拉(左) + 发送(右) · 反馈 · 摘要 | — |
| video | 账号 · 时长 · 分辨率 | — | 视频区 + 配方浮层 | 播放条：▶ ‖ 时间线 ‖ 时间 ‖ 📷 |
| download | 数量徽章 | — | 目录行 · 文件列表 | 全部下载(左) + 已下载X(右) |
| group | 数量 | 取消组 | 子节点 | — |
| genvideo | — | 历史 | 舞台（播放/时长/下载/时间线） | 元信息 + 三帧按钮行 |
| imggen | 状态 | 历史 | 舞台（空态） | 元信息 |

### ★ 同级一致性约定（2026-10-12 立）

同级元素必须**结构对称、角色唯一**。已落地的四条：

| 约定 | 内容 | 违反过的实例 |
|---|---|---|
| **一个概念一个类名** | 注释件只有 `.cap` / `.cap-foot` / `.note` 三个角色类；不再有 `.gallery-cap` 与 `.overlay-cell > .cap` 两份同名副本 | `.gallery-cap` 与 `.cap` 声明完全相同 |
| **标注位置按角色定** | `.cap` 标签 → 一律在格子**顶部**（CSS `order:-1` 固定，不靠 DOM 顺序）；`.cap-foot` 指标 → 一律在**底部**；`.note` → 随文 | ③④ 的注释在底、⑤⑥⑦ 在顶，同为 `.overlay-cell` 却两套 |
| **同级元素顺序对称** | 左右栏的 `.side-toggle` 都是栏内**第一个**子元素 | 左栏 toggle 在末尾、右栏在开头 |
| **引用格式统一** | 屏头 `<code>` 一律「`原版 <源文件> · <根类名 / src 归属>`」 | 三种引用体混用（原版 jsx / src 路径 / docs 编号） |

### ★ 演示格约定（浮层怎么放进演示格）

原版浮层是 `fixed` / 全屏遮罩，塞进演示格要"掰回文档流"。**统一由 CSS 负责**，HTML 不再逐个写内联：

- `.overlay-cell > .app-toast / .node-ctx-menu / .gen-panel-layer / .login-backdrop …` → `position:relative; inset:auto; transform:none`
- 全屏遮罩类（`.gen-panel-layer` / `.login-backdrop` / `.modal-overlay` / `.ie-overlay-root` / `.license-screen` / `.style-lib-layer`）→ 额外去暗底与内距
- 面板内次级浮层（`.sel-arrange-menu` / `.gen-panel`）→ 单独一条放回文档流

> 原先这 20+ 处是逐个写在 HTML 的 `style` 属性里的，现已全部收回 CSS（`index.html` 里只剩一处 `.canvas-box` 演示底）。

### ★ 浮层不得重叠（算过的）

第②屏画布 696px 宽：`.canvas-topbar` 居中占 x≈129–567 / y=12–48；
`.canvas-sel-toolbar` 若放 `top:16px` 则占 x=36–333 / y=16–54 → **交集 204×32px，压住项目名与存储**。
现放 `top:56px`（顶栏 36 高 + 8 间距）→ 无交集。
**新增浮层前先算与既有浮层的矩形交集**，别靠肉眼。

---

### ⑤ 后台管理的真实状态

这块 mockup 画的是**原版长什么样**，不是"已实现"。照实标注：

| 部件 | 原版事实（类名 / 尺寸） | 本工程 |
|---|---|---|
| 后台视图 | `.doubao-view`：头部 `.doubao-view-head`（可整条收起，`.dv-head-toggle` 52×24）+ 每账号 webview（`.doubao-view-webviews`，逻辑 1280×800） | **只有 webview 容器**（`BackendView.tsx`，视图半），头部工具栏 / 静默条全缺 |
| 静默遮罩 | `.silent-overlay`：页面快照 + 68×68 恢复钮 | 缺 |
| 出新图 | `.nip-wrap` / `.dv-lovart-strip`：76px 高通栏，64×64 缩略图横滚（NEW / 已发送 / ⚠ 徽章） | 缺（`localizeVideos` 已接线，面板无） |
| Dola 媒体 | `.dola-media-panel`（可 docked） | 缺 |
| 账号分组 | `.account-group` / `.ungrouped-divider` | 缺（`groups` 有数据，无 UI） |
| 指纹关联扫描 | `.linkscan-*`（4 列网格 + 分布单元格） | 缺（分级文案真源已在 `core/rules/fingerprint.ts`，无消费方） |
| 出口代理池 | `.login-backdrop` 家族 | 缺 |
| 账号导入导出 | `TP` / `$P` / `PP` 弹窗 | 缺（文案常量 `ACCOUNT_TRANSFER_TEXT` 已落地，UI 无） |

判据 B4：**不假装有**。mockup 里每个子面板下方都标了 `.gap-flag` 说明当前是否落地。

文案全部取自 `src/constants/text.ts`，选项取自 `src/constants/models.ts`
（`ASPECT_RATIOS` / `IMAGE_RESOLUTIONS` / `VIDEO_MODELS`），不另编。

---

## 四、文件说明

```
docs/mockup/
├── README.md           本文件（宏观结构 + 开关说明 + 旋钮真值表）
├── SKELETON.md         8 类节点 DOM 骨架（机械抽取真源）
├── index.html          七个屏幕 + 切换器
├── tools/
│   └── extract-skeleton.cjs   骨架提取器（@babel/parser）
└── assets/
    ├── tokens.css       ★ 核心资产 —— 未来直接迁到 src/styles/tokens.css
    └── mockup.css       mockup 专用布局 —— 不迁
```

**只迁 `tokens.css` 一个文件。** `mockup.css` 里的布局是给 mockup 用的，跟产品无关。

### 迁移时为什么 `src` 可以零改动

`tokens.css` 底部有一块 **旧名兼容别名**：

```css
--color-bg:      var(--color-surface-base);
--color-surface: var(--color-surface-raised);
--color-text:    var(--color-text-strong);
--color-primary: var(--color-action-primary);
--space-1 … --space-6   /* density=1 时数值与旧值完全一致 */
--radius-sm/md/lg/full
```

现有 18 个 CSS 文件引用的全是这些旧名 ⇒ 替换文件即可，一行不用改。
旧名可等后续切片逐个换成语义名，换完再删别名块。

---

## 五、已知取舍（照实列）

- **暗色配色是我拍的**，没有设计稿（原版只有亮色）。中性色阶用 `--p-ink-*` 一套，品牌色在暗色下自动提亮一档（`--brand-400`）避免压在深底上发闷。你要是有设计稿，改 L2 那一块即可。
- **密度只影响间距与控件高度**，不影响字号（字号跟着变会让小字糊掉，大厂通常也分开控）。要连字号一起变的话，把 `--font-size-*` 也乘上 `--density` 就行。
- **图片一律用 CSS 渐变占位**（`ph-a` ~ `ph-f`），避免往仓库塞二进制。
- 第②/⑤屏画的是**原版结构**（三栏 + 后台视图），`src/ui` 尚未落地之处按 `.gap-flag` 标注，不假装有。
- `docs/mockup/` 不在 eslint / tsconfig 范围内（同 `docs/**`），不会进 `npm run check`。
