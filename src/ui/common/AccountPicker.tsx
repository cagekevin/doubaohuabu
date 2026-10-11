/**
 * 执行账号选择器（原 `_Component45.jsx:1265-1374` 的 `.gp-acc-*`）
 *
 * ★★ **它补的是**：`jS`（选号）支持五个分支（`auto` / `auto:group:<gid>` / `auto:<type>` /
 *    显式 id / 显式 id 不退级），`GenPanel` 也在按 `data.sendAccount` 选号 —— 但**界面上
 *    没有任何地方能改它** ⇒ 生成节点的 `sendAccount` 永远是默认的 `auto`。
 *
 * 依据（**逐行回源**）：
 *   | 件 | 源 | 语义 |
 *   |---|---|---|
 *   | 触发按钮 | `1266-1268` | `title` 见 SSOT；标签 = `accountPickerLabel()` |
 *   | 菜单容器 | `1305-1310` | **portal 到 `document.body`**（面板会裁），定位用触发按钮的 rect |
 *   | 根层 | `1311-1338` | 全部账号（自动）· 各分组（`可用/总数`）· API |
 *   | 分组层 | `1350-1372` | `← 组名` · 「自动选择可用{组名}」· 逐账号（圆点 + 名字） |
 *   | 写入 | `635-648` 的 `Y` | ★ **只有 `channel` 与当前不同才一起写** |
 *
 * ★ **两处有意偏离（留痕）**：
 *   ① **API 项只在已配置时可选**（源版无论配没配都渲染、未配置时**点了也白点**）。
 *      本工程按判据 B4（不对用户承诺不存在的能力）—— 未配置时**照渲染但禁用**，
 *      `title` 用源版的「未配置…」那句；配置了就正常可选。
 *      「是否已配置」= `apiSetup.imageProviderId || apiSetup.videoProviderId`（与
 *      `state/generate.ts:72` 判的是**同一个条件**，不另立标准）。
 *   ② **`off` 类只给"不可用"的账号**（源版同）；但源版还让它们 `disabled` —— 本实现**照抄**
 *      （点了也没意义，且 `jS` 会因 `account-missing` 报错）。
 *
 * ⚠️ 原则 1：本组件**不写 store**，落值经 `onChange` 回调（由 `GenPanel` 调 `patchNodeData`）
 * ⚠️ `Escape` 关闭走 `ui/common/useEscapeKey`（`原则8/rule-of-three` 要求处理只住 `ui/common/`）
 */

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Account } from '@/stable/model/account';
import { isAccountUsable, SITE_TYPES } from '@/stable/model/account';
import type { AccountGroup } from '@/stable/model/account';
import {
  accountPickerLabel,
  buildAccountGroups,
  deriveChannelFromGroup,
  hasExecutableAccount,
  UNGROUPED,
} from '@/core/rules/accountPick';
import { ACCOUNT_NODE_TEXT, ACCOUNT_PICKER_TEXT } from '@/constants/text';
import { useEscapeKey } from './useEscapeKey';
import styles from './AccountPicker.module.css';

/** 未分组在**筛选入参**里的哨兵是 `'ungrouped'`；`buildAccountGroups` 给的是 `gid: null` */
const gidOfValue = (gid: string | null): string => gid ?? UNGROUPED;

export interface AccountPickerProps {
  /** 当前 `sendAccount`（原 `ut`） */
  value: string;
  /** 当前 `channel`（原 `I`）—— `'api'` 表示走 API 服务商 */
  channel: string;
  accounts: readonly Account[];
  groups: readonly AccountGroup[];
  /** API 服务商是否已配置（决定 API 项能否选） */
  apiReady: boolean;
  /**
   * 落值（原 `Y($, ie)`）
   * ⚠️ `channel` 为 `undefined` = **不动它**（源版：只有与当前不同才一起写）
   */
  onChange: (next: { sendAccount: string; channel?: string }) => void;
  /**
   * ★ **绑定模式**（账号节点用，原 `OL.jsx:434-493` 的 `foot-menu-grid`）
   *
   * 给了它就切到绑定模式：根层**只列**「未绑定」+ 全部账号（**没有**「全部账号（自动）」/
   * 分组 / API —— 绑号必须落到一个**具体账号**），落值回调的是**账号 id**。
   *
   * ⚠️ 与发送模式的菜单形态不同（源版也是两套：`.gp-acc-menu` 两级 vs `.foot-menu-grid` 网格）
   *   ⇒ 按判据 C1「三振出局」，**账号列表的取值/登录态判定**这部分复用，菜单层各自表达。
   */
  onBind?: (accountId: string) => void;
}

