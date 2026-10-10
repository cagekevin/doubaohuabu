// TODO(全局, 无需 import): position, children, className, style, e, n, a, r, o, s, t
import { Zt } from './shared.js';
import * as g from 'react';
const Mu = g.forwardRef(({
  position: e = 'top-left',
  children: t,
  className: n,
  style: r,
  ...s
}, o) => {
  const a = `${e}`.split('-');
  return <div className={Zt(['react-flow__panel', n, ...a])} style={r} ref={o} {...s}>
        {t}
      </div>;
});
export default Mu;