// TODO(全局, 无需 import): data, isConnectable, sourcePosition, e, n, t
import { pt, Mn } from './shared.js';
import * as i from 'react';
export default function iI({
  data: e,
  isConnectable: t,
  sourcePosition: n = pt.Bottom
}) {
  return <i.Fragment>
      {e == null ? undefined : e.label}
      <Mn type="source" position={n} isConnectable={t} />
    </i.Fragment>;
}