import { useEffect, useRef } from 'react';
import { FaceView } from '../face/FaceView';
import { useGame } from '../store';
import { SWEEP_COST_PER_CELL } from '../../engine/systems/face';

export function FaceCanvas() {
  const hostRef = useRef<HTMLDivElement>(null);
  const engine = useGame((s) => s.engine);
  const reducedMotion = useGame((s) => s.reducedMotion);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !engine) return;
    let view: FaceView | null = null;
    let cancelled = false;
    void FaceView.create(host, engine, reducedMotion).then((v) => {
      if (cancelled) v.destroy();
      else view = v;
    });
    return () => {
      cancelled = true;
      view?.destroy();
    };
  }, [engine, reducedMotion]);

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

/** The Face's own controls: how a press reads and the sweep bar. A dumb renderer
 *  of engine state — the mode is UI-only. Pointer-events isolated so it never
 *  eats a chip. */
function FaceTools() {
  const mode = useGame((s) => s.faceMode);
  const setFaceMode = useGame((s) => s.setFaceMode);
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
      </div>
    </div>
  );
}
