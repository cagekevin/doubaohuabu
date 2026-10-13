// TODO(全局, 无需 import): seekSec, timeoutMs, maxW, l, o, s, u, c, n, t, d, r, p, f, e
export default function bk(e, {
  seekSec: t = 1,
  timeoutMs: n = 8000,
  maxW: r = 480
} = {}) {
  if (!e || typeof document === 'undefined') {
    return Promise.resolve(null);
  } else {
    return new Promise(s => {
      let o = null;
      let a = false;
      let l = null;
      const c = u => {
        if (!a) {
          a = true;
          if (l) {
            clearTimeout(l);
          }
          try {
            if (o) {
              o.removeAttribute('src');
              try {
                o.load();
              } catch {}
            }
          } catch {}
          s(u);
        }
      };
      try {
        o = document.createElement('video');
        o.crossOrigin = 'anonymous';
        o.muted = true;
        o.playsInline = true;
        o.preload = 'auto';
        l = setTimeout(() => {
          return c(null);
        }, n);
        o.addEventListener('loadedmetadata', () => {
          try {
            const u = Number.isFinite(o.duration) && o.duration > 0 ? o.duration : t;
            const d = Math.min(t, Math.max(0, u - 0.1));
            o.currentTime = Math.max(0, d);
          } catch {
            c(null);
          }
        });
        o.addEventListener('seeked', () => {
          try {
            const u = o.videoWidth;
            const d = o.videoHeight;
            if (!u || !d) {
              return c(null);
            }
            const f = Math.min(1, r / u);
            const p = document.createElement('canvas');
            p.width = Math.max(2, Math.round(u * f));
            p.height = Math.max(2, Math.round(d * f));
            p.getContext('2d').drawImage(o, 0, 0, p.width, p.height);
            c(p.toDataURL('image/jpeg', 0.8));
          } catch {
            c(null);
          }
        });
        o.addEventListener('error', () => {
          return c(null);
        });
        o.src = e;
        try {
          o.load();
        } catch {}
      } catch {
        c(null);
      }
    });
  }
}