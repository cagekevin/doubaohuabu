// TODO(全局, 无需 import): section, isCollapsed, active, onSelect, onToggleCollapse, editingGroupId, renameValue, renameInputRef, onRenameChange, onRenameConfirm, onStartRename, onDeleteGroup, onSelectAll, onDeselectAll, onSetColor, onToggleAutoStart, renderAccountRow, x, k, b, C, q, left, width, max, thumbH, trackH, e, n, U, M, y, E, Ie, he, De, O, te, le, I, X, ce, oe, t, _, z, R, D, A, j, ke, V, P, borderLeftColor, borderLeftWidth, s, r, F, background, S, o, l, a, c, u, d, H, w, f, N, position, m, J, maxHeight, transform, v, pe, se, height, ne, opacity
import { on, IP } from './shared.js';
import * as g from 'react';
export default function RP({
  section: e,
  isCollapsed: t,
  active: n,
  onSelect: r,
  onToggleCollapse: s,
  editingGroupId: o,
  renameValue: a,
  renameInputRef: l,
  onRenameChange: c,
  onRenameConfirm: u,
  onStartRename: d,
  onDeleteGroup: f,
  onSelectAll: p,
  onDeselectAll: h,
  onSetColor: m,
  onToggleAutoStart: w,
  renderAccountRow: v
}) {
  const y = g.useRef(null);
  const b = g.useRef(null);
  const [x, k] = g.useState(false);
  const [N, C] = g.useState(null);
  const S = g.useCallback(() => {
    if (x) {
      k(false);
      return;
    }
    if (b.current) {
      const q = b.current.getBoundingClientRect();
      C({
        top: q.bottom + 4,
        left: q.left,
        width: Math.max(q.width, 196)
      });
    }
    k(true);
  }, [x]);
  g.useEffect(() => {
    if (!x) {
      return;
    }
    const q = () => {
      return k(false);
    };
    document.addEventListener('mousedown', q);
    return () => {
      return document.removeEventListener('mousedown', q);
    };
  }, [x]);
  const E = g.useRef(null);
  const P = g.useRef(null);
  const [j, I] = g.useState(0);
  const [z, O] = g.useState({
    max: 0,
    thumbH: 0,
    trackH: 0
  });
  const R = g.useRef(false);
  const D = g.useRef(0);
  const A = g.useRef(0);
  const F = e.groupId || '__ungrouped__';
  const M = e.accounts;
  const U = !e.groupId;
  const _ = n || U;
  const H = M.length > 0 && M.every(q => {
    return q.autoStart === true;
  });
  g.useEffect(() => {
    const q = y.current;
    if (!q) {
      return;
    }
    const ce = () => {
      const he = q.clientHeight;
      const Ie = E.current ? E.current.offsetHeight : 0;
      const De = Math.max(0, Ie - he);
      const le = he;
      const te = De > 0 ? Math.max(28, he / Ie * he) : 0;
      O({
        max: De,
        thumbH: te,
        trackH: le
      });
      I(X => {
        return Math.min(X, De);
      });
    };
    ce();
    const oe = new ResizeObserver(ce);
    oe.observe(q);
    if (E.current) {
      oe.observe(E.current);
    }
    return () => {
      return oe.disconnect();
    };
  }, [M.length, t, _]);
  const J = g.useCallback(q => {
    if (!_ || z.max <= 0) {
      return;
    }
    q.preventDefault();
    q.stopPropagation();
    const ce = q.deltaY || q.deltaX || 0;
    I(oe => {
      return Math.max(0, Math.min(oe + ce, z.max));
    });
  }, [_, z.max]);
  const se = g.useCallback(q => {
    q.preventDefault();
    q.stopPropagation();
    R.current = true;
    D.current = q.clientY;
    A.current = j;
    document.addEventListener('mousemove', ke);
    document.addEventListener('mouseup', V);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
  }, [j]);
  const ke = g.useCallback(q => {
    if (!R.current) {
      return;
    }
    const ce = q.clientY - D.current;
    const {
      max: oe,
      thumbH: he,
      trackH: Ie
    } = z;
    const De = oe > 0 && Ie > he ? oe / (Ie - he) : 0;
    I(Math.max(0, Math.min(A.current + ce * De, oe)));
  }, [z]);
  const V = g.useCallback(() => {
    R.current = false;
    document.removeEventListener('mousemove', ke);
    document.removeEventListener('mouseup', V);
    document.body.style.userSelect = '';
    document.body.style.cursor = '';
  }, [ke]);
  const pe = g.useCallback(q => {
    if (q.target !== q.currentTarget && q.target !== P.current) {
      return;
    }
    const ce = q.currentTarget.getBoundingClientRect();
    const oe = q.clientY - ce.top;
    const {
      max: he,
      thumbH: Ie,
      trackH: De
    } = z;
    const le = he > 0 ? j / he * (De - Ie) : 0;
    const te = oe < le + Ie / 2 ? j - De * 0.8 : j + De * 0.8;
    I(Math.max(0, Math.min(te, he)));
  }, [z, j]);
  const ne = z.max > 0 ? j / z.max * (z.trackH - z.thumbH) : 0;
  return <div className={`account-group${_ ? ' active' : ''}${e.groupId ? '' : ' ungrouped'}`} style={e.color ? {
    borderLeftColor: e.color,
    borderLeftWidth: 3
  } : undefined}>
      {e.groupId && <div className="group-header" onClick={() => {
      s();
      r(F);
    }} title="单击展开/收起该分组">
          {e.groupId && <button ref={b} className={`group-color-dot${e.color ? '' : ' no-color'}`} style={e.color ? {
        background: e.color
      } : undefined} title="设置分组颜色" onClick={q => {
        q.stopPropagation();
        S();
      }} />}
          {o === e.groupId ? <input ref={l} className="group-rename-input" value={a} onChange={q => {
        return c(q.target.value);
      }} onKeyDown={q => {
        if (q.key === 'Enter') {
          u();
        }
        if (q.key === 'Escape') {
          c('');
        }
      }} onBlur={u} onClick={q => {
        return q.stopPropagation();
      }} /> : <span className="group-title" onClick={q => {
        q.stopPropagation();
        s();
        r(F);
      }} onDoubleClick={q => {
        q.stopPropagation();
        if (e.groupId) {
          d(e);
        }
      }} title={e.groupId ? '单击展开/收起；双击重命名' : '单击展开/收起'}>
              {e.groupName}
              {M.length > 0 && <span className="group-count">{M.length}</span>}
            </span>}
          <span className="group-actions">
            <button className={`autostart-switch group-sw${H ? ' on' : ''}`} role="switch" aria-checked={H} style={H && e.color ? {
          background: e.color
        } : undefined} onClick={q => {
          q.stopPropagation();
          w();
        }} title={H ? '自启动：全开（组内账号在软件启动时自动加载）— 点击全部关闭' : '自启动：非全开 — 点击把组内全部账号设为开启'}>
              <span className="autostart-knob" />
            </button>
            {e.groupId && <button className="group-action-btn danger" onClick={q => {
          q.stopPropagation();
          f();
        }} title="删除分组">
                ✕
              </button>}
          </span>
        </div>}
      {x && e.groupId && N && on.createPortal(<div className="group-color-popover nodrag nopan" style={{
      position: 'fixed',
      top: N.top,
      left: N.left,
      width: N.width
    }} onMouseDown={q => {
      return q.stopPropagation();
    }}>
            {IP.map(q => {
        return <button className={`group-palette-item${e.color === q ? ' selected' : ''}`} style={{
          background: q
        }} title="选择该颜色" onClick={() => {
          m(e.groupId, q);
          k(false);
        }} key={q} />;
      })}
            <button className={`group-palette-none${e.color ? '' : ' selected'}`} title="清除颜色（不分类）" onClick={() => {
        m(e.groupId, null);
        k(false);
      }}>
              无颜色
            </button>
          </div>, document.body)}
      {!t && <div className="group-scroll-wrap" ref={y} onWheel={J} style={{
      maxHeight: U ? 'max(160px, calc(100vh - 345px))' : _ ? '340px' : '150px'
    }}>
          <div className="group-body" ref={E} style={{
        transform: `translateY(-${j}px)`
      }}>
            {M.length === 0 ? <div className="group-empty">{e.groupId ? '该分组暂无账号' : '暂无未分组账号'}</div> : M.map(v)}
          </div>
          {_ && z.max > 0 && <div className="group-scrollbar" onClick={pe}>
              <div ref={P} className="account-scroll-thumb" onMouseDown={se} style={{
          height: `${z.thumbH}px`,
          transform: `translateY(${ne}px)`,
          opacity: R.current ? 0.85 : 0.55
        }} />
            </div>}
        </div>}
    </div>;
}