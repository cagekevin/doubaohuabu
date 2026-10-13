// TODO(全局, 无需 import): open, anchor, onCancel, onPick, variant, s, m, e, c, w, n, f, u, t, panelWidth, l, a, d, left, bottom, maxHeight, visibility, o, h, p, r
import { L, xL, vw, vh, Xt } from './shared.js';
import * as g from 'react';
export default function _Component33({
  open: e,
  anchor: t,
  onCancel: n,
  onPick: r,
  variant: s = 'grid'
}) {
  const o = s === 'list';
  const a = L(m => {
    return m.library;
  });
  const [l, c] = g.useState('');
  const u = g.useRef(null);
  const [d, f] = g.useState(null);
  g.useEffect(() => {
    if (e) {
      c('');
    }
  }, [e]);
  g.useEffect(() => {
    if (!e) {
      return;
    }
    const m = w => {
      if (w.key === 'Escape') {
        w.preventDefault();
        n();
      }
    };
    window.addEventListener('keydown', m, true);
    return () => {
      return window.removeEventListener('keydown', m, true);
    };
  }, [e, n]);
  g.useLayoutEffect(() => {
    if (!e) {
      f(null);
      return;
    }
    const m = u.current;
    if (m) {
      f(xL({
        anchor: t,
        panelWidth: m.offsetWidth,
        vw: window.innerWidth,
        vh: window.innerHeight
      }));
    }
  }, [e, t]);
  const p = g.useMemo(() => {
    const m = l.trim().toLowerCase();
    if (m) {
      return a.filter(w => {
        return String(w.name || '').toLowerCase().includes(m);
      });
    } else {
      return a;
    }
  }, [a, l]);
  if (!e) {
    return null;
  }
  const h = d ? {
    left: d.left,
    top: d.top,
    bottom: d.bottom,
    maxHeight: d.maxHeight
  } : {
    left: 0,
    top: 0,
    visibility: 'hidden'
  };
  return <div className="panel-backdrop" onMouseDown={n}>
      <div ref={u} className={`lib-picker ref-picker${o ? ' is-list' : ''}`} style={h} onMouseDown={m => {
      return m.stopPropagation();
    }}>
        <div className="lib-picker-title">{o ? '选择要引用的素材' : '引用素材到文本框'}</div>
        <div className="ref-picker-search">
          <input type="text" value={l} placeholder="搜索素材名称…" onChange={m => {
          return c(m.target.value);
        }} onMouseDown={m => {
          m.stopPropagation();
        }} />
        </div>
        {a.length === 0 ? <div className="lib-picker-empty">资源库为空，请先从右侧资源库或文件添加素材。</div> : p.length === 0 ? <div className="lib-picker-empty">没有匹配「{l}」的素材</div> : o ? <div className="lib-picker-list">
            {p.map(m => {
          return <button type="button" className="lib-pick-row" title={`引用「${m.name || '未命名素材'}」到文本框`} onMouseDown={w => {
            return w.preventDefault();
          }} onClick={() => {
            r(m);
            n();
          }} key={m.id}>
                  {m.dataUrl ? <img className="lib-pick-row-thumb" src={Xt(m.dataUrl, 120)} alt="" /> : <div className="lib-pick-row-thumb is-noimg">
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="3" width="18" height="18" rx="2.5" />
                        <circle cx="9" cy="10" r="2" />
                        <path d="M21 15l-3.5-4.5L14 15l-1.5 2H21v-2z" />
                      </svg>
                    </div>}
                  <span className="lib-pick-row-name">{m.name}</span>
                  <span className="lib-pick-row-act">引用</span>
                </button>;
        })}
          </div> : <div className="lib-picker-grid">
            {p.map(m => {
          return <button type="button" className="lib-pick-item" title={`引用「${m.name || '未命名素材'}」到文本框`} onMouseDown={w => {
            return w.preventDefault();
          }} onClick={() => {
            r(m);
            n();
          }} key={m.id}>
                  {m.dataUrl ? <img src={Xt(m.dataUrl, 240)} alt="" /> : <div className="ref-pick-noimg">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
                        <rect x="3" y="3" width="18" height="18" rx="2.5" />
                        <circle cx="9" cy="10" r="2" />
                        <path d="M21 15l-3.5-4.5L14 15l-1.5 2H21v-2z" />
                      </svg>
                      <span>无预览</span>
                    </div>}
                  <span>{m.name}</span>
                </button>;
        })}
          </div>}
        <div className="lib-picker-foot">
          <span className="ref-picker-hint">
            {o ? '点击素材即插入引用芯片并关闭面板' : '点击素材即插入到文本框光标处并关闭面板'}
          </span>
          <button className="btn sm ghost" onClick={n}>
            完成
          </button>
        </div>
      </div>
    </div>;
}