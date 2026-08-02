/**
 * THE ENSURE AUDIT — "is this slice populated by the ENGINE, or by whoever
 * happens to render it?"
 *
 * WHY THIS EXISTS AS A SCRIPT. The Roll was populated lazily by `rollRows`,
 * which was correct only while the Roll panel was mounted on the Dig screen.
 * The moment it moved to the Shaft screen, every other consumer read an empty
 * table — the Standoff printed "Hazard 0" over a fight running at intensity 1.
 * That audit was then done BY HAND, twice, because the obvious tool for it lied:
 *
 *   graphify-out/graph.json is built at commit 147814a — the INITIAL COMMIT,
 *   94 commits ago. Its `ensure*` node list holds six entries and none of them
 *   are plant, roll or standoff, because those three FILES DID NOT EXIST when
 *   the graph was built. It did not "miss" them; it predates them. Per the
 *   project rule the graph is never regenerated, so the repair is not a better
 *   graph query — it is an audit that reads the source and uses the graph only
 *   as a hint it then verifies.
 *
 * So this scans `src/engine` directly and answers three questions:
 *
 *   1. Which GameState slices are OPTIONAL and self-initialising
 *      (`state.x ??= defaultXState()`)? Those are the ones that can be read
 *      before anything populates them.
 *   2. For each `ensureX`, where is it called from — and is any of those call
 *      sites on the ENGINE TICK path (`step()` in index.ts, or a `tick*`
 *      function), as opposed to an action handler or a React render?
 *   3. Does any reader fall back to a zero value instead of ensuring?
 *
 *   npx tsx scripts/audit-ensure.ts
 *
 * Exits non-zero if a slice is reachable ONLY from a render path — the exact
 * shape of the bug this exists to prevent.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const ENGINE = join(ROOT, 'src', 'engine');
const UI = join(ROOT, 'src', 'ui');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      out.push(...walk(p));
    } else if (name.endsWith('.ts') || name.endsWith('.tsx')) {
      out.push(p);
    }
  }
  return out;
}

const rel = (p: string): string => relative(ROOT, p).replace(/\\/g, '/');

/**
 * COMMENTS OUT, AND THIS IS NOT A DETAIL. The first run of this audit reported
 * `contentsOf` as an unguarded zero-fallback — because the comment ABOVE
 * `contentsOf` quotes the old unguarded line verbatim, to explain what was
 * fixed. An audit that reads its own documentation as code will flag every
 * bug it has already fixed, forever, and this codebase comments heavily on
 * purpose. Blanked rather than deleted so byte offsets (and therefore the
 * enclosing-function lookup and reported line numbers) still line up.
 */
function stripComments(text: string): string {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1: string) => p1 + ' '.repeat(m.length - p1.length));
}

const engineFiles = walk(ENGINE);
const uiFiles = walk(UI);
const allFiles = [...engineFiles, ...uiFiles];
const src = new Map<string, string>();
for (const f of allFiles) src.set(f, stripComments(readFileSync(f, 'utf8')));

// ---------------------------------------------------------------------------
// 1. The optional, self-initialising slices
// ---------------------------------------------------------------------------
interface Slice { name: string; file: string; ensure: string | null }
const slices: Slice[] = [];
for (const [file, text] of src) {
  for (const m of text.matchAll(/state\.(\w+)\s*\?\?=\s*(default\w+)\(\)/g)) {
    slices.push({ name: m[1]!, file: rel(file), ensure: null });
  }
}

// ---------------------------------------------------------------------------
// 2. Every ensure* and where it is called from
// ---------------------------------------------------------------------------
interface Ensure {
  name: string;
  owner: string;
  /** call sites, excluding the definition and self-recursion inside its own file */
  callers: { file: string; enclosing: string; onTick: boolean }[];
}

/** The function a given character offset sits inside, by the nearest preceding
 *  `function name(` / `const name = (` above it. Crude but stable enough for a
 *  codebase that declares every system function at top level. */
function enclosingFn(text: string, index: number): string {
  const before = text.slice(0, index);
  const decls = [...before.matchAll(/(?:^|\n)\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)|(?:^|\n)\s*(?:export\s+)?const\s+(\w+)\s*[:=][^=]*?=>/g)];
  const last = decls[decls.length - 1];
  return last ? (last[1] ?? last[2] ?? '?') : '<module>';
}

