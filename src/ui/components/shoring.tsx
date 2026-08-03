/**
 * THE DRIFTS (§9.4) — plain HTML, on the SHAFT screen, under the Roll.
 *
 * It sits here because shoring is a thing you do TO the Roll: the row you are
 * timbering is three inches above the button that timbers it, and the mark it
 * leaves shows up on that row. §37 puts the Roll in THE FACE cluster and says
 * it is where you are, not a menu you visit — the drifts are the same object.
 *
 * LAW 3. Nothing here until the rig's wreck has been walked to, and then only
 * the band you could actually timber next — never a ladder of fifteen prices
 * with fourteen of them greyed out. The DESTINATION is the fall: the panel's
 * headline is how deep the next Collapse drops you, which is the whole product.
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import { allUpgrades } from '../../engine/upgrades';
import { UpgradeRow } from './UpgradeRow';
import { Amount } from './shared';
import {
  bands, driftDepth, isShored, rigFound, rigStation, shoreBlocker, shoreCost,
  shoringUnlocked, strandedDrifts, type Band,
} from '../../engine/systems/shoring';
import { contentsOf } from '../../engine/systems/roll';
import { materialDef } from '../../engine/materials';
import { convCurrencyId } from '../../engine/shells';
import { currencyDef } from '../../engine/resources';
import type { GameState } from '../../engine';

function seamOf(state: GameState, id: string): string {
  const seam = contentsOf(state, id).seam;
  if (!seam) return 'nothing';
  try { return materialDef(seam).name; } catch { return 'nothing'; }
}

/**
 * ONE BAND. What it costs, and — the part that makes it a decision — what its
 * contents currently are, because shoring freezes them (§1.1). The seam is
 * printed on the buy row itself so the trade is in one place: you are not
 * buying a shortcut, you are buying THIS shortcut with THAT seam in it forever.
 */
function BandRow({ state, band, shored }: { state: GameState; band: Band; shored: boolean }) {
  const [confirmPull, setConfirmPull] = useState(false);
  const cost = shoreCost(state, band.def.id);
  const blocked = shoreBlocker(state, band.def.id);
  const convId = convCurrencyId(state);
  if (!cost) return null;

  return (
    <div
      className={`rounded border px-1.5 py-1 ${shored ? 'border-[#c9a86a]/50 bg-[#c9a86a]/5' : 'border-cave-800'}`}
      data-testid={`shore-band-${band.def.id}`}
    >
      <div className="flex items-baseline gap-2">
        <span className="tnum w-8 shrink-0 text-right text-[10px] text-cave-500">{band.to}</span>
        <span className="min-w-0 flex-1 truncate text-[11px] text-cave-200">{band.def.name}</span>
        <span className="shrink-0 text-[9px] text-cave-500">
          {band.from}–{band.to}
        </span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2 text-[9px]">
        <span className="w-8 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-cave-500">
          holds {seamOf(state, band.def.id)}
          {shored && <span className="text-[#c9a86a]"> · frozen</span>}
        </span>
      </div>
      {shored ? (
        <div className="mt-1 flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-[9px] text-[#c9a86a]">timbered</span>
          <button
            className="btn px-1.5 py-0.5 text-[9px] text-cave-500"
            data-testid={`unshore-${band.def.id}`}
            onClick={() => {
              if (!confirmPull) { setConfirmPull(true); return; }
              dispatch({ type: 'unshoreBand', stationId: band.def.id });
              setConfirmPull(false);
            }}
          >
            {confirmPull ? 'Pull them — pay again' : 'pull the props'}
          </button>
        </div>
      ) : (
        <button
          className="btn mt-1 flex w-full items-baseline gap-1.5 px-1.5 py-1 text-[10px] disabled:opacity-50"
          disabled={blocked !== null}
          title={blocked ?? undefined}
          data-testid={`shore-${band.def.id}`}
          onClick={() => dispatch({ type: 'shoreBand', stationId: band.def.id })}
        >
          <span className="shrink-0">Timber it</span>
          <span className="min-w-0 flex-1 truncate text-right text-cave-400">
            <Amount value={cost.brick} color={currencyDef(convId).color} className="text-[10px]" />
            <span className="text-cave-600"> + {cost.parts} cast</span>
          </span>
        </button>
      )}
      {!shored && blocked && (
        <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>
      )}
    </div>
  );
}

