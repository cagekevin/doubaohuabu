// ============================================================
// Lovart 专用「最小 UA 对齐」preload 生成器
// ------------------------------------------------------------
// 独立模块，便于脱离 Electron 做语法/行为测试（与 fingerprint-preload.js 同一套思路）。
//
// 为什么需要它：UA 字符串可以靠 session.setUserAgent 改，但 navigator.userAgentData
// 是引擎按**真实** Chromium 版本生成的，改不动 —— 于是声明版本必须与引擎版本一致（见 main.js
// 的 CHROME_COMPAT_MAJOR，直接取 process.versions.chrome），否则 UA ↔ TLS 指纹版本不符会触发
// Cloudflare Turnstile。
//
// 关键取舍：**绝不**改写 canvas / WebGL / Intl / Date —— 那几处是 Cloudflare Turnstile
// 判定「环境被篡改」的探针，一改就会导致验证失败（历史踩坑）。
//
// 本 preload 只做三件最小的事：
//   1) 对齐 navigator.userAgentData（改原型 getter，不替换对象，保留 instanceof 与引擎高熵字段）；
//   2) 补齐 window.chrome 的 app / runtime / csi / loadTimes —— Electron 的 webview 里 window.chrome
//      是空的，而真实 Chrome 必有 chrome.app / chrome.runtime，且 Chrome 126 仍带 chrome.csi /
//      chrome.loadTimes（两个函数）。只返回「未装扩展」的真实形态，不引入任何伪造行为；
//   3) 对齐 navigator.languages 与本次会话实际下发的 Accept-Language 请求头 —— 二者在真实 Chrome 里
//      同源（都来自系统语言列表），必须逐项一致；否则设备信任 SDK 把 navigator.languages 上报服务端、
//      与服务端收到的 Accept-Language 头交叉比对，不一致即判伪造环境。
//
// 注入时机与健壮性：
//   · preload 在页面脚本前执行，但此刻 navigator.userAgentData 可能尚未就绪，故 RUN 既直接调用，
//     又挂 DOMContentLoaded 重试，并用 webFrame.executeJavaScript 在独立世界重跑（RUN 是自包含函数，
//     内部常量全部内联，重跑不依赖外部作用域）。三处均幂等（各自 __lovart* 守卫）。
// ============================================================

