// TODO(全局, 无需 import): rfId, e, t
import { Et, b2, x2, w2 } from './shared.js';
export default function S2({
  rfId: e
}) {
  const t = Et(b2);
  return <div id={`${x2}-${e}`} aria-live="assertive" aria-atomic="true" style={w2}>
      {t}
    </div>;
}