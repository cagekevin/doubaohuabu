/**
 * `vid://` 协议（★ **协议规则住这里**，与 `img.ts` 同族）
 *
 * 依据（**回源**）：`electron/main.js:1017-1059`（handler 实测）+ `docs/10 #9`「视频必须落盘」
 *      `docs/16` §1.1：`docs/03` §0.9 原记 `vid://` 前端未使用且标 `[待验证]` ⇒ 本轮开始使用。
 *
 * **主进程语义（不可改；前端必须对齐）**：
 *   - `vid://<name>` → `<userData>/videos/<name>`
 *   - `name` 取值：`url.host` 优先，否则 `pathname` 去首斜杠（`main.js:1020`）
 *   - ★ **路径防穿越**：`name` 里的 `[\\/]` 一律剥掉（`main.js:1021`；判据 J3）
 *   - `Range` 请求 → `206` + `Content-Range`；非法范围 → `416`；文件缺失 → `404`
 *   - MIME：`.webm` → `video/webm`、`.mov` → `video/quicktime`、其余 → `video/mp4`
 *
 * ⚠️ 契约常量在 `stable/contracts/schemas.ts`（`PROTOCOL_VID`）—— 本文件只放**由契约派生的行为**，
 *    不重复定义字面量（与 `img.ts` 同规矩）。
 */

import { PROTOCOL_VID } from '@/stable/contracts/schemas';

export { PROTOCOL_VID };

/** 是不是 `vid://` 引用（落盘后的形态） */
export function isVidRef(v: unknown): v is string {
  return typeof v === 'string' && v.startsWith(PROTOCOL_VID);
}

/** `decodeURIComponent` 的**不抛**版本（非法转义原样返回，不掩盖也不炸） */
function decodeSafe(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/**
 * 从 `vid://` 引用取**安全文件名**（与主进程 `main.js:1020-1021` **同规则**）
 *
 * ⚠️ 与主进程**必须一致**，否则前端拼出来的引用与后端解析的不是同一个文件：
 *    - `vid://a.mp4`   ⇒ host = `a.mp4`        ⇒ `a.mp4`
 *    - `vid:///a.mp4`  ⇒ host = `''`（假）⇒ pathname 去斜杠 ⇒ `a.mp4`
 *    - 最后剥掉所有 `[\\/]`（防穿越，判据 J3）
 *
 * ⚠️ 非 `vid://` 引用 → 返回 `''`（**不抛**：调用方拿它做"是否可用"判断）
 */
export function vidNameOf(ref: string): string {
  if (!isVidRef(ref)) return '';
  const rest = ref.slice(PROTOCOL_VID.length);
  const head = rest.split('/')[0] ?? '';
  const raw = head || rest.replace(/^\/+/, '');
  return decodeSafe(raw).replace(/[\\/]/g, '');
}

/** 拼 `vid://` 引用（`name` 里的分隔符按主进程同规则剥掉） */
export function toVidRef(name: string): string {
  return `${PROTOCOL_VID}${String(name ?? '').replace(/[\\/]/g, '')}`;
}

/** MIME（与主进程 `main.js:1026` 同表；供预览/下载处判断容器格式） */
export function vidMimeOf(name: string): string {
  if (/\.webm$/i.test(name)) return 'video/webm';
  if (/\.mov$/i.test(name)) return 'video/quicktime';
  return 'video/mp4';
}
