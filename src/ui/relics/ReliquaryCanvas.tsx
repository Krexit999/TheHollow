/**
 * THE RELIQUARY, mounted — the canvas plus everything that has to be words.
 *
 * The Shaft's shape: the rendered place fills the region, a thin readout sits
 * over the top corner, an action row sits at the bottom, and anything that
 * needs sentences arrives as a sheet over the canvas. Every action dispatches
 * the same engine call the old panel did — this is a presentation rebuild plus
 * two new verbs (auto-scrap, and mounting into a chosen niche).
 *
 * ONE HOST FOR BOTH TABS. Relics and the Museum share a Pixi application (see
 * ReliquaryView), so this component stays mounted for both and swaps the
 * scene. That is also why it must never be conditionally rendered by tab:
 * unmounting it would destroy a renderer under the live Face.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameState, RelicInstance } from '../../engine';
import { getCurrency } from '../../engine';
import {
  RARITIES, RELIC_SLOTS, AFFIXES, SOURCE_BY_ID, fusionPreview, fusionAfford,
  activeResonances, holdCap, shardValue, effectiveAffixes,
  wakingOf, wakingStep, wakingNeed,
} from '../../engine/systems/relics';
import { powerOf, powerLive, KIND_NAME } from '../../engine/systems/relicPowers';
import { CASES, EXHIBITS, activeExhibits, caseProgress } from '../../engine/systems/museum';
import { BUCKET_NAME } from '../components/shared';
import { dispatch, useGame } from '../store';
import { ReliquaryView, type CarvedLabel, type ReliquaryHit } from './ReliquaryView';

type Sheet =
  | { kind: 'relic'; uid: number }
  | { kind: 'pick'; slot: number }
  | { kind: 'fuse'; keepUid: number }
  | { kind: 'slot'; uid: number }
  | { kind: 'scrap' }
  | { kind: 'halls' }
  | null;

export function ReliquaryCanvas({ mode, active }: { mode: 'relics' | 'museum'; active: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<ReliquaryView | null>(null);
  const engine = useGame((s) => s.engine);
  const reducedMotion = useGame((s) => s.reducedMotion);
  const setTab = useGame((s) => s.setTab);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [labels, setLabels] = useState<CarvedLabel[]>([]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !engine) return;
    let view: ReliquaryView | null = null;
    let cancelled = false;
    void ReliquaryView.create(
      host, engine, reducedMotion,
      (hit: ReliquaryHit | null) => {
        if (!hit) { setSheet(null); return; }
        if (hit.kind === 'niche') setSheet(hit.uid === null ? { kind: 'pick', slot: hit.slot } : { kind: 'relic', uid: hit.uid });
        else if (hit.kind === 'held') setSheet({ kind: 'relic', uid: hit.uid });
        else if (hit.uid !== null) setSheet({ kind: 'relic', uid: hit.uid });
      },
      setLabels,
    ).then((v) => {
      if (cancelled) v.destroy();
      else {
        view = v; viewRef.current = v;
        v.setMode(mode); v.setActive(active);
        if (import.meta.env.DEV) (window as unknown as { __reliquary?: unknown }).__reliquary = v;
      }
    });
    return () => { cancelled = true; view?.destroy(); viewRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, reducedMotion]);

  useEffect(() => { viewRef.current?.setMode(mode); setSheet(null); }, [mode]);
  useEffect(() => { viewRef.current?.setActive(active); if (!active) setSheet(null); }, [active]);

  const showInGallery = (uid: number) => {
    setSheet(null);
    setTab('museum');
    // The scene swap runs on the next tick; focus after it.
    setTimeout(() => viewRef.current?.focusRelic(uid), 60);
  };

  return (
    <div
      // Short enough on a phone that the action row clears the bottom nav —
      // at 62vh the row and the curator sat behind it until you scrolled.
      className="relative h-[50vh] min-h-[300px] w-full overflow-hidden rounded-xl border border-cave-700 bg-black lg:h-[68vh]"
      aria-label={mode === 'relics' ? 'The reliquary wall' : 'The gallery'}
    >
      <div ref={hostRef} className="absolute inset-0" style={{ touchAction: 'none' }} />
      {mode === 'museum' && <CarvedNames labels={labels} />}
      <Hud mode={mode} onSheet={setSheet} />
      {sheet && (
        <SheetHost onClose={() => setSheet(null)}>
          <SheetBody sheet={sheet} setSheet={setSheet} showInGallery={showInGallery} />
        </SheetHost>
      )}
    </div>
  );
}

/** The names the hall carves over a set that is standing. HTML, so the serif
 *  small-caps stay crisp — the same call the Shaft's depth ruler makes. */
