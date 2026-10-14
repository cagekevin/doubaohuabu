/**
 * 下载节点（`type: 'download'`）—— 对应原 `WL.jsx`（150 行，**逐行移植**）
 *
 * ★★ **它是干嘛的**：把**连到它的视频节点**的 `url` **批量落盘**到用户选的目录。
 *    源版空态原文：「从视频节点连线至此处以批量下载」。
 *
 * ★ **2026-10-10 补齐**（此前该组件 18 行、**零交互**）：
 *   ① **选目录**（原 33-40 的 `p`：`window.api.selectFolder()`）；
 *   ② **批量下载**（原 41-97 的 `h`：逐条 `downloadFile` + 每条约 300ms 间隔 + 逐条记状态）；
 *   ③ **列表**（原 121-139：名称 + 三态图标 `⬇` / `✓`（`title` 给大小与路径）/ `✗`（`title` 给错误））；
 *   ④ **已下载总量**（原 145：`已下载 {Kd(Σok.size)}`）。
 *
 * ⚠️ **与源版的一处有意偏离（留痕）**：源版选完目录**只写组件 state、不写回节点**
 *   （`p` 里只有 `l(w)`），而节点的 `folder` 字段**唯一用途**就是初始化那个 state
 *   ⇒ 结果是"重开项目又要重选一次目录"，那个字段等于白存。
 *   本实现**选完即 `patchNodeData({folder})`**（源版意图的合理落实）。
 *   文件名的替换/截断、状态的形状、300ms 间隔、`.mp4` 后缀**全部照抄**。
 *
 * ⚠️ **宿主调用走 `useHostOps()` 控制器**（`selectFolder` / `downloadFile`）—— `ui` 不得直持
 *   `Ports`（TD-16-8；`usePorts` 已从 `@/state` 移除）。这里的逻辑是"逐条 IO + 局部状态"，
 *   没有跨组件状态要维护（原则 1 约束的是**写 store**，而写 store 的部分
 *   （`folder` / 节点状态）都走 action / 局部 state）。
 * ⚠️ **不持久化下载状态**（源版也是组件 state）—— 重启后文件还在，但"下载过"的标记会丢。
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import { useHostOps, useStore } from '@/state';
import {
  collectDownloadTargets,
  countDownloaded,
  downloadFileName,
  formatBytes,
  totalDownloadedBytes,
  type DownloadStatusMap,
} from '@/core/rules/downloadNode';
import { DOWNLOAD_NODE_TEXT } from '@/constants/text';
import { NodeShell } from './NodeShell';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

/** 逐条之间的间隔（ms）—— 原 `WL.jsx:92` 的 `setTimeout(b, 300)` */
const ITEM_INTERVAL_MS = 300;

