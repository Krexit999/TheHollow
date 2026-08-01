/**
 * GLASSMERE UI — what survived A.72's craft-system cut.
 *
 * The Observatory, the (puzzle) Bench and the Warrens were three of
 * Glassmere's rooms; all three are gone. The Optics card (the beam, refraction
 * — Glassmere's actual signature mechanic) and Rune Inscription (its own
 * system, not Glassmere-specific) survive untouched.
 */
import { useState } from 'react';
import { getCurrency } from '../../engine';
import type { Bucket } from '../../engine';
import { WAVELENGTH_RULES, splitUnlocked } from '../../engine/systems/refraction';
import {
  INSCRIPTION_TARGETS, RUNES, RUNE_GLYPHS, RUNE_NAMES, RUNE_PAIRS, RUNE_SLOTS, RUNE_TRIPLES,
  runeSlots, sequencePairs, sequenceTriples,
  type RuneId,
} from '../../engine/content/shell4/runes';
import { dispatch, useGame } from '../store';
import { Amount, BUCKET_NAME } from './shared';
import { D, Decimal } from '../../engine/decimal';

/**
 * A rune join's effect in the player's own words: the bucket it feeds and by how
 * much. Cost buckets (value < 1) read as a reduction. This is a RULE made legible
 * (rule 5), never a hint about which joins pay — that stays discovered.
 */
function runeEffectText(def: { bucket: Bucket; value: number }): string {
  const name = BUCKET_NAME[def.bucket];
  if (def.bucket === 'offlineEffAdd') return `${name} +${Math.round(def.value * 100)}%`;
  const pct = Math.round(Math.abs(def.value - 1) * 100);
  return `${name} ${def.value >= 1 ? '+' : '−'}${pct}%`;
}

// ---------------------------------------------------------------------------
// The Optics card — lives in the Dig panel while the beam is yours.
// ---------------------------------------------------------------------------

