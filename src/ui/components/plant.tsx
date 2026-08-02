/**
 * THE PLANT — Flow, Surge, and the machines drawing on them (§3).
 *
 * Plain panels. The whole point of splitting Draw in two is that a player can
 * SEE why a machine is slow, so the two numbers are shown as what they are: a
 * rate against a demand, and a bank against a cost. A single "power" bar would
 * put the design back where it started.
 */
import { useGame, dispatch } from '../store';
import {
  MACHINE_DEMAND, TIER_CAPABILITY, demandOf, flowCap, flowDemand, flowSatisfaction,
  surgeCap, surgeRegen, tierOf, MAX_MACHINE_TIER,
} from '../../engine/systems/plant';
import { CRUSH_BATCH, crushPreview, crushable, nextCrusherTierCost } from '../../engine/systems/crusher';
import { materialDef, BAND_LABELS } from '../../engine/materials';
import type { GameState } from '../../engine';

const MACHINE_NAME: Record<string, string> = {
  kiln: 'The Kiln',
  crusher: 'The Crusher',
  refinery: 'The Refinery',
};

function Bar({ pct, tone }: { pct: number; tone: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-cave-800">
      <div className="h-full rounded-full transition-[width]" style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: tone }} />
    </div>
  );
}

/**
 * THE TWO NUMBERS. Flow reads as a rate against what the running machines want;
 * Surge reads as a bank against what the next batch costs. A machine short of
 * Flow is SLOW and says so; a machine short of Surge is WAITING and says that
 * instead — the asymmetry is the feature, so the panel states it in two
 * different vocabularies on purpose.
 */
