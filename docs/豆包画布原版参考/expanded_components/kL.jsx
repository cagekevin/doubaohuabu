// TODO(全局, 无需 import): e, t, s, o, n, a, c, u, d
export default function kL(e) {
  const t = e.cloneNode(true);
  t.querySelectorAll('.ref-chip').forEach(s => {
    const o = document.createTextNode(`@[${s.dataset.id || 'x'}|${(s.dataset.name || '').replace(/"/g, '&quot;')}]`);
    s.replaceWith(o);
  });
  t.querySelectorAll('.ref-missing').forEach(s => {
    const o = document.createTextNode(`@[x|${(s.dataset.name || '').replace(/"/g, '&quot;')}]`);
    s.replaceWith(o);
  });
  t.querySelectorAll('meta, link, style, script, noscript, iframe, object, embed, form, sc-clipboard, [data-clipboard], [block-data], [data-block], span[data-slate-fragment]').forEach(s => {
    return s.remove();
  });
  let n = t.innerHTML;
  if (/<(sc[-:]?clipboard|script|style|meta|link|noscript)\b/i.test(n)) {
    let s = '';
    let o = 0;
    while (n !== s && o < 10) {
      s = n;
      n = n.replace(/<(?:sc[-:]?clipboard|script|style|meta|link|noscript)[^>]*>/gi, '');
      o++;
    }
    const a = document.createElement('div');
    a.innerHTML = n;
    a.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6, blockquote, pre').forEach(c => {
      const u = document.createDocumentFragment();
      while (c.firstChild) {
        u.appendChild(c.firstChild);
      }
      const d = u.lastChild;
      if (!d || d.nodeType !== 1 || d.tagName !== 'BR') {
        u.appendChild(document.createElement('br'));
      }
      c.replaceWith(u);
    });
    return a.innerHTML;
  }
  t.querySelectorAll('div, p, h1, h2, h3, h4, h5, h6, blockquote, pre, article, section, figure, figcaption').forEach(s => {
    const o = document.createDocumentFragment();
    while (s.firstChild) {
      o.appendChild(s.firstChild);
    }
    const a = o.lastChild;
    if (!a || a.nodeType !== 1 || a.tagName !== 'BR') {
      o.appendChild(document.createElement('br'));
    }
    s.replaceWith(o);
  });
  return t.innerHTML;
}