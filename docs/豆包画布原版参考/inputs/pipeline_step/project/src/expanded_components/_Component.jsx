// TODO(全局, 无需 import): onSelectionContextMenu, noPanClassName, disableKeyboardA11y, width, height, transformString, userSelectionActive, u, h, preventScroll, n, s, o, nodeRef, disabled, e, r, w, m, c, direction, factor, t, transform, a, f, p
import { Ut, Et, fI, Vt, Lb, Db, Rc, Zt } from "./shared.js";
import * as g from 'react';
export default function _Component({
  onSelectionContextMenu: e,
  noPanClassName: t,
  disableKeyboardA11y: n
}) {
  const r = Ut();
  const {
    width: s,
    height: o,
    transformString: a,
    userSelectionActive: l
  } = Et(fI, Vt);
  const c = Lb();
  const u = g.useRef(null);
  g.useEffect(() => {
    var h;
    if (!n && (h = u.current) != null) {
      h.focus({
        preventScroll: true
      });
    }
  }, [n]);
  const d = !l && s !== null && o !== null;
  Db({
    nodeRef: u,
    disabled: !d
  });
  if (!d) {
    return null;
  }
  const f = e ? h => {
    const m = r.getState().nodes.filter(w => {
      return w.selected;
    });
    e(h, m);
  } : undefined;
  const p = h => {
    if (Object.prototype.hasOwnProperty.call(Rc, h.key)) {
      h.preventDefault();
      c({
        direction: Rc[h.key],
        factor: h.shiftKey ? 4 : 1
      });
    }
  };
  return <div className={Zt(['react-flow__nodesselection', 'react-flow__container', t])} style={{
    transform: a
  }}>
      <div ref={u} className="react-flow__nodesselection-rect" onContextMenu={f} tabIndex={n ? undefined : -1} onKeyDown={n ? undefined : p} style={{
      width: s,
      height: o
    }} />
    </div>;
}