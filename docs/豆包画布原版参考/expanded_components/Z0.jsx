// TODO(全局, 无需 import): n, t, e
import { L } from './shared.js';
import * as g from 'react';
export default function Z0() {
  const e = L(n => {
    return n.saveError;
  });
  const t = L(n => {
    return n.setSaveError;
  });
  g.useEffect(() => {
    if (!e) {
      return;
    }
    const n = setTimeout(() => {
      return t(null);
    }, 8000);
    return () => {
      return clearTimeout(n);
    };
  }, [e, t]);
  if (e) {
    return <div className="save-error-banner" role="alert">
        <span className="save-error-text">⚠️ {e.message}</span>
        <button className="save-error-close" title="关闭提示" onClick={() => {
        return t(null);
      }}>
          ×
        </button>
      </div>;
  } else {
    return null;
  }
}