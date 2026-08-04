/**
 * THE QUENCH TANK — treating a PART (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: the parts the tank can reach and the media that will TAKE them —
 * derived per part from the one rule (`mediaFor`), never a table of the six
 * against every stone in the game. A medium that has nothing in common with the
 * part simply is not offered, which is how the rule is taught.
 */
import { useGame, dispatch } from '../store';
import {
  STEADY_PER_QUENCH, TIER_CAPABILITY_QUENCH, forgets, mediaFor, nextQuenchTierCost,
  quenchBlocker, quenchBuilt, quenchCost, quenchFound, quenchStation, reachableParts,
} from '../../engine/systems/quench';
import { TEMPER_BY_ID } from '../../engine/systems/tempering';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { materialDef } from '../../engine/materials';
import type { GameState } from '../../engine';

const nameOf = (id: string): string => {
  try { return materialDef(id).name; } catch { return id; }
};

export function QuenchPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = quenchFound(st);
  const built = quenchBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'quench');
  const cost = nextQuenchTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const parts = reachableParts(st);

  return (
    <div className="panel mt-2 p-3" data-testid="quench-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#c46a5a]">The Quench Tank</span>
        <span className="tnum text-[10px] text-cave-400">
          {tier > 0 ? `tier ${tier}` : 'in the wreck'}
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {tier > 0
          ? 'A trough long enough to take a whole haft, and a rack of tongs worn smooth.'
          : `Dry stone troughs, each stained a different colour${quenchStation() ? `, at ${quenchStation()!.name}` : ''}.`}
      </p>

      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_QUENCH.slice(1).map((line, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`quench-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III'][i]}</span>{line}
          </div>
        ))}
      </div>

      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildQuenchTank' })}
          data-testid="quench-build"
        >
          {tier === 0 ? 'Stand it up' : `Deepen the tank — tier ${tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {cost === null && tier >= MAX_MACHINE_TIER && (
        <div className="mt-2 text-center text-[10px] text-cave-500">There is nothing colder to cool it in.</div>
      )}

      {built && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">On the tongs</span>
            <span className="tnum text-[9px] text-cave-500">−{STEADY_PER_QUENCH} shake each</span>
          </div>
          {parts.length === 0 && (
            <p className="mt-1 text-[11px] italic text-cave-500">
              Nothing on the rack. Pour something first.
            </p>
          )}
          {/*
            THE RACK IS UNBOUNDED AND SO WAS THIS LIST. Found by the driver:
            its fixture leaves ninety parts on the rack — which is an ordinary
            state for anyone who has been pouring — and the panel grew to
            SEVEN THOUSAND PIXELS with no way to scroll past it. The harness
            noticing is the bug report; the fix belongs here, not there. Same
            cap the Refinery's trough already uses.
          */}
          <div className="mt-1 max-h-80 space-y-1.5 overflow-y-auto scroll-thin">
            {parts.map(({ part, where }) => {
              const media = mediaFor(part.materialId);
              const done = part.quench ? TEMPER_BY_ID.get(part.quench) : null;
              return (
                <div key={`${where}-${part.id}`} className="rounded-md border border-cave-800 p-1.5" data-testid={`quench-part-${part.id}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[11px] font-semibold text-cave-200">
                      {nameOf(part.materialId)} {part.type}
                    </span>
                    <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">{where}</span>
                  </div>
                  <div className="text-[10px] leading-snug" style={{ color: done ? '#9ac07a' : '#8a7f70' }}>
                    {done
                      ? `${done.name}${forgets(st) ? ' — and it has forgotten what was put into it' : ''}`
                      : media.length > 0 ? 'Untreated.' : 'Nothing in the racks will take this one.'}
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {media.map((m) => {
                      const c = quenchCost(m.id)!;
                      const blocked = quenchBlocker(st, part.id, m.id);
                      return (
                        <button
                          key={m.id}
                          className="btn px-1.5 py-0.5 text-[10px]"
                          disabled={blocked !== null}
                          title={blocked ?? `${c.ash} Temper Ash${c.medium > 0 ? ` + ${c.medium} ${nameOf(c.mediumId)}` : ''}`}
                          onClick={() => dispatch({ type: 'quenchPart', partId: part.id, mediumId: m.id })}
                          data-testid={`quench-do-${part.id}-${m.id}`}
                        >
                          {part.quench === m.id ? `${m.name} ✓` : m.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
