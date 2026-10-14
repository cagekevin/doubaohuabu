import type { CSSProperties } from 'react';

/**
 * 内联样式 **＋ CSS 自定义属性**（`--x`）—— 唯一转换点
 *
 * ⚠️ React 的 `CSSProperties` 里**没有** `--*` 自定义属性 ⇒ 直接在 JSX 里写
 *    `{ '--x': … } as unknown as CSSProperties` 会逼**每个消费点各跨一次断言**。
 *    这里入参按 `CSSProperties` 校验（普通属性拼错照样编译不过），自定义属性走索引签名
 *    ⇒ 返回类型就是 `CSSProperties`，**不需要断言**。
 *
 * 消费者：`ui/panels/SendQueuePanel`（面板尺寸）· `ui/nodes/CustomHandle`（端口锚点）。
 */
export const cssVars = (
  style: CSSProperties & Record<string, string | number>,
): CSSProperties => style;
