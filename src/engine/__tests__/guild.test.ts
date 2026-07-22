import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEngine } from '../index';
import type { Engine, GameState } from '../types';
import { ModifierCache, computeBucket } from '../modifiers';
import { addMaterial, materialCount, TIER_BASE } from '../systems/forge';
import { addCurrency, getCurrency, getTotal } from '../resources';
import { D } from '../decimal';
import { buyStock, priceFactor, presentIds, stockFor } from '../guild/guild';
import { generateContract, contractSatisfied, completeContract, acceptContract, refillBoard } from '../guild/contracts';
import type { Contract } from '../types';
import { HIRELING_DEFS, hawkerPass, HAWKER_KEEP, hire } from '../guild/hirelings';
import { CARAVAN_ROUTES, caravanTrade, caravanUnlocked, routeRate } from '../guild/caravan';
import { TITLES, equipTitle, sweepTitles } from '../guild/titles';
import { FRAGMENTS, cipherText, rollForFragment, translateFragment, fragmentDef } from '../guild/sable';
import { NPCS, npcsPresent } from '../guild/npcs';
import { rollSpecies, speciesDef } from '../combat/species';
import { COMPETENT_SKILL, resolveFight } from '../combat/combat';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { serialize } from '../save/codec';
import { applyOfflineProgress } from '../systems/offline';

function fresh(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const engine = createEngine({ nowMs: 0 });
  return { engine, s: engine.getState() as GameState, mods: new ModifierCache() };
}

const ctxOf = (_engine: Engine) => ({
  emit: () => {},
  dirty: () => {},
});

/** A guild-open midgame state: collapsed once, forge built, tier-3 tool. */
function lamphouse(): { engine: Engine; s: GameState; mods: ModifierCache } {
  const { engine, s, mods } = fresh();
  s.collapse.count = 1;
  s.forge.built = true;
  s.forge.tools.push({
    id: 5, recipeId: 'deepcutter', name: 'Deepcutter', tier: 3,
    purity: 65, chipPower: 2.6, strikePower: 7.5, sockets: [null, null], alloys: [],
  });
  s.forge.equipped = s.forge.tools.length - 1;
  s.depth = 60;
  s.depthRecords['loam'] = 80;
  s.stats.toolsForged = 2;
  engine.tick(1.2); // let the guild tick discover + populate
  return { engine, s, mods };
}

afterEach(() => vi.restoreAllMocks());

describe('the lamphouse opens in loam and deepens', () => {
  it('discovers at the first collapse; arrivals gate on forge / tier III / breach', () => {
    const { engine, s } = fresh();
    engine.tick(1.2);
    expect(s.guild.discovered).toBe(false);
    s.collapse.count = 1;
    engine.tick(1.2);
    expect(s.guild.discovered).toBe(true);
    expect(npcsPresent({ forgeBuilt: false, tier3: false, breached: false })).toHaveLength(12);
    expect(npcsPresent({ forgeBuilt: true, tier3: false, breached: false })).toHaveLength(18);
    expect(npcsPresent({ forgeBuilt: true, tier3: true, breached: false })).toHaveLength(24);
    expect(npcsPresent({ forgeBuilt: true, tier3: true, breached: true })).toHaveLength(30);
    expect(NPCS).toHaveLength(30);
  });

  it('30 npcs are individuals: unique ids, portraits, lines', () => {
    expect(new Set(NPCS.map((n) => n.id)).size).toBe(30);
    expect(new Set(NPCS.map((n) => n.line)).size).toBe(30);
    const portraitKeys = NPCS.map((n) => `${n.portrait.hue}|${n.portrait.hat}|${n.portrait.eyes}|${n.portrait.extra ?? ''}`);
    expect(new Set(portraitKeys).size).toBe(30);
  });
});

