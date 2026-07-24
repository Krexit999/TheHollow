/**
 * THE WORKBENCH UI — crafting you HANDLE.
 *
 * The engine owns the process; this owns the four hands. Each act has a
 * signature verb, deliberately distinct so no two feel the same:
 *
 *   FORGE  force  — press-hold to build a strike, release to match the metal
 *   CARVE  trace  — drag along the rune's line in one steady pass
 *   CUT    place  — set the facet planes and choose how the stone reads
 *   CAST   mix    — choose what goes in; the traits decide what comes out
 *
 * Every interaction is one-handed (pointer/touch, no two-finger anything) and
 * every one offers a STEADY HAND fallback — a single button that crafts
 * competently without the tactile challenge — so a `prefers-reduced-motion`
 * player, or anyone who just wants it done, is never shut out. That button is
 * the reduced-motion path AND the accessibility path at once.
 */
import { useEffect, useRef, useState } from 'react';
import type { GameState } from '../../engine';
import { materialDef } from '../../engine/materials';
import { materialCount } from '../../engine/systems/forge';
import {
  ACT_STAGES, stageProfile, jobQuality, currentStage, jobMaterialTraits,
  type StageDef, type CraftAct,
} from '../../engine/systems/workbench';
import { ACT_DELEGATE } from '../../engine/systems/workbenchActs';
import { traitsOf } from '../../engine/traits';
import { RUNE_NAMES, RUNE_GLYPHS, RUNES } from '../../engine/content/shell4/runes';
import { GEMS } from '../../engine/materials';
import { dispatch, useGame } from '../store';
import { TraitTag } from './shared';

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const NPC_NAMES: Record<string, string> = { marrow: 'Marrow', quill: 'Old Quill', ilma: 'Ilma', ossian: 'Keeper Ossian' };

export function CraftWorkbench() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const job = state.workbench.job;
  if (!job) return <CraftLaunchers state={state as GameState} />;

  const stage = currentStage(job);
  const traits = jobMaterialTraits(job);
  const npc = NPC_NAMES[ACT_DELEGATE[job.act]] ?? 'someone';

  return (
    <div className="panel border-[#e0b054]/40 p-3">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#e0b054]">
          {ACT_LABEL[job.act]} — on the bench
        </span>
        <span className="tnum text-[10px] text-cave-400">
          stage {job.results.length + 1}/{ACT_STAGES[job.act].length} · quality {Math.round(jobQuality(job) * 100)}%
        </span>
      </div>

      {stage && (
        <>
          <p className="mt-1 text-[11px] italic leading-snug text-cave-400">{stage.hint}</p>
          <StageInteraction stage={stage} traits={traits} />
        </>
      )}

      <div className="mt-2 flex gap-1.5 border-t border-cave-800 pt-2">
        <button
          className="btn flex-1 py-1 text-[11px]"
          onClick={() => dispatch({ type: 'delegateCraft' })}
          title={`Hand it to ${npc} — safe, guaranteed, a touch worse. Better if you are on good terms.`}
        >
          Let {npc} do it
        </button>
        <button className="btn px-2 py-1 text-[11px] opacity-70" onClick={() => dispatch({ type: 'abandonCraft' })}>
          Set it down
        </button>
      </div>
    </div>
  );
}

const ACT_LABEL: Record<CraftAct, string> = { forge: 'Forging', carve: 'Carving', cut: 'Cutting', cast: 'Casting' };

// ---------------------------------------------------------------------------
// The interaction router — the signature verb per stage
// ---------------------------------------------------------------------------

