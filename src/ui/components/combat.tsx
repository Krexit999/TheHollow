/**
 * Phase 5 UI: combat. An encounter is an interruption of mining, never a mode
 * switch you didn't choose — the banner offers Engage / Auto / Slip away and
 * expires on its own. The fight itself is turn-based-with-timing: telegraphs
 * on a five-lane gallery, readable by PATTERN (hatching, glyphs), never by
 * color alone; the timing bar sweeps slowly and reduced-motion replaces it
 * with a steady hand. Every number comes from mining: tool strike, gear,
 * gems, skills, chords.
 */
import { useEffect, useRef, useState } from 'react';
import { convCurrencyId, currencyDef, currentShell, fmtNum, getCurrency, maxToolTier } from '../../engine';
import { ModifierCache } from '../../engine/modifiers';
import {
  AUTO_SKILL,
  BEAT_SEC,
  effectiveStrike,
  guardFactor,
  playerMaxHp,
  playerRegen,
  resolveFight,
} from '../../engine/combat/combat';
import { speciesDef, speciesOfShell, wardenOf, type Silhouette, type SpeciesDef } from '../../engine/combat/species';
import { GEAR_DEFS, type GearDef } from '../../engine/combat/gear';
import { materialDef } from '../../engine/materials';
import { materialCount } from '../../engine/systems/forge';
import { dispatch, useGame } from '../store';
import { Amount, BUCKET_NAME } from './shared';
import { MaterialIcon } from './MaterialIcon';

/**
 * UI-side modifier cache for previews. The engine's dirty() never reaches
 * this instance, so every preview invalidates first — a handful of bucket
 * recomputes per render, nothing more.
 */
const uiMods = new ModifierCache();
function previewMods(): ModifierCache {
  uiMods.invalidate();
  return uiMods;
}

// ---------------------------------------------------------------------------
// Silhouettes — procedural, animated, archetype-driven. No sprite sheets:
// each archetype is a small SVG built from its shape grammar.
// ---------------------------------------------------------------------------

export function SilhouetteArt({ kind, size = 96, tone = '#2e2822' }: { kind: Silhouette; size?: number; tone?: string }) {
  const edge = '#5a5148';
  const common = { fill: tone, stroke: edge, strokeWidth: 1 };
  return (
    <svg
      viewBox="0 0 96 60"
      width={size}
      height={(size * 60) / 96}
      className="sil-idle"
      aria-hidden
    >
      {kind === 'grub' && (
        <g {...common}>
          <ellipse cx="30" cy="38" rx="16" ry="12" />
          <ellipse cx="50" cy="36" rx="14" ry="11" />
          <ellipse cx="66" cy="34" rx="12" ry="10" />
          <ellipse cx="78" cy="32" rx="9" ry="8" />
          <path d="M20 34 q-6 -8 -2 -14" fill="none" />
          <path d="M26 30 q-4 -9 1 -13" fill="none" />
        </g>
      )}
      {kind === 'swarm' && (
        <g {...common}>
          {[
            [20, 30, 4], [32, 20, 3], [42, 34, 5], [54, 24, 3.5], [64, 38, 4],
            [72, 26, 3], [50, 44, 3.5], [30, 44, 3], [80, 36, 2.5], [60, 14, 2.5],
          ].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} className={i % 2 ? 'sil-flit' : ''} />
          ))}
        </g>
      )}
      {kind === 'stalker' && (
        <g {...common}>
          <path d="M18 40 L44 22 L78 30 L66 44 L34 48 Z" />
          <path d="M30 46 l-6 10 M44 47 l-2 11 M58 44 l4 11 M70 40 l8 9" fill="none" strokeWidth="2.5" />
          <circle cx="70" cy="30" r="2.2" fill={edge} />
        </g>
      )}
      {kind === 'sentinel' && (
        <g {...common}>
          <path d="M16 52 Q16 18 48 14 Q80 18 80 52 Z" />
          <path d="M28 52 Q28 30 48 27 Q68 30 68 52" fill="none" />
          <rect x="42" y="8" width="12" height="8" rx="2" />
        </g>
      )}
      {kind === 'flyer' && (
        <g {...common}>
          <path d="M48 30 L20 14 L30 34 Z" className="sil-wing" />
          <path d="M48 30 L76 14 L66 34 Z" className="sil-wing2" />
          <ellipse cx="48" cy="34" rx="7" ry="12" />
        </g>
      )}
      {kind === 'coil' && (
        <g {...common} fill="none" strokeWidth="5">
          <path d="M48 50 C20 50 20 20 46 20 C66 20 66 40 48 40 C36 40 36 28 46 28" />
          <circle cx="48" cy="28" r="2.5" fill={edge} stroke="none" />
        </g>
      )}
    </svg>
  );
}

