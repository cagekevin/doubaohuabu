/**
 * 从原版组件机械抽取 DOM 骨架（★ 避免手读漏项）
 *
 * 跑法：node docs/mockup/tools/extract-skeleton.cjs <组件名> [...]
 *   node docs/mockup/tools/extract-skeleton.cjs CL ZL YL BL OL WL fL GL
 *
 * 输出：纯 DOM 树（标签 + className + 可见文案），
 *       条件分支标成 `?cond`，portal 标成 [PORTAL]，已知子组件替换成人话。
 *
 * ⚠️ 这是 mockup 的配套工具，不进 src、不进 npm run check。
 */

const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

const ROOT = path.resolve(__dirname, '../../..');
const SRC = path.join(ROOT, 'docs/豆包画布原版参考/expanded_components');

/** 已知子组件 → 人话（依据 docs/12 / docs/过程.md 的回源结论） */
const COMPONENT_ALIAS = {
  _Component28: 'NodeResizer',
  _Component29: 'FaceMaskOverlay(iL)',
  _Component30: 'NodeHandles',
  _Component31: 'WaitPanel(分析中)',
  _Component32: 'JsonView',
  _Component33: 'RefMaterialPanel(portal)',
  _Component25: 'Webview',
  Mn: 'Handle',
};

function textOf(node) {
  if (!node) return '';
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral') {
    return node.quasis.map((q) => q.value.cooked || '').join('…');
  }
  return '';
}

/** 取 className 字符串（含模板字符串里的字面量部分） */
function getClassName(attrs) {
  for (const a of attrs) {
    if (a.type !== 'JSXAttribute') continue;
    const name = a.name && (a.name.name || (a.name.type === 'JSXNamespacedName' ? `${a.name.namespace.name}:${a.name.name.name}` : ''));
    if (name !== 'className') continue;
    const v = a.value;
    if (!v) return '';
    if (v.type === 'StringLiteral') return v.value;
    if (v.type === 'JSXExpressionContainer') {
      const e = v.expression;
      if (e.type === 'StringLiteral') return e.value;
      if (e.type === 'TemplateLiteral') {
        // 模板：拼字面量 + 把表达式缩成 `…`
        return e.quasis
          .map((q, i) => (q.value.cooked || '') + (i < e.expressions.length ? '{…}' : ''))
          .join('');
      }
      if (e.type === 'ConditionalExpression') {
        return `${classExprName(e.consequent)}|${classExprName(e.alternate)}`;
      }
      return '{…}';
    }
  }
  return '';
}

function classExprName(n) {
  if (!n) return '';
  if (n.type === 'StringLiteral') return n.value;
  if (n.type === 'TemplateLiteral') return n.quasis.map((q) => q.value.cooked || '').join('…');
  return '{…}';
}

const INDENT = '  ';

function walk(node, depth, out, condLabel) {
  if (!node) return;
  const pad = INDENT.repeat(depth);

  switch (node.type) {
    case 'JSXElement': {
      const raw = node.openingElement.name;
      let tag = raw.type === 'JSXIdentifier' ? raw.name : `${raw.object?.name || ''}.${raw.property?.name || ''}`;
      const cls = getClassName(node.openingElement.attributes || []);
      const alias = COMPONENT_ALIAS[tag];
      const label = alias ? `<${tag}>` : tag;
      out.push(`${pad}${condLabel ? `?${condLabel} ` : ''}${label}${cls ? `.${cls.split(/\s+/).filter(Boolean).join('.')}` : ''}${alias ? `  ★${alias}` : ''}`);
      for (const c of node.children) walk(c, depth + 1, out, null);
      return;
    }
    case 'JSXFragment': {
      out.push(`${pad}<>`);
      for (const c of node.children) walk(c, depth + 1, out, null);
      return;
    }
    case 'JSXText': {
      const t = node.value.replace(/\s+/g, ' ').trim();
      if (t) out.push(`${pad}"${t}"`);
      return;
    }
    case 'JSXExpressionContainer': {
      const e = node.expression;
      if (e.type === 'JSXEmptyExpression') return;
      if (e.type === 'StringLiteral') {
        if (e.value.trim()) out.push(`${pad}"${e.value}"`);
        return;
      }
      // {cond && <X/>}
      if (e.type === 'LogicalExpression' && e.operator === '&&') {
        const label = condName(e.left);
        walk(e.right, depth, out, label);
        return;
      }
      // {cond ? <A/> : <B/>}
      if (e.type === 'ConditionalExpression') {
        const label = condName(e.test);
        walk(e.consequent, depth, out, label);
        const t = e.alternate;
        if (t && (t.type === 'JSXElement' || t.type === 'JSXFragment')) walk(t, depth, out, `!${label}`);
        else if (t && t.type === 'StringLiteral' && t.value.trim()) out.push(`${pad}?${label} "${t.value}"`);
        return;
      }
      // {(() => {...})()} —— IIFE，直接进它的 return
      if (e.type === 'CallExpression') {
        const callee = e.callee;
        const isPortal =
          callee.object && callee.object.name === 'on' && callee.property && callee.property.name === 'createPortal';
        if (isPortal) out.push(`${pad}[PORTAL → document.body]`);
        const fn = callee.type === 'ArrowFunctionExpression' ? callee : null;
        const body = fn ? fn.body : null;
        if (body && body.type === 'BlockStatement') {
          for (const st of body.body) {
            if (st.type === 'ReturnStatement') walk(st.argument, depth + (isPortal ? 1 : 0), out, null);
          }
        }
        if (isPortal && e.arguments && e.arguments[0]) walk(e.arguments[0], depth + 1, out, null);
        return;
      }
      // {.map(...)} —— 循环，进回调的 return
      if (e.type === 'CallExpression' && e.callee.property && e.callee.property.name === 'map') {
        const cb = e.arguments && e.arguments[0];
        if (cb && (cb.type === 'ArrowFunctionExpression' || cb.type === 'FunctionExpression')) {
          const b = cb.body;
          if (b.type === 'BlockStatement') {
            for (const st of b.body) if (st.type === 'ReturnStatement') walk(st.argument, depth, out, '×N');
          } else {
            walk(b, depth, out, '×N');
          }
        }
        return;
      }
      // 其它：缩成一行，避免噪音
      const mono = monoText(e);
      if (mono) out.push(`${pad}「${mono}」`);
      return;
    }
    default:
      return;
  }
}

