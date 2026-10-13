// TODO(全局, 无需 import): e, n, t, r, a, s, o, l
export default function OD(e, t) {
  const n = e.naturalWidth || e.width;
  const r = e.naturalHeight || e.height;
  const s = Math.max(1, Math.round(n * t));
  const o = Math.max(1, Math.round(r * t));
  const a = document.createElement('canvas');
  a.width = s;
  a.height = o;
  const l = a.getContext('2d');
  l.imageSmoothingEnabled = true;
  l.imageSmoothingQuality = 'high';
  l.drawImage(e, 0, 0, s, o);
  return a;
}