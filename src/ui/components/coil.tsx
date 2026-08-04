/**
 * THE COIL — SURGE (§13), plain HTML, in THE PLANT cluster.
 *
 * The one number it exists to make legible is the one §3.3 calls "the tightest
 * active→industrial link in the design": the chain you are holding at the face
 * is the size of the burst the plant can throw.
 */
import { useGame, dispatch } from '../store';
import {
  TIER_CAPABILITY_COIL, chainBanks, coilFound, coilRead, coilRemembers, coilStation,
  nextCoilTierCost,
} from '../../engine/systems/coil';
import { MAX_MACHINE_TIER, surgeCap } from '../../engine/systems/plant';
import { demandOf } from '../../engine/systems/plant';
import type { GameState } from '../../engine';

export function CoilPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;

  const found = coilFound(st);
  const r = coilRead(st);
  if (!found && !r.built) return null;

  const cost = nextCoilTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const cap = surgeCap(st);
  const line = demandOf('line').surge;

  return (
    <div className="panel mt-2 p-3" data-testid="coil-panel">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">The Coil</span>
        <span className="tnum text-[10px] text-cave-400">{r.built ? `tier ${r.tier}` : 'in the wreck'}</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        {r.built
          ? 'What you hold together at the face is what it can throw at once.'
          : `Windings, most of them still whole${coilStation() ? `, at ${coilStation()!.name}` : ''}.`}
      </p>

      <div className="mt-2 space-y-0.5">
        {TIER_CAPABILITY_COIL.slice(1).map((l, i) => (
          <div
            key={i}
            className="text-[10px] leading-snug"
            style={{ color: r.tier >= i + 1 ? '#9ac07a' : '#6c6459' }}
            data-testid={`coil-tier-${i + 1}`}
          >
            <span className="tnum mr-1">{['I', 'II', 'III'][i]}</span>{l}
          </div>
        ))}
      </div>

      {cost !== null && (
        <button
          className="btn mt-2 w-full py-1.5 text-xs"
          disabled={!found || rack < cost}
          onClick={() => dispatch({ type: 'buildCoil' })}
          data-testid="coil-build"
        >
          {r.tier === 0 ? 'Wind it' : `Deepen the Coil — tier ${r.tier + 1}`} · {cost} cast parts ({rack} on the rack)
        </button>
      )}
      {cost === null && r.tier >= MAX_MACHINE_TIER && (
        <div className="mt-2 text-center text-[10px] text-cave-500">It will hold no more than this.</div>
      )}

      {r.built && (
        <div className="tnum mt-2 border-t border-cave-800 pt-2 text-[10px] text-cave-400">
          bank {cap.toFixed(1)} · a Line asks {line}
          <div className="mt-0.5" style={{ color: cap >= line ? '#9ac07a' : '#c46a5a' }}>
            {cap >= line ? 'A Line will fire.' : 'A Line will not fire on this.'}
          </div>
          {chainBanks(st) && (
            <div className="mt-0.5" style={{ color: '#9fc4dd' }}>
              chain {r.chain}{coilRemembers(st) ? ` · best ${r.best}` : ''} → +{(r.banked).toFixed(1)} banked
            </div>
          )}
        </div>
      )}
    </div>
  );
}
