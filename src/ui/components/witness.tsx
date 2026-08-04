/**
 * THE WITNESS AND THE CONDENSER (§13, Hollow), plain HTML, in THE PLANT cluster.
 *
 * One panel, because they are one economy: the residue the unwatched plant
 * leaves, the Hush the Condenser makes of it, and the maybes waiting to be told
 * what they were.
 *
 * LAW 3: the maybes you HOLD, and for each one what it could settle as — never
 * a table of the worth rule that decides it. The rule is stated once, in a
 * sentence, and every refusal names it.
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import { Select } from './Select';
import {
  RESIDUE_PER_SEC, TIER_CAPABILITY_CONDENSER, TIER_CAPABILITY_WITNESS, WITNESS_HUSH,
  condenseBlocker, condenserBuilt, condenserFound, condenserStation, condensesItself,
  couldBe, ensureWitness, maybesHeld, nextCondenserTierCost, nextWitnessTierCost,
  witnessBlocker, witnessBuilt, witnessFound, witnessStation,
} from '../../engine/systems/witness';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { BAND_LABELS, materialDef } from '../../engine/materials';
import type { GameState } from '../../engine';

function nameOf(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

export function WitnessPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [into, setInto] = useState('');
  if (!state) return null;
  const st = state as GameState;

  const cFound = condenserFound(st);
  const cBuilt = condenserBuilt(st);
  const wFound = witnessFound(st);
  const wBuilt = witnessBuilt(st);
  if (!cFound && !cBuilt && !wFound && !wBuilt) return null;

  const w = ensureWitness(st);
  const cTier = tierOf(st, 'condenser');
  const wTier = tierOf(st, 'witness');
  const cCost = nextCondenserTierCost(st);
  const wCost = nextWitnessTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const maybes = maybesHeld(st).slice(0, 6);
  const first = maybes[0];
  const options = first ? couldBe(st, first.materialId).slice(0, 40) : [];
  const pickId = options.includes(into) ? into : (options[0] ?? '');

  return (
    <div className="panel mt-2 p-3" data-testid="witness-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">
          The Condenser &amp; the Witness
        </span>
        <span className="tnum text-[10px] text-cave-500" data-testid="hush">
          {Math.floor(w.hush)} Hush
        </span>
      </div>

      {/* ── THE CONDENSER ─────────────────────────────────────────────── */}
      <div className="rounded border border-cave-800 px-1.5 py-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-cave-300">The Condenser</span>
          <span className="text-[9px] text-cave-500" data-testid="condenser-tier">
            {TIER_CAPABILITY_CONDENSER[Math.min(cTier, MAX_MACHINE_TIER)]}
          </span>
        </div>
        {!cBuilt ? (
          <>
            <p className="mt-0.5 text-[10px] leading-snug text-cave-500">
              It is still in the wreck at {condenserStation()?.name ?? 'the deep'}. A machine
              nobody watches leaves something behind; this is what collects it.
            </p>
            <button
              className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={cCost === null || rack < cCost}
              data-testid="build-condenser"
              onClick={() => dispatch({ type: 'buildCondenser' })}
            >
              Raise it — {cCost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
            </button>
          </>
        ) : (
          <>
            <div className="mt-0.5 flex items-baseline justify-between text-[10px]">
              <span className="text-cave-500">null residue</span>
              <span className="tnum text-cave-200" data-testid="residue">{w.residue.toFixed(1)}</span>
            </div>
            {condensesItself(st) ? (
              <div className="text-[9px] text-cave-600">It does not wait to be asked.</div>
            ) : (
              <button
                className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                disabled={condenseBlocker(st) !== null}
                title={condenseBlocker(st) ?? undefined}
                data-testid="condense"
                onClick={() => dispatch({ type: 'condense' })}
              >
                Condense it
              </button>
            )}
            <div className="mt-0.5 text-[9px] leading-snug text-cave-600">
              {RESIDUE_PER_SEC.toFixed(2)}/sec for every machine the shell has stopped
              watching.
            </div>
            {cCost !== null && (
              <button
                className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                disabled={rack < cCost}
                data-testid="build-condenser"
                onClick={() => dispatch({ type: 'buildCondenser' })}
              >
                {TIER_CAPABILITY_CONDENSER[cTier + 1]} — {cCost} cast parts
              </button>
            )}
          </>
        )}
      </div>

      {/* ── THE WITNESS ───────────────────────────────────────────────── */}
      <div className="mt-1.5 rounded border border-cave-800 px-1.5 py-1">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] text-cave-300">The Witness</span>
          <span className="text-[9px] text-cave-500" data-testid="witness-tier">
            {TIER_CAPABILITY_WITNESS[Math.min(wTier, MAX_MACHINE_TIER)]}
          </span>
        </div>
        {!wBuilt ? (
          <>
            <p className="mt-0.5 text-[10px] leading-snug text-cave-500">
              It is still in the wreck at {witnessStation()?.name ?? 'the deep'}. Standing, it
              looks at a thing until the thing has to be something.
            </p>
            <button
              className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={wCost === null || rack < wCost}
              data-testid="build-witness"
              onClick={() => dispatch({ type: 'buildWitness' })}
            >
              Raise it — {wCost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
            </button>
          </>
        ) : (
          <>
            {maybes.length === 0 ? (
              <p className="mt-0.5 text-[10px] italic text-cave-600" data-testid="no-maybes">
                Nothing undecided. Leave a machine to itself in the Hollow and see what it
                hands you.
              </p>
            ) : (
              <>
                {maybes.map((m) => (
                  <div key={`${m.materialId}-${m.band}`} className="mt-0.5 flex items-baseline gap-2 text-[10px]"
                    data-testid={`maybe-${m.materialId}`}>
                    <span className="min-w-0 flex-1 truncate text-cave-200">{m.name}</span>
                    <span className="shrink-0 text-[9px] text-cave-500">
                      {BAND_LABELS[m.band]} · {m.count}
                    </span>
                  </div>
                ))}
                {first && (
                  <>
                    <div className="mt-1 flex flex-wrap items-baseline gap-1">
                      <span className="text-[9px] text-cave-600">it was</span>
                      <Select
                        ariaLabel="What it settles as"
                        value={pickId}
                        onChange={setInto}
                        options={options.map((id) => ({ value: id, label: nameOf(id) }))}
                      />
                    </div>
                    <button
                      className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                      disabled={witnessBlocker(st, first.materialId, first.band, pickId) !== null}
                      title={witnessBlocker(st, first.materialId, first.band, pickId) ?? undefined}
                      data-testid="witness-it"
                      onClick={() => dispatch({
                        type: 'witness', materialId: first.materialId, band: first.band, into: pickId,
                      })}
                    >
                      Say it was {nameOf(pickId)} — {WITNESS_HUSH} Hush
                    </button>
                    {witnessBlocker(st, first.materialId, first.band, pickId) && (
                      <div className="mt-0.5 text-[9px] leading-snug text-cave-600">
                        {witnessBlocker(st, first.materialId, first.band, pickId)}
                      </div>
                    )}
                    <div className="mt-0.5 text-[9px] leading-snug text-cave-600">
                      A thing settles as something it could have been, never as something worth
                      more.
                    </div>
                  </>
                )}
              </>
            )}
            {wCost !== null && (
              <button
                className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                disabled={rack < wCost}
                data-testid="build-witness"
                onClick={() => dispatch({ type: 'buildWitness' })}
              >
                {TIER_CAPABILITY_WITNESS[wTier + 1]} — {wCost} cast parts
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
