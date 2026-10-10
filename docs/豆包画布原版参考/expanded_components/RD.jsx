// TODO(全局, 无需 import): n, l, u, r, d, a, m, w, f, h, c, cancelable, s, o, t
import { PD, $0, TD } from './shared.js';
const RD = function (t, n, r) {
  let s = Promise.resolve();
  if (n && n.length > 0) {
    const a = document.getElementsByTagName('link');
    const l = document.querySelector('meta[property=csp-nonce]');
    const c = (l == null ? undefined : l.nonce) || (l == null ? undefined : l.getAttribute('nonce'));
    s = Promise.allSettled(n.map(u => {
      u = PD(u, r);
      if (u in $0) {
        return;
      }
      $0[u] = true;
      const d = u.endsWith('.css');
      const f = d ? '[rel="stylesheet"]' : '';
      if (r) {
        for (let m = a.length - 1; m >= 0; m--) {
          const w = a[m];
          if (w.href === u && (!d || w.rel === 'stylesheet')) {
            return;
          }
        }
      } else if (document.querySelector(`link[href="${u}"]${f}`)) {
        return;
      }
      const h = document.createElement('link');
      if (d) {
        h.rel = 'stylesheet';
      } else {
        h.rel = TD;
      }
      if (!d) {
        h.as = 'script';
      }
      h.crossOrigin = '';
      h.href = u;
      if (c) {
        h.setAttribute('nonce', c);
      }
      document.head.appendChild(h);
      if (d) {
        return new Promise((m, w) => {
          h.addEventListener('load', m);
          h.addEventListener('error', () => {
            return w(new Error(`Unable to preload CSS for ${u}`));
          });
        });
      }
    }));
  }
  function o(a) {
    const l = new Event('vite:preloadError', {
      cancelable: true
    });
    l.payload = a;
    window.dispatchEvent(l);
    if (!l.defaultPrevented) {
      throw a;
    }
  }
  return s.then(a => {
    for (const l of a || []) {
      if (l.status === 'rejected') {
        o(l.reason);
      }
    }
    return t().catch(o);
  });
};
export default RD;