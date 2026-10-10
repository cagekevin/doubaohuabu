// TODO(全局, 无需 import): dimensions, lineWidth, variant, className, t, e, n, r
import { Zt } from './shared.js';
export default function _Component15({
  dimensions: e,
  lineWidth: t,
  variant: n,
  className: r
}) {
  return <path strokeWidth={t} d={`M${e[0] / 2} 0 V${e[1]} M0 ${e[1] / 2} H${e[0]}`} className={Zt(['react-flow__background-pattern', n, r])} />;
}