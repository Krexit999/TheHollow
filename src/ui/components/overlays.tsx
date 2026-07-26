import { useEffect, useRef, useState } from 'react';
import { fmt, fmtDuration, currentShell } from '../../engine';
import { ACHIEVEMENTS } from '../../engine/content/shell1/achievements';
import { CHORD_BY_ID, PROGRESSION_BY_ID } from '../../engine/content/shell1/latticeChords';
import { gemDef, materialDef } from '../../engine/materials';
import { ABILITY_BY_ID } from '../../engine/content/drillAlloys';
import { speciesDef } from '../../engine/combat/species';
import { gearDef } from '../../engine/combat/gear';
import { npcDef, REP_TIER_NAMES } from '../../engine/guild/npcs';
import { fragmentDef } from '../../engine/guild/sable';
import { titleDef } from '../../engine/guild/titles';
import { strainDef } from '../../engine/content/shell3/greenhouse';
import { BREW_BY_ID } from '../../engine/content/shell3/brews';
import { CONSTELLATIONS } from '../../engine/content/shell4/observatory';
import { lensFor } from '../../engine/content/shell4/bench';
import { WARREN_BY_ID } from '../../engine/content/shell4/warrens';
import { RUNE_NAMES, RUNE_PAIRS } from '../../engine/content/shell4/runes';
import { ANOMALY_BY_ID } from '../../engine/systems/anomalies';
import { AXIOM_BY_ID } from '../../engine/content/shell7/axioms';
import { RARITY_COLOR } from './HoldPanel';
import { dispatch, useGame } from '../store';

