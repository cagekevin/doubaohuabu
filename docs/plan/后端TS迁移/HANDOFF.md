# HANDOFF · 后端 TS 迁移 · 复核期（2026-10-15 收工）

> 单文件交接。**接手只看这一份就够**：状态 / 现场 / 下一件事（精确到命令）/ 5 个已踩过的坑 / 挂账。
> 其他权威文本：`README.md`（计划·判据）· `日志.md`（逐批留痕）· `弯路.md`（教训）· `人工检查清单.md`（复核怎么做）。

---

## 0. 一分钟版

- **迁移本体已完成**：B0–B4 全部提交；`electron/**` 只剩 `dola-duration-main.js`（guest 注入脚本，永不编译）。前端/后端 `tsc` 0 红、`eslint` 0 问题、`npm run check` 7 道全绿、冒烟通过。
- **现在在做的是"复核"**：因为代码是**人工重写**（不是机械转码）⇒ 要用"机器给证据 + 人判"一起把等价性钉住。
  复核清单分五层（`人工检查清单.md` §0）：**A 契约面 · B 数据流步骤面 · C 红区逐字 · D 数据兼容 · E 输入/输出对照**。
- **已完成的层**：
  - **C 层（红区逐字）= 全绿** ✅ 三段注入脚本逐字（`DETECT_JS` 6376 / `ERROR_JS` 1372 / `dolaDurationDump` 1938 字符）· 频道注册点 **119 处**（9 文件）· `appendSwitch` 9 · 协议 privileges 630 字。
  - **E1 层（纯 Node 双侧对照）= 186 例 · 同 186 / 异 0** ✅（覆盖域名判定、脱敏、配额、错误分类、5 个 provider 的构建/解析、注册表、轮换器…）
- **正在做的 = E2 层（要真 Electron 的那些）**：工具已能跑通前 2 例（生产路径 `net.fetch`），**卡在"后几例的结果行凭空消失"**；
  我最后一步把探针的 stdout 改成**同步写**（`fs.writeSync(1,…)`）—— ⚠️ **这一改动没有验证**（刚要跑就被叫停）⇒ **下一件事就是跑它**（§3）。
- ⚠️ **现场有未提交改动**（4 个文件，见 §2）—— **别 `git checkout` 掉**。

---

## 1. 交接时的仓库状态

```
HEAD = d383696
d383696  T-1b: provider 请求构建/解析样本 ＋ 冻结时钟（E1 累计 171 例 · 同 171 / 异 0）
3512849  T-1 : E 层双侧对照工具 compare-inout.mjs ＋ 清单加三条读法纪律
8879e01  R-1 : dolaDurationDump 移出编译面（注入文本改由文件字节决定，逐字一致可证）
19b2c42  B4-c-2 (=B1-b): 渲染面替换 —— 手写面改成由契约表派生的面（含参数面 55 条）
3327e36  B4-c-2（上半）: WindowApi 派生接上 ret + preload 的 sendSync 收窄口改为查契约表
66e3913  B4-c-1: 频道表 ret 回填（80 条 TODO 全清）＋ 补上 draft-handler-returns.mjs
```

---

## 2. 未提交的现场（必须知道，别丢）

| 文件 | 状态 | 是什么 |
|---|---|---|
| `docs/plan/后端TS迁移/scripts/compare-inout.mjs` | 已改（+203 行） | **E2 支持**：`--engine electron` · `--e2-only` 过滤 · 本地 HTTP 服务（4 端点）· 一进程一侧 · 两侧独立 userData · 比对去掉 `id` · 部分失败也打 stderr |
| `docs/plan/后端TS迁移/scripts/compare-inout-probe.cjs` | **新增（未跟踪）** | **E2 探针**（Electron 主进程）：安全改 userData → `whenReady` → 逐 job 调用 → **同步写** `__E2__ {json}` 一行 |
| `docs/plan/后端TS迁移/人工检查清单.md` | 已改（+4 行） | §7.1b 第 4 条读法纪律：**加载期副作用的模块必须隔离/排末位** |
| `docs/plan/后端TS迁移/日志.md` | 已改（+6 行） | **T-1c** 留痕：样本扩到 186 例 ＋ 修掉"加载期副作用造成的假差异" |

