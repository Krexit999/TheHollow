import { useEffect, useRef, useState } from 'react';
import { fmt, fmtDuration, currentShell } from '../../engine';
import { ACHIEVEMENTS } from '../../engine/content/shell1/achievements';
import { untoldDef } from '../../engine/content/untold';
import { objectDef, delverDef } from '../../engine/content/dead';
import { gemDef, materialDef } from '../../engine/materials';
import { ABILITY_BY_ID } from '../../engine/content/drillAlloys';
import { RUNE_NAMES, RUNE_PAIRS } from '../../engine/content/shell4/runes';
import { RARITY_COLOR } from './HoldPanel';
import { dispatch, useGame } from '../store';

// ---------------------------------------------------------------------------
// Offline summary — a clear account of what accrued while you were gone.
// ---------------------------------------------------------------------------

export function OfflineModal() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state?.offline) return null;
  const o = state.offline;

  // Re-orientation (Phase 11, Part 7; deepened Phase 21): where you are, and the
  // threads you left hanging — the ones that want your hand back. Someone away
  // three days needs their bearings AND their unfinished business, in one glance.
  const shell = currentShell(state);
  const threads: string[] = [];
  if (state.delver.skillPoints > 0)
    threads.push(`${state.delver.skillPoints} skill point${state.delver.skillPoints === 1 ? '' : 's'} unspent`);
  const curing = state.shaft.caches.filter((c) => c.material !== null).length;
  if (curing > 0) threads.push(`${curing} cache${curing === 1 ? '' : 's'} curing in the shaft`);
  if (state.shell.current === 'hollow' && state.hollow.rebuilt.length > 0)
    threads.push(`reconstruction underway — ${state.hollow.rebuilt.length}/${state.face.cells.length} cells`);
  const shownThreads = threads.slice(0, 4);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="panel w-full max-w-sm p-5 text-center">
        <div className="font-display text-xl font-semibold text-lamp-400">The dig went on.</div>
        <div className="mt-1 text-xs text-cave-400">
          You were away {fmtDuration(o.seconds)} · crew worked at {Math.round(o.efficiency * 100)}% pace
        </div>
        {/* Where you are — bearings before the ledger — then what waits for you. */}
        <div className="mt-3 rounded-lg border border-cave-700 bg-cave-950/60 px-3 py-2 text-xs">
          <span className="font-semibold text-cave-200">{shell.title}</span>
          <span className="text-cave-400"> · depth {state.depth}</span>
          {shownThreads.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-left text-[11px] italic text-cave-400">
              {shownThreads.map((t) => (
                <li key={t} className="flex gap-1.5">
                  <span aria-hidden className="text-lamp-500">·</span>
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="mt-3 space-y-1.5 text-sm">
          {o.chargeFilled > 0.5 && (
            <Row label="The face recharged" value={`+${fmt(o.chargeFilled)} charge`} color="#9ab87a" />
          )}
          {o.dust.gt(0) && <Row label="Drills hauled Dust" value={`+${fmt(o.dust)}`} color="#d4a86a" />}
          {o.brick.gt(0) && <Row label="The Kiln fired Brick" value={`+${fmt(o.brick)}`} color="#c96f4a" />}
          {o.xp.gt(0) && (
            <Row
              label={o.levelsGained > 0 ? `Delver XP (+${o.levelsGained} level${o.levelsGained > 1 ? 's' : ''})` : 'Delver XP'}
              value={`+${fmt(o.xp)}`}
              color="#fbbf24"
            />
          )}
          {o.dust.lte(0) && o.brick.lte(0) && (
            <div className="text-xs italic text-cave-400">
              No drills were running — the rock only refilled. Depth never advances while you're away.
            </div>
          )}
        </div>
        <button className="btn btn-warm mt-5 w-full py-2 text-sm" onClick={() => dispatch({ type: 'dismissOffline' })}>
          Back to the dig
        </button>
      </div>
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-cave-800 pb-1">
      <span className="text-xs text-cave-400">{label}</span>
      <span className="tnum font-semibold" style={{ color }}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Toasts — achievements, level-ups, line completions.
// ---------------------------------------------------------------------------

interface Toast {
  key: number;
  title: string;
  body: string;
  color: string;
  /** When it TOOK THE SLOT — stamped by the queue, not by whatever produced it.
   *  Absent while it is still waiting its turn. */
  at?: number;
}

/**
 * HOW MANY ANNOUNCEMENTS MAY BE ON SCREEN AT ONCE.
 *
 * ONE ON A PHONE, and the rest WAIT (ruled A.81). At 380x900 the room region is
 * roughly 290px tall, so a stack of four toasts is most of it — and the two
 * alternatives both lose: floating covers content the player has to read, and
 * putting the stack in normal flow shifts the layout under their thumb every
 * time an achievement lands. A queue costs a player nothing but time they were
 * not spending anyway.
 *
 * Desktop keeps four: the stack lives bottom-RIGHT, opposite the control column,
 * where there is nothing underneath it.
 */
const PHONE_TOASTS = 1;
const DESKTOP_TOASTS = 4;
/** How long one announcement holds the slot before the queue advances. */
const TOAST_MS = 4200;

export function Toasts() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastSeq = useRef(-1);
  /** Announcements earned but not yet shown. Never dropped, only delayed. */
  const queue = useRef<Toast[]>([]);
  const [wide, setWide] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1024px)').matches,
  );
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mq = window.matchMedia('(min-width: 1024px)');
    const on = (): void => setWide(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  const cap = wide ? DESKTOP_TOASTS : PHONE_TOASTS;

  /**
   * THE SLOT OPENS, THE QUEUE ADVANCES. One interval rather than a timer per
   * toast: a per-toast `setTimeout` cannot know whether the slot it frees is
   * wanted by something that arrived while it was up, which is how a queue
   * turns back into a stack.
   */
  useEffect(() => {
    const t = window.setInterval(() => {
      setToasts((cur) => {
        const now = Date.now();
        const live = cur.filter((x) => now - (x.at ?? now) < TOAST_MS);
        const room = cap - live.length;
        if (room <= 0) return live.length === cur.length ? cur : live;
        const take = queue.current.splice(0, room).map((x) => ({ ...x, at: now }));
        return take.length > 0 ? [...live, ...take] : (live.length === cur.length ? cur : live);
      });
    }, 250);
    return () => window.clearInterval(t);
  }, [cap]);

  useEffect(() => {
    if (!state) return;
    const fresh: Toast[] = [];
    for (const entry of state.feed) {
      if (entry.seq <= lastSeq.current) continue;
      lastSeq.current = entry.seq;
      const ev = entry.event;
      if (ev.type === 'achievement') {
        const def = ACHIEVEMENTS.find((a) => a.id === ev.id);
        if (def) fresh.push({ key: entry.seq, title: def.name, body: `${def.description} · ${def.bonus.label}`, color: '#fbbf24' });
      } else if (ev.type === 'levelUp') {
        fresh.push({ key: entry.seq, title: `Delver level ${ev.level}`, body: 'Skill point earned.', color: '#fcd34d' });
      } else if (ev.type === 'colComplete') {
        fresh.push({ key: entry.seq, title: 'Column complete!', body: 'A large bonus is now yours. Check the Grid.', color: '#8be9fd' });
      } else if (ev.type === 'rowComplete') {
        fresh.push({ key: entry.seq, title: 'Row complete!', body: 'A large bonus is now yours. Check the Grid.', color: '#8be9fd' });
      } else if (ev.type === 'collapse') {
        // A hand-pulled collapse gets the full modal; the auto one gets a quiet
        // toast so an idle run still shows its heartbeat.
        if (ev.auto) {
          fresh.push({ key: entry.seq, title: 'Auto-collapse', body: `Depth ${ev.depth} · +${fmt(ev.cores)} Cores.`, color: '#8be9fd' });
        }
      } else if (ev.type === 'materialFound') {
        // Only a material you have NEVER held announces itself — a discovery is
        // worth a word, the hundredth of the same stone is not. Every find after
        // just ticks the Hold.
        if (ev.first) {
          const def = materialDef(ev.materialId);
          fresh.push({
            key: entry.seq,
            title: `New: ${def.name} — ${ev.rarity} (${ev.purity}%)`,
            body: def.flavor ?? 'Something worth keeping.',
            color: RARITY_COLOR[ev.rarity],
          });
        }
      } else if (ev.type === 'untoldTell') {
        /*
         * THE TELL (§49.1). No title naming the thing, no percentage, no arrow
         * — one strange sentence, once, in a colour nothing else in this list
         * uses. §49.1's honest finding was that eleven of seventeen secrets had
         * no tell at all, which makes "accidental" mean "never found". This is
         * the whole answer to that, and it is deliberately unhelpful.
         */
        fresh.push({ key: entry.seq, title: 'Something is off.', body: ev.tell, color: '#a89bc4' });
      } else if (ev.type === 'untoldFound') {
        const def = untoldDef(ev.id);
        if (def) fresh.push({ key: entry.seq, title: def.name, body: def.did, color: '#a89bc4' });
      } else if (ev.type === 'delverObjectFound') {
        const o = objectDef(ev.objectId);
        const who = delverDef(ev.delverId);
        if (o && who) fresh.push({ key: entry.seq, title: o.name, body: `${who.name} left it here.`, color: '#d8c98a' });
      } else if (ev.type === 'delverTrailClosed') {
        const who = delverDef(ev.delverId);
        // NOT the epitaph — that is the room's, and it is long. This is only
        // the fact that there is nothing more of them anywhere, which is a
        // thing you learn by having walked, and it deserves a beat.
        if (who) fresh.push({ key: entry.seq, title: who.name, body: 'There is nothing more of theirs, anywhere.', color: '#b9a98a' });
      } else if (ev.type === 'gemFound') {
        const def = gemDef(ev.gemId);
        fresh.push({ key: entry.seq, title: `A gem: ${def.name}`, body: def.flavor, color: def.color });
      } else if (ev.type === 'geodeFound') {
        fresh.push({ key: entry.seq, title: 'A geode.', body: 'Sealed. Heavier than it looks. The Hold has it.', color: '#9fd8c0' });
      } else if (ev.type === 'toolForged') {
        fresh.push({
          key: entry.seq,
          title: `Forged: ${ev.name}`,
          body: `Tier ${'I'.repeat(Math.min(3, ev.tier))} · ${ev.purity}% purity. It goes straight to your hand.`,
          color: '#d4a86a',
        });
      } else if (ev.type === 'temporalFound') {
        fresh.push({ key: entry.seq, title: `A slow carving completes: ${ev.name}`, body: 'Runes cut into the same tool across long stretches finally spoke together. The slowest thing you can find, and now it is yours.', color: '#c8a35a' });
      } else if (ev.type === 'bulkSalvaged') {
        fresh.push({ key: entry.seq, title: `${ev.count} tools broken down`, body: `The dead inventory became ${ev.units} units of material for the next thing you make.`, color: '#c98e4a' });
      } else if (ev.type === 'drillAlloyFound') {
        const def = ABILITY_BY_ID.get(ev.id);
        fresh.push({ key: entry.seq, title: `${def?.name ?? 'An alloy'} — it took`, body: def?.effect ?? 'The pour set into something with a behaviour of its own.', color: '#8fd8c0' });
      } else if (ev.type === 'figure') {
        // Only the FIRST time a figure is discovered gets a toast (a Codex moment,
        // a handful ever). Re-cutting the same shape pays silently — no spam.
        if (ev.first) {
          fresh.push({
            key: entry.seq,
            title: `A figure in the rock: ${ev.name}`,
            body: 'You cut a shape into the face and it answered — XP and a better chance at a drop. The Codex keeps it.',
            color: '#e6c15a',
          });
        }
      } else if (ev.type === 'assayComplete') {
        fresh.push({ key: entry.seq, title: `Assay complete: depth ${ev.depth}`, body: 'The vein is marked. Drops doubled for a while — see the Hold.', color: '#9ab87a' });
      } else if (ev.type === 'runeFound') {
        fresh.push({ key: entry.seq, title: `A rune: ${RUNE_NAMES[ev.runeId as keyof typeof RUNE_NAMES] ?? ev.runeId}`, body: 'A letter that does something. The Runes tab will take it.', color: '#bcd8ee' });
      } else if (ev.type === 'pairDiscovered') {
        fresh.push({ key: entry.seq, title: `The grammar speaks: ${RUNE_PAIRS[ev.pair]?.name ?? ev.pair}`, body: 'An ordered pair, learned by etching it. Recorded.', color: '#9fd8c0' });
      } else if (ev.type === 'inscribed') {
        fresh.push({ key: entry.seq, title: `Inscribed: the ${ev.target}`, body: 'The sequence holds. The runes hum where they sit.', color: '#bcd8ee' });
      } else if (ev.type === 'inscriptionFailed') {
        fresh.push({ key: entry.seq, title: 'Dissonance', body: `The inscription is ruined — the ${ev.target} itself is fine. Re-prep the surface with Silica.`, color: '#e07a6a' });
      } else if (ev.type === 'chokeReleased') {
        fresh.push({
          key: entry.seq,
          title: 'The vents breathe again',
          body: ev.reason === 'idle' ? 'The crew will not tend a fire you abandoned — the choke released itself.' : 'The klaxon opened the choke. Riding further takes your own hand on it.',
          color: '#e0955c',
        });
      } else if (ev.type === 'purged') {
        fresh.push({ key: entry.seq, title: 'Emergency purge', body: `A quarter of the Slag, spent as steam. Heat at ${ev.heat.toFixed(0)}.`, color: '#e0955c' });
      } else if (ev.type === 'silenceHarvest') {
        fresh.push({ key: entry.seq, title: 'You listened', body: `${ev.stacks.toFixed(0)} stacks of quiet, farmed into ${fmt(ev.voidGained)} Void.`, color: '#b8b0e0' });
      } else if (ev.type === 'cellRebuilt') {
        fresh.push({ key: entry.seq, title: `A cell remembers being rock`, body: `${ev.total} of the face rebuilt. Light returning, one cell at a time.`, color: '#c8bfe8' });
      } else if (ev.type === 'faceWhole') {
        fresh.push({ key: entry.seq, title: 'The face is whole', body: 'You have rebuilt the world you started with. The stair to the Core is open.', color: '#e8d8f8' });
      } else if (ev.type === 'coreTouched') {
        fresh.push({ key: entry.seq, title: 'The Core', body: 'A desk. A chair. A pen, offered. Recursion waits at the Rewrite.', color: '#e8d88c' });
      } else if (ev.type === 'recursion') {
        fresh.push({ key: entry.seq, title: `Recursion ${ev.count}`, body: `The world begins again, and you do not. +${ev.axiomsGained} Axiom${ev.axiomsGained === 1 ? '' : 's'} banked.`, color: '#f0e6a8' });
      }
    }
    if (fresh.length > 0) {
      /**
       * EVERYTHING GOES TO THE QUEUE. The slot-filler above is the only thing
       * that puts a toast on screen, so there is exactly one rule about how many
       * are visible and it lives in one place. The old code pushed straight to
       * the visible list and trimmed with `.slice(-4)` — which DROPPED
       * announcements rather than delaying them whenever five landed together,
       * and five landing together is the ordinary case at a Dust milestone.
       */
      queue.current.push(...fresh);
    }
  }, [rev, state]);

  return (
    /* Phone: centred above the bottom bar. Desktop: bottom-RIGHT, opposite the
       left-hand control stack, so announcements never sit on the controls. */
    <div className="pointer-events-none fixed bottom-[96px] left-1/2 z-40 flex w-full max-w-xs -translate-x-1/2 flex-col gap-1.5 px-2 lg:bottom-6 lg:left-auto lg:right-4 lg:translate-x-0 lg:px-0">
      {toasts.map((t) => (
        <div key={t.key} className="toast-in panel px-3 py-2 text-center shadow-2xl">
          <div className="text-xs font-bold" style={{ color: t.color }}>
            {t.title}
          </div>
          <div className="text-[10px] leading-snug text-cave-400">{t.body}</div>
        </div>
      ))}
    </div>
  );
}
