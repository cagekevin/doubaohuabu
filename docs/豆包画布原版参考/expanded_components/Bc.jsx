// TODO(全局, 无需 import): n, d, f, e, r, t, s, o, p, h, a, m, l, c, u
export default async function Bc(e, t = 8) {
  if (!e || typeof document === 'undefined' || typeof Image === 'undefined') {
    return null;
  }
  try {
    const n = new Image();
    await new Promise((d, f) => {
      n.onload = () => {
        return d();
      };
      n.onerror = () => {
        return f(new Error('decode-fail'));
      };
      n.src = e;
    });
    const r = document.createElement('canvas');
    r.width = t;
    r.height = t;
    const s = r.getContext('2d');
    s.drawImage(n, 0, 0, t, t);
    const o = s.getImageData(0, 0, t, t).data;
    const a = new Array(t * t);
    let l = 0;
    for (let d = 0; d < t * t; d++) {
      const f = o[d * 4];
      const p = o[d * 4 + 1];
      const h = o[d * 4 + 2];
      const m = f * 0.299 + p * 0.587 + h * 0.114;
      a[d] = m;
      l += m;
    }
    const c = l / a.length;
    let u = 0n;
    for (let d = 0; d < a.length; d++) {
      if (a[d] >= c) {
        u |= 1n << BigInt(d);
      }
    }
    return u.toString(16).padStart(16, '0');
  } catch {
    return null;
  }
}