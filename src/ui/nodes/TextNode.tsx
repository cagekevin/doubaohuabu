/**
 * 文本节点（`type: 'text'`）—— 对应原 `CL.jsx`（915 行）
 *
 * ★★ **2026-10-10 切片 5b**：正文从 `<textarea>` 换成 **`contentEditable`（药丸渲染）** ——
 *    消除「`@` 引用显示成 `@[lib_1|素材甲]` 标记原文」的观感差异。
 *    ★ **存进 `data.text` 的字节格式不变**（纯文本 + `@[id|名]` 标记 + `<br>`）——
 *      换的只是"显示成药丸"，此前落地的**消费侧**（`rules/refs.ts` · `accountNode.ts` ·
 *      `state/batchSend.ts` 的 `prepare`）**一行都不用改**。
 *
 * 依据（**逐行回源**）：
 *   | 行为 | 源 | 语义 |
 *   |---|---|---|
 *   | 初始/外部改动静默重写 | `CL.jsx:279-286` | ★ **只在编辑器没聚焦时**才写 `innerHTML`，且**只在内容真不同**时写 —— 这就是"打字时光标不被吃掉"的关键 |
 *   | 渲染 | `bL` 40047 快路径 | 见 `core/rules/richText.ts` 的 `textToEditorHtml` |
 *   | 读数 | `kL.jsx` 51 行 | 见 `lib/editorText.ts` 的 `editorToText` |
 *   | 药丸 | `P0` 39988 | `<span class="ref-chip" contenteditable="false" data-id data-name>` |
 *   | 正文提交 | `Q` 501-511 | 读 contentEditable → **变了才写** `{text}` |
 *   | 头部双击改名 | `V` 207-210 | `stopPropagation()` + 进改名态 |
 *   | 改名提交 | `ke` 197-206 | `trim() \|\| '文本框'`，**变了才写** `{label}` |
 *
 * ⚠️ **本工程新增的一处守卫（源版没有）**：**输入法合成期间不提交**（`compositionstart/end`）。
 *    源版靠"只在未聚焦时重写 DOM"回避了光标问题，但中文输入法在合成中途 `onInput` 也触发，
 *    此时读 DOM 会把**半成品拼音**写进 `data.text`（且撤销栈会碎成一堆单字）。
 *    中文是本项目的主要输入 ⇒ 这个守卫是必要的（行为差异只在"合成期间不落盘"，落盘时机不变）。
 *
 * ⚠️ 归 `ui/nodes`（组件层）；纯字符串半在 `core/rules/richText.ts`（**可测**），
 *    DOM 读数半在 `lib/editorText.ts`（不纯但无状态）。
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import { useStore } from '@/state';
import { TEXT_NODE_LABEL } from '@/stable/model/node';
import { AUTO_MATCH_TEXT, MATERIAL_NODE_TEXT, NODE_EDIT_TEXT, NODE_STATUS_TEXT, PRESET_TEXT, REF_TEXT, SPLIT_TEXT } from '@/constants/text';
import { parseRefChips } from '@/core/rules/refs';
import { autoMatchText } from '@/core/rules/autoMatch';
import { FuzzyConfirmPanel } from './FuzzyConfirmPanel';
import { sendStatusView } from '@/core/rules/sendStatus';
import { countdownOf, formatCountdown } from '@/core/rules/sendWatch';
import {
  collectLinkedMaterials,
  materialDataUrlOf,
  materialLabelOf,
  moveItem,
  orderByMaterialIds,
} from '@/core/rules/linkedMaterials';
import { withThumb } from '@/stable/protocols/img';
import { resolveRefMaterial, type RefNodeLike } from '@/core/rules/prompt';
import { refChipHtml, textToEditorHtml } from '@/core/rules/richText';
import { editorToText } from '@/ui/lib/editorText';
import { textBeforeCaret } from '@/ui/lib/selection';
import { NodeShell } from './NodeShell';
import { NodeTitle } from './NodeTitle';
import { RefAutocomplete, matchRefTrigger } from './RefAutocomplete';
import type { RFNodeProps } from './types';
import styles from './shared.module.css';

export function TextNode({ id, data, selected }: RFNodeProps<'text'>) {
  const patchNodeData = useStore((s) => s.patchNodeData);
  const library = useStore((s) => s.library);
  const nodes = useStore((s) => s.nodes);
  /** 发送状态（原 `CL.jsx:757` 的 `l` = `nodeSendStates[id]`；由 `state/batchSend` 写入） */
  const sendState = useStore((s) => s.nodeSendStates[id]);
  const sendView = sendStatusView(sendState?.status);
  /** 回复提示条（原 `CL.jsx:713` 的 `h` = `nodeNotices[id]`；生产者 = `state/sendWatch`） */
  const notice = useStore((s) => s.nodeNotices[id]);
  const clearNodeNotice = useStore((s) => s.clearNodeNotice);
  /** 等待倒计时（原 `CL.jsx:28-34` 的 `c` = `nodeWaitTimes[id]`；生产者 = `state/sendWatch`） */
  const wait = useStore((s) => s.nodeWaitTimes[id]);
  /** 换号状态（原 `CL.jsx:768` 的 `m` = `nodeSwitches[id]`；生产者 = `state/sendWatch` 的 `performSwitch`） */
  const sw = useStore((s) => s.nodeSwitches[id]);
  /**
   * 倒计时心跳（原 `CL.jsx:37-64`，**逐行**）
   *
   * 源：以 `d = 'detectedAt|seconds'` 为依赖 → 250ms 心跳、到点自停（源另有一支「挂载即过期就直接
   *   `u(1)`」—— 本仓 `nowMs` 初值即挂载时刻，首次渲染天然判到点 ⇒ 不需要它）。
   * ⚠️ 渲染期禁 `Date.now()`（eslint `Cannot call impure function during render`）⇒ 源那个
   *   "渲染期算剩余"在本仓改为**时钟进 state**（`nowMs`），由心跳推进（同 `SendQueuePanel`）。
   * ⚠️ 依赖用**派生的 `waitEnd`（数字）**而非 `wait` 对象：后者每次 store 更新都换引用，
   *   用它当依赖会让心跳**无谓重启**。
   */
  const waitEnd = wait ? wait.detectedAt + wait.seconds * 1000 : null;
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (waitEnd == null) return;
    const end = waitEnd;
    const timer = window.setInterval(() => {
      const t = Date.now();
      if (t >= end) window.clearInterval(timer); // 源 `Y()`：到点自停
      setNowMs(t);
    }, 250);
    return () => window.clearInterval(timer);
  }, [waitEnd]);
  /** 倒计时读数（原 `CL.jsx:63-64` 的 `f` / `p`）—— 时刻**注入**，渲染期不读时钟 */
  const countdown = countdownOf(wait, nowMs);
  /** ★ 素材缩略条要从**边**推导「连入的素材节点」（原 `w`） */
  const edges = useStore((s) => s.edges);
  /**
   * ★ 「按关键词拆分」的入口（原 `CL.jsx:401-403` 的 `it()`）
   *
   * ⚠️ 只**打开弹窗**（弹窗由 `CanvasHost` 渲染 —— 拆分要删掉本节点，弹窗不能住在这里）。
   */
  const openSplitKeywordModal = useStore((s) => s.openSplitKeywordModal);
  /** 自动匹配按钮的临时态（原 `ce`：`'ok'` / `'none'` / `null`，1.5s 后复位） */
  const [autoMatchState, setAutoMatchState] = useState<'ok' | 'none' | null>(null);
  const autoMatchTimerRef = useRef<number | null>(null);
  /** 「保存预设」的临时态（原 `pe`，1.5s 后复位） */
  const [presetSaved, setPresetSaved] = useState(false);
  const presetTimerRef = useRef<number | null>(null);
  const addPreset = useStore((s) => s.addPreset);
  const bodyRef = useRef<HTMLDivElement>(null);
  /**
   * `@` 下拉的触发态。
   * ★ `typed` = **是不是"打字打出来的 `@查询词`"**：
   *   `true` ⇒ 采纳时要先**回退** `@查询词` 那段（`1 + query.length` 个字符）；
   *   `false`（从「@ 引用素材」按钮打开）⇒ 光标前**没有** `@查询词` 可回退，只把药丸插在光标处。
   */
  const [refTrigger, setRefTrigger] = useState<{ query: string; start: number; typed: boolean } | null>(
    null,
  );
  /** 输入法合成中（**本工程新增守卫**，见文件头） */
  const composingRef = useRef(false);

  /** 药丸解析用的素材表（原 `bL` 的第二参是**节点表**） */
  const materials = useMemo(() => {
    const map: Record<string, { name?: string; dataUrl?: string }> = {};
    for (const n of nodes) {
      const d = n.data as Record<string, unknown>;
      const url = typeof d.dataUrl === 'string' ? d.dataUrl : '';
      if (url) map[n.id] = { name: String(d.label ?? d.name ?? ''), dataUrl: url };
    }
    return map;
  }, [nodes]);

  /**
   * ★★ **光标安全的重写**（原 `CL.jsx:279-286`，**逐字对齐**）
   *
   * 三道闸，缺一不可：
   *   ① 编辑器**没聚焦**才写 —— 打字时**绝不**动 DOM（否则光标跳到开头）
   *   ② 内容**真不同**才写 —— 免得每次渲染都重置一次（会打断选择/滚动）
   *   ③ 只从 `data.text` 单向推导 —— 不把 DOM 当作真源
   */
  useEffect(() => {
    const el = bodyRef.current;
    if (!el || document.activeElement === el) return;
    const next = textToEditorHtml(data.text, materials);
    if (el.innerHTML !== next) el.innerHTML = next;
  }, [data.text, materials]);

  /** 读 DOM 并**变了才写**（原 `Q` 501-511） */
  const commit = useCallback(() => {
    const next = editorToText(bodyRef.current);
    if (next !== data.text) patchNodeData(id, { text: next });
  }, [data.text, id, patchNodeData]);

  /** `@` 触发检测：拿光标左侧文本（原 `SL`，落点 `lib/selection.ts`） */
  const syncTrigger = (): void => {
    const hit = matchRefTrigger(textBeforeCaret(bodyRef.current));
    setRefTrigger(hit ? { query: hit.query, start: hit.start, typed: true } : null);
  };

  /** 采纳候选：把光标前的 `@查询词` **换成药丸**（原 `CL.jsx:592-600` 的 Range 手法） */
  const pickRef = (libId: string, name: string): void => {
    const el = bodyRef.current;
    const sel = window.getSelection();
    setRefTrigger(null);
    if (!el || !sel || sel.rangeCount === 0 || !refTrigger) return;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.startContainer)) return;

    const n = refTrigger.query.length + (refTrigger.typed ? 1 : 0); // 打字触发时 `@` 自身也算
    const container = range.startContainer;
    const simple =
      container.nodeType === Node.TEXT_NODE && range.startOffset >= n;

    if (simple) {
      range.setStart(container, range.startOffset - n);
      range.deleteContents();
    } else {
      // ⚠️ **兜底**（源版没有这条）：`@查询词` 跨了文本节点（粘贴等）⇒ 做不到精确回退。
      //    此时**整段重写**：结果文本一定正确，代价是光标落到末尾。
      //    （不静默失败 —— 宁可光标不理想，也不要"点了没反应"。）
      range.selectNodeContents(el);
      range.deleteContents();
    }

    const tpl = document.createElement('div');
    tpl.innerHTML = refChipHtml({
      id: libId,
      name,
      dataUrl: materials[libId]?.dataUrl ?? library.find((l) => l.id === libId)?.dataUrl ?? '',
    });
    const chip = tpl.firstElementChild as HTMLElement | null;
    if (!chip) return;
    range.insertNode(chip);

    // 光标落到药丸**之后**（否则下一次输入会插到药丸前面）
    const after = document.createRange();
    after.setStartAfter(chip);
    after.collapse(true);
    sel.removeAllRanges();
    sel.addRange(after);
    commit();
  };

  /**
   * 自动匹配（原 `wt`，`CL.jsx:243-264`）
   *
   * 源顺序：`Q()`（先 flush 编辑器）→ 读 `data.text` → `Jh(text, library)` →
   * **变了才写**（`r(e, {text: Y})`）→ 按钮态 `'ok'` / `'none'` → **1.5s 后复位**。
   * ⚠️ 与生成面板的 `Z` **不同**：文本节点这条**不发提示**（源就没有）。
   * ★ **2026-10-11**：「待确认项」已落 —— 源随后的 `l$` → `c$` 那两步现在是
   *   `FuzzyConfirmPanel` 的**纯派生**（`useMemo`：`fuzzyCandidates` → 过滤已忽略 → `groupCandidates`）；
   *   本函数只需照旧写回正文（`text` 一变，面板自己重算）。
   */
  const runAutoMatch = (): void => {
    commit();
    const text = data.text;
    const next = autoMatchText(text, library);
    if (next !== text) {
      patchNodeData(id, { text: next });
      setAutoMatchState('ok');
    } else {
      setAutoMatchState('none');
    }
    if (autoMatchTimerRef.current !== null) window.clearTimeout(autoMatchTimerRef.current);
    autoMatchTimerRef.current = window.setTimeout(() => setAutoMatchState(null), AUTO_MATCH_TEXT.resetMs);
  };

  /**
   * 保存到提示词预设（原 `q`，`CL.jsx:212-225`）
   *
   * 源顺序：取 `text.trim()` → **空正文直接 return**（不提示、不置态）→
   * `addPreset({name: label || '文本框', content})` → 按钮态 1.5s 后复位。
   * ⚠️ 源里提示词预设**只写不读**（没有列表 / 套用 UI）—— 照实落，不假装有 UI。
   */
  const savePreset = (): void => {
    const text = data.text.trim();
    if (!text) return;
    addPreset({ name: data.label || TEXT_NODE_LABEL, content: text });
    setPresetSaved(true);
    if (presetTimerRef.current !== null) window.clearTimeout(presetTimerRef.current);
    presetTimerRef.current = window.setTimeout(() => setPresetSaved(false), 1500);
  };

  /** 正文里已经写下的引用（预览行 —— 药丸已经表达了，但它还标出"素材缺失"） */
  const refPreview = useMemo(() => {
    const parsed = parseRefChips(data.text);
    if (parsed.refs.length === 0) return [];
    const nodeMap: Record<string, RefNodeLike> = Object.fromEntries(
      nodes.map((n) => [n.id, { id: n.id, type: n.type, data: n.data }]),
    );
    return parsed.refs.map((r) => ({ n: r.n, ...resolveRefMaterial(r.id, library, nodeMap) }));
  }, [data.text, library, nodes]);

  // ── 素材缩略条（原 `CL.jsx` 的 `w` / `v` / 拖拽回写）────────────────────────────────
  /** 已连接素材：连入本节点的 `material` 节点，按 `materialIds` 排序（原 `v`） */
  const linked = useMemo(
    () => orderByMaterialIds(collectLinkedMaterials(nodes, edges, id), data.materialIds ?? []),
    [nodes, edges, id, data.materialIds],
  );
  const barRef = useRef<HTMLDivElement>(null);
  /** 拖拽态（原 `xt`/`gt`）：`from` = 起点，`over` = 当前悬停落点 */
  const [drag, setDrag] = useState<{ from: number; over: number } | null>(null);

  /**
   * 拖拽排序（原 `CL.jsx:420-492`）—— 松手时按 `splice` 重排并**回写 `materialIds`**。
   *
   * ⚠️ 源版靠 raw DOM 的 `classList` + `data-idx` 找落点；本实现用 **`data-idx` + state**（同语义、
   *    不直接改 DOM 的 class）。
   * ⚠️ 与源一致：**只有落点真的变了**才回写（源 `hasMoved && xt !== gt`）。
   */
  useEffect(() => {
    if (!drag) return;
    const onMove = (e: MouseEvent): void => {
      const bar = barRef.current;
      if (!bar) return;
      for (const el of bar.querySelectorAll<HTMLElement>('[data-idx]')) {
        const r = el.getBoundingClientRect();
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          const idx = Number(el.dataset.idx);
          if (Number.isFinite(idx)) setDrag((d) => (d && d.over !== idx ? { ...d, over: idx } : d));
          break;
        }
      }
    };
    const onUp = (): void => {
      if (drag.from !== drag.over) {
        patchNodeData(id, { materialIds: moveItem(linked, drag.from, drag.over).map((m) => m.id) });
      }
      setDrag(null);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [drag, linked, id, patchNodeData]);

  /** 开始拖拽（原 `ee`）—— 只认左键；`preventDefault`/`stopPropagation` 免得拖成整个节点 */
  const startDrag = (e: ReactMouseEvent, idx: number): void => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setDrag({ from: idx, over: idx });
  };

  /*
   * 标题 + 改名收口到 `NodeTitle`（显示态 ↔ 编辑态 + `Enter` 提交 + `Esc` 取消 + focus/全选）。
   * ⚠️ 与源 `ke`（`CL.jsx:197-206`）一致：`trim()` 后为空 ⇒ 回落 `TEXT_NODE_LABEL`；
   *    与当前名相同 ⇒ **不调 action**。
   */
  const title = (
    <NodeTitle
      label={data.label}
      defaultTitle={TEXT_NODE_LABEL}
      onRename={(next) => {
        if (next !== (data.label ?? '')) patchNodeData(id, { label: next });
      }}
    />
  );

  return (
    <NodeShell
      type="text"
      title={title}
      /*
       * 头部**右槽** —— ★ 三颗动作钮（自动匹配 / 拆分 / 保存预设）都在**右上角**
       *   （`NodeShell.actions` → `.nodeHeadActions` 的 `margin-left: auto` 把它们推到最右）。
       * ⚠️ **2026-10-12 归位**：此前它们在**中槽**（`meta`）—— 中槽是 `flex: 0 1 auto`
       *   （只包住自己的内容、不占满头部）⇒ `margin-left: auto` **没有可推的空间**，
       *   于是三颗钮全挤在标题右边、看起来像一串**标题文字**（截图实测）。
       * 顺序（逐字对源 `CL.jsx:745-780`）：`自动匹配` → `拆分`（**只在有正文时**）→ `发送状态`
       *   → 等待倒计时 → 切换状态 → `保存预设`。
       */
      actions={
        <>
          {/*
            ★ 「自动匹配」（原 `CL.jsx:745-750` 的 `.auto-match-btn`）—— 在**头部**（紧跟节点名，
            与 `.split-md-btn` 相邻）；按钮态 `'ok'` / `'none'` 1.5s 后复位。
          */}
          <button
            type="button"
            className={`${styles.autoMatchBtn} nodrag nopan`}
            title={AUTO_MATCH_TEXT.textNodeTitle}
            onClick={(e) => {
              e.stopPropagation();
              runAutoMatch();
            }}
          >
            {autoMatchState === 'ok'
              ? AUTO_MATCH_TEXT.ok
              : autoMatchState === 'none'
                ? AUTO_MATCH_TEXT.none
                : AUTO_MATCH_TEXT.idle}
          </button>
          {/* ★ 「拆分」（原 `CL.jsx:751-756` 的 `.split-md-btn`）—— 紧跟在「自动匹配」之后，**只在有正文时**出现 */}
          {data.text.trim().length > 0 && (
            <button
              type="button"
              className={`${styles.splitBtn} nodrag nopan`}
              title={SPLIT_TEXT.buttonTitle}
              onClick={(e) => {
                e.stopPropagation();
                openSplitKeywordModal(id);
              }}
            >
              {SPLIT_TEXT.button}
            </button>
          )}
          {/*
            ★ 「发送状态」（原 `CL.jsx:757-762`）—— 源在**头部**（`foot-send-status head-send-status`
            两个类名都挂，位置在拆分按钮之后）；`title` = `msg`，图标按状态三档
            （`sending` ⏳ / `success` ✓ / **其余一律** ⚠）。
          */}
          {sendView ? (
            <span
              className={`${styles.sendStatus}${sendView.tone === 'success' ? ` ${styles.sendStatusSuccess}` : sendView.tone === 'error' ? ` ${styles.sendStatusError}` : ''} nodrag nopan`}
              title={sendState?.msg}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {sendView.icon}
              {sendState?.msg}
            </span>
          ) : null}
          {/*
            ★ 「等待倒计时」（原 `CL.jsx:763-767`）—— 位置**逐字对源**：发送状态之后、
            切换状态（未落）之前。`title` = 那句话（含全角空格）。
            ⚠️ 显示判据 = `c` 存在（源 `{c && …}`）；`wait-done` 档在**到点后**由 `countdown.ended` 给出。
          */}
          {wait && (
            <span
              className={`${styles.waitCountdown}${countdown.ended ? ` ${styles.waitDone}` : ''} nodrag nopan`}
              title={NODE_STATUS_TEXT.waitTitle(wait.text, wait.minutes, countdown.ended)}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {countdown.ended
                ? NODE_STATUS_TEXT.waitEnded
                : NODE_STATUS_TEXT.waitRunning(wait.minutes, formatCountdown(countdown.remainingMs))}
            </span>
          )}
          {/*
            ★ 「换号状态」（原 `CL.jsx:768-772`）—— 位置**逐字对源**：等待倒计时之后、
            `head-actions` 之前。数据源 `nodeSwitches[id]`（生产者 = `state/sendWatch.performSwitch`）。
            ⚠️ 三档文案与 `title` 全在 `NODE_STATUS_TEXT`（SSOT）；样式与 `.waitCountdown` 同族。
          */}
          {sw && (
            <span
              className={`${styles.switchStatus}${
                sw.state === 'done'
                  ? ` ${styles.switchDone}`
                  : sw.state === 'failed'
                    ? ` ${styles.switchFailed}`
                    : ` ${styles.switchSwitching}`
              } nodrag nopan`}
              title={sw.reason ? NODE_STATUS_TEXT.switchTitle(sw.reason, sw.toName) : undefined}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {sw.state === 'done'
                ? NODE_STATUS_TEXT.switchDone(sw.toName)
                : sw.state === 'failed'
                  ? NODE_STATUS_TEXT.switchFailed(sw.reason)
                  : NODE_STATUS_TEXT.switchSwitching(sw.toName)}
            </span>
          )}
          {/* `head-actions`（原 `CL.jsx:773-780`）—— 头部**最后**一项「保存预设」 */}
          <button
            type="button"
            className={`${styles.savePresetBtn} nodrag nopan`}
            title={PRESET_TEXT.saveTitle}
            onClick={(e) => {
              e.stopPropagation();
              savePreset();
            }}
          >
            {presetSaved ? PRESET_TEXT.saved : PRESET_TEXT.save}
          </button>
        </>
      }
      selected={selected}
    >
      {/*
        ★ 回复提示条（原 `CL.jsx:713-729`）—— 数据源 `nodeNotices[id]`（生产者 = `state/sendWatch`）。
        浮在**节点上方**（`.replyNotice` 的 `absolute` 基准是 `.node`，逃出正文区的裁剪）。
        ⚠️ base = `warn` 档，只为有差异的 `error` / `info` 输出修饰类（源 `reply-notice-${level || 'warn'}`）。
        ⚠️ `title` = `h.text`（源同）；`nodrag nopan` 免得拖它时把节点一起拖走。
      */}
      {notice && (
        <div
          className={`${styles.replyNotice}${
            notice.level === 'error'
              ? ` ${styles.replyNoticeError}`
              : notice.level === 'info'
                ? ` ${styles.replyNoticeInfo}`
                : ''
          } nodrag nopan`}
          title={notice.text}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <span className={styles.replyNoticeIcon} aria-hidden="true">
            {NODE_STATUS_TEXT.noticeIcon[notice.level]}
          </span>
          <span className={styles.replyNoticeBody}>
            {notice.title && <span className={styles.replyNoticeTitle}>{notice.title}</span>}
            <span className={styles.replyNoticeText}>{notice.text}</span>
          </span>
          <button
            type="button"
            className={styles.replyNoticeClose}
            title={NODE_STATUS_TEXT.noticeClose}
            onClick={(e) => {
              e.stopPropagation();
              clearNodeNotice(id);
            }}
          >
            ×
          </button>
        </div>
      )}
      <div className={styles.editWrap}>
        {/*
          ★ 正文工具条（原 `.text-toolbar`，`CL.jsx:784-815`）：
            · **`@ 引用素材`**（原 784-792）—— 给「打字 @」之外的**另一个入口**。⚠️ 与源一致用
              **`onMouseDown` + `preventDefault()`**：那样按钮**不抢焦点**，正文的光标/选区还在 ⇒ `pickRef` 知道往哪插。
            · **素材缩略条**（原 793-815）—— 连入本节点的素材缩略图 + 计数；**可拖拽排序**（回写 `materialIds`）。
          ⚠️ 源版同一行还有**自动匹配**（含"待确认项"= 疑似匹配面板）—— 未落，见 TD-16-78。
        */}
        <div className={`${styles.textToolbar} nodrag nopan`}>
          <button
            type="button"
            className={`${styles.atRefBtn} nodrag nopan`}
            title={REF_TEXT.atRefTitle}
            onMouseDown={(e) => {
              e.preventDefault();
              e.stopPropagation();
              // `typed: false` ⇒ 采纳时**不回退字符**（光标前没有 `@查询词`），药丸插在光标处
              setRefTrigger({ query: '', start: 0, typed: false });
            }}
          >
            {REF_TEXT.atRef}
          </button>

          {linked.length === 0 && <span className={styles.matStripHint}>{REF_TEXT.stripHint}</span>}
          <div className={styles.matPreviewBar} ref={barRef} data-testid="linked-materials">
            {linked.map((m, i) => {
              const url = materialDataUrlOf(m);
              const label = materialLabelOf(m);
              return (
                <div
                  key={m.id}
                  data-idx={i}
                  className={`${styles.matThumb} nodrag nopan ${
                    drag?.from === i ? styles.matThumbDragging : ''
                  } ${drag && drag.over === i && drag.from !== i ? styles.matThumbOver : ''}`}
                  title={REF_TEXT.thumbDragTitle(label)}
                  onMouseDown={(e) => startDrag(e, i)}
                >
                  {url ? (
                    // ⚠️ 一律走 `?w=` 缩略图（同源 `CL.jsx:805` 的 `Xt(ae,160)`）—— 不加载原图
                    <img
                      className={styles.matThumbImg}
                      src={withThumb(url, 160)}
                      alt={label}
                      draggable={false}
                    />
                  ) : (
                    <span className={styles.matThumbPlaceholder}>{MATERIAL_NODE_TEXT.noImage}</span>
                  )}
                  <span className={styles.matThumbGrip} aria-hidden="true">
                    ⠿
                  </span>
                </div>
              );
            })}
            {linked.length > 0 && <span className={styles.matCount}>{linked.length}</span>}
          </div>
        </div>
        <div
          ref={bodyRef}
          className={`${styles.textEdit} ${styles.textEditor} nodrag nowheel`}
          // ⚠️ 初始内容由上面的 effect 写（`dangerouslySetInnerHTML` 只在首次挂载时生效，
          //    而源版是"每次 `data.text` 变了都对一下" ⇒ 用 effect 才是同语义）
          contentEditable
          suppressContentEditableWarning
          data-placeholder={NODE_EDIT_TEXT.textPlaceholder}
          onInput={() => {
            // ⚠️ 输入法合成中不提交（见文件头）
            if (composingRef.current) return;
            commit();
            syncTrigger();
          }}
          onCompositionStart={() => {
            composingRef.current = true;
          }}
          onCompositionEnd={() => {
            composingRef.current = false;
            // 合成刚结束 ⇒ 补一次提交 + 触发检测（否则这一段落不进 `data.text`）
            commit();
            syncTrigger();
          }}
          onBlur={() => {
            setRefTrigger(null);
            commit();
          }}
        />
        <RefAutocomplete
          query={refTrigger?.query ?? null}
          library={library}
          onPick={(it) => pickRef(it.id, it.name)}
          onClose={() => setRefTrigger(null)}
        />
      </div>

      {refPreview.length > 0 && (
        <div className={styles.refPreview}>
          {refPreview.map((r) => (
            <span key={r.id} className={r.dataUrl ? styles.refOk : styles.refMissing}>
              {`参考图${r.n}`}
              {REF_TEXT.previewSep}
              {r.dataUrl ? r.label : REF_TEXT.previewMissing}
            </span>
          ))}
        </div>
      )}

      {/*
        ★ 模糊匹配待确认（原 `CL.jsx:834-892`）
        ⚠️ **没有 `open` prop**：源的开合是派生的（`const Je = he.length > 0`）⇒ 无候选时
          组件自身返回 `null`（"处理完就消失"）—— 见组件头注。
      */}
      <FuzzyConfirmPanel
        text={data.text}
        library={library}
        onWrite={(next) => patchNodeData(id, { text: next })}
        // ★ 高亮 / 定位滚动都要对着**正文编辑器**量（原 `x.current`）
        editorRef={bodyRef}
      />
    </NodeShell>
  );
}
