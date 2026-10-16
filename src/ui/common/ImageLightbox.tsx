/**
 * **大图预览**（lightbox）—— ★ 通用那一件，全库只此一份
 *
 * ★ **为什么是"通用件 + 一个 hook"**：图片散在十几处（画布节点 / 资源库 / 新图面板 / 素材选择 / 风格库 /
 *   历史弹层 / 画廊…），而"看大图"是**同一件事**。真机此前只有**画廊**有这件（`GalleryLightbox`，源
 *   `_Component23.jsx:550-602` 的 `.tg-lightbox-*`）⇒ 现在把它**提成通用件**，画廊改成薄消费者
 *   （专属的两颗钮走 `actions` 槽），其余站点用 `useImagePreview` **两行**接上。
 *
 * ⚠️ **不新建第二个灯箱**：`GalleryLightbox` 已收在上面（同 `HistPop` / `stageParts` 的口径：
 *   同一件东西一处解，别让"每改一次要改两处"发生）。
 *
 * ⚠️ **`复制` 按钮是**新增能力**（不是照源）**：源版画廊灯箱底栏只有「勾选 / 打开原图 / 移出画廊」
 *   三颗，**没有复制**。用户裁定：弹出来的既然是**应用内**的大图（非原生看图器）⇒ 底栏必须有复制。
 *   能力走现成端口 `hostOps.copyImage`（源 `window.api.copyImageToClipboard`，图片编辑器的「复制」在用它）
 *   ⇒ **不新造端口**。⚠️ 该端口吃的是 **dataUrl**（主进程按 data URL 解析）；远程 URL 会**响亮失败**
 *   （toast 转发生产者的 message，原则 6），不静默。
 *
 * ⚠️ 与 `Modal` 的分工：`Esc` 归 `<Modal>`（`ui/common` 是 `Escape` 唯一落点）；`←`/`→` 由本件挂全局键
 *   （源版同法）。
 */

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useHostOps, useStore } from '@/state';
import { drawVideoFrameToDataUrl, seekVideoTo } from '@/ui/lib/videoPoster';
// ⚠️ 复用图片编辑器那三句（`复制 / 已复制到剪贴板 / 复制失败：`）—— **同值两份是母体 M3**，
//    而两处说的正是**同一件事**（把一张图写进系统剪贴板）⇒ 不新建键。
import { COMMON_TEXT, IMAGE_EDITOR_TEXT } from '@/constants/text';
import { Modal } from './Modal';
import { Icon } from './Icon';
import shared from './shared.module.css';

export interface LightboxItem {
  /** 地址（图片：大图原图，**不走 `?w=`**；视频：视频文件地址） */
  src: string;
  /**
   * 媒体类型（缺省 `'image'`）。
   * ★ 视频档照 maomao 的 `ImageZoomDialog`（`kind='video'`）复刻：**原生 `<video controls>`** 播放，
   *   **不做缩放/平移**（避免抢播放器的滚轮/拖拽），底栏多出「截取当前帧 / 截取尾帧 → 复制到剪贴板」。
   * ⚠️ **不是第二个灯箱**：同一件件带 `kind`（`AssetNode` 那侧也是 `kind={type==='video'?'video':'image'}`）。
   */
  kind?: 'image' | 'video';
  /** 标题（可选） */
  title?: string;
  /** 元信息（可选，如尺寸 · 大小 · 时间 · 第 n/m 张） */
  meta?: string;
  /**
   * 落盘用的默认文件名（可选）—— 不给就用 `COMMON_TEXT.downloadImageName(now)` 兜底。
   * ⚠️ **静态字符串**（不给函数）：站点自己能算出名字（画廊/资源库用条目名、
   *   文生图用该版本的 `ts` —— `GEN_IMAGE_TEXT.downloadName(ts)`）⇒ 不必在渲染期取时钟。
   */
  downloadName?: string;
  /**
   * 另存为对话框的过滤器（可选，如 `{name: COMMON_TEXT.imageFilter, extensions:['png']}`）。
   *
   * ★ **为什么挂在条目上**（2026-10-16 定为）：
   *   ① 生成视频那一侧，同一批条目可能是**视频**也可能是**图片**结果，源里就按两档分支
   *      （`X ? '视频文件' : '图片文件'`）⇒ 过滤器天然是**逐条**的；
   *   ② 挂条目上 ⇒ **不必再加第二个 prop**（组件级那个已删）—— 机制只减不增（`CSS规范` §5.1 的记账口径）。
   *   ③ 同一批同值时，站点在 `map` 里塞**同一个常量对象**即可（引用相同，零成本）。
   */
  downloadFilter?: { name: string; extensions: string[] };
}

