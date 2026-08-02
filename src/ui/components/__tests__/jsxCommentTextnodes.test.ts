/**
 * `react/jsx-no-comment-textnodes`, AS A TEST RATHER THAN AS A LINT RULE.
 *
 * A bare `/* *\/` or `//` in JSX CHILD position is not a comment — JSX renders it
 * as visible body text. This has shipped in this codebase once already, which is
 * why the proof brief names the rule specifically.
 *
 * The project has no ESLint install, and adding eslint + eslint-plugin-react as
 * dependencies is a much larger change than the hazard warrants. So the rule is
 * implemented here instead: same defect, same coverage, runs in the suite that
 * already runs, no new dependency. If ESLint arrives later this file can go.
 *
 * WHAT IT LOOKS FOR: a comment that opens on a line where the previous
 * meaningful line ended a JSX OPENING tag (`...>` but not `/>`, `=>` or a
 * generic's `>`), with no `{` bracing it. That is exactly the shape that
 * renders.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(process.cwd(), 'src');

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith('.tsx')) out.push(p);
  }
  return out;
}

/** Did this line finish a JSX opening tag, putting the next line in children? */
function opensChildren(line: string): boolean {
  const t = line.trim();
  if (!t.endsWith('>')) return false;
  if (t.endsWith('/>') || t.endsWith('=>') || t.endsWith('->')) return false;
  // A generic (`Record<string, X>`) or a comparison is not a tag.
  if (!/[<]/.test(t) && !/^[a-zA-Z0-9_$."'\][)}\s=:-]*>$/.test(t)) return false;
  // The last `<` on the line has to look like a tag, or be a continuation of a
  // multi-line opening tag (attributes on their own lines).
  const lastOpen = t.lastIndexOf('<');
  if (lastOpen >= 0) return /^<\/?[A-Za-z]/.test(t.slice(lastOpen));
  // Continuation case: `  onClick={...}` then `>` alone, or `  className="x">`.
  return true;
}

function offenders(src: string): number[] {
  const lines = src.split(/\r?\n/);
  const bad: number[] = [];
  let inBlockComment = false;
  let prevMeaningful = '';
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const t = raw.trim();
    if (inBlockComment) {
      if (t.includes('*/')) inBlockComment = false;
      continue;
    }
    if (t === '') continue;
    if (t.startsWith('/*') || t.startsWith('//')) {
      // A comment that is BRACED is fine — `{/* ... */}` is the correct form.
      const braced = t.startsWith('{/*') || t.startsWith('{//');
      if (!braced && opensChildren(prevMeaningful)) bad.push(i + 1);
      if (t.startsWith('/*') && !t.includes('*/')) inBlockComment = true;
      continue;
    }
    prevMeaningful = raw;
  }
  return bad;
}

describe('react/jsx-no-comment-textnodes', () => {
  it('no bare comment sits in JSX child position anywhere in src', () => {
    const found: string[] = [];
    for (const file of tsxFiles(ROOT)) {
      for (const line of offenders(readFileSync(file, 'utf8'))) {
        found.push(`${file.replace(process.cwd(), '.')}:${line}`);
      }
    }
    expect(found).toEqual([]);
  });

  it('the check itself catches the shape it is meant to catch', () => {
    // Without this, a rule that silently matches nothing reports "green" and
    // means nothing — which is how the defect shipped the first time.
    const bad = [
      'function A() {',
      '  return (',
      '    <div className="x">',
      '      /* this renders as body text */',
      '      <span>ok</span>',
      '    </div>',
      '  );',
      '}',
    ].join('\n');
    expect(offenders(bad)).toEqual([4]);

    const good = bad.replace('      /* this renders as body text */', '      {/* this does not */}');
    expect(offenders(good)).toEqual([]);
  });
});
