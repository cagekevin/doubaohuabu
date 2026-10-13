// TODO(全局, 无需 import): data, isConnectable, targetPosition, sourcePosition, n, t, e, r
import { pt, Mn } from './shared.js';
import * as i from 'react';
export default function lI({
  data: e,
  isConnectable: t,
  targetPosition: n = pt.Top,
  sourcePosition: r = pt.Bottom
}) {
  return <i.Fragment>
      <Mn type="target" position={n} isConnectable={t} />
      {e == null ? undefined : e.label}
      <Mn type="source" position={r} isConnectable={t} />
    </i.Fragment>;
}