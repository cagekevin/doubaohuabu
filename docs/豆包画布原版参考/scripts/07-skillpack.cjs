#!/usr/bin/env node
/**
 * 07-skillpack.cjs —— 生成技能包 schema：解析 doubao/dola-skill-pack.json，
 * 提取视频生成参数表单、模型能力、prompt 模板（含 ${} 占位符）。
 *
 * 输入：inputs/electron/doubao-skill-pack.json + dola-skill-pack.json
 * 输出：outputs/07-技能包.json + outputs/07-技能包.md
 * 幂等、可重跑：node scripts/07-skillpack.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const DIR = path.join(ROOT, 'inputs', 'electron');
const FILES = ['doubao-skill-pack.json', 'dola-skill-pack.json'];
const OUT_JSON = path.join(ROOT, 'outputs', '07-技能包.json');
const OUT_MD = path.join(ROOT, 'outputs', '07-技能包.md');

function sha256(p) { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }

function extract(file) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const d = j.data || {};
  const vg = d.video_generation || {};
  const meta = vg.meta || {};

  // 参数表单：option_list 每个元素 → {type, value, options, placeholder}
  const params = (meta.option_list || []).map((o) => ({
    type: o.type,
    value: o.value,
    options: (o.options || []).map((x) => ({ label: x.show_name, value: x.value, default: !!x.is_default })),
    placeholder: o.placeholder ? o.placeholder.placeholder : null,
  }));

  // 模型能力
  const modelCapability = vg.model_capability || {};

  // prompt 模板：所有含 ${} 的字符串
  const templates = new Set();
  const raw = JSON.stringify(j);
  const re = /"([^"]*\$\{[^}]+\}[^"]*)"/g;
  let m;
  while ((m = re.exec(raw))) templates.add(m[1]);

  return {
    file: path.basename(file),
    title: meta.title || null,
    desc: meta.desc || null,
    params,
    modelCapability,
    templates: [...templates],
  };
}

function main() {
  const packs = FILES.map((f) => extract(path.join(DIR, f)));
  const result = {
    generated_by: 'scripts/07-skillpack.cjs',
    inputs: FILES.map((f) => ({ path: `inputs/electron/${f}`, sha256: sha256(path.join(DIR, f)) })),
    packs,
  };
  fs.mkdirSync(path.dirname(OUT_JSON), { recursive: true });
  fs.writeFileSync(OUT_JSON, JSON.stringify(result, null, 2), 'utf8');
  fs.writeFileSync(OUT_MD, renderMarkdown(result), 'utf8');
  console.log(`[07-skillpack] 技能包 ${packs.length} 个`);
  console.log(`[07-skillpack] 已写 ${OUT_JSON} / ${OUT_MD}`);
}

function renderMarkdown(r) {
  const L = [];
  L.push('# 07 · 生成技能包 schema（机器生成）');
  L.push('');
  L.push('> 由 `scripts/07-skillpack.cjs` 生成，勿手改；重跑 `node scripts/07-skillpack.cjs`。');
  L.push('');
  for (const p of r.packs) {
    L.push(`## ${p.file}`);
    L.push('');
    if (p.title) L.push(`- 标题: ${p.title} —— ${p.desc}`);
    L.push('');
    L.push('### 参数表单');
    L.push('');
    L.push('| 参数 | 控件 | 可选项（默认 *） |');
    L.push('|---|---|---|');
    for (const prm of p.params) {
      const opts = prm.options.length
        ? prm.options.map((o) => o.value + (o.default ? '*' : '')).join(' / ')
        : (prm.placeholder || '—');
      L.push(`| \`${prm.value}\` | type=${prm.type} | ${opts} |`);
    }
    L.push('');
    L.push('### 模型能力');
    L.push('');
    L.push('| 模型 | 时长 | 分辨率 | 视频参考 |');
    L.push('|---|---|---|---|');
    for (const [k, v] of Object.entries(p.modelCapability)) {
      L.push(`| \`${k}\` | ${(v.supported_durations || []).join('/')} | ${(v.supported_resolutions || []).join('/')} | ${v.support_video_ref ? '是' : '否'} |`);
    }
    L.push('');
    if (p.templates.length) {
      L.push('### prompt 模板（含占位符）');
      L.push('');
      for (const t of p.templates) L.push(`- \`${t}\``);
      L.push('');
    }
  }
  return L.join('\n');
}

main();
