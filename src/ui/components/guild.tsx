/**
 * THE LAMPHOUSE — the only warm, populated place in the game. Wood, lamplight
 * and other people, rendered in the same procedural-geometric language as the
 * rock below: portraits are parameter-drawn SVG, not sprites, and every one
 * of the thirty reads as an individual.
 */
import { useState } from 'react';
import { getCurrency } from '../../engine';
import type { GameState } from '../../engine';
import {
  CHARTER_SINKS,
  moodOf,
  npcLine,
  onFloor,
  presentNpcs,
  priceFactor,
  QUESTLINES,
  sellPrice,
  stockFor,
} from '../../engine/guild/guild';
import { npcDef, REP_TIER_NAMES, REP_TIERS, repTier, type NpcDef, type PortraitDef } from '../../engine/guild/npcs';
import { contractProgress } from '../../engine/guild/contracts';
import { HIRELING_BY_NPC, hireCost, hiredCount } from '../../engine/guild/hirelings';
import { caravanUnlocked, drift, effectiveFee, routesAvailable } from '../../engine/guild/caravan';
import { TITLES, TITLE_BY_ID } from '../../engine/guild/titles';
import { materialsOfShell } from '../../engine/materials';
import { materialCount } from '../../engine/systems/forge';
import { ModifierCache } from '../../engine/modifiers';
import { dispatch, useGame } from '../store';
import { Amount } from './shared';
import { MaterialIcon } from './MaterialIcon';

const uiMods = new ModifierCache();
function previewMods(): ModifierCache {
  uiMods.invalidate();
  return uiMods;
}

// ---------------------------------------------------------------------------
// Portraits — thirty individuals from one grammar.
// ---------------------------------------------------------------------------

