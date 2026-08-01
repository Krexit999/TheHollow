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
import { BANDS, BAND_LABELS, GEMS, materialDef, type PurityBand } from '../../engine/materials';
import { materialCount, toolRecipeName, equippedTool } from '../../engine/systems/forge';
import {
  refineryUnlocked, transmuteUnlocked, refinePreview, climbPreview, foundChains,
  REFINE_RATIO, REFINERY_MASTERY, benchReading, scentOf,
} from '../../engine/systems/refinery';
import { salvagePreview } from '../../engine/systems/salvage';
import { TEMPERS, temperingUnlocked, temperCost, currentTemper } from '../../engine/systems/tempering';
import { dispatch, useGame } from '../store';
import { ToolShelf } from './toolShelf';
import { MaterialIcon } from './MaterialIcon';
import { BUCKET_NAME } from './shared';
import { Select } from './Select';

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

/**
 * THE WHOLE CLIMB, PRICED BEFORE YOU COMMIT.
 *
 * One band at a time is honest and, past the first rung, tedious — and 3:1
 * compounding is not arithmetic anyone should be asked to do in their head to
 * find out what "take this lot to Fine" costs. So the plan is quoted first:
 * what it spends, what arrives, what comes back as slag.
 *
 * It is NOT a discount. Every rung is the same `refine` the buttons above
 * call, in the same order, at the same ratio.
 */
function ClimbRow({ state, id }: { state: GameState; id: string }) {
  const [note, setNote] = useState<string | null>(null);
  // Only bands you could actually climb TO — never a locked list.
  const targets = BANDS.slice(1).filter((b) => climbPreview(state, id, b) !== null);
  if (targets.length === 0) return null;
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1 border-t border-cave-800 pt-1"
      data-testid={`climb-${id}`}>
      <span className="text-[9px] uppercase tracking-wider text-cave-600">take it all to</span>
      {targets.map((b) => {
        const plan = climbPreview(state, id, b)!;
        return (
          <button
            key={b}
            className="btn tnum px-1.5 py-0.5 text-[10px]"
            data-testid={`climb-${id}-${b}`}
            title={`${plan.spent} spent → ${plan.got} ${BAND_LABELS[b]}, ${plan.slag} slag back`}
            onClick={() => {
              const r = dispatch({ type: 'refineTo', materialId: id, band: b });
              const d = r.data as { spent?: number; got?: number } | undefined;
              setNote(r.ok
                ? `${d?.spent ?? 0} spent, ${d?.got ?? 0} ${BAND_LABELS[b]} out`
                : (r.reason ?? null));
            }}
          >
            {BAND_LABELS[b]} <span className="text-cave-500">−{plan.spent}</span>
          </button>
        );
      })}
      {note && <span className="text-[9px] text-cave-400" data-testid={`climb-note-${id}`}>{note}</span>}
    </div>
  );
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
            <div key={id} className="rounded-md border border-cave-800 p-1.5">
              <div className="flex items-center gap-2">
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
              <ClimbRow state={state as GameState} id={id} />
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
            {/*
              THE SCENT. A stone the bench has smelled is marked in the picker
              itself, so the narrowing happens where the choice is made rather
              than after it. It says only WHETHER a stone reacts with anything —
              never with what, so the pair is still yours to find.
            */}
            <div className="mt-2 grid grid-cols-2 gap-2">
              {([['A', feedA, setFeedA], ['B', feedB, setFeedB]] as const).map(([label, val, set]) => (
                <div key={label} className="rounded-md border border-cave-700 p-2">
                  <div className="flex items-baseline justify-between">
                    <span className="text-[9px] uppercase tracking-widest text-cave-500">Slot {label}</span>
                    {val && (
                      <span
                        className="text-[9px] uppercase tracking-wider"
                        style={{ color: scentOf(val) === 'wanted' ? '#9ac07a' : '#8a7f70' }}
                        data-testid={`bench-scent-${label}`}
                      >
                        {scentOf(val) === 'wanted' ? 'reacts' : 'inert'}
                      </span>
                    )}
                  </div>
                  <Select
                    className="mt-1 w-full"
                    ariaLabel={`Refinery slot ${label}`}
                    value={val ?? ''}
                    onChange={(v) => set(v || null)}
                    options={[
                      { value: '', label: '— empty —' },
                      ...held
                        // Marked ones first: the whole point is that the list
                        // stops being 158 equally-plausible stones.
                        .slice()
                        .sort((x, y) => Number(scentOf(y.id) === 'wanted') - Number(scentOf(x.id) === 'wanted'))
                        .map(({ id }) => ({
                          value: id,
                          label: `${scentOf(id) === 'wanted' ? '◆ ' : ''}${materialDef(id).name} ×${materialCount(state as GameState, id)}`,
                        })),
                    ]}
                  />
                </div>
              ))}
            </div>
            {/*
              THE PAIR READING. A.70 shipped two SOLO readings ("both of these
              want something"), which meant only that each stone appears in some
              chain and read as "this pair will work" — so it sent players to
              pour two unrelated stones with confidence. This says whether THESE
              TWO make something, before anything is spent. What they make is
              still found only by pouring.
            */}
            {(() => {
              const r = benchReading(state as GameState, feedA, feedB);
              const tone = r.read === 'reacts' ? '#9ac07a'
                : r.read === 'known' ? '#9fc4dd'
                  : r.read === 'inert' ? '#c46a5a' : '#8a7f70';
              return (
                <div
                  className="mt-1.5 rounded border px-1.5 py-1 text-[10px] leading-snug"
                  style={{ borderColor: `${tone}55`, color: tone }}
                  data-testid="bench-reading"
                  data-read={r.read}
                >
                  {r.line}
                </div>
              );
            })()}
            <button
              className="btn btn-warm mt-2 w-full py-1.5 text-xs"
              disabled={!feedA || !feedB || feedA === feedB}
              onClick={() => {
                const r = dispatch({ type: 'transmute', a: feedA!, b: feedB! });
                if (!r.ok) { setResult(r.reason ?? 'Nothing happened.'); return; }
                const d = r.data as { found: string | null; isNew?: boolean; out?: string; line?: string };
                setResult(d.found
                  ? `${d.isNew ? 'NEW — ' : ''}It came out as ${materialDef(d.out!).name}.`
                  // A MISS THAT NARROWS. "Nothing happened" is what made this a
                  // slot machine; the reading is repeated where it is read.
                  : `Slag, and a smell. ${d.line ?? ''}`);
              }}
            >
              {(() => {
                const r = benchReading(state as GameState, feedA, feedB);
                if (r.read === 'same') return 'Two of the same thing is a pile';
                if (r.read === 'inert') return 'Run it anyway — this is slag';
                if (r.read === 'known') return 'Run it';
                if (r.read === 'reacts') return 'Run it — these two make something';
                return 'Run it';
              })()}
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

      {/*
        THE TOOL SHELF (A.71) — folded in from the retired Forge tab. It sits
        directly above the breaking bench on purpose: equipping, socketing and
        salvaging a tool are the same handful of decisions, and they were in two
        rooms.
      */}
      <ToolShelf />

      {/* --- SALVAGE ---------------------------------------------------- */}
      <SalvagePanel />

      {/* --- GEM FUSION (re-homed A.70) ---------------------------------- */}
      <GemBench />
    </div>
  );
}