> 这四份是一整块（**E2 工具化 + 两条纪律**）。按用户口径：**做完一整块再一起提交**，所以还挂在树里。

---

## 3. 下一件事（精确到命令）

### ① 先验证"同步写 stdout"是否治好了 E2（最优先）
```bash
node docs/plan/后端TS迁移/scripts/compare-inout.mjs --engine electron
```
**期望**：8 例全部有结果（`✅/❌` 各一行），耗时 **不应超过 ~20 秒**。
- 若仍是"探针没回" ⇒ 读 §4 的坑清单（尤其 (d)(f)(g)），并用 `--e2-only '/500'` 这种**子集**定位：
  ```bash
  node docs/plan/后端TS迁移/scripts/compare-inout.mjs --engine electron --e2-only '/500'
  ```
  （`--e2-only` 接受"用例 JSON 的子串"或"用例序号"）
- 若出现 `❌` ⇒ **那是候选真差异**：两侧值会并排打印，去对应源码判它是"真差异"还是"我的样本/口径不对"。

### ② E2 样本继续扩（当前 8 例，能扩的都在这里）
- `api/http`：已覆盖 `/json` `/404` `/500` `/text` ＋ 换栈分支（`__throwingFetch` → `net.fetch`）。
  可加：`opts.timeoutMs` 极小值 ⇒ 触发 abort（两侧应同样 `{ok:false,status:0}`）。
- `api/config-store`：`createConfigStore('probe', {})` 只比了**返回对象的形状**（`file` + 一组 getter/setter 函数）。
  可加：`getProviderConfig` / `setApiKey` 的**往返**（两侧各自的 userData 目录里比落盘文件字节 ⇒ 这就是 D 层"数据兼容"）。
- `license`：导出面只有 `initLicense` / `__setTrustedTimeOverride` ⇒ 机器码/验签**不可注入**（`license` 的 `checkLicenseStatus` 没导出）
  ⇒ 要么**只能记"未验"**，要么按 §10.2 ④ 的思路单开一个"探针专用导出"（那要改源，属大改动 ⇒ 需用户点头）。
- **还想要更多覆盖 ⇒ 进 E3**：`main` 的 39 个 handler 与三个协议处理器（构造假 `Request` 调 `protocol.handle` 注册的处理器 / 走真窗口 `executeJavaScript` 调 `window.api.*`）。
  这两个都是"要真 app 起起来"的活，比 E2 重，别在没验证 E2 之前开工。

### ③ 复核收尾（清单层面还没铺的）
- **A 层（契约三方对齐）**：以 `src/stable/ipc-channels.ts` 为索引，核"表 `arg`/`ret` ↔ 旧 handler ↔ 新 handler"逐字段一致 ⇒ 清单 §3 已列好频道分组。
- **B 层（数据流步骤表）**：按 `docs/DATAFLOW.md` 的节把步骤铺开（清单 §4.1 已列要核的位置）。
- **D 层（数据兼容）**：`replay-samples.mjs --verify` 现状：`config-store` 无漂移；`settings.json` 本机不存在；`main.detectStorageLayout`/`migrateEngineeringToFile` 未验。
- **B5 收尾**（原计划的收尾包，一件没做）：`pack:dir` 至少跑一次 · `TD-13-26` 销账（写清销了什么/没销什么）· 三个**零类型覆盖**项另立债 · `check-passthrough` 处置 · 长期工具升进根 `scripts/` · `弯路.md` 逐条判去留 · `census` 终态 ＋ `判据登记表.md` 回写。

---

## 4. E2 的现状与**五个已踩过的坑**（照抄，别重踩）

现状（最新一次全跑，**改动前**）：`同 2 · 异 0`，其余 6 例"探针没回"，耗时 185 秒 ⇒ 已按 (d) 修，未验证。

