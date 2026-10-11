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

## 三、屏幕 ↔ 源码映射

| 屏幕 | 源码位置 |
|---|---|
| ① 启动页 | `src/ui/pages/StartPage.tsx` |
| ② 工作台（三栏） | `src/ui/shell/AppShell.tsx` · `TopBar.tsx` |
| ├ 左栏 · 账号 | `src/ui/panels/AccountPanel.tsx` · `BackendView.tsx` |
| ├ 中 · 画布 | `src/ui/canvas/CanvasHost.tsx` |
| ├ 中 · 生成面板 | `src/ui/panels/GenPanel.tsx` |
| └ 右栏 · 资源库 | `src/ui/panels/LibraryPanel.tsx` |
| ③ 8 类节点 | `src/ui/nodes/*.tsx`（**DOM 逐字对照原版 jsx**，见下节） |
| ④ 浮层与反馈 | `src/ui/canvas/CreatePanel.tsx` · `SelectionToolbar.tsx` · `src/ui/common/*` |
| ⑤ 后台管理 | `_Component43.jsx` → `src/ui/panels/BackendView.tsx` · `RP/DP/SD/OP.jsx`（均缺口） |
| ⑥ 缺失面板 | `docs/13` §2.1「完全没有」10 个 + 生成面板完整版（`Z3_1` 16 按钮 / `_Component45` 18 按钮） |
| ⑦ 补登组件 | `docs/13` §2.3 补登的 17 个带 UI 组件（画廊 / 风格库 / 登录弹窗 / 小提示…） |

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
| genvideo | `YL.jsx:474-585` | 历史按钮在 head **最右**；播放浮层在 stage **正中**、时长右上、下载右下；**三帧按钮在 `gv-meta` 之后**（卡片最下方） |
| imggen | `ZL.jsx:213-320` | head 内 grow 之后是 `ig-chip-status` 再是历史按钮；**无结果时是 `gv-preview-empty`** |

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

### ★ 布局旋钮（留余地：拿到原版只改一处）

`mockup.css` 顶部有一块**布局旋钮**，所有位置/尺寸集中在此。分两类：

**① 引用 token 的（守 SSOT，不用管）**

```css
--mk-head-gap:    var(--space-1);
--mk-head-pad-x:  var(--space-2);
--mk-head-h:      var(--node-head-height);   /* L3 */
--mk-node-fs:     var(--font-size-sm);
--mk-micro-fs:    var(--font-size-xs);
--mk-float-inset: var(--space-1);
```

**② ★例外：mockup 专有尺寸（**不是**待并入 L3）**

| 旋钮 | 值 | 为什么它只在 mockup |
|---|---|---|
| `--mk-cell-min-w` | 340px | 图鉴栅格最小宽 —— **src 里还没有这个界面**（图鉴未落地）|
| `--mk-btn-h` | 18px | 节点内微型按钮 —— src 的 `.btn` 最小档是 `--btn-height`(32px)，**没有 micro 档**；src 里也不存在 18px 的按钮 |
| `--mk-thumb` | 22px | 素材缩略条 —— src 的列表缩略图（`.thumb`）是 **20px**，形态不同 |
| `--mk-stage-ratio` | 16/9 | 预览区比例 —— src 里只有 `GalleryPanel` 的 `aspect-ratio: 1`（网格卡片，不是舞台）|

> ⚠️ **2026-10-11 更正**：本表原先写「token 未覆盖，**将来并入 L3**」——**逐条核对 `src/ui` 后不成立**：
> 这 4 项在 src 里**没有对应概念**（图鉴 / 微型按钮 / 缩略条 / 舞台都还没落地），
> 给不存在的东西造 token 只会污染 L3。**它们是 mockup 专有值**，等对应界面在 src 落地时再谈。
>
> ✅ `--mk-micro-9`（9px 极小字）**已并入** —— 改用 `var(--font-size-2xs)`（`tokens.css` 里有这一档）。

**拿到原版 CSS 后**：改这块旋钮即可，不需要逐条翻规则。若某个位置值原版与推断不同，改对应一行，全局生效。

### 防撑爆三原则

第③屏之前出过"撑爆 / 错乱 / 换行"，根因是**把原版的条件渲染元素全画了**（如 text 的
`foot-send-status` / `wait-countdown` / `switch-status` 是互斥状态，同时显示必挤）。现在：

1. **只画典型状态** —— 互斥元素同一时刻只显示其一
2. **`node-head` 用 `nowrap`** + 子元素 `min-width:0` + 长文本 `ellipsis`
3. **窄屏横滚不挤压** —— `.screen-body{overflow-x:auto}` + `.shell{min-width:1200px}`
   （1200 = 左右栏 480 + 画布 720；画布 720 才放得下节点 ≤440 + 生成面板浮层 260）

---

### ⑤ 后台管理的真实状态

这块 mockup 画的是**原版长什么样**，不是"已实现"。照实标注：

| 面板 | 原版 | 本工程 |
|---|---|---|
| 后台视图 | `_Component43.jsx` 3304 行 / 5 按钮 / 78 文案 | **只有 webview 容器**（`BackendView.tsx`，视图半），头部工具栏 / 账号 tab / 静默条全缺 |
| 账号分组管理 | `RP.jsx` 7,951 B | 缺（`groups` 有数据，无 UI） |
| 指纹诊断 | `DP.jsx` 4,971 B | 缺（分级文案真源已在 `core/rules/fingerprint.ts`，无消费方） |
| 无水印资源 | `SD.jsx` 5,335 B | 缺 |
| 账号导入导出 | `OP.jsx` 内 | 缺（文案常量 `ACCOUNT_TRANSFER_TEXT` 已落地，UI 无） |
| 账号运维 | `OP.jsx` 17 按钮 | 只落地最小子集（添加 / 检测登录 / 移除） |

判据 B4：**不假装有**。mockup 里每个子面板下方都标了 `.gap-flag` 说明当前是否落地。

文案全部取自 `src/constants/text.ts`，选项取自 `src/constants/models.ts`
（`ASPECT_RATIOS` / `IMAGE_RESOLUTIONS` / `VIDEO_MODELS`），不另编。

---

## 四、文件说明

```
docs/mockup/
├── README.md
├── index.html           四个屏幕 + 切换器
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

- **暗色配色是我拍的**，没有设计稿。中性色阶用 `--p-ink-*` 一套，品牌色在暗色下自动提亮一档（`--brand-400`）避免压在深底上发闷。你要是有设计稿，改 L2 那一块即可。
- **密度只影响间距与控件高度**，不影响字号（字号跟着变会让小字糊掉，大厂通常也分开控）。要连字号一起变的话，把 `--font-size-*` 也乘上 `--density` 就行。
- **图片一律用 CSS 渐变占位**（`ph-a` ~ `ph-f`），避免往仓库塞二进制。
- `docs/mockup/` 不在 eslint / tsconfig 范围内（同 `docs/**`），不会进 `npm run check`。
