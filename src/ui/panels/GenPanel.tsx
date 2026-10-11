/**
 * 生成面板（原 `_Component45.jsx` 的 `.gp-*` 工具条 —— **文生图 / 文生视频共用**）
 *
 * 依据：docs/03-人类版.md §5 §8
 *
 * ⚠️ 原则 1：本组件**不写 store**，落值走 `patchNodeData` / `useGen()`
 * ⚠️ 原则 8：这是**首个**生成面板；第二个（视频面板）出现时**必须**抽成复合组件
 *    （`<GenPanel>` + `<ModelPicker>` / `<RatioPicker>` —— 见 §9.4 组合模式）
 *
 * ★★ **2026-10-10 三次补齐**（此前都是断链）：
 *   ① **提示词输入**（没有它 ⇒ 生成节点只能发**空提示词**）；
 *   ② **执行账号**（没有它 ⇒ `sendAccount` 恒 `auto`，`jS` 的四个分支用不上）；
 *   ③ **`@` 药丸编辑器**（用 `<textarea>` ⇒ 引用只能显示成 `@图1` 标记原文）。
 *
 * ⚠️ **提示词与文本框是两套 chip 协议**（源版即如此，`richText.ts` 的 `GP_REF_CHIP_CLASS` 有对照表）：
 *    文本框存 `@[id|名]`（带 id 与名字）、**提示词存 `@图N`（只有编号）**。
 *    ⇒ 触发检测与候选浮层复用，渲染/读数各自一套（判据 C1 复用的是**纯层**）。
 *
 * ★★ **2026-10-11 协议更正（清 `TD-03-8` 的根因）**：上面那句"提示词存 `@图N`"是**上一版的自造协议**，
 *   与源版**相反**。回源 `Z3_1.jsx` 后确认：
 *   | 位置 | 形态 | 源 |
 *   |---|---|---|
 *   | **节点 `data.text`（落盘）** | **`@[id\|rawName]`** | 提交 = `Zc(N.current, C.current)`（409） |
 *   | 编辑器内部文本 | `@图N` | 读取 = `Ja(data.text, In)`（182） |
 *   | 药丸 DOM | `<span data-n>` | `X3`（42663） |
 *   ⇒ 本组件必须**两侧都换算**：读 `data.text` 先 `parseRefChips`（`Ja`）成 `@图N` + 引用表，
 *     写回时 `refsToChipMarks`（`Zc`）换回 `@[id\|名]`。
 *   ⚠️ 旧实现把 `@图N` 直接写进 `data.text` ⇒ ① 引用**身份永久丢失**（`@图N` 只有编号）；
 *     ② 下游 `state/batchSend` / `core/rules/accountNode` 的 `parseRefChips(stripHtml(data.text))`
 *     **永远解析不到引用**（它们认的是 `@[id\|名]`）—— 即**网页通道的引用也一起废了**。
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore as useXyStore } from '@xyflow/react';
import { useGen, useStore } from '@/state';
import { AUTO_MATCH_TEXT, GEN_PANEL_TEXT, NODE_EDIT_TEXT, REF_TEXT, PROJECT_TEXT } from '@/constants/text';
import { autoMatchText } from '@/core/rules/autoMatch';
import { resolveApiProviderId } from '@/core/rules/apiProvider';
import { planGenPanelAnchor } from '@/core/rules/panelAnchor';
import { AccountPicker } from '@/ui/common/AccountPicker';
import { RefAutocomplete, matchRefTrigger } from '@/ui/nodes/RefAutocomplete';
// ⚠️ `Esc` 处理**必须**走 `ui/common`（`原则8/rule-of-three`）
import { useEscapeKey } from '@/ui/common/useEscapeKey';
// ⚠️ `DEFAULT_IMAGE_RESOLUTION` 来自 SSOT，不在 JSX 里内联 `'2K'` —— TD-08-2
import {
  ASPECT_RATIOS,
  DEFAULT_IMAGE_COUNT,
  DEFAULT_IMAGE_RESOLUTION,
  IMAGE_COUNT_MAX,
  IMAGE_COUNT_MIN,
  IMAGE_RESOLUTIONS,
  VIDEO_MODELS,
} from '@/constants/models';
import { clampImageCount } from '@/core/rules/prompt';
import { countRefChips, parseRefChips, refsToChipMarks, renumberRefs } from '@/core/rules/refs';
import { gpRefChipHtml, textToGpEditorHtml } from '@/core/rules/richText';
import { gpEditorToText } from '@/lib/editorText';
import { stripHtml } from '@/lib/text';
import type { StylePreset } from '@/constants/stylePresets';
import { StyleLibraryModal } from './StyleLibraryModal';
import styles from './GenPanel.module.css';

export function GenPanel() {
  // ── ① 全部 hooks（`react-hooks/rules-of-hooks`：**必须**在任何提前 return 之前）──
  const nodes = useStore((s) => s.nodes);
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
   * ★ **2026-10-11**：面板开合改由 **`genPanelNodeId` / `imggenPanelNodeId`** 决定
   *   （原 `shared.js:31467,31482`）—— 此前用 `selected` 推导（`docs/14` §4 的登记项）。
   *   ⚠️ 同一时刻源只会开一个；本仓两面板合一 ⇒ 取「先 imggen 后 genvideo」。
   */
  const genPanelNodeId = useStore((s) => s.genPanelNodeId);
  const imggenPanelNodeId = useStore((s) => s.imggenPanelNodeId);
  const closeGeneratePanel = useStore((s) => s.closeGeneratePanel);
  const closeImageGenPanel = useStore((s) => s.closeImageGenPanel);
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
  const [refTrigger, setRefTrigger] = useState<{ query: string; start: number } | null>(null);
  const promptRef = useRef<HTMLDivElement>(null);
  /** 输入法合成中（与 `TextNode` 同法：中文输入法在合成中途也会触发 `onInput`） */
  const composingRef = useRef(false);
  const onEscape = useEscapeKey(refTrigger !== null, () => setRefTrigger(null));

  // ── ② 派生值（**不提前 return**，全部可空安全 —— 否则上面的 hooks 会被条件跳过）──
  /** 要开面板的节点 id（源是两个 id；本仓两面板合一 ⇒ 先 imggen 后 genvideo） */
  const panelNodeId = imggenPanelNodeId ?? genPanelNodeId;
  const panelNode = panelNodeId ? nodes.find((n) => n.id === panelNodeId) : undefined;
  const imageNode = panelNode && panelNode.type === 'imggen' ? panelNode : null;
  const videoNode = panelNode && panelNode.type === 'genvideo' ? panelNode : null;
  const genNode = imageNode ?? videoNode;

  /**
   * ★★ **编辑器内部文本 + 引用表 —— 全部由 `data.text` 现算**
   *    （原 `Z3_1.jsx` 的 `N.current` / `C.current`）
   *
   * ⚠️ 它们是**编辑器侧**的形态（`@图N`），**不是** `data.text` 的形态（`@[id|名]`）——
   *    两者的换算见文件头与 `core/rules/refs.ts` 的 `parseRefChips`（`Ja`）/ `refsToChipMarks`（`Zc`）。
   *
   * ★ **2026-10-11：不落 state、不落 effect** —— `data.text` 是**唯一真源**，这两个值是它的
   *    **纯派生**（判据「能算出来 ⇒ 渲染时算，不入 state」）。源版把它们放在组件 ref 里、
   *    再用一个 `useLayoutEffect` seed；那在本工程会撞 `react-hooks/set-state-in-effect`
   *    （本项目已因此改过四处）⇒ 现算既等价又不用绕。
   *    ⚠️ 每次输入都会 `commitPrompt` 立刻落 `data.text` ⇒ 现算值**始终跟得上光标**。
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
  const nodeId = genNode?.id ?? '';
  const ratio = genNode?.data.aspectRatio ?? '';
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

  /**
   * 编辑器内容 ⇐ `gpText`（原 `Z3_1.jsx:140-147`：`innerHTML = DS(N.current, lookup)`）
   *
   * ★ **光标安全的重写**（原 `CL.jsx:279-286` 的**同一模式**，与 `TextNode` 同法）：
   *   ① 编辑器没聚焦才写 ② 内容真不同才写 —— 否则打字时光标会被吃
   * ★ `编号 → 素材` 查表（原 `Z3_1.jsx:119-137` 的 `V`）**内联在这里** —— 按引用表的 `id` 查，
   *   资源库命中优先，其次节点（`video.poster` / `dataUrl`），名字回落 `rawName`。
   *   ⚠️ 内联（而不是提到组件体）是为了让本 effect 的依赖**只有它真正读的四个值**，
   *     不被一个每渲染都换身份的闭包拖成"永远重跑"。
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
   * ★ 写进 `data.text` 的是 **`@[id|rawName]` 形态**（原 `Zc(N.current, C.current)`）——
   *   不是编辑器里的 `@图N`（见文件头的协议表）。
   * ⚠️ 比较基线用**现算的 `gpText`**（它来自 `data.text`，即「上次已提交的编辑器文本」，
   *    与源版 `k.current` 同义）⇒ 无需再存一份 state。
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
    setRefTrigger(hit ? { query: hit.query, start: hit.start } : null);
  };

  /** 采纳候选：把光标前的 `@查询词` 换成 **gp 药丸**（编号沿用已有编号，否则取下一个空号） */
  const pickRef = (item: { id: string; name: string; dataUrl: string }): void => {
    const el = promptRef.current;
    const sel = window.getSelection();
    setRefTrigger(null);
    if (!el || !sel || sel.rangeCount === 0 || !refTrigger) return;
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

    const back = refTrigger.query.length + 1; // `@` 自身也算
    const simple = range.startContainer.nodeType === Node.TEXT_NODE && range.startOffset >= back;
    if (simple) {
      range.setStart(range.startContainer, range.startOffset - back);
      range.deleteContents();
    } else {
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

  return (
    <>
      {/*
        ★ 浮层（原 `gen-panel-layer`，`Z3_1.jsx:956`）：**整屏一层**，`onMouseDown` = 提交并关闭；
          面板自身 `stopPropagation`（源 `957-959` 同法）—— 点面板里不关、点外面才关。
        ⚠️ 风格库弹窗是**这一层的兄弟**（源 `Z3_1.jsx:1219-1230` 同法）—— 若藏在层内，
          它的 `mousedown` 会冒泡到层上**把生成面板一起关掉**。
      */}
      <div className={styles.layer} onMouseDown={close}>
      <div
        ref={panelRef}
        className={styles.panel}
        data-testid="gen-panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
      <div className={styles.head}>
        <span>{imageNode ? '文生图' : '文生视频'}</span>
        {/* 自动匹配（原 `Z3_1.jsx:962-964` 的 `.gp-automatch-btn.gp-head-automatch`）—— 在标题之后、关闭之前 */}
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
        {/* 关闭（原 `Z3_1.jsx:969-971` 的 `.gp-close`，`title="保存并关闭（Esc）"`） */}
        <button type="button" className={styles.close} title={GEN_PANEL_TEXT.closeTitle} onClick={close}>
          {GEN_PANEL_TEXT.closeGlyph}
        </button>
      </div>

      <label className={styles.row}>
        <span>{NODE_EDIT_TEXT.promptLabel}</span>
      </label>
      <div className={styles.promptWrap}>
        {/*
          ★ 提示词编辑器（原 `_Component45.jsx:1211` 的 `.gp-prompt`，源版就是 **contentEditable**）
          ⚠️ 协议与文本框**不同**：存的是 `@图N`（编号）而不是 `@[id|名]` ——
             渲染 `textToGpEditorHtml`（原 `DS`/`X3`）、读数 `gpEditorToText`（原 `LS`）。
        */}
        <div
          ref={promptRef}
          className={`${styles.prompt} ${styles.promptEditor} nodrag nowheel`}
          contentEditable
          suppressContentEditableWarning
          data-placeholder={`${NODE_EDIT_TEXT.promptPlaceholder}（${REF_TEXT.triggerHint}）`}
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

      {/*
        ★ 风格（原 `Z3_1.jsx:1020-1045` 的 `.gp-style-*`；入口在工具条上，本工程并进表单行）
        ⚠️ **单选**：源 `T` 是「已选 ⇒ 清空 / 未选 ⇒ 覆盖为 `[id]`」；药丸 × 与卡片再点都是取消。
      */}
      <label className={styles.row}>
        <span>{GEN_PANEL_TEXT.styleLabel}</span>
        <span className={styles.styleWrap}>
          {styleChips.length === 0 ? (
            <button
              type="button"
              className={styles.styleBtn}
              title={GEN_PANEL_TEXT.styleIdleTitle}
              onClick={() => setStyleLibOpen(true)}
            >
              {GEN_PANEL_TEXT.styleIdle}
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
        </span>
      </label>

      {/*
        ★ 执行账号（原 `_Component45.jsx:1265-1269` 的 `.gp-acc-wrap`）
        ⚠️ 2026-10-10 补：此前**没有任何地方能改 `sendAccount`** ⇒ 它永远是默认的 `auto`，
          而 `jS` 早就支持 `auto` / `auto:group:<gid>` / `auto:<type>` / 显式 id 四个分支。
      */}
      <label className={styles.row}>
        <span>{GEN_PANEL_TEXT.accountLabel}</span>
        <AccountPicker
          value={sendAccount}
          channel={channel}
          accounts={accounts}
          groups={groups}
          apiReady={apiReady}
          onChange={(next) => patchNodeData(nodeId, next)}
        />
      </label>

      <label className={styles.row}>
        <span>{GEN_PANEL_TEXT.ratioLabel}</span>
        <select value={ratio} onChange={(e) => patchNodeData(nodeId, { aspectRatio: e.target.value })}>
          {ASPECT_RATIOS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </label>

      {imageNode && (
        <>
          <label className={styles.row}>
            <span>{GEN_PANEL_TEXT.resolutionLabel}</span>
            <select
              value={imageNode.data.igResolution ?? DEFAULT_IMAGE_RESOLUTION}
              onChange={(e) => patchNodeData(nodeId, { igResolution: e.target.value })}
            >
              {IMAGE_RESOLUTIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className={styles.row}>
            <span>{GEN_PANEL_TEXT.countLabel}</span>
            {/*
              ★ **TD-08-4**：钳（`clampImageCount`）**只放在 `onChange` 里，不要搬到 `value` 上** ——
              渲染期调用会让 React Compiler 无法排除该函数修改入参 ⇒ 判定本组件的 `useMemo`
              依赖「可能被改」⇒ **放弃优化**（`react-hooks/preserve-manual-memoization` 报错，
              实测于 2026-10-11；只改 `onChange` 则 lint 通过）。
              ⇒ 显示侧用 `?? DEFAULT_IMAGE_COUNT` 即可：**store 里的值恒在 [1,4]**（写入经此处钳、
              `apiLanding` 回灌时钳、`generate` 发请求前再钳）。
            */}
            <input
              type="number"
              min={IMAGE_COUNT_MIN}
              max={IMAGE_COUNT_MAX}
              value={imageNode.data.imageCount ?? DEFAULT_IMAGE_COUNT}
              onChange={(e) =>
                patchNodeData(nodeId, { imageCount: clampImageCount(Number(e.target.value)) })
              }
            />
          </label>
        </>
      )}

      {videoNode && (
        <label className={styles.row}>
          <span>{GEN_PANEL_TEXT.modelLabel}</span>
          <select
            value={videoNode.data.model ?? ''}
            onChange={(e) => patchNodeData(nodeId, { model: e.target.value })}
          >
            <option value="">（默认）</option>
            {VIDEO_MODELS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      <button type="button" className={styles.run} onClick={() => void run()} disabled={busy}>
        {busy ? '生成中…' : hasResult ? PROJECT_TEXT.regenerating : PROJECT_TEXT.generate}
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
      </div>
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
