import { readFileSync } from 'node:fs';
const lines = readFileSync('src/engine/materials.ts', 'utf8').split('\n');
for (const shell of ['glassmere', 'cinder']) {
  console.log('=== ' + shell.toUpperCase() + ' ===');
  for (const l of lines) {
    if (!l.includes(`'${shell}'`)) continue;
    const m = /M\('([a-zA-Z0-9]+)', '([^']+)'/.exec(l) || /id: '([a-zA-Z0-9]+)', name: '([^']+)'/.exec(l);
    if (!m) continue;
    const r = /rarity: '(\w+)'|, '(\w+)', \[/.exec(l);
    const rar = /'(common|rich|pure|flawless|starred|aberrant)'/.exec(l);
    const src = /source: '(\w+)'/.exec(l);
    const worked = /, true\)|, true,/.test(l);
    console.log('  ' + (rar ? rar[1] : '?').padEnd(9) + m[1].padEnd(17) + m[2].padEnd(22)
      + (src ? '[' + src[1] + ']' : '') + (worked ? ' WORKED' : ''));
  }
}
