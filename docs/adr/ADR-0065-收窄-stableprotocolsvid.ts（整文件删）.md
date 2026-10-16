# ADR-0065 · 收窄 stable/protocols/vid.ts（整文件删）

- **状态**：生效
- **结论**：取『若要收窄则整文件删』的次选：vid:// 全由宿主独占（主进程产生引用 + 注册 handler），前端零解析 ⇒ 前端镜像 4 导出与 PROTOCOL_VID 是第二份真相，删。用户裁定 2026-10-14
- **日期**：2026-10-13
- **裁定人**：架构师（取证后自定）
- **触发**：—

## 背景

`stable/protocols/vid.ts` 曾是「`vid://` 协议的**前端镜像**」：`isVidRef` / `vidNameOf` / `toVidRef` / `vidMimeOf` 四导出 + 转出契约常量 `PROTOCOL_VID`，逐行对齐主进程 `main.js:1017-1059`（含路径防穿越判据 J3）。
`docs/DATAFLOW.md` §十二曾把它记为**判不落（保留能力位）**，理由「`vid://` 前端零处理是正确形态」—— 但同一条也留了另一选法：**若要收窄则整文件删**。

## 判据（它凭什么成立 / 为什么不成立）

**不成立**（保留的理由站不住）：
- **唯一入口**：`vid://` 的产生与解析**全在宿主** —— 主进程 `main.js:787` 返回 `{ref:'vid://<sha1>.<ext>'}`，由 `main.js:1017-1059` 注册 handler 供给（Range→206/416、MIME、CORS）。前端把该引用当**不透明串**渲染（`<video src>`），从不自己拼 / 拆。
- **第二份真相**：前端那份镜像（连 J3 路径防穿越）**全仓 0 消费**（含 `electron/`；knip `--production` 早已判死，见 `scripts/dead-code-baseline.json`）。前端再镜像一份 J3 ⇒ 改一处漏一处，正是母体 M3。
- **C1 三振出局**：真实实现**只有一处**（宿主）⇒ 前端不写第二份。

## 决议

**整文件删** `src/stable/protocols/vid.ts`；并删 `src/stable/contracts/schemas.ts` 的 `PROTOCOL_VID`（唯一消费者就是 `vid.ts`）。

- 落点：`src/stable/protocols/vid.ts`（删）· `src/stable/contracts/schemas.ts`（删 `PROTOCOL_VID` + 注释写明「`vid://` 由宿主独占」）。
- 同批清偿：`src/state/index.ts` 的 16 个死 barrel 再导出。
- 真源回写：`docs/DATAFLOW.md` §十二（移出「判不落」表）+ §十三（改为「宿主独占」）。

## 后果

- ✅ 收益：前端不再持有「永不使用」的协议镜像；J3 只存在于**唯一实现处**（宿主）。
- ⚠️ 代价 / 回潮风险：若将来前端真要**解析** `vid://`（如自建下载名），需重新落该能力 —— 届时按「唯一入口」在**消费层**落，并回源对齐宿主规则。
- 📌 违反时的判据（怎么发现"又回去了"）：`src/` 里若再出现对 `vid://` 的**拼装 / 解析**字符串操作（而非把引用当不透明串传递），即回潮。
