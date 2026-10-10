// TODO(全局, 无需 import): t, n, r, s, o, a, e, l
export default function QD(e, t, n, r) {
  const s = `${t}_${n}`;
  if (r.tiles[s]) {
    return r.tiles[s];
  }
  const o = document.createElement('canvas');
  o.width = n;
  o.height = n;
  const a = o.getContext('2d');
  if (t === 'dots') {
    a.fillStyle = '#ffffff';
    a.beginPath();
    a.arc(n / 2, n / 2, n * 0.3, 0, Math.PI * 2);
    a.fill();
  } else {
    a.strokeStyle = '#ffffff';
    a.lineWidth = Math.max(1, n * 0.1);
    a.beginPath();
    a.moveTo(0, 0);
    a.lineTo(n, 0);
    a.moveTo(0, 0);
    a.lineTo(0, n);
    a.stroke();
  }
  const l = e.createPattern(o, 'repeat');
  r.tiles[s] = l;
  return l;
}