/**
 * THE AXIOM ENGINE — RULE EDITING (§13), plain HTML, in the Rewrite panel.
 *
 * LAW 3 — the menu shows RULES, never slots and never numbers. What is hidden
 * is hidden because this world has not shown you the system the rule is about,
 * and the panel says how many are hidden rather than pretending there are none.
 */
import { useGame, dispatch } from '../store';
import {
  TIER_CAPABILITY_AXIOM, axiomEngineFound, axiomRead, axiomStation, canRedraft,
  nextAxiomTierCost,
} from '../../engine/systems/axiomEngine';
import { MAX_MACHINE_TIER } from '../../engine/systems/plant';
import type { GameState } from '../../engine';

export function AxiomEnginePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = axiomEngineFound(st);
  const r = axiomRead(st);
  if (!found && !r.built) return null;

  const cost = nextAxiomTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;

  return (
    <div className="panel p-3" data-testid="axiom-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e8d88c]">The Axiom Engine</span>
        <span className="tnum text-[10px] text-cave-400" data-testid="axiom-tier">
          {r.built ? `tier ${r.tier}` : 'in the wreck'}
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {r.built
          ? 'A rule is not a number. Write one and the world obeys it in every world after this.'
          : `A clean edit through forty feet of rock${axiomStation() ? `, at ${axiomStation()!.name}` : ''}.`}
      </p>

      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_AXIOM.slice(1).map((line, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: r.tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`axiom-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III', 'IV', 'V'][i]}</span>{line}
          </div>
        ))}
      </div>

      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildAxiomEngine' })}
          data-testid="axiom-build"
        >
          {r.tier === 0 ? 'Set it up' : `Deepen the Engine — tier ${r.tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {cost === null && r.tier >= MAX_MACHINE_TIER && (
        <div className="mt-2 text-center text-[10px] text-cave-500">It writes as much as it will ever write.</div>
      )}

      {r.built && (
        <div className="mt-2 border-t border-cave-800 pt-2">
          <div className="flex items-baseline justify-between">
            <span className="text-[9px] uppercase tracking-widest text-cave-500">What is true</span>
            <span className="tnum text-[9px] text-cave-500" data-testid="axiom-bank">
              {r.axioms} banked · {r.written} written
            </span>
          </div>

          {/* CAPPED, and measured rather than guessed: fourteen rules drew a
              1,407px wall at 380px wide. Same fix the Quench Tank's rack took
              at A.94 — the list scrolls inside itself instead of the page. */}
          <div className="mt-1 max-h-80 space-y-1 overflow-y-auto" data-testid="axiom-rows">
            {r.rows.map((row) => (
              <div
                key={row.id}
                className={`rounded-md border p-1.5 ${row.written ? 'border-[#e8d88c] bg-[#22200f]' : 'border-cave-800'}`}
                data-testid={`axiom-${row.id}`}
                data-written={row.written ? '1' : '0'}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: row.written ? '#e8d88c' : '#c9c2b6' }}
                    data-testid={`axiom-${row.id}-name`}
                  >
                    {row.name}
                  </span>
                  <span className="tnum shrink-0 text-[9px] text-cave-500">
                    {row.written ? 'written' : `${row.cost} Axiom${row.cost === 1 ? '' : 's'}`}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] leading-snug text-cave-300">{row.rule}</div>
                {row.written && (
                  <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">{row.flavor}</div>
                )}
                {!row.written && (
                  <button
                    className="btn mt-1 w-full py-1 text-[10px]"
                    disabled={row.waiting !== null}
                    title={row.waiting ?? ''}
                    onClick={() => dispatch({ type: 'writeRule', axiomId: row.id })}
                    data-testid={`axiom-${row.id}-write`}
                  >
                    {row.waiting ?? 'Write it down'}
                  </button>
                )}
                {row.written && canRedraft(st) && r.redraftLeft && (
                  <button
                    className="btn mt-1 w-full py-1 text-[10px]"
                    onClick={() => dispatch({ type: 'redraftRule', axiomId: row.id })}
                    data-testid={`axiom-${row.id}-redraft`}
                  >
                    Take it back — one redraft this Recursion
                  </button>
                )}
              </div>
            ))}
          </div>

          {r.hidden > 0 && (
            <div className="mt-1.5 text-[9px] text-cave-500" data-testid="axiom-hidden">
              {r.hidden} more rule{r.hidden === 1 ? '' : 's'} exist. They are about things this world
              has not shown you.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
