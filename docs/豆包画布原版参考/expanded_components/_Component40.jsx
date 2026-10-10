// TODO(全局, 无需 import): f, e, p, h, o, r, n, l, c, left, u, d, t, a, effect, strength, pad, s
import { L, Fu, t3 } from './shared.js';
import * as g from 'react';
export default function _Component40() {
  const e = L(f => {
    return f.faceMaskPanel;
  });
  const t = L(f => {
    return f.faceMaskOpts;
  });
  const n = L(f => {
    return f.setFaceMaskOpts;
  });
  const r = L(f => {
    return f.closeFaceMaskPanel;
  });
  const s = L(f => {
    var p;
    var h;
    if (e) {
      return (((h = (p = f.faceMarks) == null ? undefined : p[e.nodeId]) == null ? undefined : h.faces) || []).length;
    } else {
      return 0;
    }
  });
  const o = g.useRef(null);
  g.useEffect(() => {
    if (!e) {
      return;
    }
    const f = h => {
      if (o.current && !o.current.contains(h.target)) {
        r();
      }
    };
    const p = h => {
      if (h.key === 'Escape') {
        r();
      }
    };
    document.addEventListener('mousedown', f, true);
    document.addEventListener('keydown', p);
    return () => {
      document.removeEventListener('mousedown', f, true);
      document.removeEventListener('keydown', p);
    };
  }, [e, r]);
  const a = g.useCallback(f => {
    return n(f);
  }, [n]);
  if (!e) {
    return null;
  }
  const l = 232;
  const c = 236;
  const u = Math.max(8, Math.min(e.x, (window.innerWidth || 1200) - l - 8));
  const d = Math.max(8, Math.min(e.y, (window.innerHeight || 800) - c - 8));
  return <div className="face-mask-panel nodrag nopan" ref={o} style={{
    left: u,
    top: d
  }} onMouseDown={f => {
    return f.stopPropagation();
  }} onDoubleClick={f => {
    return f.stopPropagation();
  }}>
      <div className="fmp-head">
        <span className="fmp-title">遮脸参数</span>
        <button type="button" className="fmp-close" title="关闭（Esc）" onClick={r}>
          ✕
        </button>
      </div>
      <div className="fmp-body">
        <div className="fmp-label">遮脸方式</div>
        <div className="fmp-effects">
          {Fu.map(f => {
          return <button type="button" className={`fmp-effect${t.effect === f.value ? ' is-active' : ''}`} title={f.hint} onClick={() => {
            return a({
              effect: f.value
            });
          }} key={f.value}>
                {f.label}
              </button>;
        })}
        </div>
        <div className="fmp-hint">{t3[t.effect] || ''}</div>
        <div className="fmp-row">
          <span className="fmp-label">强度</span>
          <span className="fmp-val">{t.strength.toFixed(1)}×</span>
        </div>
        <input type="range" className="fmp-range" min="0.4" max="3" step="0.1" value={t.strength} onChange={f => {
        return a({
          strength: Number(f.target.value)
        });
      }} />
        <div className="fmp-row">
          <span className="fmp-label">范围外扩</span>
          <span className="fmp-val">{Math.round(t.pad * 100)}%</span>
        </div>
        <input type="range" className="fmp-range" min="0" max="0.6" step="0.02" value={t.pad} onChange={f => {
        return a({
          pad: Number(f.target.value)
        });
      }} />
        <div className="fmp-foot">
          {s > 0 ? `单击角标即按此参数遮脸（当前 ${s} 张脸）` : '单击角标即按此参数遮脸'}
        </div>
      </div>
    </div>;
}