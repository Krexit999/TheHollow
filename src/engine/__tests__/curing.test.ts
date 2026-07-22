/**
 * CACHES + CURING + LIFTS (Phase 19). The column holds things now.
 *
 * The rules the brief set, as properties:
 *   1. Curing CONVERTS, never PRODUCES — N in, N out, better not more (pillar 2).
 *   2. Nothing is missable or spoils — pull early to get the stone back uncured;
 *      leaving a cure a year is never worse than a week.
 *   3. Discovery — which stone cures into what is found, then written to a Codex.
 *   4. Caches SURVIVE Collapse and surface on Breach; nothing is ever stranded.
 *   5. The lift rides the RAIL and no further — batched descent, never new ground.
 *   6. None of it grants currency: it moves and converts material, it never mints.
 */
import { describe, expect, it } from 'vitest';
import { createEngine } from '../index';
import type { GameState } from '../types';
import { ModifierCache } from '../modifiers';
import { addMaterial, materialCount } from '../systems/forge';
import {
  installCache, depositCache, collectCache, cacheReady, cacheProgress,
  installLift, cachesOf, surfaceCaches, CACHE_CAP,
} from '../systems/shaftSys';
import { CURE_RECIPES, cureFor, HOUR_MS } from '../systems/curing';
import { doCollapse } from '../systems/collapseSys';
import { handleAction } from '../actions';
import { tickExpeditions, claimExpedition } from '../systems/museum';
import { currentShell } from '../shells';
import { D } from '../decimal';

const ctx = { emit: () => {}, dirty: () => {} };
const mods = new ModifierCache();

function atDepth(depth = 30, cores = 200): GameState {
  const engine = createEngine({ nowMs: 0 });
  const s = engine.getState() as GameState;
  s.kiln.built = true;
  s.depth = depth;
  s.shaft.reached = depth;
  s.depthRecords['loam'] = depth;
  s.maxDepthRecord = depth;
  s.currencies['core'] = D(cores);
  s.guild.clockMs = 0;
  return s;
}

describe('RULE 1 — curing converts, never produces', () => {
  it('a batch of N cures into exactly N of the result', () => {
    const s = atDepth(30);
    addMaterial(s, 'ochre', 60, 20);
    installCache(s, ctx); // at depth 30
    const idx = s.shaft.caches.length - 1;
    depositCache(s, ctx, idx, 'ochre', 20);
    expect(materialCount(s, 'ochre')).toBe(0); // moved out of the Hold
    s.guild.clockMs = cureFor('ochre')!.hours * HOUR_MS; // wait it out
    const r = collectCache(s, ctx, idx);
    expect((r.data as { cured: boolean }).cured).toBe(true);
    expect(materialCount(s, 'rustochre')).toBe(20); // N in, N out — never more
    expect(materialCount(s, 'ochre')).toBe(0);
  });

  it('no cure recipe ever increases the count, at any shell', () => {
    for (const r of CURE_RECIPES) {
      const s = atDepth(Math.max(30, r.minDepth));
      addMaterial(s, r.from, 60, 10);
      // place the cache deep enough
      s.depth = r.minDepth; s.shaft.reached = r.minDepth;
      installCache(s, ctx);
      const idx = s.shaft.caches.length - 1;
      const dep = depositCache(s, ctx, idx, r.from, 10);
      expect(dep.ok, `${r.id} deposit`).toBe(true);
      s.guild.clockMs += r.hours * HOUR_MS;
      collectCache(s, ctx, idx);
      expect(materialCount(s, r.to), `${r.id} count`).toBe(10);
    }
  });
});

