// TODO(全局, 无需 import): onSelectionChange, e, t
import { Et, A2, _2 } from './shared.js';
export default function I2({
  onSelectionChange: e
}) {
  const t = Et(A2);
  if (e || t) {
    return <_2 onSelectionChange={e} />;
  } else {
    return null;
  }
}