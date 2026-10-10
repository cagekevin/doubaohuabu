// TODO(全局, 无需 import): proOptions, position, e, t
import _cmp_Mu from './Mu.jsx';
import { ny } from './shared.js';
export default function C2({
  proOptions: e,
  position: t = 'bottom-right'
}) {
  if (e != null && e.hideAttribution) {
    return null;
  } else {
    return <_cmp_Mu position={t} className="react-flow__attribution" data-message={`Please only hide this attribution when you are subscribed to React Flow Pro: ${ny}`}>
        <a href={ny} target="_blank" rel="noopener noreferrer" aria-label="React Flow attribution">
          React Flow
        </a>
      </_cmp_Mu>;
  }
}