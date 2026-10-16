/**
 * 全库唯一图标件 —— 24 格 · 描边 1.7 · `currentColor`。
 *
 * ★★ **本文件是图标的唯一真源**：形状（`d`）只许写在这里，别处**只许** `<Icon name="…" />`。
 *    全仓不得再出现：① 字符 / emoji 当图标（`⚡ ▦ ↗ ✕ ★ ⟳ …`）；② 另一份内联 `<svg>` 图标。
 *    形状来源 = `docs/mockup/*.html` 四页设计稿顶部那批 `<symbol>`（**逐字转写**，名字去掉 `i-` 前缀）。
 *
 * ── 合并口径（四页各自给一份清单，实测**不是**一一对应，三处冲突已裁定）────────────────
 *   · **异名同形 ⇒ 只留一个名**：`i-close` ≡ `i-x` ⇒ 只留 `x`；`i-retry` ≡ `i-refresh` ⇒ 只留 `refresh`；
 *     `i-export` ≡ `i-import`（同一条线 + 同一个上箭头）⇒ 只留 `upload`（按形状命名，语义由调用点给）。
 *   · **近重复 ⇒ 只留一个名**：`i-chevron-right` 与 `i-chevron` 只差内缩 0.5 ⇒ 只留 `chevron`，
 *     方向由**旋转**表达（真源 `.iconUp` / `.iconDown` / `.iconLeft`），不新造第二个箭头。
 *   · **同名多形状 ⇒ 取 `index.html`（首页）那一份**：`shield` 取带勾的那份（授权行同时表达"已授权"）；
 *     `clock` 取首页的半径。
 *
 * ── 设计稿未覆盖、由本仓补的两颗（留痕，等设计稿补上再换）──────────────────────────
 *   · `send`：设计稿 `index.html:227/263/298/308` 引用了 `#i-send`，但顶部 `<symbol>` 里**没有定义它**
 *     （页面实际渲染为空白）⇒ 按同一套口径（24 格 / 描边 1.7）补一颗「纸飞机」。
 *   · `grip`：真机 `.matThumbGrip`（原 `⠿`）的抓手，设计稿的引用条里**没有这个元素** ⇒ 补一颗六点抓手，
 *     保留拖拽暗示（不擅自删元素）。
 *
 * ── 尺寸 ──────────────────────────────────────────────────────────────────────
 *   默认 16×16（真源 `.icon`）；按钮里 14×14 由 `.btn .icon` **一处**决定；
 *   需要另调时由调用方传 `className`（组件 module 未分层 ⇒ 天然压过真源，见 `docs/CSS规范.md` §1.4）。
 */
import type { ReactElement } from 'react';
import shared from './shared.module.css';

/** 图标名（`docs/mockup` 的 `i-` 前缀去掉；见文件头「合并口径」） */
export type IconName =
  | 'folder'
  | 'external'
  | 'grid'
  | 'plus'
  | 'star'
  | 'trash'
  | 'image'
  | 'text'
  | 'video'
  | 'search'
  | 'zoomIn'
  | 'zoomOut'
  | 'fit'
  | 'magnet'
  | 'history'
  | 'chevron'
  | 'dot'
  | 'edit'
  | 'wand'
  | 'download'
  | 'scissors'
  | 'link'
  | 'group'
  | 'ungroup'
  | 'arrange'
  | 'play'
  | 'pause'
  | 'clear'
  | 'shuffle'
  | 'eye'
  | 'refresh'
  | 'x'
  | 'clock'
  | 'save'
  | 'copy'
  | 'paste'
  | 'swap'
  | 'queue'
  | 'shield'
  | 'check'
  | 'warn'
  | 'upload'
  | 'key'
  | 'pen'
  | 'home'
  | 'globe'
  | 'bolt'
  | 'send'
  | 'grip';