function CarvedNames({ labels }: { labels: CarvedLabel[] }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-[5] overflow-hidden">
      {labels.map((l) => (
        <div
          key={l.id}
          className="carve absolute -translate-x-1/2 -translate-y-full whitespace-nowrap text-center"
          style={{ left: l.x, top: l.y, textShadow: '0 1px 6px #000, 0 0 14px #000' }}
        >
          <div className="font-serif text-[12px] tracking-[0.18em] text-[#f0d9a4]" style={{ fontVariant: 'small-caps' }}>
            {l.name}
          </div>
          <div className="mx-auto mt-0.5 h-px w-10 bg-[#f0d9a4]/40" />
        </div>
      ))}
    </div>
  );
}

function Hud({ mode, onSheet }: { mode: 'relics' | 'museum'; onSheet: (s: Sheet) => void }) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const s = state as GameState;

  if (mode === 'museum') {
    const sets = activeExhibits(s);
    return (
      <>
        <div className="pointer-events-none absolute left-2 top-2 select-none">
          <div className="text-xs font-semibold uppercase tracking-wider text-[#e8c98a]">The Gallery</div>
          <div className="tnum mt-0.5 text-[10px] leading-tight text-cave-300/90">
            {s.relics.held.length} on the plinths · {s.museum.completed.length}/{CASES.length} halls
            {sets.length > 0 && <> · <span className="text-[#f0d9a4]">{sets.length} lit</span></>}
          </div>
        </div>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-6">
          <Dovekin state={s} />
          <button className="btn min-h-[40px] w-full text-xs" onClick={() => onSheet({ kind: 'halls' })}>
            What the halls are asking for
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="pointer-events-none absolute left-2 top-2 select-none">
        <div className="text-xs font-semibold uppercase tracking-wider text-[#d8b8ee]">The Reliquary</div>
        <div className="tnum mt-0.5 text-[10px] leading-tight text-cave-300/90">
          {s.relics.equipped.length}/{RELIC_SLOTS} mounted · {s.relics.held.length}/{holdCap(s)} held
        </div>
      </div>
      <div className="pointer-events-none absolute right-2 top-2 select-none text-right">
        <div className="tnum text-[10px] leading-tight text-cave-300/90">
          <span className="text-[#d8b8ee]">{Math.floor(s.relics.shards)}</span> shards
        </div>
        <div className="tnum text-[10px] leading-tight text-cave-300/90">
          <span className="text-[#e8c98a]">{Math.floor(getCurrency(s, 'core').toNumber())}</span> Cores
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex gap-1 bg-gradient-to-t from-black/85 to-transparent p-1.5 pt-6">
        <button
          className={`btn min-h-[40px] flex-1 text-xs ${s.relics.autoScrap.on ? 'btn-warm' : ''}`}
          onClick={() => onSheet({ kind: 'scrap' })}
        >
          Standing order{s.relics.autoScrap.on ? ' · on' : ''}
        </button>
      </div>
    </>
  );
}

/** The curator, reacting to what has been brought in. */
function Dovekin({ state }: { state: GameState }) {
  const held = state.relics.held.length;
  const sets = activeExhibits(state).length;
  const line = sets >= 3
    ? '"Three of them lit at once. I have had to move a bench." — Dovekin'
    : sets >= 1
      ? '"Somebody came in this morning and just stood in front of it." — Dovekin'
      : held >= 12
        ? '"There is a shape in this lot. I have not worked out what yet." — Dovekin'
        : held > 0
          ? '"Bring me the odd ones. Nobody remembers the tidy ones." — Dovekin'
          : '"The plinths are cut and waiting. That is the easy half." — Dovekin';
  return <p className="mb-1 px-1 text-[10px] italic leading-snug text-cave-400">{line}</p>;
}

/**
 * THE SCRIM CLOSES ON POINTERDOWN, NOT ON CLICK — and that is load-bearing.
 *
 * The sheet opens from a Pixi POINTERUP on the canvas underneath. A browser
 * then fires `click` at the same coordinates a moment later, by which time
 * React has mounted this overlay there — so a scrim wired to `onClick` catches
 * the tail of the very gesture that opened the sheet and closes it again.
 *
 * It presented as "the second tap does nothing", was intermittent (it is a race
 * with React's flush), and cost an hour of hunting it in the driver before the
 * driver turned out to be right. `pointerdown` cannot be the tail of a gesture
 * that has already finished.
 */
