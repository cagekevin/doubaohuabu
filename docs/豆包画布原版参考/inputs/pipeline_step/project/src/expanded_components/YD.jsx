// TODO(全局, 无需 import): e, r, t, n
export default function YD(e, t, n) {
  let r = e.tmp;
  if (!r) {
    r = document.createElement('canvas');
    e.tmp = r;
  }
  if (r.width !== t || r.height !== n) {
    r.width = t;
    r.height = n;
  }
  return r;
}