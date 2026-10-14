（共 796 个基础类 · 42 个 module.css）

# 真机 CSS 索引（**脚本产物 · 勿手改**）

> 生成：`npm run css -- export`　真源：`src/**/*.css`
> **声明全文在 `ui-real.css`** —— 本文件只给坐标（哪个类 · 在哪行 · composes 谁 · 谁用它）。
> 类名一律是**去 Modules 化后**的名字：`<文件>-<类>`（真源 `shared` 无前缀）。
> 写 mockup HTML 时：`class` 里**把 composes 祖先类一并写上**（真机 TSX 产出的 class 也是这样）。

## 全局 CSS（原样搬，非 module）

- `src/styles/reset.css`
- `src/styles/tokens.css`
- `src/styles/theme.css`

## src/ui/canvas

### `src/ui/canvas/CanvasHost.module.css` — 前缀 `CanvasHost-` · 3 类

消费者：`src/ui/canvas/CanvasHost.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `CanvasHost-wrap` | 5 | 4 | — | `CanvasHost.tsx` |
| `CanvasHost-emptyHint` | 12 | 3 | `empty` | `CanvasHost.tsx` |
| `CanvasHost-dropHint` | 23 | 13 | — | `CanvasHost.tsx` |

### `src/ui/canvas/CreatePanel.module.css` — 前缀 `CreatePanel-` · 4 类

消费者：`src/ui/canvas/CreatePanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `CreatePanel-backdrop` | 10 | 3 | — | `CreatePanel.tsx` |
| `CreatePanel-panel` | 17 | 0 | `menu` | `CreatePanel.tsx` |
| `CreatePanel-title` | 21 | 1 | `panelTitle` | `CreatePanel.tsx` |
| `CreatePanel-option` | 27 | 9 | — | `CreatePanel.tsx` |

### `src/ui/canvas/GroupConnectHandle.module.css` — 前缀 `GroupConnectHandle-` · 2 类

消费者：`src/ui/canvas/GroupConnectHandle.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `GroupConnectHandle-handle` | 11 | 13 | — | `GroupConnectHandle.tsx` |
| `GroupConnectHandle-line` | 38 | 3 | — | `GroupConnectHandle.tsx` |

### `src/ui/canvas/MaterialPickerModal.module.css` — 前缀 `MaterialPickerModal-` · 6 类

消费者：`src/ui/canvas/MaterialPickerModal.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `MaterialPickerModal-panel` | 13 | 3 | `panel` | `MaterialPickerModal.tsx` |
| `MaterialPickerModal-title` | 20 | 1 | `panelTitle` | — |
| `MaterialPickerModal-grid` | 26 | 5 | — | `MaterialPickerModal.tsx` |
| `MaterialPickerModal-item` | 34 | 11 | — | `MaterialPickerModal.tsx` |
| `MaterialPickerModal-thumb` | 61 | 4 | — | `MaterialPickerModal.tsx` |
| `MaterialPickerModal-foot` | 68 | 5 | — | — |

### `src/ui/canvas/NodePresetModal.module.css` — 前缀 `NodePresetModal-` · 4 类

消费者：`src/ui/canvas/NodePresetModal.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `NodePresetModal-sub` | 8 | 4 | — | `NodePresetModal.tsx` |
| `NodePresetModal-input` | 15 | 1 | `field` | `NodePresetModal.tsx` |
| `NodePresetModal-btnPrimary` | 20 | 0 | `btn` `btnSm` `btnPrimary` | `NodePresetModal.tsx` |
| `NodePresetModal-btnGhost` | 24 | 0 | `btn` `btnSm` `btnGhost` | `NodePresetModal.tsx` |

### `src/ui/canvas/SelectionToolbar.module.css` — 前缀 `SelectionToolbar-` · 9 类

消费者：`src/ui/canvas/SelectionToolbar.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `SelectionToolbar-bar` | 10 | 10 | — | `SelectionToolbar.tsx` |
| `SelectionToolbar-count` | 25 | 4 | — | `SelectionToolbar.tsx` |
| `SelectionToolbar-btn` | 33 | 1 | `btn` `btnGhost` | `SelectionToolbar.tsx` |
| `SelectionToolbar-arrangeWrap` | 39 | 1 | — | `SelectionToolbar.tsx` |
| `SelectionToolbar-menu` | 43 | 6 | `panel` | `SelectionToolbar.tsx` |
| `SelectionToolbar-menuItem` | 53 | 4 | `listItem` | `SelectionToolbar.tsx` |
| `SelectionToolbar-menuItemPrimary` | 61 | 1 | — | `SelectionToolbar.tsx` |
| `SelectionToolbar-menuSep` | 64 | 3 | — | `SelectionToolbar.tsx` |
| `SelectionToolbar-menuHead` | 69 | 3 | — | `SelectionToolbar.tsx` |

## src/ui/common

### `src/ui/common/AccountPicker.module.css` — 前缀 `AccountPicker-` · 13 类

消费者：`src/ui/common/AccountPicker.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `AccountPicker-trigger` | 9 | 11 | — | `AccountPicker.tsx` |
| `AccountPicker-caret` | 32 | 7 | — | `AccountPicker.tsx` |
| `AccountPicker-caretOpen` | 42 | 1 | — | `AccountPicker.tsx` |
| `AccountPicker-menu` | 47 | 7 | `panel` | `AccountPicker.tsx` |
| `AccountPicker-item` | 59 | 3 | `listItem` `listItemClickable` | `AccountPicker.tsx` |
| `AccountPicker-itemOn` | 66 | 1 | — | `AccountPicker.tsx` |
| `AccountPicker-itemOff` | 70 | 1 | — | `AccountPicker.tsx` |
| `AccountPicker-back` | 79 | 1 | — | `AccountPicker.tsx` |
| `AccountPicker-name` | 83 | 5 | — | `AccountPicker.tsx` |
| `AccountPicker-count` | 92 | 3 | — | `AccountPicker.tsx` |
| `AccountPicker-dot` | 99 | 0 | `dot` | `AccountPicker.tsx` |
| `AccountPicker-dotGray` | 103 | 0 | `dotInvalid` | `AccountPicker.tsx` |
| `AccountPicker-empty` | 108 | 3 | — | `AccountPicker.tsx` |

### `src/ui/common/shared.module.css` — 前缀 `（无 · 真源）` · 59 类

消费者：`src/ui/common/ContextMenu.tsx` · `src/ui/common/EmptyState.tsx` · `src/ui/common/ErrorBanner.tsx` · `src/ui/common/PanelShell.tsx` · `src/ui/common/SaveErrorBanner.tsx` · `src/ui/common/Thumb.tsx` · `src/ui/common/ToastHost.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `overlay` | 19 | 8 | — | `PanelShell.tsx` |
| `scrim` | 31 | 3 | — | — |
| `panelHead` | 46 | 10 | — | `PanelShell.tsx` |
| `panelBody` | 58 | 5 | — | `PanelShell.tsx` |
| `panelFoot` | 65 | 5 | — | `PanelShell.tsx` |
| `panelTitle` | 81 | 8 | — | `PanelShell.tsx` |
| `panelHeadMid` | 97 | 7 | — | `PanelShell.tsx` |
| `panelHeadActions` | 108 | 5 | — | `PanelShell.tsx` |
| `sectionTitle` | 117 | 5 | — | — |
| `sectionTitleSub` | 124 | 3 | — | — |
| `menuItem` | 131 | 6 | — | `ContextMenu.tsx` |
| `toastHost` | 149 | 8 | — | `ToastHost.tsx` |
| `toast` | 159 | 9 | — | `ToastHost.tsx` |
| `toastWarn` | 176 | 2 | — | `ToastHost.tsx` |
| `toastError` | 181 | 2 | — | `ToastHost.tsx` |
| `toastSuccess` | 187 | 2 | — | `ToastHost.tsx` |
| `toastMsg` | 201 | 1 | — | `ToastHost.tsx` |
| `toastHasAction` | 204 | 3 | — | `ToastHost.tsx` |
| `banner` | 211 | 8 | — | `ErrorBanner.tsx` |
| `bannerMsg` | 221 | 5 | — | `ErrorBanner.tsx` |
| `saveErrorBanner` | 231 | 16 | — | `SaveErrorBanner.tsx` |
| `saveErrorText` | 249 | 4 | — | `SaveErrorBanner.tsx` |
| `empty` | 260 | 8 | — | `EmptyState.tsx` |
| `emptyTitle` | 270 | 2 | — | `EmptyState.tsx` |
| `emptyHint` | 274 | 2 | — | `EmptyState.tsx` |
| `thumbImg` | 280 | 5 | — | `Thumb.tsx` |
| `thumbPlaceholder` | 287 | 7 | — | `Thumb.tsx` |
| `btn` | 312 | 15 | — | — |
| `btnPrimary` | 346 | 3 | — | — |
| `btnGhost` | 354 | 3 | — | — |
| `btnDanger` | 365 | 3 | — | — |
| `btnBlock` | 373 | 1 | — | — |
| `btnSm` | 374 | 3 | — | — |
| `btnIcon` | 380 | 3 | — | — |
| `panelClose` | 384 | 4 | `btn` `btnIcon` `btnGhost` | `PanelShell.tsx` `SaveErrorBanner.tsx` |
| `libIcon` | 408 | 4 | `btn` `btnIcon` `btnGhost` | — |
| `libIconFav` | 419 | 1 | — | — |
| `toastAction` | 430 | 2 | `btn` `btnSm` `btnGhost` | `ToastHost.tsx` |
| `field` | 443 | 9 | — | — |
| `textarea` | 460 | 4 | `field` | — |
| `panel` | 474 | 7 | — | `PanelShell.tsx` |
| `menu` | 488 | 4 | `panel` | `ContextMenu.tsx` |
| `menuTitle` | 497 | 3 | — | `ContextMenu.tsx` |
| `menuSep` | 504 | 3 | — | `ContextMenu.tsx` |
| `listItem` | 514 | 6 | — | — |
| `listItemClickable` | 531 | 3 | — | — |
| `isInline` | 544 | 4 | — | — |
| `progressTrack` | 555 | 4 | — | — |
| `progressFill` | 561 | 3 | — | — |
| `dot` | 568 | 5 | — | — |
| `dotInvalid` | 575 | 1 | — | — |
| `dotLg` | 576 | 2 | — | — |
| `spinnerText` | 580 | 1 | — | — |
| `spinnerRing` | 582 | 6 | — | — |
| `pill` | 595 | 9 | — | — |
| `pillOk` | 606 | 2 | — | — |
| `pillWarn` | 609 | 2 | — | — |
| `pillErr` | 610 | 2 | — | — |
| `pillBrand` | 616 | 2 | — | — |

