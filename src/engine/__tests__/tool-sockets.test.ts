/**
 * SOCKETS — the doc's step 5, tested at the boundary that matters.
 *
 * The audit that opened this phase found the Sockets part was a stat-only stub
 * whose stat nothing read, so the tests here are weighted toward the two
 * questions an audit would ask again:
 *
 *   1. Does a socketed thing actually reach the LIVE PATH, or does it merely
 *      exist in a state field? Every effect assertion below reads the real
 *      modifier cache rather than the socket module's own arithmetic — a socket
 *      that computed a beautiful number nothing consumed would be the stub
 *      again with more steps.
 *   2. Is the pool genuinely shared? A relic folded by both `relics.*` and
 *      `sockets.relics.*` would double every affix on it, which is the one way
 *      this feature could be a pillar-2 problem.
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { createEngine } from '..';
import type { EngineCtx, GameState, RelicInstance } from '../types';
import { runMigrations, SAVE_VERSION } from '../save/migrations';
import { PART_TYPES } from '../content/forgeParts';
import { makePart } from '../systems/forgeParts';
import { currentTool } from '../systems/casting';
import { effectOf } from '../systems/toolMining';
import { computeBucket } from '../modifiers';
import { allShells } from '../shells';
import { materialsOfShell } from '../materials';
import { GEMS } from '../materials';
import { RUNE_PAIRS, DISSONANT, sequencePairs } from '../content/shell4/runes';
import {
  AFFIXES, addRelic, affixBucketBonus, equipRelic, fuseRelics, mintRelic, renderRelic,
  WAKING_STEPS,
} from '../systems/relics';
import { activePowers, powerLive, powerOf } from '../systems/relicPowers';
import {
  FOCUS_PER_TIER, SOCKET_MAX, emptySockets, relicIsSocketed, setSocket,
  socketCount, socketFocus, socketGemBonus, socketRelicBonus, socketRow,
  socketRuneBonus, socketRunePairs, socketed, socketedRelicUids,
} from '../systems/toolSockets';

let engine: ReturnType<typeof createEngine>;
const st = (): GameState => engine.getState() as GameState;
const ctx: EngineCtx = { emit: () => {}, dirty: () => {} };
/** The REAL folded bucket, which is the only reading that proves a live path. */
const bucket = (b: Parameters<typeof computeBucket>[1]): number => computeBucket(st(), b).toNumber();

/** The Loam starter, one socket. */
const PLAIN = 'marl';
/** Loam's charged+warm+hollow stone — the shell's own deeper socket answer. */
const DEEP = 'weepstone';

function hold(socketsMat = PLAIN, rest = PLAIN): void {
  const s = st();
  s.forge.built = true;
  for (const shell of allShells()) s.depthRecords[shell.id] = 40;
  s.casting.tool = PART_TYPES.map((t, i) => ({
    ...makePart(t, t === 'sockets' ? socketsMat : rest, 60), id: i + 1,
  }));
  s.casting.wear = 0;
  s.casting.sockets = [];
}

/** A relic with one known affix, at a chosen waking step. */
function giveRelic(affixes: Record<string, number>, waking = 0, source = 'depth'): RelicInstance {
  const s = st();
  const r: RelicInstance = {
    uid: s.relics.nextUid++,
    defId: 'x', rarity: 2, affixes, source, fusedFrom: 0, waking,
  } as RelicInstance;
  s.relics.held.push(r);
  return r;
}

beforeEach(() => {
  engine = createEngine({ nowMs: 0 });
});

// ---------------------------------------------------------------------------
// 1 — THE SLOT COUNT IS THE STAT THE AUDIT FOUND DEAD
// ---------------------------------------------------------------------------

