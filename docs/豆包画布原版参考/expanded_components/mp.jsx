// TODO(全局, 无需 import): ok, error, f, d, S, w, m, v, p, h, y, E, b, k, x, N, e, n, dataUrl, sizeBytes, via, natW, natH, l, credentials, cache, o, a, t, r, s, mime, u, c
export default function mp(e) {
  return (async () => {
    if (!e || typeof e != 'string') {
      return {
        ok: false,
        error: '无效 URL'
      };
    }
    const t = 31457280;
    const n = async d => {
      try {
        const f = new Image();
        f.src = d;
        await new Promise(S => {
          if (f.complete && f.naturalWidth) {
            return S();
          }
          f.onload = () => {
            return S();
          };
          f.onerror = () => {
            return S();
          };
          setTimeout(S, 3000);
        });
        const p = f.naturalWidth || 0;
        const h = f.naturalHeight || 0;
        if (!p || !h) {
          return false;
        }
        const m = 24;
        const w = document.createElement('canvas');
        w.width = m;
        w.height = m;
        const v = w.getContext('2d');
        if (!v) {
          return false;
        }
        v.drawImage(f, 0, 0, p, h, 0, 0, m, m);
        let y;
        try {
          y = v.getImageData(0, 0, m, m).data;
        } catch {
          return false;
        }
        let b = 0;
        let x = 0;
        let k = 0;
        for (let S = 0; S < y.length; S += 4) {
          const E = y[S + 3] < 16 ? 0 : y[S] * 0.299 + y[S + 1] * 0.587 + y[S + 2] * 0.114;
          b += E;
          x += E * E;
          k++;
        }
        if (!k) {
          return false;
        }
        const N = b / k;
        return Math.sqrt(Math.max(0, x / k - N * N)) < 10;
      } catch {
        return false;
      }
    };
    if (/^data:image\//i.test(e)) {
      if (await n(e)) {
        return {
          ok: false,
          error: '空白/占位图，已跳过'
        };
      }
      const d = e.indexOf(',');
      const f = d > 0 ? Math.round((e.length - d - 1) * 3 / 4) : 0;
      return {
        ok: true,
        dataUrl: e,
        sizeBytes: f,
        via: 'data',
        natW: 0,
        natH: 0
      };
    }
    const r = d => {
      return new Promise((f, p) => {
        const h = new FileReader();
        h.onload = () => {
          return f(String(h.result || ''));
        };
        h.onerror = () => {
          return p(new Error('读取失败'));
        };
        h.readAsDataURL(d);
      });
    };
    const s = async d => {
      let f = 0;
      let p = 0;
      try {
        const h = new Image();
        h.src = d;
        await new Promise(m => {
          if (h.complete && h.naturalWidth) {
            return m();
          }
          h.onload = () => {
            return m();
          };
          h.onerror = () => {
            return m();
          };
          setTimeout(m, 3000);
        });
        f = h.naturalWidth || 0;
        p = h.naturalHeight || 0;
      } catch {}
      return {
        natW: f,
        natH: p
      };
    };
    const o = [];
    let a = null;
    const l = ['omit', 'include'];
    for (let d = 0; d < l.length; d++) {
      try {
        const f = await fetch(e, {
          credentials: l[d],
          cache: 'force-cache'
        });
        if (!f || !f.ok) {
          o.push('fetch(' + l[d] + '): HTTP ' + (f && f.status || 0));
          continue;
        }
        const p = await f.blob();
        if (!p || !p.size) {
          o.push('fetch(' + l[d] + '): 空内容（0 字节）');
          continue;
        }
        a = p;
        break;
      } catch (f) {
        o.push('fetch(' + l[d] + '): ' + (f && f.message || f));
      }
    }
    if (a) {
      if (a.size > t) {
        return {
          ok: false,
          error: '文件过大（' + (a.size / 1048576).toFixed(1) + 'MB）'
        };
      }
      const d = await r(a);
      if (d.indexOf('data:image/') === 0) {
        if (await n(d)) {
          return {
            ok: false,
            error: '空白/占位图，已跳过'
          };
        }
        const f = await s(d);
        return {
          ok: true,
          dataUrl: d,
          sizeBytes: a.size,
          mime: (a.type || '').split(';')[0],
          via: 'fetch',
          natW: f.natW,
          natH: f.natH
        };
      }
      o.push('返回内容不是图片');
    }
    let c = null;
    const u = [false, true];
    for (let d = 0; d < u.length; d++) {
      try {
        c = await new Promise((f, p) => {
          const h = new XMLHttpRequest();
          h.open('GET', e, true);
          h.responseType = 'blob';
          h.withCredentials = u[d];
          h.timeout = 20000;
          h.onload = () => {
            if (h.status >= 200 && h.status < 300 && h.response && h.response.size) {
              f(h.response);
            } else {
              p(new Error('HTTP ' + h.status));
            }
          };
          h.onerror = () => {
            return p(new Error('网络错误'));
          };
          h.ontimeout = () => {
            return p(new Error('超时'));
          };
          h.send();
        });
        break;
      } catch (f) {
        c = null;
        o.push('xhr(cred=' + u[d] + '): ' + (f && f.message || f));
      }
    }
    if (c) {
      if (c.size > t) {
        return {
          ok: false,
          error: '文件过大'
        };
      }
      const d = await r(c);
      if (d.indexOf('data:image/') === 0) {
        if (await n(d)) {
          return {
            ok: false,
            error: '空白/占位图，已跳过'
          };
        }
        const f = await s(d);
        return {
          ok: true,
          dataUrl: d,
          sizeBytes: c.size,
          mime: (c.type || '').split(';')[0],
          via: 'xhr',
          natW: f.natW,
          natH: f.natH
        };
      }
      o.push('XHR 返回内容不是图片');
    }
    try {
      const d = await new Promise(f => {
        const p = new Image();
        p.crossOrigin = null;
        p.onload = () => {
          try {
            const h = document.createElement('canvas');
            h.width = p.naturalWidth;
            h.height = p.naturalHeight;
            h.getContext('2d').drawImage(p, 0, 0);
            f(h.toDataURL('image/png'));
          } catch {
            f(null);
          }
        };
        p.onerror = () => {
          return f(null);
        };
        p.src = e;
      });
      if (d && d.length > 5000) {
        const f = Math.round((d.length - d.indexOf(',') - 1) * 3 / 4);
        if (await n(d)) {
          return {
            ok: false,
            error: '空白/占位图，已跳过'
          };
        }
        const p = await s(d);
        return {
          ok: true,
          dataUrl: d,
          sizeBytes: f,
          mime: 'image/png',
          via: 'canvas',
          natW: p.natW,
          natH: p.natH
        };
      }
      o.push('canvas 转换失败（可能跨域污染）');
    } catch (d) {
      o.push('canvas: ' + (d && d.message || d));
    }
    return {
      ok: false,
      error: o.join(' / ').slice(0, 220)
    };
  })();
}