describe('contracts stack with what you were doing', () => {
  it('generates only against the live state: known materials, spawnable species, reachable depth', () => {
    const { s } = lamphouse();
    s.assay.knownMaterials.push('marl', 'loamiron');
    s.combat.stats.encounters = 3;
    const present = presentIds(s);
    for (let i = 0; i < 40; i++) {
      const c = generateContract(s, present);
      expect(c).not.toBeNull();
      if (c!.kind === 'deliver') expect(['marl', 'loamiron']).toContain(c!.materialId);
      if (c!.kind === 'cull') {
        const sp = speciesDef(c!.speciesId!);
        expect(sp.tier).toBeLessThanOrEqual(4); // tool tier 3 + 1
        expect(sp.shellId).toBe('loam');
      }
      if (c!.kind === 'depth') expect(c!.target).toBeLessThanOrEqual(150);
      expect(present.has(c!.npcId)).toBe(true);
    }
  });

  it('deliver flow: accept, satisfy, complete — pays scrip and consumes the goods', () => {
    const { engine, s, mods } = lamphouse();
    s.assay.knownMaterials.push('marl');
    const present = presentIds(s);
    let c = null;
    while (!c || c.kind !== 'deliver') c = generateContract(s, present);
    s.guild.contracts.board[0] = c;
    expect(acceptContract(s, 0).ok).toBe(true);
    expect(contractSatisfied(s, c)).toBe(false);
    addMaterial(s, c.materialId!, 60, c.target);
    expect(contractSatisfied(s, c)).toBe(true);
    const before = getCurrency(s, 'scrip').toNumber();
    const result = completeContract(s, mods, ctxOf(engine), 0, present);
    expect(result.ok).toBe(true);
    expect(getCurrency(s, 'scrip').toNumber()).toBeGreaterThan(before);
    expect(materialCount(s, c.materialId!)).toBe(0);
    expect(s.guild.contracts.board[0]).not.toBeNull(); // board refills
    expect(s.guild.contracts.completed).toBe(1);
  });
});

describe("vess's ledger", () => {
  it('a failed lowball is remembered forever; fair dealing earns the good shelf', () => {
    const { engine, s, mods } = lamphouse();
    addCurrency(s, 'scrip', D(10000));
    const ctx = ctxOf(engine);
    const base = priceFactor(s, 'vess');
    // Force the lowball to FAIL (roll >= 0.35).
    vi.spyOn(Math, 'random').mockReturnValue(0.9);
    buyStock(s, mods, ctx, 'vess', 0, 'lowball');
    expect(s.guild.vess.grudge).toBeGreaterThan(0);
    expect(priceFactor(s, 'vess')).toBeGreaterThan(base);
    vi.restoreAllMocks();
    // Twenty fair deals build trust past the grudge (windows turn as stock
    // sells through — rotation is convenience, not a wall).
    for (let i = 0; i < 20; i++) {
      let r = buyStock(s, mods, ctx, 'vess', i % 3, 'fair');
      if (!r.ok) {
        s.guild.clockMs += 6 * 3600_000 + 1; // the shipment turns
        r = buyStock(s, mods, ctx, 'vess', i % 3, 'fair');
      }
      expect(r.ok).toBe(true);
    }
    expect(s.guild.vess.trust).toBeGreaterThanOrEqual(20);
    const grudged = 1 + Math.min(0.25, s.guild.vess.grudge * 0.01);
    expect(priceFactor(s, 'vess')).toBeLessThan(grudged); // trust bites into it
  });
});

describe('stock rotates convenience, never availability', () => {
  it('is deterministic within a window, different across windows, and never unique', () => {
    const { s } = lamphouse();
    const a = stockFor(s, 'vess');
    const b = stockFor(s, 'vess');
    expect(a.map((x) => x.id)).toEqual(b.map((x) => x.id));
    expect(a.length).toBeGreaterThan(0);
    s.guild.clockMs += 6 * 3600_000 + 1;
    const c = stockFor(s, 'vess');
    expect(c.map((x) => `${x.id}.${x.purity}`)).not.toEqual(a.map((x) => `${x.id}.${x.purity}`));
    for (const slot of [...a, ...c]) {
      expect(['material', 'gem', 'geode', 'currency']).toContain(slot.kind);
    }
  });
});