export interface ImageLightboxProps {
  items: readonly LightboxItem[];
  /** 当前看第几张（索引） */
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  /** 底栏**附加**动作（画廊的「勾选 / 打开原图 / 移出画廊」走这里）—— 通用件自己出「复制 / 下载」 */
  actions?: ReactNode;
}

export function ImageLightbox({ items, index, onIndex, onClose, actions }: ImageLightboxProps) {
  const hostOps = useHostOps();
  const pushToast = useStore((s) => s.pushToast);
  const count = items.length;

  /** `←` / `→` 翻页（**全局键**，源版同法；`Esc` 归 `<Modal>`） */
  useEffect(() => {
    if (count < 2) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        onIndex(index - 1 < 0 ? count - 1 : index - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        onIndex(index + 1 >= count ? 0 : index + 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [count, index, onIndex]);

  /** 视频档要抓帧 ⇒ 需要拿到页面上那个正在播的元素（图片档不用） */
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const item = items[index];
  if (!item) return null;
  const isVideo = item.kind === 'video';

  /** 把这张图写进系统剪贴板（端口吃 dataUrl；失败**转发生产者 message**，不替他造句） */
  const copy = async (): Promise<void> => {
    const r = await hostOps.copyImage({ dataUrl: item.src, label: item.title });
    if (r.ok) pushToast(IMAGE_EDITOR_TEXT.copied, 2500);
    else pushToast(IMAGE_EDITOR_TEXT.copyFailed(r.message), 4000, 'error');
  };

  /**
   * **截当前帧 / 尾帧 → 复制到剪贴板**（★ 照 maomao `ImageZoomDialog` 复刻；视频档才出这两颗钮）。
   *
   * 复用链（**一样都不是新造的**）：
   *   `seekVideoTo` + `drawVideoFrameToDataUrl`（`ui/lib/videoPoster` 的取帧内核，与海报同一份）
   *   → `hostOps.copyImage({dataUrl})`（**端口**，不是 `navigator.clipboard` —— 本仓禁止直调）。
   *
   * ⚠️ 尾帧定位：`dur > 0.2` 取 `dur - 0.1`；**极短视频**取中段兜底（maomao 同判据）。
   * ⚠️ 取不到帧 / seek 超时 ⇒ **报错**（原则 6），不静默。
   */
  const captureFrame = async (last: boolean): Promise<void> => {
    const el = videoRef.current;
    if (!el) return;
    if (last) {
      const dur = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0;
      const target = dur > 0.2 ? dur - 0.1 : dur * 0.5;
      if (!(await seekVideoTo(el, target))) {
        pushToast(IMAGE_EDITOR_TEXT.copyFailed(COMMON_TEXT.unknownReason), 4000, 'error');
        return;
      }
    }
    const dataUrl = drawVideoFrameToDataUrl(el, { mime: 'image/png' });
    if (!dataUrl) {
      pushToast(IMAGE_EDITOR_TEXT.copyFailed(COMMON_TEXT.unknownReason), 4000, 'error');
      return;
    }
    const r = await hostOps.copyImage({ dataUrl, label: item.title });
    if (r.ok) pushToast(IMAGE_EDITOR_TEXT.copied, 2500);
    else pushToast(IMAGE_EDITOR_TEXT.copyFailed(r.message), 4000, 'error');
  };

  /**
   * 「另存为」下载当前这张**原图**（`item.src` 不走 `?w=`）。
   *
   * ★ **2026-10-16 用户裁定**：这个钮**从生成节点舞台上搬到这里**（原先舞台角上有颗 `.gvDl`，
   *   现在「双击看大图 → 在预览里下载」）⇒ 行为逐条对齐原来那颗：
   *   `downloadFileAs(url, name, filter)` → 用户取消**静默**（不是失败）→ 失败转发原文 →
   *   成功给「已下载到：<路径>」，**有路径才**附「在文件夹中显示」（源 `ZL.jsx:148-153` 同判据）。
   */
  const download = async (): Promise<void> => {
    const now = Date.now();
    const name =
      item.downloadName ??
      (isVideo ? COMMON_TEXT.downloadVideoName(now) : COMMON_TEXT.downloadImageName(now));
    const r = await hostOps.downloadFileAs(
      item.src,
      name,
      item.downloadFilter ? [item.downloadFilter] : undefined,
    );
    if (!r.ok) {
      pushToast(COMMON_TEXT.downloadFailed(r.message || COMMON_TEXT.unknownReason), 5000, 'warn');
      return;
    }
    if (r.value.canceled) return;
    const path = r.value.path || '';
    pushToast(
      COMMON_TEXT.downloadedTo(path || name),
      9000,
      'success',
      path ? { label: COMMON_TEXT.revealInFolder, onClick: () => void hostOps.revealPath(path) } : undefined,
    );
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={<span title={item.title}>{item.title ?? ''}</span>}
      meta={item.meta ? <span className={shared.lightboxMeta}>{item.meta}</span> : undefined}
      footer={
        <>
          {actions}
          {/* 「复制图片」只对**图片**有意义（端口吃图片 dataUrl）⇒ 视频档不显示（maomao 同判据） */}
          {!isVideo && (
            <button
              type="button"
              className={`${shared.btn} ${shared.btnSm}`}
              onClick={() => void copy()}
            >
              {IMAGE_EDITOR_TEXT.copy}
            </button>
          )}
          {/* ★ 「下载」—— 由**生成节点舞台**搬来（原先那两颗 `.gvDl` 已删，见用户裁定 2026-10-16） */}
          <button
            type="button"
            className={`${shared.btn} ${shared.btnSm}`}
            onClick={() => void download()}
          >
            {COMMON_TEXT.download}
          </button>
          {/* 视频档：截帧 → 剪贴板（maomao 同款两颗；图片档不出） */}
          {isVideo && (
            <>
              <button
                type="button"
                className={`${shared.btn} ${shared.btnSm}`}
                title={COMMON_TEXT.captureFrameTitle}
                onClick={() => void captureFrame(false)}
              >
                {COMMON_TEXT.captureFrame}
              </button>
              <button
                type="button"
                className={`${shared.btn} ${shared.btnSm}`}
                title={COMMON_TEXT.captureLastFrameTitle}
                onClick={() => void captureFrame(true)}
              >
                {COMMON_TEXT.captureLastFrame}
              </button>
            </>
          )}
        </>
      }
    >
      <div className={shared.lightboxStage}>
        {count > 1 && (
          <button
            type="button"
            className={shared.lightboxNav}
            onClick={() => onIndex(index - 1 < 0 ? count - 1 : index - 1)}
          >
            <Icon name="chevron" className={shared.iconLeft} />
          </button>
        )}
        {isVideo ? (
          /* 视频档：**原生播放器**（`controls`）—— 照 maomao「视频模式不做缩放/平移，免得干扰播放器」 */
          <video
            ref={videoRef}
            className={shared.lightboxImg}
            src={item.src}
            controls
            playsInline
            preload="metadata"
            draggable={false}
          />
        ) : (
          <img className={shared.lightboxImg} src={item.src} alt={item.title ?? ''} />
        )}
        {count > 1 && (
          <button
            type="button"
            className={shared.lightboxNav}
            onClick={() => onIndex(index + 1 >= count ? 0 : index + 1)}
          >
            <Icon name="chevron" />
          </button>
        )}
      </div>
    </Modal>
  );
}

/**
 * **把"双击看大图"接到任意图片位上**（两行）：
 * ```tsx
 * const preview = useImagePreview(items);            // items = 这处自然的图片列表
 * …
 * <img … onDoubleClick={() => preview.open(i)} />    // ① 双击点开
 * {preview.node}                                     // ② 挂在同一处（Modal 自己 portal 到 body）
 * ```
 * ⚠️ 单张图也要传**列表**（`[{src,title}]`）：通用件靠列表长度决定要不要出 `‹ ›`。
 * ⚠️ 用**双击**（用户裁定）：这些位置上**单击都有主**（画布节点=选中 · 卡片=开面板 · 卡片=勾选），
 *   而双击在画布上已被腾空（`zoomOnDoubleClick={false}`）、且**图库卡片本来就是双击看大图**（源同法）。
 */
export function useImagePreview(items: readonly LightboxItem[]): {
  open: (i: number) => void;
  node: ReactNode;
} {
  const [index, setIndex] = useState<number | null>(null);
  return {
    open: (i: number) => setIndex(i),
    node:
      index === null ? null : (
        <ImageLightbox
          items={items}
          index={index}
          onIndex={setIndex}
          onClose={() => setIndex(null)}
        />
      ),
  };
}
