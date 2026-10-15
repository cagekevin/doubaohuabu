// 指纹伪装 preload 脚本生成器（独立模块，便于脱离 Electron 做语法/逻辑测试）
// 把指纹配置编译成一段注入脚本，指纹字面量直接内联，preload 内不依赖任何外部读取。
// 该脚本在 webview 的 document-start 阶段运行，覆盖 DOM 层指纹：
//   navigator(userAgent/platform/languages/...)、screen、devicePixelRatio、
//   Intl.DateTimeFormat 时区、Date.getTimezoneOffset、WebGL 渲染器/厂商。
//
// ⚠️ ★ **TD-16-37 豁免（21 处静默 catch 中的 14 处）**：本文件生成的脚本**跑在页面里**
//    ⇒ 其中**所有空 catch（`catch` + 空体）一律刻意静默** —— 在页内打任何日志都会**泄漏到页面 console**
//    （站点可读）⇒ 与「指纹伪装」目标**直接冲突**（反检测红线）。
//    ⇒ 这些静默**不是"漏留痕"，而是"必须静默"**；**不得**按主进程口径给它们加 `console.warn`。

/** 指纹配置（源是 `JSON.stringify(fp || {})`：形状不进类型面，字段只在生成的脚本里用） */
function buildFingerprintPreload(fp: unknown): string {
  const fpJson = JSON.stringify(fp || {});
  return `(function(){
  'use strict';
  var FP = ${fpJson};
  try {
    // ---------- navigator ----------
    var NP = (typeof Navigator !== 'undefined' && Navigator.prototype) ? Navigator.prototype : null;
    if (NP) {
      var ndef = function(name, get){ try { Object.defineProperty(NP, name, { get: get, configurable: true }); } catch(e){} };
      ndef('userAgent', function(){ return FP.userAgent; });
      ndef('appVersion', function(){ return FP.appVersion; });
      ndef('platform', function(){ return FP.platform; });
      ndef('vendor', function(){ return FP.vendor; });
      ndef('language', function(){ return FP.language; });
      ndef('languages', function(){ return (FP.languages || []).slice(); });
      ndef('hardwareConcurrency', function(){ return FP.hardwareConcurrency; });
      ndef('deviceMemory', function(){ return FP.deviceMemory; });
      ndef('maxTouchPoints', function(){ return FP.maxTouchPoints || 0; });
      ndef('userAgentData', function(){
        var ua = FP.userAgentData || {};
        return {
          brands: ua.brands || [],
          mobile: !!ua.mobile,
          platform: ua.platform || 'macOS',
          getHighEntropyValues: function(hints){
            var out = {}; hints = hints || [];
            // 高熵值由指纹配置按宿主平台生成（Windows 宿主= x86/Win 版本号），不得写死 macOS 值
            if (hints.indexOf('architecture') >= 0) out.architecture = FP.uaArchitecture || 'arm';
            if (hints.indexOf('bitness') >= 0) out.bitness = FP.uaBitness || '64';
            if (hints.indexOf('model') >= 0) out.model = '';
            if (hints.indexOf('platformVersion') >= 0) out.platformVersion = FP.uaPlatformVersion || '14.0.0';
            if (hints.indexOf('fullVersionList') >= 0) out.fullVersionList = ua.brands || [];
            if (hints.indexOf('uaFullVersion') >= 0) out.uaFullVersion = ua._fullVersion || '';
            if (hints.indexOf('wow64') >= 0) out.wow64 = FP.uaWow64 === undefined ? false : !!FP.uaWow64;
            return Promise.resolve(out);
          }
        };
      });
    }

    // ---------- screen / devicePixelRatio ----------
    var SP = (typeof Screen !== 'undefined' && Screen.prototype) ? Screen.prototype : null;
    if (SP && FP.screen) {
      var sdef = function(name, val){ try { Object.defineProperty(SP, name, { get: function(){ return val; }, configurable: true }); } catch(e){} };
      sdef('width', FP.screen.width);
      sdef('height', FP.screen.height);
      sdef('availWidth', FP.screen.availWidth);
      sdef('availHeight', FP.screen.availHeight);
      sdef('colorDepth', FP.screen.colorDepth);
      sdef('pixelDepth', FP.screen.colorDepth);
    }
    try { Object.defineProperty(window, 'devicePixelRatio', { get: function(){ return (FP.screen && FP.screen.pixelRatio) || 1; }, configurable: true }); } catch(e){}

    // ---------- 时区 ----------
    if (FP.timezone) {
      var TZ = FP.timezone;
      var RealDTF = Intl.DateTimeFormat;
      Intl.DateTimeFormat = function(locales, options){
        options = options || {};
        if (options.timeZone === undefined) options = Object.assign({}, options, { timeZone: TZ });
        return new RealDTF(locales, options);
      };
      try { Intl.DateTimeFormat.prototype = RealDTF.prototype; } catch(e){}
      try { Intl.DateTimeFormat.supportedLocalesOf = RealDTF.supportedLocalesOf; } catch(e){}
      var offsetMinutes = 0;
      try {
        var probe = new RealDTF('en-US', { timeZone: TZ, timeZoneName: 'shortOffset' })
          .formatToParts(new Date()).find(function(p){ return p.type === 'timeZoneName'; });
        if (probe && probe.value) {
          var m = probe.value.match(/([+-])(\\d+)(?::?(\\d+))?/);
          if (m) {
            var sign = m[1] === '-' ? 1 : -1;
            offsetMinutes = sign * (parseInt(m[2], 10) * 60 + (parseInt(m[3] || '0', 10)));
          }
        }
      } catch(e){}
      try { Date.prototype.getTimezoneOffset = function(){ return offsetMinutes; }; } catch(e){}
    }

    // ---------- WebGL 渲染器 / 厂商 ----------
    function spoofGL(proto){
      if (!proto) return;
      var realGet = proto.getParameter;
      proto.getParameter = function(p){
        try {
          if (p === this.RENDERER) return FP.webgl.renderer;
          if (p === this.VENDOR) return FP.webgl.vendor;
          var ext = this.getExtension && this.getExtension('WEBGL_debug_renderer_info');
          if (ext) {
            if (p === ext.UNMASKED_RENDERER_WEBGL) return FP.webgl.renderer;
            if (p === ext.UNMASKED_VENDOR_WEBGL) return FP.webgl.vendor;
          }
        } catch(e){}
        return realGet.call(this, p);
      };
    }
    spoofGL(typeof WebGLRenderingContext !== 'undefined' ? WebGLRenderingContext.prototype : null);
    spoofGL(typeof WebGL2RenderingContext !== 'undefined' ? WebGL2RenderingContext.prototype : null);

    // ---------- Canvas 指纹扰动：为同一账号的 canvas 读取注入「稳定且账号独有」的微噪声 ----------
    try {
      // 账号级稳定密钥：同一账号固定，不同账号不同
      var CSECRET = (function(){
        var s = 0; var str = (FP.userAgent || '') + '|' + ((FP.webgl && FP.webgl.renderer) || '') + '|' + (FP.timezone || '');
        for (var si = 0; si < str.length; si++) { s = (s * 31 + str.charCodeAt(si)) >>> 0; }
        return s || 1;
      })();
      var MkRnd = function(seed){
        var st = (seed >>> 0) || 1;
        return function(){
          st = (st * 1103515245 + 12345) & 0x7fffffff;
          return st / 0x7fffffff;
        };
      };
      var perturb = function(data, secret){
        if (!data || !data.length) return;
        var rnd = MkRnd(secret);
        var n = data.length;
        // 在固定间隔的像素上注入 ±1 噪声（不碰 alpha 通道的可见性），坐标由 secret 决定
        var step = Math.max(4, Math.floor(n / 32 / 4) * 4);
        var start = secret % step;
        for (var i = start; i + 3 < n; i += step) {
          var d = (rnd() < 0.5 ? -1 : 1);
          var v = data[i] + d;
          data[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
        }
      };
      if (typeof CanvasRenderingContext2D !== 'undefined' && CanvasRenderingContext2D.prototype) {
        var origGetImageData = CanvasRenderingContext2D.prototype.getImageData;
        CanvasRenderingContext2D.prototype.getImageData = function(){
          var img = origGetImageData.apply(this, arguments);
          if (img && img.data) perturb(img.data, CSECRET);
          return img;
        };
      }
      if (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype) {
        var origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(){
          try {
            var c = this;
            var ctx = c.getContext && c.getContext('2d');
            if (ctx && c.width && c.height) {
              var img = ctx.getImageData(0, 0, c.width, c.height);
              if (img && img.data) { perturb(img.data, CSECRET); ctx.putImageData(img, 0, 0); }
            }
          } catch(e){}
          return origToDataURL.apply(this, arguments);
        };
        var origToBlob = HTMLCanvasElement.prototype.toBlob;
        if (origToBlob) {
          HTMLCanvasElement.prototype.toBlob = function(){
            try {
              var c = this;
              var ctx = c.getContext && c.getContext('2d');
              if (ctx && c.width && c.height) {
                var img = ctx.getImageData(0, 0, c.width, c.height);
                if (img && img.data) { perturb(img.data, CSECRET); ctx.putImageData(img, 0, 0); }
              }
            } catch(e){}
            return origToBlob.apply(this, arguments);
          };
        }
      }
    } catch(e){}

    // ---------- Audio 指纹扰动：AnalyserNode / AudioBuffer 微噪声（账号级稳定）----------
    try {
      var ASECRET = (function(){
        var s = 0; var str = ((FP.webgl && FP.webgl.renderer) || '') + '|' + (FP.hardwareConcurrency || 0);
        for (var ai = 0; ai < str.length; ai++) { s = (s * 33 + str.charCodeAt(ai)) >>> 0; }
        return s || 7;
      })();
      var Afloat = function(arr, secret){
        if (!arr || !arr.length) return;
        var rnd = MkRnd(secret);
        var n = arr.length;
        var step = Math.max(1, Math.floor(n / 16));
        var start = secret % step;
        for (var i = start; i < n; i += step) {
          arr[i] = arr[i] + (rnd() - 0.5) * 1e-7;
        }
      };
      if (typeof AnalyserNode !== 'undefined' && AnalyserNode.prototype) {
        var origFloat = AnalyserNode.prototype.getFloatFrequencyData;
        if (origFloat) AnalyserNode.prototype.getFloatFrequencyData = function(arr){
          origFloat.apply(this, arguments);
          if (arr) Afloat(arr, ASECRET);
          return arr;
        };
        var origByte = AnalyserNode.prototype.getByteFrequencyData;
        if (origByte) AnalyserNode.prototype.getByteFrequencyData = function(arr){
          origByte.apply(this, arguments);
          if (arr) Afloat(arr, ASECRET);
          return arr;
        };
      }
      if (typeof AudioBuffer !== 'undefined' && AudioBuffer.prototype) {
        var origGetCh = AudioBuffer.prototype.getChannelData;
        if (origGetCh) AudioBuffer.prototype.getChannelData = function(){
          var a = origGetCh.apply(this, arguments);
          if (a) Afloat(a, ASECRET);
          return a;
        };
      }
    } catch(e){}

    // 伪装生效标记：指纹诊断（AccountPanel 🔍）据此判断 preload 是否真的加载并执行成功
    try { window.__fpSpoofed = true; } catch(e){}
  } catch(e){}
})();`;
}

// 导出面 = 宿主可用面（`main.ts` 的 `buildFingerprintPreload`）
export { buildFingerprintPreload };