describe('hirelings handle, sort, sell, carry — they do not mine', () => {
  it('the hawker sells only surplus commons, and pays SCRIP, not chip currency', () => {
    const { s, mods } = lamphouse();
    addMaterial(s, 'marl', 50, HAWKER_KEEP + 10);
    addMaterial(s, 'starmarl', 60, 3); // rare — never his to sell
    s.guild.hirelings['sef'] = { level: 0, xp: 0, status: 'well' };
    const dustBefore = getCurrency(s, 'dust').toString();
    const scripBefore = getCurrency(s, 'scrip').toNumber();
    const paid = hawkerPass(s, mods);
    expect(paid).toBeGreaterThan(0);
    // One pass takes a small basket (8) off the surplus, never the keep-line.
    expect(materialCount(s, 'marl')).toBe(HAWKER_KEEP + 10 - 8);
    expect(materialCount(s, 'starmarl')).toBe(3);
    expect(getCurrency(s, 'dust').toString()).toBe(dustBefore);
    expect(getCurrency(s, 'scrip').toNumber() - scripBefore).toBe(paid);
  });

  it('berths gate hiring; no hireling touches a production bucket beyond a few percent', () => {
    const { engine, s } = lamphouse();
    addCurrency(s, 'scrip', D(10000));
    const ctx = ctxOf(engine);
    expect(s.guild.berths).toBeGreaterThanOrEqual(1);
    let hiredOk = 0;
    for (const def of HIRELING_DEFS) {
      const r = hire(s, ctx, def.npcId);
      if (r.ok) hiredOk += 1;
    }
    expect(hiredOk).toBe(s.guild.berths);
    // Passive faces are single-digit percentages — pillar 2 stays intact.
    for (const def of HIRELING_DEFS) {
      if (!def.passive || def.passive.bucket === 'offlineEffAdd') continue;
      expect(def.passive.base + def.passive.perLevel * 10).toBeLessThanOrEqual(1.15);
    }
  });
});

describe('the caravan is opportunity, never decay', () => {
  it('opens after the breach; every round trip is lossy at every drift phase', () => {
    const { engine, s, mods } = lamphouse();
    expect(caravanUnlocked(s)).toBe(false);
    s.shell.breachCount = 1;
    expect(caravanUnlocked(s)).toBe(true);
    addCurrency(s, 'dust', D(1000));
    // Sweep the clock across a full drift period: A->B->A must always lose.
    const there = CARAVAN_ROUTES.find((r) => r.id === 'chip-conv')!;
    const back = CARAVAN_ROUTES.find((r) => r.id === 'conv-chip')!;
    for (let h = 0; h < 8; h++) {
      s.guild.clockMs = h * 3600_000;
      // chip->conv->chip: ratio × 1/ratio × drift × 1/drift × fee² = fee² < 1
      const rt = routeRate(s, mods, there).toNumber() * routeRate(s, mods, back).toNumber();
      expect(rt).toBeLessThan(1);
    }
    // A byproduct crate pays scrip as EARNED income; a conversion is moved
    // wealth (no totals inflation — achievements can't be traded into).
    addCurrency(s, 'scale', D(500));
    const scripBefore = getCurrency(s, 'scrip').toNumber();
    const dustTotalBefore = getTotal(s, 'dust').toNumber();
    expect(caravanTrade(s, mods, ctxOf(engine), 'scale-scrip', 0.5).ok).toBe(true);
    expect(getCurrency(s, 'scrip').toNumber()).toBeGreaterThan(scripBefore);
    const result = caravanTrade(s, mods, ctxOf(engine), 'conv-chip', 0.5);
    if (result.ok) expect(getTotal(s, 'dust').toNumber()).toBe(dustTotalBefore);
  });
});

describe('titles are builds, not cosmetics', () => {
  it('earned by sweep, one equipped, the modifier follows the choice', () => {
    const { engine, s } = lamphouse();
    const ctx = ctxOf(engine);
    s.collapse.count = 25;
    sweepTitles(s, ctx);
    expect(s.guild.titles.earned).toContain('ashwalker');
    expect(equipTitle(s, ctx, 'unbroken').ok).toBe(false); // not earned
    expect(equipTitle(s, ctx, 'ashwalker').ok).toBe(true);
    const withTitle = computeBucket(s, 'dustYield').toNumber();
    equipTitle(s, ctx, null);
    const without = computeBucket(s, 'dustYield').toNumber();
    expect(withTitle / without).toBeCloseTo(1.06, 5);
    expect(TITLES.length).toBeGreaterThanOrEqual(60);
    expect(new Set(TITLES.map((t) => t.id)).size).toBe(TITLES.length);
  });
});

