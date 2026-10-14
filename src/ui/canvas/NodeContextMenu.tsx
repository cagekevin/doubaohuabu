/**
 * 节点右键菜单（原 `node-ctx-menu`，`_Component42.jsx:1685-1726`；处理函数 `1093-1160`）
 *
 * ★ **6/6 项全落**（源是 6 项，顺序即语义）：
 *   | # | 项 | 源 | 本仓 |
 *   |---|---|---|---|
 *   | 1 | 自动排列（整理所选节点） | `arrangeSelectedNodes()` | ✅ `canvas.arrangeSelectedNodes`（原 `shared.js:29635`） |
 *   | 2 | 更换素材（仅 material） | `Ye` → `Z({mode:'replace', nodeId})` | ✅ `onReplaceMaterial` ← 宿主开 `MaterialPickerModal`；state `canvas.replaceMaterialWithLib` |
 *   | 3 | 打开文件所在位置（仅 material 且 `img://`） | `Pe` → `window.api.showInFolder(dataUrl)` | ✅ `hostOps.showInFolder`（**同源方法**）—— ⚠️ **不可用 `revealPath`**：它**只认真实路径**，`img://` 传进去主进程不解析 ⇒ 功能打不开 |
 *   | 4 | 复制 Ctrl+C | `Te` → `pe()` + `copyNodes()` | ✅ |
 *   | 5 | 保存为节点预设 | `rt` → `addNodePreset` | ✅ `onSaveAsPreset` ← 宿主开 `NodePresetModal`；纯层 `makeGraphPreset` ＋ `global.addNodePreset` 同日落 |
 *   | 6 | 粘贴 Ctrl+V（无剪贴板则禁用） | `Ue` → `pasteNodes(screenToFlow(菜单位置))` | ✅ |
 *
 * ★ **开合 / 定位 / 点外部关闭 / 键盘导航 / ARIA 全部走共享件** `ui/common/ContextMenu`
 *   （唯一入口：`role=menu` ＋ 方向键 ＋ `Enter` ＋ `Escape`）⇒ 本组件**不自绘 DOM、不自挂监听**。
 * ⚠️ 打开它之前，源还会**先把该节点设为唯一选中**（未选中且当前选中 < 2 时）—— 见 `CanvasHost.onNodeContextMenu`。
 *
 * ⚠️ 原则 1：本组件**不写 store**（只调 state 暴露的 action / hostOps 控制器）。
 */

import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { useHostOps, useStore } from '@/state';
import { ContextMenu, type MenuItem } from '@/ui/common/ContextMenu';
import { NODE_CTX_TEXT } from '@/constants/text';
import { log } from '@/lib/log';

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
   * 「复制」的处理（原 `Te`，`_Component42.jsx:1093-1097`：**`pe()` 先记"刚复制"时刻** → `copyNodes()`）
   * ⚠️ 那个时刻在宿主（`CanvasHost` 的 `lastCopyAtRef`）—— `Ctrl+V` 靠它判"剪贴板没变过"⇒
   *   必须由宿主传进来，**不能只在菜单里 `copyNodes()`**（否则右键复制后 `Ctrl+V` 粘不出节点）。
   */
  onCopyNodes: () => void;
  /**
   * 「保存为节点预设」（原 `rt`，`_Component42.jsx:1138-1155`）
   *
   * ⚠️ 与 `onCopyNodes` 同法：**载荷由宿主抓**（菜单点完就卸载）—— 宿主负责开模态。
   */
  onSaveAsPreset: () => void;
  /**
   * 「更换素材」（原 `Ye`，`_Component42.jsx:1111-1120`：`Z({mode:'replace', nodeId})`）
   *
   * ⚠️ 与另两个回调同法：**由宿主开模态**（菜单点完就卸载）。
   */
  onReplaceMaterial: () => void;
}

export function NodeContextMenu({
  state,
  onClose,
  onCopyNodes,
  onSaveAsPreset,
  onReplaceMaterial,
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

  // 源 `Te`（1093-1097）：`pe()`（记"刚复制"时刻）→ `copyNodes()`；关菜单由共享件做
  const onCopy = useCallback(() => {
    onCopyNodes();
  }, [onCopyNodes]);

  // 源 `Ue`（1098-1110）：无剪贴板 ⇒ 不落节点；否则在**菜单位置**落节点
  const onPaste = useCallback(() => {
    pasteNodes(screenToFlowPosition({ x: state.x, y: state.y }));
  }, [pasteNodes, screenToFlowPosition, state.x, state.y]);

  // 源 `Pe`（1122-1137）：`img://` 才打开；失败**静默**（源 `catch {}`，本实现 warn 留痕）
  // ⚠️ **必须用 `showInFolder`（收 `img://`）而不是 `revealPath`（只认真实路径）** —— 见文件头注第 3 项
  const onReveal = useCallback(async () => {
    if (!canReveal || !dataUrl) return;
    const r = await hostOps.showInFolder(dataUrl);
    if (!r.ok) log.warn('[NodeContextMenu] 打开文件位置失败:', r.message);
  }, [canReveal, dataUrl, hostOps]);

  /** 项清单（**顺序即语义**，逐条对源）；渲染/开合/键盘导航全交共享件 */
  const items: MenuItem[] = [
    { key: 'arrange', label: NODE_CTX_TEXT.arrange, onSelect: () => void arrangeSelectedNodes() },
    ...(node?.type === 'material'
      ? ([
          { key: 'replace', label: NODE_CTX_TEXT.replaceMaterial, onSelect: onReplaceMaterial },
          {
            key: 'reveal',
            label: NODE_CTX_TEXT.reveal,
            title: NODE_CTX_TEXT.revealTitle,
            disabled: !canReveal,
            onSelect: () => void onReveal(),
          },
        ] satisfies MenuItem[])
      : []),
    { key: 'copy', label: NODE_CTX_TEXT.copy, onSelect: onCopy },
    { key: 'preset', label: NODE_CTX_TEXT.saveNodePreset, onSelect: onSaveAsPreset },
    { key: 'paste', label: NODE_CTX_TEXT.paste, disabled: !hasClipboard, onSelect: onPaste },
  ];

  return <ContextMenu x={state.x} y={state.y} items={items} onClose={onClose} />;
}
