# 真实数据样本（W2 / W14 的 golden sample）

> **来源**：`%APPDATA%\doubao-canvas\`（原应用的真实 userData）
> **提取方式**：`node scripts/extract-real-sample.cjs`（用 `classic-level` 读 leveldb；**只读原件**，先拷贝再打开）
> **生成日期**：2026-10-10

## 拿到什么

| 文件 | 来源 | 说明 |
|---|---|---|
| `doubao-projects.txt` | localStorage `doubao-projects`（**真值**，14,847 字符） | ★ **W2 主样本** |
| `doubao-accounts.txt` | localStorage `doubao-accounts`（2,801 字符） | 账号列表 |
| `imggen_recurring_assets_v1.txt` | 文生图去重表（311 字符） | — |
| `doubao-view-head-collapsed.txt` | 后台视图折叠态（1 字符） | — |
| `projects-autobackup.json` | `userData/projects-autobackup.json`（11,581 字节） | 主进程写的工程备份（与 `doubao-projects` 同源） |
| `_leveldb-copy/` | leveldb 的副本 | 供复现；可随时重跑脚本 |

## 样本内容（实测）

```
doubao-projects:
  工程数: 1
  顶层字段: id, name, updatedAt, data, storagePath       ← 与 core/model/project.ts 完全一致 ✅
  data 字段: nodes, edges, library, snap, videoShares    ← 完全一致 ✅
  nodes: 3（imggen / text / genvideo）  edges: 0  library: 1  snap: false
  id/name: p_mv1raqbo_1 / 「未命名项目」
```

## ⚠️ 只命中 4 / 20 个键 —— 这是**真实情况**，不是提取失败

其余 16 个键（`doubao-presets` / `doubao-styles` / `doubao-proxy-pool` / `doubao-canvas` / `access_token` …）**这个用户从未写过**（应用只轻度使用过）。

**这本身是一个必须覆盖的兼容性用例**：
> **缺失的键不能导致崩溃或数据损坏** —— 必须按「首次使用」处理（用默认值），而不是当成错误。

已进 `08-验证用例.md` 的 W2 判据。

## 技术备注（踩过的坑）

1. **`classic-level` 必须用 `valueEncoding: 'buffer'`**
   默认的 `utf8` 会先把原始字节解坏（值是 `tag + UTF-16LE`，不是 UTF-8）→ 解出来是乱码。
2. **`.ldb` 是 Snappy 压缩块，裸扫无效** —— 必须用真正的 leveldb 读取器。
3. **键前缀是 `_file://\x00\x01`** —— 印证了 `main.js:653`「生产环境页面由 `file://` 加载」。
4. **不能直接打开原目录**（会写 `LOG`/`LOCK`）→ 先拷副本再打开。