只有变体规则（无基础声明）：`isDanger` · `libIconDel`

## src/ui/edges

### `src/ui/edges/InteractiveEdge.module.css` — 前缀 `InteractiveEdge-` · 2 类

消费者：`src/ui/edges/InteractiveEdge.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `InteractiveEdge-edgeActions` | 10 | 11 | — | `InteractiveEdge.tsx` |
| `InteractiveEdge-edgeAct` | 25 | 10 | — | `InteractiveEdge.tsx` |

只有变体规则（无基础声明）：`InteractiveEdge-edgeActDel`

## src/ui/nodes

### `src/ui/nodes/AnalyzePrompt.module.css` — 前缀 `AnalyzePrompt-` · 16 类

消费者：`src/ui/nodes/AnalyzePrompt.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `AnalyzePrompt-floatActions` | 10 | 9 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-analyzeBtn` | 22 | 1 | `btn` `btnSm` | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-pop` | 36 | 7 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-error` | 56 | 2 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-wait` | 63 | 3 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-waitRow` | 69 | 4 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-tabs` | 79 | 4 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-tab` | 88 | 1 | `btn` `btnSm` `btnGhost` | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-on` | 95 | 2 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-tabsGap` | 100 | 1 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-copy` | 104 | 0 | `btn` `btnSm` `btnGhost` | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-content` | 108 | 5 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-pre` | 116 | 4 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-revise` | 124 | 3 | — | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-reviseInput` | 130 | 2 | `field` | `AnalyzePrompt.tsx` |
| `AnalyzePrompt-reviseBtn` | 137 | 0 | `btn` `btnPrimary` `btnSm` | `AnalyzePrompt.tsx` |

### `src/ui/nodes/CustomHandle.module.css` — 前缀 `CustomHandle-` · 5 类

消费者：`src/ui/nodes/CustomHandle.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `CustomHandle-wrap` | 9 | 9 | — | `CustomHandle.tsx` |
| `CustomHandle-dot` | 31 | 9 | — | `CustomHandle.tsx` |
| `CustomHandle-ring` | 46 | 9 | — | `CustomHandle.tsx` |
| `CustomHandle-plus` | 63 | 8 | — | `CustomHandle.tsx` |
| `CustomHandle-handle` | 163 | 2 | — | `CustomHandle.tsx` |

只有变体规则（无基础声明）：`CustomHandle-connectingfrom` · `CustomHandle-connectingto` · `CustomHandle-isSmall` · `CustomHandle-react-flow__handle`

### `src/ui/nodes/FuzzyConfirmPanel.module.css` — 前缀 `FuzzyConfirmPanel-` · 21 类

消费者：`src/ui/nodes/FuzzyConfirmPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `FuzzyConfirmPanel-fuzzyOverlay` | 18 | 7 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyMark` | 30 | 3 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyMarkCurrent` | 36 | 1 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyPanel` | 40 | 16 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyHead` | 59 | 5 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyCurrentMatch` | 67 | 1 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyCurrentName` | 71 | 1 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyFindbar` | 75 | 4 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyNav` | 82 | 10 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyCounter` | 100 | 3 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyGallery` | 106 | 5 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyCard` | 114 | 8 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyThumbWrap` | 129 | 8 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyThumbImg` | 140 | 3 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyThumbPlaceholder` | 146 | 4 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyCardName` | 153 | 5 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyKw` | 161 | 2 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyCardMatch` | 166 | 3 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyFoot` | 172 | 4 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyTip` | 179 | 1 | — | `FuzzyConfirmPanel.tsx` |
| `FuzzyConfirmPanel-fuzzyIgnore` | 183 | 8 | — | `FuzzyConfirmPanel.tsx` |

### `src/ui/nodes/NodeTitle.module.css` — 前缀 `NodeTitle-` · 5 类

消费者：`src/ui/nodes/NodeTitle.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `NodeTitle-title` | 6 | 7 | — | `NodeTitle.tsx` |
| `NodeTitle-floating` | 18 | 4 | — | `NodeTitle.tsx` |
| `NodeTitle-icon` | 26 | 2 | — | `NodeTitle.tsx` |
| `NodeTitle-name` | 32 | 12 | — | `NodeTitle.tsx` |
| `NodeTitle-input` | 53 | 8 | — | `NodeTitle.tsx` |

### `src/ui/nodes/RefAutocomplete.module.css` — 前缀 `RefAutocomplete-` · 9 类

消费者：`src/ui/nodes/RefAutocomplete.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `RefAutocomplete-pop` | 6 | 14 | — | `RefAutocomplete.tsx` |
| `RefAutocomplete-list` | 24 | 3 | — | `RefAutocomplete.tsx` |
| `RefAutocomplete-item` | 30 | 2 | `listItem` `listItemClickable` | `RefAutocomplete.tsx` |
| `RefAutocomplete-itemActive` | 36 | 1 | — | `RefAutocomplete.tsx` |
| `RefAutocomplete-thumb` | 40 | 5 | — | `RefAutocomplete.tsx` |
| `RefAutocomplete-name` | 48 | 5 | — | `RefAutocomplete.tsx` |
| `RefAutocomplete-empty` | 56 | 0 | `empty` `isInline` | `RefAutocomplete.tsx` |
| `RefAutocomplete-hint` | 60 | 3 | — | `RefAutocomplete.tsx` |
| `RefAutocomplete-close` | 67 | 3 | `panelClose` | `RefAutocomplete.tsx` |

### `src/ui/nodes/SplitKeywordModal.module.css` — 前缀 `SplitKeywordModal-` · 5 类

消费者：`src/ui/nodes/SplitKeywordModal.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `SplitKeywordModal-sub` | 7 | 4 | — | `SplitKeywordModal.tsx` |
| `SplitKeywordModal-input` | 14 | 1 | `field` `textarea` | `SplitKeywordModal.tsx` |
| `SplitKeywordModal-btn` | 19 | 0 | `btn` `btnSm` | `SplitKeywordModal.tsx` |
| `SplitKeywordModal-btnPrimary` | 23 | 0 | `btn` `btnSm` `btnPrimary` | `SplitKeywordModal.tsx` |
| `SplitKeywordModal-btnGhost` | 27 | 0 | `btn` `btnSm` `btnGhost` | `SplitKeywordModal.tsx` |

### `src/ui/nodes/SplitPresetPickerModal.module.css` — 前缀 `SplitPresetPickerModal-` · 8 类

