/**
 * REACHABILITY — the test class that would have caught Phase 12's real failure.
 *
 * 233 tests passed while relics never dropped, challenges could never be won,
 * parallel shells could never be created and expeditions paid nothing. Every
 * one of those functions was individually correct and unit-tested. Nothing
 * asserted that ANYTHING CALLED THEM.
 *
 *   A test that a function works is not a test that anything calls it.
 *
 * So: this file reads the source as text and asserts, structurally, that every
 * player-facing action has a live dispatch site and every content-granting
 * function has a live call site outside its own module and outside tests. It is
 * deliberately crude — regex over source — because the failure it prevents is
 * crude, and a subtle check would be one more thing that can quietly pass.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const ALL_FILES = walk(SRC);
const NON_TEST = ALL_FILES.filter((f) => !f.includes('__tests__'));
const read = (f: string) => readFileSync(f, 'utf8');
const CORPUS: Array<{ file: string; text: string }> = NON_TEST.map((f) => ({ file: f, text: read(f) }));

/**
 * Actions the ENGINE or PLATFORM raises for itself — save/load plumbing and the
 * dev-only debug hatch. These legitimately have no player-facing dispatch site.
 */
const ENGINE_INTERNAL = new Set([
  'hydrate', 'applyOffline', 'dismissOffline', 'markSaved', 'markExported',
  'hardReset', 'debug',
]);

/**
 * RETIRED FROM THE UI, NOT FROM THE GAME.
 *
 * Tool crafting moved to the Casting Floor, so the old Forge room's bench, its
 * fixed recipes and its part-swap are gone and nothing in `src/` dispatches
 * these two any more. They are NOT dead:
 *
 *   - `scripts/sim.ts` (outside this corpus) drives them — it is the balance
 *     instrument's model of a player buying up the tool ladder, and it feeds
 *     every warden fight through `strikePower`.
 *   - the Workbench's FORGE act still calls `craftFromParts` engine-side.
 *
 * The old tool SYSTEM is not retired either: it owns strike power, sockets,
 * heirloom marks, opinions and tempering. Deleting it is a separate job with a
 * much larger blast radius than moving a bench, and it is not this one.
 *
 * `replacePart` WAS deleted outright in the same pass — it had no consumer at
 * all once the swap UI went, which is exactly the difference this list is for.
 * An entry here is a claim that something outside `src/` uses it; if that stops
 * being true, delete the action.
 */
const RETIRED_FROM_UI = new Set(['craftTool', 'craftFromParts']);

describe('every dispatchable action is reachable', () => {
  const typesText = read(join(SRC, 'engine', 'types.ts'));
  const unionStart = typesText.indexOf('export type GameAction');
  const union = typesText.slice(unionStart, typesText.indexOf('\n\n', unionStart));
  const actionIds = [...new Set([...union.matchAll(/type:\s*'([a-zA-Z]+)'/g)].map((m) => m[1]!))];

  it('finds the action union', () => {
    expect(actionIds.length).toBeGreaterThan(40);
  });

  /** An exemption for an action that no longer exists is a lie left lying around. */
  it('every UI-retired exemption is still a real action', () => {
    for (const id of RETIRED_FROM_UI) expect(actionIds, id).toContain(id);
  });

  /** ...and it really is out of the UI. This is the claim item 9 was about. */
  it('nothing in the UI dispatches a retired tool-crafting action', () => {
    for (const id of RETIRED_FROM_UI) {
      const inUi = CORPUS.filter(({ file, text }) =>
        file.includes(join('src', 'ui')) && new RegExp(`type:\\s*'${id}'`).test(text));
      expect(inUi.map((x) => x.file), `${id} is still dispatched from the UI`).toEqual([]);
    }
  });

  it.each(actionIds.filter((id) => !ENGINE_INTERNAL.has(id) && !RETIRED_FROM_UI.has(id)))(
    "'%s' has a live dispatch site outside types.ts and actions.ts",
    (id) => {
      const pattern = new RegExp(`type:\\s*'${id}'`);
      const sites = CORPUS.filter(
        ({ file, text }) =>
          !file.endsWith('types.ts') && !file.endsWith(join('engine', 'actions.ts')) && pattern.test(text),
      );
      expect(
        sites.length,
        `Action '${id}' is declared and handled but NOTHING dispatches it. ` +
          'It is unreachable by a player. Either wire a call site or remove the action.',
      ).toBeGreaterThan(0);
    },
  );
});

describe('every content-granting function is called', () => {
  /**
   * Functions that CREATE or PAY OUT something a player can hold. If one of
   * these has no caller, a whole system is invisible — which is exactly what
   * happened to relics, the Museum, challenges and expeditions.
   */
  const GRANTERS: Array<[string, string]> = [
    // (mintRelic/addRelic are internal to relics.ts. grantRelic was the
    // UNCONDITIONAL public entry — excavations and expeditions both called it
    // and both are cut (A.7x); relics are still fully reachable through
    // maybeDropRelic's chance-based drop in systems/drops.ts, so that is the
    // one this list still requires.)
    ['maybeDropRelic', 'engine/systems/relics.ts'],
    ['registerRelicModifiers', 'engine/systems/relics.ts'],
    ['doSpiral', 'engine/systems/spiral.ts'],
    ['fuseRelics', 'engine/systems/relics.ts'],
    ['equipRelic', 'engine/systems/relics.ts'],
  ];

  it.each(GRANTERS)("'%s' has a caller outside %s", (fn, ownFile) => {
    const callers = CORPUS.filter(
      ({ file, text }) =>
        !file.endsWith(ownFile.replace(/\//g, require('node:path').sep)) &&
        new RegExp(`\\b${fn}\\s*\\(`).test(text),
    );
    expect(
      callers.length,
      `${fn}() is exported and tested but NOTHING outside its own module calls it. ` +
        'The system it belongs to is unreachable in play.',
    ).toBeGreaterThan(0);
  });
});

describe('every nav system can actually become visible', () => {
  it('no system is gated on a field nothing ever increments', () => {
    // The specific trap: Relics gate on `relics.found > 0`, which stayed 0
    // forever because nothing called addRelic. Assert the counters that gate
    // rooms are written somewhere outside their own declaration.
    const gateCounters = ['relics.found', 'spiral.count'];
    for (const counter of gateCounters) {
      const [slice, field] = counter.split('.') as [string, string];
      // Three write shapes count: direct mutation, a push, and the
      // rebuild-by-spread idiom (`count: state.spiral.count + 1`) that the
      // reset layers use — missing that third one made this check cry wolf.
      const writes = CORPUS.filter(({ text }) =>
        new RegExp(
          `${slice}\\.${field}\\s*(\\+=|=\\s*[^=])` +
            `|${slice}\\.${field}\\.push` +
            `|${field}:\\s*[^,}\\n]*${slice}\\.${field}`,
        ).test(text),
      );
      expect(writes.length, `Nothing ever writes state.${counter}, so any room gated on it is dead.`).toBeGreaterThan(0);
    }
  });
});
