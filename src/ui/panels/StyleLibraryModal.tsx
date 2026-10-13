/**
 * 风格库弹窗（原 `US.jsx`，294 行）—— **视图半**
 *
 * 依据（**逐行回源**）：`US.jsx:5-293`
 *   · 顶部三颗 tab：`新建风格` / `不使用风格` / `恢复默认` + 一行 hint（`:158-179`）
 *   · 卡片网格：封面（无封面 ⇒ `q0(name)` 渐变 + 名字首字）+ 名字 + 选中勾；主按钮**选用并关闭**；
 *     卡片上另有 `编辑` / `删除`（`删除` **不确认**，直接删 —— 源如此，`:212-216`）
 *   · 编辑页：名称 / 提示词（会注入生成）+ 封面上传 / 清除 + `删除`（**有** `window.confirm`）/ `取消` / `保存`
 *
 * ⚠️ 原则 1：本组件**不写 store** —— 只调 `styles` 片的具名 action（`addStyle` / `updateStyle` /
 *    `removeStyle` / `resetStyles`）；纯逻辑（名称/前缀归一、兜底渐变）在 `core/rules/style.ts`。
 * ⚠️ 本组件**没有 `open` prop**：由调用方 `{open && <StyleLibraryModal … />}` **挂载即开**
 *    —— 源版用 `useEffect(() => { if (!e) f(null) }, [e])` 复位编辑态，那会撞
 *    `react-hooks/set-state-in-effect`（本项目已因此改过四处）⇒ 改为「重挂载即复位」。
 * ⚠️ 编辑页**内联在弹窗里**（源版是叠在弹窗体上的第二层浮层 `.style-lib-edit-layer`）——
 *    源 CSS 未入库，且 `ui/common/Modal` 是浮层语义唯一落点 ⇒ 不另起一层。
 *    （以上三处均为**有意差异**，见 `TD-03-10`。）
 */

import { useRef, useState } from 'react';
import { useStore } from '@/state';
import { Modal } from '@/ui/common/Modal';
import { compressCoverImage } from '@/lib/compressCover';
import { STYLE_LIB_TEXT } from '@/constants/text';
import { normalizeStyleName, normalizeStylePrefix, styleCoverGradient, UNNAMED_STYLE } from '@/core/rules/style';
import type { StylePreset } from '@/constants/stylePresets';
import styles from './StyleLibraryModal.module.css';
import shared from '@/ui/common/shared.module.css';

/** 编辑页草稿（原 `p`：`{name, prefix, cover}`） */
interface Draft {
  name: string;
  prefix: string;
  cover: string | null;
}

const EMPTY_DRAFT: Draft = { name: '', prefix: '', cover: null };

/** 「新建」在编辑态里的哨兵（原 `d === 'new'`） */
const NEW_ID = 'new';

export interface StyleLibraryModalProps {
  /** 已选中的风格 id（原 `selectedIds`） */
  selectedIds: readonly string[];
  /** 卡片主按钮：选中/取消选中（原 `onToggle`） */
  onToggle: (id: string) => void;
  /** `不使用风格`（原 `onUseNone`） */
  onUseNone: () => void;
  onClose: () => void;
}

