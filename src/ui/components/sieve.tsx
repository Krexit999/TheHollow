/**
 * THE SIEVE — SORTING (§14.3), plain HTML, in THE PLANT cluster (§37).
 *
 * LAW 3: nothing here until the wreck at Siever's Rest has been walked to, and
 * then the DESTINATION rather than the recipe — what a filter would take, what
 * it is pointed at, and where in the world you could go and find some.
 *
 * The panel's job is to make one sentence writable, because it is the sentence
 * §25.5 asks for and a pin cannot say:
 *
 *     CRUSH ONLY STONE UNDER FAIR
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import { Select } from './Select';
import { BANDS, BAND_LABELS, type PurityBand } from '../../engine/materials';
import { TRAIT_IDS, TRAITS, type TraitId } from '../../engine/traits';
import {
  TIER_CAPABILITY_SIEVE, clauseLimit, ensureSorting, filterOf, filterSentence, filterable,
  heldFor, nextSieveTierCost, sieveBuilt, sieveFound, sieveStation, stationsFor,
  type FilterClause,
} from '../../engine/systems/sieve';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import type { GameState } from '../../engine';

const MACHINE_NAME: Record<string, string> = {
  kiln: 'The Kiln', crusher: 'The Crusher', refinery: 'The Refinery',
  assayBench: 'The Assay Bench', sieve: 'The Sieve',
};

export function SievePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [kind, setKind] = useState<'trait' | 'band'>('band');
  const [trait, setTrait] = useState<TraitId>('dense');
  const [op, setOp] = useState<'atLeast' | 'atMost'>('atMost');
  const [band, setBand] = useState<PurityBand>('fair');
  if (!state) return null;
  const st = state as GameState;

  const found = sieveFound(st);
  const built = sieveBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'sieve');
  const cost = nextSieveTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const at = sieveStation();
  const sorting = ensureSorting(st);
  const draft: FilterClause = kind === 'trait' ? { kind, trait } : { kind, op, band };

  return (
    <div className="panel mt-2 p-3" data-testid="sieve-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Sieve</span>
        <span className="text-[10px] text-cave-500" data-testid="sieve-tier">
          {TIER_CAPABILITY_SIEVE[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {at?.name ?? 'the deep'}. Standing, it lets you write down
            what a machine is FOR — and go on meaning it about stone you have not mined yet.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-sieve"
            onClick={() => dispatch({ type: 'buildSieve' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          {/* WRITE ONE. One clause at tier I, two at tier II — and the second
              row is simply absent below that, never a disabled tease. */}
          <div className="rounded border border-cave-800 px-1.5 py-1">
            <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">
              Take only what…
            </div>
            <div className="flex flex-wrap items-baseline gap-1">
              <Select
                ariaLabel="What the clause is about"
                value={kind}
                onChange={(v) => setKind(v as 'trait' | 'band')}
                options={[{ value: 'band', label: 'purity' }, { value: 'trait', label: 'a trait' }]}
              />
              {kind === 'trait' ? (
                <Select
                  ariaLabel="Which trait"
                  value={trait}
                  onChange={(v) => setTrait(v as TraitId)}
                  options={TRAIT_IDS.map((t) => ({ value: t, label: TRAITS[t].name }))}
                />
              ) : (
                <>
                  <Select
                    ariaLabel="Above or below"
                    value={op}
                    onChange={(v) => setOp(v as 'atLeast' | 'atMost')}
                    options={[{ value: 'atMost', label: 'is under' }, { value: 'atLeast', label: 'is at least' }]}
                  />
                  <Select
                    ariaLabel="Which band"
                    value={band}
                    onChange={(v) => setBand(v as PurityBand)}
                    options={BANDS.map((b) => ({ value: b, label: BAND_LABELS[b] }))}
                  />
                </>
              )}
              <button
                className="btn px-1.5 py-[2px] text-[10px]"
                data-testid="add-filter"
                onClick={() => dispatch({ type: 'addFilter', clauses: [draft] })}
              >
                Save it
              </button>
            </div>
            <div className="mt-0.5 text-[9px] text-cave-600">
              This Sieve holds {clauseLimit(st)} clause{clauseLimit(st) === 1 ? '' : 's'} at a time.
            </div>
          </div>

          {/* WHAT YOU HAVE WRITTEN, what it would take, and where to go. */}
          <div className="mt-2 space-y-1">
            {sorting.filters.map((f) => {
              const held = heldFor(st, f);
              const where = stationsFor(f).slice(0, 3);
              return (
                <div key={f.id} className="rounded border border-cave-800 px-1.5 py-1" data-testid={`filter-${f.id}`}>
                  <div className="flex items-baseline gap-2">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">
                      {filterSentence(f)}
                    </span>
                    <span className="tnum shrink-0 text-[9px] text-cave-500">{held} held</span>
                    <button
                      className="btn shrink-0 px-1 py-[1px] text-[9px]"
                      data-testid={`drop-filter-${f.id}`}
                      onClick={() => dispatch({ type: 'removeFilter', filterId: f.id })}
                    >
                      drop
                    </button>
                  </div>
                  {/*
                    §14.3's BEST FEATURE. A filter can name a trait you own
                    nothing for, and the Roll then flags where you could go —
                    the plant telling you what to mine. Places, never recipes.
                  */}
                  {held === 0 && where.length > 0 && (
                    <div className="mt-0.5 text-[9px] leading-snug text-[#c9a86a]" data-testid={`filter-where-${f.id}`}>
                      Nothing in the Hold. Try {where.map((w) => `${w.name} (${w.depth}m)`).join(' · ')}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-0.5">
                    {filterable(st).map((m) => {
                      const on = filterOf(st, m)?.id === f.id;
                      return (
                        <button
                          key={m}
                          className={`btn px-1 py-[1px] text-[9px] ${on ? 'border-[#c9a86a]/70 text-cave-100' : 'text-cave-500'}`}
                          data-testid={`assign-${f.id}-${m}`}
                          onClick={() => dispatch({
                            type: 'assignFilter', machineId: m, filterId: on ? null : f.id,
                          })}
                        >
                          {MACHINE_NAME[m] ?? m}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
            {sorting.filters.length === 0 && (
              <p className="text-[10px] italic text-cave-600">
                Nothing written down. Every machine takes whatever is biggest.
              </p>
            )}
          </div>

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-sieve"
              onClick={() => dispatch({ type: 'buildSieve' })}
            >
              {TIER_CAPABILITY_SIEVE[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
