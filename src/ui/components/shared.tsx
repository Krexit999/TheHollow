import { useState, type ReactNode } from 'react';
import type { Bucket } from '../../engine';
import { breakdown, fmt, D } from '../../engine';
import { useGame } from '../store';

/**
 * What each modifier bucket is CALLED, in the player's language.
 *
 * The bucket ids are engine vocabulary and were leaking into the UI wherever a
 * bonus was rendered generically — the Museum cases read "+5% offlineEffAdd".
 * One map, so nothing has to invent its own phrasing and drift.
 */
export const BUCKET_NAME: Record<Bucket, string> = {
  dustYield: 'Dust yield',
  brickYield: 'Brick yield',
  regen: 'cell regen',
  cap: 'cell capacity',
  kilnRate: 'Kiln intake',
  kilnHeatRamp: 'Kiln heat-up',
  drillSpeed: 'drill speed',
  drillPower: 'drill power',
  xpGain: 'Delver XP',
  descendCost: 'descent cost',
  motifGain: 'Motif gain',
  dropRate: 'drop rate',
  assaySpeed: 'Assay speed',
  chainPower: 'chain power',
  strikePower: 'strike power',
  scripGain: 'Scrip gain',
  offlineEffAdd: 'offline efficiency',
};

/** Currency-colored amount. */
export function Amount({ value, color, className = '' }: { value: Parameters<typeof fmt>[0]; color?: string; className?: string }) {
  return (
    <span className={`tnum font-semibold ${className}`} style={color ? { color } : undefined}>
      {fmt(value)}
    </span>
  );
}

/**
 * The introspection affordance: hover/tap shows every named source feeding a
 * modifier bucket — the player can always see where a number comes from.
 */
export function BucketInfo({ bucket, base, children }: { bucket: Bucket; base?: { label: string; value: string }[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return <>{children}</>;
  const entries = breakdown(state, bucket);
  return (
    <span
      className="relative inline-block cursor-help border-b border-dotted border-cave-600"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((o) => !o)}
    >
      {children}
      {open && (
        // pointer-events-none: this panel opens directly above the cursor and
        // would otherwise swallow the click meant for whatever sits behind it.
        // It is pure readout — nothing in here is interactive.
        <div className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 w-60 -translate-x-1/2 rounded-lg border border-cave-600 bg-cave-900 p-3 text-left text-xs shadow-xl">
          <div className="mb-1.5 font-semibold text-lamp-300">Where this comes from</div>
          {base?.map((b) => (
            <div key={b.label} className="flex justify-between py-0.5 text-cave-300">
              <span>{b.label}</span>
              <span className="tnum">{b.value}</span>
            </div>
          ))}
          {entries.length === 0 && !base?.length && (
            <div className="text-cave-400">No modifiers yet.</div>
          )}
          {entries.map((e) => (
            <div key={e.id} className="flex justify-between gap-2 py-0.5 text-cave-200">
              <span className="truncate">{e.label}</span>
              <span className="tnum text-lamp-400">
                {e.value.gte(1) || e.value.lt(0.999) ? `×${fmt(e.value)}` : `+${fmt(e.value.mul(100))}%`}
              </span>
            </div>
          ))}
        </div>
      )}
    </span>
  );
}

/** Hold-to-confirm button — weight for deliberate actions (descend, collapse). */
export function HoldButton({
  onConfirm,
  disabled,
  holdMs = 700,
  className = '',
  children,
}: {
  onConfirm: () => void;
  disabled?: boolean;
  holdMs?: number;
  className?: string;
  children: ReactNode;
}) {
  const [progress, setProgress] = useState(0);
  const reducedMotion = useGame((s) => s.reducedMotion);
  const effectiveHold = reducedMotion ? Math.min(holdMs, 250) : holdMs;
  const timer = useState<{ raf: number; start: number }>({ raf: 0, start: 0 })[0];

  const stop = () => {
    cancelAnimationFrame(timer.raf);
    setProgress(0);
  };
  const start = () => {
    if (disabled) return;
    timer.start = performance.now();
    const step = () => {
      const p = (performance.now() - timer.start) / effectiveHold;
      if (p >= 1) {
        setProgress(0);
        onConfirm();
        return;
      }
      setProgress(p);
      timer.raf = requestAnimationFrame(step);
    };
    timer.raf = requestAnimationFrame(step);
  };

  return (
    <button
      className={`relative overflow-hidden select-none ${className}`}
      disabled={disabled}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      <span
        className="absolute inset-y-0 left-0 bg-lamp-500/25 transition-none"
        style={{ width: `${progress * 100}%` }}
      />
      <span className="relative">{children}</span>
    </button>
  );
}

export const d0 = D(0);
