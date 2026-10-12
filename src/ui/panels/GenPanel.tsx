/**
 * 生成面板（原 `Z3_1.jsx` 文生视频 / `_Component45.jsx` 文生图 —— **两者共用同一套 `.gp-*` 骨架**）
 *
 * 依据：`docs/03-人类版.md` §5 §8 · 参考图 `docs/参考-原版界面/03 · 11`
 *
 * ── 骨架（**逐行对源** `Z3_1.jsx:955-1218`）──
 *   `.gen-panel-layer`（**整屏透明层**，`onMouseDown` = 提交并关闭；**没有暗底遮罩**）
 *     → `.gen-panel`（`position: fixed`，`left/top` 由锚定 effect 写）
 *        → `.gp-head`：标题 · `自动匹配` · `.gp-meta`（已连接 N 个输入 · 账号 · 模型 · 时长）· `✕`
 *        → `.gp-prompt`（`contentEditable`，可拖底部手柄调高）
 *        → `.gp-toolbar`：`@` · 风格 · 比例 · 账号 · 模型 · 时长 ·（撑开）· `生成` · `批量出片` · 拖高手柄
 *
 * ⚠️ **2026-10-12 骨架重做**：此前它是 `PanelShell overlay` 的**居中暗底弹窗** + 五行
 *   「标签 + 控件」竖排表单 —— 与源**两种形态都不是**（源是**无遮罩的锚定面板** + **单行工具条**）。
 *
 * ⚠️ 原则 1：本组件**不写 store**，落值走 `patchNodeData` / `useGen()`
 *
 * ★★ **2026-10-10 三次补齐**（此前都是断链）：
 *   ① **提示词输入**（没有它 ⇒ 生成节点只能发**空提示词**）；
 *   ② **执行账号**（没有它 ⇒ `sendAccount` 恒 `auto`，`jS` 的四个分支用不上）；
 *   ③ **`@` 药丸编辑器**（用 `<textarea>` ⇒ 引用只能显示成 `@图1` 标记原文）。
 *
 * ⚠️ **提示词与文本框是两套 chip 协议**（源版即如此，`richText.ts` 的 `GP_REF_CHIP_CLASS` 有对照表）：
 *    文本框存 `@[id|名]`（带 id 与名字）、**提示词编辑器内部是 `@图N`（只有编号）**。
 *    ⇒ 触发检测与候选浮层复用，渲染/读数各自一套（判据 C1 复用的是**纯层**）。
 *
 * ★★ **2026-10-11 协议更正（清 `TD-03-8` 的根因）**：回源 `Z3_1.jsx` 后确认：
 *   | 位置 | 形态 | 源 |
 *   |---|---|---|
 *   | **节点 `data.text`（落盘）** | **`@[id\|rawName]`** | 提交 = `Zc(N.current, C.current)`（409） |
 *   | 编辑器内部文本 | `@图N` | 读取 = `Ja(data.text, In)`（182） |
 *   | 药丸 DOM | `<span data-n>` | `X3`（42663） |
 */

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useStore as useXyStore } from '@xyflow/react';
import { useGen, useStore } from '@/state';
import {
  AUTO_MATCH_TEXT,
  COMMON_TEXT,
  GEN_IMAGE_TEXT,
  GEN_PANEL_TEXT,
  GEN_VIDEO_TEXT,
  PROJECT_TEXT,
} from '@/constants/text';
import { autoMatchText } from '@/core/rules/autoMatch';
import { resolveApiProviderId } from '@/core/rules/apiProvider';
import { planGenPanelAnchor } from '@/core/rules/panelAnchor';
import { countInputs } from '@/core/rules/linkedMaterials';
import { imageChannelLabel } from '@/core/rules/genImage';
import { nodeAccountLabel } from '@/core/rules/genVideo';
import { normalizeModelLabel } from '@/core/rules/prompt';
import { AccountPicker } from '@/ui/common/AccountPicker';
import { RefAutocomplete, matchRefTrigger } from '@/ui/nodes/RefAutocomplete';
// ⚠️ `Esc` 处理**必须**走 `ui/common`（`原则8/rule-of-three`）
import { useEscapeKey } from '@/ui/common/useEscapeKey';
import { clamp } from '@/lib/math';
// ⚠️ 选项表 / 上下界来自 SSOT，不在 JSX 里内联 —— TD-08-2
import {
  ASPECT_RATIOS,
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_RESOLUTION,
  DEFAULT_VIDEO_DURATION,
  DEFAULT_VIDEO_MODEL,
  IMAGE_COUNT_MAX,
  IMAGE_COUNT_MIN,
  IMAGE_RESOLUTIONS,
  NODE_DEFAULT_RATIO_LABEL,
  PROMPT_EDITOR_HEIGHT,
  VIDEO_DURATION_MAX,
  VIDEO_DURATION_MIN,
  VIDEO_MODEL_OPTIONS,
  VIDEO_RATIO_OPTIONS,
} from '@/constants/models';
import { clampImageCount } from '@/core/rules/prompt';
import { countRefChips, parseRefChips, refsToChipMarks, renumberRefs } from '@/core/rules/refs';
import { gpRefChipHtml, textToGpEditorHtml } from '@/core/rules/richText';
import { gpEditorToText } from '@/lib/editorText';
import { stripHtml } from '@/lib/text';
import type { StylePreset } from '@/constants/stylePresets';
import { StyleLibraryModal } from './StyleLibraryModal';
import styles from './GenPanel.module.css';
import { PanelShell } from '@/ui/common/PanelShell';

