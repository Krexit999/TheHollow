const fs=require('fs'),cp=require('child_process');
const CASES=[
 ['one-per-ripening reset','src/engine/systems/breaks.ts',
  '  if (went) for (const k of Object.keys(ripe)) ripe[k] = 0;',
  '  if (false) for (const k of Object.keys(ripe)) ripe[k] = 0;'],
 ['clearBreakOnRecast','src/engine/systems/breaks.ts',
  "  if (brokenAs(state, machineId) === 'blowout') delete ensureBroken(state)[machineId];",
  "  if (false) delete ensureBroken(state)[machineId];"],
 ['silence is not a stop','src/engine/systems/breaks.ts',
  "  return brokenAs(state, machineId) === 'blowout';",
  "  return brokenAs(state, machineId) !== null;"],
 ['the blowout costs the bank','src/engine/systems/breaks.ts',
  '      state.currencies[chipId] = held.mul(1 - PURGE_SLAG_COST);',
  '      state.currencies[chipId] = held.mul(1);'],
 ['neighbours are dragged','src/engine/systems/breaks.ts',
  '  const took = dragNeighbours(state, just);',
  '  const took = []; void dragNeighbours;'],
 ['the overgrown rule is unreachable','src/engine/systems/condition.ts',
  "    writing: (s, id) => tierOf(s, id) > 0 && (s.plant?.served?.[id] ?? 0) <= 0,",
  "    writing: (s, id) => tierOf(s, id) > 0 && (s.plant?.served?.[id] ?? 0) <= 1,"],
];
const F='src/engine/__tests__/breaks.test.ts';
let bad=0;
for(const [label,file,from,to] of CASES){
  const orig=fs.readFileSync(file,'utf8');
  if(!orig.includes(from)){console.log(`?? ${label}: anchor not found — VACUOUS`);bad++;continue;}
  fs.writeFileSync(file,orig.replace(from,to));
  let out='';
  try{out=cp.execSync(`npx vitest run ${F}`,{encoding:'utf8',stdio:['ignore','pipe','pipe']});}
  catch(e){out=(e.stdout||'')+(e.stderr||'');}
  fs.writeFileSync(file,orig);
  const clean=out.replace(/\x1b\[[0-9;]*m/g,'');
  const m=clean.match(/Tests\s+(\d+) failed/);
  const failed=m?Number(m[1]):0;
  const ok=failed>0;
  if(!ok)bad++;
  console.log(`${ok?'RED  ':'GREEN'}  ${String(failed).padStart(2)} failed  ${label}`);
}
console.log(bad===0?'\nALL GUARDS RED-TESTED':`\n${bad} GUARD(S) DID NOT GO RED`);
process.exit(bad===0?0:1);
