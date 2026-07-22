/**
 * THE REFINERY — the bench between the Hold and the Forge.
 *
 * Three panels, one room: REFINE (purity becomes workable), TRANSMUTE (the
 * material graph, discovered by trying), and SALVAGE (the exit path tools
 * never had).
 *
 * The transmute board is deliberately a two-slot bench and NOT a list of
 * chains — pillar 5. It shows what you have, lets you feed two in, and tells
 * you what came out. Found chains live in the Codex below it.
 */
import { useState } from 'react';
import { getCurrency, fmt } from '../../engine';
import type { GameState } from '../../engine';
import { BANDS, BAND_LABELS, materialDef, type PurityBand } from '../../engine/materials';
import { materialCount, recipeDef, equippedTool } from '../../engine/systems/forge';
import {
  refineryUnlocked, transmuteUnlocked, refinePreview, foundChains,
  REFINE_RATIO, REFINERY_MASTERY,
} from '../../engine/systems/refinery';
import { salvagePreview } from '../../engine/systems/salvage';
import { TEMPERS, temperingUnlocked, temperCost, currentTemper } from '../../engine/systems/tempering';
import { dispatch, useGame } from '../store';
import { MaterialIcon } from './MaterialIcon';
import { BUCKET_NAME } from './shared';

const useLive = () => {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  return state;
};

/** Every material the player actually holds, with its per-band counts. */
function heldMaterials(state: GameState): Array<{ id: string; bands: Array<[PurityBand, number]> }> {
  return Object.entries(state.materials.stacks)
    .map(([id, perMat]) => ({
      id,
      bands: BANDS
        .map((b) => [b, perMat?.[b]?.count ?? 0] as [PurityBand, number])
        .filter(([, n]) => n > 0),
    }))
    .filter((m) => m.bands.length > 0)
    .sort((a, b) => materialDef(a.id).name.localeCompare(materialDef(b.id).name));
}