| # | 坑 | 现象 | 处置 |
|---|---|---|---|
| **(a)** | **两侧不能同进程** | `license.initLicense()` 第二侧抛 `Attempted to register a second handler for 'get-machine-code'`（Electron 禁止重复注册同一 IPC handler）⇒ 假差异 | **一进程一侧**（真实运行本来也是一次只跑一个版本） |
| **(b)** | **两侧 userData 必须分开** | `config-store` 会落盘 ⇒ 共用目录时第二侧读到第一侧的文件 | 每侧一个 `userdata-old` / `userdata-new` |
| **(c)** | **别把 `id` 算进比较** | 我第一版 `JSON.stringify(a) === JSON.stringify(b)` 而 a/b 带 `id`（含 side）⇒ **恒 ❌** | 只比 `{ ok, value }` |
| **(d)** | **探针 stdout 要同步写** | `app.exit(0)` 掐掉未 flush 的管道缓冲 ⇒ **后几条用例的结果行凭空消失**，极易误读成"探针死了/那一例卡住" | 用 `fs.writeSync(1, …)`（当前树里已改，**待验证**） |
| **(e)** | **样本签名必须照源码** | 我把 `requestJson(url, {})` 当签名 ⇒ 全 4 例 `error:'network'`（真签名是 **`requestJson(fetchImpl, url, opts)`**） | 先读源码签名再写样本；`--list` 只给形参数，**不给参数序** |

另外两条实现约定：
- **(f) 形参里的函数用标记传**：`{$fn:'net.fetch'}`（生产路径）· `{$fn:'__throwingFetch'}`（模拟网络层失败，测换栈）—— JSON 传不了函数。
- **(g) 整轮变慢先怀疑超时**：`requestJson` 默认 `timeoutMs=30000` ⇒ 一例卡住就是 30 秒；探针 `spawnSync` 超时 90 秒 ⇒ 看到 65s/185s 这种数字先查这个。

---

## 5. 复核已有的凭证（可复现）

```bash
# C 层：红区逐字 ＋ 分母（频道数/函数数/分支数）
node docs/plan/后端TS迁移/scripts/audit-redzone.mjs                # 全仓
node docs/plan/后端TS迁移/scripts/audit-redzone.mjs --only electron/main

# E1 层：纯 Node 双侧对照（导出面 + 常量 + 有样本的函数逐例比）
node docs/plan/后端TS迁移/scripts/compare-inout.mjs               # 186 例 · 同 186 / 异 0
node docs/plan/后端TS迁移/scripts/compare-inout.mjs --list --only site-hosts
```
**C 层结论**：`main.ts` 红区全绿；`fingerprint-preload` 函数体 AST 结构一致。
**E1 结论**：模块 26 · 逐例 **186 例全"同"·0 例"异"** · ⚠️ **无样本的函数 19 个**（工具显式列出）· 需人读 2 项（见 §6）。

**基线纪律（工具已内置，人也要守）**
- 旧侧基线 = **该文件"改名提交的父提交"**那版（改名未提交时回落 `HEAD:<path>.js`）。
- ⛔ 三条禁用基线：`docs/豆包画布原版参考/inputs/electron/**`（**旧一代**）·「迁移前」那版（被 B0-b 改过）· 凭记忆。
- 工具里一律用 **`~1`** 不用 `^`（Windows `cmd.exe` 把 `^` 当转义符 ⇒ `sha^:p` 被吃成 `sha:p` ⇒ 基线静默取错）。

---

## 6. 挂账（**不假装**；这些都是"已知未完成"）

