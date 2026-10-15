# 豆包画布 · UI 设计稿

> 四个界面，各一页（真机 `main.tsx` 状态机：**授权门 → 启动页 → 画布外壳**，外壳内首页/后台互斥）：
> · **授权激活** `activate.html`（`ActivatePage`，只有 `status === 'ok'` 才放行进画布）
> · **启动页** `start.html`（`StartPage`：历史项目 / 新建 / 导入 .json / 就地重命名 / 删除）
> · **首页**（画布）`index.html`
> · **豆包后台** `backend.html`
> 打开即可（纯静态，`file://` 双击或 `npx serve docs/mockup`）。
> 截图自检：`node docs/mockup/tools/shot.cjs .shots`；类名对账：`node docs/mockup/tools/check-classes.mjs [页面]`。

## 三件套怎么协作

| 文件 | 是什么 | 能不能手改 |
|---|---|---|
| `spec/ui-real.css` | **真机 CSS 全量**（`npm run css -- export` 机械导出自 `src/**/*.css`） | ❌ 脚本产物 |
| `index.html` | 设计稿 DOM —— **类名 = 真机类名**，**文案 = `src/constants/*.ts` 逐字** | ✅ |
| `assets/mockup.css` | **设计层**（叠在 ui-real.css 之上，同特异性靠顺序取胜） | ✅ 这里就是设计 |

配套产物（`spec/`）：`UI-CSS.md`（类坐标索引）· `ui-css.json`（机器可读全量）。

## 两条硬规矩

1. **类名必须带 composes 祖先**：CSS Modules 的 `composes` 在导出时被删，HTML 里只写子类名
   会**静默丢掉真源基础样式**（例：`SendQueuePanel-btn` 必须写成 `btn btnSm SendQueuePanel-btn`）。
   查祖先用 `npm run css -- show <类名>` 或 `spec/UI-CSS.md`。
2. **文案不自造**：按钮 / 提示 / 空态文字一律从 `src/constants/text.ts`、`src/constants/sendPanelText.ts`
   逐字搬 —— 设计稿里的字就是要上真机的字。

## 定稿后怎么套回真机

1. `assets/mockup.css` 顶部「设计层 token」整块 → `src/styles/tokens.css`（新增语义过 CSS 规范 §3.3 登记）；
2. 各段组件规则 → 对应 `src/ui/**` 的 `*.module.css`；
3. 重跑 `npm run css -- export` ⇒ 设计稿与真机回到同一份真源。

## 当前覆盖范围

**授权激活**（`activate.html`）：品牌行 · **四条授权 banner**（ok / expired / invalid / tampered，一次只出一条，
真机 `ActivatePage.tsx:205-261` 的条件渲染）· 重新检测（仅后三态出现）· 机器码区（生成中 / 已生成 /
按钮禁用三态 + 复制 / 导出文件）· 激活码 textarea（`Cmd/Ctrl+Enter` 提交）· 主按钮三态
（激活 / 验证中… / 重新激活，同一颗钮）· 页脚 · **msg 提示消息全量** · 元素一览。

**启动页**（`start.html`）：品牌行 · 历史项目列表（名字 + 相对时间五档，`formatRelativeTime`）·
**就地重命名态**（主区换输入框，删除钮与行不动）· 删除钮（`libIconDel` 悬停转危险色）·
空态（`BRAND.emptyHistory`）· 导入项目文件（.json，ghost）· ＋ 新建项目（primary，本屏唯一主色）·
三种列表状态切换 + 元素一览。

**首页**（`index.html`）：顶栏（项目名 · 保存位置 · 授权 · 豆包后台）· 画布（**8 类节点** + 连线 +
选择工具条 + 组连线锚点 + 批量发送触发条 + Controls + MiniMap）· 发送队列抽屉（两级折叠）· 状态栏 ·
资源库 · 生成面板（按真机算法锚定在节点旁）· 节点右键菜单 / 建节点浮层 / 错误横幅 / Toast ·
浮层一览 13 格。

**豆包后台**（`backend.html`）：账号栏（账号卡 / 检测登录 / 画廊 / 移除 / 网格吸附 / 返回首页 /
清空画布 / ⚡API 服务）· 后台视图头部（刷新 / 浏览器打开 / 无水印资源 / 返回画布 / 折叠）·
模拟 webview · **弹窗一览 13 格**（选择账号类型 / 登录 / 指纹体检 / 导出账号 / 出口代理池 /
分组管理 / API 服务 / 无水印资源 / 账号画廊 / 右键菜单 / 静默遮罩 / 出新图条 / Lovart 会话条）。

## 设计口径（三条，全库统一）

1. **图标一律内联 SVG**（24 格 · 描边 1.7 · `currentColor`）—— 不用 emoji / 字符画按钮；
2. **动作只有一个主色**：主按钮之外全是中性描边，品牌色只出现在"当前要做的那件事"上；
3. **层级只靠三层底**（base → raised → sunken），不靠"描边深浅 + 阴影多少"。

## 已知取舍

- 文生视频节点画的是**有结果**形态（播放钮 / 时长 / 下载 / 时间线）；真机里它与空态文字互斥，二者只画其一。
- 素材 / 文本节点的尺寸是演示值；真机由节点数据（`fitMaterialSize`）决定。
- 资源库由「列表行」改为「卡片网格」，是**设计变更**：定稿后要改 `LibraryPanel.tsx` 的 DOM。
- 顶栏由「浮在画布上的居中胶囊条」改为「全宽应用栏」，是**结构变更**：定稿后 `TopBar` 要从
  `HomePage` 提到 `AppShell` 层（左右栏之上）。
