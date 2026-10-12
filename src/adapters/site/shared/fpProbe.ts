/**
 * 页面**实际生效**指纹的探针脚本（原 `AP` shared.js:34211-34229，**逐字**）
 *
 * ⚠️ **只读**（零注入，`docs/过程.md` #2）：脚本只读 `navigator` / `screen` /
 *    `Intl` / `window.__fpSpoofed`，**不写**任何东西。
 *    （`window.__fpSpoofed` 是**我们自己的 preload** 在注入伪装时置的标记 ——
 *     读它不属于"改环境"。）
 *
 * ⚠️ **为什么写成「行数组 + `join`」**（与 `inputLock.ts` 同一先例）：注入脚本按**行**读最直观，
 *    且每行是独立的 JS 片段 ⇒ 行数组比一整个模板字符串好对读。
 *    页内脚本里的空 catch 是**有意的**（探针是 best-effort，读不到就留空，不能因一项读不到就整个失败）。
 *
 * ⚠️ 与源逐字一致的三处细节：
 *   · `screen` 拼成 `宽x高@像素比`（不是对象）
 *   · `languages` 用**逗号** join（消费侧再 `split(',')[0]`）
 *   · WebGL 读 `WEBGL_debug_renderer_info` 的 `UNMASKED_RENDERER_WEBGL`，读不到回落 `RENDERER`
 */
export const FP_DIAG_PROBE = [
  '(function(){',
  '  var out = {};',
  '  try { out.url = location.href; } catch (_) {',
  '    /* 页面内忽略：地址读不到不影响诊断 */',
  '  }',
  '  out.ua = navigator.userAgent;',
  '  out.platform = navigator.platform;',
  "  out.languages = (navigator.languages || []).join(',');",
  '  try { out.uadPlatform = (navigator.userAgentData && navigator.userAgentData.platform) || ""; } catch (_) {',
  '    /* 页面内忽略：旧内核没有 userAgentData */',
  '  }',
  "  out.screen = screen.width + 'x' + screen.height + '@' + window.devicePixelRatio;",
  '  try { out.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (_) {',
  '    /* 页面内忽略：Intl 读不到就留空 */',
  '  }',
  '  out.cores = navigator.hardwareConcurrency;',
  '  out.spoofed = !!window.__fpSpoofed;',
  '  try {',
  "    var c = document.createElement('canvas');",
  '    var gl = c.getContext("webgl");',
  '    var ext = gl && gl.getExtension("WEBGL_debug_renderer_info");',
  '    out.gl = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : (gl ? String(gl.getParameter(gl.RENDERER)) : "");',
  '  } catch (_) {',
  '    out.gl = "err";',
  '  }',
  '  return out;',
  '})()',
].join('\n');
