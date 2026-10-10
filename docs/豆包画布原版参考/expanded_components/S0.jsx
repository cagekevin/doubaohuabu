// TODO(全局, 无需 import): e, n, r, t, s, o, a, u, l, c, d
import { jp } from './shared.js';
const S0 = (e, t = jp) => {
  return new Promise(n => {
    if (!e || !e.startsWith('data:')) {
      n(e);
      return;
    }
    const r = new Image();
    r.crossOrigin = 'anonymous';
    r.decoding = 'async';
    r.onload = () => {
      try {
        const s = r.naturalWidth || 1;
        const o = r.naturalHeight || 1;
        const a = Math.min(1, t / Math.max(s, o));
        const l = Math.max(1, Math.round(s * a));
        const c = Math.max(1, Math.round(o * a));
        const u = document.createElement('canvas');
        u.width = l;
        u.height = c;
        const d = u.getContext('2d');
        d.imageSmoothingEnabled = true;
        d.imageSmoothingQuality = 'medium';
        d.drawImage(r, 0, 0, l, c);
        n(u.toDataURL('image/png'));
      } catch {
        n(e);
      }
    };
    r.onerror = () => {
      return n(e);
    };
    r.src = e;
  });
};
export default S0;