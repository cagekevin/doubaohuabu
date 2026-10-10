// TODO(全局, 无需 import): e
import { ap } from './shared.js';
export default function _Component31({
  ap: e
}) {
  return <div className="mpp-wait">
      <div className="mpp-wait-row">
        <span className="mpp-spinner" aria-hidden="true" />
        <span className="mpp-wait-text">{e.phase || '正在分析，请稍候…'}</span>
      </div>
      <div className="mpp-shimmer">
        <span />
        <span />
        <span />
      </div>
    </div>;
}