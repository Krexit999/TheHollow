/**
 * THE CULTIVAR BENCH — CULTIVATION (§13), plain HTML, in THE PLANT cluster.
 *
 * Four beds, one per quarter of the face. Each says what is seeded, how much
 * has grown, and what a crop would be — a destination, never a recipe (LAW 3).
 * Nothing here draws the face; the quadrants are read off it.
 */
import { useGame, dispatch } from '../store';
import {
  FRUIT_PER_UNIT, QUADRANTS, STRAINS, TIER_CAPABILITY_CULTIVAR, bedSlots, cultivarBuilt,
  cultivarFound, cultivarRead, cultivarStation, nextCultivarTierCost,
} from '../../engine/systems/cultivar';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { materialDef } from '../../engine/materials';
import { Select } from './Select';
import type { GameState } from '../../engine';

const QUAD_NAME: Record<string, string> = {
  nw: 'North-west bed', ne: 'North-east bed', sw: 'South-west bed', se: 'South-east bed',
};

const nameOf = (id: string): string => {
  try { return materialDef(id).name; } catch { return id; }
};

export function CultivarPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = cultivarFound(st);
  const built = cultivarBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'cultivar');
  const cost = nextCultivarTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const beds = cultivarRead(st);

  return (
    <div className="panel mt-2 p-3" data-testid="cultivar-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9ac07a]">The Cultivar Bench</span>
        <span className="tnum text-[10px] text-cave-400">{tier > 0 ? `tier ${tier}` : 'in the wreck'}</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {tier > 0
          ? 'What you refuse to mine becomes something. The bench decides what.'
          : `Trays of seed stock in rows${cultivarStation() ? `, at ${cultivarStation()!.name}` : ''}.`}
      </p>

      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_CULTIVAR.slice(1).map((line, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`cultivar-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III'][i]}</span>{line}
          </div>
        ))}
      </div>

      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildCultivarBench' })}
          data-testid="cultivar-build"
        >
          {tier === 0 ? 'Stand it up' : `Deepen the bench — tier ${tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {cost === null && tier >= MAX_MACHINE_TIER && (
        <div className="mt-2 text-center text-[10px] text-cave-500">Every bed it can keep, it keeps.</div>
      )}

      {built && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">The beds</span>
            <span className="tnum text-[9px] text-cave-500">
              {beds.filter((b) => b.strain).length}/{bedSlots(st)} seeded
            </span>
          </div>
          <div className="mt-1 max-h-80 space-y-1.5 overflow-y-auto scroll-thin">
            {QUADRANTS.map((q) => {
              const b = beds.find((x) => x.quad === q)!;
              return (
                <div key={q} className="rounded-md border border-cave-800 p-1.5" data-testid={`cultivar-bed-${q}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold text-cave-200">{QUAD_NAME[q]}</span>
                    <span className="tnum shrink-0 text-[10px] text-cave-500">
                      {b.vines} vined · {Math.round(b.fruit)} fruit
                    </span>
                  </div>
                  <Select
                    className="mt-1 w-full"
                    ariaLabel={`${QUAD_NAME[q]} strain`}
                    value={b.strain?.id ?? ''}
                    onChange={(v) => dispatch({ type: 'seedBed', quad: q, strainId: v || null })}
                    options={[
                      { value: '', label: '— fallow —' },
                      ...STRAINS.map((s) => ({ value: s.id, label: `${s.name} (${s.trait})` })),
                    ]}
                  />
                  {b.strain && (
                    <>
                      <div className="mt-1 text-[10px] italic leading-snug text-cave-400">{b.strain.flavor}</div>
                      <div className="text-[10px] leading-snug" style={{ color: b.units > 0 ? '#9ac07a' : '#8a7f70' }}>
                        {b.units > 0
                          ? `${b.units}× ${nameOf(b.materialId!)}${b.crossedWith ? ` — crossed with the ${b.crossedWith.toUpperCase()} bed` : ''}`
                          : `${FRUIT_PER_UNIT} of fruit to the unit.`}
                      </div>
                      <button
                        className="btn mt-1 w-full py-1 text-[10px]"
                        disabled={b.blocker !== null}
                        title={b.blocker ?? 'Take the crop — the charge it would have paid is what it costs'}
                        onClick={() => dispatch({ type: 'cropBed', quad: q })}
                        data-testid={`cultivar-crop-${q}`}
                      >
                        {b.blocker ?? `Crop ${b.units}× ${nameOf(b.materialId!)}`}
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