describe('RULE 2 — nothing missable, nothing spoils', () => {
  it('pulling early returns the ORIGINAL stone, uncured, losing nothing', () => {
    const s = atDepth(30);
    addMaterial(s, 'ochre', 55, 12);
    installCache(s, ctx);
    depositCache(s, ctx, 0, 'ochre', 12);
    s.guild.clockMs = HOUR_MS; // 1h — not enough (ochre needs 3h)
    expect(cacheReady(s, s.shaft.caches[0]!)).toBe(false);
    const r = collectCache(s, ctx, 0);
    expect((r.data as { cured: boolean }).cured).toBe(false);
    expect(materialCount(s, 'ochre')).toBe(12); // all of it, back
    expect(materialCount(s, 'rustochre')).toBe(0);
  });

  it('a cure left far past ready is identical to one left just ready', () => {
    const week = atDepth(30); addMaterial(week, 'ochre', 60, 5); installCache(week, ctx);
    depositCache(week, ctx, 0, 'ochre', 5);
    week.guild.clockMs = cureFor('ochre')!.hours * HOUR_MS; // exactly ready
    collectCache(week, ctx, 0);

    const year = atDepth(30); addMaterial(year, 'ochre', 60, 5); installCache(year, ctx);
    depositCache(year, ctx, 0, 'ochre', 5);
    year.guild.clockMs = 365 * 24 * HOUR_MS; // a year
    collectCache(year, ctx, 0);

    expect(materialCount(year, 'rustochre')).toBe(materialCount(week, 'rustochre'));
    expect(cacheProgress(year, { shell: 'loam', depth: 30, material: 'ochre', qty: 1, purity: 60, startedMs: 0 })).toBe(1);
  });
});

describe('RULE 3 — discovery, then a Codex', () => {
  it('the cure is recorded the first time it completes', () => {
    const s = atDepth(30);
    addMaterial(s, 'ochre', 60, 3);
    installCache(s, ctx);
    depositCache(s, ctx, 0, 'ochre', 3);
    s.guild.clockMs = cureFor('ochre')!.hours * HOUR_MS;
    expect(s.shaft.curesFound).not.toContain('cureOchre');
    collectCache(s, ctx, 0);
    expect(s.shaft.curesFound).toContain('cureOchre');
  });

  it('a stone needs the deep — a shallow cache refuses it', () => {
    const s = atDepth(8); // shallower than any cure
    addMaterial(s, 'ochre', 60, 5);
    installCache(s, ctx); // cache at depth 8
    const r = depositCache(s, ctx, 0, 'ochre', 5); // ochre needs depth 12
    expect(r.ok).toBe(false);
    expect(materialCount(s, 'ochre')).toBe(5); // nothing consumed on a refusal
  });

  it('a stone that does not cure is refused outright', () => {
    const s = atDepth(30);
    addMaterial(s, 'marl', 60, 5); // marl has no cure
    installCache(s, ctx);
    expect(depositCache(s, ctx, 0, 'marl', 5).ok).toBe(false);
  });
});

describe('RULE 4 — caches survive Collapse, surface on Breach', () => {
  it('a cache and its curing stone survive a Collapse', () => {
    const s = atDepth(60);
    addMaterial(s, 'ochre', 60, 10);
    installCache(s, ctx);
    depositCache(s, ctx, 0, 'ochre', 10);
    doCollapse(s, mods, ctx);
    expect(s.depth).toBe(0);
    expect(cachesOf(s, 'loam').length).toBe(1); // the cache held
    expect(s.shaft.caches[0]!.material).toBe('ochre'); // still curing
  });

  it('a Breach empties every cache back to the Hold — nothing stranded', () => {
    const s = atDepth(60);
    addMaterial(s, 'ochre', 60, 8);
    installCache(s, ctx);
    depositCache(s, ctx, 0, 'ochre', 8);
    s.guild.clockMs = cureFor('ochre')!.hours * HOUR_MS; // finished
    surfaceCaches(s, ctx, 'loam');
    expect(cachesOf(s, 'loam').length).toBe(0);
    expect(materialCount(s, 'rustochre')).toBe(8); // came up cured
  });
});

describe('RULE 6 — none of this mints currency', () => {
  it('install, deposit and collect spend Cores but grant no chip/conv income', () => {
    const s = atDepth(30, 50);
    const chip = s.currencies['dust'] ?? D(0);
    addMaterial(s, 'ochre', 60, 5);
    installCache(s, ctx);
    depositCache(s, ctx, 0, 'ochre', 5);
    s.guild.clockMs = cureFor('ochre')!.hours * HOUR_MS;
    collectCache(s, ctx, 0);
    expect((s.currencies['dust'] ?? D(0)).eq(chip)).toBe(true); // no income appeared
  });

  it('a cache holds at most CACHE_CAP of a stone — the honesty cap', () => {
    const s = atDepth(30);
    addMaterial(s, 'ochre', 60, CACHE_CAP + 40);
    installCache(s, ctx);
    depositCache(s, ctx, 0, 'ochre', CACHE_CAP + 40);
    expect(s.shaft.caches[0]!.qty).toBe(CACHE_CAP); // capped
    expect(materialCount(s, 'ochre')).toBe(40); // the overflow stayed in the Hold
  });
});