// ---------------------------------------------------------------------------
// The encounter banner — over the face. Mining continues behind it.
// ---------------------------------------------------------------------------

export function EncounterBanner() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state?.combat.pending || state.combat.active) return null;
  const pending = state.combat.pending;
  const sp = speciesDef(pending.speciesId);
  const known = (state.combat.kills[sp.id] ?? 0) > 0;
  const secondsLeft = Math.max(0, Math.ceil(pending.expiresAtSec - state.stats.playTimeSec));
  const odds = resolveFight(state, previewMods(), sp, AUTO_SKILL);

  return (
    <div className="absolute inset-x-2 bottom-2 z-20 sm:inset-x-8">
      <div className="panel flex items-center gap-3 border-lamp-500/40 p-2.5 shadow-2xl">
        <SilhouetteArt kind={sp.silhouette} size={56} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-cave-200">
            {known ? sp.name : 'Something stirs in the rock'}
            <span className="tnum ml-2 text-[10px] text-cave-400">{secondsLeft}s before it loses interest</span>
          </div>
          <div className="truncate text-[10px] italic text-cave-400">
            {known ? sp.flavor : 'You have not put one of these down before.'}
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
          <button className="btn btn-warm px-3 py-1 text-xs" onClick={() => dispatch({ type: 'combatEngage' })}>
            Engage
          </button>
          <button
            className="btn px-3 py-1 text-xs"
            title={odds.win ? 'The crew likes its chances.' : 'The crew does NOT like its chances.'}
            onClick={() => dispatch({ type: 'combatAuto' })}
          >
            Auto{odds.win ? '' : ' ⚠'}
          </button>
          <button
            className="btn px-3 py-1 text-xs opacity-70 hover:opacity-100"
            title="Slip away — costs 5% of your chip bank"
            onClick={() => dispatch({ type: 'combatFlee' })}
          >
            Slip away
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The timing bar — a slow sweep, not a reaction test. Reduced motion swaps
// it for a steady 1.0 strike with no penalty windows at all.
// ---------------------------------------------------------------------------

function useSweep(active: boolean): () => number {
  const posRef = useRef(0.5);
  const hostRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!active) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      // Ping-pong sweep across the bar, one full pass per beat.
      const t = ((now - t0) / (BEAT_SEC * 1000)) % 2;
      posRef.current = t < 1 ? t : 2 - t;
      const el = hostRef.current;
      if (el) el.style.left = `${posRef.current * 100}%`;
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [active]);
  // Expose position getter + attach point via closure property.
  const get = () => posRef.current;
  (get as unknown as { hostRef: typeof hostRef }).hostRef = hostRef;
  return get;
}

function timingQuality(pos: number): number {
  const d = Math.abs(pos - 0.5);
  if (d <= 0.075) return 1.5;
  if (d <= 0.21) return 1;
  return 0.6;
}

// ---------------------------------------------------------------------------
// The combat overlay — the fight, one beat at a time.
// ---------------------------------------------------------------------------

const LANE_IDS = [0, 1, 2, 3, 4];