function StageInteraction({ stage, traits }: { stage: StageDef; traits: string[] }) {
  const profile = stageProfile(stage, traits as never);
  const send = (execution: number, data?: Record<string, unknown>) =>
    dispatch({ type: 'craftStage', execution, data });

  const traitNote = (
    <div className="mt-1 text-[10px] italic text-cave-500">{profile.note}</div>
  );

  // The SIGNATURE verbs, plus a shared hold-gauge for the lighter stages.
  switch (stage.verb) {
    case 'shape':
      return <><ForceStrikes profile={profile} onDone={send} />{traitNote}</>;
    case 'stroke':
      return <><TraceLine profile={profile} onDone={send} />{traitNote}</>;
    case 'cleave':
      return <><FacetPlacer onDone={send} />{traitNote}</>;
    case 'read':
      return <><PlaneRead profile={profile} onDone={send} />{traitNote}</>;
    case 'mix':
      // Mix is a proportion act, but the inputs were chosen at launch; here it
      // is a balance check that also confirms the pour is ready.
      return <><HoldGauge profile={profile} label="Bring the mix together" onDone={send} />{traitNote}</>;
    default:
      // heat / set / steady / pour — the hold-and-release gauge, its band and
      // clock set by the material's traits so it feels different every time.
      return <><HoldGauge profile={profile} label={GAUGE_LABEL[stage.verb] ?? 'Work it'} onDone={send} />{traitNote}</>;
  }
}

const GAUGE_LABEL: Record<string, string> = {
  heat: 'Hold to heat — release in the band', set: 'Hold as it cools — release in the band',
  steady: 'Hold to steady the hand', pour: 'Hold to pour — release when it is full',
};

// ---------------------------------------------------------------------------
// PRIMITIVE 1 — the hold-release gauge (heat / set / steady / pour / mix)
// ---------------------------------------------------------------------------

