/**
 * 素材选择器（原 `DT.jsx`，55 行 —— 逐行回源）
 *
 * **它是什么**：一个模态，从**资源库**里挑一张图（或「从文件选择」挑一张），
 * 把某个素材节点的图**换成它**。唯一消费者 = 节点右键菜单「更换素材」（仅 material）。
 *
 * 源的两处细节（**照抄**）：
 *   · 标题按 `info.mode` 分两档 —— 本仓**只落 `replace` 一支**（创建素材节点那一支
 *     `选择素材节点绑定的素材` 的宿主未落 ⇒ 不预支，判据 B5）
 *   · 「从文件选择」的条目**写死 `w:400, h:300`**（源 `:24-25`）—— 因为 `importFiles`
 *     不返回图片尺寸（主进程只给 `{name, dataUrl}`，且 dataUrl 已过 `persistImageDataUrl`）
 *
 * ⚠️ 原则 1：本组件**不写 store**（只调 state action + hostOps 控制器）
 * ⚠️ 选完/失败**都有反馈**（源那行完全静默 —— 本仓按原则 6 不静默）
 */

import { useState } from 'react';
import { useHostOps, useStore } from '@/state';
import { Thumb } from '@/ui/common/Thumb';
import { EmptyState } from '@/ui/common/EmptyState';
import { LIBRARY_TEXT } from '@/constants/text';
import styles from './MaterialPickerModal.module.css';
import shared from '@/ui/common/shared.module.css';
import { PanelShell } from '@/ui/common/PanelShell';

export interface MaterialPickerModalProps {
  /** 要换图的素材节点 id */
  nodeId: string;
  onClose: () => void;
}

export function MaterialPickerModal({ nodeId, onClose }: MaterialPickerModalProps) {
  const library = useStore((s) => s.library);
  const replaceMaterialWithLib = useStore((s) => s.replaceMaterialWithLib);
  const pushToast = useStore((s) => s.pushToast);
  const hostOps = useHostOps();
  const [busy, setBusy] = useState(false);

  /** 选中一张库条目 ⇒ 换图 + 关（源 `at` 的 replace 分支，`_Component42.jsx:966-969`） */
  const pick = (item: { id?: string; name?: string; dataUrl: string; w?: number; h?: number }): void => {
    const r = replaceMaterialWithLib(nodeId, item);
    if (!r.ok) {
      // ★ 原则 6：不静默（源 `replaceMaterialWithLib` 的返回值**直接被丢掉**）
      pushToast(LIBRARY_TEXT.replaceFailed, undefined, 'warn');
      return;
    }
    onClose();
  };

  /** 「从文件选择」（源 `s`，`DT.jsx:11-27`）—— 只取第一张（源 `o[0]`） */
  const pickFromFile = async (): Promise<void> => {
    setBusy(true);
    try {
      const res = await hostOps.importFiles();
      if (!res.ok) {
        // ★ 原则 6：原始 message 原样上报，不改写
        pushToast(res.message, undefined, 'warn');
        return;
      }
      const first = res.value.find((f) => f.dataUrl);
      if (!first) return;
      pick({ name: first.name, dataUrl: first.dataUrl as string, w: 400, h: 300 });
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelShell
      overlay
      onClose={onClose}
      testId="material-picker"
      className={styles.panel}
      title={LIBRARY_TEXT.pickFromLibrary}
      footer={
        <>
          <button type="button" className={shared.btn} onClick={() => void pickFromFile()} disabled={busy}>
            {LIBRARY_TEXT.pickFromFile}
          </button>
          <button type="button" className={`${shared.btn} ${shared.btnGhost}`} onClick={onClose}>
            {LIBRARY_TEXT.pickerCancel}
          </button>
        </>
      }
    >
        {library.length === 0 ? (
          <EmptyState title={LIBRARY_TEXT.empty} />
        ) : (
          <div className={styles.grid}>
            {library.map((it) => (
              <button
                key={it.id}
                type="button"
                className={styles.item}
                title={it.name}
                onClick={() => pick({ id: it.id, name: it.name, dataUrl: it.dataUrl, w: it.w, h: it.h })}
              >
                {/* ⚠️ 源 `:40` 用 `Xt(dataUrl, 240)`（不加载原图）—— 本仓 `<Thumb>` 同一语义 */}
                <Thumb src={it.dataUrl} alt="" width={240} className={styles.thumb} />
                <span>{it.name}</span>
              </button>
            ))}
          </div>
        )}
    </PanelShell>
  );
}