describe("sable's pages", () => {
  it('28 pages across two shells; bands cover both shells with no orphan', () => {
    expect(FRAGMENTS.filter((f) => f.shellId === 'loam')).toHaveLength(13);
    expect(FRAGMENTS.filter((f) => f.shellId === 'ferrite')).toHaveLength(15);
    for (const f of FRAGMENTS) {
      expect(f.band[0]).toBeLessThan(f.band[1]);
      expect(f.text.length).toBeGreaterThan(120); // authored, not stubbed
    }
  });

  it('surfaces in-band, in-shell, deduped; ciphered pages need quill and scrip', () => {
    const { engine, s } = lamphouse();
    const ctx = ctxOf(engine);
    s.depth = 20;
    // The warm-up tick can surface a page organically (seep rolls) — reset.
    s.guild.sable.found.length = 0;
    s.guild.sable.translated.length = 0;
    vi.spyOn(Math, 'random').mockReturnValue(0); // always surface, pick first
    rollForFragment(s, ctx, 1);
    expect(s.guild.sable.found.length).toBe(1);
    const first = fragmentDef(s.guild.sable.found[0]!);
    expect(first.shellId).toBe('loam');
    expect(first.band[0]).toBeLessThanOrEqual(20);
    expect(first.band[1]).toBeGreaterThanOrEqual(20);
    // A clear page is immediately legible; a ciphered one costs Quill's fee.
    s.guild.sable.found.push('p31');
    expect(translateFragment(s, ctx, 'p31').ok).toBe(false); // no scrip
    addCurrency(s, 'scrip', D(1000));
    expect(translateFragment(s, ctx, 'p31').ok).toBe(true);
    expect(s.guild.sable.translated).toContain('p31');
    // The cipher is deterministic and preserves shape.
    expect(cipherText('abc def')).toBe(cipherText('abc def'));
    expect(cipherText('abc def')).toContain(' ');
  });
});

describe('step zero: the offer distribution at gear-appropriate fixed points', () => {
  it('every ladder state offers a majority-engageable mix with a representative kit', () => {
    const points = [
      { shell: 'loam', depth: 60, tier: 2, floor: 0.9 },
      { shell: 'loam', depth: 130, tier: 3, floor: 0.9 },
      { shell: 'ferrite', depth: 120, tier: 5, floor: 0.9 },
      { shell: 'ferrite', depth: 200, tier: 6, floor: 0.7 },
      { shell: 'verdance', depth: 60, tier: 7, floor: 0.85 },
      { shell: 'verdance', depth: 280, tier: 9, floor: 0.6 },
    ];
    for (const p of points) {
      const { s, mods } = fresh();
      s.depth = p.depth;
      if (p.shell === 'ferrite') s.shell.current = 'ferrite';
      s.forge.tools.push({
        id: 9, recipeId: 'x', name: 'x', tier: p.tier, purity: 60,
        chipPower: 1, strikePower: TIER_BASE[p.tier]!.strike,
        sockets: p.tier >= 5 ? ['bloodgarnet', 'cinderquartz'] : [], alloys: [],
      });
      s.forge.equipped = s.forge.tools.length - 1;
      s.delver.skills['twoHandedSwing'] = Math.min(5, p.tier);
      s.delver.skills['deepGrip'] = Math.min(3, p.tier - 1);
      s.forge.gear.offhand = { defId: p.tier >= 7 ? 'plentyshell' : p.tier >= 5 ? 'lodewardBuckler' : 'marlshield', purity: 60 };
      if (p.tier >= 5) {
        s.forge.gear.harness = { defId: p.tier >= 7 ? 'canopyweave' : 'ironweave', purity: 60 };
        for (const id of ['firstKill', 'wardenLoam', 'kills25']) s.achievements.unlocked[id] = true;
      }
      mods.invalidate();
      let wins = 0;
      const n = 1500;
      for (let i = 0; i < n; i++) {
        const sp = rollSpecies(p.shell, p.depth, Math.random, p.tier);
        if (sp && resolveFight(s, mods, sp, COMPETENT_SKILL).win) wins += 1;
      }
      expect(wins / n, `${p.shell} d${p.depth} T${p.tier}`).toBeGreaterThan(p.floor);
    }
  });
});