消费者：`src/ui/nodes/SplitPresetPickerModal.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `SplitPresetPickerModal-sub` | 10 | 4 | — | `SplitPresetPickerModal.tsx` |
| `SplitPresetPickerModal-kw` | 17 | 1 | — | `SplitPresetPickerModal.tsx` |
| `SplitPresetPickerModal-list` | 21 | 5 | — | `SplitPresetPickerModal.tsx` |
| `SplitPresetPickerModal-item` | 29 | 5 | `btn` `btnBlock` | `SplitPresetPickerModal.tsx` |
| `SplitPresetPickerModal-itemDirect` | 39 | 1 | — | `SplitPresetPickerModal.tsx` |
| `SplitPresetPickerModal-itemName` | 43 | 1 | — | `SplitPresetPickerModal.tsx` |
| `SplitPresetPickerModal-itemMeta` | 47 | 2 | — | `SplitPresetPickerModal.tsx` |
| `SplitPresetPickerModal-btnGhost` | 52 | 0 | `btn` `btnSm` `btnGhost` | `SplitPresetPickerModal.tsx` |

### `src/ui/nodes/shared.module.css` — 前缀 `nodesShared-` · 163 类

消费者：`src/ui/nodes/AccountNode.tsx` · `src/ui/nodes/DownloadNode.tsx` · `src/ui/nodes/GroupNode.tsx` · `src/ui/nodes/FaceMarksLayer.tsx` · `src/ui/nodes/GenImageNode.tsx` · `src/ui/nodes/GenVideoNode.tsx` · `src/ui/nodes/MaterialNode.tsx` · `src/ui/nodes/NodeShell.tsx` · `src/ui/nodes/TextNode.tsx` · `src/ui/nodes/VideoNode.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `nodesShared-node` | 5 | 8 | — | `NodeShell.tsx` |
| `nodesShared-selected` | 39 | 2 | — | `NodeShell.tsx` |
| `nodesShared-nodeHead` | 49 | 10 | — | `NodeShell.tsx` |
| `nodesShared-nodeDot` | 64 | 4 | — | `NodeShell.tsx` |
| `nodesShared-nodeTitle` | 86 | 6 | — | `NodeShell.tsx` |
| `nodesShared-gvLabel` | 96 | 4 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-nodeHeadMid` | 104 | 4 | — | `NodeShell.tsx` |
| `nodesShared-nodeHeadActions` | 112 | 5 | — | `NodeShell.tsx` |
| `nodesShared-nodeTitleRight` | 121 | 7 | — | `NodeShell.tsx` |
| `nodesShared-nodeBody` | 131 | 8 | — | `NodeShell.tsx` |
| `nodesShared-textEdit` | 151 | 13 | — | `TextNode.tsx` |
| `nodesShared-thumb` | 177 | 0 | `thumbImg` | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvStage` | 189 | 4 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvWaiting` | 203 | 6 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvwDots` | 212 | 2 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvwText` | 227 | 2 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvPreviewEmpty` | 233 | 8 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvPreviewTitle` | 244 | 0 | `sectionTitle` | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvPreviewSub` | 248 | 2 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvMediaFallback` | 253 | 5 | — | `GenVideoNode.tsx` |
| `nodesShared-gvPlay` | 272 | 12 | — | `GenVideoNode.tsx` |
| `nodesShared-gvPlayPlaying` | 293 | 1 | — | `GenVideoNode.tsx` |
| `nodesShared-gvDurBadge` | 301 | 8 | — | `GenVideoNode.tsx` |
| `nodesShared-gvDurReal` | 317 | 1 | — | `GenVideoNode.tsx` |
| `nodesShared-gvDl` | 322 | 11 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvTl` | 337 | 4 | — | `GenVideoNode.tsx` |
| `nodesShared-gvTlTrack` | 345 | 5 | — | `GenVideoNode.tsx` |
| `nodesShared-gvTlFill` | 354 | 6 | — | `GenVideoNode.tsx` |
| `nodesShared-gvTlKnob` | 363 | 8 | — | `GenVideoNode.tsx` |
| `nodesShared-gvMeta` | 382 | 3 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvDur` | 388 | 1 | — | `GenVideoNode.tsx` |
| `nodesShared-gvApijob` | 400 | 3 | — | `GenVideoNode.tsx` |
| `nodesShared-gvApijobFailed` | 407 | 1 | — | `GenVideoNode.tsx` |
| `nodesShared-gvApijobCancelled` | 412 | 1 | — | `GenVideoNode.tsx` |
| `nodesShared-igChipStatus` | 417 | 7 | — | `GenImageNode.tsx` |
| `nodesShared-gvFrameActions` | 432 | 4 | — | `GenVideoNode.tsx` |
| `nodesShared-gvFrameBtn` | 439 | 0 | `btn` `btnSm` `btnGhost` | `GenVideoNode.tsx` |
| `nodesShared-gvHistBtn` | 450 | 0 | `btn` `btnSm` `btnGhost` | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvHistPop` | 464 | 13 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvHistTitle` | 481 | 0 | `sectionTitleSub` | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvHistItem` | 485 | 9 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvHistItemSel` | 497 | 1 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvHistItemDisabled` | 501 | 2 | — | `GenVideoNode.tsx` |
| `nodesShared-gvHistThumb` | 506 | 9 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvHistThumbEmpty` | 518 | 1 | — | `GenVideoNode.tsx` |
| `nodesShared-gvHistMeta` | 522 | 3 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvHistRow` | 528 | 5 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-gvHistPrompt` | 536 | 5 | — | `GenImageNode.tsx` `GenVideoNode.tsx` |
| `nodesShared-group` | 545 | 5 | — | — |
| `nodesShared-groupLabel` | 556 | 5 | — | — |
| `nodesShared-editWrap` | 568 | 1 | — | `TextNode.tsx` |
| `nodesShared-textToolbar` | 576 | 4 | — | `TextNode.tsx` |
| `nodesShared-atRefBtn` | 584 | 0 | `btn` `btnSm` `btnGhost` | `TextNode.tsx` |
| `nodesShared-matPreviewBar` | 592 | 4 | — | `TextNode.tsx` |
| `nodesShared-matStripHint` | 599 | 2 | — | `TextNode.tsx` |
| `nodesShared-matThumb` | 604 | 7 | — | `TextNode.tsx` |
| `nodesShared-matThumbDragging` | 615 | 1 | — | `TextNode.tsx` |
| `nodesShared-matThumbOver` | 620 | 1 | — | `TextNode.tsx` |
| `nodesShared-matThumbImg` | 624 | 4 | — | `TextNode.tsx` |
| `nodesShared-matThumbPlaceholder` | 631 | 7 | — | `TextNode.tsx` |
| `nodesShared-matThumbGrip` | 641 | 6 | — | `TextNode.tsx` |
| `nodesShared-matCount` | 650 | 2 | — | `TextNode.tsx` |
| `nodesShared-refPreview` | 660 | 5 | — | `TextNode.tsx` |
| `nodesShared-refOk` | 668 | 4 | — | `TextNode.tsx` |
| `nodesShared-refMissing` | 675 | 5 | — | `TextNode.tsx` |
| `nodesShared-accountBody` | 685 | 3 | — | `AccountNode.tsx` |
| `nodesShared-accountTopRow` | 692 | 3 | — | `AccountNode.tsx` |
| `nodesShared-autoSend` | 699 | 3 | — | `AccountNode.tsx` |
| `nodesShared-timerInline` | 715 | 3 | — | `AccountNode.tsx` |
| `nodesShared-timerYellow` | 722 | 1 | — | `AccountNode.tsx` |
| `nodesShared-timerRed` | 726 | 1 | — | `AccountNode.tsx` |
| `nodesShared-accountSummary` | 731 | 2 | — | `AccountNode.tsx` |
| `nodesShared-accountFeedback` | 748 | 5 | — | `AccountNode.tsx` |
| `nodesShared-accountFeedbackMsg` | 756 | 2 | — | `AccountNode.tsx` |
| `nodesShared-accountFeedbackClose` | 762 | 0 | `panelClose` | `AccountNode.tsx` |
| `nodesShared-st_sending` | 766 | 2 | — | — |
| `nodesShared-st_success` | 771 | 2 | — | — |
| `nodesShared-st_error` | 776 | 2 | — | — |
| `nodesShared-accountSend` | 782 | 0 | `btn` `btnPrimary` | `AccountNode.tsx` |
| `nodesShared-textEditor` | 796 | 4 | — | `TextNode.tsx` |
| `nodesShared-groupIcon` | 859 | 2 | — | `GroupNode.tsx` |
| `nodesShared-nodeCount` | 865 | 6 | — | `DownloadNode.tsx` `GroupNode.tsx` |
| `nodesShared-groupUngroup` | 875 | 1 | `btn` `btnSm` | `GroupNode.tsx` |
| `nodesShared-materialImgWrap` | 887 | 5 | — | `MaterialNode.tsx` |
| `nodesShared-materialImg` | 896 | 4 | — | `MaterialNode.tsx` |
| `nodesShared-materialPlaceholder` | 903 | 4 | — | `MaterialNode.tsx` |
| `nodesShared-matFloatBtn` | 913 | 2 | `btn` `btnSm` `btnGhost` | `GenImageNode.tsx` `MaterialNode.tsx` |
| `nodesShared-downloadBody` | 924 | 4 | — | `DownloadNode.tsx` |
| `nodesShared-downloadFolderRow` | 931 | 4 | — | `DownloadNode.tsx` |
| `nodesShared-downloadFolderLabel` | 938 | 2 | — | `DownloadNode.tsx` |
| `nodesShared-downloadFolderPath` | 943 | 6 | — | `DownloadNode.tsx` |
| `nodesShared-downloadBtn` | 952 | 1 | `btn` `btnSm` | `DownloadNode.tsx` |
| `nodesShared-downloadList` | 960 | 5 | — | `DownloadNode.tsx` |
| `nodesShared-downloadItem` | 968 | 4 | — | `DownloadNode.tsx` |
| `nodesShared-downloadItemName` | 975 | 6 | — | `DownloadNode.tsx` |
| `nodesShared-downloadItemStatus` | 984 | 1 | — | `DownloadNode.tsx` |
| `nodesShared-downloadStatusBusy` | 988 | 1 | — | `DownloadNode.tsx` |
| `nodesShared-downloadStatusOk` | 992 | 1 | — | `DownloadNode.tsx` |
| `nodesShared-downloadStatusErr` | 996 | 1 | — | `DownloadNode.tsx` |
| `nodesShared-downloadEmpty` | 1000 | 4 | — | `DownloadNode.tsx` |
| `nodesShared-downloadActionRow` | 1007 | 3 | — | `DownloadNode.tsx` |
| `nodesShared-downloadTotal` | 1013 | 2 | — | `DownloadNode.tsx` |
| `nodesShared-videoMeta` | 1021 | 3 | — | `VideoNode.tsx` |
| `nodesShared-videoProvenance` | 1028 | 5 | — | `VideoNode.tsx` |
| `nodesShared-videoChip` | 1037 | 6 | `btn` `btnSm` | `VideoNode.tsx` |
| `nodesShared-videoNoRecipe` | 1052 | 2 | — | `VideoNode.tsx` |
| `nodesShared-videoFlash` | 1058 | 10 | — | `VideoNode.tsx` |
| `nodesShared-videoBody` | 1071 | 3 | — | `VideoNode.tsx` |
| `nodesShared-videoEl` | 1078 | 5 | — | `VideoNode.tsx` |
| `nodesShared-videoPanel` | 1087 | 4 | — | `VideoNode.tsx` |
| `nodesShared-videoPanelHead` | 1094 | 5 | — | `VideoNode.tsx` |
| `nodesShared-videoPanelClose` | 1103 | 0 | `panelClose` | `VideoNode.tsx` |
| `nodesShared-videoPanelBody` | 1107 | 3 | — | `VideoNode.tsx` |
| `nodesShared-videoPrompt` | 1114 | 6 | — | `VideoNode.tsx` |
| `nodesShared-videoSpecs` | 1124 | 3 | — | `VideoNode.tsx` |
| `nodesShared-videoSpec` | 1130 | 5 | — | `VideoNode.tsx` |
| `nodesShared-videoPanelFoot` | 1139 | 2 | — | `VideoNode.tsx` |
| `nodesShared-videoAct` | 1144 | 1 | `btn` `btnSm` | `VideoNode.tsx` |
| `nodesShared-videoFallback` | 1153 | 4 | — | `VideoNode.tsx` |
| `nodesShared-videoVid` | 1160 | 3 | — | `VideoNode.tsx` |
| `nodesShared-videoAttempt` | 1174 | 7 | — | `VideoNode.tsx` |
| `nodesShared-videoAttemptTime` | 1188 | 4 | — | `VideoNode.tsx` |
| `nodesShared-videoAttemptAcc` | 1195 | 5 | — | `VideoNode.tsx` |
| `nodesShared-videoAttemptStatus` | 1203 | 2 | — | `VideoNode.tsx` |
| `nodesShared-videoAttemptNote` | 1208 | 5 | — | `VideoNode.tsx` |
| `nodesShared-videoAttemptPending` | 1217 | 1 | — | `VideoNode.tsx` |
| `nodesShared-videoAttemptSuccess` | 1221 | 1 | — | `VideoNode.tsx` |
| `nodesShared-videoControls` | 1237 | 5 | — | `VideoNode.tsx` |
| `nodesShared-vtBtn` | 1245 | 9 | — | `VideoNode.tsx` |
| `nodesShared-videoTimeline` | 1258 | 6 | — | `VideoNode.tsx` |
| `nodesShared-vtFill` | 1268 | 6 | — | `VideoNode.tsx` |
| `nodesShared-vtKnob` | 1277 | 8 | — | `VideoNode.tsx` |
| `nodesShared-vtTime` | 1289 | 5 | — | `VideoNode.tsx` |
| `nodesShared-vtShot` | 1298 | 1 | — | `VideoNode.tsx` |
| `nodesShared-faceMarksLayer` | 1310 | 3 | — | `FaceMarksLayer.tsx` |
| `nodesShared-faceMark` | 1330 | 5 | — | `FaceMarksLayer.tsx` |
| `nodesShared-faceMarkMasking` | 1338 | 2 | — | `FaceMarksLayer.tsx` |
| `nodesShared-faceMarkCorner` | 1344 | 4 | — | `FaceMarksLayer.tsx` |
| `nodesShared-faceMarkTl` | 1351 | 4 | — | `FaceMarksLayer.tsx` |
| `nodesShared-faceMarkTr` | 1358 | 4 | — | `FaceMarksLayer.tsx` |
| `nodesShared-faceMarkBl` | 1365 | 4 | — | `FaceMarksLayer.tsx` |
| `nodesShared-faceMarkBr` | 1372 | 4 | — | `FaceMarksLayer.tsx` |
| `nodesShared-faceMarkTip` | 1379 | 9 | — | `FaceMarksLayer.tsx` |
| `nodesShared-splitBtn` | 1397 | 0 | `btn` `btnSm` | `TextNode.tsx` |
| `nodesShared-autoMatchBtn` | 1401 | 0 | `btn` `btnSm` | `TextNode.tsx` |
| `nodesShared-savePresetBtn` | 1405 | 0 | `btn` `btnSm` | `TextNode.tsx` |
| `nodesShared-sendStatus` | 1415 | 5 | — | `TextNode.tsx` |
| `nodesShared-sendStatusSuccess` | 1423 | 1 | — | `TextNode.tsx` |
| `nodesShared-sendStatusError` | 1427 | 1 | — | `TextNode.tsx` |
| `nodesShared-replyNotice` | 1439 | 17 | — | `TextNode.tsx` |
| `nodesShared-replyNoticeError` | 1459 | 3 | — | `TextNode.tsx` |
| `nodesShared-replyNoticeInfo` | 1465 | 3 | — | `TextNode.tsx` |
| `nodesShared-replyNoticeIcon` | 1471 | 3 | — | `TextNode.tsx` |
| `nodesShared-replyNoticeBody` | 1477 | 5 | — | `TextNode.tsx` |
| `nodesShared-replyNoticeTitle` | 1485 | 1 | — | `TextNode.tsx` |
| `nodesShared-replyNoticeText` | 1489 | 3 | — | `TextNode.tsx` |
| `nodesShared-replyNoticeClose` | 1499 | 0 | `panelClose` | `TextNode.tsx` |
| `nodesShared-waitCountdown` | 1509 | 4 | `btn` `btnSm` | `TextNode.tsx` |
| `nodesShared-waitDone` | 1517 | 2 | — | `TextNode.tsx` |
| `nodesShared-switchStatus` | 1528 | 0 | `nodesShared-waitCountdown` | `TextNode.tsx` |
| `nodesShared-switchSwitching` | 1532 | 1 | — | `TextNode.tsx` |
| `nodesShared-switchDone` | 1536 | 1 | — | `TextNode.tsx` |
| `nodesShared-switchFailed` | 1540 | 1 | — | `TextNode.tsx` |

只有变体规则（无基础声明）：`nodesShared-chip-img` · `nodesShared-chip-name` · `nodesShared-faceMarksBadge` · `nodesShared-faceMarksBusy` · `nodesShared-gvHistBtnOpen` · `nodesShared-overflowVisible` · `nodesShared-ref-chip` · `nodesShared-ref-missing` · `nodesShared-sendIcon` · `nodesShared-sendSpinner` · `nodesShared-videoAttemptCancelled` · `nodesShared-videoAttemptFailed`

## src/ui/pages

### `src/ui/pages/ActivatePage.module.css` — 前缀 `ActivatePage-` · 24 类

消费者：`src/ui/pages/ActivatePage.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `ActivatePage-screen` | 6 | 6 | — | `ActivatePage.tsx` |
| `ActivatePage-card` | 15 | 4 | `panel` | `ActivatePage.tsx` |
| `ActivatePage-top` | 23 | 3 | — | `ActivatePage.tsx` |
| `ActivatePage-brand` | 30 | 2 | — | `ActivatePage.tsx` |
| `ActivatePage-sub` | 36 | 2 | — | `ActivatePage.tsx` |
| `ActivatePage-banner` | 42 | 4 | — | `ActivatePage.tsx` |
| `ActivatePage-ok` | 49 | 2 | — | `ActivatePage.tsx` |
| `ActivatePage-warn` | 54 | 2 | — | `ActivatePage.tsx` |
| `ActivatePage-err` | 59 | 2 | — | `ActivatePage.tsx` |
| `ActivatePage-icon` | 64 | 1 | — | `ActivatePage.tsx` |
| `ActivatePage-bTitle` | 68 | 1 | — | `ActivatePage.tsx` |
| `ActivatePage-bDesc` | 72 | 3 | — | `ActivatePage.tsx` |
| `ActivatePage-recheck` | 79 | 0 | `btn` `btnSm` | `ActivatePage.tsx` |
| `ActivatePage-section` | 87 | 3 | — | `ActivatePage.tsx` |
| `ActivatePage-label` | 94 | 2 | — | `ActivatePage.tsx` |
| `ActivatePage-codeBox` | 100 | 6 | — | `ActivatePage.tsx` |
| `ActivatePage-codeText` | 109 | 3 | — | `ActivatePage.tsx` |
| `ActivatePage-codeActions` | 115 | 2 | — | `ActivatePage.tsx` |
| `ActivatePage-sm` | 120 | 0 | `btn` `btnSm` | `ActivatePage.tsx` |
| `ActivatePage-hint` | 135 | 3 | — | `ActivatePage.tsx` |
| `ActivatePage-input` | 142 | 2 | `field` `textarea` | `ActivatePage.tsx` |
| `ActivatePage-primary` | 150 | 0 | `btn` `btnPrimary` | `ActivatePage.tsx` |
| `ActivatePage-msg` | 160 | 1 | — | `ActivatePage.tsx` |
| `ActivatePage-foot` | 165 | 3 | — | `ActivatePage.tsx` |

