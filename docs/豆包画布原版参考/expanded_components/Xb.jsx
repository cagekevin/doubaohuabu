// TODO(全局, 无需 import): e, t, n, r, borderRadius, offset, o, s
import { id, Kb } from './shared.js';
import * as g from 'react';
export default function Xb(e) {
  return g.memo(({
    id: t,
    ...n
  }) => {
    var s;
    const r = e.isInternal ? undefined : t;
    return <Kb {...n} id={r} pathOptions={g.useMemo(() => {
      var o;
      return {
        borderRadius: 0,
        offset: (o = n.pathOptions) == null ? undefined : o.offset
      };
    }, [(s = n.pathOptions) == null ? undefined : s.offset])} />;
  });
}