describe('step zero: the spawn mix reads your kit', () => {
  it('deep-ferrite spawns for a tier-4 kit are mostly tier <= 5, tier-6 an occasional threat', () => {
    let t6 = 0;
    let atOrNear = 0;
    const n = 3000;
    for (let i = 0; i < n; i++) {
      const sp = rollSpecies('ferrite', 200, Math.random, 4);
      if (!sp) continue;
      if (sp.tier >= 6) t6 += 1;
      if (sp.tier <= 5) atOrNear += 1;
    }
    expect(t6 / n).toBeLessThan(0.25);
    expect(t6 / n).toBeGreaterThan(0.01); // still a real threat
    expect(atOrNear / n).toBeGreaterThan(0.6);
  });
});

describe('the clock and the save', () => {
  it('offline advances the guild clock and the hawker keeps selling', () => {
    const { s, mods } = lamphouse();
    s.guild.hirelings['sef'] = { level: 0, xp: 0, status: 'well' };
    addMaterial(s, 'marl', 50, HAWKER_KEEP + 30);
    const clockBefore = s.guild.clockMs;
    const summary = applyOfflineProgress(s, mods, { emit: () => {}, dirty: () => {} }, 3600);
    expect(s.guild.clockMs - clockBefore).toBe(3600 * 1000);
    expect(summary.scrip).toBeGreaterThan(0);
  });

  it('v5 saves migrate to v6 with a sleeping guild', () => {
    const { s } = fresh();
    const raw = JSON.parse(serialize(s, 123)) as { state: Record<string, unknown> };
    delete raw.state['guild'];
    delete (raw.state['combat'] as Record<string, unknown>)['wardenAttempts'];
    const migrated = runMigrations({ version: 5, savedAt: 123, state: raw.state } as never);
    expect(migrated.version).toBe(SAVE_VERSION);
    const st = migrated.state as Record<string, Record<string, unknown>>;
    expect(st['guild']!['discovered']).toBe(false);
    expect(st['combat']!['wardenAttempts']).toEqual({});
  });
});

describe('nothing here is a login schedule', () => {
  it('no contract carries a deadline; no stock slot is unique; competent play never needs the wall clock', () => {
    const { s } = lamphouse();
    s.assay.knownMaterials.push('marl');
    const c = generateContract(s, presentIds(s));
    expect(c).not.toBeNull();
    expect(Object.keys(c!)).not.toContain('expiresAt');
    expect(Object.keys(c!)).not.toContain('deadline');
    // resolveFight and every guild read use state, never Date.now — spot-check
    // the drift function is pure in clockMs.
    const spy = vi.spyOn(Date, 'now');
    stockFor(s, 'vess');
    routeRate({ ...s, shell: { ...s.shell, breachCount: 1 } } as GameState, new ModifierCache(), CARAVAN_ROUTES[0]!);
    resolveFight(s, new ModifierCache(), speciesDef('marlgrub'), COMPETENT_SKILL);
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('the contract board never posts a visible twin', () => {
  // A contract's id is a sequence number, so two pegs could be byte-identical
  // to the reader while distinct to the code. Worst for kinds with a
  // deterministic target: a `forge` job is always "next tier", so every one
  // generated in the same moment matched. Reproduced at 3-on-a-6-slot-board.
  const identity = (c: Contract) =>
    [c.kind, c.npcId, c.target, c.materialId ?? '', c.speciesId ?? ''].join('|');

  const fill = (slots: number, present: string[]) => {
    const engine = createEngine({ nowMs: Date.now() });
    const s = engine.getState() as GameState;
    s.guild.discovered = true;
    s.guild.contracts.slots = slots;
    s.guild.contracts.board = new Array(slots).fill(null);
    refillBoard(s, new Set(present));
    return s.guild.contracts.board.filter(Boolean) as Contract[];
  };

  it('fills every peg with a distinct job, across repeated draws', () => {
    for (let run = 0; run < 25; run++) {
      const board = fill(6, ['prill', 'brakka', 'vess', 'marrow', 'ashka', 'ruta', 'nock']);
      const ids = board.map(identity);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('holds even when the pool is narrow (one kind, two issuers)', () => {
    for (let run = 0; run < 25; run++) {
      const board = fill(6, ['prill', 'brakka']);
      const ids = board.map(identity);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('leaves a peg empty rather than posting a duplicate when the space is exhausted', () => {
    // 20 pegs against a deliberately tiny generation space: the board may be
    // short, but nothing on it repeats.
    const board = fill(20, ['prill']);
    const ids = board.map(identity);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
