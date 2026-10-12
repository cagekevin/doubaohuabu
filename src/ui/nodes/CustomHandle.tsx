/**
 * 自绘连接端口（`NodeShell` 的左右端口）
 *
 * 结构：一个**透明**的 ReactFlow `Handle`（真正吃指针 / 参与连线测量）+ 三个纯视觉层
 *   `ring` / `plus` / `dot` —— 悬停时 `dot` 缩小消失、`ring` 放大发光、`plus` 跟随鼠标轻微位移。
 * 位移靠 CSS 变量 `--cust-shift-x/y` 驱动（`mousemove` 走 rAF 合帧，且只在 `mouseenter`
 *   时缓存一次端口圆心 —— 不做「读布局 → 写样式」同帧，避免 forced reflow）。
 *
 * ⚠️ 端口整体**外移半个自身尺寸**（`left/right: -half`），使**圆心恰好落在节点边缘上**。
 * ⚠️ 外观改动需同时看 `CustomHandle.module.css`，别只改这里。
 */

import { useEffect, useRef, type CSSProperties } from 'react';
import { Handle, Position } from '@xyflow/react';
import styles from './CustomHandle.module.css';

export type CustomHandleVariant = 'large' | 'small';

export interface CustomHandleProps {
  /** 左 = target（接收）/ 右 = source（产出） */
  position: 'left' | 'right';
  variant?: CustomHandleVariant;
  /** 端口 id（写死连线契约的节点用；不传 = ReactFlow 的 null handle） */
  handleId?: string;
  /** 距节点顶部的偏移（不传 = 垂直居中） */
  top?: number | string;
}

export function CustomHandle({ position, variant = 'large', handleId, top }: CustomHandleProps) {
  const isLeft = position === 'left';
  const size = variant === 'large' ? 48 : 32;
  const half = size / 2;
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let cachedCx = 0;
    let cachedCy = 0;
    let raf = 0;
    let pending: { x: number; y: number } | null = null;

    const flush = (): void => {
      raf = 0;
      const p = pending;
      pending = null;
      if (!p) return;
      let dx = Math.max(-14, Math.min(14, (p.x - cachedCx) * 0.35));
      const dy = Math.max(-14, Math.min(14, (p.y - cachedCy) * 0.35));
      if (isLeft) dx = Math.min(0, dx);
      else dx = Math.max(0, dx);
      el.style.setProperty('--cust-shift-x', `${dx}px`);
      el.style.setProperty('--cust-shift-y', `${dy}px`);
    };

    const onEnter = (): void => {
      const r = el.getBoundingClientRect();
      cachedCx = r.left + r.width / 2;
      cachedCy = r.top + r.height / 2;
    };
    const onMove = (e: MouseEvent): void => {
      pending = { x: e.clientX, y: e.clientY };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onLeave = (): void => {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
      pending = null;
      el.style.setProperty('--cust-shift-x', '0px');
      el.style.setProperty('--cust-shift-y', '0px');
    };

    el.addEventListener('mouseenter', onEnter);
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => {
      el.removeEventListener('mouseenter', onEnter);
      el.removeEventListener('mousemove', onMove);
      el.removeEventListener('mouseleave', onLeave);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isLeft]);

  const wrapStyle = {
    top: top !== undefined ? `calc(${top} - ${half}px)` : `calc(50% - ${half}px)`,
    width: size,
    height: size,
    ...(isLeft ? { left: -half } : { right: -half }),
    '--cust-anchor-x': '50%',
  } as unknown as CSSProperties;

  return (
    <div
      ref={ref}
      className={`${styles.wrap} ${variant === 'small' ? styles.isSmall : ''}`}
      style={wrapStyle}
    >
      <Handle
        type={isLeft ? 'target' : 'source'}
        position={isLeft ? Position.Left : Position.Right}
        id={handleId}
        className={styles.handle}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
          minWidth: 0,
          minHeight: 0,
          margin: 0,
          transform: 'none',
          background: 'transparent',
          border: 0,
          borderRadius: 0,
          opacity: 0,
        }}
      />
      <span className={styles.ring} />
      <span className={styles.plus} />
      <span className={styles.dot} />
    </div>
  );
}