export function PlantPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  if (!st.kiln.built) return null; // the Hearth is the Kiln; no kiln, no plant

  const cap = flowCap(st);
  const want = flowDemand(st);
  const surge = st.plant?.surge ?? 0;
  const sCap = surgeCap(st);

  return (
    <div className="panel p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Hearth</span>
        <span className="text-[10px] text-cave-500">pure Flow, small</span>
      </div>

      <div className="space-y-2">
        <div>
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-[#9ad4e8]">Flow</span>
            <span className="tnum text-cave-400">
              {cap.toFixed(1)}/s <span className="text-cave-600">of</span> {want.toFixed(1)} wanted
            </span>
          </div>
          <Bar pct={want > 0 ? (cap / want) * 100 : 100} tone="#9ad4e8" />
          <div className="mt-0.5 text-[9px] leading-snug text-cave-500">
            Sustained. Machines short of Flow run SLOW — they never stop.
          </div>
        </div>

        <div>
          <div className="flex items-baseline justify-between text-[11px]">
            <span className="text-[#e0b25a]">Surge</span>
            <span className="tnum text-cave-400">
              {surge.toFixed(0)} <span className="text-cave-600">/</span> {sCap.toFixed(0)}
              <span className="text-cave-600"> · +{surgeRegen(st).toFixed(1)}/s</span>
            </span>
          </div>
          <Bar pct={sCap > 0 ? (surge / sCap) * 100 : 0} tone="#e0b25a" />
          <div className="mt-0.5 text-[9px] leading-snug text-cave-500">
            A bank. Machines short of Surge WAIT — they do not run slow.
          </div>
        </div>
      </div>

      <div className="mt-2 border-t border-cave-800 pt-1.5">
        <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">Demand profile</div>
        {Object.keys(MACHINE_DEMAND).map((id) => {
          const d = demandOf(id);
          const tier = tierOf(st, id);
          const built = id === 'kiln' ? st.kiln.built : tier > 0;
          const sat = flowSatisfaction(st, id);
          const waiting = d.surge > 0 && surge < d.surge;
          return (
            <div key={id} className="flex items-baseline gap-2 py-[2px] text-[10px]" data-testid={`plant-${id}`}>
              <span className={`w-[68px] shrink-0 truncate ${built ? 'text-cave-200' : 'text-cave-600'}`}>
                {MACHINE_NAME[id]}
              </span>
              <span className="w-[74px] shrink-0 text-cave-500">
                {d.flow > 0 && <span className="text-[#9ad4e8]">{d.flow}/s</span>}
                {d.flow > 0 && d.surge > 0 && <span className="text-cave-700"> + </span>}
                {d.surge > 0 && <span className="text-[#e0b25a]">{d.surge}</span>}
              </span>
              <span className="min-w-0 flex-1 truncate text-right text-cave-500">
                {!built ? 'not built'
                  : waiting ? <span className="text-[#e0b25a]">waiting on Surge</span>
                    : d.flow > 0 && sat < 0.999 ? <span className="text-[#e0885a]">{Math.round(sat * 100)}% speed</span>
                      : 'running'}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * THE CRUSHER — built from cast parts, fired by hand, paid for in Surge.
 *
 * Its tier is printed as a CAPABILITY (§15.4) rather than a number, because
 * that is what a tier is: tier II retains the input's purity band, and a player
 * looking at "II" learns nothing without being told so.
 */
export function CrusherPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const tier = tierOf(st, 'crusher');
  const rack = st.casting.rack?.length ?? 0;
  const cost = nextCrusherTierCost(st);
  const surge = st.plant?.surge ?? 0;
  const need = demandOf('crusher').surge;
  const stock = crushable(st).slice(0, 4);

  return (
    <div className="panel p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Crusher</span>
        <span className="text-[10px] text-[#e0b25a]">pure Surge</span>
      </div>
      <div className="text-[10px] leading-snug text-cave-500">
        {tier > 0
          ? <>Tier {'I'.repeat(tier)} — {TIER_CAPABILITY[tier]}</>
          : 'Not built. It does nothing at all, and then it does everything at once.'}
      </div>

      {cost !== null && (
        <button
          className="btn mt-1.5 w-full py-1 text-[11px]"
          disabled={rack < cost}
          data-testid="build-crusher"
          onClick={() => dispatch({ type: 'buildCrusher' })}
        >
          {tier === 0 ? 'Build' : `Tier ${'I'.repeat(tier + 1)}`} · {cost} cast parts
          {rack < cost && <span className="text-cave-500"> (rack has {rack})</span>}
        </button>
      )}
      {cost === null && (
        <div className="mt-1.5 text-[10px] text-cave-500">At its last tier ({MAX_MACHINE_TIER}).</div>
      )}

      {tier > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-1.5">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-[9px] font-semibold uppercase tracking-widest text-cave-500">
              Batch · {CRUSH_BATCH} stone
            </span>
            <span className={`tnum text-[10px] ${surge >= need ? 'text-[#e0b25a]' : 'text-cave-600'}`}>
              {need} Surge
            </span>
          </div>
          {stock.length === 0 && (
            <div className="text-[10px] text-cave-600">Nothing held in fours yet.</div>
          )}
          {stock.map((s) => {
            const p = crushPreview(st, s.materialId, s.band);
            const ready = surge >= need;
            return (
              <button
                key={`${s.materialId}-${s.band}`}
                className="mt-1 flex w-full items-baseline gap-2 rounded border border-cave-800 px-1.5 py-1 text-[10px] hover:bg-cave-800 disabled:opacity-50"
                disabled={!ready}
                data-testid={`crush-${s.materialId}`}
                onClick={() => dispatch({ type: 'crush', materialId: s.materialId, band: s.band })}
              >
                <span className="min-w-0 flex-1 truncate text-left text-cave-200">
                  {materialDef(s.materialId).name}
                </span>
                <span className="shrink-0 text-cave-500">{BAND_LABELS[s.band]}</span>
                <span className="shrink-0 text-cave-600">→</span>
                <span className={`shrink-0 ${p && p.outBand === s.band ? 'text-[#a8d8a0]' : 'text-[#e0885a]'}`}>
                  {p ? BAND_LABELS[p.outBand] : '—'}
                </span>
              </button>
            );
          })}
          {!(surge >= need) && (
            <div className="mt-1 text-[10px] text-[#e0b25a]">
              The bank is short. It waits for the charge.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