只有变体规则（无基础声明）：`ActivatePage-ghost`

### `src/ui/pages/StartPage.module.css` — 前缀 `StartPage-` · 13 类

消费者：`src/ui/pages/StartPage.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `StartPage-page` | 9 | 6 | — | `StartPage.tsx` |
| `StartPage-brand` | 18 | 1 | — | `StartPage.tsx` |
| `StartPage-brandName` | 19 | 2 | — | `StartPage.tsx` |
| `StartPage-brandTagline` | 20 | 2 | — | `StartPage.tsx` |
| `StartPage-history` | 22 | 4 | — | `StartPage.tsx` |
| `StartPage-historyLabel` | 28 | 2 | — | `StartPage.tsx` |
| `StartPage-projectItem` | 31 | 7 | — | `StartPage.tsx` |
| `StartPage-projectMain` | 43 | 12 | — | `StartPage.tsx` |
| `StartPage-projectMeta` | 57 | 2 | — | `StartPage.tsx` |
| `StartPage-projectInput` | 64 | 2 | `field` | `StartPage.tsx` |
| `StartPage-projectDelete` | 71 | 0 | `libIcon` `libIconDel` | `StartPage.tsx` |
| `StartPage-newProject` | 76 | 0 | `btn` `btnPrimary` | `StartPage.tsx` |
| `StartPage-importProject` | 81 | 0 | `btn` `btnGhost` | `StartPage.tsx` |

## src/ui/panels

### `src/ui/panels/AccountPanel.module.css` — 前缀 `AccountPanel-` · 30 类

消费者：`src/ui/panels/AccountPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `AccountPanel-column` | 7 | 6 | — | `AccountPanel.tsx` |
| `AccountPanel-deselectBtn` | 17 | 0 | `btn` `btnSm` `btnGhost` | `AccountPanel.tsx` |
| `AccountPanel-moveCount` | 22 | 3 | — | `AccountPanel.tsx` |
| `AccountPanel-addBtn` | 30 | 0 | `btn` `btnPrimary` `btnBlock` | `AccountPanel.tsx` |
| `AccountPanel-toolRow` | 35 | 3 | — | `AccountPanel.tsx` |
| `AccountPanel-toolBtn` | 41 | 1 | `btn` `btnSm` `btnGhost` | `AccountPanel.tsx` |
| `AccountPanel-toolMsg` | 46 | 2 | — | `AccountPanel.tsx` |
| `AccountPanel-fpHealth` | 52 | 0 | `btn` `btnSm` `btnBlock` | `AccountPanel.tsx` |
| `AccountPanel-fpHealthCrit` | 56 | 3 | — | `AccountPanel.tsx` |
| `AccountPanel-fpHealthWarn` | 62 | 2 | — | `AccountPanel.tsx` |
| `AccountPanel-fpHealthOk` | 67 | 2 | — | `AccountPanel.tsx` |
| `AccountPanel-empty` | 73 | 0 | `empty` `isInline` | `AccountPanel.tsx` |
| `AccountPanel-list` | 77 | 6 | — | `AccountPanel.tsx` |
| `AccountPanel-row` | 86 | 3 | — | `AccountPanel.tsx` |
| `AccountPanel-rowActive` | 92 | 2 | — | `AccountPanel.tsx` |
| `AccountPanel-rowMain` | 97 | 11 | — | `AccountPanel.tsx` |
| `AccountPanel-avatar` | 116 | 12 | — | `AccountPanel.tsx` |
| `AccountPanel-metaCol` | 132 | 5 | — | `AccountPanel.tsx` |
| `AccountPanel-name` | 140 | 4 | — | `AccountPanel.tsx` |
| `AccountPanel-meta` | 147 | 6 | — | `AccountPanel.tsx` |
| `AccountPanel-rowBtn` | 157 | 3 | `btn` `btnSm` | `AccountPanel.tsx` |
| `AccountPanel-iconBtn` | 165 | 0 | `libIcon` | `AccountPanel.tsx` |
| `AccountPanel-iconDel` | 170 | 0 | `libIconDel` | `AccountPanel.tsx` |
| `AccountPanel-foot` | 176 | 6 | — | `AccountPanel.tsx` |
| `AccountPanel-snapToggle` | 185 | 6 | — | `AccountPanel.tsx` |
| `AccountPanel-footBtn` | 199 | 0 | `btn` `btnSm` `btnGhost` `btnBlock` | `AccountPanel.tsx` |
| `AccountPanel-footDanger` | 203 | 0 | `btn` `btnSm` `btnDanger` `btnBlock` | `AccountPanel.tsx` |
| `AccountPanel-autoStartSwitch` | 212 | 10 | — | `AccountPanel.tsx` |
| `AccountPanel-autoStartOn` | 225 | 1 | — | `AccountPanel.tsx` |
| `AccountPanel-autoStartKnob` | 229 | 8 | — | `AccountPanel.tsx` |