export function Portrait({ p, size = 44, dim = false }: { p: PortraitDef; size?: number; dim?: boolean }) {
  const garb = `hsl(${p.hue} 38% 34%)`;
  const garbDark = `hsl(${p.hue} 40% 24%)`;
  const skin = `hsl(${(p.hue + 40) % 360} 25% 62%)`;
  const line = '#1c1815';
  return (
    <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden style={dim ? { opacity: 0.45 } : undefined}>
      <circle cx="24" cy="24" r="23" fill="#241f1b" stroke="#4a4239" />
      {/* shoulders */}
      <path d="M8 46 Q24 30 40 46 Z" fill={garb} stroke={line} />
      {/* head */}
      <circle cx="24" cy="21" r="10.5" fill={skin} stroke={line} />
      {/* hats */}
      {p.hat === 'hood' && <path d="M11 26 Q10 6 24 6 Q38 6 37 26 Q31 12 24 12 Q17 12 11 26 Z" fill={garbDark} stroke={line} />}
      {p.hat === 'cap' && (
        <g fill={garbDark} stroke={line}>
          <path d="M13 15 Q24 4 35 15 L35 18 L13 18 Z" />
          <rect x="30" y="15" width="10" height="3" rx="1.5" />
        </g>
      )}
      {p.hat === 'helm' && (
        <g fill="#5a6572" stroke={line}>
          <path d="M13 20 Q13 7 24 7 Q35 7 35 20 L35 22 L13 22 Z" />
          <rect x="15" y="16" width="18" height="2.4" fill={line} />
        </g>
      )}
      {p.hat === 'scarf' && (
        <g fill={garbDark} stroke={line}>
          <path d="M12 17 Q24 5 36 17 L36 20 L12 20 Z" />
          <path d="M33 18 q6 4 4 12" fill="none" strokeWidth="3" stroke={garbDark} />
        </g>
      )}
      {p.hat === 'braids' && (
        <g stroke={line}>
          <path d="M13 18 Q24 6 35 18 L35 15 Q24 4 13 15 Z" fill={garbDark} />
          <path d="M13 18 q-2 10 1 16 M35 18 q2 10 -1 16" fill="none" strokeWidth="3.4" stroke={garbDark} />
        </g>
      )}
      {p.hat === 'wild' && (
        <path d="M12 20 L10 10 L16 14 L17 6 L22 12 L26 4 L29 12 L34 6 L34 14 L39 10 L36 20 Q24 10 12 20 Z" fill={garbDark} stroke={line} />
      )}
      {p.hat === 'bald' && <path d="M14 16 Q24 8 34 16" fill="none" stroke={line} strokeWidth="0.8" opacity="0.5" />}
      {/* eyes */}
      {p.eyes === 'dot' && (
        <g fill={line}>
          <circle cx="20" cy="21" r="1.4" />
          <circle cx="28" cy="21" r="1.4" />
        </g>
      )}
      {p.eyes === 'slit' && (
        <g fill={line}>
          <rect x="17.6" y="20.2" width="4.6" height="1.5" rx="0.7" />
          <rect x="25.8" y="20.2" width="4.6" height="1.5" rx="0.7" />
        </g>
      )}
      {p.eyes === 'wide' && (
        <g>
          <circle cx="20" cy="21" r="2.6" fill="#efe7d8" stroke={line} strokeWidth="0.7" />
          <circle cx="28" cy="21" r="2.6" fill="#efe7d8" stroke={line} strokeWidth="0.7" />
          <circle cx="20.4" cy="21.3" r="1.1" fill={line} />
          <circle cx="27.6" cy="21.3" r="1.1" fill={line} />
        </g>
      )}
      {p.eyes === 'spect' && (
        <g stroke={line} fill="none">
          <circle cx="20" cy="21" r="3" fill="#cfd8dd44" />
          <circle cx="28" cy="21" r="3" fill="#cfd8dd44" />
          <path d="M23 21 L25 21 M11 19 L17 20.4 M37 19 L31 20.4" />
          <circle cx="20" cy="21" r="0.9" fill={line} stroke="none" />
          <circle cx="28" cy="21" r="0.9" fill={line} stroke="none" />
        </g>
      )}
      {p.eyes === 'patch' && (
        <g>
          <circle cx="20" cy="21" r="1.4" fill={line} />
          <rect x="25" y="18.4" width="6.4" height="4.6" rx="1" fill={line} />
          <path d="M13 16 L26 18.6 M31.4 19 L37 17" stroke={line} strokeWidth="1" />
        </g>
      )}
      {/* extras */}
      {p.extra === 'beard' && <path d="M16 24 Q24 36 32 24 Q30 32 24 33 Q18 32 16 24 Z" fill={garbDark} stroke={line} strokeWidth="0.6" />}
      {p.extra === 'earring' && <circle cx="33.6" cy="25.8" r="1.5" fill="none" stroke="#e0b054" strokeWidth="1" />}
      {p.extra === 'scar' && <path d="M27 14.5 L30.5 26" stroke="#8a5a50" strokeWidth="1.2" />}
      {p.extra === 'mask' && <rect x="17" y="24.5" width="14" height="4.5" rx="2" fill={garbDark} stroke={line} strokeWidth="0.6" />}
      {p.extra === 'moth' && (
        <g fill="#c9b8d8" opacity="0.9">
          <path d="M36 12 l-2.6 -1.8 l0.4 3 z M36 12 l2.6 -1.8 l-0.4 3 z" />
        </g>
      )}
      {p.extra === 'chain' && <path d="M14 40 q10 -4 20 0" fill="none" stroke="#8a97a8" strokeWidth="1.6" strokeDasharray="2.5 1.8" />}
    </svg>
  );
}

const MOOD_GLYPH: Record<string, { glyph: string; color: string; title: string }> = {
  bright: { glyph: '▲', color: '#e0b054', title: 'in a bright mood' },
  level: { glyph: '●', color: '#8a7f70', title: 'about usual' },
  sour: { glyph: '▼', color: '#7c8ede', title: 'in a sour mood — just talk' },
};

// ---------------------------------------------------------------------------
// The panel
// ---------------------------------------------------------------------------

