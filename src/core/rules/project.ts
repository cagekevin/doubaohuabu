/**
 * 工程规则（★ 纯函数，必测 —— §6.5 原则 7）
 *
 * 依据：docs/03-人类版.md §2（工程 CRUD）+ `Pt('p')` 的 id 生成规则
 *   - id 格式：`p_<base36 时间>_<计数>`（真实样本实测 `p_mv1raqbo_1` ✅）
 *   - 新工程名默认「未命名项目」
 *
 * ⚠️ 原则 4：`now` 由外部注入（`ClockPort`），本模块**不调 `Date.now()`**
 */

import type { Project, ProjectData } from '@/stable/model/project';
import { emptyProjectData } from '@/stable/model/project';
import { BRAND } from '@/constants/text';
import { PROJECT_ID_PREFIX } from '@/stable/contracts/schemas';

/** 新工程默认名（SSOT 在 `constants/text.ts` 的 `BRAND`） */
const DEFAULT_PROJECT_NAME = BRAND.untitledProject;

/**
 * 生成工程 id（原 `Pt('p')` = `p_<base36>_<计数>`）
 *
 * @param now 时间戳（ms）
 * @param seq 同一毫秒内的自增计数（从 1 起）
 */
export function makeProjectId(now: number, seq: number): string {
  // ⚠️ `PROJECT_ID_PREFIX` 已含下划线（`'p_'`）⇒ 拼出 `p_<base36>_<seq>`（真实样本 `p_mv1raqbo_1` ✅）
  return `${PROJECT_ID_PREFIX}${now.toString(36)}_${seq}`;
}

/**
 * 节点 id 前缀（原 `Pt` 的各前缀）
 * ⚠️ 与 `stable/contracts/schemas.ts` 里的 `*_ID_PREFIX` 同源 —— 那边是**冻结契约**，
 *    这里补的是节点专用的几个（源码里节点前缀没有独立常量）
 */
export const NODE_ID_PREFIX = {
  text: 't_',
  material: 'm_',
  video: 'vid_',
  genvideo: 'gv_',
  imggen: 'ig_',
  account: 'a_',
  group: 'grp_',
} as const;

export type NodeIdKind = keyof typeof NODE_ID_PREFIX;

/**
 * 生成节点 id（原 `Pt(prefix)`）
 * @param kind 节点类别
 * @param now 时间戳（ms）
 * @param seq 自增计数
 */
export function makeNodeId(kind: NodeIdKind, now: number, seq: number): string {
  return `${NODE_ID_PREFIX[kind]}${now.toString(36)}_${seq}`;
}

/** 新建工程（原「＋ 新建项目」） */
export function createProject(opts: {
  now: number;
  seq: number;
  name?: string;
  data?: Partial<ProjectData>;
  storagePath?: string;
}): Project {
  return {
    id: makeProjectId(opts.now, opts.seq),
    name: opts.name ?? DEFAULT_PROJECT_NAME,
    updatedAt: opts.now,
    ...(opts.storagePath ? { storagePath: opts.storagePath } : {}),
    data: { ...emptyProjectData(), ...(opts.data ?? {}) },
  };
}

/** 重命名（原「双击重命名项目」）—— 空名回落默认 */
export function renameProject(project: Project, name: string, now: number): Project {
  const trimmed = String(name ?? '').trim();
  return { ...project, name: trimmed || DEFAULT_PROJECT_NAME, updatedAt: now };
}

/** 触碰 `updatedAt`（任何数据变更都该调） */
export function touchProject(project: Project, now: number): Project {
  return { ...project, updatedAt: now };
}