### `src/ui/panels/AccountTypePicker.module.css` — 前缀 `AccountTypePicker-` · 5 类

消费者：`src/ui/panels/AccountTypePicker.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `AccountTypePicker-body` | 10 | 3 | — | `AccountTypePicker.tsx` |
| `AccountTypePicker-card` | 17 | 10 | — | `AccountTypePicker.tsx` |
| `AccountTypePicker-emoji` | 35 | 2 | — | `AccountTypePicker.tsx` |
| `AccountTypePicker-name` | 40 | 3 | — | `AccountTypePicker.tsx` |
| `AccountTypePicker-desc` | 46 | 2 | — | `AccountTypePicker.tsx` |

### `src/ui/panels/ApiSettings.module.css` — 前缀 `ApiSettings-` · 20 类

消费者：`src/ui/panels/ApiSettings.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `ApiSettings-panel` | 18 | 2 | — | `ApiSettings.tsx` |
| `ApiSettings-sub` | 25 | 4 | — | `ApiSettings.tsx` |
| `ApiSettings-sectionTitle` | 33 | 1 | `sectionTitle` | `ApiSettings.tsx` |
| `ApiSettings-channelConfig` | 44 | 5 | — | `ApiSettings.tsx` |
| `ApiSettings-row` | 53 | 4 | — | `ApiSettings.tsx` |
| `ApiSettings-rowLabel` | 61 | 3 | — | `ApiSettings.tsx` |
| `ApiSettings-input` | 69 | 2 | `field` | `ApiSettings.tsx` |
| `ApiSettings-usage` | 76 | 3 | — | `ApiSettings.tsx` |
| `ApiSettings-empty` | 83 | 0 | `empty` `isInline` | `ApiSettings.tsx` |
| `ApiSettings-card` | 93 | 5 | — | `ApiSettings.tsx` |
| `ApiSettings-cardHead` | 103 | 4 | — | `ApiSettings.tsx` |
| `ApiSettings-enable` | 111 | 4 | — | `ApiSettings.tsx` |
| `ApiSettings-caps` | 119 | 3 | — | `ApiSettings.tsx` |
| `ApiSettings-keyRow` | 126 | 5 | — | `ApiSettings.tsx` |
| `ApiSettings-keyHint` | 136 | 7 | — | `ApiSettings.tsx` |
| `ApiSettings-cardFoot` | 147 | 4 | — | `ApiSettings.tsx` |
| `ApiSettings-saveBtn` | 154 | 0 | `btn` `btnSm` `btnPrimary` | `ApiSettings.tsx` |
| `ApiSettings-testBtn` | 158 | 0 | `btn` `btnSm` | `ApiSettings.tsx` |
| `ApiSettings-testOk` | 163 | 2 | — | `ApiSettings.tsx` |
| `ApiSettings-testBad` | 168 | 2 | — | `ApiSettings.tsx` |

### `src/ui/panels/BackendView.module.css` — 前缀 `BackendView-` · 30 类

消费者：`src/ui/panels/BackendView.tsx` · `src/ui/panels/LovartSessionBar.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `BackendView-view` | 23 | 9 | — | `BackendView.tsx` |
| `BackendView-viewHidden` | 55 | 2 | — | `BackendView.tsx` |
| `BackendView-webviews` | 74 | 6 | — | `BackendView.tsx` |
| `BackendView-webviewsDropActive` | 93 | 2 | — | `BackendView.tsx` |
| `BackendView-emptyHint` | 99 | 1 | `empty` | `BackendView.tsx` |
| `BackendView-silentOverlay` | 110 | 8 | — | `BackendView.tsx` |
| `BackendView-silentMask` | 122 | 0 | `scrim` | `BackendView.tsx` |
| `BackendView-silentSnap` | 130 | 7 | — | `BackendView.tsx` |
| `BackendView-silentCenter` | 140 | 5 | — | `BackendView.tsx` |
| `BackendView-silentResume` | 149 | 2 | `btn` `btnIcon` | `BackendView.tsx` |
| `BackendView-silentPauseIcon` | 155 | 3 | — | `BackendView.tsx` |
| `BackendView-silentTip` | 169 | 2 | — | `BackendView.tsx` |
| `BackendView-webview` | 192 | 9 | — | `BackendView.tsx` |
| `BackendView-webviewActive` | 204 | 3 | — | `BackendView.tsx` |
| `BackendView-head` | 215 | 2 | — | `BackendView.tsx` |
| `BackendView-headClip` | 220 | 2 | — | `BackendView.tsx` |
| `BackendView-headInner` | 226 | 8 | — | `BackendView.tsx` |
| `BackendView-headTitle` | 238 | 9 | — | `BackendView.tsx` |
| `BackendView-actions` | 251 | 4 | — | `BackendView.tsx` |
| `BackendView-headBtn` | 260 | 0 | `btn` `btnSm` | `BackendView.tsx` |
| `BackendView-headBtnPrimary` | 264 | 0 | `btn` `btnSm` `btnPrimary` | `BackendView.tsx` |
| `BackendView-headToggle` | 269 | 6 | `btn` `btnSm` `btnGhost` | `BackendView.tsx` |
| `BackendView-sessionClip` | 285 | 7 | — | `LovartSessionBar.tsx` |
| `BackendView-sessionBar` | 299 | 7 | — | `LovartSessionBar.tsx` |
| `BackendView-sessionHint` | 309 | 4 | — | `LovartSessionBar.tsx` |
| `BackendView-sessionActions` | 316 | 4 | — | `LovartSessionBar.tsx` |
| `BackendView-sessionBtn` | 324 | 0 | `btn` `btnSm` | `LovartSessionBar.tsx` |
| `BackendView-sessionBtnPrimary` | 328 | 0 | `btn` `btnSm` `btnPrimary` | `LovartSessionBar.tsx` |
| `BackendView-sessionStatus` | 333 | 2 | — | `LovartSessionBar.tsx` |
| `BackendView-sessionErr` | 338 | 1 | — | `LovartSessionBar.tsx` |

### `src/ui/panels/BatchSendPanel.module.css` — 前缀 `BatchSendPanel-` · 15 类

消费者：`src/ui/panels/BatchSendPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `BatchSendPanel-triggerGroup` | 9 | 5 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-trigger` | 18 | 3 | `btn` `btnPrimary` | `BatchSendPanel.tsx` |
| `BatchSendPanel-card` | 30 | 3 | `panel` | `BatchSendPanel.tsx` |
| `BatchSendPanel-continue` | 40 | 0 | `btn` `btnPrimary` | `BatchSendPanel.tsx` |
| `BatchSendPanel-abort` | 43 | 3 | `btn` | `BatchSendPanel.tsx` |
| `BatchSendPanel-list` | 55 | 5 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-idx` | 65 | 2 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-name` | 70 | 5 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-msg` | 79 | 7 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-decision` | 108 | 7 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-decisionMsg` | 118 | 2 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-decisionActions` | 123 | 3 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-hint` | 129 | 2 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-summary` | 135 | 3 | — | `BatchSendPanel.tsx` |
| `BatchSendPanel-note` | 141 | 2 | — | `BatchSendPanel.tsx` |

只有变体规则（无基础声明）：`BatchSendPanel-chip` · `BatchSendPanel-st_error` · `BatchSendPanel-st_sending` · `BatchSendPanel-st_success`

### `src/ui/panels/ExportAccountsModal.module.css` — 前缀 `ExportAccountsModal-` · 7 类

消费者：`src/ui/panels/ExportAccountsModal.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `ExportAccountsModal-status` | 7 | 4 | — | `ExportAccountsModal.tsx` |
| `ExportAccountsModal-empty` | 14 | 0 | `empty` `isInline` | `ExportAccountsModal.tsx` |
| `ExportAccountsModal-list` | 18 | 8 | — | `ExportAccountsModal.tsx` |
| `ExportAccountsModal-row` | 29 | 0 | `listItem` `listItemClickable` | `ExportAccountsModal.tsx` |
| `ExportAccountsModal-name` | 35 | 4 | — | `ExportAccountsModal.tsx` |
| `ExportAccountsModal-btnGhost` | 42 | 0 | `btn` `btnSm` `btnGhost` | `ExportAccountsModal.tsx` |
| `ExportAccountsModal-btnPrimary` | 46 | 0 | `btn` `btnSm` `btnPrimary` | `ExportAccountsModal.tsx` |