/** `@` 候选的触发来源 —— 键盘敲的 `@` 要回删一个字符，按钮打开的不要 */
interface RefTrigger {
  query: string;
  start: number;
  /** `true` = 正文里真的敲了一个 `@`（回删时要连它一起删） */
  typed: boolean;
}

export function GenPanel() {
  // ── ① 全部 hooks（`react-hooks/rules-of-hooks`：**必须**在任何提前 return 之前）──
  const nodes = useStore((s) => s.nodes);
  const edges = useStore((s) => s.edges);
  const library = useStore((s) => s.library);
  const accounts = useStore((s) => s.accounts);
  const groups = useStore((s) => s.groups);
  const apiSetup = useStore((s) => s.apiSetup);
  const apiProvidersMeta = useStore((s) => s.apiProvidersMeta);
  const apiConfigs = useStore((s) => s.apiConfigs);
  /** ★ 风格表（`doubao-styles`）—— 药丸显示风格名、弹窗管理都读它 */
  const styleList = useStore((s) => s.styles);
  const patchNodeData = useStore((s) => s.patchNodeData);
  const pushToast = useStore((s) => s.pushToast);
  /**
   * ★ **2026-10-11**：面板开合由 **`genPanelNodeId` / `imggenPanelNodeId`** 决定
   *   （原 `shared.js:31467,31482`）—— 此前用 `selected` 推导（`docs/14` §4 的登记项）。
   *   ⚠️ 同一时刻源只会开一个；本仓两面板合一 ⇒ 取「先 imggen 后 genvideo」。
   */
  const genPanelNodeId = useStore((s) => s.genPanelNodeId);
  const imggenPanelNodeId = useStore((s) => s.imggenPanelNodeId);
  const closeGeneratePanel = useStore((s) => s.closeGeneratePanel);
  const closeImageGenPanel = useStore((s) => s.closeImageGenPanel);
  /**
   * ★ **画布默认值**（原 `Z3_1.jsx:208-210` / `_Component45.jsx:144-148` 里的 `c` / `$`）——
   *   面板各项的**第二级兜底**（节点没写 ⇒ 用画布默认 ⇒ 再用静态默认）。
   * ⚠️ 此前面板**完全没读它** ⇒ 源的三级兜底在本仓只有两级。
   */
  const canvasDefaults = useStore((s) => s.canvasDefaults);
  const gen = useGen();
  const [busy, setBusy] = useState(false);
  /** 批量出片提交中（防连点；源用 `Y` 的 busy 态，同法） */
  const [batchBusy, setBatchBusy] = useState(false);
  /** 风格库弹窗开合（原 `Z3_1.jsx` 的 `O` / `R(true)`）—— 纯局部态，不入 store */
  const [styleLibOpen, setStyleLibOpen] = useState(false);
  /** 自动匹配按钮的临时态（原 `nt`：`'ok'` / `'none'` / `null`，1.5s 后复位） */
  const [autoMatchState, setAutoMatchState] = useState<'ok' | 'none' | null>(null);
  /**
   * ★ `@` 引用（作者侧）—— 与 `TextNode` **同一套**触发检测与候选浮层。
   * ⚠️ 判据 C1（三振出局）：这是**第 2 处**消费 ⇒ 复用即可；**第 3 处出现时必须抽 hook**。
   * ⚠️ 但两处的**协议不同**（见文件头）⇒ 渲染/读数各自一套。
   */
  const [refTrigger, setRefTrigger] = useState<RefTrigger | null>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  /** 输入法合成中（与 `TextNode` 同法：中文输入法在合成中途也会触发 `onInput`） */
  const composingRef = useRef(false);
  const onEscape = useEscapeKey(refTrigger !== null, () => setRefTrigger(null));

  /** 提示词编辑器的**当前高**（原 `U`，初值 `Or = 104`）—— 拖底部手柄改，双击复位 */
  const [promptH, setPromptH] = useState<number>(PROMPT_EDITOR_HEIGHT.default);
  const [resizing, setResizing] = useState(false);
  const resizeRef = useRef<{ startY: number; startH: number } | null>(null);

  // ── ② 派生值（**不提前 return**，全部可空安全 —— 否则上面的 hooks 会被条件跳过）──
  /** 要开面板的节点 id（源是两个 id；本仓两面板合一 ⇒ 先 imggen 后 genvideo） */
  const panelNodeId = imggenPanelNodeId ?? genPanelNodeId;
  const panelNode = panelNodeId ? nodes.find((n) => n.id === panelNodeId) : undefined;
  const imageNode = panelNode && panelNode.type === 'imggen' ? panelNode : null;
  const videoNode = panelNode && panelNode.type === 'genvideo' ? panelNode : null;
  const genNode = imageNode ?? videoNode;
  /**
   * ★ 视频侧的**时长 / 模型**：同样是**三级兜底**（**逐字对源**）
   *   · 时长：`Z3_1.jsx:209` 的 `tu(q.duration) ? Number(q.duration) : tu(c.duration) ? Number(c.duration) : ES`
   *   · 模型：`Z3_1.jsx:210` 的 `const he = q.model || c.model || 'seedance-2.0-mini'`
   * ⚠️ 与 `ratio` 同一条口径（此前都少了 `canvasDefaults` 那一级）。
   */
  const videoDuration = videoNode?.data.duration || canvasDefaults.duration || DEFAULT_VIDEO_DURATION;
  const videoModel = videoNode?.data.model || canvasDefaults.model || DEFAULT_VIDEO_MODEL;

  /**
   * ★★ **编辑器内部文本 + 引用表 —— 全部由 `data.text` 现算**
   *    （原 `Z3_1.jsx` 的 `N.current` / `C.current`）
   *
   * ⚠️ 它们是**编辑器侧**的形态（`@图N`），**不是** `data.text` 的形态（`@[id|名]`）——
   *    两者的换算见文件头与 `core/rules/refs.ts` 的 `parseRefChips`（`Ja`）/ `refsToChipMarks`（`Zc`）。
   */
  const gpSeed = parseRefChips(stripHtml(genNode?.data.text ?? ''));
  const gpText = gpSeed.text;
  const gpRefs = gpSeed.refs;

  // ── ★ 面板形态（原 `Z3_1.jsx:60-90` / `422-434` / `956-958`，TD-16-89）──
  /** viewport（原 `Tu()` 的 `p/h/m`）—— 订阅 xyflow 的 `transform`，平移/缩放都会重算锚点 */
  const viewport = useXyStore((s) => s.transform);
  const panelRef = useRef<HTMLDivElement>(null);
  /** 最新一次渲染的 `close`（Esc 用 —— 见下，避免每敲一个字重挂监听） */
  const closeRef = useRef<() => void>(() => {});

  // ★ Esc 关闭（原 `422-434`）：面板开着时 `window` 上的 `Escape` ⇒ 提交提示词并关闭。
  //   ⚠️ 不用 `useEscapeKey`：那是**元素级** `onKeyDown`（焦点必须在面板里）；源这里是
  //   **全局** `window` 监听 —— 焦点在画布/别处时按 Esc 也要能关（逐字保留）。
  useEffect(() => {
    if (!genNode) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [genNode]);

  // ★ 锚定定位（原 `60-90`）：跟随节点屏幕矩形、下方放不下**翻到上方**、三重边距夹取。
  //   ⚠️ 数学在纯层 `planGenPanelAnchor`（可单测）；这里只把结果写到 DOM（源也是直写
  //   `G.style.left/top`，不走 React 状态 ⇒ 平移/缩放不触发整树重渲染）。
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el || !genNode) return;
    const anchor = planGenPanelAnchor({
      node: genNode,
      viewport: { x: viewport[0], y: viewport[1], zoom: viewport[2] },
      panel: { offsetWidth: el.offsetWidth, offsetHeight: el.offsetHeight },
      window: { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
    });
    if (anchor) {
      el.style.left = `${anchor.left}px`;
      el.style.top = `${anchor.top}px`;
    }
  }, [genNode, viewport]);

  // ★ 拖底部手柄改提示词框高（原 `1203-1215` 的 `.gp-resize`）
  //   ⚠️ 与源一致：位移相对**起点**；夹取 `RS`（`104..320`）；双击复位 `Or`。
  useEffect(() => {
    if (!resizing) return;
    const move = (e: PointerEvent): void => {
      const r = resizeRef.current;
      if (!r) return;
      setPromptH(clamp(r.startH + (e.clientY - r.startY), PROMPT_EDITOR_HEIGHT.min, PROMPT_EDITOR_HEIGHT.max));
    };
    const up = (): void => {
      setResizing(false);
      resizeRef.current = null;
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
    };
  }, [resizing]);

  const nodeId = genNode?.id ?? '';
  /**
   * ★★ **三级兜底**（**逐字对源**）：
   *   · 视频：`Z3_1.jsx:208` 的 `const ce = q.aspectRatio || c.ratio || '16:9'`
   *   · 文生图：`_Component45.jsx:145` 的 `Ne && Ne.aspectRatio || $.aspectRatio || '1:1'`
   * ⚠️ **2026-10-12 补齐中间那级**：此前只写 `data.aspectRatio ?? ''` ——
   *   ① 少了 `canvasDefaults.ratio` 这一级；② 空值会让 `<select>` 落成**空白**（没有匹配的 option）。
   * ⚠️ 末级不再复述源的字面量，吃真源 `NODE_DEFAULT_RATIO_LABEL`（现 `'4:3'`）。
   */
  const ratio = genNode?.data.aspectRatio || canvasDefaults.ratio || NODE_DEFAULT_RATIO_LABEL;
  const hasResult = !!genNode?.data.resultUrl;
  /** 执行账号（原 `_Component45.jsx` 的 `ut`/`I`）；`channel` 缺省 `'doubao'`（源 `I` 的初值；`generate.ts:105` 同判） */
  const sendAccount = genNode?.data.sendAccount ?? 'auto';
  const channel = genNode?.data.channel ?? 'doubao';
  /**
   * ★ 风格（原 `Z3_1.jsx` 的 `De` / `kt`）—— **单选**：`styleIds` 实际只会是 `[]` 或 `[id]`
   *   （原 `T`：命中就清空、否则**覆盖**成 `[G]`）。
   * ⚠️ 找不到对应风格的 id ⇒ 不进 `styleChips`（源 `kt` 也是先解析名字、解析不到就不渲染药丸）。
   */
  const styleIds = genNode?.data.styleIds ?? [];
  const styleChips = styleIds
    .map((id) => styleList.find((s) => s.id === id))
    .filter((s): s is StylePreset => !!s);
  // 「API 是否已配置」与 `state/generate.ts:72` 判的是**同一个条件**（不另立标准）
  const apiReady = !!(apiSetup.imageProviderId || apiSetup.videoProviderId);
  /**
   * ★ 视频 provider（原 `Z3_1.jsx:775-780` 的 `He`）—— 走**同一份纯规则**
   *   （判据 C1：`state/generate.ts` 与这里都用 `resolveApiProviderId`，不是两份）。
   *   批量出片按钮**只在解析出 provider 时**渲染（源 `1200` 的 `Je === 'api' && He`）。
   */
  const videoProviderId = videoNode
    ? resolveApiProviderId('video', apiProvidersMeta, apiConfigs, apiSetup)
    : null;
  const videoProviderName = videoProviderId
    ? (apiProvidersMeta.find((p) => p.id === videoProviderId)?.name ?? '')
    : '';

  /** `gv-meta` 首项：已连接 N 个输入（原 `ne.length`，`Z3_1.jsx:966`） */
  const inputCount = useMemo(
    () => (genNode ? countInputs(nodes, edges, genNode.id) : 0),
    [nodes, edges, genNode],
  );

  /**
   * `.gp-meta`（原 `Z3_1.jsx:965-968`）
   * 文生视频：`已连接 N 个输入 · {账号} · {模型全名} · {时长}s`（有引用再加 ` · N 张参考`）
   * 文生图（原 `ZL.jsx:960-962`）：`已连接 N 个输入 · {频道} · {比例}`（有出图再加 ` · 已出 N 张`）
   */
  const metaText = useMemo(() => {
    if (!genNode) return '';
    if (videoNode) {
      const parts = [
        GEN_VIDEO_TEXT.metaInputs(inputCount),
        nodeAccountLabel({ sendAccount: videoNode.data.sendAccount, accounts, groups }),
        normalizeModelLabel(videoModel),
        `${videoDuration}s`,
      ];
      if (gpRefs.length) parts.push(GEN_PANEL_TEXT.metaRefs(gpRefs.length));
      return parts.join(GEN_VIDEO_TEXT.metaSep);
    }
    const parts = [
      GEN_IMAGE_TEXT.metaInputs(inputCount),
      imageChannelLabel(imageNode?.data.channel),
      imageNode?.data.aspectRatio || GEN_IMAGE_TEXT.metaDefaultRatio,
    ];
    return parts.join(GEN_IMAGE_TEXT.metaSep) + (imageNode?.data.results?.length ? GEN_IMAGE_TEXT.metaOutput(imageNode.data.results.length) : '');
  }, [genNode, videoNode, imageNode, inputCount, accounts, groups, gpRefs.length, videoDuration, videoModel]);

  /**
   * 编辑器内容 ⇐ `gpText`（原 `Z3_1.jsx:140-147`：`innerHTML = DS(N.current, lookup)`）
   *
   * ★ **光标安全的重写**（原 `CL.jsx:279-286` 的**同一模式**，与 `TextNode` 同法）：
   *   ① 编辑器没聚焦才写 ② 内容真不同才写 —— 否则打字时光标会被吃
   */
  useEffect(() => {
    const el = promptRef.current;
    if (!el || document.activeElement === el) return;
    const lookup = (n: number): { label?: string; dataUrl?: string } => {
      const r = gpRefs.find((x) => x.n === n);
      if (!r) return {};
      const lib = library.find((l) => l.id === r.id);
      const node = nodes.find((x) => x.id === r.id);
      const d = (node?.data ?? {}) as Record<string, unknown>;
      const fallback =
        node?.type === 'video' && typeof d.poster === 'string'
          ? d.poster
          : typeof d.dataUrl === 'string'
            ? d.dataUrl
            : '';
      const dataUrl = typeof lib?.dataUrl === 'string' && lib.dataUrl ? lib.dataUrl : fallback;
      return { label: lib?.name ?? r.rawName, dataUrl };
    };
    const next = textToGpEditorHtml(gpText, lookup);
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [gpText, gpRefs, library, nodes]);

  /**
   * 写回提示词（**变了才写** —— 原 `xt`，`Z3_1.jsx:405-414`）
   * ★ 写进 `data.text` 的是 **`@[id|rawName]` 形态**（原 `Zc(N.current, C.current)`）。
   */
  const commitPrompt = (): void => {
    const next = gpEditorToText(promptRef.current);
    if (next === gpText) return; // 原 `if (xe === k.current) return false`
    patchNodeData(nodeId, { text: refsToChipMarks(next, gpRefs) });
  };

  /**
   * 关闭面板（原 `Z3_1.jsx:416-419` 的 `Nt` = `xt()` + `d()`：**先提交提示词、再关**）
   * ⚠️ 关哪个 id 取决于面板当前展示的是哪类节点（源是**两个**面板各关自己的）。
   */
  const close = (): void => {
    commitPrompt();
    if (imageNode) closeImageGenPanel();
    else closeGeneratePanel();
  };
  // ⚠️ 「最新 ref」惯用法：渲染期**不许**写 ref（react-hooks/refs）⇒ 放在 effect 里提交
  useEffect(() => {
    closeRef.current = close;
  });

  // ── ③ 提前 return（hooks 已全部调用完毕）──
  if (!genNode) return null;

  /**
   * 自动匹配（原 `Z`，`Z3_1.jsx:630-674`）
   *
   * 源顺序：资源库**先判空**（空 ⇒ 只提示、直接 return）→ `xt()` 提交 → 读正文 →
   * `Jh(text, library)` → 用 `@[…|…]` 计数差算「新增 N 处」→ 无变化 ⇒ `'none'` + 提示；
   * 有变化 ⇒ 写回 + `'ok'` + 提示；**两种情况下按钮态都 1.5s 后复位**。
   * ⚠️ 与文本框那条**不同**：这条**发提示**（源就有），文本框那条没有。
   */
  const runAutoMatch = (): void => {
    const usable = library.filter((l) => l && l.id && l.name && String(l.name).trim());
    if (!usable.length) {
      pushToast(AUTO_MATCH_TEXT.emptyLibrary, AUTO_MATCH_TEXT.emptyLibraryMs, 'warn');
      return;
    }
    /*
     * ★ 源顺序（`Z3_1.jsx:642-665`）：
     *   ① `eu(N.current, C.current)` —— 先**重编号压实**（编号有跳号时先排整齐）；
     *   ② `Zc(text, refs)` —— 换成 **`@[id|名]` 形态**（`autoMatchText` 认的就是这个形态）；
     *   ③ `Jh(chipForm, library)` 自动匹配；
     *   ④ 变了 ⇒ 写 `data.text` = 匹配结果（**已是 `@[id|名]`**），再 `Ja` 回编辑器形态。
     */
    const renum = renumberRefs(gpText, gpRefs);
    const chipForm = refsToChipMarks(renum.text, renum.refs);
    const next = autoMatchText(chipForm, library);
    // ★ **2026-10-12 越权修正**：原在此**自造**一份芯片正则来数次数 —— 现委托源头
    //   `core/rules/refs.countRefChips()`（源头已补该 API：**出现次数**，不是去重条数）
    if (next === chipForm) {
      setAutoMatchState('none');
      pushToast(AUTO_MATCH_TEXT.noMatch, AUTO_MATCH_TEXT.noMatchMs, 'warn');
      window.setTimeout(() => setAutoMatchState(null), AUTO_MATCH_TEXT.resetMs);
      return;
    }
    // ★ 只写 store —— 编辑器文本 / 引用表由 `data.text` **现算**回，无需再存一份
    patchNodeData(nodeId, { text: next });
    setAutoMatchState('ok');
    pushToast(AUTO_MATCH_TEXT.done(countRefChips(next) - countRefChips(chipForm)), AUTO_MATCH_TEXT.doneMs, 'success');
    window.setTimeout(() => setAutoMatchState(null), AUTO_MATCH_TEXT.resetMs);
  };

  /** 光标左侧的纯文本（`@` 触发检测） */
  const textBeforeCaret = (): string => {
    const el = promptRef.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return '';
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return '';
    const pre = range.cloneRange();
    pre.selectNodeContents(el);
    pre.setEnd(range.startContainer, range.startOffset);
    return pre.toString();
  };

  const syncTrigger = (): void => {
    const hit = matchRefTrigger(textBeforeCaret());
    setRefTrigger(hit ? { query: hit.query, start: hit.start, typed: true } : null);
  };

  /**
   * 工具条上的 `@` 按钮（原 `Z3_1.jsx:1013-1019`）—— 点它**弹出全部素材**（不是敲 `@`）
   *
   * ⚠️ 与源一致：插入点必须是**光标处** ⇒ 先把光标收到编辑器**末尾**再开候选
   *   （源存的是最后一次选区 `A.current`；本仓用"末尾"这个确定位置，避免选区丢失后插入到随机位置）。
   */
  const openAtPicker = (): void => {
    const el = promptRef.current;
    if (el) {
      el.focus();
      const range = document.createRange();
      range.selectNodeContents(el);
      range.collapse(false);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
    }
    setRefTrigger({ query: '', start: 0, typed: false });
  };

  /** 采纳候选：把光标前的 `@查询词` 换成 **gp 药丸**（编号沿用已有编号，否则取下一个空号） */
  const pickRef = (item: { id: string; name: string; dataUrl: string }): void => {
    const el = promptRef.current;
    const sel = window.getSelection();
    const trigger = refTrigger;
    setRefTrigger(null);
    if (!el || !sel || sel.rangeCount === 0 || !trigger) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return;

    // ★ 编号从**引用表**取（`@图N` 只有编号、没有身份 ⇒ 不能从文本反推；见文件头协议表）
    const existing = gpRefs.find((r) => r.id === item.id);
    let n = existing?.n ?? 0;
    if (!n) {
      const taken = new Set(gpRefs.map((r) => r.n));
      n = 1;
      while (taken.has(n)) n += 1;
    }
    const nextRefs = existing ? gpRefs : [...gpRefs, { n, id: item.id, rawName: item.name }];

    // `@` 自身也算一个字符 —— 但按钮打开的没有那个 `@`（`typed` 区分）
    const back = trigger.query.length + (trigger.typed ? 1 : 0);
    const simple = back > 0 && range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset >= back;
    if (simple) {
      range.setStart(range.startContainer, range.startOffset - back);
      range.deleteContents();
    } else if (back > 0) {
      // ⚠️ 兜底（源版没有）：跨文本节点时做不到精确回退 ⇒ 整段重写（结果一定正确，光标落末尾）
      range.selectNodeContents(el);
      range.deleteContents();
    }

    const tpl = document.createElement('div');
    tpl.innerHTML = gpRefChipHtml(n, item.name, item.dataUrl);
    const chip = tpl.firstElementChild as HTMLElement | null;
    if (!chip) return;
    range.insertNode(chip);

    // 光标落到药丸**之后**（否则下一次输入会插到药丸前面）
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);

    // ★ 按**新引用表**写 store（这一枚药丸的身份当场就落下去，不必等下次 commit）
    const next = gpEditorToText(promptRef.current);
    patchNodeData(nodeId, { text: refsToChipMarks(next, nextRefs) });
  };

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      await gen.runForNode(nodeId);
    } finally {
      setBusy(false);
    }
  };

  /** 批量出片（原 `Z3_1.jsx:1200` 的 `gp-batch`）—— 提交 / 落点 / 提示全在 `state`（原则 1） */
  const runBatch = async (): Promise<void> => {
    setBatchBusy(true);
    try {
      await gen.runVideoBatchForNode(nodeId);
    } finally {
      setBatchBusy(false);
    }
  };

  /**
   * 选中 / 取消某风格（原 `T`，`Z3_1.jsx:675-680`）
   *
   * 源：`Ae({ styleIds: De.includes(G) ? [] : [G] })` —— **单选**（再次点击同一个 ⇒ 清空）。
   */
  const toggleStyle = (id: string): void => {
    patchNodeData(nodeId, { styleIds: styleIds.includes(id) ? [] : [id] });
  };

  /** 提示词占位（源：文生视频 `Z3_1.jsx:1005` / 文生图 `_Component45.jsx:1211`） */
  const promptPlaceholder = videoNode
    ? GEN_PANEL_TEXT.promptPlaceholderVideo
    : GEN_PANEL_TEXT.promptPlaceholderImage;

  return (
    <>
      {/*
        ★ **整屏透明层**（原 `gen-panel-layer`，`Z3_1.jsx:956`）：**不是遮罩** ——
          没有暗底、面板本身不居中（位置由锚定 effect 写 `left/top`）。
          `onMouseDown` = 提交并关闭；面板自身 `stopPropagation`（`PanelShell` 的卡片已内置）。
      */}
      <div className={styles.layer} onMouseDown={close}>
        <PanelShell
          onClose={close}
          closeLabel={GEN_PANEL_TEXT.closeTitle}
          wrapperRef={panelRef}
          className={styles.panel}
          bodyClassName={styles.body}
          testId="gen-panel"
          title={videoNode ? GEN_VIDEO_TEXT.title : GEN_PANEL_TEXT.imageTitle}
          /* 中槽 = `自动匹配`（原 `Z3_1.jsx:962-964`，**紧跟标题之后**） */
          meta={
            <button
              type="button"
              className={styles.autoMatch}
              title={AUTO_MATCH_TEXT.panelTitle}
              onClick={runAutoMatch}
            >
              {autoMatchState === 'ok'
                ? AUTO_MATCH_TEXT.ok
                : autoMatchState === 'none'
                  ? AUTO_MATCH_TEXT.none
                  : AUTO_MATCH_TEXT.idle}
            </button>
          }
          /* 右槽 = `.gp-meta`（原 `Z3_1.jsx:965-968`，靠右、在 ✕ 之前） */
          actions={<span className={styles.meta}>{metaText}</span>}
        >
          <div className={styles.promptWrap}>
            {/*
              ★ 提示词编辑器（原 `Z3_1.jsx:1005` / `_Component45.jsx:1211` 的 `.gp-prompt`，
                源版就是 **contentEditable**）
              ⚠️ 协议与文本框**不同**：编辑器内部是 `@图N`（编号），落盘是 `@[id|名]`。
            */}
            <div
              ref={promptRef}
              className={`${styles.promptEditor} nodrag nowheel`}
              style={{ height: `${promptH}px` }}
              contentEditable
              suppressContentEditableWarning
              role="textbox"
              aria-multiline
              aria-label={GEN_PANEL_TEXT.promptAria}
              data-placeholder={promptPlaceholder}
              onInput={() => {
                // ⚠️ 输入法合成中不提交（与 `TextNode` 同法 —— 否则会把半成品拼音写进 `data.text`）
                if (composingRef.current) return;
                commitPrompt();
                syncTrigger();
              }}
              onCompositionStart={() => {
                composingRef.current = true;
              }}
              onCompositionEnd={() => {
                composingRef.current = false;
                commitPrompt();
                syncTrigger();
              }}
              onKeyDown={onEscape}
              onBlur={() => {
                setRefTrigger(null);
                commitPrompt();
              }}
            />
            <RefAutocomplete
              query={refTrigger?.query ?? null}
              library={library}
              onPick={(it) => pickRef(it)}
              onClose={() => setRefTrigger(null)}
            />
          </div>

          {/* `.gp-toolbar`（原 `Z3_1.jsx:1010-1216`）—— **单行工具条**，不是五行表单 */}
          <div className={styles.toolbar}>
            <button
              type="button"
              className={styles.atBtn}
              title={GEN_PANEL_TEXT.atTitle}
              onMouseDown={(e) => e.preventDefault()}
              onClick={openAtPicker}
            >
              @
            </button>
            <span className={styles.sep} />

            {/* 风格（原 1021-1045）：未选 ⇒ 「◇ 风格」按钮；已选 ⇒ 药丸 + × */}
            {styleChips.length === 0 ? (
              <button
                type="button"
                className={styles.toolBtn}
                title={GEN_PANEL_TEXT.styleIdleTitle}
                onClick={() => setStyleLibOpen(true)}
              >
                {GEN_PANEL_TEXT.styleIdle}
                <span className={styles.caret} />
              </button>
            ) : (
              styleChips.map((s) => (
                <span className={styles.styleChip} key={s.id}>
                  <button
                    type="button"
                    className={styles.styleChipMain}
                    title={GEN_PANEL_TEXT.styleChipTitle(s.name)}
                    onClick={() => setStyleLibOpen(true)}
                  >
                    <span className={styles.styleChipGlyph}>{GEN_PANEL_TEXT.styleChipGlyph}</span> {s.name}
                  </button>
                  <button
                    type="button"
                    className={styles.styleChipX}
                    title={GEN_PANEL_TEXT.styleChipRemove(s.name)}
                    onClick={() => toggleStyle(s.id)}
                  >
                    {GEN_PANEL_TEXT.styleChipRemoveGlyph}
                  </button>
                </span>
              ))
            )}

            {/* 比例 */}
            <span className={styles.dropdown}>
              <select
                className={styles.select}
                title={GEN_PANEL_TEXT.ratioLabel}
                value={ratio}
                onChange={(e) => patchNodeData(nodeId, { aspectRatio: e.target.value })}
              >
                {videoNode
                  ? VIDEO_RATIO_OPTIONS.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))
                  : ASPECT_RATIOS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
              </select>
            </span>

            {/* 分辨率 + 张数（**只有文生图有**） */}
            {imageNode && (
              <>
                <span className={styles.dropdown}>
                  <select
                    className={styles.select}
                    title={GEN_PANEL_TEXT.resolutionLabel}
                    value={imageNode.data.igResolution ?? DEFAULT_IMAGE_RESOLUTION}
                    onChange={(e) => patchNodeData(nodeId, { igResolution: e.target.value })}
                  >
                    {IMAGE_RESOLUTIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </span>
                {/*
                  ★ **TD-08-4**：钳（`clampImageCount`）**只放在 `onChange` 里，不要搬到 `value` 上** ——
                  渲染期调用会让 React Compiler 无法排除该函数修改入参 ⇒ 判定本组件的 `useMemo`
                  依赖「可能被改」⇒ **放弃优化**（`react-hooks/preserve-manual-memoization` 报错）。
                */}
                <input
                  type="number"
                  className={styles.count}
                  title={GEN_PANEL_TEXT.countLabel}
                  min={IMAGE_COUNT_MIN}
                  max={IMAGE_COUNT_MAX}
                  value={imageNode.data.imageCount ?? DEFAULT_IMAGE_COUNT}
                  onChange={(e) =>
                    patchNodeData(nodeId, { imageCount: clampImageCount(Number(e.target.value)) })
                  }
                />
              </>
            )}

            {/*
              ★ 执行账号（原 `Z3_1.jsx:1053-1137` 的 `.gp-acc-wrap`）
              ⚠️ 2026-10-10 补：此前**没有任何地方能改 `sendAccount`** ⇒ 它永远是默认的 `auto`，
                而 `jS` 早就支持 `auto` / `auto:group:<gid>` / `auto:<type>` / 显式 id 四个分支。
            */}
            <AccountPicker
              value={sendAccount}
              channel={channel}
              accounts={accounts}
              groups={groups}
              apiReady={apiReady}
              onChange={(next) => patchNodeData(nodeId, next)}
            />

            {/* 模型 + 时长（**只有文生视频有**） */}
            {videoNode && (
              <>
                <span className={styles.dropdown}>
                  <select
                    className={styles.select}
                    title={GEN_PANEL_TEXT.modelLabel}
                    /* ⚠️ 未显式选过 ⇒ 显示**默认模型**（原 `Be` 也是拿默认值显示 `Mini`）——
                       源 `Y0` 只有三项，**没有**「（默认）」这一项 */
                    value={videoModel}
                    onChange={(e) => patchNodeData(nodeId, { model: e.target.value })}
                  >
                    {VIDEO_MODEL_OPTIONS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </span>
                <span className={styles.dropdown}>
                  <select
                    className={styles.select}
                    title={GEN_PANEL_TEXT.durationTitle(videoDuration)}
                    value={String(videoDuration)}
                    onChange={(e) => patchNodeData(nodeId, { duration: Number(e.target.value) })}
                  >
                    {Array.from(
                      { length: VIDEO_DURATION_MAX - VIDEO_DURATION_MIN + 1 },
                      (_, i) => VIDEO_DURATION_MIN + i,
                    ).map((d) => (
                      <option key={d} value={String(d)}>
                        {d}s
                      </option>
                    ))}
                  </select>
                </span>
              </>
            )}

            <span className={styles.grow} />

            {/* 生成（原 `1197-1199` 的 `.gp-generate`）—— 在工具条**最右** */}
            <button
              type="button"
              className={styles.run}
              onClick={() => void run()}
              disabled={busy}
              title={
                channel === 'api'
                  ? GEN_PANEL_TEXT.runApiTitle(videoProviderName)
                  : hasResult
                    ? GEN_PANEL_TEXT.regenerateTitle
                    : GEN_PANEL_TEXT.generateTitle
              }
            >
              {busy ? COMMON_TEXT.generating : hasResult ? PROJECT_TEXT.regenerating : PROJECT_TEXT.generate}
            </button>

            {/*
              ★ 批量出片（原 `Z3_1.jsx:1200-1202` 的 `.gp-batch`）—— **仅** 视频节点 + API 通道 + 有可用 provider
              （源条件 `Je === 'api' && He`）；文案逐字对源。
            */}
            {videoNode && channel === 'api' && videoProviderId && (
              <button
                type="button"
                className={styles.batch}
                onClick={() => void runBatch()}
                disabled={batchBusy}
                title={GEN_PANEL_TEXT.batchTitle(videoProviderName)}
              >
                {GEN_PANEL_TEXT.batchLabel}
              </button>
            )}

            {/* 拖高提示词框（原 `1203-1215` 的 `.gp-resize`）；双击复位 `Or` */}
            <span
              className={`${styles.resize}${resizing ? ` ${styles.resizing}` : ''}`}
              role="separator"
              aria-label={GEN_PANEL_TEXT.resizeAria}
              title={GEN_PANEL_TEXT.resizeTitle(PROMPT_EDITOR_HEIGHT.default)}
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resizeRef.current = { startY: e.clientY, startH: promptH };
                setResizing(true);
              }}
              onDoubleClick={() => setPromptH(PROMPT_EDITOR_HEIGHT.default)}
            >
              <span className={styles.resizeGrip} />
            </span>
          </div>
        </PanelShell>
      </div>

      {/*
        ★ 风格库弹窗（原 `Z3_1.jsx:1224-1230` 的 `<_cmp_US …/>`）
        ⚠️ 挂载即开（本仓不用 `open` prop + 复位 effect —— 会撞 `react-hooks/set-state-in-effect`）。
      */}
      {styleLibOpen && (
        <StyleLibraryModal
          selectedIds={styleIds}
          onToggle={toggleStyle}
          onUseNone={() => patchNodeData(nodeId, { styleIds: [] })}
          onClose={() => setStyleLibOpen(false)}
        />
      )}
    </>
  );
}
