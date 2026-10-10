// TODO(全局, 无需 import): data, isConnectable, targetPosition, n, t, e
import { pt, Mn } from './shared.js';
import * as i from 'react';
export default function uI({
  data: e,
  isConnectable: t,
  targetPosition: n = pt.Top
}) {
  return <i.Fragment>
      <Mn type="target" position={n} isConnectable={t} />
      {e == null ? undefined : e.label}
    </i.Fragment>;
}