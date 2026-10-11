/**
 * 节点右键菜单（原 `node-ctx-menu`，`_Component42.jsx:1685-1726`；处理函数 `1093-1160`）
 *
 * ★ **本仓只落 4/6 项**（源是 6 项，顺序即语义）：
 *   | # | 项 | 源 | 本仓 |
 *   |---|---|---|---|
 *   | 1 | 自动排列（整理所选节点） | `arrangeSelectedNodes()` | ✅ `canvas.arrangeSelectedNodes`（原 `shared.js:29635`） |
 *   | 2 | 更换素材（仅 material） | `Ye` → `Z({mode:'replace', nodeId})` | ⛔ **素材选择器未实现**（`docs/13` §3「叠加层」） ⇒ **不渲染** |
 *   | 3 | 打开文件所在位置（仅 material 且 `img://`） | `Pe` → `window.api.showInFolder(dataUrl)` | ✅ `hostOps.showInFolder`（**同源方法**）—— ⚠️ **不可用 `revealPath`**：它**只认真实路径**，`img://` 传进去主进程不解析 ⇒ 功能打不开 |
 *   | 4 | 复制 Ctrl+C | `Te` → `pe()` + `copyNodes()` | ✅ |
 *   | 5 | 保存为节点预设 | `rt` → `addNodePreset` | ✅ **2026-10-12 落**（`onSaveAsPreset` ← 宿主开 `NodePresetModal`；纯层 `makeGraphPreset` ＋ `global.addNodePreset` 同日落） |
 *   | 6 | 粘贴 Ctrl+V（无剪贴板则禁用） | `Ue` → `pasteNodes(screenToFlow(菜单位置))` | ✅ |
 *   ⇒ 「渲染一个点了没反应的按钮」= 假装功能在 ⇒ 这两项**不渲染**（`docs/13` §3 登记为债）。
 *
 * 源的**开合**（`1074-1092`）：菜单开着时监听 `document` 的 **`click`**（点菜单外 ⇒ 关；
 * 菜单自身 `onClick` 有 `stopPropagation` 所以点里面不关）+ **`Escape`** ⇒ 关。
 * ⚠️ 打开它之前，源还会**先把该节点设为唯一选中**（未选中且当前选中 < 2 时）—— 见 `CanvasHost.onNodeContextMenu`。
 *
 * ⚠️ 原则 1：本组件**不写 store**（只调 state 暴露的 action / hostOps 控制器）。
 */

import { useEffect, useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useHostOps, useStore } from '@/state';
import { NODE_CTX_TEXT } from '@/constants/text';
import { log } from '@/lib/log';
import styles from './NodeContextMenu.module.css';

/** 菜单状态（原 `Y`，`_Component42.jsx:1064-1069`） */
export interface NodeContextMenuState {
  /** 屏幕坐标（菜单定位，`position: fixed`） */
  x: number;
  y: number;
  nodeId: string;
  nodeType: string;
}

export interface NodeContextMenuProps {
  state: NodeContextMenuState;
  onClose: () => void;
  /**
   * 「复制」的处理（原 `Te`，`_Component42.jsx:1093-1097`：**`pe()` 先记"刚复制"时刻** → `copyNodes()` → 关）
   * ⚠️ 那个时刻在宿主（`CanvasHost` 的 `lastCopyAtRef`）—— `Ctrl+V` 靠它判"剪贴板没变过"⇒
   *   必须由宿主传进来，**不能只在菜单里 `copyNodes()`**（否则右键复制后 `Ctrl+V` 粘不出节点）。
   */
  onCopyNodes: () => void;
  /**
   * ★ 「保存为节点预设」（原 `rt`，`_Component42.jsx:1138-1155`）—— **2026-10-12 落**
   * （此前本文件头注写"⛔ 未移植 ⇒ 不渲染"，那是不渲染一个**本该有**的项）
   *
   * ⚠️ 与 `onCopyNodes` 同法：**载荷由宿主抓**（菜单点完就卸载）—— 宿主负责开模态。
   */
  onSaveAsPreset: () => void;
}