const ensures: Ensure[] = [];
for (const [file, text] of src) {
  for (const m of text.matchAll(/export function (ensure[A-Z]\w*)\s*\(/g)) {
    ensures.push({ name: m[1]!, owner: rel(file), callers: [] });
  }
}

for (const e of ensures) {
  for (const [file, text] of src) {
    for (const m of text.matchAll(new RegExp(`\\b${e.name}\\s*\\(`, 'g'))) {
      // skip the definition itself
      if (text.slice(Math.max(0, m.index! - 20), m.index!).includes('export function')) continue;
      const fn = enclosingFn(text, m.index!);
      const f = rel(file);
      // THE TICK PATH: index.ts's step(), or any tick* function anywhere.
      const onTick = /^tick/i.test(fn) || (f.endsWith('engine/index.ts') && fn === 'step');
      e.callers.push({ file: f, enclosing: fn, onTick });
    }
  }
}

for (const s of slices) {
  const guess = ensures.find((e) => e.name.toLowerCase() === `ensure${s.name}`.toLowerCase());
  s.ensure = guess?.name ?? null;
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------
console.log('OPTIONAL SELF-INITIALISING SLICES (state.x ??= defaultX())');
console.log('  These are the ones a reader can hit before anything populates them.\n');
for (const s of slices) {
  console.log(`  state.${s.name.padEnd(10)} owner ${s.file}   ensure: ${s.ensure ?? 'NONE'}`);
}

console.log('\nENSURE FUNCTIONS, AND WHO CALLS THEM\n');
const problems: string[] = [];
for (const e of ensures.sort((a, b) => a.name.localeCompare(b.name))) {
  const tickSites = e.callers.filter((c) => c.onTick);
  const uiSites = e.callers.filter((c) => c.file.startsWith('src/ui/'));
  const engineSites = e.callers.filter((c) => !c.file.startsWith('src/ui/'));
  const verdict = tickSites.length > 0
    ? 'TICK-POPULATED'
    : engineSites.length > 0
      ? 'self-healing at engine entry points'
      : 'RENDER-ONLY';
  console.log(`  ${e.name}  (${e.owner})`);
  console.log(`      ${verdict} — ${tickSites.length} tick, ${engineSites.length} engine, ${uiSites.length} ui`);
  for (const c of tickSites) console.log(`        tick   ${c.file} :: ${c.enclosing}()`);
  if (verdict === 'RENDER-ONLY') {
    problems.push(`${e.name} is only ever called from a render path`);
  }
}

// ---------------------------------------------------------------------------
// 3. Readers that fall back to a zero value instead of ensuring
// ---------------------------------------------------------------------------
console.log('\nZERO-FALLBACK READERS (a plausible empty value, indistinguishable from real data)\n');
let fallbacks = 0;
for (const [file, text] of src) {
  if (file.includes(`${'src'}/ui`)) continue;
  for (const m of text.matchAll(/state\.(\w+)\?\.\w+\[[^\]]+\]\s*\?\?\s*\{/g)) {
    const slice = m[1]!;
    if (!slices.some((s) => s.name === slice)) continue;
    const fn = enclosingFn(text, m.index!);
    // A reader that calls ensure* first is fine — that is the fixed shape.
    const body = text.slice(Math.max(0, m.index! - 400), m.index!);
    const guarded = /ensure[A-Z]\w*\(state\)/.test(body);
    console.log(`  ${rel(file)} :: ${fn}()  on state.${slice}  ${guarded ? '— guarded by ensure' : '— UNGUARDED'}`);
    if (!guarded) { fallbacks += 1; problems.push(`${rel(file)}::${fn}() falls back to an empty value on state.${slice} without ensuring`); }
  }
}
if (fallbacks === 0) console.log('  none unguarded');

console.log('');
if (problems.length === 0) {
  console.log('CLEAN — every optional slice is populated by the engine or self-heals at its own entry points.');
} else {
  console.log(`${problems.length} PROBLEM(S):`);
  for (const p of problems) console.log(`  - ${p}`);
}
process.exit(problems.length === 0 ? 0 : 1);
