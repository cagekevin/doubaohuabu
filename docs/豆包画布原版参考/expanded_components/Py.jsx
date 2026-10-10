// TODO(全局, 无需 import): screen, webgl, cores, memory, e, w, h, availH, colorDepth, pixelRatio, devicePixelRatio, t, n, r, s, vendor, o, renderer
const Py = (() => {
  const e = {
    screen: null,
    webgl: null,
    cores: 0,
    memory: 0
  };
  try {
    if (typeof screen !== 'undefined' && screen && screen.width > 0) {
      e.screen = {
        w: screen.width,
        h: screen.height,
        availH: screen.availHeight || screen.height,
        colorDepth: screen.colorDepth || 24,
        pixelRatio: typeof devicePixelRatio !== 'undefined' && devicePixelRatio || 1
      };
    }
    if (typeof navigator !== 'undefined') {
      e.cores = navigator.hardwareConcurrency || 0;
      e.memory = navigator.deviceMemory || 0;
    }
    if (typeof document !== 'undefined') {
      const t = document.createElement('canvas');
      const n = t.getContext('webgl') || t.getContext('experimental-webgl');
      if (n) {
        const r = n.getExtension && n.getExtension('WEBGL_debug_renderer_info');
        const s = r ? n.getParameter(r.UNMASKED_RENDERER_WEBGL) : n.getParameter(n.RENDERER);
        const o = r ? n.getParameter(r.UNMASKED_VENDOR_WEBGL) : n.getParameter(n.VENDOR);
        if (s) {
          e.webgl = {
            vendor: o || 'Google Inc.',
            renderer: String(s)
          };
        }
      }
    }
  } catch {}
  return e;
})();
export default Py;