function buildLovartUAPreload(major, acceptLanguages) {
  const V = String(parseInt(major, 10) || 0);
  const brands = JSON.stringify([
    { brand: 'Not/A)Brand', version: '8' },
    { brand: 'Chromium', version: V },
    { brand: 'Google Chrome', version: V }
  ]);
  const full = JSON.stringify([
    { brand: 'Not/A)Brand', version: '8.0.0.0' },
    { brand: 'Chromium', version: `${V}.0.0.0` },
    { brand: 'Google Chrome', version: `${V}.0.0.0` }
  ]);
  // 把 Accept-Language 列表原样内联进 preload，使 navigator.languages 与请求头严格一致。
  const list = Array.isArray(acceptLanguages)
    ? acceptLanguages
    : String(acceptLanguages || '').split(',').map((s) => s.trim()).filter(Boolean);
  const AL_JSON = JSON.stringify(list.length ? list : ['en-US']);
  return `(function(){
  function RUN(){
    try {
      if (!window.__lovartUAAligned) {
        var real = navigator.userAgentData;
        if (real) {
          var proto = Object.getPrototypeOf(real);
          var BRANDS = ${brands};
          var FULL = ${full};
          var FULLVER = '${V}.0.0.0';
          Object.defineProperty(proto, 'brands', { get: function(){ return BRANDS; }, configurable: true });
          Object.defineProperty(proto, 'mobile', { get: function(){ return false; }, configurable: true });
          Object.defineProperty(proto, 'platform', { get: function(){ return 'macOS'; }, configurable: true });
          var orig = proto.getHighEntropyValues;
          if (typeof orig === 'function') {
            proto.getHighEntropyValues = function(hints){
              return orig.call(this, hints).then(function(res){
                try {
                  res.brands = BRANDS;
                  if ('fullVersionList' in res) res.fullVersionList = FULL;
                  if ('uaFullVersion' in res) res.uaFullVersion = FULLVER;
                } catch(e){}
                return res;
              });
            };
          }
          window.__lovartUAAligned = true;
        }
      }
    } catch(e){}
    try {
      if (!window.__lovartChromePatched) {
        var c = window.chrome || (window.chrome = {});
        function evt(){ return { addListener:function(){}, removeListener:function(){}, hasListener:function(){return false;}, hasListeners:function(){return false;}, dispatch:function(){} }; }
        if (!c.app) {
          c.app = {
            isInstalled: false,
            InstallState: { DISABLED:'disabled', INSTALLED:'installed', NOT_INSTALLED:'not_installed' },
            getIsInstalled: function(){ return false; },
            getDetails: function(){ return undefined; },
            getAppDetails: function(){ return undefined; },
            installState: function(cb){ if (cb) cb('not_installed'); },
            running: function(){ return []; },
            getApps: function(cb){ if (cb) cb([]); },
            getExtensions: function(cb){ if (cb) cb([]); }
          };
        }
        if (!c.runtime) {
          c.runtime = {
            id: undefined,
            lastError: undefined,
            OnInstalledReason: { CHROME_UPDATE:'chrome_update', INSTALL:'install', SHARED_MODULE_UPDATE:'shared_module_update', UPDATE:'update' },
            OnRestartRequiredReason: { APP_UPDATE:'app_update', OS_UPDATE:'os_update', PERIODIC:'periodic' },
            PlatformArch: { ARM:'arm', ARM64:'arm64', MIPS:'mips', MIPS64:'mips64', X86_32:'x86-32', X86_64:'x86-64' },
            PlatformNaclArch: { ARM:'arm', ARM64:'arm64', MIPS:'mips', MIPS64:'mips64', X86_32:'x86-32', X86_64:'x86-64' },
            PlatformOs: { ANDROID:'android', CROS:'cros', LINUX:'linux', MAC:'mac', OPENBSD:'openbsd', WIN:'win' },
            RequestUpdateCheckStatus: { NO_UPDATE:'no_update', THROTTLED:'throttled', UPDATE_AVAILABLE:'update_available' },
            connect: function(){ throw new Error('Extension connection not supported'); },
            connectNative: function(){ throw new Error('Native connection not supported'); },
            getManifest: function(){ return undefined; },
            getURL: function(p){ return 'chrome-extension://' + ('') + '/' + p; },
            sendMessage: function(){ var P = (typeof Promise!=='undefined')?Promise:null; return P?P.resolve():undefined; },
            sendNativeMessage: function(){ throw new Error('Native messaging not supported'); },
            setUninstallURL: function(){},
            onConnect: evt(), onInstalled: evt(), onMessage: evt(), onStartup: evt(), onSuspend: evt(), onSuspendCanceled: evt()
          };
        }
        // Chrome 126 仍带这两个函数；缺失会让反自动化 SDK 判定「非真实 Chrome」。
        if (typeof c.csi !== 'function') {
          c.csi = function(){ var t = (typeof performance!=='undefined' && performance.now) ? performance.now() : 0; return { total: t, onloadT: 0, startE: 0, pageT: 0 }; };
        }
        if (typeof c.loadTimes !== 'function') {
          c.loadTimes = function(){ var t = (typeof performance!=='undefined' && performance.now) ? performance.now() : 0; var s = t/1000; return { requestTime: 0, startLoadTime: 0, commitLoadTime: s, finishDocumentLoadTime: s, finishLoadTime: s, firstPaintTime: s, firstPaintAfterLoadTime: 0, navigationType: 'Other', navigationRedirected: false, navigationCount: 1 }; };
        }
        window.__lovartChromePatched = true;
      }
    } catch(e){}
    try {
      if (!window.__lovartLangAligned) {
        var LIST = ${AL_JSON};
        if (LIST && LIST.length) {
          var NP = Object.getPrototypeOf(navigator);
          Object.defineProperty(NP, 'languages', { configurable: true, get: function(){ return LIST.slice(); } });
          Object.defineProperty(NP, 'language', { configurable: true, get: function(){ return LIST[0] || 'en-US'; } });
          window.__lovartLangAligned = true;
        }
      }
    } catch(e){}
    // 真实 Chrome 117+ 已移除 navigator.getBattery；Electron 仍暴露它（function），属偏差，对齐为 undefined
    try {
      if (!window.__lovartBatteryAligned) {
        var _np = Object.getPrototypeOf(navigator);
        var _t = (_np && _np.hasOwnProperty('getBattery')) ? _np : navigator;
        try { Object.defineProperty(_t, 'getBattery', { configurable: true, value: undefined }); } catch(_) {}
        window.__lovartBatteryAligned = true;
      }
    } catch(e){}
  }
  RUN();
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', RUN);
  }
  try {
    var wf = require('electron').webFrame;
    if (wf && typeof wf.executeJavaScript === 'function') wf.executeJavaScript('(' + RUN.toString() + ')()');
  } catch(e){}
})();
`;
}

module.exports = { buildLovartUAPreload };