/**
 * GEM FUSION — re-homed from the Workbench (A.70).
 *
 * The Workbench was stripped as redundant with the Casting station, and for
 * TOOLS it was. It also carried this, which casting does not replace: two
 * duplicate gems fuse into a better cut. It is non-destructive by design (the
 * cut only ever improves), so a duplicate is always progress rather than
 * clutter — and deleting the room would have silently deleted the feature.
 *
 * It sits in the Refinery because that is the room where things are broken down
 * and re-made, next to the bench that already draws gems back out of a tool.
 */
function GemBench() {
  const state = useLive();
  if (!state) return null;
  const held = GEMS.filter((g) => (state.materials.gems[g.id] ?? 0) > 0);
  if (held.length === 0) return null;
  const pairs = held.filter((g) => (state.materials.gems[g.id] ?? 0) >= 2);

  return (
    <div className="panel p-3" data-testid="gem-bench">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#c9a8dd]">The gem bench</span>
        <span className="tnum text-[10px] text-cave-400">{pairs.length} can be fused</span>
      </div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Two of the same stone go in and one better cut comes out. It can never come
        out worse, so a duplicate is never waste.
      </p>
      <div className="mt-2 space-y-1">
        {held.map((g) => {
          const n = state.materials.gems[g.id] ?? 0;
          return (
            <div key={g.id} className="flex items-center gap-1.5" data-testid={`gem-${g.id}`}>
              <span className="min-w-0 flex-1">
                <span className="text-[11px] text-cave-200">{g.name}</span>
                <span className="tnum ml-1 text-[10px] text-cave-500">x{n}</span>
                <span className="block text-[10px] leading-snug text-cave-400">{g.effectText}</span>
              </span>
              <button
                className="min-h-[44px] shrink-0 rounded border border-cave-700 px-2 text-[10px] text-cave-300 disabled:opacity-40"
                disabled={n < 2}
                data-testid={`gem-fuse-${g.id}`}
                title="Fuse two duplicates into a better cut — never worse"
                onClick={() => dispatch({ type: 'fuseGems', gemId: g.id })}
              >
                fuse x2
              </button>
            </div>
          );
        })}
      </div>
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
                  {t.name} <span className="text-cave-500">· {toolRecipeName(t)}</span>
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
