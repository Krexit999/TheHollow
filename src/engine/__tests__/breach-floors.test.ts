/**
 * EVERY FLOOR OPENS — the regression suite for the breach gate, all seven
 * shells, not just the one that broke.
 *
 * The reported bug: standing on the Hollow's floor at depth 560, the breach
 * read "Reach the floor first" with the button dead. Two distinct defects
 * behind one symptom, and this file pins both:
 *
 *  1. THE MISLABEL. The Hollow's own gate is faceWhole(), and neither the
 *     panel's label chain nor doBreach's refusal had a branch for it — so the
 *     real blocker fell through to the floor message and lied about itself.
 *  2. THE WALL. Rebuild site k demanded depth >= 14k with no relation to the
 *     shell's floor. A 36-cell face needs 490 (fits under 560), but ANY
 *     `expand` purchase in the Hollow takes the face to 42+ cells, whose last
 *     site wanted depth 574 — past a floor that ends at 560. The face could
 *     then never be whole, so Hollow -> Aleph -> Recursion was permanently
 *     walled by buying a normal upgrade.
 */
import { describe, expect, it } from 'vitest';
import { D } from '../decimal';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { allShells, shellDef } from '../shells';
import { canBreach } from '../systems/breach';
import { keystoneFor } from '../systems/keystones';
import { faceWhole, rebuildDepthFor, REBUILD_DEPTH_PER_CELL } from '../systems/absence';
import { fieldDims } from '../systems/face';
import { addMaterial } from '../systems/forge';

const fresh = () => {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState };
};

/** Put the state on `shellId`'s floor with every OTHER gate satisfied. */
function onFloorOf(s: GameState, shellId: string): void {
  const def = shellDef(shellId);
  s.shell.current = shellId;
  s.depth = def.floorDepth;
  s.depthRecords[shellId] = def.floorDepth;
  s.maxDepthRecord = def.floorDepth;
  s.combat.wardens.push(shellId); // the Warden has fallen
  if (keystoneFor(shellId)) s.keystones.placed.push(shellId); // the floor is shored
}

describe('every shell floor opens its breach', () => {
  it('reaching the floor with warden + keystone enables the breach, in all six that fall', () => {
    for (const shell of allShells()) {
      if (shell.id === 'aleph') continue; // no shell below it — see the case below
      const { s } = fresh();
      onFloorOf(s, shell.id);
      // The Hollow additionally wants its face back; give it whole here, since
      // the point of THIS case is that nothing ELSE blocks a floor.
      if (shell.id === 'hollow') {
        s.hollow.rebuilt = s.face.cells.map((_, i) => i);
        expect(faceWhole(s)).toBe(true);
      }
      expect(canBreach(s), `${shell.id} floor (depth ${shell.floorDepth}) did not open`).toBe(true);
    }
  });

  it("Aleph's floor deliberately does not breach — it is the Core, not a stair", () => {
    const { s } = fresh();
    onFloorOf(s, 'aleph');
    expect(canBreach(s)).toBe(false); // nextShell() is null: Recursion takes over
  });

  it('one depth short of any floor keeps it shut', () => {
    for (const shell of allShells()) {
      const { s } = fresh();
      onFloorOf(s, shell.id);
      s.depth = shell.floorDepth - 1;
      expect(canBreach(s), `${shell.id} opened one depth early`).toBe(false);
    }
  });
});

describe("the Hollow's face gate", () => {
  it('names ITSELF when it is the blocker — never the floor', () => {
    const { engine, s } = fresh();
    onFloorOf(s, 'hollow');
    expect(faceWhole(s)).toBe(false);
    expect(canBreach(s)).toBe(false);
    const r = engine.dispatch({ type: 'breach' });
    expect(r.ok).toBe(false);
    const reason = (r as { reason: string }).reason.toLowerCase();
    expect(reason, 'the refusal blamed the floor while the face was the gate').toContain('face');
    expect(reason).not.toContain('descend to it');
  });

  it('every rebuild site is reachable at or before the shell floor, at EVERY face size', () => {
    // The wall this file exists for. Walk every face size `expand` can produce
    // and assert the last site is standable-on within the shell.
    const floor = shellDef('hollow').floorDepth;
    for (let expand = 0; expand <= 10; expand++) {
      const { w, h } = fieldDims(expand);
      const cells = w * h;
      const lastSite = rebuildDepthFor(cells - 1, floor);
      expect(
        lastSite,
        `expand ${expand} -> ${cells} cells: last site wants depth ${lastSite}, floor ends at ${floor}`,
      ).toBeLessThanOrEqual(floor);
    }
  });

  it('an expanded face can still be made whole standing on the floor', () => {
    const { engine, s } = fresh();
    onFloorOf(s, 'hollow');
    // The trap: buy the face wider in the Hollow, then try to finish it.
    s.upgrades['expand'] = 1;
    const { w, h } = fieldDims(1);
    s.face.w = w;
    s.face.h = h;
    s.face.cells = new Array(w * h).fill(0);
    s.currencies['void'] = D('1e300'); // cost is not what this case tests
    addMaterial(s, 'emberglass', 70, w * h); // nor is the spine's glass (cells 9+)
    for (let i = 0; i < w * h; i++) {
      const r = engine.dispatch({ type: 'rebuildCell', cell: i });
      expect(r.ok, `cell ${i} of ${w * h} refused at the floor: ${(r as { reason?: string }).reason}`).toBe(true);
    }
    expect(faceWhole(s)).toBe(true);
    expect(canBreach(s)).toBe(true);
  });

  it('the site schedule is unchanged for the default 36-cell face', () => {
    // The fix must not re-pace the shell it was already pacing correctly.
    const floor = shellDef('hollow').floorDepth;
    for (const k of [0, 1, 10, 35]) {
      expect(rebuildDepthFor(k, floor)).toBe(REBUILD_DEPTH_PER_CELL * k);
    }
  });
});
