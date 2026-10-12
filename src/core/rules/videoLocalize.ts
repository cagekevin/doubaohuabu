/**
 * 视频本地化 —— **纯逻辑半**（★ 必测）
 *
 * 依据（**逐行回源抄录**）：
 *   - 待落盘 URL 的收集：`localizeNodeVideos` shared.js:31029-31040
 *   - 回写引用：`applyLocalVideoRef` shared.js:30952-31016
 *
 * ⚠️ **编排（调 `saveVideoFromUrl`）在 `core/usecases/localizeVideos.ts`** —— 本文件只做纯变换。
 * ⚠️ 链 18 硬约束：视频**必须落盘**（`docs/过程.md` #9）—— `http(s)` 直链不能留在节点里。
 */

import { asRecord } from '@/lib/object';

/** `http(s)://` 直链判定（原 `/^https?:\/\//i.test(...)` —— **只有直链才落盘**） */
export const isHttpUrl = (v: unknown): v is string => typeof v === 'string' && /^https?:\/\//i.test(v);

/**
 * 收集节点里所有**待本地化**的 `http(s)` 直链（原 `localizeNodeVideos` 31029-31040）
 *
 * 三个来源（**顺序即去重顺序**）：
 *   ① `data.url` ② `data.resultUrl` ③ `data.genHistory.attempts[].url`
 *
 * ⚠️ 与源一致：**非 `http(s)` 的一律不收**（`vid://` / `img://` / `data:` 已经落过盘或无需落盘）。
 */
export function collectLocalizableUrls(data: Record<string, unknown>): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (v: unknown): void => {
    if (isHttpUrl(v) && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };

  push(data.url);
  push(data.resultUrl);

  const history = asRecord(data.genHistory);
  const attempts = history.attempts;
  if (Array.isArray(attempts)) {
    for (const item of attempts) push(asRecord(item).url);
  }

  return out;
}

/** 可本地化的节点（够用的最小形状 —— 不依赖 `CanvasNode` 联合） */
export interface LocalizableNode {
  id: string;
  type: string;
  data: Record<string, unknown>;
}

/**
 * 挑出需要回填的节点（原 `backfillLocalVideos` 31056-31060）
 * ⚠️ 与源一致：只看 `genvideo` / `video` **两类**（其它类型没有视频直链）
 */
export function selectVideoNodesToLocalize(
  nodes: readonly { id: string; type: string; data: unknown }[],
): LocalizableNode[] {
  const out: LocalizableNode[] = [];
  for (const n of nodes) {
    if (n.type === 'genvideo' || n.type === 'video') {
      out.push({ id: n.id, type: n.type, data: asRecord(n.data) });
    }
  }
  return out;
}

export interface ApplyLocalVideoRefResult {
  /** 回写后的 `data`（**未命中任何一处时返回同一引用**） */
  data: Record<string, unknown>;
  changed: boolean;
}

/**
 * 把某条 `http(s)` 直链**整个节点范围内**换成落盘引用（原 `applyLocalVideoRef` 30952）
 *
 * 三处可能命中（**顺序即写入顺序**，任一处命中即 `changed = true`）：
 *   ① `genHistory.attempts[]` 里 `url === fromUrl`（且给了 `attemptId` 时还要 `id === attemptId`）
 *   ② `data.resultUrl === fromUrl`
 *   ③ `data.url === fromUrl`
 *
 * ⚠️ 与源一致的前置守卫：`!fromUrl || !toUrl || fromUrl === toUrl` ⇒ **什么都不做**。
 * ⚠️ 不可变：不改传入的 `data`；未命中 ⇒ **返回同一引用**（免得白 render）。
 */
export function applyLocalVideoRef(
  data: Record<string, unknown>,
  fromUrl: string,
  toUrl: string,
  attemptId?: string | null,
): ApplyLocalVideoRefResult {
  // 原：`if (!n || !s || !o || s === o) return false;`
  if (!fromUrl || !toUrl || fromUrl === toUrl) return { data, changed: false };

  let next = data;
  let changed = false;

  // ① genHistory.attempts
  const history = asRecord(data.genHistory);
  if (Array.isArray(history.attempts)) {
    let hit = false;
    const attempts = history.attempts.map((item) => {
      const a = asRecord(item);
      if (a.url === fromUrl && (!attemptId || a.id === attemptId)) {
        hit = true;
        return { ...a, url: toUrl };
      }
      return item;
    });
    if (hit) {
      next = { ...next, genHistory: { ...history, attempts } };
      changed = true;
    }
  }

  // ② resultUrl  ③ url
  if (next.resultUrl === fromUrl) {
    next = { ...next, resultUrl: toUrl };
    changed = true;
  }
  if (next.url === fromUrl) {
    next = { ...next, url: toUrl };
    changed = true;
  }

  return { data: next, changed };
}