export function ShoringPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const st = state as GameState;
  const station = rigStation(st);
  const raised = shoringUnlocked(st);
  /**
   * THE RIG IS A TECHNIQUE, NOT A MACHINE YOU LEAVE BEHIND (A.87).
   *
   * This read `if (!rigStation(st)) return null` — the rig's own wreck must be
   * in THIS shell — which was invisible while Loam was the only Roll and became
   * a dead system the moment Ferrite got one: `state.roll.rig` survives the
   * Breach (`breach.ts` never touches `state.roll`), so a player carries the
   * technique down and would have found no panel to use it with. Shoring worked
   * and was unreachable, which is this project's oldest failure shape.
   *
   * So: once the rig is RAISED it is shown wherever there are bands to timber.
   * Before that, LAW 3 — nothing until you have walked to the wreck that holds
   * it, in the shell that holds it.
   */
  if (bands(st).length === 0) return null;    // a shell with no authored Roll
  if (!raised && (!station || !rigFound(st))) return null;
  const rigDef = allUpgrades().find((u) => u.id === 'shoringRig');
  const drift = driftDepth(st);
  const all = bands(st);
  const shored = all.filter((b) => isShored(st, b.def.id));
  const stranded = strandedDrifts(st);
  /**
   * THE NEXT BAND, and only it. The chain is the mechanic — a timbered band
   * with an untimbered one above it is a tunnel with no way into it — so the
   * only band worth offering is the one that extends the fall. Everything below
   * is a list of prices you cannot use, which is the recipe browser LAW 3
   * forbids.
   */
  const next = all.find((b) => !isShored(st, b.def.id)) ?? null;

  return (
    <div className="panel mt-2 p-3" data-testid="shoring-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Drifts</span>
        <span className="tnum text-[10px] text-cave-500" data-testid="drift-depth">
          {drift > 0 ? `the fall lands at ${drift}m` : 'the fall lands at the surface'}
        </span>
      </div>

      {!raised ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            The rig is still in the wreck at {station?.name ?? 'the deep'}. Standing, it timbers a band so
            hard that the cave-in leaves it — and you drop straight through it, every time.
          </p>
          {rigDef && <div className="mt-1.5"><UpgradeRow def={rigDef} /></div>}
        </>
      ) : (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            A timbered band survives the Collapse and you fall through it in one breath. It
            also stops re-rolling: whatever it holds now, it holds forever.
          </p>

          {shored.length > 0 && (
            <div className="mt-1.5 flex flex-wrap items-baseline gap-1" data-testid="drift-chain">
              {shored.map((b) => (
                <span
                  key={b.def.id}
                  className={`rounded px-1 py-[1px] text-[9px] ${
                    b.to <= drift ? 'bg-[#c9a86a]/20 text-[#e0c48a]' : 'bg-cave-800 text-cave-500'
                  }`}
                  title={b.to <= drift ? 'in the chain' : 'timbered, but nothing reaches it yet'}
                >
                  {b.def.name} {b.to}m
                </span>
              ))}
            </div>
          )}
          {stranded.length > 0 && (
            <p className="mt-1 text-[10px] leading-snug text-[#e0b25a]" data-testid="drift-stranded">
              {stranded.length === 1 ? 'One drift has' : `${stranded.length} drifts have`} nothing
              above them. Drifts chain — the fall stops at the first band you have not timbered.
            </p>
          )}

          <div className="mt-2 space-y-1">
            {next
              ? <BandRow state={st} band={next} shored={false} />
              : <p className="text-[10px] italic text-cave-600">Every band is timbered. The shaft is a chute.</p>}
          </div>

          {shored.length > 0 && (
            <div className="mt-2 border-t border-cave-800 pt-1.5">
              <div className="mb-1 text-[9px] font-semibold uppercase tracking-widest text-cave-500">
                Timbered
              </div>
              <div className="space-y-1">
                {shored.map((b) => <BandRow key={b.def.id} state={st} band={b} shored />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