export function OpticsCard() {
  const state = useGame((s) => s.state);
  const opticsMode = useGame((s) => s.opticsMode);
  const setOpticsMode = useGame((s) => s.setOpticsMode);
  useGame((s) => s.rev);
  if (!state) return null;
  const native = state.shell.current === 'glassmere';
  const carried = state.shell.signatures.includes('refraction');
  if (!native && !carried) return null;
  const placed = Object.keys(state.refraction.mirrors).length;
  const mirrorCost = D(40).mul(Decimal.pow(1.5, state.refraction.mirrorStock - 2));

  return (
    <div className="panel p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-sm font-semibold text-[#bcd8ee]">The Beam</span>
        <span className="tnum text-[10px] text-cave-400">
          mirrors {placed}/{state.refraction.mirrorStock}
        </span>
      </div>
      {/* Layer 1 — what it IS. Layer 2 — what to DO now. (Layer 3, where the
          numbers come from, is the readout line below the controls.) */}
      <p className="mt-1 text-[11px] leading-snug text-cave-400">
        A shaft of light enters one row of the face and walks straight across it. Mirrors bend it;
        a cell the beam passes through is <span className="text-[#bcd8ee]">lit</span>, and a lit cell
        pays more when you chip it.
      </p>
      <p className="mt-1 text-[11px] leading-snug text-cave-300">
        Pick the entry row, tap <span className="text-[#bcd8ee]">place mirrors</span> and set
        <span className="text-cave-200"> /</span> or <span className="text-cave-200">\</span> on the
        face to steer the beam across your richest cells — then chip the lit ones.
      </p>

      {/* Entry row — its own centred row of proper tap targets (not a 24px pad
          with an off-centre digit). */}
      <div className="mt-2">
        <div className="text-center text-[10px] uppercase tracking-wider text-cave-500">Enters at row</div>
        <div className="mt-1 flex flex-wrap justify-center gap-1.5">
          {Array.from({ length: state.face.h }, (_, r) => (
            <button
              key={r}
              aria-label={`Beam enters at row ${r + 1}`}
              aria-pressed={state.refraction.entryRow === r}
              className={`btn flex w-10 items-center justify-center px-0 py-1.5 text-xs ${state.refraction.entryRow === r ? 'btn-warm' : ''}`}
              onClick={() => dispatch({ type: 'setBeamRow', row: r })}
            >
              {r + 1}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <button
          className={`btn flex-1 px-2 py-1 text-[11px] ${opticsMode ? 'btn-warm' : ''}`}
          title="While placing: tapping the face cycles a mirror ( / then \ then none ) instead of chipping."
          onClick={() => setOpticsMode(!opticsMode)}
        >
          {opticsMode ? 'placing mirrors…' : 'place mirrors'}
        </button>
        <button
          className="btn px-2 py-1 text-[11px]"
          disabled={getCurrency(state, 'silica').lt(mirrorCost)}
          title="Buy another mirror to place"
          onClick={() => dispatch({ type: 'buyMirror' })}
        >
          + mirror · <Amount value={mirrorCost} color="#c8c2b8" /> Silica
        </button>
      </div>

      {/* Layer 3 — where the numbers live. */}
      <div className="mt-2 border-t border-cave-800 pt-1.5 text-[10px] text-cave-500">
        {placed} of {state.refraction.mirrorStock} mirrors placed · lit cells harvest brighter, and
        a full-charge cell on the path <span className="text-cave-400">amplifies</span> the beam onward.
      </div>
      {splitUnlocked(state) && (
        <div className="mt-1.5 text-[9px] leading-relaxed text-cave-400">
          <span className="font-semibold text-[#bcd8ee]">Wavelength Split.</span>{' '}
          {WAVELENGTH_RULES.slice(1).join(' ')}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rune Inscription
// ---------------------------------------------------------------------------

export function RunesPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [target, setTarget] = useState<(typeof INSCRIPTION_TARGETS)[number]>('tool');
  const [seq, setSeq] = useState<(RuneId | null)[]>([null, null, null]);
  const [practice, setPractice] = useState<{ harmonic: number; dissonant: number; silent: number } | null>(null);
  if (!state) return null;
  const anyRunes = Object.values(state.runes.found).some((n) => n > 0) || state.runes.pairsSeen.length > 0;
  if (!anyRunes) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        Old marks turn up on Warren walls — letters that do something. Find one and bring it back
        under your fingernails.
      </div>
    );
  }
  const current = state.runes.inscriptions[target] ?? [null, null, null];
  // The tool earns MORE rune room the higher its tier (up to 5); gear stays at 3.
  // The editor must offer exactly that many, or the extra slots — and the triples
  // that only fit in a longer sequence — are unreachable.
  const slots = runeSlots(state, target);
  const view = Array.from({ length: slots }, (_, i) => seq[i] ?? null);

  return (
    <div className="space-y-2">
      <div className="panel p-3">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-semibold uppercase tracking-wider text-[#bcd8ee]">Inscription</span>
          <span className="tnum text-[10px] text-cave-400">{state.runes.pairsSeen.length}/{Object.keys(RUNE_PAIRS).length} pairs known</span>
        </div>
        <div className="mt-1 text-[10px] italic leading-snug text-cave-400">
          Adjacent runes interact, IN ORDER — Kel-Thur is not Thur-Kel. A dissonant pair ruins the
          inscription (never the item); the surface re-preps for Silica.
        </div>
        <div className="mt-2 flex flex-wrap gap-1">
          {INSCRIPTION_TARGETS.map((t) => (
            <button key={t} className={`btn px-2 py-0.5 text-[10px] ${target === t ? 'btn-warm' : ''}`} onClick={() => { setTarget(t); setSeq(Array(runeSlots(state, t)).fill(null)); }}>
              {t}{state.runes.fouled[t] ? ' (fouled)' : ''}
            </button>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {view.map((slot, i) => (
            <button
              key={i}
              className="h-10 w-10 rounded-md border border-cave-600 bg-cave-950 text-lg text-[#bcd8ee]"
              title="Tap to clear"
              onClick={() => setSeq(view.map((x, j) => (j === i ? null : x)))}
            >
              {slot ? RUNE_GLYPHS[slot as keyof typeof RUNE_GLYPHS] : '·'}
            </button>
          ))}
          <span className="text-[10px] text-cave-400">
            now: {current.filter(Boolean).map((r) => RUNE_GLYPHS[r as keyof typeof RUNE_GLYPHS]).join(' ') || 'bare'}
          </span>
        </div>
        {slots > RUNE_SLOTS && (
          <div className="mt-1 text-[9px] italic leading-snug text-cave-500">
            This tool holds {slots} runes — a longer line, where three in a row can say a third thing.
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1">
          {RUNES.map((r) => (
            <button
              key={r}
              className="btn px-2 py-1 text-xs"
              disabled={(state.runes.found[r] ?? 0) <= view.filter((x) => x === r).length}
              title={RUNE_NAMES[r]}
              onClick={() => {
                const i = view.findIndex((x) => x === null);
                if (i < 0) return;
                setSeq(view.map((x, j) => (j === i ? r : x)));
              }}
            >
              {RUNE_GLYPHS[r]} <span className="tnum text-[9px] text-cave-400">×{state.runes.found[r] ?? 0}</span>
            </button>
          ))}
        </div>
        {/*
          PRACTISE ON SCRAP — re-homed from the Workbench (A.70).
          The Workbench was stripped as redundant with the Casting station, and
          it was, for TOOLS. But it also carried this, which has nothing to do
          with casting: try a join for a little Silica and learn its SHAPE — how
          many rang, how many fought — never which, and never spending a real
          rune. Deleting the room would have deleted the feature, so it moves to
          the screen it was always about.
        */}
        <div className="mt-2 flex gap-1">
          <button
            className="btn flex-1 py-1.5 text-[11px]"
            data-testid="rune-practice"
            disabled={view.filter(Boolean).length < 2}
            title="Practise this join on scrap for a little Silica — learn if it rings, not what it does"
            onClick={() => {
              const r = dispatch({ type: 'practiceRunes', sequence: view });
              if (r.ok) setPractice(r.data as { harmonic: number; dissonant: number; silent: number });
            }}
          >
            Practise on scrap
          </button>
          <button
            className="btn btn-warm flex-1 py-1.5 text-xs"
            disabled={!view.some(Boolean)}
            onClick={() => dispatch({ type: 'inscribe', target, sequence: view })}
          >
            Etch the sequence
          </button>
        </div>
        {practice && (
          <div className="mt-1 text-[10px] leading-snug text-cave-400" data-testid="rune-practice-out">
            The scrap says: <span className="text-[#9ab87a]">{practice.harmonic} rang</span>
            {practice.dissonant > 0 && <>, <span className="text-[#e0604a]">{practice.dissonant} fought</span></>}
            {practice.silent > 0 && <>, <span className="text-cave-500">{practice.silent} stayed silent</span></>}.
            What they mean is yours to find.
          </div>
        )}
        {/* What the ETCHED inscription is doing right now — named where you have
            found it, honest that the rest is already in your totals (rule 5). */}
        {(() => {
          const activeP = sequencePairs(current).filter((p) => RUNE_PAIRS[p]);
          const activeT = sequenceTriples(current).filter((t) => RUNE_TRIPLES[t]);
          if (activeP.length === 0 && activeT.length === 0) return null;
          const all = [...activeP, ...activeT];
          const named = all.filter((k) => state.runes.pairsSeen.includes(k));
          const unnamed = all.length - named.length;
          return (
            <div className="mt-2 rounded border border-cave-800 bg-cave-950/60 p-2 text-[10px]">
              <div className="mb-0.5 uppercase tracking-widest text-cave-500">What the {target} carries now</div>
              {named.map((k) => {
                const def = RUNE_PAIRS[k] ?? RUNE_TRIPLES[k];
                return def ? (
                  <div key={k} className="flex justify-between gap-2">
                    <span className="text-cave-200">{def.name}</span>
                    <span className="shrink-0 text-[#9fd8c0]">{runeEffectText(def)}</span>
                  </div>
                ) : null;
              })}
              {unnamed > 0 && (
                <div className="italic leading-snug text-cave-500">
                  {unnamed} more {unnamed > 1 ? 'joins are' : 'join is'} speaking, still unnamed — the effect is already in your totals; watch which number moved to name it.
                </div>
              )}
            </div>
          );
        })()}
      </div>
      {/* The grammar, as discovered. */}
      <div className="panel p-3">
        <div className="text-[9px] uppercase tracking-widest text-cave-400">The grammar (as you have found it)</div>
        {state.runes.pairsSeen.length === 0 && <div className="mt-1 text-[10px] italic text-cave-400">No pair has spoken yet. Experiment.</div>}
        <div className="mt-1 space-y-1">
          {state.runes.pairsSeen.map((p) => {
            const def = RUNE_PAIRS[p];
            const [a, b] = p.split('|');
            if (!def) return null;
            return (
              <div key={p} className="flex items-baseline justify-between gap-2 border-l-2 border-[#3c4658] pl-2 text-[11px]">
                <span className="text-cave-200">
                  {RUNE_GLYPHS[a as keyof typeof RUNE_GLYPHS]}→{RUNE_GLYPHS[b as keyof typeof RUNE_GLYPHS]} {def.name}
                </span>
                <span className="shrink-0 text-right text-[9px] text-[#9fd8c0]">{runeEffectText(def)}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
