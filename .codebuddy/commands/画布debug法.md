# 画布 debug 法（渲染层调试地图）

> **适用场景**：`npm run check` 已绿（类型 / lint / 边界 / 不变量 / 单测全过），但**跑起来有 bug** —— 问题出在"接线与运行时"：启动水合、持久化落盘、状态写入、依赖方向、渲染外壳。
> **核心思路**：debug 的本质是**先画出链路全景，再标清每一跳的契约（数据结构）与边界**；链路清楚了，断点自然一眼可定位。本文件的"地图 + 契约 + 断点"均来自**真实代码取证**（标注 `文件:行`）。
> **通用思考底座**：步进式、防绕圈、无日志不推演见 `排查5步法.md`（管"怎么想"）；本文件管"这个项目**链路长什么样、契约是什么**"。
> **不在本文件范围**：`electron/**`（宿主壳）与站点侧（doubao/dola/lovart）的 bug —— 那些是后端/站点问题，走各自日志，别用本文件的地图硬套。
> **最高优先铁律**：改 bug **第一步先拿证据**（控制台 / 运行时验证脚本 / 真实样本），禁止没证据就翻代码猜根因改逻辑。

---

## 〇、第一步：拿证据（所有 bug 都先这步）

本项目的取证手段（按代价从低到高）：

| 手段 | 命令 / 位置 | 拿到什么 |
| --- | --- | --- |
| **迁移日志** | 启动即打印：`bootstrap/main.tsx:40` → `console.info('[hydrate]', …)` | 5 条迁移跑没跑、有没有写回失败（`hydrate.ts:87` 的 `[hydrate] 写回失败 → …`） |
| **应用级错误** | 全局错误边界 `ui/shell/ErrorBoundary.tsx`（`area="应用"`，`main.tsx:48`）；画布级边界见 `docs/11` §9.9 | 渲染是否被边界捕获（**没白屏** = 边界在起作用，不是没 bug） |
| **运行时验证（真实渲染）** | `node scripts/verify-run.cjs`（M0：能否渲染 + 应用级错误数） | 构建产物在无头 Chromium 里的真实表现 |
| **老数据兼容** | `node scripts/verify-w2.cjs`（W2，P0） | 真实样本注入 → 启动 → 6 项断言 |
| **画布完整性** | `node scripts/verify-canvas.cjs`（W13） | 8 类节点 / 边 / 撤销 |
| **不变量（AST）** | `npm run lint`（eslint） | 空 catch（`no-empty`）/ 裸契约串（原则5）/ core 越界接触宿主（原则4）/ 测试边界（原则7）/ 直调 `window.api`（TD-05-1）。⚠️ 裸色值 / 端口纯净 / `.catch` 形态**已无机器守卫**（文本不变量闸 2026-10-11 退役，见 `docs/17` §7） |
| **引用面** | `node scripts/mv-sync-refs.mjs refs <file>` | 谁 import 它 + 字符串残留引用（改名/搬运后必跑） |
| **真实数据真身** | `%APPDATA%\doubao-canvas\`（`projects-autobackup.json` + `Local Storage\leveldb`），用 `node scripts/extract-real-sample.cjs` 提取 | 老数据的**真实形状**（别拿推理当事实，`docs/11` §十二） |

> ⚠️ **本项目尚无集中的 debug 开关**（M0 未建）—— 所以**临时 `console.log` 一律不留**（`系统治理5步法` Step 7 会扫）。
> 要留可观测，就先按 `docs/11` §八 落一个**统一入口**，别散写。

---

## 一、链路地图 ①：启动 / 水合链（M0 · M1 已落地）

```
[1] 入口
    bootstrap/main.tsx:36   const container = createContainer()
    【断】模块级单例：StrictMode 下**不要**在渲染里再 createContainer（会建第二份 store）
        ↓
[2] 装配（唯一知道"用哪个 adapter"的地方）
    bootstrap/container.ts:43
      createPorts()（:24）→ host=mock / sites={} / storage=local / clock=system
      createAppStore(ports)
      createPersistController({ clock, persist:{storage, migrationCtx, saveBackup, saveSnapshot, logOperation}, readState, onError, onOk })
    【断】🔴 `ui/**` 直接 import `adapters/**` ⇒ `npm run lint:boundaries` 红（规则 2）；
        `sites={}` 为空注册表 ⇒ 任何站点调用**必须处理「无适配器」**，别假设它存在（M6 才接）
        ↓