/** 形状表：只给 `viewBox` 内的图形 —— 尺寸 / 描边 / 颜色一律由真源 `.icon` 给 */
const SHAPES: Record<IconName, ReactElement> = {
  folder: <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4l2 2.5h7A1.5 1.5 0 0 1 19 10v7a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 3 17v-9.5Z" />,
  external: (
    <>
      <path d="M14 4h6v6" />
      <path d="M20 4 11 13" />
      <path d="M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10" />
    </>
  ),
  grid: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  star: <path d="m12 4 2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.6-4.8 2.6.9-5.4L4.2 9.7l5.4-.8L12 4Z" />,
  trash: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
    </>
  ),
  image: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m4 17 4.5-4.5 3.5 3.5 3-3 5 5" />
    </>
  ),
  text: (
    <>
      <path d="M5 6.5V5h14v1.5" />
      <path d="M12 5v14" />
      <path d="M9 19h6" />
    </>
  ),
  video: (
    <>
      <rect x="3" y="6" width="12.5" height="12" rx="2" />
      <path d="m15.5 12 5.5-3.5v11L15.5 16" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </>
  ),
  zoomIn: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M11 8.5v5M8.5 11h5" />
      <path d="m16 16 4 4" />
    </>
  ),
  zoomOut: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="M8.5 11h5" />
      <path d="m16 16 4 4" />
    </>
  ),
  fit: (
    <>
      <path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9" />
      <path d="M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9" />
      <path d="M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15" />
      <path d="M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15" />
    </>
  ),
  magnet: (
    <>
      <path d="M6 4v7a6 6 0 0 0 12 0V4" />
      <path d="M6 9.5h4M14 9.5h4" />
    </>
  ),
  history: (
    <>
      <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
      <path d="M3.5 4.5V10H9" />
      <path d="M12 8v4.5l3 1.8" />
    </>
  ),
  chevron: <path d="m9 6 6 6-6 6" />,
  dot: <circle cx="12" cy="12" r="4" />,
  edit: (
    <>
      <path d="M4 20h4l10-10a2.5 2.5 0 0 0-3.5-3.5L4.5 16.5V20Z" />
      <path d="m13.5 6.5 4 4" />
    </>
  ),
  wand: (
    <>
      <path d="m5 19 9-9" />
      <path d="M14.5 4.5 16 6M18.5 8.5 20 10M17 4l1.5 1.5M20.5 5.5 19 7" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11" />
      <path d="m7.5 11 4.5 4.5L16.5 11" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  scissors: (
    <>
      <circle cx="6.5" cy="17.5" r="2.5" />
      <circle cx="6.5" cy="6.5" r="2.5" />
      <path d="M8.6 8.4 20 19M20 5 8.6 15.6" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 1 0-5.7-5.7l-1.2 1.2" />
      <path d="M14 10.5a4 4 0 0 0-5.7 0l-2.8 2.8a4 4 0 1 0 5.7 5.7l1.2-1.2" />
    </>
  ),
  group: (
    <>
      <rect x="3.5" y="3.5" width="8" height="8" rx="1.5" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.5" />
      <path d="M11.5 7.5h5.5a1.5 1.5 0 0 1 1.5 1.5v3.5" />
    </>
  ),
  ungroup: (
    <>
      <rect x="3.5" y="3.5" width="8" height="8" rx="1.5" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.5" />
      <path d="M8 11.5v4M11.5 8h4" />
    </>
  ),
  arrange: <path d="M4 5h16M4 12h10M4 19h13" />,
  play: <path d="M8 5.5v13l11-6.5-11-6.5Z" />,
  pause: <path d="M9 5v14M15 5v14" />,
  clear: (
    <>
      <path d="M4.5 7h15" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="m10 11 4 4M14 11l-4 4" />
    </>
  ),
  shuffle: (
    <>
      <path d="M4 6h3.5l8 12H20" />
      <path d="M4 18h3.5l2-3" />
      <path d="m17 6 3 0" />
      <path d="m17.5 3.5 2.5 2.5-2.5 2.5" />
      <path d="m17.5 15.5 2.5 2.5-2.5 2.5" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  refresh: (
    <>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1" />
      <path d="M20.5 4.5V10H15" />
    </>
  ),
  x: <path d="m6 6 12 12M18 6 6 18" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </>
  ),
  save: (
    <>
      <path d="M4.5 4.5h11L20 9v10.5h-15Z" />
      <path d="M8 4.5v5h7" />
      <path d="M8 19.5v-5.5h8v5.5" />
    </>
  ),
  copy: (
    <>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" />
    </>
  ),
  paste: (
    <>
      <path d="M9 4.5h6v2H9z" />
      <path d="M7 6.5h10a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 17 20.5H7A1.5 1.5 0 0 1 5.5 19V8A1.5 1.5 0 0 1 7 6.5Z" />
      <path d="M9 12h6M9 16h4" />
    </>
  ),
  swap: (
    <>
      <path d="M4 8h13l-3-3" />
      <path d="M20 16H7l3 3" />
    </>
  ),
  queue: <path d="M4 7h16M4 12h16M4 17h9" />,
  shield: (
    <>
      <path d="M12 3.5 5 6v6c0 4.2 2.9 7.4 7 8.5 4.1-1.1 7-4.3 7-8.5V6l-7-2.5Z" />
      <path d="m9.2 12 2 2 3.6-3.8" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  warn: (
    <>
      <path d="M12 4.5 21 19.5H3L12 4.5Z" />
      <path d="M12 10v4.5" />
      <path d="M12 17.2h.01" />
    </>
  ),
  upload: (
    <>
      <path d="M12 15V4.5" />
      <path d="M8 8.5 12 4.5l4 4" />
      <path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15" />
    </>
  ),
  key: (
    <>
      <circle cx="8.5" cy="8.5" r="3.5" />
      <path d="M11 11l8 8" />
      <path d="M16.5 16.5 19 14" />
      <path d="M14 14l1.5 1.5" />
    </>
  ),
  pen: (
    <>
      <path d="M15.5 4.5 19.5 8.5" />
      <path d="M4.5 19.5 5 15.8l9.4-9.4 3.7 3.7-9.4 9.4-3.7.5Z" />
    </>
  ),
  home: <path d="M4 10.5 12 4l8 6.5V20H4z" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.2 2.4 3.3 5.3 3.3 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.3-5.3-3.3-8.5S9.8 5.9 12 3.5Z" />
    </>
  ),
  bolt: <path d="M13 3 5 13h6l-1 8 8-10h-6l1-8Z" />,
  // ↓ 设计稿引用了 `#i-send` 但未定义 ⇒ 本仓补（见文件头「设计稿未覆盖」）
  send: (
    <>
      <path d="M20.5 3.5 3.5 10.5l6.5 2.5 2.5 6.5 8-16Z" />
      <path d="m10 13 4.5-4.5" />
    </>
  ),
  // ↓ 设计稿的引用条里没有抓手元素 ⇒ 本仓补（见文件头「设计稿未覆盖」）
  grip: (
    <>
      <circle cx="9" cy="7" r="1.4" />
      <circle cx="15" cy="7" r="1.4" />
      <circle cx="9" cy="12" r="1.4" />
      <circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="17" r="1.4" />
      <circle cx="15" cy="17" r="1.4" />
    </>
  ),
};

/** 唯一的图标出口：`<Icon name="download" />` */
export function Icon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `${shared.icon} ${className}` : shared.icon}
      viewBox="0 0 24 24"
      aria-hidden="true"
    >
      {SHAPES[name]}
    </svg>
  );
}