export function StyleLibraryModal({ selectedIds, onToggle, onUseNone, onClose }: StyleLibraryModalProps) {
  const list = useStore((s) => s.styles);
  const addStyle = useStore((s) => s.addStyle);
  const updateStyle = useStore((s) => s.updateStyle);
  const removeStyle = useStore((s) => s.removeStyle);
  const resetStyles = useStore((s) => s.resetStyles);
  const pushToast = useStore((s) => s.pushToast);

  /** 编辑中的 id：`null` = 不编辑；`NEW_ID` = 新建；否则是被编辑那条的 id（原 `d`） */
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const fileRef = useRef<HTMLInputElement>(null);

  const editingOne: StylePreset | null =
    editing && editing !== NEW_ID ? (list.find((s) => s.id === editing) ?? null) : null;
  const editTitle =
    editing === NEW_ID
      ? STYLE_LIB_TEXT.editTitleNew
      : STYLE_LIB_TEXT.editTitle(editingOne?.name || draft.name || UNNAMED_STYLE);

  const startEdit = (s: StylePreset): void => {
    setEditing(s.id);
    setDraft({ name: s.name || '', prefix: s.prefix || '', cover: s.cover || null });
  };
  const startNew = (): void => {
    setEditing(NEW_ID);
    setDraft(EMPTY_DRAFT);
  };
  const stopEdit = (): void => setEditing(null);

  /** 保存（原 `j`，`US.jsx:96-113`）：名称兜底 + 前缀尾标点归一 */
  const save = (): void => {
    const name = normalizeStyleName(draft.name);
    const prefix = normalizeStylePrefix(draft.prefix);
    if (editing === NEW_ID) addStyle({ name, prefix, cover: draft.cover });
    else if (editing) updateStyle(editing, { name, prefix, cover: draft.cover });
    stopEdit();
  };

  /** 编辑页的删除（原 `I`，`US.jsx:114-119`）—— **有** `window.confirm` */
  const removeWithConfirm = (): void => {
    if (editing && editing !== NEW_ID && window.confirm(STYLE_LIB_TEXT.confirmDelete(editingOne?.name || ''))) {
      removeStyle(editing);
    }
    stopEdit();
  };

  const pickCover = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    try {
      // 原 `J3`：读图 + 解析 + 压到 560px jpeg；读/解析失败 reject（坏图不能塞进 store）
      const dataUrl = await compressCoverImage(file);
      setDraft((d) => ({ ...d, cover: dataUrl }));
    } catch {
      // 源版是 `console.warn`（静默）⇒ 本仓按「失败可见」给一条 toast（有意差异，见 TD-03-10）
      pushToast(STYLE_LIB_TEXT.coverFailed, 3000, 'error');
    }
  };

  return (
    <Modal open onClose={onClose} title={STYLE_LIB_TEXT.title}>
      <div className={styles.tabs}>
        <button
          type="button"
          className={`${styles.tab}${editing === NEW_ID ? ` ${styles.tabActive}` : ''}`}
          onClick={() => (editing === NEW_ID ? stopEdit() : startNew())}
        >
          {STYLE_LIB_TEXT.tabNew}
        </button>
        <button type="button" className={styles.tab} onClick={onUseNone}>
          {STYLE_LIB_TEXT.tabNone}
        </button>
        <button type="button" className={styles.tab} onClick={resetStyles}>
          {STYLE_LIB_TEXT.tabReset}
        </button>
        <span className={styles.hint}>{STYLE_LIB_TEXT.hint}</span>
      </div>

      {editing !== null && (
        <div className={styles.edit}>
          <div className={styles.editHead}>
            <span className={styles.editTitle} title={editTitle}>
              {editTitle}
            </span>
            <button type="button" className={styles.editClose} onClick={stopEdit} title={STYLE_LIB_TEXT.editClose}>
              {STYLE_LIB_TEXT.closeGlyph}
            </button>
          </div>
          <div className={styles.editBody}>
            <div
              className={styles.editCover}
              style={
                draft.cover
                  ? undefined
                  : { background: styleCoverGradient(editing === NEW_ID ? draft.name : editingOne?.name) }
              }
            >
              {draft.cover ? (
                <img src={draft.cover} alt="" />
              ) : (
                <span className={styles.coverGlyph}>{STYLE_LIB_TEXT.cardGlyph(draft.name)}</span>
              )}
            </div>
            <div className={styles.coverActions}>
              <button type="button" className={styles.mini} onClick={() => fileRef.current?.click()}>
                {STYLE_LIB_TEXT.uploadCover}
              </button>
              {draft.cover ? (
                <button
                  type="button"
                  className={styles.mini}
                  onClick={() => setDraft((d) => ({ ...d, cover: null }))}
                >
                  {STYLE_LIB_TEXT.clearCover}
                </button>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className={styles.fileInput}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = ''; // 允许连续选同一个文件
                  void pickCover(f);
                }}
              />
            </div>
            <label className={styles.fieldLabel}>{STYLE_LIB_TEXT.nameLabel}</label>
            <input
              className={styles.input}
              placeholder={STYLE_LIB_TEXT.namePlaceholder}
              value={draft.name}
              onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))}
            />
            <label className={styles.fieldLabel}>{STYLE_LIB_TEXT.prefixLabel}</label>
            <textarea
              className={styles.textarea}
              rows={4}
              placeholder={STYLE_LIB_TEXT.prefixPlaceholder}
              value={draft.prefix}
              onChange={(e) => setDraft((d) => ({ ...d, prefix: e.target.value }))}
            />
          </div>
          <div className={styles.editFoot}>
            {editing !== NEW_ID ? (
              <button type="button" className={styles.miniDanger} onClick={removeWithConfirm}>
                {STYLE_LIB_TEXT.cardRemove}
              </button>
            ) : (
              <span />
            )}
            <div className={styles.editFootRight}>
              <button type="button" className={styles.mini} onClick={stopEdit}>
                {STYLE_LIB_TEXT.cancel}
              </button>
              <button type="button" className={styles.primary} onClick={save}>
                {STYLE_LIB_TEXT.save}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className={styles.gridWrap}>
        {list.length === 0 ? (
          <div className={shared.empty}>{STYLE_LIB_TEXT.empty}</div>
        ) : (
          <div className={styles.grid}>
            {list.map((s) => {
              const selected = selectedIds.includes(s.id);
              return (
                <div className={`${styles.card}${selected ? ` ${styles.cardActive}` : ''}`} key={s.id}>
                  <button
                    type="button"
                    className={styles.cardPick}
                    title={STYLE_LIB_TEXT.cardPick(selected, s.name)}
                    onClick={() => {
                      onToggle(s.id);
                      onClose();
                    }}
                  >
                    <span
                      className={styles.cover}
                      style={s.cover ? undefined : { background: styleCoverGradient(s.name) }}
                    >
                      {s.cover ? (
                        <img src={s.cover} alt="" />
                      ) : (
                        <span className={styles.coverGlyph}>{STYLE_LIB_TEXT.cardGlyph(s.name)}</span>
                      )}
                      {selected ? <span className={styles.check}>{STYLE_LIB_TEXT.checkGlyph}</span> : null}
                    </span>
                    <span className={styles.name} title={s.name}>
                      {s.name}
                    </span>
                  </button>
                  <div className={styles.cardActions}>
                    <button type="button" className={styles.mini} onClick={() => startEdit(s)}>
                      {STYLE_LIB_TEXT.cardEdit}
                    </button>
                    {/* ⚠️ 源版这里**不确认**（`onClick={() => c(D.id)}`）—— 照抄 */}
                    <button type="button" className={styles.miniDanger} onClick={() => removeStyle(s.id)}>
                      {STYLE_LIB_TEXT.cardRemove}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
