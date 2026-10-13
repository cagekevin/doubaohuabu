// TODO(全局, 无需 import): r, n, s, a, u, l, c, t, d, e
export default function J3(e) {
  return new Promise((t, n) => {
    const r = new FileReader();
    r.onerror = () => {
      return n(new Error('读取图片失败'));
    };
    r.onload = () => {
      const s = new Image();
      s.onerror = () => {
        return n(new Error('解析图片失败'));
      };
      s.onload = () => {
        const a = Math.min(1, 560 / Math.max(s.width, s.height));
        const l = Math.max(1, Math.round(s.width * a));
        const c = Math.max(1, Math.round(s.height * a));
        const u = document.createElement('canvas');
        u.width = l;
        u.height = c;
        const d = u.getContext('2d');
        if (!d) {
          t(String(r.result));
          return;
        }
        d.drawImage(s, 0, 0, l, c);
        try {
          t(u.toDataURL('image/jpeg', 0.82));
        } catch {
          t(String(r.result));
        }
      };
      s.src = String(r.result);
    };
    r.readAsDataURL(e);
  });
}