describe('EXPEDITIONS FROM DEPTH (Phase 5) — deeper start, deeper world', () => {
  const send = (s: GameState, crewId: string, routeId: string, fromDepth?: number) =>
    handleAction(s, { type: 'sendExpedition', crewId, routeId, fromDepth }, { mods, ctx, replaceState: () => {} });

  function withCrew(): GameState {
    const s = atDepth(60);
    s.guild.discovered = true;
    s.guild.hirelings['pell'] = { level: 4, xp: 400, status: 'well', hiredAtMs: 0 } as never;
    return s;
  }

  it('a crew departs the column only from a cache you have sunk', () => {
    const s = withCrew();
    expect(send(s, 'pell', 'shortWalk', 50).ok).toBe(false); // no cache at 50
    installCache(s, ctx); // cache at 60
    expect(send(s, 'pell', 'shortWalk', 60).ok).toBe(true);
    expect(s.expeditions.active[0]!.fromDepth).toBe(60);
  });

  it('departure depth carries through to the returned haul, and reaches the DEEPEST left-behind shell', () => {
    const s = withCrew();
    // Stand in Verdance with Loam AND Ferrite closed behind — two worlds to reach.
    s.shell.current = 'verdance';
    s.depth = 290; s.shaft.reached = 290;
    s.depthRecords = { loam: 150, ferrite: 250, verdance: 290 };
    s.shaft.caches = [{ shell: 'verdance', depth: 290, material: null, qty: 0, purity: 0, startedMs: 0 }];
    expect(send(s, 'pell', 'shortWalk', 290).ok).toBe(true);
    s.guild.clockMs += 10 * 60_000; // let the short walk finish
    tickExpeditions(s);
    expect(s.expeditions.ready[0]!.fromDepth).toBe(290);
    // A floor departure (reach = 1) reaches the DEEPEST world left behind: Ferrite,
    // not the shallower Loam — deterministic regardless of the run's seed.
    const r = claimExpedition(s, ctx, 'pell');
    expect((r.data as { from: string }).from).toBe('Ferrite');
  });

  it('a surface send is NOT forced to the deepest world (reach 0 keeps the seed spread)', () => {
    const s = withCrew();
    s.shell.current = 'verdance';
    s.depthRecords = { loam: 150, ferrite: 250, verdance: 290 };
    // seed 0 → base index 0 → Loam (the shallower), proving depth changed the pick.
    expect(send(s, 'pell', 'shortWalk', 0).ok).toBe(true);
    s.guild.clockMs += 10 * 60_000;
    tickExpeditions(s);
    const r = claimExpedition(s, ctx, 'pell');
    expect((r.data as { from: string }).from).toBe('Loam');
  });
});

describe('RULE 5 — the lift rides the rail, no further', () => {
  it('a lift needs a rail, then rides to the rail head in one action', () => {
    const s = atDepth(40, 500);
    s.currencies[currentShell(s).chipCurrencyId] = D(1e12);
    // Lay rail to 40, then Collapse so we must re-descend.
    s.shaft.rail['loam'] = 40;
    expect(installLift(s, ctx).ok).toBe(true);
    s.depth = 0; s.shaft.reached = 0;
    const r = handleAction(s, { type: 'rideLift' }, { mods, ctx, replaceState: () => {} });
    expect(r.ok).toBe(true);
    expect(s.depth).toBe(40); // rode to the rail head
  });

  it('the lift never carries you past the rail into new ground', () => {
    const s = atDepth(0, 500);
    s.currencies[currentShell(s).chipCurrencyId] = D(1e12);
    s.shaft.rail['loam'] = 20;
    installLift(s, ctx);
    s.shaft.reached = 0;
    handleAction(s, { type: 'rideLift' }, { mods, ctx, replaceState: () => {} });
    expect(s.depth).toBe(20); // stopped dead at the rail head — 21 is new ground
  });
});