export function NodeContextMenu({
  state,
  onClose,
  onCopyNodes,
  onSaveAsPreset,
}: NodeContextMenuProps) {
  const arrangeSelectedNodes = useStore((s) => s.arrangeSelectedNodes);
  const pasteNodes = useStore((s) => s.pasteNodes);
  const hasClipboard = useStore((s) => s.clipboard !== null);
  const node = useStore((s) => s.nodes.find((n) => n.id === state.nodeId));
  const hostOps = useHostOps();
  // ⚠️ 源 `Ue` 在**点击粘贴那一刻**才把菜单位置换算成画布坐标（不是打开菜单时）——
  //    这样用户在菜单开着时平移/缩放画布，落点仍是对的（逐字保留这个时机）。
  const { screenToFlowPosition } = useReactFlow();
  // ⚠️ 与源一致：`dataUrl` 必须是 `img://` 才能打开文件位置（画布内联 base64 / 远程地址都**不在磁盘上**）
  const dataUrl = (node?.data as { dataUrl?: string } | undefined)?.dataUrl;
  const canReveal = typeof dataUrl === 'string' && /^img:\/\//i.test(dataUrl);

  // 源 `1074-1092`：`document.click` + `Escape` ⇒ 关（点菜单里不关 —— 自身 stopPropagation）
  useEffect(() => {
    const onClick = (): void => onClose();
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // 源 `Te`（1093-1097）：`pe()`（记"刚复制"时刻）→ `copyNodes()` → 关
  const onCopy = useCallback(() => {
    onCopyNodes();
    onClose();
  }, [onCopyNodes, onClose]);

  // 源 `Ue`（1098-1110）：无剪贴板 ⇒ 只关；否则在**菜单位置**落节点
  const onPaste = useCallback(() => {
    pasteNodes(screenToFlowPosition({ x: state.x, y: state.y }));
    onClose();
  }, [pasteNodes, screenToFlowPosition, state.x, state.y, onClose]);

  // 源 `Pe`（1122-1137）：`img://` 才打开；失败**静默**（源 `catch {}`，本实现 warn 留痕）
  // ⚠️ **必须用 `showInFolder`（收 `img://`）而不是 `revealPath`（只认真实路径）** —— 见 `hostOps` 该处注释
  const onReveal = useCallback(async () => {
    onClose();
    if (!canReveal || !dataUrl) return;
    const r = await hostOps.showInFolder(dataUrl);
    if (!r.ok) log.warn('[NodeContextMenu] 打开文件位置失败:', r.message);
  }, [canReveal, dataUrl, hostOps, onClose]);

  return (
    <div
      className={styles.menu}
      style={{ left: state.x, top: state.y }}
      onClick={(e) => e.stopPropagation()}
      data-testid="node-ctx-menu"
    >
      <button type="button" className={styles.item} onClick={() => void arrangeSelectedNodes()}>
        {NODE_CTX_TEXT.arrange}
      </button>
      {node?.type === 'material' ? (
        <button
          type="button"
          className={`${styles.item}${canReveal ? '' : ` ${styles.itemDisabled}`}`}
          title={NODE_CTX_TEXT.revealTitle}
          disabled={!canReveal}
          onClick={() => void onReveal()}
        >
          {NODE_CTX_TEXT.reveal}
        </button>
      ) : null}
      <button type="button" className={styles.item} onClick={onCopy}>
        {NODE_CTX_TEXT.copy}
      </button>
      {/* ★ 项 5「保存为节点预设」（原 1716-1718）—— 顺序即语义：在「复制」与「粘贴」之间 */}
      <button type="button" className={styles.item} onClick={onSaveAsPreset}>
        {NODE_CTX_TEXT.saveNodePreset}
      </button>
      <button
        type="button"
        className={`${styles.item}${hasClipboard ? '' : ` ${styles.itemDisabled}`}`}
        disabled={!hasClipboard}
        onClick={onPaste}
      >
        {NODE_CTX_TEXT.paste}
      </button>
    </div>
  );
}
