// TODO(全局, 无需 import): userSelectionActive, userSelectionRect, e, t, width, height, transform
import { Et, Y2, Vt } from './shared.js';
export default function X2() {
  const {
    userSelectionActive: e,
    userSelectionRect: t
  } = Et(Y2, Vt);
  if (e && t) {
    return <div className="react-flow__selection react-flow__container" style={{
      width: t.width,
      height: t.height,
      transform: `translate(${t.x}px, ${t.y}px)`
    }} />;
  } else {
    return null;
  }
}