function greenStrainName(id: string): string {
  try { return strainDef(id).name; } catch { return id; }
}
function brewName(id: string): string {
  return BREW_BY_ID.get(id)?.name ?? id;
}
function warrenName(id: string): string {
  return WARREN_BY_ID.get(id)?.name ?? id;
}

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
  if (state.expeditions.ready.length > 0)
    threads.push(`${state.expeditions.ready.length} expedition${state.expeditions.ready.length === 1 ? '' : 's'} back, unclaimed`);
  if (state.expeditions.active.length > 0)
    threads.push(`${state.expeditions.active.length} expedition${state.expeditions.active.length === 1 ? '' : 's'} still out`);
  if (state.spiral.activeChallenge) threads.push('a challenge run underway');
  const curing = state.shaft.caches.filter((c) => c.material !== null).length;
  if (curing > 0) threads.push(`${curing} cache${curing === 1 ? '' : 's'} curing in the shaft`);
  if (state.lattice.unlocked && Object.keys(state.lattice.cells).length > 0)
    threads.push('the Lattice board mid-arrangement');
  if (state.observatory.active) threads.push('an exposure running at the Observatory');
  if (state.wells.active.length > 0)
    threads.push(`${state.wells.active.length} Magma Well${state.wells.active.length === 1 ? '' : 's'} committed`);
  if (state.shell.current === 'hollow' && state.hollow.rebuilt.length > 0)
    threads.push(`reconstruction underway — ${state.hollow.rebuilt.length}/${state.face.cells.length} cells`);
  else if (state.depth >= shell.floorDepth && shell.floorDepth > 0 && !state.combat.wardens.includes(shell.id))
    threads.push('at the floor, the warden still to fell');
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
          {o.motifs.gt(0.05) && <Row label="The Lattice gathered Motifs" value={`+${fmt(o.motifs)}`} color="#9fd8c0" />}
          {o.passiveRanks > 0 && (
            <Row label="Lattice Passive Rank" value={`+${o.passiveRanks}`} color="#9fd8c0" />
          )}
          {o.scrip > 0 && (
            <Row label="Sef hawked the surplus" value={`+${o.scrip} Scrip`} color="#c9a86a" />
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
}

export function Toasts() {
  const state = useGame((s) => s.state);
  const rev = useGame((s) => s.rev);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const lastSeq = useRef(-1);

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
      } else if (ev.type === 'journalReveal') {
        // B5: the read incentive, announced. A hint names the meeting, never
        // the condition; a cure names the stone and what patience makes of it.
        if (ev.kind === 'confluenceHint') {
          fresh.push({ key: entry.seq, title: 'A note in her margins', body: `Something happens where ${ev.a} meets ${ev.b}. She never wrote what.`, color: '#c8b48a' });
        } else {
          fresh.push({ key: entry.seq, title: 'A recipe of patience', body: `${materialDef(ev.a).name}, cached in the deep, becomes ${materialDef(ev.b).name}. The shaft Codex holds the how.`, color: '#c8b48a' });
        }
      } else if (ev.type === 'chordDiscovered') {
        const def = CHORD_BY_ID[ev.id];
        if (def) fresh.push({ key: entry.seq, title: `Chord discovered: ${def.name}`, body: def.flavor, color: '#9fd8c0' });
      } else if (ev.type === 'progressionDiscovered') {
        const def = PROGRESSION_BY_ID[ev.id];
        if (def) fresh.push({ key: entry.seq, title: `A Progression: ${def.name}`, body: def.flavor, color: '#e4d69c' });
      } else if (ev.type === 'latticeRing') {
        fresh.push({ key: entry.seq, title: 'The board widens.', body: 'Another ring of sockets, older than the last.', color: '#9fd8c0' });
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
      } else if (ev.type === 'combatEnd') {
        const sp = speciesDef(ev.speciesId);
        if (ev.result === 'win' && ev.auto) {
          fresh.push({
            key: entry.seq,
            title: `${sp.name} put down`,
            body: `The crew handled it${ev.drops.length > 0 ? ` — ${ev.drops.map((d) => materialDef(d.materialId).name).join(', ')} recovered` : ''}.`,
            color: '#9fd8c0',
          });
        } else if (ev.result === 'loss') {
          fresh.push({
            key: entry.seq,
            title: `Driven back by the ${sp.name}`,
            body: 'A tenth of the bank scattered in the retreat. Nothing else was lost.',
            color: '#e07a5f',
          });
        } else if (ev.result === 'fled') {
          fresh.push({
            key: entry.seq,
            title: 'You slipped away.',
            body: 'It cost a twentieth of the bank. It usually does.',
            color: '#8a7f70',
          });
        }
      } else if (ev.type === 'wardenFelled') {
        const sp = speciesDef(ev.speciesId);
        fresh.push({
          key: entry.seq,
          title: `THE FLOOR OPENS — ${sp.name} is felled`,
          body: 'The way down is no longer guarded. The Breach will take you when you are ready.',
          color: '#8be9fd',
        });
      } else if (ev.type === 'gearForged') {
        const def = gearDef(ev.gearId);
        fresh.push({
          key: entry.seq,
          title: `Fitted: ${def.name} (${ev.purity}%)`,
          body: def.flavor,
          color: '#d4a86a',
        });
      } else if (ev.type === 'guildOpened') {
        fresh.push({
          key: entry.seq,
          title: 'THE STAIR IS OPEN',
          body: 'Lamplight above the winch-house — voices, stew, other people. The Guild has been waiting.',
          color: '#e0b054',
        });
      } else if (ev.type === 'npcsArrived') {
        if (ev.gate !== 'open') {
          fresh.push({
            key: entry.seq,
            title: 'New faces at the Lamphouse',
            body: `${ev.count} more came up the road. The hall is louder tonight.`,
            color: '#e0b054',
          });
        }
      } else if (ev.type === 'fragmentFound') {
        const f = fragmentDef(ev.id);
        fresh.push({
          key: entry.seq,
          title: `A page in the rock — p.${f.page}`,
          body: f.legibility === 'ciphered' ? 'Her hand, but in cipher. Old Quill will want to see this.' : 'Sable\'s hand. The Journal keeps it; read it when you like.',
          color: '#c9a86a',
        });
      } else if (ev.type === 'fragmentTranslated') {
        const f = fragmentDef(ev.id);
        fresh.push({ key: entry.seq, title: `Quill reads p.${f.page}`, body: `"${f.heading}" — it waits in the Journal.`, color: '#c9a86a' });
      } else if (ev.type === 'contractDone') {
        fresh.push({
          key: entry.seq,
          title: 'Contract honored',
          body: `${npcDef(ev.npcId).name} pays ${ev.scrip} Scrip. The board turns.`,
          color: '#c9a86a',
        });
      } else if (ev.type === 'questAdvanced') {
        fresh.push({
          key: entry.seq,
          title: `${npcDef(ev.npcId).name} nods`,
          body: 'Their asking moves forward. See them at the hall.',
          color: '#e0b054',
        });
      } else if (ev.type === 'repTier') {
        fresh.push({
          key: entry.seq,
          title: `${REP_TIER_NAMES[ev.tier]} to ${npcDef(ev.npcId).name}`,
          body: ev.tier >= 3 ? 'They would take a wall down for you.' : 'The hall remembers who shows up.',
          color: '#e0b054',
        });
      } else if (ev.type === 'titleEarned') {
        const t = titleDef(ev.id);
        fresh.push({ key: entry.seq, title: `A name earned: ${t.name}`, body: `${t.flavor} (${t.effect} — see Sal's book.)`, color: '#e0b054' });
      } else if (ev.type === 'hired') {
        fresh.push({ key: entry.seq, title: `${npcDef(ev.npcId).name} signs on`, body: 'A berth filled in the crew loft.', color: '#c9a86a' });
      } else if (ev.type === 'weatherChanged') {
        fresh.push({ key: entry.seq, title: ev.name, body: `${ev.blurb} (Weather only ever helps.)`, color: '#cfe89a' });
      } else if (ev.type === 'seedFound') {
        fresh.push({ key: entry.seq, title: 'A seed in the bloom', body: `${greenStrainName(ev.speciesId)} — the Greenhouse can raise it.`, color: '#9ee07a' });
      } else if (ev.type === 'hybridBred') {
        fresh.push({ key: entry.seq, title: `Bred true: ${greenStrainName(ev.id)}`, body: 'A strain nobody has grown before. The green book learns it.', color: '#cfe89a' });
      } else if (ev.type === 'brewDiscovered') {
        fresh.push({ key: entry.seq, title: `The still yields: ${brewName(ev.id)}`, body: 'Two doses bottled. Spikes, not sustains — save it for a moment.', color: '#d9b64a' });
      } else if (ev.type === 'shapeWoven') {
        fresh.push({ key: entry.seq, title: 'A shape in the weave', body: 'The knots made a figure. The Loom remembers it now.', color: '#b8d09a' });
      } else if (ev.type === 'temporalFound') {
        fresh.push({ key: entry.seq, title: `A slow carving completes: ${ev.name}`, body: 'Runes cut into the same tool across long stretches finally spoke together. The slowest thing you can find, and now it is yours.', color: '#c8a35a' });
      } else if (ev.type === 'gemFused') {
        fresh.push({ key: entry.seq, title: 'Duplicates fused', body: 'Two of the same gem went into a cleaner cut for the type — never worse than before.', color: '#9ab8d0' });
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
            body: 'You cut a shape into the face and it answered — XP, a better chance at a drop, and your sweep-arm back. The Codex keeps it.',
            color: '#e6c15a',
          });
        }
      } else if (ev.type === 'myceliumSpread') {
        if (ev.auto) fresh.push({ key: entry.seq, title: 'The thread wanders', body: 'The fed mycelium took another site on its own.', color: '#9ee07a' });
      } else if (ev.type === 'assayComplete') {
        fresh.push({ key: entry.seq, title: `Assay complete: depth ${ev.depth}`, body: 'The vein is marked. Drops doubled for a while — see the Hold.', color: '#9ab87a' });
      } else if (ev.type === 'observationDone') {
        fresh.push({ key: entry.seq, title: 'The plate is read', body: `Spectrum banked; ${ev.pieces} chart piece${ev.pieces === 1 ? '' : 's'} placed in the sky.`, color: '#d8b8ee' });
      } else if (ev.type === 'constellation') {
        const con = CONSTELLATIONS.find((c) => c.id === ev.id);
        fresh.push({ key: entry.seq, title: `A sky closes: ${con?.name ?? ev.id}`, body: `${con?.bonus.label ?? ''} — permanent, like stars.`, color: '#e8d8f8' });
      } else if (ev.type === 'lensGround') {
        fresh.push({ key: entry.seq, title: `Ground and kept: ${lensFor(ev.puzzleId).name}`, body: 'The solution is a possession now. Equip it at the Bench.', color: '#bcd8ee' });
      } else if (ev.type === 'warrenCleared') {
        fresh.push({ key: entry.seq, title: `${warrenName(ev.warrenId)} cleared`, body: 'The keeper yields; the tunnel keeps its materials stocked.', color: '#bcd8ee' });
      } else if (ev.type === 'warrenUnique') {
        fresh.push({ key: entry.seq, title: 'A thing that exists nowhere else', body: ev.note, color: '#e8f4ff' });
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
      } else if (ev.type === 'crewRecalled') {
        fresh.push({ key: entry.seq, title: 'Crew recalled', body: 'Everyone off the floor. Nothing works, nobody dies. They restation under 70 heat.', color: '#c9a86a' });
      } else if (ev.type === 'crewRestationed') {
        fresh.push({ key: entry.seq, title: 'The crew files back down', body: 'The shaft cooled; the berths refill on their own.', color: '#c9a86a' });
      } else if (ev.type === 'arrayBest') {
        fresh.push({ key: entry.seq, title: `A steadier fire: ${Math.floor(ev.seconds / 60)}m${ev.seconds % 60}s`, body: 'Your best sustained burn. Records do not cool.', color: '#ffb36a' });
      } else if (ev.type === 'wellResult') {
        fresh.push({
          key: entry.seq,
          title: ev.mult === 0 ? 'The well keeps it' : `The well pays ×${ev.mult}`,
          body: ev.mult === 0 ? `${fmt(ev.amount)} gone where the rope goes. The odds said this, out loud.` : `${fmt(ev.amount.mul(ev.mult))} up the rope. The posted odds, honored.`,
          color: ev.mult === 0 ? '#8a7f70' : '#ffb36a',
        });
      } else if (ev.type === 'anomalyAnswered') {
        fresh.push({ key: entry.seq, title: ANOMALY_BY_ID.get(ev.id)?.name ?? 'An anomaly', body: ev.line, color: '#c9a8e8' });
      } else if (ev.type === 'anomalySettled') {
        fresh.push({ key: entry.seq, title: 'It settled', body: ANOMALY_BY_ID.get(ev.id)?.settleLine ?? 'The strangeness kept to itself.', color: '#8a7f70' });
      } else if (ev.type === 'hirelingLost') {
        fresh.push({ key: entry.seq, title: `${npcDef(ev.npcId).name} is gone`, body: 'The flood took the longest-serving hand still on the floor. The hall will hold a wake.', color: '#e07a6a' });
      } else if (ev.type === 'silenceHarvest') {
        fresh.push({ key: entry.seq, title: 'You listened', body: `${ev.stacks.toFixed(0)} stacks of quiet, farmed into ${fmt(ev.voidGained)} Void.`, color: '#b8b0e0' });
      } else if (ev.type === 'cellRebuilt') {
        fresh.push({ key: entry.seq, title: `A cell remembers being rock`, body: `${ev.total} of the face rebuilt. Light returning, one cell at a time.`, color: '#c8bfe8' });
      } else if (ev.type === 'faceWhole') {
        fresh.push({ key: entry.seq, title: 'The face is whole', body: 'You have rebuilt the world you started with. The stair to the Core is open.', color: '#e8d8f8' });
      } else if (ev.type === 'coreTouched') {
        fresh.push({ key: entry.seq, title: 'The Core', body: 'A desk. A chair. A pen, offered. Recursion waits at the Rewrite.', color: '#e8d88c' });
      } else if (ev.type === 'recursion') {
        fresh.push({ key: entry.seq, title: `Recursion ${ev.count}`, body: `The world begins again, and you do not. +${ev.axiomsGained} Axiom${ev.axiomsGained === 1 ? '' : 's'} to rewrite it with.`, color: '#f0e6a8' });
      } else if (ev.type === 'axiomBought') {
        const a = AXIOM_BY_ID.get(ev.id);
        fresh.push({ key: entry.seq, title: `Written: ${a?.name ?? ev.id}`, body: ev.heresy ? 'A deliberate heresy. The face will announce it.' : (a?.felt ?? 'A rule, rewritten. Permanently.'), color: ev.heresy ? '#e07a6a' : '#f0e6a8' });
      }
    }
    if (fresh.length > 0) {
      setToasts((t) => [...t, ...fresh].slice(-4));
      const keys = fresh.map((f) => f.key);
      window.setTimeout(() => {
        setToasts((t) => t.filter((x) => !keys.includes(x.key)));
      }, 4200);
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