function SheetHost({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-10 flex flex-col justify-end">
      <div className="absolute inset-0 bg-black/40" onPointerDown={onClose} />
      <div className="relative max-h-[80%] overflow-y-auto rounded-t-xl border-t border-cave-700 bg-cave-950/97 p-2.5 shadow-2xl scroll-thin">
        <div className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-cave-700" />
        {children}
      </div>
    </div>
  );
}

function SheetBody({ sheet, setSheet, showInGallery }: {
  sheet: NonNullable<Sheet>; setSheet: (s: Sheet) => void; showInGallery: (uid: number) => void;
}) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const s = state as GameState;
  if (sheet.kind === 'scrap') return <ScrapSheet state={s} />;
  if (sheet.kind === 'halls') return <HallsSheet state={s} />;
  if (sheet.kind === 'pick') return <PickSheet state={s} slot={sheet.slot} setSheet={setSheet} />;
  if (sheet.kind === 'slot') return <SlotSheet state={s} uid={sheet.uid} setSheet={setSheet} />;
  if (sheet.kind === 'fuse') return <FuseSheet state={s} keepUid={sheet.keepUid} setSheet={setSheet} />;
  return <RelicSheet state={s} uid={sheet.uid} setSheet={setSheet} showInGallery={showInGallery} />;
}

// ---------------------------------------------------------------------------

function RelicLines({ relic }: { relic: RelicInstance }) {
  const shown = effectiveAffixes(relic);
  const dropped = Object.keys(relic.affixes).length - Object.keys(shown).length;
  return (
    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
      {Object.entries(shown).map(([k, v]) => (
        <span key={k} className="tnum text-[11px] text-cave-400">
          {AFFIXES[k]?.label ?? k} <span className="text-lamp-400">+{Math.round(v * 100)}%</span>
        </span>
      ))}
      {dropped > 0 && (
        <span
          className="text-[10px] italic text-cave-600"
          title="A relic with a power keeps only its strongest line — the rest were noise beside it."
        >
          the power is the relic; {dropped} lesser line{dropped > 1 ? 's' : ''} do not count
        </span>
      )}
    </div>
  );
}