export function RefineryPanel() {
  const state = useLive();
  const [feedA, setFeedA] = useState<string | null>(null);
  const [feedB, setFeedB] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  if (!state) return null;

  if (!refineryUnlocked(state)) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        A stone trough, a bellows, and a rack of tongs, all of it cold. It answers to Ferrite
        Mastery {REFINERY_MASTERY} — the smiths will not open it for an apprentice.
      </div>
    );
  }

  const held = heldMaterials(state as GameState);
  const canTransmute = transmuteUnlocked(state as GameState);
  const found = foundChains(state as GameState);

  return (
    <div className="space-y-2">
      {/* --- REFINE ---------------------------------------------------- */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#c9a86a]">The trough</span>
          <span className="tnum text-[10px] text-cave-400">{REFINE_RATIO} in, 1 out</span>
        </div>
        <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
          Three of a band cook down to one of the band above — at the bottom of it. A bad stone
          is never wasted, only slow. The loss comes back as Slag.
        </p>
        <div className="mt-2 max-h-64 space-y-1 overflow-y-auto scroll-thin">
          {held.length === 0 && (
            <p className="text-[11px] italic text-cave-500">Nothing in the Hold to work with yet.</p>
          )}
          {held.map(({ id, bands }) => (
            <div key={id} className="flex items-center gap-2 rounded-md border border-cave-800 p-1.5">
              <MaterialIcon id={id} size={20} />
              <span className="min-w-0 flex-1 truncate text-[11px] text-cave-300">{materialDef(id).name}</span>
              <div className="flex shrink-0 flex-wrap justify-end gap-1">
                {bands.map(([band, n]) => {
                  const preview = refinePreview(state as GameState, id, band);
                  return (
                    <button
                      key={band}
                      className={`btn px-1.5 py-0.5 text-[10px] tnum ${preview ? '' : 'opacity-40'}`}
                      disabled={!preview}
                      title={preview
                        ? `${preview.from} ${BAND_LABELS[band]} → ${preview.to} ${BAND_LABELS[preview.toBand]}`
                        : `${REFINE_RATIO} of the same band, at least`}
                      onClick={() => dispatch({ type: 'refine', materialId: id, band })}
                    >
                      {BAND_LABELS[band]} ×{n}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* --- TRANSMUTE -------------------------------------------------- */}
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">The reaction bench</span>
          <span className="tnum text-[10px] text-cave-400">
            {found.length} known · {state.refinery.attempts} run
          </span>
        </div>
        {!canTransmute ? (
          <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
            The far half of the bench is under a dust sheet. Deeper Ferrite Mastery lifts it.
          </p>
        ) : (
          <>
            <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
              Two materials in. Something else out, if they have anything to say to each other.
              Order does not matter here — this is not the rune wall.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([['A', feedA, setFeedA], ['B', feedB, setFeedB]] as const).map(([label, val, set]) => (
                <div key={label} className="rounded-md border border-cave-700 p-2">
                  <div className="text-[9px] uppercase tracking-widest text-cave-500">Slot {label}</div>
                  <select
                    value={val ?? ''}
                    onChange={(e) => set(e.target.value || null)}
                    className="mt-1 w-full rounded border border-cave-700 bg-cave-950 px-1 py-1 text-[11px] text-cave-200"
                  >
                    <option value="">— empty —</option>
                    {held.map(({ id }) => (
                      <option key={id} value={id}>
                        {materialDef(id).name} ×{materialCount(state as GameState, id)}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <button
              className="btn btn-warm mt-2 w-full py-1.5 text-xs"
              disabled={!feedA || !feedB || feedA === feedB}
              onClick={() => {
                const r = dispatch({ type: 'transmute', a: feedA!, b: feedB! });
                if (!r.ok) { setResult(r.reason ?? 'Nothing happened.'); return; }
                const d = r.data as { found: string | null; isNew?: boolean; out?: string };
                setResult(d.found
                  ? `${d.isNew ? 'NEW — ' : ''}It came out as ${materialDef(d.out!).name}.`
                  : 'Slag, and a smell. They had nothing to say to each other.');
              }}
            >
              {feedA === feedB && feedA ? 'Two of the same thing is a pile' : 'Run it'}
            </button>
            {result && <div className="mt-1.5 text-center text-[11px] text-cave-300">{result}</div>}

            {found.length > 0 && (
              <div className="mt-2 border-t border-cave-800 pt-2">
                <div className="text-[9px] uppercase tracking-widest text-cave-500">What you have worked out</div>
                <div className="mt-1 space-y-1">
                  {found.map((c) => (
                    <div key={c.id} className="border-l-2 border-[#9fc4dd]/50 pl-2">
                      <div className="text-[11px] font-semibold text-cave-200">{c.name}</div>
                      <div className="text-[10px] italic text-cave-400">{c.flavor}</div>
                      <div className="tnum text-[10px] text-cave-500">
                        {materialDef(c.a).name} + {materialDef(c.b).name} → {materialDef(c.out).name}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* --- TEMPER ------------------------------------------------------ */}
      <TemperPanel />

      {/* --- TEMPER ------------------------------------------------------ */}
      <TemperPanel />

      {/* --- SALVAGE ---------------------------------------------------- */}
      <SalvagePanel />
    </div>
  );
}

function SalvagePanel() {
  const state = useLive();
  const [extract, setExtract] = useState(true);
  if (!state) return null;
  const spare = state.forge.tools.filter((t) => t.id !== state.forge.equipped);

  return (
    <div className="panel p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#d8a0a0]">The breaking bench</span>
        <span className="tnum text-[10px] text-cave-400">{state.forge.salvaged} broken down</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Half the materials back, at the tool&rsquo;s own purity. Pay to draw the settings out first,
        or take the extra material and lose them.
      </p>

      <label className="mt-2 flex items-center gap-2 text-[11px] text-cave-300">
        <input
          type="checkbox"
          checked={extract}
          onChange={(e) => setExtract(e.target.checked)}
          className="accent-[#e0b054]"
        />
        Draw out the runes and gems first
      </label>

      <div className="mt-2 space-y-1">
        {spare.length === 0 && (
          <p className="text-[11px] italic text-cave-500">
            Only the one in your hands. Forge something else before you break anything.
          </p>
        )}
        {spare.map((t) => {
          const p = salvagePreview(state as GameState, t.id);
          if (!p) return null;
          const back = Object.entries(p.returns);
          const fee = extract ? p.fee : 0;
          const shortFee = fee > 0 && getCurrency(state, 'brick').lt(fee);
          return (
            <div key={t.id} className="rounded-md border border-cave-800 p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-cave-200">
                  {t.name} <span className="text-cave-500">· {recipeDef(t.recipeId).name}</span>
                </span>
                <span className="tnum shrink-0 text-[10px] text-cave-500">purity {Math.round(t.purity)}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-cave-400">
                {back.map(([id, n]) => `${n}× ${materialDef(id).name}`).join(', ') || 'nothing worth keeping'}
                {p.residue > 0 && <span className="text-cave-600"> · {p.residue} dust</span>}
              </div>
              {(p.recoverable.gems.length > 0 || p.recoverable.runes.length > 0) && (
                <div className="mt-0.5 text-[10px] text-[#e0b054]">
                  {p.recoverable.gems.length} gem{p.recoverable.gems.length === 1 ? '' : 's'},{' '}
                  {p.recoverable.runes.length} rune{p.recoverable.runes.length === 1 ? '' : 's'} set into it
                  {extract ? ` · ${fmt(fee)} to draw out` : ' · WILL BE LOST'}
                </div>
              )}
              <button
                className="btn mt-1.5 w-full py-1 text-[11px]"
                disabled={shortFee}
                onClick={() => dispatch({ type: 'salvageTool', toolId: t.id, extract })}
              >
                {shortFee ? `Need ${fmt(fee)} to draw the settings out` : 'Break it down'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * THE QUENCH TROUGH. The card leads with WHEN each temper pays, because the
 * whole verb is matching the tool to your situation — a temper you cannot plan
 * around is just a stat, and the game already has two of those.
 */
function TemperPanel() {
  const state = useLive();
  if (!state) return null;
  if (!temperingUnlocked(state as GameState)) return null;
  const tool = equippedTool(state as GameState);
  const now = currentTemper(state as GameState);

  return (
    <div className="panel p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fd8c0]">The quench trough</span>
        <span className="tnum text-[10px] text-cave-400">
          {state.forge.tempersUsed.length}/{TEMPERS.length} media tried
        </span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Cooling {tool.name} in something gives it an affinity for a SITUATION, not a number. It
        pays while the condition holds and idles when it does not. Re-cooling is cheap — you are
        meant to change your mind when you move.
      </p>

      <div className="mt-2 space-y-1">
        {TEMPERS.map((t) => {
          const on = t.active(state as GameState);
          const worn = now?.id === t.id;
          const cost = temperCost(state as GameState, t.id)!;
          const shortAsh = materialCount(state as GameState, 'temperash') < cost.ash;
          const shortMedium = cost.medium > 0 && materialCount(state as GameState, t.medium) < cost.medium;
          return (
            <div
              key={t.id}
              className={`rounded-md border p-2 ${worn ? 'border-[#9fd8c0]/60 bg-cave-800/40' : 'border-cave-800'}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[11px] font-semibold text-cave-200">{t.name}</span>
                <span className={`shrink-0 text-[9px] uppercase tracking-wider ${on ? 'text-[#9fd8c0]' : 'text-cave-600'}`}>
                  {worn ? (on ? 'worn · holding' : 'worn · idle') : on ? 'would hold now' : 'would idle now'}
                </span>
              </div>
              <div className="text-[10px] italic leading-snug text-cave-400">{t.flavor}</div>
              <div className="mt-0.5 text-[10px] text-cave-300">
                <span className="text-cave-500">When · </span>{t.when}
              </div>
              <div className="tnum text-[10px] text-cave-500">
                +{Math.round(t.bonus * 100)}% {BUCKET_NAME[t.bucket]} holding · +{Math.round(t.idle * 100)}% idle
              </div>
              {!worn && (
                <button
                  className="btn mt-1.5 w-full py-1 text-[11px]"
                  disabled={shortAsh || shortMedium}
                  onClick={() => dispatch({ type: 'temperTool', temperId: t.id })}
                >
                  {shortAsh
                    ? `Need ${cost.ash} Temper Ash`
                    : shortMedium
                      ? `Need ${cost.medium} ${materialDef(t.medium).name}`
                      : `Quench it · ${cost.conv}`}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
