// TODO(全局, 无需 import): t, e, r, a, s, o, l, c, n, p, u, h, d, m, f, w, v, y, b, x, effect, strength, opacity, dataUrl, k, mime
import { eL, Nl, Sl, ZD, bS, tL } from './shared.js';
export default async function nL(e, t, n = {}) {
  if (!e) {
    throw new Error('图片源为空');
  }
  if (!t || !t.nw || !t.nh) {
    throw new Error('人脸框无效');
  }
  const r = await eL(e);
  const s = r.naturalWidth || r.width || 0;
  const o = r.naturalHeight || r.height || 0;
  if (!s || !o) {
    throw new Error('图片尺寸无效');
  }
  const a = document.createElement('canvas');
  a.width = s;
  a.height = o;
  a.getContext('2d').drawImage(r, 0, 0);
  const l = document.createElement('canvas');
  l.width = s;
  l.height = o;
  const c = l.getContext('2d');
  c.drawImage(a, 0, 0);
  const u = n.pad == null ? Nl.pad : n.pad;
  const d = t.nx * s;
  const f = t.ny * o;
  const p = t.nw * s;
  const h = t.nh * o;
  const m = p * u;
  const w = h * u;
  const v = Sl(d - m, 0, s);
  const y = Sl(f - w, 0, o);
  const b = Sl(p + m * 2, 0, s - v);
  const x = Sl(h + w * 2, 0, o - y);
  if (b > 0 && x > 0) {
    c.save();
    c.beginPath();
    c.rect(v, y, b, x);
    c.clip();
    ZD(c, a, v, y, b, x, {
      effect: n.effect || Nl.effect,
      strength: n.strength == null ? Nl.strength : n.strength,
      opacity: n.opacity == null ? Nl.opacity : n.opacity
    }, bS());
    c.restore();
  }
  const k = tL(e) ? 'image/png' : 'image/jpeg';
  return {
    dataUrl: k === 'image/jpeg' ? l.toDataURL('image/jpeg', 0.92) : l.toDataURL('image/png'),
    w: s,
    h: o,
    mime: k
  };
}