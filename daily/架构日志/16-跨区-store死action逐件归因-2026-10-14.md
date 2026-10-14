# 16 跨区 · store 死 action 逐件归因（2026-10-14）

## 起因

复盘上一轮「控制器死面」时发现：`TD-16-139` 点名**两个**死方法，只拆了一个（`accountOps.addAccount`），
漏了 `localizeOps.localizeNode` —— **同债点名的兄弟项没同批清**。顺链把同类的 `TD-16-141`（store action 死面）也逐件追。

## 本批落点

| 债 | 处置 |
|---|---|
| `TD-16-139` 后半 | 删 `localizeOps.localizeNode`（真入口 = 导出的 `localizeNodeInto`） |
| `TD-07-17` | `apiOps.refreshConfig` 从接口/返回对象**收窄**（内部保留） |
| `TD-16-140` | 删 `hostOps.saveTextFile` → `FilePort.saveFile` → electron/mock 实现**整条链** |
| `TD-16-137` / `TD-16-138` | **重复记账**（= 已结的 `TD-16-143`/`TD-02-22` 与 `TD-07-18`）⇒ 核对归档 |
| `TD-16-141`（7/9） | 删 `setGraph`（canvas）· `setStyles`（styles）· `clearImageGenFeed`（apiLanding）＋ 4 处会漂移的注释 |

## ★ 关键：**症状相同，病因不同**（`TD-16-141` 的 9 个没一刀切）

同一笔债列的 9 个「定义即死」action，追因后**分两类**：

| action | 源里用法 | 病因 → 处置 |
|---|---|---|
| `setGraph` · `setStyles` · `clearImageGenFeed` | 源里**也只有定义、无调用** | 死面 ⇒ **删** |
| `purgeLovartJunk` · `purgeLovartByScope` | 其助手 `isLovartJunk`（源 `Dc`）在 **materialize 路径 `32625/32681/34000` 是活代码** | **该接（职责缺位）** ⇒ **不删** |

⇒ 后 2 个若直接删，既错（源里是活能力）又会把纯函数 `purgeLovartImages`/`isLovartJunk`/`matchesLovartScope`
变成「只被测试引用」→ 被死代码闸判死。**一律删就是改症状。**

## 第 4 个被推翻的「辩护词」

`hostOps` 头注原称 `saveTextFile` 是「保留能力位（源 `saveFile` 同样无调用方）」。
回源实测：`shared.js` + 全部 `.jsx` 里 **`saveFile` 零命中** ⇒ 源**根本没有**该能力。
⇒ 不是「源有但没人调」，是「我方凭空加面 ＋ 编了个源依据」。已删 app 侧整条链
（宿主侧 `preload.js`/`main.js` 的 `save-file` 通道按 AGENTS「electron 默认不动 · 不破坏已有方法签名」**有意保留**）。

## 凭证

- `tsc` 0
- `npm run check` 6 道全绿（2067 条）
- `grep`：`localizeOps.localizeNode` / `apiOps.refreshConfig` / `saveFile` / `setGraph` / `setStyles` / `clearImageGenFeed` app 侧零残留
- `DATAFLOW.md` §十一 失真边已回写
