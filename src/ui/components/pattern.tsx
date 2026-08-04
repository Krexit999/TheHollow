/**
 * THE PATTERN BENCH — PATTERNS (§13), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: what is ON THE STATION right now (the thing a recording would keep),
 * and the patterns you have drawn, each stating its price before the button.
 * The price is the point — a pattern repeats a cost, it does not reduce one, so
 * the panel says the number out loud rather than hiding it behind "re-pour".
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import {
  TIER_CAPABILITY_PATTERN, benchAsPattern, chargesItself, patternBuilt, patternFound,
  patternSlots, patternStation, patternsHeld, recordBlocker, repourBlocker,
} from '../../engine/systems/pattern';
import { MAX_MACHINE_TIER, TIER_PART_COST, tierOf } from '../../engine/systems/plant';
import { materialDef } from '../../engine/materials';
import type { GameState } from '../../engine';

function nameOf(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

export function PatternPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [name, setName] = useState('');
  if (!state) return null;
  const st = state as GameState;

  const found = patternFound(st);
  const built = patternBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'pattern');
  const cost = tier >= MAX_MACHINE_TIER ? null : (TIER_PART_COST[tier + 1] ?? null);
  const rack = st.casting?.rack?.length ?? 0;
  const onStation = benchAsPattern(st);
  const saved = patternsHeld(st);
  const blocked = recordBlocker(st);

  return (
    <div className="panel mt-2 p-3" data-testid="pattern-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Pattern Bench</span>
        <span className="text-[10px] text-cave-500" data-testid="pattern-tier">
          {TIER_CAPABILITY_PATTERN[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {patternStation()?.name ?? 'the deep'}. She drew the shape
            first and poured to it after, which everyone said was backwards.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-pattern"
            onClick={() => dispatch({ type: 'buildPatternBench' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          {/* WHAT A RECORDING WOULD KEEP. */}
          <div className="rounded border border-cave-800 px-1.5 py-1" data-testid="on-station">
            <div className="text-[9px] uppercase tracking-widest text-cave-500">On the station</div>
            {onStation.length === 0 ? (
              <div className="text-[10px] italic text-cave-600">Nothing. Build one first.</div>
            ) : (
              onStation.map((c) => (
                <div key={c.type} className="flex items-baseline gap-2 py-[1px] text-[10px]">
                  <span className="w-14 shrink-0 text-cave-500">{c.type}</span>
                  <span className="min-w-0 flex-1 truncate text-cave-200">{nameOf(c.materialId)}</span>
                  <span className="shrink-0 text-[9px] text-cave-600">
                    {c.shape ?? 'plain'}{c.layers > 1 ? ` ×${c.layers}` : ''}
                  </span>
                </div>
              ))
            )}
          </div>

          <div className="mt-1 flex items-baseline gap-1">
            <input
              className="min-w-0 flex-1 rounded border border-cave-800 bg-transparent px-1.5 py-0.5 text-[10px] text-cave-200 placeholder:text-cave-600"
              placeholder="name it"
              value={name}
              maxLength={24}
              data-testid="pattern-name"
              onChange={(e) => setName(e.target.value)}
            />
            <button
              className="btn shrink-0 px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={blocked !== null}
              title={blocked ?? undefined}
              data-testid="record-pattern"
              onClick={() => { dispatch({ type: 'recordPattern', name }); setName(''); }}
            >
              Draw it
            </button>
          </div>
          {blocked && <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>}

          {saved.length > 0 && (
            <div className="mt-2 space-y-1" data-testid="patterns">
              {saved.map((p) => {
                const stop = repourBlocker(st, p.id);
                return (
                  <div key={p.id} className="rounded border border-cave-800 px-1.5 py-1"
                    data-testid={`pattern-${p.id}`}>
                    <div className="flex items-baseline gap-2">
                      <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">{p.name}</span>
                      <span className="shrink-0 text-[9px] text-cave-500">{p.casts.length} parts</span>
                      <button className="btn shrink-0 px-1 py-0 text-[10px]"
                        data-testid={`forget-${p.id}`}
                        onClick={() => dispatch({ type: 'forgetPattern', patternId: p.id })}>×</button>
                    </div>
                    <div className="mt-0.5 text-[9px] text-cave-500">
                      {p.cost.melt} melt — the same as pouring it by hand, part for part.
                    </div>
                    <button
                      className="btn mt-1 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
                      disabled={stop !== null}
                      title={stop ?? undefined}
                      data-testid={`repour-${p.id}`}
                      onClick={() => dispatch({ type: 'repour', patternId: p.id })}
                    >
                      Pour it again — {p.cost.melt} melt
                    </button>
                    {stop && <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{stop}</div>}
                  </div>
                );
              })}
            </div>
          )}

          {!chargesItself(st) && (
            <div className="mt-1 text-[9px] leading-snug text-cave-600">
              This bench pours from what is in the tub. Filling it comes later.
            </div>
          )}
          {chargesItself(st) && patternSlots(st) !== Infinity && (
            <div className="mt-1 text-[9px] leading-snug text-cave-600">
              It holds one pattern. Keeping more comes later.
            </div>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-pattern"
              onClick={() => dispatch({ type: 'buildPatternBench' })}
            >
              {TIER_CAPABILITY_PATTERN[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