### `src/ui/panels/FaceMaskPanel.module.css` — 前缀 `FaceMaskPanel-` · 11 类

消费者：`src/ui/panels/FaceMaskPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `FaceMaskPanel-panel` | 9 | 5 | `panel` | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-body` | 22 | 3 | `panelBody` | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-label` | 30 | 1 | — | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-effects` | 34 | 3 | — | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-effect` | 40 | 7 | — | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-effectActive` | 50 | 3 | — | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-hint` | 56 | 2 | — | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-row` | 61 | 3 | — | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-val` | 67 | 2 | — | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-range` | 72 | 1 | — | `FaceMaskPanel.tsx` |
| `FaceMaskPanel-foot` | 76 | 3 | — | `FaceMaskPanel.tsx` |

### `src/ui/panels/FingerprintScanPanel.module.css` — 前缀 `FingerprintScanPanel-` · 15 类

消费者：`src/ui/panels/FingerprintScanPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `FingerprintScanPanel-panel` | 10 | 3 | `panel` | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-body` | 18 | 4 | `panelBody` | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-report` | 28 | 7 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-pairs` | 38 | 3 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-dims` | 44 | 5 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-dim` | 52 | 2 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-critical` | 57 | 2 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-warn` | 62 | 2 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-ok` | 67 | 1 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-history` | 71 | 5 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-historyTitle` | 79 | 1 | `sectionTitleSub` | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-historyRow` | 84 | 3 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-historyAge` | 90 | 2 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-historyMeta` | 95 | 6 | — | `FingerprintScanPanel.tsx` |
| `FingerprintScanPanel-historyCounts` | 104 | 3 | — | `FingerprintScanPanel.tsx` |

### `src/ui/panels/GalleryCard.module.css` — 前缀 `GalleryCard-` · 9 类

消费者：`src/ui/panels/GalleryCard.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `GalleryCard-card` | 7 | 5 | — | `GalleryCard.tsx` |
| `GalleryCard-check` | 22 | 12 | — | `GalleryCard.tsx` |
| `GalleryCard-bigBadge` | 38 | 8 | — | `GalleryCard.tsx` |
| `GalleryCard-thumbWrap` | 49 | 6 | — | `GalleryCard.tsx` |
| `GalleryCard-thumb` | 58 | 4 | — | `GalleryCard.tsx` |
| `GalleryCard-remove` | 65 | 3 | `btn` `btnSm` `btnDanger` | `GalleryCard.tsx` |
| `GalleryCard-previewBtn` | 73 | 5 | `btn` `btnSm` | `GalleryCard.tsx` |
| `GalleryCard-name` | 82 | 4 | — | `GalleryCard.tsx` |
| `GalleryCard-meta` | 89 | 4 | — | `GalleryCard.tsx` |

只有变体规则（无基础声明）：`GalleryCard-cardSelected`

### `src/ui/panels/GalleryLightbox.module.css` — 前缀 `GalleryLightbox-` · 6 类

消费者：`src/ui/panels/GalleryLightbox.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `GalleryLightbox-meta` | 9 | 3 | — | `GalleryLightbox.tsx` |
| `GalleryLightbox-stage` | 16 | 3 | — | `GalleryLightbox.tsx` |
| `GalleryLightbox-img` | 22 | 5 | — | `GalleryLightbox.tsx` |
| `GalleryLightbox-nav` | 30 | 1 | `btn` `btnIcon` `btnGhost` | `GalleryLightbox.tsx` |
| `GalleryLightbox-btn` | 35 | 0 | `btn` `btnSm` | `GalleryLightbox.tsx` |
| `GalleryLightbox-btnGhost` | 39 | 0 | `btn` `btnSm` `btnGhost` | `GalleryLightbox.tsx` |

### `src/ui/panels/GalleryPanel.module.css` — 前缀 `GalleryPanel-` · 14 类

消费者：`src/ui/panels/GalleryPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `GalleryPanel-panel` | 12 | 4 | `panel` | `GalleryPanel.tsx` |
| `GalleryPanel-sub` | 23 | 7 | — | `GalleryPanel.tsx` |
| `GalleryPanel-actions` | 33 | 4 | — | `GalleryPanel.tsx` |
| `GalleryPanel-ghost` | 42 | 1 | — | `GalleryPanel.tsx` |
| `GalleryPanel-sep` | 51 | 3 | — | `GalleryPanel.tsx` |
| `GalleryPanel-grid` | 58 | 3 | — | `GalleryPanel.tsx` |
| `GalleryPanel-more` | 65 | 3 | — | `GalleryPanel.tsx` |
| `GalleryPanel-footHint` | 79 | 4 | — | `GalleryPanel.tsx` |
| `GalleryPanel-btnPrimary` | 87 | 0 | `btn` `btnSm` `btnPrimary` | `GalleryPanel.tsx` |
| `GalleryPanel-btnGhost` | 91 | 0 | `btn` `btnSm` `btnGhost` | `GalleryPanel.tsx` |
| `GalleryPanel-emptyIcon` | 97 | 1 | — | `GalleryPanel.tsx` |
| `GalleryPanel-emptyTitle` | 103 | 1 | — | `GalleryPanel.tsx` |
| `GalleryPanel-emptyDesc` | 107 | 3 | — | `GalleryPanel.tsx` |
| `GalleryPanel-count` | 114 | 2 | — | `GalleryPanel.tsx` |

只有变体规则（无基础声明）：`GalleryPanel-danger`

### `src/ui/panels/GenPanel.module.css` — 前缀 `GenPanel-` · 24 类

消费者：`src/ui/panels/GenPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `GenPanel-layer` | 10 | 3 | — | `GenPanel.tsx` |
| `GenPanel-panel` | 23 | 3 | `panel` | `GenPanel.tsx` |
| `GenPanel-body` | 34 | 3 | — | `GenPanel.tsx` |
| `GenPanel-autoMatch` | 41 | 1 | `btn` `btnSm` `btnGhost` | `GenPanel.tsx` |
| `GenPanel-meta` | 47 | 8 | — | `GenPanel.tsx` |
| `GenPanel-promptWrap` | 59 | 1 | — | `GenPanel.tsx` |
| `GenPanel-promptEditor` | 67 | 16 | — | `GenPanel.tsx` |
| `GenPanel-toolbar` | 126 | 4 | — | `GenPanel.tsx` |
| `GenPanel-grow` | 134 | 1 | — | `GenPanel.tsx` |
| `GenPanel-atBtn` | 139 | 1 | `btn` `btnSm` `btnGhost` | `GenPanel.tsx` |
| `GenPanel-sep` | 145 | 4 | — | `GenPanel.tsx` |
| `GenPanel-toolBtn` | 153 | 0 | `btn` `btnSm` `btnGhost` | `GenPanel.tsx` |
| `GenPanel-dropdown` | 158 | 3 | — | `GenPanel.tsx` |
| `GenPanel-select` | 176 | 2 | `btn` `btnSm` | `GenPanel.tsx` |
| `GenPanel-caret` | 183 | 7 | — | `GenPanel.tsx` |
| `GenPanel-count` | 194 | 2 | `field` | `GenPanel.tsx` |
| `GenPanel-styleChip` | 201 | 5 | — | `GenPanel.tsx` |
| `GenPanel-styleChipMain` | 209 | 10 | — | `GenPanel.tsx` |
| `GenPanel-styleChipGlyph` | 222 | 1 | — | `GenPanel.tsx` |
| `GenPanel-styleChipX` | 226 | 6 | — | `GenPanel.tsx` |
| `GenPanel-run` | 240 | 1 | `btn` `btnPrimary` `btnSm` | `GenPanel.tsx` |
| `GenPanel-batch` | 249 | 1 | `btn` `btnSm` `btnGhost` | `GenPanel.tsx` |
| `GenPanel-resize` | 255 | 8 | — | `GenPanel.tsx` |
| `GenPanel-resizeGrip` | 270 | 4 | — | `GenPanel.tsx` |

只有变体规则（无基础声明）：`GenPanel-chip-img` · `GenPanel-chip-name` · `GenPanel-ref-chip` · `GenPanel-resizing`

### `src/ui/panels/GroupManagerModal.module.css` — 前缀 `GroupManagerModal-` · 18 类