/** 把简单表达式缩成一个可读标记 */
function condName(n) {
  if (!n) return '?';
  if (n.type === 'Identifier') return n.name;
  if (n.type === 'MemberExpression') return `${n.object?.name || '?'}.${n.property?.name || '?'}`;
  if (n.type === 'UnaryExpression') return `!${condName(n.argument)}`;
  if (n.type === 'BinaryExpression') return `${condName(n.left)}${n.operator}${condName(n.right)}`;
  if (n.type === 'LogicalExpression') return `${condName(n.left)}${n.operator}${condName(n.right)}`;
  if (n.type === 'CallExpression') return `${n.callee?.name || '?'}()`;
  return '?';
}

/** 取「可见文案」表达式的代表文本（模板字符串字面量部分） */
function monoText(e) {
  if (e.type === 'TemplateLiteral') {
    const s = e.quasis.map((q) => q.value.cooked || '').join('…');
    return s.trim() || '';
  }
  if (e.type === 'BinaryExpression') {
    return `${monoText(e.left)}${monoText(e.right)}`;
  }
  if (e.type === 'StringLiteral') return e.value;
  if (e.type === 'ConditionalExpression') return `${monoText(e.consequent)}|${monoText(e.alternate)}`;
  if (e.type === 'Identifier') return `{${e.name}}`;
  if (e.type === 'MemberExpression') return `{${condName(e)}}`;
  return '';
}

function extract(file) {
  const code = fs.readFileSync(file, 'utf8');
  const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
  let ret = null;
  for (const st of ast.program.body) {
    if (st.type !== 'ExportDefaultDeclaration') continue;
    const decl = st.declaration;
    if (decl.type !== 'FunctionDeclaration') continue;
    const body = decl.body;
    for (const s of body.body) {
      if (s.type === 'ReturnStatement' && s.argument && (s.argument.type === 'JSXElement' || s.argument.type === 'JSXFragment')) {
        ret = s.argument;
      }
    }
  }
  if (!ret) return ['(未找到主 return)'];
  const out = [];
  walk(ret, 0, out, null);
  return out;
}

const names = process.argv.slice(2);
if (names.length === 0) {
  console.error('用法: node extract-skeleton.cjs <组件名...>');
  process.exit(1);
}

if (process.env.MD === '1') {
  console.log('# 原版节点 DOM 骨架（机械抽取）');
  console.log();
  console.log('> 生成：`node docs/mockup/tools/extract-skeleton.cjs CL fL OL BL WL GL YL ZL`');
  console.log('> 来源：`docs/豆包画布原版参考/expanded_components/*.jsx`');
  console.log();
  console.log('| 图例 | 含义 |');
  console.log('|---|---|');
  console.log('| `?cond` | 条件渲染（条件为真才出现）|');
  console.log('| `×N` | `.map()` 循环 |');
  console.log('| `[PORTAL]` | `createPortal` 到 `document.body` |');
  console.log('| `「…」` | 表达式文案（变量 / 模板字符串）|');
  console.log('| `★` | 已识别的子组件 |');
  console.log();
}
for (const n of names) {
  const f = path.join(SRC, `${n}.jsx`);
  if (!fs.existsSync(f)) {
    console.log(`\n===== ${n} (缺失) =====`);
    continue;
  }
  console.log(`\n===== ${n}.jsx =====`);
  console.log(extract(f).join('\n'));
}