[3] 启动加载 + 迁移
    main.tsx:39 → bootstrap/hydrate.ts:36
      [3.1] storage.read(LS_PROJECTS / LS_ACCOUNTS / LS_PRESETS / LS_LEGACY_CANVAS)   :41-44
      [3.2] runMigrations({projects, accounts, globalPresets, legacyCanvas},
                          {saveImage: host.media.saveImageSync, now: clock.now})     :47-53
      [3.3] **只写 changed 的键**（tryWrite 包住 → 失败进 writeErrors，不吞）            :56-70
      [3.4] set({projects, accounts, activeId})；若首个工程存在再 set({nodes, edges, library, snap})  :73-84
    【断】🔴 迁移的副作用（图片外置 `saveImage`）**没注入** ⇒ 迁移静默不生效；
        写回失败只进 `writeErrors`（会打印），若被上层丢掉 ⇒ 用户看不到"迁移没落盘"；
        `activeId = projects[0]?.id` ⇒ **多工程时"该打开哪个"尚无契约**（M2 待定，别当已定）
        ↓
[4] 渲染
    StrictMode → ErrorBoundary(area="应用") → StoreProvider(store) → Root
      started ? <AppShell canvas={<CanvasHost/>}/> : <StartPage/>
    【断】🔴 StrictMode **双调用渲染与 Effect** ⇒ 持久化 / 订阅 / 定时器类副作用**必须幂等且可 dispose**
        （`state/persist.ts:83` 的 dispose 就是为它准备的）
```

**真相源契约（红线，整条链路守此）**：**`state/**` 是唯一写 store 的地方**；`bootstrap/hydrate` 是**启动装载的唯一例外**（它写的是"装载"而非"业务动作"，见 `docs/DATAFLOW.md` §一）；`core/usecases` 只返回 `Result`，**永不写 store**。

---

## 二、链路地图 ②：持久化链（M1 已落地 · 最高频）

```
[1] 触发（任意 state action / 切项目）
    state/persist.ts:57   schedule(reason)
      若已有 timer → 先 timer() 取消（**重置防抖窗口**）
      timer = clock.setTimeout(doWrite, PERSIST_DEBOUNCE_MS /* constants，600ms */)
    【断】🔴 改了状态却忘了 `schedule()` ⇒ 改了不落盘（刷新即丢）；
        `if (timer) timer()` 被删 ⇒ 防抖退化成"每次变更都写"（写盘风暴）
        ↓
[2] 窗口结束
    doWrite  :45-55
      readState() → {projects, activeId}（**读取由 state 提供，本模块不 import store**）
      persistProject({projects, activeId, reason}, deps.persist)
      ok → onOk()（清 saveError）；err → onError(res.message)（**原样**）
        ↓
[3] 落盘（怎么存）
    core/usecases/persistProject.ts:58
      [3.1] externalizeProjectImages(projects, migrationCtx)   :62   （base64 → img://，**幂等**）
      [3.2] JSON.stringify 失败 ⇒ err('unknown', 原文)  :66-70      （**放弃保存，不写半截数据**）
      [3.3] storage.writeRaw(LS_PROJECTS, json) 失败 ⇒ err(原文)  :76-80
      [3.4] saveBackup / saveSnapshot（fire-and-forget）+ logOperation  :82-98
    【断】🔴 用了 `storage.write` 而不是 `writeRaw` ⇒ **双序列化**（多包一层 JSON 字符串）⇒ 老数据读不回；
        把 `message` 改写成"保存失败，请重试" ⇒ 违原则 6（原文被掩盖，根因找不到）
        ↓
[4] 结果回写
    container.ts:65-66
      onError: setState({ saveError: { message, at: clock.now() } })
      onOk:    setState({ saveError: null })
    【断】🔴 onError 只 `console.error` 不写 store ⇒ **用户看不到失败**（静默兜底 = 债，登记时算一笔）
        ↓
[5] 退出
    persist.ts:71-77   window 'beforeunload' → 有待写则 flush('beforeunload')
    【断】`dispose()`（:83）没移除监听 ⇒ 多实例重复落盘
