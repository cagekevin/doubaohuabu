#!/usr/bin/env node
/**
 * 13-jsx-tree.cjs —— 组件 JSX 完整树：标签嵌套 + className + 文案 + 事件绑定。
 *   解决三个缺口：页面面板结构、JSX 完整嵌套、事件→action（含变量绑定）。
 *
 * 输入：expanded_components/*.jsx
 * 输出：outputs/13-JSX树.json + outputs/13-JSX树.md
 * 幂等、可重跑：node scripts/13-jsx-tree.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'inputs', 'pipeline_step', 'project', 'src', 'expanded_components');
const OUT_JSON = path.join(ROOT, 'outputs', '13-JSX树.json');
const OUT_MD = path.join(ROOT, 'outputs', '13-JSX树.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

// 找 return 的 JSX 范围（最后一个 return，到组件末尾）
function findJsxRange(text) {
  const idx = text.lastIndexOf('return ');
  if (idx < 0) return null;
  let i = idx + 7;
  while (i < text.length && (text[i] === ' ' || text[i] === '(')) i++;
  if (text[i] !== '<') return null; // 非 JSX return
  return { start: i, end: text.length };
}

// 解析 JSX：标签 + className + 文案 + 事件 + 深度
function parseJsx(text, range) {
  const slice = text.slice(range.start, range.end);
  const nodes = [];
  const stack = [];
  let i = 0;
  const n = slice.length;

  while (i < n) {
    const c = slice[i];
    if (c === '<') {
      if (slice[i + 1] === '/') {
        // 闭标签 </tag>
        const close = slice.slice(i).match(/^<\/\s*([A-Za-z_][\w$.-]*)\s*>/);
        if (close) {
          stack.pop();
          i += close[0].length;
          continue;
        }
      }
      // 开标签或自闭合
      const open = slice.slice(i).match(/^<([A-Za-z_][\w$.-]*)([^>]*)>/);
      if (open) {
        const tag = open[1];
        const attrs = open[2];
        const selfClose = /\/\s*$/.test(attrs);
        const cls = (attrs.match(/className="([^"]+)"/) || [])[1] || (attrs.match(/className=\{([^}]+)\}/) || [])[1] || '';
        const ev = (attrs.match(/\b(on[A-Z]\w*)\s*=\s*\{([^}]+)\}/) || [])[1] || '';
        const evBody = (attrs.match(/\b(on[A-Z]\w*)\s*=\s*\{([^}]+)\}/) || [])[2] || '';
        const depth = stack.length;
        const node = { tag, cls, ev, evBody: evBody.trim().slice(0, 60), depth, zh: [] };
        nodes.push(node);
        if (!selfClose) stack.push(tag);
        i += open[0].length;

        // 提取紧随的文案（到下一个 < 或 {）
        if (!selfClose) {
          const rest = slice.slice(i);
          const txt = rest.match(/^([^<{]+)/);
          if (txt) {
            const zh = txt[1].match(/[\u4e00-\u9fff][^<>{}\n]{0,20}/);
            if (zh) node.zh.push(zh[0]);
          }
        }
        continue;
      }
      i++; continue;
    } else if (c === '{') {
      // 表达式：跳过到配对的 }
      let depth2 = 0, j = i;
      for (; j < n; j++) {
        if (slice[j] === '{') depth2++;
        else if (slice[j] === '}') { depth2--; if (depth2 === 0) break; }
      }
      i = j + 1;
      continue;
    } else {
      i++;
    }
  }
  return nodes;
}

function main() {
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.jsx') && f !== 'shared.js').sort();
  const comps = [];
  for (const f of files) {
    const text = fs.readFileSync(path.join(DIR, f), 'utf8');
    const range = findJsxRange(text);
    if (!range) continue;
    const nodes = parseJsx(text, range);
    if (nodes.length) comps.push({ name: f.replace('.jsx', ''), nodes });
  }
  comps.sort((a, b) => b.nodes.length - a.nodes.length);

  const result = {
    generated_by: 'scripts/13-jsx-tree.cjs',
    inputs: files.map((f) => ({ path: `inputs/pipeline_step/project/src/expanded_components/${f}`, sha256: sha256(path.join(DIR, f)) })),
    stats: { components: comps.length, totalNodes: comps.reduce((s, c) => s + c.nodes.length, 0) },
    components: comps,
  };

  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');

  console.log(`[13-jsx-tree] 组件 ${comps.length} / 标签节点 ${result.stats.totalNodes}`);
  console.log(`[13-jsx-tree] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 13 · 组件 JSX 完整树（机器生成）');
  L.push('');
  L.push('> 由 `scripts/13-jsx-tree.cjs` 解析标签嵌套，勿手改；重跑 `node scripts/13-jsx-tree.cjs`。');
  L.push('');
  for (const c of r.components.slice(0, 40)) {
    L.push(`## ${c.name}（${c.nodes.length} 标签）`);
    L.push('');
    L.push('```');
    for (const nd of c.nodes) {
      const indent = '  '.repeat(nd.depth);
      const cls = nd.cls ? `.${nd.cls.split(' ')[0]}` : '';
      const zh = nd.zh.length ? ` "${nd.zh[0]}"` : '';
      const ev = nd.ev ? ` [${nd.ev}=${nd.evBody}]` : '';
      L.push(`${indent}<${nd.tag}${cls}>${zh}${ev}`);
    }
    L.push('```');
    L.push('');
  }
  return L.join('\n');
}

main();