消费者：`src/ui/panels/GroupManagerModal.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `GroupManagerModal-newRow` | 7 | 3 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-input` | 13 | 2 | `field` | `GroupManagerModal.tsx` |
| `GroupManagerModal-primaryBtn` | 19 | 0 | `btn` `btnSm` `btnPrimary` | `GroupManagerModal.tsx` |
| `GroupManagerModal-empty` | 23 | 0 | `empty` `isInline` | `GroupManagerModal.tsx` |
| `GroupManagerModal-list` | 27 | 6 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-groupRow` | 36 | 4 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-colorDot` | 43 | 6 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-colorDotNone` | 56 | 2 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-name` | 61 | 6 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-count` | 70 | 3 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-autoBtn` | 76 | 0 | `btn` `btnSm` `btnGhost` | `GroupManagerModal.tsx` |
| `GroupManagerModal-delBtn` | 84 | 1 | `btn` `btnIcon` `btnGhost` | `GroupManagerModal.tsx` |
| `GroupManagerModal-palette` | 89 | 7 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-swatch` | 99 | 5 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-noColor` | 111 | 0 | `btn` `btnSm` `btnGhost` | `GroupManagerModal.tsx` |
| `GroupManagerModal-sectionTitle` | 115 | 1 | `sectionTitleSub` | `GroupManagerModal.tsx` |
| `GroupManagerModal-accountRow` | 121 | 4 | — | `GroupManagerModal.tsx` |
| `GroupManagerModal-select` | 128 | 2 | `field` | `GroupManagerModal.tsx` |

### `src/ui/panels/ImageEditor.module.css` — 前缀 `ImageEditor-` · 52 类

消费者：`src/ui/panels/ImageEditor.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `ImageEditor-panel` | 14 | 6 | `panel` | `ImageEditor.tsx` |
| `ImageEditor-body` | 26 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-titleSub` | 35 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-tabs` | 40 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-tab` | 45 | 7 | — | `ImageEditor.tsx` |
| `ImageEditor-tabActive` | 55 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-toolbar` | 61 | 6 | — | `ImageEditor.tsx` |
| `ImageEditor-group` | 70 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-groupLabel` | 76 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-seg` | 81 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-segBtn` | 86 | 7 | — | `ImageEditor.tsx` |
| `ImageEditor-segActive` | 96 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-divider` | 102 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-range` | 108 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-rangeVal` | 112 | 4 | — | `ImageEditor.tsx` |
| `ImageEditor-check` | 119 | 5 | — | `ImageEditor.tsx` |
| `ImageEditor-btn` | 127 | 7 | — | `ImageEditor.tsx` |
| `ImageEditor-btnPrimary` | 142 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-count` | 148 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-notice` | 152 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-noticeError` | 158 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-viewport` | 162 | 4 | — | `ImageEditor.tsx` |
| `ImageEditor-cursorBrush` | 169 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-loading` | 173 | 5 | — | `ImageEditor.tsx` |
| `ImageEditor-stage` | 181 | 4 | — | `ImageEditor.tsx` |
| `ImageEditor-canvasWrap` | 188 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-canvas` | 192 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-overlay` | 196 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-facebox` | 201 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-faceboxActive` | 207 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-handle` | 212 | 5 | — | `ImageEditor.tsx` |
| `ImageEditor-handleNw` | 220 | 3 | — | — |
| `ImageEditor-handleN` | 221 | 3 | — | — |
| `ImageEditor-handleNe` | 222 | 3 | — | — |
| `ImageEditor-handleW` | 223 | 3 | — | — |
| `ImageEditor-handleE` | 224 | 3 | — | — |
| `ImageEditor-handleSw` | 225 | 3 | — | — |
| `ImageEditor-handleS` | 226 | 3 | — | — |
| `ImageEditor-handleSe` | 227 | 3 | — | — |
| `ImageEditor-cropShade` | 229 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-shadeTop` | 234 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-shadeBottom` | 235 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-shadeLeft` | 236 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-shadeRight` | 237 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-cropbox` | 239 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-cropGrid` | 245 | 5 | — | `ImageEditor.tsx` |
| `ImageEditor-hint` | 260 | 2 | — | `ImageEditor.tsx` |
| `ImageEditor-zoom` | 265 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-zoomBtn` | 271 | 8 | — | `ImageEditor.tsx` |
| `ImageEditor-zoomVal` | 282 | 3 | — | `ImageEditor.tsx` |
| `ImageEditor-zoomFit` | 288 | 1 | — | `ImageEditor.tsx` |
| `ImageEditor-actions` | 292 | 2 | — | `ImageEditor.tsx` |

### `src/ui/panels/LibraryPanel.module.css` — 前缀 `LibraryPanel-` · 15 类

消费者：`src/ui/panels/LibraryPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `LibraryPanel-column` | 7 | 4 | — | `LibraryPanel.tsx` |
| `LibraryPanel-head` | 14 | 1 | `panelHead` | `LibraryPanel.tsx` |
| `LibraryPanel-title` | 20 | 0 | `panelTitle` | `LibraryPanel.tsx` |
| `LibraryPanel-addBtn` | 25 | 0 | `btn` `btnPrimary` `btnSm` | `LibraryPanel.tsx` |
| `LibraryPanel-list` | 36 | 7 | — | `LibraryPanel.tsx` |
| `LibraryPanel-dragOver` | 47 | 1 | — | `LibraryPanel.tsx` |
| `LibraryPanel-dropHint` | 52 | 6 | — | `LibraryPanel.tsx` |
| `LibraryPanel-row` | 62 | 8 | — | `LibraryPanel.tsx` |
| `LibraryPanel-thumb` | 77 | 5 | — | `LibraryPanel.tsx` |
| `LibraryPanel-name` | 86 | 7 | — | `LibraryPanel.tsx` |
| `LibraryPanel-renameInput` | 97 | 5 | `field` | `LibraryPanel.tsx` |
| `LibraryPanel-icon` | 107 | 0 | `libIcon` | `LibraryPanel.tsx` |
| `LibraryPanel-fav` | 112 | 0 | `libIconFav` | `LibraryPanel.tsx` |
| `LibraryPanel-del` | 117 | 0 | `libIconDel` | `LibraryPanel.tsx` |
| `LibraryPanel-tip` | 122 | 6 | — | `LibraryPanel.tsx` |

### `src/ui/panels/LoginModal.module.css` — 前缀 `LoginModal-` · 11 类

消费者：`src/ui/panels/LoginModal.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `LoginModal-panel` | 7 | 4 | `panel` | `LoginModal.tsx` |
| `LoginModal-body` | 16 | 3 | — | `LoginModal.tsx` |
| `LoginModal-verifyRow` | 23 | 3 | — | `LoginModal.tsx` |
| `LoginModal-verifyInput` | 29 | 10 | — | `LoginModal.tsx` |
| `LoginModal-verifyMsg` | 42 | 2 | — | `LoginModal.tsx` |
| `LoginModal-webview` | 48 | 4 | — | `LoginModal.tsx` |
| `LoginModal-loadError` | 56 | 3 | — | `LoginModal.tsx` |
| `LoginModal-loadErrorTitle` | 62 | 3 | — | `LoginModal.tsx` |
| `LoginModal-loadErrorDesc` | 68 | 5 | — | `LoginModal.tsx` |
| `LoginModal-btn` | 77 | 0 | `btn` `btnSm` | `LoginModal.tsx` |
| `LoginModal-btnPrimary` | 81 | 0 | `btn` `btnSm` `btnPrimary` | `LoginModal.tsx` |

### `src/ui/panels/NewImagesPanel.module.css` — 前缀 `NewImagesPanel-` · 36 类