```

**debug 落点口诀**：**刷新丢数据** → 查 [1] 有没有 `schedule` / [3.1] 外置是否幂等 / [3.3] 写没写 `writeRaw`；**保存失败无提示** → 查 [4] `onError` 是否写了 store；**老数据读不回** → 查 [3] 序列化层级 + `stable/migrations` 的 5 条迁移是否按序跑。

---

## 三、链路地图 ③：错误 / 失败链（横切）

```
生产者：adapters/** · core/rules/**   → 产生 {ok:false, reason, message}（message = 原始原文）
   ↓
消费者：core/usecases → state → ui      → 只能转发（不得改写 / 吞掉 / 编造）
   ↓
展示：constants/text.ts                 → reason → 文案映射（唯一真源）
   ↓
渲染：ui/common/ErrorBanner · ToastHost
```

**断点（全部机器可判）**：

- `catch {}` / `catch (e) {}` 空体 ⇒ eslint 的 `no-empty`（`allowEmptyCatch:false`，**必须 0 命中**）。
- `core/usecases/**` 里出现 `message:` 字面量 ⇒ `原则6/no-fake-message`（只能来自 `e.message` / 上游 `Result`）。
- 文案映射写进 `state/slices/ui` 而不是 `constants/text.ts` ⇒ 违原则 5（SSOT）。

---

## 四、链路地图 ④：状态写入与依赖方向（越权断点）

| 层 | 唯一职责 | 严禁 | 机器守卫 |
| --- | --- | --- | --- |
| `ui/**` | 视图；只依赖 `state` + `core/model` 类型 | import `adapters/**`；`useStore.setState()` 直改 | 规则 2 + 原则 1 |
| `state/**` | **唯一**写 store；只做编排 | 放业务规则（算哈希 / 比较 / 组装提示词）；单 slice > 300 行 / > 25 字段 | 原则 1 + `max-lines` |
| `core/usecases/**` | 编排，返回 `UsecaseResult<T>` | 写 store；碰 React / `window` | 原则 1 |
| `core/rules/**` | 纯函数 | `window` / `document` / `Date.now()` / `Math.random()` / `localStorage` / `setTimeout` | `原则4/core-purity` |
| `core/ports/**` | **只有类型** | 任何运行时实现 | `原则3/ports-type-only` |
| `adapters/**` | **唯一**接触外部世界 | 解释 / 存储事件（只 `subscribeXxx(cb)` 转发） | 原则 2 |
| `stable/**` | 冻结契约 | import 任何上层 | 规则 3 |
| `bootstrap/**` | 唯一接线处 | —（唯一可 import 全部的地方） | `.dependency-cruiser.cjs` |

**断点**：把"能算出来的值"塞进 store（原实现 `_persisting` 就是这毛病，`docs/11` §五.1）；`ui` 用 `useState` 存"跨子树共享"的状态（该进 slice）；`adapters` 里 `subscribe` 回调直接写 store（应在 `state` 订阅）。

---

## 五、对账武器（确认断在链路哪一跳）

| 武器 | 命令 | 断在哪 |
| --- | --- | --- |
| 能渲染 / 应用级错误 | `node scripts/verify-run.cjs` | 启动链 [1]~[4] |
| 老数据兼容（P0） | `node scripts/verify-w2.cjs` | 水合链 [3] + 迁移 |
| 画布完整性（W13） | `node scripts/verify-canvas.cjs` | 渲染 + 节点/边/撤销 |
| 真实样本提取 | `node scripts/extract-real-sample.cjs` | 拿"老数据真身"（`%APPDATA%\doubao-canvas\`） |
| 不变量（AST） | `npm run lint`（eslint） | 原则 4/5/6/7 + TD-05-1（⚠️ 文本不变量闸已退役 ⇒ 裸色值 / 端口纯净 / `.catch` 形态**现无机器守卫**） |
| 层间方向 | `npm run lint:boundaries` | 规则 1~5（含"故意深导入必须失败"的探针） |
| 引用面 | `node scripts/mv-sync-refs.mjs refs <file>` | 改名 / 搬运后的引用漏改 |

> **三方对账**：画布快照（`doubao-projects` 键）↔ 磁盘快照（`storagePath` 目录）↔ `%APPDATA%` 真实数据。三者对不上 ⇒ 先定位是"没写"还是"写了但读错字段"。

---

## 六、与通用排查5步法的衔接

- **State 1（现象对齐）**：走通用引擎，复述痛点（"刷新丢图"≠"保存失败"，先分清）。
- **State 2（提取证据）**：先看迁移日志（〇）+ 跑对应 `verify-*.cjs`；疑老数据用 `extract-real-sample.cjs` 对账。
- **State 3（物理断点）**：**对照第一~四节链路地图，指"第几跳、哪个契约没守"**（均带 `文件:行`）。
- **State 4（靶向修复）**：守红线（`state` 唯一写 store / `writeRaw` 不双序列化 / 错误原样透传 / `core` 不碰宿主），最小改动。
- **State 5（闭环验证）**：呼应 State 1 —— 跑 `npm run check`（全量门禁）＋ 对应 `verify-*.cjs`（运行时）双绿才算闭环。
