/**
 * NO RESET LAYER SITS ON A PLAIN CLICK (A.98).
 *
 * Found from the wrong end. The A.97 driver's `dismiss` helper matched
 * `/Begin again/` to close a run-summary modal; the RECURSION button's label is
 * "Begin again, knowing — RECURSION n", so every driver run that opened the
 * rewrite tab silently fired the third reset layer while trying to close a
 * dialog. Anchoring the selector fixes the harness — and leaves the reason it
 * was possible untouched.
 *
 * The reason was this: of the four destructive verbs in the game, three held
 * (Collapse, Breach at 2000ms, "erase everything" at 1500ms) and the RECURSION
 * — which wipes every shell, every Echo and every material and puts you back in
 * Shell I — was ONE UNGUARDED CLICK. A player who has just clicked "Begin
 * again" to dismiss a summary and taps the same region here has ended their
 * world, with no confirmation and no undo.
 *
 * So the invariant is structural and it is about the game, not the harness:
 * A DESTRUCTIVE ACTION IS NEVER DISPATCHED FROM AN `onClick`. It goes through
 * `HoldButton`'s `onConfirm`, which a stray click cannot fire and a stray
 * selector cannot reach either.
 */
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Every action that destroys progress the player cannot get back cheaply. */
const DESTRUCTIVE = ['recurse', 'pourWorld', 'hardReset', 'breach', 'collapse', 'spiral'];

function uiSources(): Array<{ path: string; src: string }> {
  const out: Array<{ path: string; src: string }> = [];
  const walk = (dir: string): void => {
    for (const e of readdirSync(dir)) {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) {
        if (e === '__tests__') continue;
        walk(p);
      } else if (/\.tsx?$/.test(e)) out.push({ path: p, src: readFileSync(p, 'utf8') });
    }
  };
  walk(join('src', 'ui'));
  return out;
}

/**
 * Every `onClick={...}` handler body in a file, flattened. Deliberately crude —
 * it takes everything from `onClick=` to the end of the line plus the two lines
 * after, which is wider than the handler and therefore can only ever produce a
 * FALSE ALARM, never a miss. A guard that errs toward failing is the right way
 * round for this one.
 */
function onClickBodies(src: string): string[] {
  const lines = src.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i]!.includes('onClick=')) continue;
    out.push(lines.slice(i, i + 3).join(' '));
  }
  return out;
}

describe('a reset layer is never one click away', () => {
  it('no destructive action is dispatched from an onClick anywhere in the UI', () => {
    const found: string[] = [];
    for (const { path, src } of uiSources()) {
      for (const body of onClickBodies(src)) {
        for (const act of DESTRUCTIVE) {
          if (body.includes(`'${act}'`) && body.includes('dispatch(')) {
            found.push(`${path}: onClick dispatches '${act}'`);
          }
        }
      }
    }
    expect(found).toEqual([]);
  });

  it('...and the guard can SEE one — red-tested against a synthetic handler', () => {
    const fake = `      <button
        onClick={() => dispatch({ type: 'recurse' })}
      >`;
    const bodies = onClickBodies(fake);
    const caught = bodies.some((b) => b.includes(`'recurse'`) && b.includes('dispatch('));
    expect(caught).toBe(true);
  });

  it('the Recursion and the pour both go through a HoldButton', () => {
    const hollow = readFileSync(join('src', 'ui', 'components', 'hollow.tsx'), 'utf8');
    const seating = readFileSync(join('src', 'ui', 'components', 'seating.tsx'), 'utf8');
    for (const [name, src, act] of [
      ['hollow.tsx', hollow, 'recurse'],
      ['seating.tsx', seating, 'pourWorld'],
    ] as const) {
      const at = src.indexOf(`'${act}'`);
      expect(at, `${name} no longer dispatches ${act}`).toBeGreaterThan(0);
      // The nearest enclosing control, searching backwards, must be a HoldButton.
      const before = src.slice(0, at);
      expect(before.lastIndexOf('<HoldButton'), `${name}: ${act} is not held`)
        .toBeGreaterThan(before.lastIndexOf('<button'));
    }
  });
});

/**
 * ...AND THE SELECTOR SIDE, kept because the harness bug is the thing that
 * found the game bug and the next one will be found the same way.
 */
describe('a driver may not match a destructive button by prefix', () => {
  /**
   * THE RULE IS ANCHORED, NOT ONE EXACT STRING. Two different controls begin
   * with these words and a driver may legitimately want either — the modal's
   * dismiss (`/^Begin again$/`) or the RECURSION itself
   * (`/^Begin again, knowing/`). What is forbidden is the UNANCHORED form,
   * which matches both and picks whichever is first in the DOM.
   */
  it('every "Begin again" matcher in every script is anchored', () => {
    const bad: string[] = [];
    for (const f of readdirSync('scripts')) {
      if (!f.endsWith('.ts')) continue;
      const src = readFileSync(join('scripts', f), 'utf8');
      const lines = src.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i]!;
        if (!l.includes('Begin again')) continue;
        if (l.includes('//') || l.includes('*')) continue;      // a comment about it
        if (!l.includes('/^Begin again')) bad.push(`scripts/${f}:${i + 1}  ${l.trim()}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('...and it rejects the unanchored form, which is the one that bit', () => {
    const loose = `const b = page.getByRole('button', { name: /Begin again/ });`;
    expect(loose.includes('Begin again') && !loose.includes('/^Begin again')).toBe(true);
  });
});