export function DownloadNode({ id, data, selected }: RFNodeProps<'download'>) {
  const hostOps = useHostOps();
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const patchNodeData = useStore((s) => s.patchNodeData);

  /** 待下载列表（原 `o`）：**直接入边 + `video` + 有 `url`** */
  const targets = useMemo(
    () => collectDownloadTargets(nodes, edges, id),
    [nodes, edges, id],
  );

  const [busy, setBusy] = useState(false);
  /** 状态表（原 `d`）—— 只在内存里（源版也不落盘） */
  const [status, setStatus] = useState<DownloadStatusMap>({});
  /** ⚠️ 与源版一致：从 `data.folder` 初始化 */
  const folder = data.folder;
  /** 防重入（原 `c` 的 `!c` 守卫 + React 的批处理延迟） */
  const runningRef = useRef(false);

  /** 选目录（原 33-40）—— ⚠️ **本实现顺手写回节点**（见文件头的有意偏离） */
  const chooseFolder = useCallback(async () => {
    const r = await hostOps.selectFolder();
    if (r.ok && r.value) patchNodeData(id, { folder: r.value });
  }, [hostOps, id, patchNodeData]);

  /**
   * 批量下载（原 41-97）
   *
   * ⚠️ 守卫与源逐字一致：**目录为空 / 已在跑 / 列表为空 ⇒ 直接返回**（不做任何事，也不提示）
   */
  const downloadAll = useCallback(async () => {
    if (!folder || runningRef.current || targets.length === 0) return;
    runningRef.current = true;
    setBusy(true);
    setStatus({});

    for (const target of targets) {
      const url = String((target.data as Record<string, unknown> | undefined)?.url ?? '');
      setStatus((prev) => ({ ...prev, [target.id]: 'downloading' }));

      try {
        const name = downloadFileName(target.data as { label?: unknown; vid?: unknown });
        // 原版用 `${folder}/${name}` 拼路径（宿主按平台再归一）
        const r = await hostOps.downloadFile(url, `${folder}/${name}`);
        if (r.ok) {
          setStatus((prev) => ({
            ...prev,
            [target.id]: { status: 'ok', ...(r.value.path ? { path: r.value.path } : {}), ...(r.value.size === undefined ? {} : { size: r.value.size }) },
          }));
        } else {
          setStatus((prev) => ({
            ...prev,
            [target.id]: { status: 'err', error: r.message || DOWNLOAD_NODE_TEXT.unknownError },
          }));
        }
      } catch (e) {
        setStatus((prev) => ({
          ...prev,
          [target.id]: {
            status: 'err',
            error: e instanceof Error ? e.message : String(e),
          },
        }));
      }

      // 原 91-93：逐条之间**固定间隔**（不这样会瞬间起一堆请求）
      await new Promise((resolve) => setTimeout(resolve, ITEM_INTERVAL_MS));
    }

    setBusy(false);
    runningRef.current = false;
  }, [folder, targets, hostOps]);

  const total = totalDownloadedBytes(status);
  const doneCount = countDownloaded(status);

  return (
    <NodeShell
      type="download"
      title={DOWNLOAD_NODE_TEXT.title}
      meta={targets.length > 0 ? <span className={styles.nodeCount}>{targets.length}</span> : undefined}
      selected={selected}
      /* 原 `WL.jsx:149` 的 `<_Component30 source={false}/>` ⇒ **仅 target**（只能被连入，不能连出） */
      handles={{ source: false }}
      minWidth={260}
      minHeight={140}
      testId="download-node"
    >
      <div className={`${styles.downloadBody} nodrag nopan`}>
        <div className={styles.downloadFolderRow}>
          <span className={styles.downloadFolderLabel}>{DOWNLOAD_NODE_TEXT.folderLabel}</span>
          {/*
            原 `WL.jsx:114-116`：`title` 给**完整路径**（未选 ⇒ `未选择`），正文只显示**最后一段**
            （`a.replace(/^.*[\\/]/, '')`）—— 长路径会把这一行挤爆。
          */}
          <span
            className={styles.downloadFolderPath}
            title={folder || DOWNLOAD_NODE_TEXT.folderNone}
          >
            {folder ? folder.replace(/^.*[\\/]/, '') : DOWNLOAD_NODE_TEXT.folderNone}
          </span>
          <button type="button" className={styles.downloadBtn} onClick={() => void chooseFolder()}>
            {DOWNLOAD_NODE_TEXT.chooseFolder}
          </button>
        </div>

        {targets.length > 0 ? (
          <div className={styles.downloadList}>
            {targets.map((t) => {
              const d = (t.data ?? {}) as Record<string, unknown>;
              const name = String(d.label || d.vid || DOWNLOAD_NODE_TEXT.untitled);
              const st = status[t.id];
              return (
                <div className={styles.downloadItem} key={`${t.id}-${name}`}>
                  <span className={styles.downloadItemName} title={name}>
                    {name}
                  </span>
                  {st === 'downloading' && (
                    <span className={`${styles.downloadItemStatus} ${styles.downloadStatusBusy}`}>
                      {DOWNLOAD_NODE_TEXT.statusDownloading}
                    </span>
                  )}
                  {st && typeof st === 'object' && st.status === 'ok' && (
                    <span
                      className={`${styles.downloadItemStatus} ${styles.downloadStatusOk}`}
                      // 原 131 的 `title`：`${Kd(v.size)} · ${v.path}`
                      title={`${formatBytes(st.size)} · ${st.path ?? ''}`}
                    >
                      {DOWNLOAD_NODE_TEXT.statusOk}
                    </span>
                  )}
                  {st && typeof st === 'object' && st.status === 'err' && (
                    <span
                      className={`${styles.downloadItemStatus} ${styles.downloadStatusErr}`}
                      title={st.error}
                    >
                      {DOWNLOAD_NODE_TEXT.statusErr}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className={styles.downloadEmpty}>{DOWNLOAD_NODE_TEXT.empty}</div>
        )}

        <div className={styles.downloadActionRow}>
          <button
            type="button"
            className={styles.downloadBtn}
            disabled={busy || !folder || targets.length === 0}
            onClick={() => void downloadAll()}
          >
            {busy ? DOWNLOAD_NODE_TEXT.downloading : DOWNLOAD_NODE_TEXT.downloadAll(targets.length)}
          </button>
          {doneCount > 0 && (
            <span className={styles.downloadTotal}>
              {DOWNLOAD_NODE_TEXT.downloaded(formatBytes(total))}
            </span>
          )}
        </div>
      </div>
    </NodeShell>
  );
}