export function AccountPicker({
  value,
  channel,
  accounts,
  groups,
  apiReady,
  onChange,
  onBind,
}: AccountPickerProps) {
  const [open, setOpen] = useState(false);
  /** `null` = 根层；否则为当前展开的分组（原 `me` 的 `level`/`gid`） */
  const [openGroup, setOpenGroup] = useState<{ gid: string | null } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  /** 菜单定位（原 `qe`）—— 用触发按钮的 rect 算 `{left, bottom}` */
  const [pos, setPos] = useState<{ left: number; bottom: number } | null>(null);

  const close = useCallback(() => {
    setOpen(false);
    setOpenGroup(null);
  }, []);

  const onEscape = useEscapeKey(open, close);

  /** 分组列表（原 `T`）—— 纯函数在 `core/rules`，这里只算一次 */
  const groupBuckets = useMemo(() => buildAccountGroups(accounts, groups), [accounts, groups]);

  /**
   * 定位（原 `_Component45.jsx` 的 `qe`）
   * ⚠️ 用 `useLayoutEffect` 而不是 `useEffect`：要在**绘制前**摆好位置，否则会闪一下在左上角
   */
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) {
      setPos(null);
      return;
    }
    const r = triggerRef.current.getBoundingClientRect();
    // 面板通常贴在按钮**上方**（源版也是 `bottom`，因为生成面板在画布底部）
    setPos({ left: r.left, bottom: window.innerHeight - r.top + 4 });
  }, [open]);

  // 点别处关闭（`mousedown` 而非 `click`：避免与菜单项的点击竞争）
  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent): void => {
      const t = e.target as Node | null;
      if (triggerRef.current?.contains(t)) return;
      if ((t as HTMLElement | null)?.closest?.('[data-account-picker-menu]')) return;
      close();
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, [open, close]);

  /** 落值（原 `Y`）：`channel` 与当前相同 ⇒ **不带它** */
  const commit = (sendAccount: string, nextChannel?: string): void => {
    if (nextChannel && nextChannel !== channel) {
      onChange({ sendAccount, channel: nextChannel });
    } else {
      onChange({ sendAccount });
    }
    close();
  };

  const label = onBind
    ? // 绑定模式：显示账号名，未绑定 ⇒ 「选择账号」（原 `OL.jsx:289` 的 `H`）
      (accounts.find((a) => a.id === value)?.name || ACCOUNT_NODE_TEXT.pickAccount)
    : accountPickerLabel({ channel, sendAccount: value, accounts, groups });

  const menu = open && pos && (
    <div
      className={styles.menu}
      data-account-picker-menu=""
      style={{ left: pos.left, bottom: pos.bottom }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      {/*
        ★ 绑定模式（`onBind` 给了）—— 根层**只有**「未绑定」+ 全部账号，没有分组/API/自动
      */}
      {onBind ? (
        accounts.length === 0 ? (
          <div className={styles.empty}>{ACCOUNT_PICKER_TEXT.empty}</div>
        ) : (
          <>
            <button
              type="button"
              className={`${styles.item} ${value ? '' : styles.itemOn}`}
              onClick={() => {
                onBind('');
                close();
              }}
            >
              <span className={styles.name}>{ACCOUNT_NODE_TEXT.noneBound}</span>
            </button>
            {accounts.map((a) => {
              const usable = isAccountUsable(a);
              return (
                <button
                  type="button"
                  className={`${styles.item} ${value === a.id ? styles.itemOn : ''} ${usable ? '' : styles.itemOff}`}
                  title={ACCOUNT_PICKER_TEXT.accountTitle(a.name, usable, a.status)}
                  key={a.id}
                  onClick={() => {
                    onBind(a.id);
                    close();
                  }}
                >
                  <span className={`${styles.dot} ${usable ? '' : styles.dotGray}`} />
                  <span className={styles.name}>{a.name}</span>
                </button>
              );
            })}
          </>
        )
      ) : openGroup === null ? (
        groupBuckets.length === 0 ? (
          <div className={styles.empty}>{ACCOUNT_PICKER_TEXT.empty}</div>
        ) : (
          <>
            {/* 原 1312-1316：`on` = 非 api 且 sendAccount === 'auto' */}
            <button
              type="button"
              className={`${styles.item} ${channel !== 'api' && value === 'auto' ? styles.itemOn : ''}`}
              onClick={() => commit('auto', 'doubao')}
            >
              <span className={styles.name}>{ACCOUNT_PICKER_TEXT.allAccounts}</span>
            </button>

            {/* 原 1317-1332：各分组（`可用/总数`） */}
            {groupBuckets.map((g) => (
              <button
                type="button"
                className={styles.item}
                key={g.gid ?? 'ungrouped'}
                onClick={() => setOpenGroup({ gid: g.gid })}
              >
                <span className={styles.name}>{g.label}</span>
                <span className={styles.count}>
                  {g.list.filter((a) => isAccountUsable(a)).length}/{g.list.length}
                </span>
              </button>
            ))}

            {/* 原 1333-1338：API（**有意偏离**：未配置 ⇒ 禁用而非"点了白点"，见文件头） */}
            <button
              type="button"
              className={`${styles.item} ${channel === 'api' ? styles.itemOn : ''}`}
              title={
                apiReady ? ACCOUNT_PICKER_TEXT.apiTitleReady : ACCOUNT_PICKER_TEXT.apiTitleMissing
              }
              disabled={!apiReady}
              onClick={() => commit(value, 'api')}
            >
              <span className={styles.name}>
                {apiReady ? ACCOUNT_PICKER_TEXT.api : ACCOUNT_PICKER_TEXT.apiUnconfigured}
              </span>
            </button>
          </>
        )
      ) : (
        (() => {
          const bucket = groupBuckets.find((g) => g.gid === openGroup.gid);
          if (!bucket) return null;
          const autoValue = `auto:group:${gidOfValue(bucket.gid)}`;
          const canAuto = hasExecutableAccount(bucket.list);
          return (
            <>
              {/* 原 1351-1357：返回 */}
              <button
                type="button"
                className={`${styles.item} ${styles.back}`}
                onClick={() => setOpenGroup(null)}
              >
                {ACCOUNT_PICKER_TEXT.back(bucket.label)}
              </button>

              {/* 原 1358-1362：「自动选择可用{组名}」 */}
              <button
                type="button"
                className={`${styles.item} ${channel !== 'api' && value === autoValue ? styles.itemOn : ''}`}
                disabled={!canAuto}
                title={
                  canAuto ? ACCOUNT_PICKER_TEXT.autoInGroupTitle : ACCOUNT_PICKER_TEXT.autoInGroupDisabledTitle
                }
                onClick={() => commit(autoValue, deriveChannelFromGroup(bucket.list))}
              >
                <span className={styles.name}>{ACCOUNT_PICKER_TEXT.autoInGroup(bucket.label)}</span>
              </button>

              {/* 原 1363-1372：逐账号（圆点 + 名字；未登录 ⇒ `off` + `disabled`） */}
              {bucket.list.map((a) => {
                const usable = isAccountUsable(a);
                return (
                  <button
                    type="button"
                    className={`${styles.item} ${channel !== 'api' && value === a.id ? styles.itemOn : ''} ${usable ? '' : styles.itemOff}`}
                    title={ACCOUNT_PICKER_TEXT.accountTitle(a.name, usable, a.status)}
                    disabled={!usable}
                    key={a.id}
                    onClick={() => commit(a.id, { doubao: 'doubao', dola: 'dola', gpt: 'gpt' }[a.type as string] ?? 'doubao')}
                  >
                    <span className={`${styles.dot} ${usable ? '' : styles.dotGray}`} />
                    <span className={styles.name}>{a.name}</span>
                  </button>
                );
              })}
            </>
          );
        })()
      )}
    </div>
  );

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        title={ACCOUNT_PICKER_TEXT.buttonTitle}
        onClick={() => (open ? close() : setOpen(true))}
        onKeyDown={onEscape}
      >
        {label}
        <span className={`${styles.caret} ${open ? styles.caretOpen : ''}`} />
      </button>
      {menu ? createPortal(menu, document.body) : null}
    </>
  );
}

/** 站点类型白名单（供调用方做 `sendAccount` 的合法性提示） */
export const PICKABLE_TYPES = SITE_TYPES;