| 项 | 状态 / 待决 |
|---|---|
| **`PickedFile.path` 契约不一致** | 端口要 `{name,path,…}`，后端 `import-files` **从来不传 `path`** ⇒ 运行期恒 `undefined`（此前靠 `as PickedFile[]` 谎报）。现按"不就地改业务"只把 `path` 标可选 ＋ 去掉谎报断言 ⇒ **待裁：前端改，还是后端补字段？** |
| **频道字符串两侧各写一次** | 表里一次、`electron/**` 的 `handle/on` 一次（§5 已登记）⇒ 未消除 |
| **零类型覆盖三项** | `dola-duration-main.js` · `dola-duration-dump.js`（R-1 新增）· 账号 preload 生成物（字符串模板）⇒ **B5 立债**（与已销的 TD-13-26 分开记） |
| **手测项** | ⚠️ **后端没有 UI**：清单里原来的"点界面"项已删除；后端只能验 in/out（E 层）。"加载工程/打开设置/切换保存路径"属于**渲染层**的事，别混进后端复核 |
| **基线含中途改动 ⇒ 只能人读** | `api/bridge.js`（旧侧一加载就抛 `registerProvider: 缺少 id` —— 那份中途快照里 bridge 已按 `.adapter` 取，而同期 providers 还是 `module.exports = adapter`）· `firefox.js` · `main.js` |
| **19 个"无样本"函数** | 主要是需真网络/真 Electron/真会话的：`chrome-cdp` · `dola-media` · `lovart-*` · `license` 的机器码/验签 · `main` 的内部函数（`detectStorageLayout`/`migrateEngineeringToFile`/`makeProjectStorage`，都在 main 内部未导出）· 协议处理器 |
| **B5 收尾整包** | 见 §3 ③（`pack:dir` / TD-13-26 销账 / 债 / 工具升 `scripts/` / 弯路升华 / census 终态） |

---

## 7. 工具清单（一行用法）

| 脚本（都在 `docs/plan/后端TS迁移/scripts/`） | 用途 |
|---|---|
| `audit-redzone.mjs` | **C 层红区逐字比**（注入脚本/频道名/开关/privileges）＋ **分母**（频道/函数/分支/行数） |
| `compare-inout.mjs` | **E 层双侧对照**（E1 纯 Node / E2 `--engine electron`）；只报"同/异"，⛔ 不判等价 |
| `compare-inout-probe.cjs` | E2 探针（Electron 主进程；**由上面那个 spawn，别手跑**） |
| `draft-handler-returns.mjs` | 抽每个 `handle/on` 的 return 形状（含展开一层委托）⇒ 填频道表 `ret` 用 |
| `audit-conversion.mjs` | 转换对账（事实面集合差：字符串/数字/调用/属性/运算符/导入/导出/定义） |
| `verify-identical.mjs` | 诊断：编译产物 vs 原 `.js` **逐语句有序**比（⚠️ 信号会被编译产物噪声淹没，别当闸） |
| `smoke-electron.mjs` | 冒烟（起产物·判存活·判 stderr·判 READY）—— `npm run smoke:electron` |
| `census-electron.mjs` | 类型覆盖计数（执法档/测量档）；`--update-baseline` 更新基线 |
| `build-electron.mjs` | 构建（tsc → `electron/dist/` ＋ 同目录资源清单自检） |
| `replay-samples.mjs` | D 层样本回放（`--verify` 比落盘漂移） |

---

## 8. 纪律（别忘；都是这轮踩出来的）

1. **判据锚 `README.md`**：不新增更松的判据（禁"抽样通过即算过"／"脚本 0 差异 ⇒ 等价"），也不自立更严的判据去否定已提交批次（要改判据 ⇒ 先改 README 并留痕）。
2. **语义面映射必须引用"已登记的约定"**（例：provider 的 `module.exports = adapter` → `export { adapter }`，是 B2-b 日志登记的），⛔ 不许临时编口径。
3. **基线含中途改动 ⇒ 该行只能人读**（工具会点名）。
4. **加载期有副作用的模块必须隔离/排末位**（实测 `api/bridge.js` 加载即注册 5 家 provider，污染 later 的 `api/registry`）。
5. **"无样本"≠"验过"**：没进样本表的函数一律写"未验"。
6. **机械活自己写脚本**（不必先问）；脚本默认 **dry**、优先**只读**、给 `--help`、筛选/跳过都**不静默**。
7. **做完一整块再提交**（用户口径）。
8. **别开倒车**：已提交的东西不因"复核发现差异"就整片回退；真差异走单点处置（照抄源 / 留 `unknown`＋注理由 / 单开一个 commit / 记债）。
