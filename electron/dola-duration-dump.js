// ============================================================
// 30s 时长诊断脚本（会被 `.toString()` **注入 guest 主页面的主世界**）
// ------------------------------------------------------------
// ★ **为什么这个文件是 `.js` 而不是 `.ts`**（2026-10-15 决定，见 `日志.md`）：
//   它的文本**就是运行在页面里的代码**（`DUMP_EXPR` 把本函数序列化后注入）。
//   住在编译面内（`.ts`）时，注入文本 ＝ **tsc 打印出来的文本**，不是我们写的文本
//   —— 实测 tsc 会丢掉冗余括号（`(a && b) ? x : y` → `a && b ? x : y`），
//   于是：①「逐字一致」在该载体内**不可保证**；② 将来 TS 升级、打印风格一变，
//   **注入进页面的脚本会静默改变**。
//   ⇒ 与 `dola-duration-main.js` **同族**：不进编译面（`electron/tsconfig.json` 的 `exclude`），
//     文本由本文件字节决定 ⇒ 与迁移前逐字一致（校验见红区脚本 `audit-redzone.mjs`）。
//   ⚠️ 代价：本文件**零类型覆盖**，与 `dola-duration-main.js` **同笔债**（B5 立账）。
// ============================================================
// 由主进程直接对 webview 执行 JS，把真实时长下拉 DOM 拉回主进程写盘（绕过不可靠的 webview→主进程回传通道）。
// 这样只要脚本被注入、且 dola 页面加载过，~/dola-duration-debug.log 就一定会有真实结构数据，便于精准修复。
function dolaDurationDump() {
  try {
    var durRe = /^(5|10|15|30|60)\s*(s|秒)?$/i;
    function leavesOf(root) {
      var out = [];
      var all = root.querySelectorAll('*');
      for (var i = 0; i < all.length; i++) {
        var el = all[i];
        if (el.children.length === 0) {
          var t = (el.textContent || '').trim();
          if (durRe.test(t)) out.push(el);
        }
      }
      return out;
    }
    function countDesc(el) {
      var c = 0, k = el.querySelectorAll('*');
      for (var j = 0; j < k.length; j++) {
        if (k[j].children.length === 0 && durRe.test((k[j].textContent || '').trim())) c++;
      }
      return c;
    }
    function chain(el) {
      var arr = [], p = el;
      for (var k = 0; k < 8 && p; k++) {
        var cls = (p.className && typeof p.className === 'string') ? p.className.split(' ').slice(0, 3).join('.') : '';
        arr.push((p.tagName || '') + (cls ? '.' + cls : ''));
        p = p.parentElement;
      }
      return arr;
    }
    var leaves = leavesOf(document);
    if (!leaves.length) {
      return JSON.stringify({ leaves: 0, note: '页面无 5s/10s/15s 这类时长叶子，可能标签不同或尚未加载' });
    }
    var container = leaves[0].parentElement, guard = 0;
    while (container && container.parentElement && guard++ < 12) {
      if (countDesc(container) >= 2) break;
      container = container.parentElement;
    }
    var info = leaves.slice(0, 12).map(function (l) {
      return {
        text: (l.textContent || '').trim(),
        tag: l.tagName,
        cls: (l.className && typeof l.className === 'string') ? l.className.slice(0, 90) : '',
        role: l.getAttribute && l.getAttribute('role'),
        chain: chain(l.parentNode)
      };
    });
    var html = container ? container.outerHTML.slice(0, 6000) : '';
    return JSON.stringify({ leaves: leaves.length, info: info, containerHTML: html });
  } catch (e) {
    return JSON.stringify({ error: e.message });
  }
}
const DUMP_EXPR = `(${dolaDurationDump.toString()})()`;

// 导出面只有这一个（宿主 `main.ts` 在 `inject-dola-duration-main` 里用它做 `executeJavaScript`）
module.exports = { DUMP_EXPR };
