/**
 * Step Zero (Phase 12): un-mangle Design.md lines 1-702.
 *
 * The main body came back from a paste round-trip backslash-escaped, with
 * `&#x20;` standing in for leading spaces, a blank line inserted after EVERY
 * line, and CRLF endings. Appendix A (703+) was written in-repo and is clean.
 *
 * The blank-run histogram is the whole proof: {1: 234, 3: 58}. Inserting a
 * blank after every line turns "A\nB" into a run of 1 and "A\n\nB" into a run
 * of 3 — so a run of 1 is an artifact to delete and a run of 3 is a real
 * paragraph break to collapse back to one.
 *
 * FORMATTING ONLY. The script asserts content equivalence before writing:
 * strip all whitespace, backslashes and entities from both versions and they
 * must be byte-identical. If that check fails, nothing is written.
 *
 * Usage: npx tsx scripts/unescape-design.ts [--write]
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FILE = 'Design.md';
const BODY_LINES = 702;
const BS = String.fromCharCode(92);
const ESCAPED = new RegExp(BS + BS + '([#~.*\\-&_])', 'g');
const RULE = /^(-{3,}|\*{3,}|_{3,})$/;

const original = readFileSync(FILE, 'utf8');
const all = original.split('\n').map((l) => l.replace(/\r$/, '')); // LF everywhere
const body = all.slice(0, BODY_LINES);
const appendix = all.slice(BODY_LINES);

// 1. entity -> a real space; 2. drop the escaping backslashes.
const clean = body.map((l) => l.replace(/&#x20;/g, ' ').replace(ESCAPED, '$1'));

// 3. collapse the doubled blanks.
const out: string[] = [];
let i = 0;
while (i < clean.length) {
  const line = clean[i]!;
  if (line.trim() === '') {
    let j = i;
    while (j < clean.length && clean[j]!.trim() === '') j++;
    const next = clean[j];
    // A run of 1 is a paste artifact and vanishes — EXCEPT before a thematic
    // break, where removing the blank would make the line above a setext
    // heading ("text\n---" is an H2, not a rule).
    if (j - i >= 2 || (next !== undefined && RULE.test(next))) out.push('');
    i = j;
  } else {
    out.push(line);
    i++;
  }
}

const rebuilt = [...out, ...appendix].join('\n');

// --- content equivalence: formatting may move, characters may not ---------
const signature = (s: string) =>
  s
    .replace(/&#x20;/g, ' ')
    .replace(ESCAPED, '$1')
    .replace(/\s+/g, '');
const before = signature(original);
const after = signature(rebuilt);
if (before !== after) {
  let k = 0;
  while (k < Math.min(before.length, after.length) && before[k] === after[k]) k++;
  console.error('CONTENT CHANGED — refusing to write.');
  console.error(`  first difference at char ${k}`);
  console.error(`  before: ${JSON.stringify(before.slice(k - 60, k + 60))}`);
  console.error(`  after:  ${JSON.stringify(after.slice(k - 60, k + 60))}`);
  process.exit(1);
}

console.log('content equivalence: OK (identical ignoring whitespace/escapes)');
console.log(`body ${body.length} -> ${out.length} lines; total ${all.length} -> ${out.length + appendix.length}`);
console.log('backslashes left in body:', (out.join('\n').match(new RegExp(BS + BS, 'g')) ?? []).length);
console.log('&#x20; left in body:', (out.join('\n').match(/&#x20;/g) ?? []).length);
console.log('CR left in file:', (rebuilt.match(/\r/g) ?? []).length);

if (process.argv.includes('--write')) {
  writeFileSync(FILE, rebuilt.endsWith('\n') ? rebuilt : rebuilt + '\n', 'utf8');
  console.log('WROTE', FILE);
} else {
  console.log('(dry run — pass --write to apply)');
}
