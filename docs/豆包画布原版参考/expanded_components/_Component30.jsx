// TODO(全局, 无需 import): source, e, t
import { pt, Mn } from './shared.js';
import * as i from 'react';
export default function _Component30({
  target: e = true,
  source: t = true
}) {
  return <i.Fragment>
      {e ? <Mn type="target" position={pt.Left} /> : null}
      {t ? <Mn type="source" position={pt.Right} /> : null}
    </i.Fragment>;
}