export function GuildPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [selected, setSelected] = useState<string | null>(null);
  if (!state) return null;
  if (!state.guild.discovered) {
    return (
      <div className="panel guild-warm p-4 text-center text-xs italic text-cave-400">
        There is an old stair behind the winch-house, choked with rubble. Something up there smells
        of bread and lamp-oil. Perhaps a collapse would shake it loose.
      </div>
    );
  }
  const npcs = presentNpcs(state);
  const chosen = selected && npcs.some((n) => n.id === selected) ? npcDef(selected) : null;

  return (
    <div className="space-y-2">
      {/* The hearth bar */}
      <div className="panel guild-warm p-3">
        <div className="flex items-baseline justify-between">
          <span className="font-display text-sm font-semibold text-[#e8c98a]">Your standing</span>
          <span className="tnum text-[10px] text-cave-300">
            Renown <Amount value={getCurrency(state, 'renown')} color="#e0b054" /> · Scrip{' '}
            <Amount value={getCurrency(state, 'scrip')} color="#c9a86a" />
            {getCurrency(state, 'charter').gte(1) && (
              <>
                {' '}· Charter <Amount value={getCurrency(state, 'charter')} color="#d8ccf0" />
              </>
            )}
          </span>
        </div>
        <div className="mt-0.5 text-[10px] italic text-cave-400">
          Lamplight, wood, stew, and {npcs.length} people who know your name. The rock can wait a minute.
        </div>
        {/* The hall */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {npcs.map((n) => {
            const away = !onFloor(state, n.id);
            return (
              <button
                key={n.id}
                className={`relative rounded-lg border p-0.5 transition-colors ${
                  selected === n.id ? 'border-[#e0b054] bg-cave-800' : 'border-transparent hover:border-cave-600'
                }`}
                title={`${n.name} — ${n.role}${away ? ' (in the back; the stall still serves)' : ''}`}
                onClick={() => setSelected(selected === n.id ? null : n.id)}
              >
                <Portrait p={n.portrait} size={40} dim={away} />
                <span
                  className="absolute -right-0.5 -top-0.5 text-[8px]"
                  style={{ color: MOOD_GLYPH[moodOf(state, n.id)]!.color }}
                  title={MOOD_GLYPH[moodOf(state, n.id)]!.title}
                >
                  {MOOD_GLYPH[moodOf(state, n.id)]!.glyph}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {chosen && <NpcCard state={state} def={chosen} />}
      <ContractsBoard state={state} />
      <CaravanCard state={state} />
      <CrewCard state={state} />
      <TitlesCard state={state} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// One person, up close.
// ---------------------------------------------------------------------------

function NpcCard({ state, def }: { state: Readonly<GameState>; def: NpcDef }) {
  const [stance, setStance] = useState<'fair' | 'press' | 'lowball'>('fair');
  const [note, setNote] = useState<string | null>(null);
  const n = state.guild.npcs[def.id] ?? { rep: 0, met: false, questStep: 0 };
  const tier = repTier(n.rep);
  const nextAt = REP_TIERS[tier + 1];
  const stock = stockFor(state, def.id);
  const away = !onFloor(state, def.id);
  const quest = def.questline ? QUESTLINES[def.id] : undefined;
  const hd = def.hireable ? HIRELING_BY_NPC.get(def.id) : undefined;
  const hired = !!state.guild.hirelings[def.id];
  const factor = priceFactor(state, def.id);

  return (
    <div className="panel guild-warm p-3">
      <div className="flex items-start gap-3">
        <Portrait p={def.portrait} size={64} dim={away} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-[#e8c98a]">{def.name}</span>
            <span className="text-[9px] uppercase tracking-wider text-cave-400">{def.role}</span>
            <span className="text-[9px] uppercase tracking-wider" style={{ color: tier >= 3 ? '#e0b054' : '#8a7f70' }}>
              {REP_TIER_NAMES[tier]}
            </span>
            {away && <span className="text-[9px] italic text-cave-400">in the back — Cully minds the stall</span>}
          </div>
          <div className="mt-1 text-[11px] italic leading-snug text-cave-300">“{npcLine(state, def.id)}”</div>
          {/* rep bar */}
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full border border-cave-700 bg-cave-950">
            <div
              className="h-full bg-[#e0b054]/70"
              style={{ width: nextAt ? `${Math.min(100, (n.rep / nextAt) * 100)}%` : '100%' }}
            />
          </div>
          {nextAt !== undefined && (
            <div className="tnum mt-0.5 text-[9px] text-cave-400">
              {Math.floor(n.rep)} / {nextAt} toward {REP_TIER_NAMES[tier + 1]}
            </div>
          )}
        </div>
      </div>

      {/* Vess's stances */}
      {def.id === 'vess' && stock.length > 0 && (
        <div className="mt-2 flex items-center gap-1.5 text-[10px]">
          <span className="text-cave-400">Approach:</span>
          {(['fair', 'press', 'lowball'] as const).map((st) => (
            <button
              key={st}
              className={`btn px-2 py-0.5 text-[10px] ${stance === st ? 'btn-warm' : ''}`}
              title={st === 'fair' ? 'Pay the ask. She remembers that too.' : st === 'press' ? 'Push a little. Usually fine.' : 'Lowball her. She NEVER forgets a lowball.'}
              onClick={() => setStance(st)}
            >
              {st}
            </button>
          ))}
          {state.guild.vess.grudge >= 1 && (
            <span className="ml-auto text-[9px] italic text-[#c96f4a]">her ledger remembers {Math.floor(state.guild.vess.grudge)} slight{state.guild.vess.grudge >= 2 ? 's' : ''}</span>
          )}
        </div>
      )}

      {/* Stock */}
      {stock.length > 0 && (
        <div className="mt-2 space-y-1">
          {stock.map((slot, i) => {
            const bought = state.guild.stock.bought[slot.key] ?? 0;
            const left = slot.qty - bought;
            const price = Math.max(1, Math.round(slot.price * factor));
            return (
              <div key={slot.key} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="flex min-w-0 items-center gap-1.5 truncate text-cave-200">
                  {slot.kind === 'material' && <MaterialIcon id={slot.id} size={16} />}
                  {slot.label}
                  <span className="tnum text-[9px] text-cave-400">×{left}</span>
                </span>
                <button
                  className="btn shrink-0 px-2 py-0.5 text-[10px]"
                  disabled={left <= 0 || getCurrency(state, 'scrip').lt(price)}
                  onClick={() => {
                    const r = dispatch({ type: 'buyStock', npcId: def.id, slot: i, stance: def.id === 'vess' ? stance : undefined });
                    if (r.ok) setNote((r.data as { haggleNote: string | null }).haggleNote);
                  }}
                >
                  {left <= 0 ? 'sold out' : <>~{price} Scrip</>}
                </button>
              </div>
            );
          })}
          {note && <div className="text-[10px] italic text-cave-400">{note}</div>}
        </div>
      )}

      {/* Buying (Vess: ore · Ashka: what bit you) */}
      {def.stall?.buys && <SellRow state={state} buys={def.stall.buys} />}

      {/* Questline */}
      {quest && (
        <div className="mt-2 border-t border-cave-800/70 pt-2">
          <div className="text-[9px] uppercase tracking-widest text-cave-400">
            {def.name} wants · favour {Math.min(n.questStep, quest.length)} of {quest.length}
          </div>
          {n.questStep < quest.length ? (
            <div className="mt-0.5 text-[11px] text-cave-200">{quest[n.questStep]!.note}</div>
          ) : (
            <div className="mt-0.5 text-[11px] italic text-[#9fd8c0]">Nothing more — only the friendship.</div>
          )}
        </div>
      )}

      {/* Hiring */}
      {hd && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-cave-800/70 pt-2">
          <div className="min-w-0 text-[10px] text-cave-400">
            <span className="font-semibold text-cave-200">{hd.title}</span> — {hd.desc}
          </div>
          {hired ? (
            <span className="shrink-0 text-[9px] uppercase tracking-widest text-[#e0b054]">on the crew</span>
          ) : (
            <button
              className="btn shrink-0 px-2 py-1 text-[10px]"
              disabled={getCurrency(state, 'scrip').lt(hireCost(state, hd)) || hiredCount(state) >= state.guild.berths}
              title={hiredCount(state) >= state.guild.berths ? 'No free berth — Nan Verge sells the forms' : undefined}
              onClick={() => dispatch({ type: 'hire', npcId: def.id })}
            >
              Sign on · {hireCost(state, hd)} Scrip
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SellRow({ state, buys }: { state: Readonly<GameState>; buys: 'ore' | 'combat' }) {
  const shellId = state.shell.current;
  const sellable = (buys === 'combat'
    ? [...materialsOfShell('loam'), ...materialsOfShell('ferrite')].filter((m) => m.source === 'combat')
    : materialsOfShell(shellId).filter((m) => !m.source)
  ).filter((m) => materialCount(state, m.id) > 0);
  if (sellable.length === 0) return null;
  return (
    <div className="mt-2 border-t border-cave-800/70 pt-2">
      <div className="text-[9px] uppercase tracking-widest text-cave-400">
        {buys === 'combat' ? 'She buys what bit you' : 'She buys ore, five at a time'}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {sellable.slice(0, 8).map((m) => {
          const count = Math.min(5, materialCount(state, m.id));
          const { total } = sellPrice(state, previewMods(), m.id, count);
          return (
            <button
              key={m.id}
              className="btn flex items-center gap-1 px-1.5 py-0.5 text-[10px]"
              title={`Sell ${count} ${m.name} for ${total} Scrip`}
              onClick={() => dispatch({ type: 'sellMaterial', materialId: m.id, count })}
            >
              <MaterialIcon id={m.id} size={14} />
              <span className="tnum">×{count} → {total}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The board — no deadlines, ever. Rotate on completion or by choice.
// ---------------------------------------------------------------------------

function ContractsBoard({ state }: { state: Readonly<GameState> }) {
  const { board, slots, completed } = state.guild.contracts;
  return (
    <div className="panel guild-warm p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e8c98a]">The Board</span>
        <span className="tnum text-[10px] text-cave-400">{completed} jobs done · no job expires</span>
      </div>
      <div className="mt-1.5 space-y-1.5">
        {Array.from({ length: slots }, (_, i) => {
          const c = board[i];
          if (!c) {
            return (
              <div key={i} className="rounded-md border border-dashed border-cave-700 p-2 text-center text-[10px] italic text-cave-400">
                A bare peg. Someone will pin something soon.
              </div>
            );
          }
          const { have, need } = contractProgress(state, c);
          const done = have >= need;
          return (
            <div key={c.id} className={`rounded-md border p-2 ${done && c.accepted ? 'border-[#e0b054]/60' : 'border-cave-700'}`}>
              <div className="text-[11px] leading-snug text-cave-200">{c.desc}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="tnum text-[10px] text-cave-400">
                  {c.accepted ? `${Math.max(0, Math.floor(have))} / ${need}` : `pays ${c.scrip} Scrip · ${c.renown} Renown`}
                </span>
                <span className="flex gap-1">
                  {!c.accepted && (
                    <button className="btn px-2 py-0.5 text-[10px] btn-warm" onClick={() => dispatch({ type: 'acceptContract', slot: i })}>
                      Take it
                    </button>
                  )}
                  {c.accepted && done && (
                    <button className="btn btn-warm px-2 py-0.5 text-[10px]" onClick={() => dispatch({ type: 'completeContract', slot: i })}>
                      Turn in · {c.scrip}
                    </button>
                  )}
                  <button
                    className="btn px-2 py-0.5 text-[10px] opacity-60 hover:opacity-100"
                    title="Forget it — free, always. The board rotates when YOU choose."
                    onClick={() => dispatch({ type: 'rerollContract', slot: i })}
                  >
                    Forget it
                  </button>
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The road.
// ---------------------------------------------------------------------------

function CaravanCard({ state }: { state: Readonly<GameState> }) {
  if (!state.guild.discovered) return null;
  if (!caravanUnlocked(state)) {
    return (
      <div className="panel guild-warm p-3 text-[10px] italic text-cave-400">
        Serra&apos;s wagons stand in the yard, wheels chocked. “One market is a shop,” she says.
        “Two markets are a road.” The road wants a Breach.
      </div>
    );
  }
  const fee = effectiveFee(state);
  return (
    <div className="panel guild-warm p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e8c98a]">Serra&apos;s Caravan</span>
        <span className="tnum text-[10px] text-cave-400">
          fee {(fee * 100).toFixed(0)}% · {state.guild.caravan.trades} loads · rates drift; holdings never rot
        </span>
      </div>
      <div className="mt-1.5 space-y-1">
        {routesAvailable(state).map((route) => {
          const d = drift(state, route);
          const hot = d > 1.06;
          const cold = d < 0.94;
          return (
            <div key={route.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="min-w-0 truncate text-cave-200">
                {route.label}{' '}
                <span
                  className="tnum text-[9px]"
                  style={{ color: hot ? '#9ab87a' : cold ? '#7c8ede' : '#8a7f70' }}
                  title={hot ? 'The drift favors this leg right now' : cold ? 'A lean leg — it will swing back' : 'About fair'}
                >
                  {hot ? '▲ good rate' : cold ? '▼ lean' : '— fair'}
                </span>
              </span>
              <button
                className={`btn shrink-0 px-2 py-0.5 text-[10px] ${hot ? 'btn-warm' : ''}`}
                onClick={() => dispatch({ type: 'caravanTrade', route: route.id, amount: 0.25 })}
              >
                Send a quarter
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The crew loft.
// ---------------------------------------------------------------------------

function CrewCard({ state }: { state: Readonly<GameState> }) {
  const crew = Object.entries(state.guild.hirelings);
  const charter = getCurrency(state, 'charter');
  if (crew.length === 0 && charter.lt(1)) return null;
  return (
    <div className="panel guild-warm p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e8c98a]">The Crew Loft</span>
        <span className="tnum text-[10px] text-cave-400">{crew.length} / {state.guild.berths} berths</span>
      </div>
      <div className="mt-1.5 space-y-1.5">
        {crew.map(([npcId, h]) => {
          const def = npcDef(npcId);
          const hd = HIRELING_BY_NPC.get(npcId);
          return (
            <div key={npcId} className="flex items-center gap-2">
              <Portrait p={def.portrait} size={34} />
              <div className="min-w-0 flex-1">
                <span className="text-[11px] font-semibold text-cave-200">{def.name}</span>
                <span className="ml-1.5 text-[9px] uppercase tracking-wider text-cave-400">
                  {hd?.title} · L{h.level}
                </span>
                <div className="truncate text-[9px] italic text-cave-400">“{hd?.bark}”</div>
              </div>
              {h.status !== 'well' && <span className="text-[9px] text-[#c96f4a]">bruised</span>}
            </div>
          );
        })}
      </div>
      {charter.gte(1) && (
        <div className="mt-2 flex flex-wrap gap-1.5 border-t border-cave-800/70 pt-2">
          {Object.entries(CHARTER_SINKS).map(([sink, def]) => (
            <button
              key={sink}
              className="btn px-2 py-1 text-[10px]"
              disabled={(state.guild.charterSpent[sink] ?? 0) >= def.max}
              onClick={() => dispatch({ type: 'spendCharter', sink: sink as 'berth' | 'boardSlot' })}
            >
              {def.label} · 1 <span style={{ color: '#d8ccf0' }}>Charter</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sal's book of names.
// ---------------------------------------------------------------------------

function TitlesCard({ state }: { state: Readonly<GameState> }) {
  const [open, setOpen] = useState(false);
  const earned = state.guild.titles.earned;
  if (earned.length === 0) return null;
  const wearing = state.guild.titles.equipped ? TITLE_BY_ID.get(state.guild.titles.equipped) : null;
  return (
    <div className="panel guild-warm p-3">
      <div className="flex items-baseline justify-between">
        <button className="text-left text-xs font-semibold uppercase tracking-wider text-[#e8c98a]" onClick={() => setOpen((o) => !o)}>
          Sal&apos;s Book of Names {open ? '▾' : '▸'}
        </button>
        <span className="tnum text-[10px] text-cave-400">
          {earned.length} / {TITLES.length} earned
        </span>
      </div>
      <div className="mt-1 text-[11px] text-cave-200">
        Wearing:{' '}
        {wearing ? (
          <span className="font-semibold text-[#e0b054]">{wearing.name}</span>
        ) : (
          <span className="italic text-cave-400">no name yet — choosing one is choosing a build</span>
        )}
        {wearing && <span className="ml-1.5 text-[10px] text-[#9fd8c0]">{wearing.effect}</span>}
      </div>
      {open && (
        <div className="mt-1.5 max-h-56 space-y-1 overflow-y-auto pr-1 scroll-thin">
          {earned.map((id) => {
            const t = TITLE_BY_ID.get(id)!;
            const on = state.guild.titles.equipped === id;
            return (
              <button
                key={id}
                className={`w-full rounded-md border p-1.5 text-left ${on ? 'border-[#e0b054]/70 bg-cave-800' : 'border-cave-700 hover:border-cave-600'}`}
                onClick={() => dispatch({ type: 'equipTitle', titleId: on ? null : id })}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-[11px] font-semibold text-cave-200">{t.name}</span>
                  <span className="text-[9px] text-[#9fd8c0]">{t.effect}</span>
                </div>
                <div className="text-[9px] italic text-cave-400">{t.flavor}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