describe('the Sockets part decides how many sockets there are', () => {
  it('reads attunement, and a tool with no Sockets part has none', () => {
    hold();
    expect(socketCount(currentTool(st()))).toBeGreaterThanOrEqual(1);
    const s = st();
    s.casting.tool = s.casting.tool.filter((p) => p.type !== 'sockets');
    expect(socketCount(currentTool(s))).toBe(0);
  });

  it('bare hands have no sockets and setting one is refused', () => {
    expect(socketCount(null)).toBe(0);
    const r = setSocket(st(), ctx, 0, { kind: 'rune', id: 'kel' });
    expect(r.ok).toBe(false);
  });

  it('a deeper / hollower socket stone holds MORE — the doc\'s own claim', () => {
    hold(PLAIN);
    const shallow = socketCount(currentTool(st()));
    hold(DEEP);
    const deeper = socketCount(currentTool(st()));
    expect(deeper).toBeGreaterThan(shallow);
  });

  it('every shell can build a tool that sockets something', () => {
    // THE STANDING REACH RULE at its floor. A shell whose best socket stone
    // gave zero would make the whole feature shell-locked.
    for (const shell of allShells()) {
      const best = materialsOfShell(shell.id)
        .map((m) => { hold(m.id, m.id); return socketCount(currentTool(st())); })
        .reduce((a, b) => Math.max(a, b), 0);
      expect(best, `${shell.id} can socket nothing`).toBeGreaterThanOrEqual(1);
    }
  });

  it('never exceeds the cap, whatever the stone', () => {
    for (const shell of allShells()) {
      for (const m of materialsOfShell(shell.id)) {
        hold(m.id, m.id);
        expect(socketCount(currentTool(st()))).toBeLessThanOrEqual(SOCKET_MAX);
      }
    }
  });

  it('focus is exactly 1 at the starter stone and rises with depth', () => {
    hold(PLAIN);
    expect(socketFocus(currentTool(st()))).toBeCloseTo(1, 2);
    hold(DEEP);
    expect(socketFocus(currentTool(st()))).toBeGreaterThan(1);
    expect(FOCUS_PER_TIER).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// 2 — A SOCKETED THING REACHES THE LIVE PATH
// ---------------------------------------------------------------------------

describe('a socketed relic applies its effect on the live path', () => {
  it('moves the REAL modifier bucket, not just the module\'s own sum', () => {
    hold(DEEP);
    const before = bucket('dropRate');
    const r = giveRelic({ dropRate: 0.25 });
    expect(setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid }).ok).toBe(true);
    const after = bucket('dropRate');
    expect(after).toBeGreaterThan(before);
    // And the module agrees with the bucket about who did it.
    expect(socketRelicBonus(st(), 'dropRate')).toBeGreaterThan(0);
  });

  it('a waking relic gives MORE than a dormant one, same as on the belt', () => {
    hold(DEEP);
    const dormant = giveRelic({ dropRate: 0.25 }, 0);
    setSocket(st(), ctx, 0, { kind: 'relic', uid: dormant.uid });
    const cold = socketRelicBonus(st(), 'dropRate');
    setSocket(st(), ctx, 0, null);
    const awake = giveRelic({ dropRate: 0.25 }, WAKING_STEPS.length - 1);
    setSocket(st(), ctx, 0, { kind: 'relic', uid: awake.uid });
    expect(socketRelicBonus(st(), 'dropRate')).toBeGreaterThan(cold);
  });

  it('focus is what a deeper socket stone buys', () => {
    hold(PLAIN);
    const r = giveRelic({ dropRate: 0.25 });
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    const plain = socketRelicBonus(st(), 'dropRate');
    // Re-seat the same relic in a deeper tool.
    const keep = st().casting.sockets;
    hold(DEEP);
    st().casting.sockets = keep;
    expect(socketRelicBonus(st(), 'dropRate')).toBeGreaterThan(plain);
  });

  it('and it persists across a change of shell — it is the TOOL\'s, not the room\'s', () => {
    hold(DEEP);
    const r = giveRelic({ dropRate: 0.25 });
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    const here = socketRelicBonus(st(), 'dropRate');
    for (const shell of allShells()) {
      st().shell.current = shell.id;
      expect(socketRelicBonus(st(), 'dropRate'), `died in ${shell.id}`).toBeCloseTo(here, 9);
    }
  });
});

describe('a socketed relic applies its POWER too', () => {
  /** A minted relic that actually derives a power, Awake so the power is live. */
  function poweredRelic(): RelicInstance {
    for (let i = 0; i < 300; i++) {
      const m = mintRelic(st(), 'depth', i);
      if (powerOf(m)) { m.waking = WAKING_STEPS.length - 1; return addRelic(st(), m); }
    }
    throw new Error('no mint derived a power in 300 tries');
  }

  it('the power goes live in the tool, through activePowers rather than a copy', () => {
    hold(DEEP);
    const r = poweredRelic();
    const id = powerOf(r)!.id;
    expect(activePowers(st()).map((p) => p.def.id)).not.toContain(id);
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    expect(activePowers(st()).map((p) => p.def.id)).toContain(id);
  });

  it('and taking it out takes the power with it', () => {
    hold(DEEP);
    const r = poweredRelic();
    const id = powerOf(r)!.id;
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    setSocket(st(), ctx, 0, null);
    expect(activePowers(st()).map((p) => p.def.id)).not.toContain(id);
  });

  it('but a DORMANT relic brings no power, and a socket will never wake it', () => {
    /**
     * THE TRADE, ENFORCED BY DOING NOTHING. `powerLive` wants Stirring and
     * `tickRelics` only wakes the WORN set, so putting a cold relic straight into
     * a socket gets its affixes and never its power. Wear it first.
     */
    hold(DEEP);
    const r = poweredRelic();
    r.waking = 0;
    r.charge = 0;
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    expect(powerLive(r)).toBe(false);
    expect(activePowers(st())).toEqual([]);
    engine.tick(120);
    expect(r.charge ?? 0).toBe(0);
    expect(powerLive(r)).toBe(false);
  });
});

describe('a socketed gem applies its bonus', () => {
  it('reaches the bucket the gem names', () => {
    hold(DEEP);
    const gem = GEMS.find((g) => g.bucket === 'dropRate') ?? GEMS[0]!;
    st().materials.gems[gem.id] = 1;
    const before = bucket(gem.bucket);
    expect(setSocket(st(), ctx, 0, { kind: 'gem', id: gem.id }).ok).toBe(true);
    expect(bucket(gem.bucket)).toBeGreaterThan(before);
    expect(socketGemBonus(st(), gem.bucket)).toBeGreaterThan(0);
  });

  it('is taken from the pile and given back on removal', () => {
    hold(DEEP);
    const gem = GEMS[0]!;
    st().materials.gems[gem.id] = 2;
    setSocket(st(), ctx, 0, { kind: 'gem', id: gem.id });
    expect(st().materials.gems[gem.id]).toBe(1);
    setSocket(st(), ctx, 0, null);
    expect(st().materials.gems[gem.id]).toBe(2);
  });

  it('a gem you do not hold is refused', () => {
    hold(DEEP);
    st().materials.gems[GEMS[0]!.id] = 0;
    expect(setSocket(st(), ctx, 0, { kind: 'gem', id: GEMS[0]!.id }).ok).toBe(false);
  });
});

describe('socketed runes speak through the row, using the real grammar', () => {
  /** A tool with room for a pair, and both runes in the pile. */
  function twoRunes(): void {
    hold(DEEP);
    const s = st();
    for (const id of ['kel', 'thur', 'mol', 'ash'] as const) s.runes.found[id] = 4;
    expect(socketCount(currentTool(s))).toBeGreaterThanOrEqual(2);
  }

  it('one rune alone says nothing; two adjacent say their pair', () => {
    twoRunes();
    setSocket(st(), ctx, 0, { kind: 'rune', id: 'kel' });
    expect(socketRunePairs(st()).filter((k) => RUNE_PAIRS[k])).toEqual([]);
    setSocket(st(), ctx, 1, { kind: 'rune', id: 'thur' });
    expect(socketRunePairs(st())).toContain('kel|thur');
    // The Weighted Edge is a strikePower pair — and it reaches the bucket.
    expect(socketRuneBonus(st(), RUNE_PAIRS['kel|thur']!.bucket)).toBeGreaterThan(0);
  });

  it('ORDER MATTERS, because it already did in the alphabet', () => {
    twoRunes();
    setSocket(st(), ctx, 0, { kind: 'rune', id: 'kel' });
    setSocket(st(), ctx, 1, { kind: 'rune', id: 'thur' });
    const forward = socketRunePairs(st())[0];
    setSocket(st(), ctx, 0, { kind: 'rune', id: 'thur' });
    setSocket(st(), ctx, 1, { kind: 'rune', id: 'kel' });
    const back = socketRunePairs(st())[0];
    expect(forward).toBe('kel|thur');
    expect(back).toBe('thur|kel');
    expect(RUNE_PAIRS[forward!]!.bucket).not.toBe(RUNE_PAIRS[back!]!.bucket);
  });

  it('a dissonant adjacency is REFUSED and eats nothing', () => {
    /**
     * The inscription verb destroys the runes on dissonance, which is right for
     * a permanent etching. A socket comes back out, so the same failure here
     * would be a free way to delete your own runes.
     */
    const bad = [...DISSONANT].find((k) => {
      const [a, b] = k.split('|');
      return a !== b;
    })!;
    const [a, b] = bad.split('|') as [never, never];
    hold(DEEP);
    st().runes.found[a] = 3;
    st().runes.found[b] = 3;
    setSocket(st(), ctx, 0, { kind: 'rune', id: a });
    const beforeB = st().runes.found[b];
    const r = setSocket(st(), ctx, 1, { kind: 'rune', id: b });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/fight/i);
    expect(st().runes.found[b]).toBe(beforeB);
    expect(socketRow(st())[1]).toBe(null);
  });

  it('no live row is ever dissonant', () => {
    hold(DEEP);
    const s = st();
    for (const id of ['kel', 'thur', 'mol', 'ash', 'sen', 'vey', 'ur', 'nix'] as const) {
      s.runes.found[id] = 5;
    }
    // Try every rune in every slot; whatever is accepted must leave a clean row.
    for (let slot = 0; slot < socketCount(currentTool(s)); slot++) {
      for (const id of ['kel', 'thur', 'mol', 'ash', 'sen', 'vey', 'ur', 'nix'] as const) {
        setSocket(s, ctx, slot, { kind: 'rune', id });
        const seq = socketRow(s).map((f) => (f?.kind === 'rune' ? f.id : null));
        for (const p of sequencePairs(seq)) {
          expect(DISSONANT.has(p), `row went dissonant: ${p}`).toBe(false);
        }
      }
    }
  });

  it('a socketed pair is recorded in the SAME codex an inscription writes to', () => {
    twoRunes();
    st().runes.pairsSeen = [];
    setSocket(st(), ctx, 0, { kind: 'rune', id: 'kel' });
    setSocket(st(), ctx, 1, { kind: 'rune', id: 'thur' });
    expect(st().runes.pairsSeen).toContain('kel|thur');
  });
});

// ---------------------------------------------------------------------------
// 3 — REVERSIBLE, AND THE SHARED POOL
// ---------------------------------------------------------------------------

describe('socketing is reversible and consumes nothing', () => {
  it('pull one out, put another in', () => {
    hold(DEEP);
    const a = giveRelic({ dropRate: 0.2 });
    const b = giveRelic({ xpGain: 0.2 });
    setSocket(st(), ctx, 0, { kind: 'relic', uid: a.uid });
    expect(socketedRelicUids(st())).toEqual([a.uid]);
    expect(setSocket(st(), ctx, 0, null).ok).toBe(true);
    expect(socketedRelicUids(st())).toEqual([]);
    setSocket(st(), ctx, 0, { kind: 'relic', uid: b.uid });
    expect(socketedRelicUids(st())).toEqual([b.uid]);
    // Both relics still exist. Nothing was spent to change your mind.
    expect(st().relics.held.map((r) => r.uid).sort()).toEqual([a.uid, b.uid].sort());
  });

  it('overwriting a slot returns what was in it', () => {
    hold(DEEP);
    const gem = GEMS[0]!;
    st().materials.gems[gem.id] = 1;
    st().runes.found['kel'] = 1;
    setSocket(st(), ctx, 0, { kind: 'gem', id: gem.id });
    expect(st().materials.gems[gem.id]).toBe(0);
    setSocket(st(), ctx, 0, { kind: 'rune', id: 'kel' });
    expect(st().materials.gems[gem.id]).toBe(1);
  });

  it('taking the tool apart gives everything back', () => {
    hold(DEEP);
    const gem = GEMS[0]!;
    st().materials.gems[gem.id] = 1;
    st().runes.found['kel'] = 1;
    const r = giveRelic({ dropRate: 0.2 });
    setSocket(st(), ctx, 0, { kind: 'gem', id: gem.id });
    setSocket(st(), ctx, 1, { kind: 'relic', uid: r.uid });
    emptySockets(st());
    expect(st().materials.gems[gem.id]).toBe(1);
    expect(st().relics.held.some((x) => x.uid === r.uid)).toBe(true);
    expect(socketed(st())).toEqual([]);
  });
});

describe('the pool is shared — a relic is worn OR set, never both', () => {
  it('socketing takes it off the belt', () => {
    hold(DEEP);
    const r = giveRelic({ dropRate: 0.3 });
    equipRelic(st(), r.uid, 0);
    expect(st().relics.equipped).toContain(r.uid);
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    expect(st().relics.equipped).not.toContain(r.uid);
  });

  it('and it cannot be worn while it is set', () => {
    hold(DEEP);
    const r = giveRelic({ dropRate: 0.3 });
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    const res = equipRelic(st(), r.uid, 0);
    expect(res.ok).toBe(false);
    expect(st().relics.equipped).not.toContain(r.uid);
  });

  it('so its affixes are counted exactly ONCE', () => {
    /**
     * THE ONE WAY THIS FEATURE COULD HAVE BEEN A PILLAR-2 PROBLEM. If both
     * registrars folded the same relic, every affix on it would double.
     */
    hold(DEEP);
    const r = giveRelic({ dropRate: 0.3 });
    equipRelic(st(), r.uid, 0);
    const worn = bucket('dropRate');
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    const set = bucket('dropRate');
    // Set is a little stronger (focus) but nowhere near twice — and the worn
    // contribution is gone, not still there underneath.
    expect(set).toBeLessThan(worn * 1.9);
    expect(socketRelicBonus(st(), 'dropRate')).toBeGreaterThan(0);
  });

  it('a set relic cannot be scrapped, fused away, or auto-scrapped', () => {
    hold(DEEP);
    const keep = giveRelic({ dropRate: 0.1 });
    const r = giveRelic({ dropRate: 0.3 });
    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    expect(relicIsSocketed(st(), r.uid)).toBe(true);
    expect(renderRelic(st(), r.uid).ok).toBe(false);
    expect(fuseRelics(st(), keep.uid, r.uid).ok).toBe(false);
    expect(st().relics.held.some((x) => x.uid === r.uid)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 4 — THE TRADE, AND PILLAR 2
// ---------------------------------------------------------------------------

describe('the trade the socket is priced on', () => {
  it('a socketed relic does not wake', () => {
    hold(DEEP);
    const worn = giveRelic({ dropRate: 0.1 });
    const set = giveRelic({ dropRate: 0.1 });
    equipRelic(st(), worn.uid, 0);
    setSocket(st(), ctx, 0, { kind: 'relic', uid: set.uid });
    engine.tick(60);
    expect((worn.charge ?? 0)).toBeGreaterThan(0);
    expect((set.charge ?? 0)).toBe(0);
  });
});

describe('pillar 2 survives a fully socketed tool', () => {
  it('a socket touches no reach, splash or ore term of the swing', () => {
    /**
     * A socket reaches the modifier layer and nothing else — so the SWING is
     * byte-identical with a full row and an empty one. This is the structural
     * claim, asserted rather than argued.
     */
    hold(DEEP);
    const bare = effectOf(currentTool(st()), false, 1);
    const s = st();
    for (const id of ['kel', 'thur', 'mol'] as const) s.runes.found[id] = 3;
    for (const g of GEMS) s.materials.gems[g.id] = 3;
    for (let i = 0; i < socketCount(currentTool(s)); i++) {
      const r = giveRelic({ dustYield: 0.5, regen: 0.5, cap: 0.5 }, WAKING_STEPS.length - 1);
      setSocket(s, ctx, i, { kind: 'relic', uid: r.uid });
    }
    expect(socketed(s).length).toBe(socketCount(currentTool(s)));
    expect(effectOf(currentTool(s), false, 1)).toEqual(bare);
  });

  it('and every socket source registers into an EXISTING bucket', () => {
    // No new bucket means no new place for income to come from. If a socket
    // ever needs one, this fails and the pillar-2 argument gets re-made.
    hold(DEEP);
    const s = st();
    for (const g of GEMS) {
      expect(() => computeBucket(s, g.bucket)).not.toThrow();
    }
    for (const p of Object.values(RUNE_PAIRS)) {
      expect(() => computeBucket(s, p.bucket)).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// 5 — THE AFFIX-KEY BUG THIS PHASE FOUND
// ---------------------------------------------------------------------------

describe('an affix reaches its bucket even when its id is not the bucket name', () => {
  /**
   * FOUND BY THE SOCKET DRIVER, AND IT WAS NEVER A SOCKET BUG.
   *
   * `mintRelic` keys `affixes` by AFFIX ID (`hardDrill`, `deepYield`, `fatSeam`)
   * and every reader looked it up by BUCKET NAME. Fourteen of the thirty affixes
   * differ, so 44% of every rolled affix in the game landed in a key nothing read
   * — on the BELT, since Phase 15 added them. The socket inherited it verbatim,
   * which is the design working correctly on a broken foundation.
   */
  it('names the ones whose id differs from their bucket, and resolves every one', () => {
    const differ = Object.entries(AFFIXES).filter(([k, d]) => k !== d.bucket);
    expect(differ.length).toBeGreaterThan(0);
    for (const [key, def] of differ) {
      const r = {
        uid: 1, defId: 'x', rarity: 1, affixes: { [key]: 0.5 },
        source: 'depth', fusedFrom: 0,
      } as RelicInstance;
      expect(affixBucketBonus(r, def.bucket), `${key} does not reach ${def.bucket}`)
        .toBeCloseTo(0.5, 9);
    }
  });

  it('and a real minted relic moves a real bucket, on the belt AND in a socket', () => {
    hold(DEEP);
    // Mint until one carries an affix whose id is not its bucket — the case that
    // used to be silently inert.
    let found: RelicInstance | null = null;
    let target = '';
    for (let i = 0; i < 300 && !found; i++) {
      const made = mintRelic(st(), 'depth', i);
      for (const key of Object.keys(made.affixes)) {
        const def = AFFIXES[key];
        if (def && key !== def.bucket) { found = made; target = def.bucket; break; }
      }
    }
    expect(found, 'no mint rolled a differing-id affix in 300 tries').not.toBeNull();
    const r = found!;
    r.waking = WAKING_STEPS.length - 1;
    st().relics.held.push(r);

    /**
     * MOVED, not INCREASED. The first version asserted `toBeGreaterThan` and the
     * mint handed it `shortStair` → `descendCost`, whose whole point is a
     * NEGATIVE magnitude (a cheaper stair). "The bucket moved" is the claim being
     * made here anyway; "the bucket went up" was an assumption about the sign.
     */
    const bare = bucket(target as never);
    equipRelic(st(), r.uid, 0);
    const worn = bucket(target as never);
    expect(worn, `worn relic did not move ${target}`).not.toBeCloseTo(bare, 9);

    setSocket(st(), ctx, 0, { kind: 'relic', uid: r.uid });
    expect(bucket(target as never), `socketed relic did not move ${target}`)
      .not.toBeCloseTo(bare, 9);
  });
});

// ---------------------------------------------------------------------------
// 6 — THE SAVE
// ---------------------------------------------------------------------------

describe('the save', () => {
  it('seats nothing in anybody\'s tool', () => {
    expect(SAVE_VERSION).toBe(48);
    const out = runMigrations({
      version: 44,
      state: {
        casting: {
          tool: [{ type: 'sockets', materialId: 'marl', purity: 60, shape: 'open' }],
          rack: [],
        },
      },
    } as never);
    const casting = (out.state as Record<string, unknown>)['casting'] as Record<string, unknown>;
    expect(casting['sockets']).toEqual([]);
  });

  it('a row shorter than its fills holds them rather than losing them', () => {
    // Re-pouring a shallower Sockets stone must not destroy a relic.
    hold(DEEP);
    const n = socketCount(currentTool(st()));
    expect(n).toBeGreaterThan(1);
    const r = giveRelic({ dropRate: 0.2 });
    setSocket(st(), ctx, n - 1, { kind: 'relic', uid: r.uid });
    const keep = st().casting.sockets;
    hold(PLAIN);
    st().casting.sockets = keep;
    expect(socketCount(currentTool(st()))).toBe(1);
    // Out of the row, so it contributes nothing...
    expect(socketRelicBonus(st(), 'dropRate')).toBe(0);
    // ...but it is still in there, and still protected from being scrapped.
    expect(relicIsSocketed(st(), r.uid)).toBe(true);
    expect(renderRelic(st(), r.uid).ok).toBe(false);
  });
});
