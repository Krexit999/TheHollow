/**
 * THE DESK (§37's fourth cluster) — Sable's desk, still set out.
 *
 * LAW 3 IS THE ENTIRE LAYOUT. An unproven proposition shows its QUESTION and
 * nothing else: no effect, no cost, no name of a machine or material you have
 * not met. The PROOF appears for the one you are working, because that is the
 * one you asked about. The RULE — the sentence you actually earn — is rendered
 * only once it is proven, and then it stays, because a rule you own is a thing
 * you should be able to re-read.
 *
 * Plain HTML. Nothing here mounts on the face.
 */
import { useGame, dispatch } from '../store';
import { PROPOSITIONS } from '../../engine/content/shell1/reading';
import { NOTES } from '../../engine/content/shell1/reading';

export function ReadingPanel() {
  const state = useGame((s) => s.state);
  if (!state) return null;
  const held = state.reading?.notes ?? [];
  const provenIds = state.reading?.proven ?? [];
  const working = state.reading?.working ?? null;

  const visible = PROPOSITIONS.filter((p) => p.notes <= held.length);
  const locked = PROPOSITIONS.length - visible.length;

  return (
    <div className="space-y-3">
      {/* THE NOTES. A count and the lines themselves — they are observations,
          not a currency, so they are readable rather than tallied. */}
      <div className="panel p-3" data-testid="desk-notes">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#e8d48f]">Notes</span>
          <span className="tnum text-[10px] text-cave-500" data-testid="note-count">
            {held.length} of {NOTES.length}
          </span>
        </div>
        {held.length === 0 ? (
          <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
            Nothing written down yet. The desk fills as you meet things you have not met.
          </p>
        ) : (
          <ul className="mt-1.5 space-y-1">
            {NOTES.filter((n) => held.includes(n.id)).map((n) => (
              <li key={n.id} className="text-[11px] leading-snug text-cave-300">— {n.text}</li>
            ))}
          </ul>
        )}
      </div>

      {/* THE PROPOSITIONS. */}
      <div className="panel p-3" data-testid="desk-propositions">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#9ad4e8]">Propositions</span>
          <span className="tnum text-[10px] text-cave-500" data-testid="proven-count">
            {provenIds.length} proved
          </span>
        </div>

        {visible.length === 0 && (
          <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
            Sable left questions here. None of them mean anything to you yet.
          </p>
        )}

        <ul className="mt-2 space-y-2">
          {visible.map((p) => {
            const isProven = provenIds.includes(p.id);
            const isWorking = working === p.id;
            return (
              <li
                key={p.id}
                data-testid={`prop-${p.id}`}
                className={`rounded border p-2 ${
                  isProven
                    ? 'border-[#9ad4e8]/40 bg-[#9ad4e8]/5'
                    : isWorking
                      ? 'border-[#e8d48f]/50 bg-[#e8d48f]/5'
                      : 'border-cave-800'
                }`}
              >
                <div className="text-[10px] uppercase tracking-widest text-cave-600">{p.discipline}</div>
                {/* THE QUESTION — always. It is the only thing an unproven row
                    is allowed to say about itself. */}
                <p className="mt-0.5 text-[12px] italic leading-snug text-cave-200">{p.question}</p>

                {isProven ? (
                  /* THE SENTENCE. Rendered only here, and this is the whole
                     reward — a rule about how the world works, in words. */
                  <p
                    className="mt-1.5 border-l-2 border-[#9ad4e8]/50 pl-2 text-[11px] leading-snug text-[#9ad4e8]"
                    data-testid={`rule-${p.id}`}
                  >
                    {p.rule}
                  </p>
                ) : isWorking ? (
                  <>
                    <p className="mt-1.5 text-[11px] leading-snug text-[#e8d48f]" data-testid={`proof-${p.id}`}>
                      <span className="uppercase tracking-widest text-[9px] text-cave-500">Proof · </span>
                      {p.proof}
                    </p>
                    <button
                      className="mt-1.5 w-full rounded border border-cave-700 py-1 text-[10px] uppercase tracking-wider text-cave-300 hover:bg-cave-800"
                      data-testid={`putdown-${p.id}`}
                      onClick={() => dispatch({ type: 'workProposition', id: null })}
                    >
                      Put it down
                    </button>
                  </>
                ) : (
                  <button
                    className="btn btn-warm mt-1.5 w-full py-1 text-[11px]"
                    data-testid={`work-${p.id}`}
                    onClick={() => dispatch({ type: 'workProposition', id: p.id })}
                  >
                    Work this one
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {/* A COUNT, NEVER A LIST (§12.1). Knowing four remain is a horizon;
            knowing their names would be a shopping list. */}
        {locked > 0 && (
          <p className="mt-2 text-[10px] leading-snug text-cave-600" data-testid="desk-horizon">
            {locked} more {locked === 1 ? 'question sits' : 'questions sit'} face-down. More notes will turn {locked === 1 ? 'it' : 'them'} over.
          </p>
        )}
      </div>
    </div>
  );
}
