#!/usr/bin/env node
/* 把未登记的业务声明逐条抽中文串，用于认领角色 */
const fs = require('node:fs');
const J = require('G:/01画布项目/豆包画布/逆向工程/_pipeline_step/analysis/shared-decls.json');
const P = 'G:/01画布项目/豆包画布/逆向工程/_pipeline_step/project/src/expanded_components/shared.js';
const lines = fs.readFileSync(P, 'utf8').split(/\r?\n/);

const TARGETS = ['Ty','FP','mD','KT','B0','fk','eu','FS','e$','Ok','mS','$S','bL','Jl','f3','LS','fD','oR','_D','C3','oO','$y','pP','dR','pD','Ja','$3','dD','gn','uR','d0','fR','Qh','Uk','Ql','Hu','GT','Hd','A0','KL','ef','Mk','v3','Rk','YT','O3','K0','rO','Yl','UP','Bk','f3'];

for (const d of J.decls) {
  if (!TARGETS.includes(d.name) || d.start < 22550) continue;
  const text = lines.slice(d.start - 1, d.end).join('\n');
  const lits = [...new Set([...text.matchAll(/'([^'\\\n]{2,44})'|"([^"\\\n]{2,44})"|`([^`\\\n]{2,44})`/g)]
    .map((m) => m[1] ?? m[2] ?? m[3])
    .filter((s) => /[\u4e00-\u9fa5]/.test(s)))];
  console.log(`\n== ${d.name} (${d.start}-${d.end}, ${d.lines}行) ==`);
  console.log('   ' + (lits.slice(0, 9).join(' ／ ') || '（无）'));
}