export function CombatOverlay() {
  const state = useGame((s) => s.state);
  const reducedMotion = useGame((s) => s.reducedMotion);
  useGame((s) => s.rev);
  const [plannedMove, setPlannedMove] = useState<-1 | 0 | 1>(0);
  const [beatNote, setBeatNote] = useState<string | null>(null);
  const fight = state?.combat.active ?? null;
  const getSweep = useSweep(!!fight && !reducedMotion);
  const sweepHostRef = (getSweep as unknown as { hostRef: React.MutableRefObject<HTMLDivElement | null> }).hostRef;

  useEffect(() => {
    // Fresh fight, fresh plan.
    setPlannedMove(0);
    setBeatNote(null);
  }, [fight?.speciesId]);

  if (!state || !fight) return null;
  const sp = speciesDef(fight.speciesId);
  const maxHp = playerMaxHp(state);
  const strike = effectiveStrike(state, previewMods());
  const tg = fight.telegraph;
  const winding = tg !== null && tg.windup > 0;
  const plannedLane = Math.max(0, Math.min(4, fight.playerLane + plannedMove));
  const lastSign = state.polarity.lastSign || 0;

  const act = (action: 'strike' | 'guard') => {
    const timing = reducedMotion ? 1 : timingQuality(getSweep());
    const result = dispatch({ type: 'combatTurn', move: plannedMove, act: action, timing });
    setPlannedMove(0);
    if (result.ok) {
      const data = result.data as { result: string; dealt?: number; taken?: number };
      if (data.result === 'win') setBeatNote(null);
      else if (data.result === 'loss') setBeatNote(null);
      else {
        const bits: string[] = [];
        if (action === 'strike' && data.dealt) bits.push(`dealt ${data.dealt}`);
        if (data.taken) bits.push(`took ${data.taken}`);
        if (!data.taken && tg && !winding) bits.push('clean');
        setBeatNote(bits.join(' · ') || null);
      }
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-2 sm:p-4">
      <div className="panel flex w-full max-w-lg flex-col gap-2.5 p-3 sm:p-4">
        {/* The enemy */}
        <div className="flex items-center gap-3">
          <SilhouetteArt kind={sp.silhouette} size={84} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-base font-semibold text-cave-200">{sp.name}</span>
              {sp.isWarden && (
                <span className="text-[9px] uppercase tracking-widest text-[#8be9fd]">Floor Warden</span>
              )}
              {fight.pole !== 0 && (
                <span
                  className="tnum rounded border border-cave-600 px-1 text-[10px]"
                  title={`Its pole is ${fight.pole > 0 ? 'north (+)' : 'south (−)'}. Your last chip sign carries in: matching pole = deeper cuts.`}
                >
                  pole {fight.pole > 0 ? '⊕' : '⊖'}
                  {lastSign !== 0 && (
                    <span className={lastSign === fight.pole ? 'text-lamp-300' : 'opacity-60'}>
                      {' '}· your edge {lastSign > 0 ? '⊕' : '⊖'}{lastSign === fight.pole ? ' ✓' : ''}
                    </span>
                  )}
                </span>
              )}
            </div>
            <HpBar value={fight.enemyHp} max={fight.enemyMaxHp} tone="#c96f4a" />
            <div className="mt-0.5 flex items-center gap-2 text-[10px] text-cave-400">
              <span className="tnum">{Math.max(0, fight.enemyHp)} / {fight.enemyMaxHp}</span>
              <span>phase {'●'.repeat(fight.phase)}{'○'.repeat(3 - fight.phase)}</span>
              {sp.enrage && fight.phase >= 3 && <span className="font-semibold text-red-400/90">ENRAGED</span>}
              {fight.guardUp && (
                <span className="font-semibold uppercase tracking-wider text-[#9fd8c0]">guarding — wait</span>
              )}
            </div>
          </div>
        </div>

        {/* The gallery — five lanes; threats are hatched, never color-only. */}
        <div className="grid grid-cols-5 gap-1">
          {LANE_IDS.map((lane) => {
            const threatened = tg?.lanes.includes(lane) ?? false;
            return (
              <div
                key={lane}
                className={`relative flex h-24 flex-col items-center justify-between rounded-md border py-1 ${
                  threatened
                    ? winding
                      ? 'hatch-windup border-dashed border-amber-600/70'
                      : 'hatch-danger border-amber-500/80'
                    : 'border-cave-700 bg-cave-900'
                }`}
              >
                <div className="h-7">{fight.enemyLane === lane && <SilhouetteArt kind={sp.silhouette} size={34} />}</div>
                <div className="text-[10px] text-cave-400">
                  {threatened ? (winding ? '…' : '⚠') : ''}
                </div>
                <div className="flex h-7 items-end pb-0.5">
                  {fight.playerLane === lane && <span className="text-lg leading-none">⛏</span>}
                  {plannedLane === lane && plannedMove !== 0 && fight.playerLane !== lane && (
                    <span className="text-lg leading-none opacity-40">⛏</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        {winding && (
          <div className="text-center text-[10px] uppercase tracking-widest text-amber-400/90">
            it winds up — a free beat to move
          </div>
        )}
        {fight.nextTelegraph && (
          <div className="text-center text-[10px] text-cave-400">
            <span className="text-[#9fd8c0]">lantern:</span> next it readies a{' '}
            <span className="font-semibold">{fight.nextTelegraph.kind}</span>
          </div>
        )}

        {/* You */}
        <div>
          <div className="flex items-baseline justify-between text-[10px] text-cave-400">
            <span>
              You · strike <span className="tnum font-semibold text-cave-200">{fmtNum(strike, 1)}</span>
              {playerRegen(state) > 0 && <span> · regen {fmtNum(playerRegen(state), 1)}</span>}
              <span> · guard blocks {Math.round((1 - guardFactor(state)) * 100)}%</span>
            </span>
            <span className="tnum">{Math.max(0, Math.round(fight.playerHp))} / {maxHp}</span>
          </div>
          <HpBar value={fight.playerHp} max={maxHp} tone="#9ab87a" />
        </div>

        {/* The beat bar */}
        {reducedMotion ? (
          <div className="rounded-md border border-cave-700 bg-cave-900 py-1 text-center text-[10px] text-cave-400">
            Steady hands — strikes land true without the sweep.
          </div>
        ) : (
          <div className="relative h-5 overflow-hidden rounded-md border border-cave-700 bg-cave-900">
            <div className="absolute inset-y-0 left-[29%] w-[42%] bg-cave-700/60" />
            <div className="absolute inset-y-0 left-[42.5%] w-[15%] bg-lamp-500/30" />
            <div
              ref={sweepHostRef}
              className="absolute inset-y-0 w-[3px] -translate-x-1/2 bg-lamp-300"
              style={{ left: '50%' }}
            />
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[9px] uppercase tracking-widest text-cave-400/80">
              strike in the light
            </div>
          </div>
        )}

        {/* Controls — thumb-sized, bottom, one-handed. */}
        <div className="grid grid-cols-5 gap-1.5">
          <button
            className={`btn py-3 text-base ${plannedMove === -1 ? 'btn-warm' : ''}`}
            disabled={fight.playerLane === 0}
            onClick={() => setPlannedMove((m) => (m === -1 ? 0 : -1))}
          >
            ◀
          </button>
          <button className="btn col-span-2 py-3 text-sm font-bold tracking-wider" onClick={() => act('strike')}>
            STRIKE
          </button>
          <button className="btn py-3 text-sm" onClick={() => act('guard')} title={`Brace: incoming ×${fmtNum(guardFactor(state), 2)}`}>
            GUARD
          </button>
          <button
            className={`btn py-3 text-base ${plannedMove === 1 ? 'btn-warm' : ''}`}
            disabled={fight.playerLane === 4}
            onClick={() => setPlannedMove((m) => (m === 1 ? 0 : 1))}
          >
            ▶
          </button>
        </div>
        <div className="min-h-4 text-center text-[10px] text-cave-400">
          {beatNote ??
            (Math.abs(fight.playerLane - fight.enemyLane) === 1
              ? 'flanking — your edge bites +25%'
              : sp.shieldedFront && fight.playerLane === fight.enemyLane
                ? 'its front is a wall — work the side lanes'
                : ' ')}
        </div>
      </div>
    </div>
  );
}

function HpBar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="mt-1 h-2 overflow-hidden rounded-full border border-cave-700 bg-cave-950">
      <div className="h-full transition-all" style={{ width: `${pct}%`, background: tone }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Warden challenge — its own card at the floor (the Breach card may not
// exist yet: Ferrite's floor has a Warden long before it has a way down).
// ---------------------------------------------------------------------------

export function WardenChallenge() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [lastAuto, setLastAuto] = useState<'win' | 'loss' | null>(null);
  if (!state) return null;
  const shell = currentShell(state);
  const warden = wardenOf(shell.id);
  if (!warden || state.depth < shell.floorDepth || state.combat.wardens.includes(shell.id)) return null;
  const odds = resolveFight(state, previewMods(), warden, AUTO_SKILL);

  return (
    <div className="panel border-[#8be9fd]/30 p-4 text-center">
      <div className="flex items-center justify-center gap-2">
        <SilhouetteArt kind={warden.silhouette} size={64} />
        <div className="text-left">
          <div className="text-sm font-semibold text-cave-200">{warden.name}</div>
          <div className="text-[10px] uppercase tracking-widest text-[#8be9fd]">holds the floor shut</div>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] italic leading-snug text-cave-400">{warden.flavor}</p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        <button
          className="btn btn-warm py-2 text-xs font-bold"
          onClick={() => dispatch({ type: 'fightWarden', auto: false })}
        >
          Face it yourself
        </button>
        <button
          className="btn py-2 text-xs"
          title={odds.win ? 'With this kit, the crew can grind it down.' : 'With this kit, the crew will be driven back. Better gear, better tool, or your own hands.'}
          onClick={() => {
            const r = dispatch({ type: 'fightWarden', auto: true });
            if (r.ok) setLastAuto((r.data as { win: boolean }).win ? 'win' : 'loss');
          }}
        >
          Send the crew{odds.win ? '' : ' ⚠'}
        </button>
      </div>
      {lastAuto === 'loss' && (
        <div className="mt-1.5 text-[10px] text-red-400/90">
          The crew was driven back — a tenth of the bank scattered in the retreat. Losing costs time and Dust, never progress.
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-resolve — the idle path, one switch.
// ---------------------------------------------------------------------------

export function AutoResolveRow() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state || state.combat.stats.encounters === 0) return null;
  const on = state.combat.autoResolve;
  return (
    <div className="panel flex items-center justify-between gap-2 p-3">
      <div className="min-w-0 text-xs text-cave-400">
        <span className="font-semibold text-cave-200">Auto-resolve encounters</span>
        <div className="text-[10px] leading-snug">
          The crew handles what crawls out, win or lose, with your stats — quieter, and it forfeits
          the par bonus (~half the spoils of a skilled hand). Unanswered encounters auto-resolve
          after 30s regardless.
        </div>
      </div>
      <button
        className={`btn shrink-0 px-3 py-1.5 text-xs ${on ? 'btn-warm' : ''}`}
        onClick={() => dispatch({ type: 'setAutoResolve', on: !on })}
      >
        {on ? 'On' : 'Off'}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The Bestiary — a discovery record. Only what you have met; notes are earned.
// ---------------------------------------------------------------------------

const NOTE_KILLS = 3;

export function BestiaryPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const shells: { id: string; label: string }[] = [
    { id: 'loam', label: 'THE LOAM' },
    ...(state.shell.breachCount >= 1 ? [{ id: 'ferrite', label: 'FERRITE' }] : []),
    ...(state.shell.breachCount >= 2 ? [{ id: 'verdance', label: 'VERDANCE' }] : []),
    ...(state.shell.breachCount >= 3 ? [{ id: 'glassmere', label: 'GLASSMERE' }] : []),
    ...(state.shell.breachCount >= 4 ? [{ id: 'cinder', label: 'CINDER' }] : []),
    ...(state.shell.breachCount >= 5 ? [{ id: 'hollow', label: 'THE HOLLOW' }] : []),
    ...(state.shell.breachCount >= 6 ? [{ id: 'aleph', label: 'ALEPH' }] : []),
  ];

  return (
    <div className="space-y-2">
      <div className="panel p-3 text-[11px] leading-snug text-cave-400">
        What lives down here, as far as you know. Meeting a thing records its shape; culling it{' '}
        <span className="tnum">{NOTE_KILLS}</span> times earns its habits.
        <div className="tnum mt-1 text-[10px]">
          wins {state.combat.stats.wins} · losses {state.combat.stats.losses} · perfect strikes{' '}
          {state.combat.stats.perfects}
        </div>
      </div>
      {shells.map((sh) => {
        const all = speciesOfShell(sh.id);
        const seen = all.filter((s) => state.combat.seen.includes(s.id));
        const warden = wardenOf(sh.id);
        const wardenSeen = warden && state.combat.seen.includes(warden.id);
        const wardenDown = warden && state.combat.wardens.includes(sh.id);
        return (
          <div key={sh.id}>
            <div className="flex items-baseline justify-between px-1">
              <span className="text-xs font-semibold uppercase tracking-wider text-cave-400">{sh.label}</span>
              <span className="tnum text-[10px] text-cave-400">
                {seen.length + (wardenSeen ? 1 : 0)} / {all.length + (warden ? 1 : 0)} recorded
              </span>
            </div>
            <div className="mt-1 space-y-1.5">
              {seen.map((sp) => (
                <BestiaryRow key={sp.id} sp={sp} kills={state.combat.kills[sp.id] ?? 0} />
              ))}
              {wardenSeen && warden && (
                <div className={wardenDown ? '' : 'opacity-90'}>
                  <BestiaryRow sp={warden} kills={state.combat.kills[warden.id] ?? 0} wardenDown={!!wardenDown} />
                </div>
              )}
              {seen.length + (wardenSeen ? 1 : 0) < all.length + (warden ? 1 : 0) && (
                <div className="px-1 text-[10px] italic text-cave-400">
                  The dark holds {all.length + (warden ? 1 : 0) - seen.length - (wardenSeen ? 1 : 0)} more shapes.
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function BestiaryRow({ sp, kills, wardenDown }: { sp: SpeciesDef; kills: number; wardenDown?: boolean }) {
  return (
    <div className={`panel p-2.5 ${sp.isWarden ? 'border-[#8be9fd]/30' : ''}`}>
      <div className="flex items-center gap-2.5">
        <SilhouetteArt kind={sp.silhouette} size={52} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-semibold text-cave-200">{sp.name}</span>
            <span className="text-[9px] uppercase tracking-wider text-cave-400">
              {sp.isWarden
                ? wardenDown ? 'warden · felled' : 'warden · stands'
                : `threat ${['', 'I', 'II', 'III', 'IV', 'V', 'VI'][sp.tier] ?? sp.tier}`}
            </span>
            {kills > 0 && <span className="tnum text-[9px] text-cave-400">×{kills} culled</span>}
            {sp.pole !== undefined && (
              <span className="text-[10px] text-cave-400" title="Fixed pole — set your chain sign to match">
                {sp.pole === 1 ? '⊕' : '⊖'}
              </span>
            )}
            {sp.poleFlips && <span className="text-[10px] text-cave-400" title="Its pole walks — ride the flips">⊕⇄⊖</span>}
          </div>
          <div className="text-[10px] italic leading-snug text-cave-400">{sp.flavor}</div>
          {kills >= NOTE_KILLS ? (
            <div className="mt-0.5 text-[10px] leading-snug text-[#9fd8c0]">{sp.note}</div>
          ) : (
            <div className="mt-0.5 text-[10px] italic text-cave-400/70">
              Habits unknown — cull {NOTE_KILLS - kills} more to learn its tell.
            </div>
          )}
          {kills > 0 && sp.drops.length > 0 && (
            <div className="mt-1 flex items-center gap-1">
              {sp.drops.map((d) => (
                <span key={d.materialId} title={materialDef(d.materialId).name}>
                  <MaterialIcon id={d.materialId} size={16} />
                </span>
              ))}
              <span className="text-[9px] text-cave-400">it carries these</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Gear — the Forge's second bench. Every piece has two faces.
// ---------------------------------------------------------------------------

const SLOT_LABEL: Record<string, string> = {
  offhand: 'off-hand',
  lantern: 'lantern',
  harness: 'harness',
  boots: 'boots',
};

const BUCKET_TEXT: Record<string, (v: number) => string> = {
  dustYield: (v) => `+${Math.round((v - 1) * 100)}% dust yield`,
  dropRate: (v) => `+${Math.round((v - 1) * 100)}% drop rate`,
  xpGain: (v) => `+${Math.round((v - 1) * 100)}% XP`,
  chainPower: (v) => `+${Math.round((v - 1) * 100)}% chain power`,
  offlineEffAdd: (v) => `+${Math.round(v * 100)}% offline efficiency`,
};

function miningText(def: GearDef): string {
  if ('chipCooldownMult' in def.mining) return `${Math.round((1 - def.mining.chipCooldownMult) * 100)}% faster chip hand`;
  const f = BUCKET_TEXT[def.mining.bucket];
  // Fall back to the shared name map rather than printing the raw bucket id.
  if (f) return f(def.mining.value);
  const name = BUCKET_NAME[def.mining.bucket];
  return `+${Math.round((def.mining.value - 1) * 100)}% ${name}`;
}

function combatText(def: GearDef): string {
  const c = def.combat;
  const bits: string[] = [];
  if (c.hp) bits.push(`+${c.hp} HP`);
  if (c.regen) bits.push(`${c.regen} regen`);
  if (c.guard !== undefined) bits.push(`guard blocks ${Math.round((1 - c.guard) * 100)}%`);
  if (c.reveal) bits.push('reads the next telegraph');
  if (c.freeMove) bits.push('sure-footed');
  return bits.join(' · ');
}

export function GearBench() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  if (state.combat.stats.encounters === 0 && state.materials.totalDrops < 30) return null;
  const tierCap = maxToolTier(state);
  const convId = convCurrencyId(state);
  const conv = currencyDef(convId);

  return (
    <>
      <div className="px-1 pt-1 text-xs font-semibold uppercase tracking-wider text-cave-400">
        The other bench — gear
      </div>
      <div className="space-y-1.5">
        {GEAR_DEFS.filter((g) => g.tier <= tierCap).map((def) => {
          const worn = state.forge.gear[def.slot];
          const isWorn = worn?.defId === def.id;
          const inputs = Object.entries(def.inputs).map(([id, need]) => ({ id, need, have: materialCount(state, id) }));
          const can = inputs.every((i) => i.have >= i.need) && getCurrency(state, convId).gte(def.conv);
          return (
            <div key={def.id} className={`panel p-2.5 ${isWorn ? 'border-lamp-500/40' : ''}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs font-semibold text-cave-200">{def.name}</span>
                    <span className="text-[9px] uppercase tracking-wider text-cave-400">{SLOT_LABEL[def.slot]}</span>
                    {isWorn && (
                      <span className="tnum text-[9px] uppercase tracking-widest text-lamp-400">
                        worn · {worn.purity}%
                      </span>
                    )}
                  </div>
                  <div className="text-[9px] text-cave-300">
                    <span className="text-dust">{miningText(def)}</span>
                    <span className="text-cave-400"> · </span>
                    <span className="text-[#9fd8c0]">{combatText(def)}</span>
                  </div>
                </div>
                <button
                  className={`btn shrink-0 px-2.5 py-1 text-xs ${can && !isWorn ? 'btn-warm' : ''}`}
                  disabled={!can || isWorn}
                  onClick={() => dispatch({ type: 'craftGear', gearId: def.id })}
                >
                  {isWorn ? 'Worn' : <>Fit · <Amount value={def.conv} color={conv.color} /></>}
                </button>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {inputs.map((input) => (
                  <span
                    key={input.id}
                    className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] ${
                      input.have >= input.need ? 'border-cave-700 text-cave-300' : 'border-red-900/60 text-red-400/90'
                    }`}
                    title={materialDef(input.id).name}
                  >
                    <MaterialIcon id={input.id} size={16} />
                    <span className="tnum">
                      {input.have}/{input.need}
                    </span>
                  </span>
                ))}
              </div>
              <div className="mt-1 text-[9px] italic leading-snug text-cave-400">{def.flavor}</div>
            </div>
          );
        })}
      </div>
      {GEAR_DEFS.some((g) => g.tier > tierCap) && (
        <div className="px-1 text-[10px] italic text-cave-400">
          Heavier kit waits behind deeper tools{' '}
          {GEAR_DEFS.filter((g) => g.tier > tierCap)
            .map((g) => g.name)
            .join(', ')}
          .
        </div>
      )}
    </>
  );
}