function RelicSheet({ state, uid, setSheet, showInGallery }: {
  state: GameState; uid: number; setSheet: (s: Sheet) => void; showInGallery: (uid: number) => void;
}) {
  const r = state.relics.held.find((x) => x.uid === uid);
  if (!r) return <p className="text-[11px] italic text-cave-500">It is not in the hold any more.</p>;
  const worn = state.relics.equipped.includes(r.uid);
  const src = SOURCE_BY_ID.get(r.source);
  const pw = powerOf(r);
  const live = powerLive(r);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-cave-200">
          {r.locked && <span className="mr-1 text-[#e6c15a]" title="Locked">🔒</span>}
          {RARITIES[r.rarity]} relic
          {r.fusedFrom > 0 && <span className="ml-1 text-[10px] text-cave-500">·{r.fusedFrom} fused in</span>}
        </span>
        <span className="shrink-0 text-[10px] text-cave-500">from {src?.name ?? r.source}</span>
      </div>

      {/* Engraved on the object: where it came up, and out of whose hand. */}
      {r.found ? (
        <div className="mt-1 text-[10px] leading-snug text-cave-500">
          Found at depth <span className="tnum text-cave-400">{r.found.depth}</span>
          {' '}in {r.found.shell}, run <span className="tnum text-cave-400">{r.found.run + 1}</span>
          {r.found.by && <> — turned up by <span className="text-cave-400">{r.found.by}</span></>}
        </div>
      ) : (
        <div className="mt-1 text-[10px] italic leading-snug text-cave-600">Nobody wrote down where this came from.</div>
      )}

      <RelicLines relic={r} />

      <div className="mt-1.5 flex items-baseline justify-between gap-2">
        <span className={`text-[10px] uppercase tracking-wider ${wakingOf(r) === 0 ? 'text-cave-500' : 'text-[#9fd8c0]'}`}>
          {wakingStep(r).name}
          {wakingStep(r).mult > 1 && <span className="ml-1 tnum">×{wakingStep(r).mult.toFixed(2)}</span>}
        </span>
        {wakingNeed(r) !== null && (
          <span className="tnum shrink-0 text-[9px] text-cave-500">{Math.ceil(wakingNeed(r)! / 60)}m carried to go</span>
        )}
      </div>
      <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{wakingStep(r).line}</div>

      {pw && (
        <div className={`mt-1.5 rounded-md border px-2 py-1.5 ${live ? 'border-[#e8c98a]/50 bg-[#e8c98a]/5' : 'border-dashed border-cave-800'}`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className={`text-[11px] font-semibold ${live ? 'text-[#e8c98a]' : 'text-cave-500'}`}>{pw.name}</span>
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">{live ? KIND_NAME[pw.kind] : 'sleeping'}</span>
          </div>
          {live ? (
            <>
              <div className="mt-0.5 text-[10px] leading-snug text-cave-300">{pw.readout(state)}</div>
              <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">{pw.line}</div>
            </>
          ) : (
            <div className="mt-0.5 text-[10px] italic leading-snug text-cave-500">
              Something in it has not woken. Carry it and find out what.
            </div>
          )}
        </div>
      )}

      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {worn ? (
          <button className="btn min-h-[40px] py-1 text-[11px]"
            onClick={() => { dispatch({ type: 'unequipRelic', slot: state.relics.equipped.indexOf(r.uid) }); setSheet(null); }}>
            Take it down
          </button>
        ) : (
          <button className="btn min-h-[40px] py-1 text-[11px]"
            onClick={() => {
              if (state.relics.equipped.length < RELIC_SLOTS) {
                dispatch({ type: 'equipRelic', uid: r.uid, slot: state.relics.equipped.length });
                setSheet(null);
              } else setSheet({ kind: 'slot', uid: r.uid });
            }}>
            Mount it
          </button>
        )}
        <button className="btn min-h-[40px] py-1 text-[11px]" onClick={() => setSheet({ kind: 'fuse', keepUid: r.uid })}>
          Fuse into this
        </button>
        <button className="btn min-h-[40px] py-1 text-[11px]" onClick={() => showInGallery(r.uid)}>
          Find it in the gallery
        </button>
        <button
          className={`btn min-h-[40px] py-1 text-[11px] ${r.locked ? 'btn-warm' : ''}`}
          aria-pressed={!!r.locked}
          onClick={() => dispatch({ type: 'toggleRelicLock', uid: r.uid })}
        >
          {r.locked ? '🔒 Locked' : '🔓 Lock it'}
        </button>
        {!worn && !r.locked && (
          <button className="btn col-span-2 min-h-[40px] py-1 text-[11px]"
            title="Render it down. Gone for good."
            onClick={() => { dispatch({ type: 'renderRelic', uid: r.uid }); setSheet(null); }}>
            ⚒ Render down · {shardValue(r)} shards
          </button>
        )}
      </div>
    </div>
  );
}

/** An empty niche, tapped: what would you like to stand in it. */
function PickSheet({ state, slot, setSheet }: { state: GameState; slot: number; setSheet: (s: Sheet) => void }) {
  const spare = state.relics.held.filter((r) => !state.relics.equipped.includes(r.uid));
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cave-300">The niche is empty</div>
      {spare.length === 0 ? (
        <p className="text-[11px] italic text-cave-500">Nothing spare to mount. They come up out of the deep shaft, out of Warrens, out of anomalies and wells, and back with the crews.</p>
      ) : (
        <div className="space-y-1">
          {spare.map((r) => <RelicRow key={r.uid} state={state} r={r} onClick={() => { dispatch({ type: 'equipRelic', uid: r.uid, slot }); setSheet(null); }} />)}
        </div>
      )}
    </div>
  );
}

/** Six slots, all full: which one comes down. */
function SlotSheet({ state, uid, setSheet }: { state: GameState; uid: number; setSheet: (s: Sheet) => void }) {
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cave-300">
        Six niches, six relics. Something has to come down.
      </div>
      <div className="space-y-1">
        {state.relics.equipped.map((wornUid, slot) => {
          const r = state.relics.held.find((x) => x.uid === wornUid);
          if (!r) return null;
          return <RelicRow key={wornUid} state={state} r={r} prefix={`Niche ${slot + 1} · `}
            onClick={() => { dispatch({ type: 'equipRelic', uid, slot }); setSheet(null); }} />;
        })}
      </div>
    </div>
  );
}

