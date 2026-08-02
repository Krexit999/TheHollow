import { useEffect, useRef } from 'react';
import { FaceView } from '../face/FaceView';
import { dispatch, useGame } from '../store';
import { SWEEP_COST_PER_CELL } from '../../engine/systems/face';
import { COMPACTION_SHOW_AT } from '../../engine/systems/grain';
import { availableTechniques } from '../../engine/techniques';
import type { GameState } from '../../engine';

export function FaceCanvas({ active = true }: { active?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FaceView | null>(null);
  const engine = useGame((s) => s.engine);
  const reducedMotion = useGame((s) => s.reducedMotion);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !engine) return;
    let view: FaceView | null = null;
    let cancelled = false;
    void FaceView.create(host, engine, reducedMotion).then((v) => {
      if (cancelled) v.destroy();
      else {
        view = v;
        viewRef.current = v;
        v.setActive(activeRef.current);
        // Dev-only: the repro/shot harness needs to measure ticker liveness
        // directly — currency moving is NOT proof the canvas is alive (Pixi's
        // event system is DOM-driven and keeps dispatching chips on a dead view).
        if (import.meta.env.DEV) (window as unknown as { __faceView?: unknown }).__faceView = v;
      }
    });
    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
    };
  }, [engine, reducedMotion]);

  // One renderer at a time: pause while the Shaft owns the hero (see A.38).
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => { viewRef.current?.setActive(active); }, [active]);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl border border-cave-700 bg-cave-950"
      aria-label="The mining face — press and hold to chip, or switch to sweep"
    >
      <div
        ref={hostRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
      <FaceTools />
    </div>
  );
}

/**
 * HOW THE NEXT SWING MEETS THE GRAIN (Proof #1, decision 3).
 *
 * ONE PERSISTENT TOGGLE PLUS A TAP. The alternative — a four-way strike
 * selector, where you pick a direction and the cell's grain decides which mode
 * you landed in — is more expressive and is deliberately NOT built: it is two
 * gestures per chip at 380px, on a verb the player performs several thousand
 * times, and the expressiveness it buys is a mode the toggle already gives you
 * in one tap. If the toggle plays flat, that alternative is the next thing to
 * try; this is the note, not a second implementation.
 *
 * The cost is stated ON the button rather than in a tooltip, because ACROSS is
 * a WORSE way to earn dust (1.3x pay for 1.8x time) and a player who discovers
 * that by watching their income drop has been tricked, not taught.
 */
function GrainStrikeBar() {
  const strike = useGame((s) => s.grainStrike);
  const setStrike = useGame((s) => s.setGrainStrike);
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const opts: { id: 'with' | 'across'; label: string; hint: string }[] = [
    { id: 'with', label: 'With', hint: 'Along the grain. Fast, ordinary pay, the rock barely tightens.' },
    { id: 'across', label: 'Across', hint: 'Against the grain. Slower, and worth LESS by the second — what it buys is packed rock and a fracture that travels.' },
  ];

  /**
   * THE LINE THAT SAYS WHY.
   *
   * The player report was "it doesn't show any benefit", and the game genuinely
   * did not: two buttons, a number in a corner, and nothing joining them to the
   * seams they open. This is one line of LIVE ENGINE STATE — how much of the
   * face is worked, and what the fracture is doing right now — which is most of
   * the answer to that report. Read out of the state rather than tracked here,
   * so it cannot drift away from what is true (pillar 8).
   */
  let worked = 0;
  const comp = state?.face.compaction;
  if (comp) for (const c of comp) if (c >= COMPACTION_SHOW_AT) worked += 1;
  const front = state?.face.front;
  const hops = front?.alive ? front.hops : 0;

  return (
    <div className="pointer-events-none flex w-full flex-col items-center gap-1">
      <div className="pointer-events-auto flex items-stretch gap-1 rounded-lg border border-cave-700 bg-black/70 p-1 lg:rounded-full lg:bg-cave-900/90 lg:shadow-2xl">
        <span className="hidden self-center px-2 text-[10px] uppercase tracking-wide text-cave-400 lg:inline">Grain</span>
        {opts.map((o) => (
          <button
            key={o.id}
            className={`min-h-[44px] min-w-[64px] rounded-md px-2 text-xs font-semibold transition-colors lg:min-h-0 lg:min-w-0 lg:rounded-full lg:px-3 lg:py-1.5 ${
              strike === o.id ? 'bg-[#7fd4ff]/20 text-[#bfe8ff]' : 'text-cave-300 hover:bg-cave-800'
            }`}
            title={o.hint}
            aria-pressed={strike === o.id}
            onClick={() => setStrike(o.id)}
          >
            {o.label}
          </button>
        ))}
      </div>
      <div className="max-w-[340px] rounded bg-black/60 px-2 py-0.5 text-center text-[10px] leading-tight text-cave-400">
        {hops > 0 ? (
          <span className="text-[#bfe8ff]">
            Fracture running · {hops} {hops === 1 ? 'square' : 'squares'} — strike its head to drive it on
          </span>
        ) : strike === 'across' ? (
          <span>Packs the rock toward richer seams, and opens a fracture that travels</span>
        ) : worked > 0 ? (
          <span>{worked} {worked === 1 ? 'square' : 'squares'} worked into seam — deeper rock drops rarer stone</span>
        ) : (
          <span>Work ACROSS the grain to pack the rock into seams</span>
        )}
      </div>
    </div>
  );
}