function HoldGauge({ profile, label, onDone }: { profile: { forgiveness: number }; label: string; onDone: (e: number) => void }) {
  const [level, setLevel] = useState(0);
  const [held, setHeld] = useState(false);
  const raf = useRef(0);
  const dir = useRef(1);
  // The band the player aims to release inside — narrower when the material is
  // less forgiving. Centred at 0.62 so it takes real intent to reach.
  const bandC = 0.62;
  const bandW = 0.1 + profile.forgiveness * 0.22;

  useEffect(() => {
    if (!held) return undefined;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      setLevel((v) => {
        let nv = v + dir.current * dt * 0.55;
        if (nv >= 1) { nv = 1; dir.current = -1; }
        if (nv <= 0) { nv = 0; dir.current = 1; }
        return nv;
      });
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [held]);

  const release = () => {
    if (!held) return;
    setHeld(false);
    const dist = Math.abs(level - bandC);
    const exec = Math.max(0, 1 - dist / (bandW + 0.001));
    onDone(Math.min(1, exec));
  };

  return (
    <div className="mt-2">
      <div className="relative h-8 overflow-hidden rounded-md border border-cave-700 bg-cave-950">
        <div className="absolute inset-y-0 bg-[#9fd8c0]/25" style={{ left: `${(bandC - bandW) * 100}%`, width: `${bandW * 2 * 100}%` }} />
        <div className="absolute inset-y-0 w-1 bg-[#e0b054]" style={{ left: `${level * 100}%` }} />
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          className="btn btn-warm flex-1 select-none py-2 text-xs"
          onPointerDown={(e) => { e.preventDefault(); setHeld(true); }}
          onPointerUp={release}
          onPointerLeave={release}
        >
          {held ? 'Release in the band' : label}
        </button>
        <button className="btn px-2 py-2 text-[10px]" title="A steady, competent pass — the reduced-motion and accessibility path" onClick={() => onDone(0.66)}>
          Steady hand
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRIMITIVE 2 — force strikes (FORGE signature)
// ---------------------------------------------------------------------------

function ForceStrikes({ profile, onDone }: { profile: { resistance: number; forgiveness: number }; onDone: (e: number) => void }) {
  const STRIKES = 3;
  const [force, setForce] = useState(0);
  const [held, setHeld] = useState(false);
  const [scores, setScores] = useState<number[]>([]);
  const raf = useRef(0);
  // Each strike wants a different target force; a resistant material overshoots.
  const targets = useRef([0.35 + profile.resistance * 0.5, 0.6, 0.45 + profile.resistance * 0.3]);
  const tol = 0.12 + profile.forgiveness * 0.16;

  useEffect(() => {
    if (!held) return undefined;
    let last = performance.now();
    const step = (now: number) => {
      const dt = (now - last) / 1000; last = now;
      // Resistance makes force build faster and harder to hold precisely.
      setForce((v) => Math.min(1, v + dt * (0.5 + profile.resistance * 0.5)));
      raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf.current);
  }, [held, profile.resistance]);

  const strike = () => {
    if (!held) return;
    setHeld(false);
    const t = targets.current[scores.length] ?? 0.5;
    const s = Math.max(0, 1 - Math.abs(force - t) / (tol + 0.001));
    const next = [...scores, Math.min(1, s)];
    setForce(0);
    setScores(next);
    if (next.length >= STRIKES) onDone(next.reduce((a, b) => a + b, 0) / next.length);
  };

  const t = targets.current[scores.length] ?? 0.5;
  return (
    <div className="mt-2">
      <div className="relative h-9 overflow-hidden rounded-md border border-cave-700 bg-cave-950">
        <div className="absolute inset-y-0 w-1.5 bg-[#9fd8c0]/70" style={{ left: `${t * 100}%` }} title="Match this force" />
        <div className="absolute inset-y-0 left-0 bg-[#e0955c]/40" style={{ width: `${force * 100}%` }} />
      </div>
      <div className="mt-1 flex gap-0.5">
        {Array.from({ length: STRIKES }).map((_, i) => (
          <div key={i} className={`h-1 flex-1 rounded-full ${i < scores.length ? (scores[i]! > 0.6 ? 'bg-[#9fd8c0]' : 'bg-[#d8a0a0]') : 'bg-cave-800'}`} />
        ))}
      </div>
      <div className="mt-1.5 flex gap-1.5">
        <button
          className="btn btn-warm flex-1 select-none py-2 text-xs"
          onPointerDown={(e) => { e.preventDefault(); setHeld(true); }}
          onPointerUp={strike}
          onPointerLeave={strike}
        >
          {held ? 'Release to strike' : `Strike ${scores.length + 1} of ${STRIKES} — hold for force`}
        </button>
        <button className="btn px-2 py-2 text-[10px]" title="Steady, competent strikes — reduced-motion path" onClick={() => onDone(0.66)}>
          Steady hand
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRIMITIVE 3 — trace the line (CARVE signature)
// ---------------------------------------------------------------------------

function TraceLine({ profile, onDone }: { profile: { resistance: number }; onDone: (e: number) => void }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [progress, setProgress] = useState(0);
  const [deviation, setDeviation] = useState(0);
  const samples = useRef(0);
  const tracing = useRef(false);
  // The guide line: a gentle S. Springy material makes it wander (higher wobble).
  const wobble = profile.resistance * 8;
  const pathY = (x: number) => 50 + Math.sin(x / 30) * (12 + wobble);

  const onMove = (e: React.PointerEvent) => {
    if (!tracing.current) return;
    const svg = svgRef.current!;
    const rect = svg.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 300;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    if (x < 0 || x > 300) return;
    const target = pathY(x);
    setDeviation((d) => d + Math.min(1, Math.abs(y - target) / 30));
    samples.current += 1;
    setProgress(Math.max(progress, x / 300));
  };

  const finish = () => {
    if (!tracing.current) return;
    tracing.current = false;
    const cover = progress;
    const avgDev = samples.current > 0 ? deviation / samples.current : 1;
    const exec = Math.max(0, cover * (1 - avgDev));
    onDone(Math.min(1, exec));
  };

  const guide = Array.from({ length: 31 }, (_, i) => `${i === 0 ? 'M' : 'L'} ${i * 10} ${pathY(i * 10)}`).join(' ');
  return (
    <div className="mt-2">
      <svg
        ref={svgRef}
        viewBox="0 0 300 100"
        className="h-24 w-full touch-none rounded-md border border-cave-700 bg-cave-950"
        onPointerDown={(e) => { e.preventDefault(); tracing.current = true; setProgress(0); setDeviation(0); samples.current = 0; }}
        onPointerMove={onMove}
        onPointerUp={finish}
        onPointerLeave={finish}
      >
        <path d={guide} fill="none" stroke="#3a4048" strokeWidth={6} strokeLinecap="round" />
        <path d={guide} fill="none" stroke="#9fd8c0" strokeWidth={2} strokeDasharray="4 4" opacity={0.5} />
        <rect x={0} y={0} width={progress * 300} height={100} fill="#e0b054" opacity={0.08} />
      </svg>
      <div className="mt-1.5 flex gap-1.5">
        <div className="flex-1 self-center text-[10px] italic text-cave-500">Drag along the line, one steady pass</div>
        <button className="btn px-2 py-2 text-[10px]" title="A clean, competent stroke — reduced-motion path" onClick={() => onDone(0.66)}>
          Steady hand
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// PRIMITIVE 4 — placement (CUT signature: read the plane, then the facets)
// ---------------------------------------------------------------------------

function PlaneRead({ profile, onDone }: { profile: { forgiveness: number }; onDone: (e: number, data?: Record<string, unknown>) => void }) {
  // The true cleavage angle is fixed per session (deterministic — no reroll);
  // the player taps where they think it is on a dial.
  const trueAngle = useRef(30 + Math.floor((Date.now() / 1000) % 120));
  const [guess, setGuess] = useState<number | null>(null);
  const tol = 20 + profile.forgiveness * 25;

  return (
    <div className="mt-2">
      <div className="text-[10px] italic text-cave-500">Tap the plane the stone wants to break along.</div>
      <div className="mt-1 grid grid-cols-6 gap-1">
        {Array.from({ length: 12 }, (_, i) => i * 15).map((ang) => (
          <button
            key={ang}
            className={`btn py-1.5 text-[10px] ${guess === ang ? 'btn-warm' : ''}`}
            onClick={() => setGuess(ang)}
          >
            {ang}°
          </button>
        ))}
      </div>
      <button
        className="btn btn-warm mt-1.5 w-full py-1.5 text-xs"
        disabled={guess === null}
        onClick={() => {
          const dist = Math.abs((guess ?? 0) - trueAngle.current);
          onDone(Math.max(0, 1 - dist / (tol + 0.001)));
        }}
      >
        Read it
      </button>
    </div>
  );
}

function FacetPlacer({ onDone }: { onDone: (e: number, data?: Record<string, unknown>) => void }) {
  const [facets, setFacets] = useState<number[]>([]);
  const [lean, setLean] = useState<'mine' | 'fight' | 'balanced'>('balanced');
  const place = (ang: number) => { if (facets.length < 3 && !facets.includes(ang)) setFacets([...facets, ang]); };
  // Quality = how evenly the facets are spread (a well-cut gem is symmetric).
  const quality = () => {
    if (facets.length < 2) return 0.3;
    const sorted = [...facets].sort((a, b) => a - b);
    const gaps = sorted.slice(1).map((v, i) => v - sorted[i]!);
    const ideal = (sorted[sorted.length - 1]! - sorted[0]!) / (gaps.length || 1);
    const err = gaps.reduce((a, g) => a + Math.abs(g - ideal), 0) / (gaps.length * 180 || 1);
    return Math.max(0.2, 1 - err * 2);
  };

  const q = quality();
  const qpct = Math.round(q * 100);
  // The numbers behind "how it reads" (see gemCutMult): a leaned cut lifts its
  // favoured face by up to q·28% and shaves the other by up to q·8%; balanced
  // lifts both by up to q·12%. Shown live so the choice is legible, not folklore.
  const leanText = lean === 'balanced'
    ? `lifts BOTH faces +${Math.round(q * 12)}%`
    : lean === 'mine'
      ? `mining face +${Math.round(q * 28)}%, combat −${Math.round(q * 8)}%`
      : `combat face +${Math.round(q * 28)}%, mining −${Math.round(q * 8)}%`;

  return (
    <div className="mt-2">
      <div className="text-[10px] italic text-cave-500">Place up to three facets, evenly, then choose how it reads. Evenly-spread facets cut cleaner.</div>
      <div className="mt-1 grid grid-cols-6 gap-1">
        {Array.from({ length: 12 }, (_, i) => i * 30).map((ang) => (
          <button key={ang} className={`btn py-1.5 text-[10px] ${facets.includes(ang) ? 'btn-warm' : ''}`} onClick={() => place(ang)}>
            {ang}°
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex gap-1">
        {(['mine', 'balanced', 'fight'] as const).map((l) => (
          <button key={l} className={`btn flex-1 py-1 text-[10px] ${lean === l ? 'btn-warm' : ''}`} onClick={() => setLean(l)}>
            {l === 'mine' ? 'Mining' : l === 'fight' ? 'Combat' : 'Balanced'}
          </button>
        ))}
      </div>
      <div className="mt-1 text-[9px] leading-snug text-cave-400">
        {facets.length < 2
          ? <span className="italic text-cave-600">Place at least two facets to read the cut.</span>
          : <>Cut quality <span className="tnum text-cave-200">{qpct}%</span> — this cut {leanText} on a socketed gem.</>}
      </div>
      <button
        className="btn btn-warm mt-1.5 w-full py-1.5 text-xs"
        disabled={facets.length < 2}
        onClick={() => onDone(q, { lean })}
      >
        Cleave {facets.length < 2 ? '(place at least two)' : ''}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The launchers — start a craft. Forge reuses the parts composer elsewhere;
// carve/cut/cast are compact pickers here.
// ---------------------------------------------------------------------------

function CraftLaunchers({ state }: { state: GameState }) {
  const [open, setOpen] = useState<CraftAct | null>(null);
  const held = Object.keys(state.materials.stacks).filter((id) => materialCount(state, id) > 0);
  const runesHeld = RUNES.filter((r) => (state.runes.found[r] ?? 0) > 0);
  const gemsHeld = GEMS.filter((g) => (state.materials.gems[g.id] ?? 0) > 0);

  return (
    <div className="panel p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-[#e0b054]">The workbench</div>
      <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
        Four hands, one bench. Do it yourself for a better piece, or hand it to someone who never slips and never
        excels. A ruined attempt costs the material, never the piece.
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1.5">
        {(['carve', 'cut', 'cast'] as const).map((act) => (
          <button key={act} className={`btn py-1.5 text-[11px] ${open === act ? 'btn-warm' : ''}`} onClick={() => setOpen(open === act ? null : act)}>
            {ACT_LABEL[act]}
          </button>
        ))}
        <div className="self-center text-[10px] italic text-cave-500">Forging starts at the bench above.</div>
      </div>

      {open === 'carve' && <CarveLauncher runesHeld={runesHeld} state={state} onClose={() => setOpen(null)} />}
      {open === 'cut' && <CutLauncher gemsHeld={gemsHeld} onClose={() => setOpen(null)} />}
      {open === 'cast' && <CastLauncher held={held} state={state} onClose={() => setOpen(null)} />}
    </div>
  );
}

function CarveLauncher({ runesHeld, onClose }: { runesHeld: readonly string[]; state: GameState; onClose: () => void }) {
  const [seq, setSeq] = useState<(string | null)[]>([null, null, null]);
  const [practice, setPractice] = useState<{ harmonic: number; dissonant: number; silent: number } | null>(null);
  return (
    <div className="mt-2 border-t border-cave-800 pt-2">
      <div className="text-[10px] uppercase tracking-widest text-cave-500">Carve a rune into the tool</div>
      <div className="mt-1 flex gap-1">
        {seq.map((r, i) => (
          <div key={i} className="flex-1 rounded border border-cave-700 p-1 text-center text-lg">{r ? RUNE_GLYPHS[r as never] : '·'}</div>
        ))}
      </div>
      <div className="mt-1 flex flex-wrap gap-1">
        {runesHeld.length === 0 && <span className="text-[10px] italic text-cave-500">No runes held. Find them on Warren walls — or cast them.</span>}
        {runesHeld.map((r) => (
          <button key={r} className="btn px-1.5 py-0.5 text-[10px]" onClick={() => { const i = seq.indexOf(null); if (i >= 0) setSeq(seq.map((x, j) => j === i ? r : x)); }}>
            {RUNE_GLYPHS[r as never]} {RUNE_NAMES[r as never]}
          </button>
        ))}
        <button className="btn px-1.5 py-0.5 text-[10px] opacity-70" onClick={() => setSeq([null, null, null])}>clear</button>
      </div>
      {/* PRACTICE ON SCRAP (v22): try the join risk-free. It tells you the SHAPE —
          how many rang, how many fought — never which, and never spends real runes. */}
      <div className="mt-1.5 flex gap-1">
        <button
          className="btn flex-1 py-1.5 text-[11px]"
          disabled={seq.filter((r) => r).length < 2}
          title="Practise this join on scrap for a little Silica — learn if it rings, not what it does"
          onClick={() => {
            const r = dispatch({ type: 'practiceRunes', sequence: seq });
            if (r.ok) setPractice(r.data as { harmonic: number; dissonant: number; silent: number });
          }}
        >Practise on scrap</button>
        <button
          className="btn btn-warm flex-1 py-1.5 text-xs"
          disabled={!seq.some((r) => r)}
          onClick={() => { dispatch({ type: 'beginCraft', act: 'carve', context: { target: 'tool', sequence: seq } }); onClose(); }}
        >To the bench</button>
      </div>
      {practice && (
        <div className="mt-1 text-[10px] text-cave-400">
          The scrap says: <span className="text-[#9ab87a]">{practice.harmonic} rang</span>
          {practice.dissonant > 0 && <>, <span className="text-[#e0604a]">{practice.dissonant} fought</span></>}
          {practice.silent > 0 && <>, <span className="text-cave-500">{practice.silent} stayed silent</span></>}. What they mean is yours to find.
        </div>
      )}
    </div>
  );
}

function CutLauncher({ gemsHeld, onClose }: { gemsHeld: typeof GEMS; onClose: () => void }) {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const count = (id: string) => state?.materials.gems[id] ?? 0;
  return (
    <div className="mt-2 border-t border-cave-800 pt-2">
      <div className="text-[10px] uppercase tracking-widest text-cave-500">Cut a gem — learn to read it</div>
      {gemsHeld.length === 0 ? (
        <div className="mt-1 text-[10px] italic text-cave-500">No gems held. They come up out of geodes.</div>
      ) : (
        <div className="mt-1 space-y-1">
          {gemsHeld.map((g) => (
            <div key={g.id} className="flex items-center gap-1">
              <button className="btn flex-1 px-1.5 py-0.5 text-left text-[10px]" onClick={() => { dispatch({ type: 'beginCraft', act: 'cut', context: { gemId: g.id } }); onClose(); }}>
                {g.name} <span className="tnum text-cave-500">×{count(g.id)}</span>
              </button>
              {/* GEM FUSION (v22): spend two duplicates for a better cut — non-destructive
                  (the cut only ever improves), so a duplicate is always progress. */}
              <button
                className="shrink-0 rounded border border-cave-700 px-1.5 py-0.5 text-[10px] text-cave-300 disabled:opacity-40"
                disabled={count(g.id) < 2}
                title="Fuse two duplicates into a better cut — never worse, capped below a hand-cut"
                onClick={() => dispatch({ type: 'fuseGems', gemId: g.id })}
              >fuse ×2</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function CastLauncher({ held, state, onClose }: { held: string[]; state: GameState; onClose: () => void }) {
  const [inputs, setInputs] = useState<string[]>([]);
  const traits = [...new Set(inputs.flatMap((id) => traitsOf(id)))];
  return (
    <div className="mt-2 border-t border-cave-800 pt-2">
      <div className="text-[10px] uppercase tracking-widest text-cave-500">Cast a rune from materials</div>
      <div className="mt-1 text-[10px] text-cave-400">
        Chosen: {inputs.length === 0 ? <span className="italic text-cave-600">nothing yet</span> : inputs.map((id) => materialDef(id).name).join(', ')}
      </div>
      {traits.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-0.5">
          {traits.map((t) => <TraitTag key={t} id={t} size="xs" />)}
        </div>
      )}
      <div className="mt-1 max-h-32 space-y-0.5 overflow-y-auto scroll-thin">
        {held.map((id) => (
          <button
            key={id}
            className={`flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-[11px] hover:bg-cave-800 ${inputs.includes(id) ? 'bg-cave-700' : ''}`}
            onClick={() => setInputs(inputs.includes(id) ? inputs.filter((x) => x !== id) : inputs.length < 4 ? [...inputs, id] : inputs)}
          >
            <span className="min-w-0 flex-1 truncate text-cave-200">{materialDef(id).name}</span>
            <span className="tnum text-cave-500">×{materialCount(state, id)}</span>
          </button>
        ))}
      </div>
      <button
        className="btn btn-warm mt-1.5 w-full py-1.5 text-xs"
        disabled={inputs.length < 2}
        onClick={() => { dispatch({ type: 'beginCraft', act: 'cast', context: { inputs } }); onClose(); }}
      >
        {inputs.length < 2 ? 'Choose at least two' : 'To the mould'}
      </button>
    </div>
  );
}

void prefersReducedMotion;