function RelicRow({ state, r, onClick, prefix = '' }: {
  state: GameState; r: RelicInstance; onClick: () => void; prefix?: string;
}) {
  const pw = powerOf(r);
  void state;
  return (
    <button
      className="block w-full rounded-md border border-cave-700 px-2 py-1.5 text-left text-[11px] transition-colors hover:border-lamp-500/50 hover:bg-cave-800"
      onClick={onClick}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-cave-200">{prefix}{RARITIES[r.rarity]} · {SOURCE_BY_ID.get(r.source)?.name ?? r.source}</span>
        {pw && <span className="shrink-0 text-[10px] text-[#e8c98a]">{pw.name}</span>}
      </div>
      <div className="mt-0.5 text-[10px] text-cave-500">
        {wakingStep(r).name}
        {r.found && <> · depth {r.found.depth}{r.found.by ? ` · ${r.found.by}` : ''}</>}
      </div>
    </button>
  );
}

function FuseSheet({ state, keepUid, setSheet }: { state: GameState; keepUid: number; setSheet: (s: Sheet) => void }) {
  const keep = state.relics.held.find((r) => r.uid === keepUid);
  if (!keep) return null;
  const feeds = state.relics.held.filter((o) => o.uid !== keepUid && !o.locked);
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-cave-300">
          Feed one into the {RARITIES[keep.rarity]}
        </span>
        <span className="tnum shrink-0 text-[10px] text-[#d8b8ee]">{fusionAfford(state, keep).price.shards} shards</span>
      </div>
      <p className="mb-1.5 text-[10px] italic leading-snug text-cave-500">
        The keeper takes the better of every line, and a notch for what it ate. Nothing is lost.
      </p>
      {feeds.length === 0 && <p className="text-[11px] italic text-cave-500">Nothing spare and unlocked to feed it.</p>}
      <div className="space-y-1">
        {feeds.map((o) => {
          const pv = fusionPreview(state, keepUid, o.uid);
          const af = fusionAfford(state, keep, o);
          return (
            <button
              key={o.uid}
              className={`block w-full rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors ${
                af.ok && !pv?.gatedBy ? 'border-cave-700 hover:border-lamp-500/50 hover:bg-cave-800' : 'border-cave-800 opacity-60'}`}
              disabled={!af.ok || !!pv?.gatedBy}
              onClick={() => { dispatch({ type: 'fuseRelics', keepUid, feedUid: o.uid }); setSheet({ kind: 'relic', uid: keepUid }); }}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-cave-200">{RARITIES[o.rarity]} · {SOURCE_BY_ID.get(o.source)?.name ?? o.source}</span>
                {af.price.cores > 0 && <span className="tnum shrink-0 text-[10px] text-[#e8c98a]">+{af.price.cores} Cores</span>}
              </div>
              <div className="mt-0.5 text-[10px] leading-snug text-cave-400">
                {pv?.gatedBy ? (
                  <span className="text-[#d4a86a]">rarity up needs {pv.gatedBy.need} filled halls ({pv.gatedBy.have} done)</span>
                ) : !af.ok ? (
                  <span className="text-amber-400">Short {af.short.join(' and ')}.</span>
                ) : !pv || (pv.gained.length === 0 && pv.improved.length === 0 && !pv.rarityUp && !pv.powerGained) ? (
                  <span className="italic">Adds nothing this one does not already beat — but it still marks it.</span>
                ) : (
                  <>
                    {pv.rarityUp && <span className="mr-2 text-lamp-400">rarity up</span>}
                    {pv.powerGained && <span className="mr-2 text-[#e8c98a]">takes its power · {pv.powerGained}</span>}
                    {pv.gained.map((g) => <span key={g.key} className="mr-2 text-lamp-400">+{g.label} {Math.round(g.value * 100)}%</span>)}
                    {pv.improved.map((i) => <span key={i.key} className="mr-2 text-lamp-300">{i.label} {Math.round(i.from * 100)}→{Math.round(i.to * 100)}%</span>)}
                  </>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const BAND = ['Common', 'Uncommon', 'Rare', 'Fabled', 'Mythic'];

function ScrapSheet({ state }: { state: GameState }) {
  const rule = state.relics.autoScrap;
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cave-300">The standing order</div>
      <p className="mb-2 text-[10px] italic leading-snug text-cave-500">
        What to render down the moment it comes up, so the hold never becomes a list again. It
        only ever refuses a NEW find — turning it on cannot touch anything already here, and it
        never takes a locked one.
      </p>
      <button
        className={`btn mb-2 min-h-[40px] w-full text-[11px] ${rule.on ? 'btn-warm' : ''}`}
        aria-pressed={rule.on}
        onClick={() => dispatch({ type: 'setAutoScrap', on: !rule.on })}
      >
        {rule.on ? 'Standing order is ON' : 'Standing order is off'}
      </button>
      <div className="mb-1 text-[10px] uppercase tracking-widest text-cave-500">Render down anything up to</div>
      <div className="mb-2 flex flex-wrap gap-1">
        {BAND.map((name, i) => (
          <button
            key={name}
            className={`btn min-h-[36px] flex-1 px-1.5 py-1 text-[10px] ${rule.maxRarity === i ? 'btn-warm' : ''}`}
            aria-pressed={rule.maxRarity === i}
            onClick={() => dispatch({ type: 'setAutoScrap', maxRarity: i })}
          >
            {name}
          </button>
        ))}
      </div>
      <button
        className={`btn min-h-[40px] w-full text-[11px] ${rule.keepPowered ? 'btn-warm' : ''}`}
        aria-pressed={rule.keepPowered}
        onClick={() => dispatch({ type: 'setAutoScrap', keepPowered: !rule.keepPowered })}
      >
        {rule.keepPowered ? 'Always keep one that has a power' : 'Powers get no exemption'}
      </button>
      {rule.keepPowered && rule.maxRarity >= 2 && (
        <p className="mt-1 text-[10px] italic leading-snug text-cave-500">
          Every Rare and above carries a power, so with this on the band above Uncommon changes
          nothing. Turn it off if you meant it.
        </p>
      )}
    </div>
  );
}

/** The halls, as a reference sheet — what each is asking for and what it pays.
 *  The SETS are not here: nothing lists a set before it fires (pillar 5). */
function HallsSheet({ state }: { state: GameState }) {
  const found = EXHIBITS.filter((e) => state.museum.exhibitsFound.includes(e.id));
  const standing = new Set(activeExhibits(state).map((a) => a.def.id));
  return (
    <div>
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-cave-300">The halls</div>
      <div className="space-y-1">
        {CASES.map((c) => {
          const p = caseProgress(state, c.id);
          const done = state.museum.completed.includes(c.id);
          return (
            <div key={c.id} className={`rounded-md border px-2 py-1.5 ${done ? 'border-lamp-500/40' : 'border-cave-800'}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[12px] text-cave-200">{c.name}</span>
                <span className="tnum shrink-0 text-[10px] text-cave-400">{p.have}/{p.need}</span>
              </div>
              <div className="mt-0.5 text-[10px] text-cave-500">
                {c.wants} · {done ? 'filled' : 'when filled'} <span className="text-lamp-400">+{Math.round(c.bonus * 100)}% {BUCKET_NAME[c.bucket]}</span>
              </div>
            </div>
          );
        })}
      </div>
      {found.length > 0 && (
        <>
          <div className="mb-1 mt-2 text-[11px] font-semibold uppercase tracking-wide text-[#e8c98a]">
            Named by the room · {found.length}
          </div>
          <div className="space-y-1">
            {found.map((e) => (
              <div key={e.id} className={`rounded-md border px-2 py-1.5 ${standing.has(e.id) ? 'border-[#e8c98a]/40 bg-[#e8c98a]/5' : 'border-cave-800 opacity-60'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-[12px] font-semibold ${standing.has(e.id) ? 'text-[#e8c98a]' : 'text-cave-400'}`}>
                    {standing.has(e.id) && <span className="mr-1">◆</span>}{e.name}
                  </span>
                  <span className="shrink-0 text-[10px] text-cave-500">
                    {standing.has(e.id) ? `+${Math.round(e.bonus * 100)}% ${BUCKET_NAME[e.bucket]}` : 'not standing'}
                  </span>
                </div>
                <div className="mt-0.5 text-[10px] italic leading-snug text-cave-400">{e.line}</div>
              </div>
            ))}
          </div>
        </>
      )}
      {/* Resonance is a RELIC-side reading and belongs where the niches are; it
          is named here only when it is live, so the two screens agree. */}
      {activeResonances(state).length > 0 && (
        <p className="mt-2 text-[10px] italic text-cave-500">
          {activeResonances(state).length} resonance{activeResonances(state).length > 1 ? 's' : ''} firing back at the reliquary.
        </p>
      )}
    </div>
  );
}