消费者：`src/ui/panels/NewImagesPanel.tsx` · `src/ui/panels/NewImagesThumb.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `NewImagesPanel-wrap` | 13 | 4 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-strip` | 25 | 5 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-title` | 34 | 5 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-count` | 42 | 2 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-agg` | 48 | 3 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-status` | 54 | 5 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-statusDot` | 67 | 1 | `dot` `dotLg` | `NewImagesPanel.tsx` |
| `NewImagesPanel-statusDotBusy` | 73 | 1 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-foldBody` | 78 | 4 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-empty` | 91 | 3 | `empty` `isInline` | `NewImagesPanel.tsx` |
| `NewImagesPanel-thumbs` | 98 | 4 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-thumb` | 105 | 3 | — | `NewImagesThumb.tsx` |
| `NewImagesPanel-thumbBtn` | 112 | 10 | — | `NewImagesThumb.tsx` |
| `NewImagesPanel-thumbCover` | 138 | 4 | — | `NewImagesThumb.tsx` |
| `NewImagesPanel-caption` | 146 | 10 | — | `NewImagesThumb.tsx` |
| `NewImagesPanel-badgeNew` | 164 | 3 | `pill` `pillBrand` | `NewImagesThumb.tsx` |
| `NewImagesPanel-badgeSent` | 171 | 3 | `pill` `pillOk` | `NewImagesThumb.tsx` |
| `NewImagesPanel-badgeBig` | 179 | 5 | `pill` | `NewImagesThumb.tsx` |
| `NewImagesPanel-sourceTag` | 189 | 3 | `pill` | `NewImagesThumb.tsx` |
| `NewImagesPanel-srcLovart` | 196 | 0 | `pillBrand` | `NewImagesThumb.tsx` |
| `NewImagesPanel-srcTapnow` | 200 | 0 | `pillWarn` | `NewImagesThumb.tsx` |
| `NewImagesPanel-thumbDel` | 209 | 3 | `btn` `btnSm` `btnDanger` | `NewImagesThumb.tsx` |
| `NewImagesPanel-thumbMeta` | 216 | 5 | — | `NewImagesThumb.tsx` |
| `NewImagesPanel-right` | 224 | 3 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-rightCol` | 230 | 3 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-onlyCurrent` | 237 | 0 | `btn` `btnSm` `btnGhost` | `NewImagesPanel.tsx` |
| `NewImagesPanel-onlyCurrentOn` | 241 | 2 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-fetch` | 246 | 0 | `btn` `btnSm` | `NewImagesPanel.tsx` |
| `NewImagesPanel-auto` | 250 | 0 | `btn` `btnSm` `btnGhost` | `NewImagesPanel.tsx` |
| `NewImagesPanel-autoDot` | 258 | 1 | `dot` | `NewImagesPanel.tsx` |
| `NewImagesPanel-autoDotOn` | 263 | 1 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-live` | 271 | 1 | `dot` | `NewImagesPanel.tsx` |
| `NewImagesPanel-foldToggle` | 277 | 1 | `btn` `btnSm` `btnGhost` | `NewImagesPanel.tsx` |
| `NewImagesPanel-ghost` | 290 | 11 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-ghostImg` | 305 | 4 | — | `NewImagesPanel.tsx` |
| `NewImagesPanel-ghostTip` | 312 | 2 | — | `NewImagesPanel.tsx` |

只有变体规则（无基础声明）：`NewImagesPanel-collapsed` · `NewImagesPanel-thumbSent`

### `src/ui/panels/ProxyPoolPanel.module.css` — 前缀 `ProxyPoolPanel-` · 9 类

消费者：`src/ui/panels/ProxyPoolPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `ProxyPoolPanel-tip` | 7 | 4 | — | `ProxyPoolPanel.tsx` |
| `ProxyPoolPanel-input` | 14 | 1 | `field` `textarea` | `ProxyPoolPanel.tsx` |
| `ProxyPoolPanel-status` | 19 | 4 | — | `ProxyPoolPanel.tsx` |
| `ProxyPoolPanel-assignTitle` | 26 | 1 | `sectionTitleSub` | `ProxyPoolPanel.tsx` |
| `ProxyPoolPanel-empty` | 32 | 0 | `empty` `isInline` | `ProxyPoolPanel.tsx` |
| `ProxyPoolPanel-list` | 36 | 6 | — | `ProxyPoolPanel.tsx` |
| `ProxyPoolPanel-row` | 45 | 4 | — | `ProxyPoolPanel.tsx` |
| `ProxyPoolPanel-name` | 52 | 4 | — | `ProxyPoolPanel.tsx` |
| `ProxyPoolPanel-saveBtn` | 66 | 0 | `btn` `btnSm` `btnPrimary` | `ProxyPoolPanel.tsx` |

只有变体规则（无基础声明）：`ProxyPoolPanel-direct` · `ProxyPoolPanel-net`

### `src/ui/panels/SendQueuePanel.module.css` — 前缀 `SendQueuePanel-` · 27 类

消费者：`src/ui/panels/SendQueuePanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `SendQueuePanel-panel` | 7 | 9 | `panel` | `SendQueuePanel.tsx` |
| `SendQueuePanel-dragging` | 22 | 1 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-head` | 27 | 1 | `panelHead` | — |
| `SendQueuePanel-conc` | 33 | 4 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-statusline` | 40 | 1 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-chevron` | 44 | 0 | `btn` `btnIcon` `btnGhost` | `SendQueuePanel.tsx` |
| `SendQueuePanel-list` | 52 | 7 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-item` | 62 | 5 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-itemTop` | 71 | 3 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-idx` | 77 | 4 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-name` | 84 | 5 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-acc` | 92 | 2 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-accPending` | 98 | 1 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-attempt` | 102 | 2 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-note` | 107 | 4 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-acts` | 114 | 2 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-btn` | 120 | 0 | `btn` `btnSm` | `SendQueuePanel.tsx` |
| `SendQueuePanel-genRow` | 125 | 3 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-genLabel` | 131 | 1 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-gen` | 135 | 2 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-gen_generating` | 150 | 1 | — | — |
| `SendQueuePanel-gen_done` | 154 | 1 | — | — |
| `SendQueuePanel-gen_failed` | 158 | 1 | — | — |
| `SendQueuePanel-genWait` | 162 | 1 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-genNote` | 166 | 6 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-foot` | 175 | 5 | — | `SendQueuePanel.tsx` |
| `SendQueuePanel-footHint` | 183 | 6 | — | `SendQueuePanel.tsx` |

只有变体规则（无基础声明）：`SendQueuePanel-gen_idle` · `SendQueuePanel-gen_na` · `SendQueuePanel-gen_queued` · `SendQueuePanel-gen_unknown`

### `src/ui/panels/StyleLibraryModal.module.css` — 前缀 `StyleLibraryModal-` · 30 类

消费者：`src/ui/panels/StyleLibraryModal.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `StyleLibraryModal-tabs` | 10 | 5 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-tab` | 18 | 0 | `btn` `btnSm` `btnGhost` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-tabActive` | 22 | 0 | `btn` `btnSm` `btnPrimary` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-hint` | 26 | 3 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-gridWrap` | 33 | 2 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-grid` | 38 | 3 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-card` | 45 | 2 | `panel` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-cardActive` | 52 | 1 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-cardPick` | 56 | 10 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-cover` | 69 | 7 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-coverGlyph` | 85 | 2 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-check` | 90 | 12 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-name` | 105 | 5 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-cardActions` | 113 | 2 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-mini` | 119 | 1 | `btn` `btnSm` `btnGhost` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-miniDanger` | 124 | 1 | `btn` `btnSm` `btnDanger` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-primary` | 129 | 0 | `btn` `btnSm` `btnPrimary` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-edit` | 134 | 8 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-editHead` | 145 | 4 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-editTitle` | 152 | 5 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-editClose` | 162 | 0 | `panelClose` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-editBody` | 166 | 3 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-editCover` | 172 | 6 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-coverActions` | 187 | 3 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-fileInput` | 193 | 1 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-fieldLabel` | 197 | 3 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-input` | 203 | 1 | `field` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-textarea` | 208 | 1 | `field` `textarea` | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-editFoot` | 213 | 4 | — | `StyleLibraryModal.tsx` |
| `StyleLibraryModal-editFootRight` | 220 | 3 | — | `StyleLibraryModal.tsx` |

### `src/ui/panels/WatermarkPanel.module.css` — 前缀 `WatermarkPanel-` · 13 类

消费者：`src/ui/panels/WatermarkPanel.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `WatermarkPanel-panel` | 7 | 3 | `panel` | `WatermarkPanel.tsx` |
| `WatermarkPanel-body` | 21 | 3 | `panelBody` | `WatermarkPanel.tsx` |
| `WatermarkPanel-item` | 30 | 6 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-thumbWrap` | 39 | 8 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-thumb` | 50 | 3 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-meta` | 56 | 5 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-type` | 64 | 1 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-link` | 68 | 2 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-itemActions` | 73 | 3 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-pathRow` | 81 | 4 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-pathLabel` | 88 | 2 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-pathText` | 93 | 5 | — | `WatermarkPanel.tsx` |
| `WatermarkPanel-pathTag` | 101 | 5 | — | `WatermarkPanel.tsx` |

## src/ui/shell

### `src/ui/shell/AppShell.module.css` — 前缀 `AppShell-` · 25 类

消费者：`src/ui/shell/AppShell.tsx` · `src/ui/shell/TopBar.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `AppShell-app` | 5 | 4 | — | `AppShell.tsx` |
| `AppShell-mainArea` | 12 | 4 | — | `AppShell.tsx` |
| `AppShell-pageRow` | 25 | 3 | — | — |
| `AppShell-pageHidden` | 32 | 1 | — | — |
| `AppShell-pageParked` | 41 | 6 | — | — |
| `AppShell-side` | 55 | 5 | — | — |
| `AppShell-sideRight` | 63 | 3 | — | — |
| `AppShell-sideCollapsed` | 75 | 2 | — | — |
| `AppShell-sideClip` | 81 | 5 | — | — |
| `AppShell-sideToggle` | 93 | 18 | — | — |
| `AppShell-centerStage` | 126 | 5 | — | — |
| `AppShell-canvasPlaceholder` | 138 | 4 | — | — |
| `AppShell-topbar` | 151 | 11 | — | `TopBar.tsx` |
| `AppShell-topbarProjectName` | 166 | 3 | — | `TopBar.tsx` |
| `AppShell-topbarProjectLabel` | 177 | 14 | — | `TopBar.tsx` |
| `AppShell-topbarToggle` | 200 | 3 | `AppShell-topbarProjectLabel` | `TopBar.tsx` |
| `AppShell-topbarIcon` | 211 | 2 | — | `TopBar.tsx` |
| `AppShell-storage` | 221 | 11 | — | `TopBar.tsx` |
| `AppShell-storageMain` | 235 | 12 | — | `TopBar.tsx` |
| `AppShell-storageLabel` | 250 | 4 | — | `TopBar.tsx` |
| `AppShell-storageIcon` | 262 | 6 | — | `TopBar.tsx` |
| `AppShell-storageReveal` | 271 | 11 | — | `TopBar.tsx` |
| `AppShell-sideApiCol` | 289 | 2 | — | — |
| `AppShell-sideApiBtn` | 294 | 5 | `btn` `btnSm` | — |
| `AppShell-sideApiIcon` | 303 | 1 | — | — |

只有变体规则（无基础声明）：`AppShell-storageConfigured`

### `src/ui/shell/ErrorBoundary.module.css` — 前缀 `ErrorBoundary-` · 3 类

消费者：`src/ui/shell/ErrorBoundary.tsx`

| class | 行 | 声明 | composes | 用它的 TSX |
|---|---|---|---|---|
| `ErrorBoundary-fallback` | 9 | 2 | — | `ErrorBoundary.tsx` |
| `ErrorBoundary-title` | 14 | 2 | `panelTitle` | `ErrorBoundary.tsx` |
| `ErrorBoundary-stack` | 21 | 6 | — | `ErrorBoundary.tsx` |

