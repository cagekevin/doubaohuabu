/**
 * `@` 引用自动补全（原 `CL.jsx:512-540` 的 `me` + `ve` + 下拉那段）
 *
 * ★ **它做的是"作者侧"**：让用户能往 `data.text` 里写出 `@[id|显示名]` 标记。
 *   标记的**消费侧**（解析成 `参考图N` / 解析成参考图素材）早就落地了
 *   （`rules/refs.ts` · `rules/prompt.ts` 的 `resolveRefMaterial` · `state/batchSend.ts` 的 `prepare`）。
 *
 * ★★ **与源版的一处结构性偏离（有意，留痕）**：源版正文是 **`contentEditable` + `.ref-chip` 药丸**，
 *    输入 `@` 时把 `ref-chip` **换成** `@[id|name]` 文本节点（`kL.jsx` 51 行的归一：chip→标记、
 *    块级元素补 `<br>`、剥 `script/style`、防富文本粘贴污染）。
 *    本实现**先在 `<textarea>` 里做**：检测 `@`+查询词 → 下拉 → **把标记原文插进去**。
 *    理由：contentEditable 的**光标恢复 / 输入法合成 / 粘贴清洗**是本项目里风险最高的一类代码
 *    （没有运行时验证手段时尤其危险），而 `<textarea>` 天然保证**存入的就是纯文本**。
 *    ⚠️ 代价：用户看到的是 `@[lib_1|素材甲]` 原文，**不是药丸**。功能等价、观感不同。
 *    ⚠️ 药丸渲染 + `kL` 归一留下一轮（已登记）；届时本文件的**检测/插入逻辑可整段复用**，
 *    只是把「往 value 里 splice」换成「往 DOM 里替换 range」。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 触发匹配 | `CL.jsx:521` | `/@([\w\u4e00-\u9fa5]*)$/`（只认**紧贴光标左侧**的那个 `@`） |
 *   | 插入标记 | `kL.jsx:5` | `@[${id}|${name}]`，名字里的 `"` 换成 `&quot;` |
 *   | 失焦关闭 | `CL.jsx:613-618` | `onBlur` ⇒ 150ms 后关（延迟是给"点下拉项"留时间） |
 *
 * ⚠️ 原则 1：本组件**不写 store**（插入走 `onPick` 回调，由 `TextNode` 调 `patchNodeData`）
 */

import { useState } from 'react';
import type { LibraryItem } from '@/stable/model/project';
import { REF_TEXT } from '@/constants/text';
import {
  filterRefCandidates,
  matchRefTrigger,
  toRefMarker,
} from '@/core/rules/refs';
import styles from './RefAutocomplete.module.css';

/**
 * ⚠️ **三个纯函数（触发检测 / 拼标记 / 筛候选）都住在 `core/rules/refs.ts`**，
 *    这里只 import 并**转发导出** —— 理由：判据 E1 规定 `ui/` 下**不得有测试**，
 *    留在本文件就**永远没有单测**（与 `formatJsonPrompt` 同一个坑，那次也是这么挪的）。
 */
export { filterRefCandidates, matchRefTrigger, toRefMarker };

export interface RefAutocompleteProps {
  /** 当前查询词（`null` = 不显示下拉） */
  query: string | null;
  library: readonly LibraryItem[];
  /** 选中一条 ⇒ 调用方负责把 `[start, caret)` 那段替换成标记 */
  onPick: (item: LibraryItem) => void;
  /** 主动关掉（`Esc` / 采纳后） */
  onClose: () => void;
}

export function RefAutocomplete({ query, library, onPick, onClose }: RefAutocompleteProps) {
  /** 键盘高亮的下标（原 `j`/`I`） */
  const [active, setActive] = useState(0);

  if (query === null) return null;
  const items = filterRefCandidates(library, query);

  return (
    <div className={styles.pop} data-testid="ref-autocomplete">
      {items.length === 0 ? (
        <div className={styles.empty}>{REF_TEXT.noMatch}</div>
      ) : (
        <ul className={styles.list}>
          {items.map((it, i) => (
            <li key={it.id}>
              <button
                type="button"
                className={`${styles.item} ${i === active ? styles.itemActive : ''}`}
                // ⚠️ 用 `onMouseDown` 而不是 `onClick`：`onClick` 触发前 textarea 会先 blur
                //    （源版也靠 `tt` 的 150ms 延迟躲这一下；这里直接不让它 blur）
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(it);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <img className={styles.thumb} src={it.dataUrl} alt="" draggable={false} />
                <span className={styles.name}>{it.name}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className={styles.hint}>{REF_TEXT.pickHint}</div>
      {/* `Esc` 关闭由调用方的 textarea `onKeyDown` 处理（这里只给个鼠标出口） */}
      <button type="button" className={styles.close} title={REF_TEXT.close} onClick={onClose}>
        ×
      </button>
    </div>
  );
}
