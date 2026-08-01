import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { Bucket } from '../../engine';
import { breakdown, fmt, D } from '../../engine';
import { TRAITS, traitLeanText, type TraitId } from '../../engine/traits';
import { useGame } from '../store';
import { tooltipPlacement } from './tooltipPlacement';

/**
 * A small self-fading toast for a single spot — the "+340 Scrip" / "Bought —
 * Ironblood ×2" that rises off an NPC transaction. `fire(text)` shows it; it
 * clears itself. Local, so it never spams the global event feed. Anchor the
 * returned <CoinToast/> inside a `relative` container over the button/row.
 */
export function useCoinToast() {
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fire = (text: string) => {
    seq.current += 1;
    setToast({ id: seq.current, text });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 1500);
  };
  return { toast, fire };
}

/** The rising/​fading label itself. Render inside a `relative` positioned parent. */
export function CoinToast({ toast, color = '#e0b054' }: { toast: { id: number; text: string } | null; color?: string }) {
  const reducedMotion = useGame((s) => s.reducedMotion);
  if (!toast) return null;
  return (
    <span
      key={toast.id}
      aria-live="polite"
      className={`pointer-events-none absolute -top-4 left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded bg-cave-950/90 px-1.5 py-0.5 text-[10px] font-semibold tnum shadow ${reducedMotion ? 'coin-fade' : 'coin-float'}`}
      style={{ color }}
    >
      {toast.text}
    </span>
  );
}

/** The full trait reading: its plain sentence AND which way it pushes the numbers. */
export function traitTooltip(id: TraitId): string {
  const lean = traitLeanText(id);
  return lean ? `${TRAITS[id].blurb} — ${lean}` : TRAITS[id].blurb;
}

/**
 * A trait chip with the whole reading on hover/tap: the sentence plus the stat
 * directions it pushes. Used everywhere a material's traits appear, so the
 * vocabulary is defined and legible in one voice (rule 3 — a trait is a fact,
 * never a solution; combinations stay discovered).
 */
export function TraitTag({ id, size = 'sm' }: { id: TraitId; size?: 'sm' | 'xs' }) {
  return (
    <span
      className={`rounded bg-cave-800 uppercase tracking-wide text-cave-300 ${size === 'xs' ? 'px-1 text-[8px]' : 'px-1.5 text-[9px]'}`}
      title={traitTooltip(id)}
    >
      {TRAITS[id].name}
    </span>
  );
}

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
  dropRate: 'drop rate',
  assaySpeed: 'Assay speed',
  chainPower: 'chain power',
  offlineEffAdd: 'offline efficiency',
  oreChance: 'how often pockets form',
  oreRarity: 'how rich the pockets run',
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
 *
 * IT IS PORTALLED, AND IT HAS TO BE. The first version was an `absolute` panel
 * inside a `relative` span, which every browser clips to the nearest scrolling
 * ancestor — and every panel in this game lives inside `overflow-y-auto`. On a
 * 380px screen the "Speed bonuses" breakdown was cut off on both sides and at
 * the top: the affordance whose entire job is "you can always see where a
 * number comes from" could not show the number it came from. Same fix and the
 * same reasoning as `Select` (A.37): render to the body, position `fixed`
 * against the viewport, flip when there is no room above, clamp to the edges.
 *
 * The placement arithmetic lives in `tooltipPlacement` so it can be tested —
 * the flip-down branch cannot be produced through any room today (the face
 * canvas owns the top of every screen), and an unexercisable guard needs a test
 * rather than a comment.
 */
export function BucketInfo({ bucket, base, children }: { bucket: Bucket; base?: { label: string; value: string }[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<{ left: number; top: number; bottom: number; width: number } | null>(null);
  const anchor = useRef<HTMLSpanElement>(null);
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);

  const measure = () => {
    const b = anchor.current?.getBoundingClientRect();
    if (b) setRect({ left: b.left, top: b.top, bottom: b.bottom, width: b.width });
  };

  // Follow the anchor while open — these labels sit in scrolling panels, so a
  // tooltip pinned to stale coordinates detaches the moment the list moves.
  useEffect(() => {
    if (!open) return;
    const onMove = () => measure();
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, [open]);

  if (!state) return <>{children}</>;
  const entries = breakdown(state, bucket);

  const { left, width, flipDown } = tooltipPlacement(
    rect ?? { left: 0, top: 1e6, width: 0 },
    { width: typeof window === 'undefined' ? 380 : window.innerWidth,
      height: typeof window === 'undefined' ? 900 : window.innerHeight },
  );

  const show = () => { measure(); setOpen(true); };

  return (
    <span
      ref={anchor}
      className="inline-block cursor-help border-b border-dotted border-cave-600"
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onClick={() => (open ? setOpen(false) : show())}
    >
      {children}
      {open && rect && createPortal(
        // pointer-events-none: this panel opens directly above the cursor and
        // would otherwise swallow the click meant for whatever sits behind it.
        // It is pure readout — nothing in here is interactive.
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[110] max-h-[60vh] overflow-y-auto rounded-lg border border-cave-600 bg-cave-900 p-3 text-left text-xs shadow-xl scroll-thin"
          style={{
            left,
            width,
            ...(flipDown ? { top: rect.bottom + 6 } : { bottom: window.innerHeight - rect.top + 6 }),
          }}
        >
          <div className="mb-1.5 font-semibold text-lamp-300">Where this comes from</div>
          {base?.map((b) => (
            <div key={b.label} className="flex justify-between gap-2 py-0.5 text-cave-300">
              <span className="min-w-0 flex-1 break-words">{b.label}</span>
              <span className="tnum shrink-0">{b.value}</span>
            </div>
          ))}
          {entries.length === 0 && !base?.length && (
            <div className="text-cave-400">No modifiers yet.</div>
          )}
          {entries.map((e) => (
            <div key={e.id} className="flex justify-between gap-2 py-0.5 text-cave-200">
              {/* break-words, not truncate: a clipped source name is the same
                  defect as a clipped tooltip, one level down. */}
              <span className="min-w-0 flex-1 break-words">{e.label}</span>
              <span className="tnum shrink-0 text-lamp-400">
                {e.value.gte(1) || e.value.lt(0.999) ? `×${fmt(e.value)}` : `+${fmt(e.value.mul(100))}%`}
              </span>
            </div>
          ))}
        </div>,
        document.body,
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
