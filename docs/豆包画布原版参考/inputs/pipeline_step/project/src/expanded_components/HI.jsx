// TODO(全局, 无需 import): children, t, a, s, n, o, transform, r, e
import { Ut, Pb, ky } from './shared.js';
import * as g from 'react';
export default function HI({
  children: e
}) {
  const t = Ut();
  const n = g.useRef(null);
  const [r] = g.useState(() => {
    return t.getState().transform;
  });
  Pb(() => {
    let s = null;
    const o = () => {
      const a = t.getState().transform;
      if (!s || a[0] !== s[0] || a[1] !== s[1] || a[2] !== s[2]) {
        s = a;
        if (n.current) {
          n.current.style.transform = ky(a);
        }
      }
    };
    o();
    return t.subscribe(o);
  }, [t]);
  return <div ref={n} className="react-flow__viewport xyflow__viewport react-flow__container" style={{
    transform: ky(r)
  }}>
      {e}
    </div>;
}