/** The Face's own controls: how a press reads and the sweep bar. A dumb renderer
 *  of engine state — the mode is UI-only. Pointer-events isolated so it never
 *  eats a chip. */
function FaceTools() {
  const mode = useGame((s) => s.faceMode);
  const setFaceMode = useGame((s) => s.setFaceMode);
  const armedTechnique = useGame((s) => s.armedTechnique);
  const armTechnique = useGame((s) => s.armTechnique);
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;

  const stamina = state.face.stamina;
  const staminaMax = state.face.staminaMax || 100;
  const staminaPct = Math.round((stamina / staminaMax) * 100);
  const sweepCells = Math.floor(stamina / SWEEP_COST_PER_CELL);

  const modes: { id: 'chip' | 'sweep'; label: string; hint: string }[] = [
    { id: 'chip', label: 'Chip', hint: 'Press and hold to keep chipping' },
    { id: 'sweep', label: 'Sweep', hint: 'Drag to clear a swathe, for stamina' },
  ];

  // SIGNATURE TECHNIQUES (Part B) — the verb the rock grants. Nothing renders
  // for shells whose signature has no technique yet (pillar 5: no locked list).
  const techniques = availableTechniques(state as GameState);

  return (
    /* Phone: centred along the bottom of the face. Desktop: pinned to the
       viewport's bottom-left stack, just above the Compendium button, so it
       never drifts to the middle as the face grows wider. */
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-30 flex flex-col items-center gap-1 p-1.5 lg:fixed lg:inset-x-auto lg:bottom-[56px] lg:left-4 lg:items-start lg:p-0">
      {mode === 'sweep' && (
        <div className="pointer-events-auto flex w-full max-w-xs items-center gap-2 rounded-md border border-cave-700 bg-black/70 px-2 py-1 lg:w-52 lg:rounded-full lg:bg-cave-900/90 lg:shadow-2xl">
          <span className="text-[10px] uppercase tracking-wide text-cave-400">Sweep</span>
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-cave-800">
            <div className="h-full rounded-full bg-lamp-400 transition-[width]" style={{ width: `${staminaPct}%` }} />
          </div>
          <span className="tnum text-[10px] text-lamp-300">{sweepCells} cells</span>
        </div>
      )}
      {mode === 'chip' && <GrainStrikeBar />}
      {/* Desktop: a pill that matches the Compendium button it sits above, so the
          corner reads as one stack of floating controls rather than a stray box.
          Phone keeps the 44px touch targets. */}
      <div className="pointer-events-auto flex items-stretch gap-1 rounded-lg border border-cave-700 bg-black/70 p-1 lg:rounded-full lg:bg-cave-900/90 lg:shadow-2xl">
        {modes.map((m) => (
          <button
            key={m.id}
            className={`min-h-[44px] min-w-[64px] rounded-md px-2 text-xs font-semibold transition-colors lg:min-h-0 lg:min-w-0 lg:rounded-full lg:px-3 lg:py-1.5 ${
              mode === m.id ? 'bg-lamp-500/25 text-lamp-200' : 'text-cave-300 hover:bg-cave-800'
            }`}
            title={m.hint}
            aria-pressed={mode === m.id}
            onClick={() => setFaceMode(m.id)}
          >
            {m.label}
          </button>
        ))}
        {techniques.map((t) => {
          const cooling = t.readyInSec > 0;
          if (!t.def.targeted) {
            // A global verb (Skim): one press performs it.
            const pool = t.def.id === 'skim' ? state.face.seepPool : 0;
            return (
              <button
                key={t.def.id}
                className={`min-h-[44px] min-w-[64px] rounded-md px-2 text-xs font-semibold transition-colors lg:min-h-0 lg:min-w-0 lg:rounded-full lg:px-3 lg:py-1.5 ${
                  pool >= 1 ? 'text-[#9fd8c0] hover:bg-cave-800' : 'text-cave-500'
                }`}
                title={t.def.describe(state as GameState, t.strength)}
                disabled={cooling}
                onClick={() => dispatch({ type: 'useTechnique', id: t.def.id })}
              >
                {t.def.name}{t.def.id === 'skim' && pool >= 1 ? ` ${Math.floor(pool)}` : ''}
              </button>
            );
          }
          // A targeted verb (Poleshift): arm it, then tap the cell.
          const armed = armedTechnique === t.def.id && mode === 'technique';
          return (
            <button
              key={t.def.id}
              className={`min-h-[44px] min-w-[64px] rounded-md px-2 text-xs font-semibold transition-colors lg:min-h-0 lg:min-w-0 lg:rounded-full lg:px-3 lg:py-1.5 ${
                armed ? 'bg-lamp-500/25 text-lamp-200' : cooling ? 'text-cave-500' : 'text-cave-300 hover:bg-cave-800'
              }`}
              title={t.def.describe(state as GameState, t.strength)}
              aria-pressed={armed}
              onClick={() => armTechnique(armed ? null : t.def.id)}
            >
              {cooling ? `${t.def.name} ${Math.ceil(t.readyInSec)}s` : t.def.name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
