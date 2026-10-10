// TODO(全局, 无需 import): rfId, disableKeyboardA11y, e, t, n
import _cmp_S2 from './S2.jsx';
import { Et, k2, jb, ty, _b } from './shared.js';
import * as i from 'react';
export default function N2({
  rfId: e,
  disableKeyboardA11y: t
}) {
  const n = Et(k2);
  return <i.Fragment>
      <div id={`${jb}-${e}`} style={ty}>
        {t ? n['node.a11yDescription.default'] : n['node.a11yDescription.keyboardDisabled']}
      </div>
      <div id={`${_b}-${e}`} style={ty}>
        {n['edge.a11yDescription.default']}
      </div>
      {!t && <_cmp_S2 rfId={e} />}
    </i.Fragment>;
}