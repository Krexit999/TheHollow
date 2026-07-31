/**
 * THE CASTING FLOOR — the new Forge.
 *
 * Four boards, one room, and the order is the loop: THE CRUCIBLE (melt), THE
 * MOULDS (pour), THE RACK (what you have made), THE STATION (build).
 *
 * PLAIN PANELS AND CSS, NO CANVAS. The one visual that matters — watching a
 * stone become liquid — is two divs whose widths come off `crucibleFill` and
 * whose COLOUR is the material's own palette, the same three shades its ore
 * chunk is drawn from. A canvas UI on this codebase has been tried and reverted
 * twice; nothing here needs one.
 *
 * WHAT THIS PANEL LEARNED THE HARD WAY:
 *
 *  - A TWELVE-NUMBER STAT WALL TELLS A PLAYER NOTHING. The headline is now
 *    three things the tool DOES, each with a bar and a word; the raw stat block
 *    is folded away for anyone who wants it. `Bite 155449` is not information.
 *  - EVERY NUMBER GOES THROUGH `fmt`, so it obeys the player's suffix /
 *    scientific / engineering setting. Nineteen raw digits is not a number, it
 *    is a wall.
 *  - A COHERENCE FIGURE WITHOUT THE LEVER IS JUST A SCOLDING. "29% — seven
 *    strangers" tells you that you are wrong, not what to do. It now names the
 *    world the set mostly belongs to and the exact parts pulling against it.
 *  - THE RACK IS AN INVENTORY, NOT A CHECKLIST. A vertical list of every part
 *    you have ever poured stops being readable at about a dozen.
 */
import { useMemo, useState } from 'react';
import type { GameState } from '../../engine';
import { fmt } from '../../engine';
import {
  BANDS, materialDef, materialsOfShell, type PurityBand,
} from '../../engine/materials';
import {
  BOON_BY_ID, CRAFT_COLOR, CRAFT_LABEL, GROWTH_BOONS, GROWTH_MAX, LAYER_MAX, LAYER_NAMES,
  MASTERWORK_BY_ID, PART_DEFS, PART_TYPES, STAT_LABEL, TOOL_STATS, defaultShape,
  shapeDef, shapesFor,
  type PartShape, type PartType,
} from '../../engine/content/forgeParts';
import {
  balanceOf, craftFold, growthFold, growthProgress, isLiving,
  shapeFold, type ToolStats,
} from '../../engine/systems/forgeParts';
import { readBio } from '../../engine/systems/toolBio';
import { allShells, currentShell } from '../../engine/shells';
import {
  MELT_BACK_SHARE, TUB_CAPACITY,
  benchComplete, benchPreview, canCast, crucibleFill, currentTool, frontCharge,
  castMelt, layerDraw, meltBackValue, queued, rackPart, tubHeld, unitsThatFit,
  type RackPart,
} from '../../engine/systems/casting';
import { TOOL_CLASSES } from '../../engine/content/toolClasses';
import { toolClass } from '../../engine/systems/toolClass';
import {
  MAX_EXTRA_CELLS, ORE_RATE_CAP, REACH_EVERY, REPAIR_UNITS, SLOT_EVERY,
  castingToolTier, effectOf, grantsFor, isBroken, levelProgress, modSlotsOf,
  repairShare, toolEffect, toolLevel, usesLeft, usesOf, wear01, wornPart,
} from '../../engine/systems/toolMining';
import { materialCount } from '../../engine/systems/forge';
import { ROMAN, shellOrdinal } from '../../engine/content/drillAlloys';
import { TOOL_CARRIER } from '../../engine/systems/drillAlloys';
import {
  ABILITY_PARTS, abilityMaterials, effectInHand, toolAbilityHint, toolAbilitySlots,
  toolFits, toolGrade, toolGrants,
} from '../../engine/systems/toolAbilities';
import { MOD_BY_ID, SYNERGY_BY_ID, abilityLevelOf } from '../../engine/content/toolMods';
import {
  INST_FLOOR, MOD_FEED_MAX, knownMods, modCache, modHint, modProgress, modSlotsTotal,
  modSlotsUsed, modStacks, synergyHints, toolInstability, whyDormant,
  type ModCache, type ToolModStack,
} from '../../engine/systems/toolMods';
import {
  SOCKET_KINDS, fillLabel, pairLabel, relicName, runeName, socketCount, socketFocus,
  socketOverflow, socketRow, socketRunePairs, socketRuneTriples,
  type SocketFill, type SocketKind,
} from '../../engine/systems/toolSockets';
import { RARITIES, isSocketedRelic, wakingStep } from '../../engine/systems/relics';
import { powerLive, powerOf } from '../../engine/systems/relicPowers';
import { RUNES, RUNE_GLYPHS, type RuneId } from '../../engine/content/shell4/runes';
import { GEMS, gemDef } from '../../engine/materials';
import { dispatch, useGame } from '../store';
import { MaterialIcon } from './MaterialIcon';
import { Select } from './Select';

const useLive = () => {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  return state;
};

const cap1 = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** Every material the Hold actually has, for the charge picker. */
function heldMaterials(state: GameState): Array<{ id: string; count: number; band: PurityBand }> {
  return Object.entries(state.materials.stacks)
    .map(([id, perMat]) => {
      let count = 0;
      let band: PurityBand = 'poor';
      for (const b of BANDS) {
        const n = perMat?.[b]?.count ?? 0;
        if (n > 0) { count += n; band = b; }
      }
      return { id, count, band };
    })
    .filter((m) => m.count > 0)
    .sort((a, b) => materialDef(a.id).name.localeCompare(materialDef(b.id).name));
}

// ═══════════════════════════════════════════════════════════════════════════
// THE STATION — the casting screen as a bench, not a stack of panels
// ═══════════════════════════════════════════════════════════════════════════
/**
 * WHY THIS REPLACED EIGHT STACKED CARDS.
 *
 * Everything from here to `CastingPanel` is PRESENTATION. Not one engine call
 * changed: the same `benchPlace`, `castPart`, `buildTool`, `setSocket` and
 * `repairTool` the old cards dispatched are dispatched here, off the same
 * selectors. What changed is that the tool is now a THING IN THE MIDDLE with
 * its parts in their real positions, and the numbers orbit it instead of
 * queueing underneath it.
 *
 * PLAIN HTML/CSS, NO CANVAS — deliberately, and the reason is already on the
 * record: A.50 threw out 1,447 lines of canvas relic art because procedural
 * shapes at small sizes read as placeholder, and the ruling from it was "these
 * screens are panels; rendered art is not retried here". A pick built out of
 * positioned divs is not art, it is a DIAGRAM — it inherits the real material
 * palettes, and it costs nothing to keep truthful.
 *
 * THE DIAGRAM SHOWS THE WORKING SET, which is the one thing the mockup could
 * not decide and the engine can: for each of the seven positions it prefers the
 * BENCH part (what you are assembling) and falls back to the part already in
 * your tool. So the diagram IS your tool, and seating a replacement visibly
 * puts it on before you commit — a bench part is outlined in gold until you
 * Combine. That is why there is no separate seven-row bench list any more.
 */

/** The seven positions, as the mockup lays a pick out, in a 336x366 bench. */
/** Who sits in front of whom. The shaft passes BEHIND the core and binding. */
const PART_Z: Record<PartType, number> = {
  handle: 1, core: 2, grip: 2, binding: 3, head: 4, edge: 5, sockets: 6,
};

const PART_BOX: Record<PartType, { l: number; t: number; w: number; h: number; clip?: string; rot?: number }> = {
  head:    { l: 96,  t: 28,  w: 140, h: 64, clip: 'polygon(0% 56%, 22% 2%, 100% 0%, 100% 100%, 46% 96%)' },
  edge:    { l: 88,  t: 70,  w: 96,  h: 14, clip: 'polygon(0% 50%, 12% 0%, 100% 10%, 94% 100%)', rot: 6 },
  binding: { l: 148, t: 88,  w: 40,  h: 22 },
  core:    { l: 138, t: 114, w: 60,  h: 58 },
  handle:  { l: 158, t: 96,  w: 20,  h: 172 },
  grip:    { l: 154, t: 262, w: 28,  h: 62 },
  /** The Sockets part has no silhouette of its own — it IS the seats bored into
   *  the tool, drawn below. This box is the collar they sit on. */
  sockets: { l: 150, t: 176, w: 36,  h: 18 },
};

/** Where each part's label hangs, and the leader line that reaches it. */
const PART_LABEL: Record<PartType, { side: 'l' | 'r'; t: number; line: { l: number; t: number; w: number } }> = {
  head:    { side: 'l', t: 38,  line: { l: 68,  t: 52,  w: 30 } },
  edge:    { side: 'l', t: 72,  line: { l: 60,  t: 86,  w: 30 } },
  core:    { side: 'l', t: 126, line: { l: 68,  t: 140, w: 70 } },
  binding: { side: 'r', t: 86,  line: { l: 188, t: 100, w: 80 } },
  handle:  { side: 'r', t: 168, line: { l: 178, t: 182, w: 90 } },
  sockets: { side: 'r', t: 212, line: { l: 178, t: 226, w: 90 } },
  grip:    { side: 'r', t: 278, line: { l: 182, t: 292, w: 86 } },
};

/** Where the gem seats sit ON the tool, in row order. */
const SOCKET_SPOTS = [
  { l: 118, t: 46 }, { l: 200, t: 36 }, { l: 161, t: 132 },
  { l: 161, t: 200 }, { l: 161, t: 286 },
];

/**
 * A PART'S COLOURS COME FROM ITS REAL MATERIAL. The mockup hard-codes a hue per
 * part; the game already ships `MaterialDef.palette` as [deep, mid, light] for
 * every material, which is what the icon generator draws from. So a graveclay
 * head and an alephite head are visibly different objects for free, and nothing
 * here needs authoring per material.
 */
function partSkin(materialId: string): { deep: string; mid: string; light: string } {
  const [deep, mid, light] = materialDef(materialId).palette;
  return { deep, mid, light };
}

interface Seated { materialId: string; purity: number; onBench: boolean }

/** The working set: the bench part if you have seated one, else what you carry. */
function workingPart(state: GameState, t: PartType): Seated | null {
  const benchId = state.casting.bench[t];
  if (benchId !== undefined) {
    const p = rackPart(state, benchId);
    if (p) return { materialId: p.materialId, purity: p.purity, onBench: true };
  }
  const built = state.casting.tool.find((p) => p.type === t);
  return built ? { materialId: built.materialId, purity: built.purity, onBench: false } : null;
}

function ToolDiagram({
  state, onPart, onSocket,
}: { state: GameState; onPart: (t: PartType) => void; onSocket: (i: number) => void }) {
  const tool = currentTool(state);
  const broken = tool ? isBroken(state, tool) : false;
  const sockets = socketRow(state);
  const nSock = socketCount(tool);
  const worn = tool ? wornPart(tool) : null;

  return (
    <div className="relative mx-auto" style={{ width: 336, height: 366 }} data-testid="tool-diagram">
      {PART_TYPES.map((t) => {
        const box = PART_BOX[t];
        const held = workingPart(state, t);
        const base: React.CSSProperties = {
          position: 'absolute',
          left: box.l, top: box.t, width: box.w, height: box.h,
          padding: 0, border: 'none', cursor: 'pointer',
          zIndex: PART_Z[t],
          ...(box.rot ? { transform: `rotate(${box.rot}deg)` } : {}),
        };

        if (!held) {
          /** AN EMPTY SEAT IS DRAWN, not omitted — the mockup's dashed Binding.
           *  A missing part has to be visible or "6 of 7" means nothing. */
          return (
            <button
              key={t}
              data-testid={`diagram-${t}`}
              data-seated="0"
              title={`${PART_DEFS[t].name} — empty. ${PART_DEFS[t].governs}`}
              onClick={() => onPart(t)}
              style={{
                ...base,
                zIndex: PART_Z[t] + 2,
                border: '1px dashed rgba(224,176,84,0.45)',
                borderRadius: 3,
                background: 'rgba(224,176,84,0.03)',
              }}
            />
          );
        }

        const skin = partSkin(held.materialId);
        const isWorn = worn === t;
        return (
          <button
            key={t}
            data-testid={`diagram-${t}`}
            data-seated="1"
            data-material={held.materialId}
            data-bench={held.onBench ? '1' : '0'}
            title={`${PART_DEFS[t].name} — ${materialDef(held.materialId).name} ${held.purity}`
              + (held.onBench ? ' · on the bench, not combined yet' : '')
              + (isWorn ? ' · this is the worn one' : '')}
            onClick={() => onPart(t)}
            style={{
              ...base,
              ...(box.clip ? { clipPath: box.clip } : { borderRadius: t === 'core' ? 4 : 3 }),
              background: t === 'grip'
                ? `repeating-linear-gradient(38deg, rgba(0,0,0,0.28) 0 2px, transparent 2px 5px), `
                  + `linear-gradient(90deg, ${skin.deep}, ${skin.mid} 50%, ${skin.light} 70%, ${skin.deep})`
                : t === 'handle'
                  ? `linear-gradient(90deg, ${skin.deep}, ${skin.mid} 42%, ${skin.light} 62%, ${skin.deep})`
                  : `linear-gradient(150deg, ${skin.light}, ${skin.mid} 52%, ${skin.deep})`,
              /** A BENCH PART GLOWS AND A BUILT ONE DOES NOT — the only way to
               *  see that what you are looking at is not yet the tool you own. */
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.10), inset 0 0 0 1px rgba(0,0,0,0.45)',
              /** EVERY OUTLINE HERE IS A drop-shadow, and that is load-bearing:
               *  a box-shadow is painted in the element BOX and `clip-path`
               *  clips it away, so on the Head and the Edge — the two clipped
               *  parts — a box-shadow renders nothing at all. Found when a Head
               *  seated on the bench showed no gold. */
              filter: [
                // Gold FIRST for a bench part, so it sits against the shape
                // rather than outside a black rim that has already eaten it.
                held.onBench ? 'drop-shadow(0 0 1.5px #f5c05a) drop-shadow(0 0 6px rgba(224,176,84,0.95))' : '',
                'drop-shadow(0 0 0.6px rgba(0,0,0,0.95))',
                'drop-shadow(0 1px 1px rgba(0,0,0,0.55))',
                !held.onBench && t === 'head' ? 'drop-shadow(0 0 5px rgba(224,176,84,0.20))' : '',
                broken ? 'grayscale(0.55) brightness(0.72)' : '',
              ].filter(Boolean).join(' '),
              opacity: isWorn && !held.onBench ? 0.8 : 1,
            }}
          />
        );
      })}

      {/* THE GEM SEATS, bored into the tool. A filled one carries its colour. */}
      {Array.from({ length: Math.min(nSock, SOCKET_SPOTS.length) }).map((_, i) => {
        const spot = SOCKET_SPOTS[i]!;
        const fill = sockets[i] ?? null;
        const tint = fill === null ? null
          : fill.kind === 'gem' ? gemDef(fill.id).color
            : fill.kind === 'relic' ? '#c9a7e0' : null;
        return (
          <button
            key={i}
            data-testid={`diagram-socket-${i}`}
            data-filled={fill ? fill.kind : 'empty'}
            title={fill ? fillLabel(state, fill) : `Socket ${i + 1} — empty`}
            onClick={() => onSocket(i)}
            style={{
              position: 'absolute', left: spot.l, top: spot.t, width: 14, height: 14,
              padding: 0, border: 'none', cursor: 'pointer', borderRadius: 9999, zIndex: 7,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 11, lineHeight: 1, fontWeight: 700, color: '#f5c05a',
              background: tint ?? (fill ? '#151008' : 'rgba(10,9,8,0.9)'),
              boxShadow: tint
                ? `0 0 6px ${tint}bf, inset 0 0 0 1px rgba(0,0,0,0.5)`
                : fill
                  ? '0 0 5px rgba(224,176,84,0.5), inset 0 0 0 1px rgba(224,176,84,0.95)'
                  : 'inset 0 0 0 1px rgba(138,127,112,0.5)',
            }}
          >
            {fill?.kind === 'rune' ? RUNE_GLYPHS[fill.id] : ''}
          </button>
        );
      })}

      {/* CONDITION, on the tool itself rather than in a panel of its own */}
      {tool && (
        <div style={{ position: 'absolute', left: 108, top: 334, width: 120 }} data-testid="diagram-wear">
          <div style={{
            height: 5, width: '100%', overflow: 'hidden', borderRadius: 2,
            background: '#0a0908', boxShadow: 'inset 0 0 0 1px rgba(138,127,112,0.28)',
          }}>
            <div style={{
              height: '100%',
              width: `${Math.round((1 - wear01(state, tool)) * 100)}%`,
              background: broken ? '#c46a5a' : '#e0b054',
            }} />
          </div>
          <div
            className="tnum"
            style={{ marginTop: 3, textAlign: 'center', fontSize: 9, letterSpacing: '0.06em', color: '#8a7f70' }}
          >
            {broken ? 'broken · still swings' : `${fmt(usesLeft(state, tool))} left`}
          </div>
        </div>
      )}

      {/* LEADER LINES + LABELS — each part named by its material */}
      {PART_TYPES.map((t) => {
        const lab = PART_LABEL[t];
        const held = workingPart(state, t);
        const skin = held ? partSkin(held.materialId) : null;
        return (
          <div key={`lab-${t}`}>
            <div style={{
              position: 'absolute', left: lab.line.l, top: lab.line.t,
              width: lab.line.w, height: 1, background: 'rgba(224,176,84,0.3)',
            }} />
            <div
              style={{
                position: 'absolute', top: lab.t, width: 66,
                ...(lab.side === 'l' ? { left: 0, textAlign: 'right' as const } : { left: 270 }),
              }}
              data-testid={`diagram-label-${t}`}
            >
              <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#6a6055' }}>
                {PART_DEFS[t].name}
              </div>
              <div style={{
                fontSize: 10, lineHeight: 1.25,
                color: held?.onBench ? '#f5c05a' : skin ? skin.light : '#8a7f70',
                fontStyle: held ? undefined : 'italic',
                fontWeight: held?.onBench ? 600 : undefined,
              }}>
                {held ? materialDef(held.materialId).name : 'empty'}
              </div>
              {held?.onBench && (
                <div
                  style={{ fontSize: 8, lineHeight: 1.1, letterSpacing: '0.1em', color: '#e0b054', whiteSpace: 'nowrap' }}
                  data-testid={`diagram-bench-${t}`}
                >
                  ▸ bench
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE DIALS — the same numbers the old cards printed, arranged around the tool
// ---------------------------------------------------------------------------

/** The tool the dials describe: the bench preview while assembling, else yours. */
function dialSubject(state: GameState): { tool: ToolStats | null; preview: boolean } {
  const bench = benchPreview(state);
  if (bench && PART_TYPES.some((t) => state.casting.bench[t] !== undefined)) {
    return { tool: bench, preview: true };
  }
  return { tool: currentTool(state), preview: false };
}

function UpperDials({ state, tool }: { state: GameState; tool: ToolStats | null }) {
  const coh = tool ? tool.coherence.factor : 1;
  const pct = Math.round(coh * 100);
  // Nothing disagrees with nothing, so an empty bench reads 1.00 in the engine.
  // On a dial that is a lie; it has to say "no reading", not "perfect".
  const measurable = !!tool && tool.parts.length >= 2;
  const cls = toolClass(state);
  const lvl = levelProgress(state);
  const R = 20;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1" data-testid="dial-coherence">
        <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#6a6055' }}>
          Coherence
        </div>
        <div className="flex items-baseline gap-1.5">
          <span
            className="tnum"
            style={{
              fontSize: 38, lineHeight: 1.05, fontWeight: 600,
              color: coherenceColor(coh), textShadow: '0 1px 0 #000',
            }}
            data-testid="dial-coherence-pct"
          >
            {measurable ? `${pct}%` : '—'}
          </span>
          <span style={{ fontSize: 10, color: '#8a7f70' }} data-testid="dial-coherence-word">
            {measurable ? coherenceWord(coh) : 'nothing seated'}
          </span>
        </div>
        <div style={{
          marginTop: 4, height: 4, borderRadius: 2, overflow: 'hidden',
          background: '#0a0908', boxShadow: 'inset 0 0 0 1px rgba(138,127,112,0.25)',
        }}>
          <div style={{ height: '100%', width: measurable ? `${pct}%` : '0%', background: coherenceColor(coh) }} />
        </div>
      </div>

      <div className="flex shrink-0 items-start gap-2">
        <div style={{ textAlign: 'right' }} data-testid="dial-class">
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#6a6055' }}>
            Class
          </div>
          <div
            style={{
              fontSize: 12, fontWeight: 600,
              color: cls.def ? `#${cls.def.color.toString(16).padStart(6, '0')}` : '#6a6055',
            }}
            data-testid="dial-class-name"
          >
            {cls.def ? cls.def.name : 'none'}
          </div>
          <div style={{ fontSize: 8, color: '#6a6055', maxWidth: 96 }}>
            {cls.def
              ? cls.tipped.slice(0, 2).map((x) => x.trait).join(' · ')
              : cls.why ? 'scattered' : 'leans nowhere'}
          </div>
        </div>
        <div className="relative shrink-0" data-testid="dial-level">
          <svg viewBox="0 0 46 46" width={46} height={46} aria-hidden="true">
            <circle cx="23" cy="23" r={R} fill="none" stroke="#241f1b" strokeWidth="3" />
            <circle
              cx="23" cy="23" r={R} fill="none" stroke="#e0b054" strokeWidth="3" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={C * (1 - lvl.frac)}
              transform="rotate(-90 23 23)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="tnum" style={{ fontSize: 13, fontWeight: 600, lineHeight: 1, color: '#e0b054' }}>
              {lvl.level}
            </span>
            <span style={{ fontSize: 7, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#6a6055' }}>
              level
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function LowerDials({ state, tool }: { state: GameState; tool: ToolStats | null }) {
  const inst = toolInstability(state);
  const bal = tool ? balanceOf(tool.parts) : null;
  // The meter runs to the floor below which nothing ever goes wrong, so a
  // needle sitting under it reads as headroom rather than as a small problem.
  const instPct = Math.min(100, Math.round((inst.net / (INST_FLOOR * 2)) * 100));
  const instColor = inst.net < INST_FLOOR ? '#9ac07a' : inst.misfire > 0.2 ? '#c46a5a' : '#e0b054';
  const balLeft = bal ? Math.round(((bal.value + 1) / 2) * 100) : 50;

  return (
    <div className="mt-1.5 flex gap-2.5">
      <div className="min-w-0 flex-1" data-testid="dial-instability">
        <div className="flex items-baseline justify-between">
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#6a6055' }}>
            Instability
          </span>
          <span className="tnum" style={{ fontSize: 10, color: instColor }} data-testid="dial-instability-n">
            {Math.round(inst.net)}
          </span>
        </div>
        <div style={{
          marginTop: 3, height: 4, borderRadius: 2, overflow: 'hidden',
          background: '#0a0908', boxShadow: 'inset 0 0 0 1px rgba(138,127,112,0.25)',
        }}>
          <div style={{ height: '100%', width: `${instPct}%`, background: instColor }} />
        </div>
        <div style={{ marginTop: 2, fontSize: 8, lineHeight: 1.3, color: '#6a6055' }}>
          {inst.net < INST_FLOOR
            ? 'steady — nothing misfires'
            : `${Math.round(inst.misfire * 100)}% of firings go wrong`}
        </div>
      </div>

      <div
        className="min-w-0 flex-1 pl-2.5"
        style={{ borderLeft: '1px solid rgba(138,127,112,0.18)' }}
        data-testid="dial-balance"
      >
        <div className="flex items-baseline justify-between">
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#6a6055' }}>
            Balance
          </span>
          <span style={{ fontSize: 10, color: '#b0a494' }} data-testid="dial-balance-label">
            {bal ? bal.label : '—'}
          </span>
        </div>
        <div className="relative" style={{ marginTop: 3, height: 4 }}>
          <div style={{
            position: 'absolute', inset: 0, borderRadius: 2,
            background: 'linear-gradient(90deg,#5b7fa8,#35302a 50%,#c47a44)',
            opacity: 0.55,
          }} />
          <div style={{
            position: 'absolute', left: '50%', top: -2, width: 1, height: 8,
            background: 'rgba(138,127,112,0.5)',
          }} />
          <div
            style={{
              position: 'absolute', left: `${balLeft}%`, top: -2, width: 8, height: 8,
              marginLeft: -4, borderRadius: 9999, background: '#e0b054',
              boxShadow: '0 0 4px rgba(224,176,84,0.8)',
            }}
            data-testid="dial-balance-marker"
          />
        </div>
        <div className="flex justify-between" style={{ marginTop: 2, fontSize: 8, color: '#6a6055' }}>
          <span>light</span><span>heavy</span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE RACK — a shelf of cast parts you tap onto the tool
// ---------------------------------------------------------------------------

function RackShelf({
  state, want, onWant,
}: { state: GameState; want: PartType | null; onWant: (t: PartType | null) => void }) {
  const [note, setNote] = useState<string | null>(null);
  const all = state.casting.rack;
  const shown = want ? all.filter((p) => p.type === want) : all;
  const seatedIds = new Set(Object.values(state.casting.bench));

  return (
    <div className="mt-2 rounded-lg border border-cave-800 p-2" data-testid="rack-shelf">
      <div className="flex items-baseline justify-between">
        <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#6a6055' }}>
          The rack
        </span>
        <span className="tnum" style={{ fontSize: 9, color: '#6a6055' }} data-testid="rack-count">
          {all.length} cast{want ? ` · ${PART_DEFS[want].name} only` : ' · tap to seat'}
        </span>
      </div>

      {want && (
        <button
          className="btn mt-1 w-full py-0.5 text-[9px]"
          data-testid="rack-clear-filter"
          onClick={() => onWant(null)}
        >
          Show everything
        </button>
      )}

      {shown.length === 0 ? (
        <div className="mt-1.5 text-[10px] italic text-cave-600" data-testid="rack-empty">
          {want
            ? `Nothing cast for the ${PART_DEFS[want].name.toLowerCase()} yet — pour one below.`
            : 'Nothing on the rack. Melt a stone and pour a part.'}
        </div>
      ) : (
        <div className="mt-1.5 flex gap-1.5 overflow-x-auto pb-1" data-testid="rack-strip">
          {shown.slice(0, 40).map((p) => {
            const skin = partSkin(p.materialId);
            const onBench = seatedIds.has(p.id);
            return (
              <button
                key={p.id}
                data-testid={`rack-chip-${p.id}`}
                data-part-type={p.type}
                className="shrink-0 rounded-md border p-1 text-left"
                style={{
                  minWidth: 78,
                  borderColor: onBench ? 'rgba(224,176,84,0.7)' : '#35302a',
                  background: onBench ? 'rgba(224,176,84,0.06)' : 'transparent',
                }}
                title={onBench ? 'Already on the bench' : `Seat this ${PART_DEFS[p.type].name}`}
                onClick={() => {
                  const r = dispatch({ type: 'benchPlace', partId: p.id });
                  setNote(r.ok ? null : (r.reason ?? null));
                  if (r.ok) onWant(null);
                }}
              >
                <div style={{ fontSize: 8, textTransform: 'uppercase', letterSpacing: '0.14em', color: '#6a6055' }}>
                  {PART_DEFS[p.type].name}
                </div>
                <div className="flex items-center gap-1">
                  <span style={{
                    width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                    background: `linear-gradient(135deg, ${skin.light}, ${skin.deep})`,
                  }} />
                  <span className="truncate" style={{ fontSize: 10, color: skin.light }}>
                    {materialDef(p.materialId).name}
                  </span>
                </div>
                <div className="tnum" style={{ fontSize: 8, color: '#6a6055' }}>
                  {p.purity} · {shapeDef(p.shape, p.type).name}
                </div>
              </button>
            );
          })}
        </div>
      )}
      {note && <div className="mt-1 text-[9px] text-[#c46a5a]" data-testid="rack-note-new">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE CRUCIBLE + THE MOULDS — two compact columns, not two full panels
// ---------------------------------------------------------------------------

function SeatBar({
  state, want, onWant,
}: { state: GameState; want: PartType; onWant: (t: PartType | null) => void }) {
  const held = workingPart(state, want);
  const onBench = state.casting.bench[want] !== undefined;
  return (
    <div
      className="mt-1.5 flex items-center gap-1.5 rounded-md border border-[rgba(224,176,84,0.4)] px-2 py-1"
      data-testid="seat-bar"
    >
      <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#e0b054' }}>
        {PART_DEFS[want].name}
      </span>
      <span className="min-w-0 flex-1 truncate" style={{ fontSize: 10, color: '#b0a494' }}
        data-testid="seat-bar-what">
        {held
          ? `${materialDef(held.materialId).name} ${held.purity}${onBench ? ' · on the bench' : ''}`
          : PART_DEFS[want].governs}
      </span>
      {onBench && (
        <button
          className="btn shrink-0 px-1.5 py-0.5 text-[9px]"
          data-testid="seat-bar-clear"
          onClick={() => dispatch({ type: 'benchClear', partType: want })}
        >
          Take off
        </button>
      )}
      <button
        className="btn shrink-0 px-1.5 py-0.5 text-[9px]"
        data-testid="seat-bar-done"
        onClick={() => onWant(null)}
      >
        ✕
      </button>
    </div>
  );
}

function CrucibleBar({ state, want }: { state: GameState; want: PartType | null }) {
  const c = state.casting.crucible;
  const fill = crucibleFill(c);
  const front = frontCharge(c);
  const q = queued(c);
  const [target, setTarget] = useState<string>('');
  const [part, setPart] = useState<PartType>('head');
  const [shape, setShape] = useState<PartShape | null>(null);
  const [layers, setLayers] = useState(1);
  const [note, setNote] = useState<string | null>(null);

  // The mould the rack filter is asking for wins, so tapping an empty seat on
  // the tool lands you on the right mould without a second decision.
  const chosenPart = want ?? part;
  const shapes = shapesFor(chosenPart);
  const chosenShape = shape && shapes.some((s) => s.id === shape) ? shape : defaultShape(chosenPart);
  const cost = castMelt(chosenPart, chosenShape, layers);
  const ok = canCast(c, chosenPart, chosenShape, layers);

  const owned: Array<{ id: string; n: number }> = useMemo(() => {
    const out: Array<{ id: string; n: number }> = [];
    for (const shell of allShells()) {
      for (const m of materialsOfShell(shell.id)) {
        const n = materialCount(state, m.id);
        if (n > 0) out.push({ id: m.id, n });
      }
    }
    return out.sort((a, b) => b.n - a.n);
  }, [state, state.materials.stacks]);

  const pick = target || owned[0]?.id || '';

  return (
    <div className="mt-2 flex gap-2" data-testid="crucible-bar">
      {/* THE TUB */}
      <div className="min-w-0 flex-1 rounded-lg border border-cave-800 p-2">
        <div className="flex items-baseline justify-between">
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#6a6055' }}>
            Crucible
          </span>
          <span className="tnum" style={{ fontSize: 9, color: '#6a6055' }} data-testid="crucible-held">
            {Math.round(tubHeld(c))}/{TUB_CAPACITY}
          </span>
        </div>
        <div
          style={{
            marginTop: 4, height: 10, borderRadius: 3, overflow: 'hidden',
            background: '#0a0908', boxShadow: 'inset 0 0 0 1px rgba(138,127,112,0.28)',
            display: 'flex',
          }}
          data-testid="crucible-tub"
        >
          <div style={{
            width: `${Math.round(fill.molten01 * 100)}%`,
            background: 'linear-gradient(90deg,#8a3c12,#e0902e,#f5c05a)',
          }} data-testid="crucible-molten" />
          <div style={{
            width: `${Math.round(fill.solid01 * 100)}%`,
            background: 'linear-gradient(90deg,#4a4038,#6a6055)',
          }} data-testid="crucible-solid" />
        </div>
        <div style={{ marginTop: 3, fontSize: 9, color: '#8a7f70' }} data-testid="crucible-front">
          {front
            ? `${materialDef(front.materialId).name} · ${Math.round(front.solid + front.molten)}`
            : 'cold and empty'}
          {q.length > 1 ? ` · ${q.length} queued` : ''}
        </div>

        <Select
          value={pick}
          onChange={setTarget}
          options={owned.map((o) => ({
            value: o.id, label: `${materialDef(o.id).name} · ${o.n} held`,
          }))}
          className="mt-1.5 w-full"
          placeholder="Nothing in the Hold"
          ariaLabel="Stone to melt"
        />
        <div className="mt-1 flex gap-1">
          {[1, 5].map((n) => (
            <button
              key={n}
              className="btn flex-1 py-0.5 text-[9px]"
              data-testid={`melt-${n}`}
              onClick={() => {
                const r = dispatch({ type: 'chargeCrucible', materialId: pick, units: n });
                setNote(r.ok ? null : (r.reason ?? null));
              }}
            >
              ×{n}
            </button>
          ))}
          <button
            className="btn flex-1 py-0.5 text-[9px]"
            data-testid="melt-fill"
            onClick={() => {
              const r = dispatch({ type: 'chargeCrucible', materialId: pick, units: unitsThatFit(c) });
              setNote(r.ok ? null : (r.reason ?? null));
            }}
          >
            Fill
          </button>
        </div>
        {q.length > 1 && (
          <div className="mt-1 flex flex-wrap gap-1" data-testid="crucible-queue">
            {q.map((ch, i) => (
              <button
                key={`${ch.materialId}-${i}`}
                className="rounded border px-1 py-0.5 text-[8px]"
                style={{
                  borderColor: i === 0 ? '#e0b054' : '#35302a',
                  color: i === 0 ? '#e0b054' : '#8a7f70',
                }}
                data-testid={`queue-${i}`}
                title={i === 0 ? 'Pours first' : 'Bring this one to the front'}
                onClick={() => dispatch({ type: 'bringToFront', index: i })}
              >
                {materialDef(ch.materialId).name}
              </button>
            ))}
          </div>
        )}
        {q.length > 0 && (
          <button
            className="btn mt-1 w-full py-0.5 text-[9px]"
            data-testid="crucible-drain"
            onClick={() => dispatch({ type: 'drainCrucible', index: 0 })}
          >
            Tip out the front stone
          </button>
        )}
      </div>

      {/* THE MOULDS */}
      <div className="min-w-0 flex-1 rounded-lg border border-cave-800 p-2">
        <div className="flex items-baseline justify-between">
          <span style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#6a6055' }}>
            Moulds
          </span>
          <span className="tnum" style={{ fontSize: 9, color: ok ? '#6a6055' : '#c46a5a' }} data-testid="mould-cost">
            {cost.toFixed(1)} melt
          </span>
        </div>

        <div className="mt-1 grid grid-cols-4 gap-1" data-testid="mould-parts">
          {PART_TYPES.map((t) => (
            <button
              key={t}
              className="rounded border py-0.5 text-[8px] uppercase tracking-wider"
              style={{
                borderColor: t === chosenPart ? '#e0b054' : '#35302a',
                color: t === chosenPart ? '#e0b054' : '#8a7f70',
              }}
              data-testid={`mould-part-${t}`}
              onClick={() => { setPart(t); setShape(null); }}
            >
              {PART_DEFS[t].name.slice(0, 4)}
            </button>
          ))}
        </div>

        <div className="mt-1 flex flex-wrap gap-1" data-testid="mould-shapes">
          {shapes.map((s) => (
            <button
              key={s.id}
              className="rounded border px-1 py-0.5 text-[8px]"
              style={{
                borderColor: s.id === chosenShape ? '#e0b054' : '#35302a',
                color: s.id === chosenShape ? '#e0b054' : '#8a7f70',
              }}
              data-testid={`mould-shape-${s.id}`}
              title={s.blurb}
              onClick={() => setShape(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>

        {layers > 1 && (
          <div className="tnum mt-1 text-[8px] leading-snug text-cave-500" data-testid="mould-draw">
            {layerDraw(chosenPart, chosenShape, layers).map((n, i) => {
              const from = queued(c)[i];
              return `${LAYER_NAMES[i] ?? `layer ${i + 1}`} ${n.toFixed(1)}`
                + (from ? ` of ${materialDef(from.materialId).name}` : ' — nothing queued');
            }).join(' · ')}
          </div>
        )}

        {queued(c).length > 1 && (
          <div className="mt-1 flex gap-1" data-testid="mould-layers">
            {[1, 2, 3].slice(0, Math.min(LAYER_MAX, queued(c).length)).map((n) => (
              <button
                key={n}
                className="flex-1 rounded border py-0.5 text-[8px]"
                style={{
                  borderColor: n === layers ? '#e0b054' : '#35302a',
                  color: n === layers ? '#e0b054' : '#8a7f70',
                }}
                data-testid={`mould-layers-${n}`}
                onClick={() => setLayers(n)}
              >
                {n === 1 ? 'solid' : `${n} layers`}
              </button>
            ))}
          </div>
        )}

        <div className="mt-1 text-[8px] leading-snug text-cave-500" data-testid="mould-blurb">
          {shapeDef(chosenShape, chosenPart).blurb}
        </div>

        <button
          className="btn btn-warm mt-1.5 w-full py-1 text-[10px]"
          disabled={!ok}
          data-testid="mould-pour"
          onClick={() => {
            const r = dispatch({
              type: 'castPart', partType: chosenPart, shape: chosenShape, layers,
            });
            setNote(r.ok ? `Poured a ${shapeDef(chosenShape, chosenPart).name} ${PART_DEFS[chosenPart].name}.` : (r.reason ?? null));
          }}
        >
          {ok ? `Pour ${shapeDef(chosenShape, chosenPart).name} ${PART_DEFS[chosenPart].name}` : 'Not enough melt'}
        </button>
        {note && <div className="mt-1 text-[9px] leading-snug text-cave-400" data-testid="mould-note">{note}</div>}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// THE STATION — the bench, and everything orbiting it
// ---------------------------------------------------------------------------

function TheStation({ state }: { state: GameState }) {
  /** The mould/rack the player asked for by tapping a seat on the tool. */
  const [want, setWant] = useState<PartType | null>(null);
  /** Which socket the secondary detail is looking at. */
  const [socketSlot, setSocketSlot] = useState(0);
  const [note, setNote] = useState<string | null>(null);

  const { tool, preview } = dialSubject(state);
  const built = currentTool(state);
  const ready = benchComplete(state);
  const seated = PART_TYPES.filter((t) => workingPart(state, t) !== null).length;
  const onBench = PART_TYPES.filter((t) => state.casting.bench[t] !== undefined).length;
  const shellNow = currentShell(state);

  return (
    <div data-testid="the-station">
      {/* TOP RAIL */}
      <div className="flex items-end justify-between gap-2 border-b border-[rgba(224,176,84,0.22)] px-1 pb-1.5">
        <div>
          <div style={{
            fontSize: 15, fontWeight: 600, letterSpacing: '0.2em', color: '#e0b054',
            textShadow: '0 1px 0 #000',
          }}>
            THE STATION
          </div>
          <div style={{ marginTop: 2, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#6a6055' }}
            data-testid="station-sub">
            built {fmt(state.casting.built)}× · {seated} of 7 seated
            {onBench > 0 ? ` · ${onBench} on the bench` : ''}
          </div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.16em', color: '#6a6055' }}
            data-testid="station-tier">
            Tier {castingToolTier(state)}
          </div>
          <div className="tnum" style={{ fontSize: 11, color: '#b0a494' }}>
            {shellNow.name.toLowerCase()} · {Math.round(state.depth)}m
          </div>
        </div>
      </div>

      {/* THE BENCH */}
      <div
        className="mt-2 rounded-xl p-2.5"
        style={{
          border: '1px solid #35302a',
          backgroundImage: 'radial-gradient(ellipse 70% 46% at 50% 42%, rgba(245,158,11,0.075), transparent 66%),'
            + 'repeating-linear-gradient(92deg, rgba(255,255,255,0.014) 0 2px, transparent 2px 7px),'
            + 'linear-gradient(180deg,#17130f,#100d0b)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.035),0 6px 20px rgba(0,0,0,0.5)',
        }}
        data-testid="the-bench"
      >
        <UpperDials state={state} tool={tool} />
        <ToolDiagram
          state={state}
          onPart={(t) => setWant((cur) => (cur === t ? null : t))}
          onSocket={(i) => setSocketSlot(i)}
        />
        <LowerDials state={state} tool={tool} />

        {want && <SeatBar state={state} want={want} onWant={setWant} />}

        {preview && (
          <div style={{ marginTop: 4, fontSize: 9, textAlign: 'center', color: '#e0b054' }}
            data-testid="bench-preview-note">
            The gold parts are on the bench. These numbers are what it would become.
          </div>
        )}

        {/* WHAT THE THREE ABILITY STONES LEAN TOWARD — hinted, never named. */}
        <BenchLean state={state} />
        {ready && tool && <WhatItWouldDo tool={tool} testid="bench-does" />}

        {(ready || onBench > 0) && (
          <button
            className="btn btn-warm mt-1.5 w-full py-1.5 text-xs"
            disabled={!ready}
            data-testid="combine"
            onClick={() => {
              const r = dispatch({ type: 'buildTool' });
              const d = r.data as { returned?: number } | undefined;
              setNote(r.ok
                ? d?.returned
                  ? `Built. The old tool's ${d.returned} parts are back on the rack.`
                  : 'Built. It is yours.'
                : r.reason ?? null);
            }}
          >
            {ready ? 'Combine them' : `Seven parts, one of each — ${seated} seated`}
          </button>
        )}
        {note && (
          <div className="mt-1 text-center text-[11px] text-cave-300" data-testid="build-note">{note}</div>
        )}
      </div>

      <RackShelf state={state} want={want} onWant={setWant} />
      <CrucibleBar state={state} want={want} />

      {/* ── SECONDARY, tucked. Nothing lost; it is just not in the way. ── */}
      <div className="mt-2 space-y-1.5" data-testid="station-secondary">
        {built && <SocketsCard state={state} tool={built} slot={socketSlot} onSlot={setSocketSlot} />}
        {built && <AbilitiesCard state={state} />}
        <Drawer label="Modifiers" testid="drawer-mods">
          <ModBench state={state} />
          <SynergyCard state={state} />
        </Drawer>
        {built && (
          <Drawer label="The tool in full" testid="drawer-tool">
            <ShapeCard state={state} tool={built} />
            <LivingCard tool={built} />
            <CraftCard tool={built} />
            <ClassCard state={state} />
            <BalanceCard state={state} tool={built} />
            <InstabilityCard state={state} />
            <LevelCard state={state} tool={built} />
            <AtTheFace state={state} tool={built} />
            <Durability state={state} tool={built} />
            <CoherenceReadout tool={built} testid="tool-coherence" />
            <RawStats tool={built} testid="tool-stats" />
            <BiographyCard state={state} />
            <button
              className="btn mt-1.5 w-full py-1 text-[11px]"
              data-testid="breakdown"
              onClick={() => dispatch({ type: 'breakDownTool' })}
            >
              Take it apart · every piece comes back
            </button>
          </Drawer>
        )}
        <Drawer label="The rack, in full" testid="drawer-rack">
          <Rack state={state} />
        </Drawer>
      </div>
    </div>
  );
}

/** A tucked section. Closed by default — the bench is the screen, this is not. */
function Drawer({
  label, testid, children,
}: { label: string; testid: string; children: React.ReactNode }) {
  return (
    <details className="rounded-lg border border-cave-800" data-testid={testid}>
      <summary
        className="cursor-pointer select-none px-2 py-1.5"
        style={{ fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.2em', color: '#6a6055' }}
      >
        {label}
      </summary>
      <div className="px-2 pb-2">{children}</div>
    </details>
  );
}

export function CastingPanel() {
  const state = useLive();
  if (!state) return null;
  if (!state.forge.built) {
    return (
      <div className="panel p-4 text-center text-xs italic text-cave-400">
        Sand moulds stacked against a cold wall, and a tub with nothing in it. The Forge has to
        be standing before anything gets poured here.
      </div>
    );
  }
  return <TheStation state={state as GameState} />;
}

// ---------------------------------------------------------------------------
// Shared: the "what does this number mean" language
// ---------------------------------------------------------------------------

const RATINGS = ['weak', 'fair', 'good', 'strong', 'exceptional'] as const;
const RATING_COLOR = ['#8a7f70', '#b0a494', '#9ab87a', '#e0b054', '#e0902a'];

function rate01(x: number): number {
  return Math.max(0, Math.min(RATINGS.length - 1, Math.floor(x * RATINGS.length * 0.999)));
}

/**
 * ONE THING THE TOOL DOES, WITH SOMETHING TO JUDGE IT AGAINST. A bar for
 * where it sits in the possible range, a word for what that means, and the
 * number last — because the number is the part a player cannot use.
 */
function Gauge(
  { label, value, frac, note, testid }:
  { label: string; value: string; frac: number; note?: string; testid?: string },
) {
  const i = rate01(frac);
  return (
    <div className="py-1" data-testid={testid}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[11px] text-cave-300">{label}</span>
        <span className="shrink-0 tnum text-[11px]">
          <span className="text-cave-200">{value}</span>
          <span className="ml-1 text-[9px] uppercase tracking-wider" style={{ color: RATING_COLOR[i] }}>
            {RATINGS[i]}
          </span>
        </span>
      </div>
      <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-cave-950">
        <div
          className="h-full transition-[width] duration-300"
          style={{ width: `${Math.min(1, Math.max(0.02, frac)) * 100}%`, background: RATING_COLOR[i] }}
        />
      </div>
      {note && <div className="mt-0.5 text-[10px] italic text-cave-500">{note}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3 — THE RACK, as an inventory
// ---------------------------------------------------------------------------

/**
 * A GRID YOU CAN SCAN, not a list you have to read. Every part is one tile:
 * the material's own chunk art, the shape in three letters, the purity. It
 * stays readable at fifty parts, which the vertical list it replaced did not.
 *
 * TAPPING A TILE DOES ONE THING, and which thing is a MODE rather than a second
 * button on every tile. Melting is destructive and 40% lossy, so it should take
 * a deliberate switch rather than sit one mis-tap away from "set on station" on
 * a 380px screen.
 */
function Rack({ state }: { state: GameState }) {
  const onBench = new Set(Object.values(state.casting.bench));
  const all = state.casting.rack.filter((p) => !onBench.has(p.id));
  const [mode, setMode] = useState<'set' | 'melt'>('set');
  const [filter, setFilter] = useState<PartType | 'all'>('all');
  const [note, setNote] = useState<string | null>(null);

  const counts = new Map<PartType, number>();
  for (const p of all) counts.set(p.type, (counts.get(p.type) ?? 0) + 1);
  const rack = (filter === 'all' ? all : all.filter((p) => p.type === filter))
    .slice()
    .sort((a, b) => PART_TYPES.indexOf(a.type) - PART_TYPES.indexOf(b.type)
      || materialDef(a.materialId).name.localeCompare(materialDef(b.materialId).name)
      || b.purity - a.purity);

  const tap = (p: RackPart): void => {
    if (mode === 'set') { dispatch({ type: 'benchPlace', partId: p.id }); setNote(null); return; }
    const r = dispatch({ type: 'meltBack', partId: p.id });
    setNote(r.ok
      ? `${PART_DEFS[p.type].name} back to ${fmt((r.data as { molten: number }).molten)} melt.`
      : r.reason ?? null);
  };

  return (
    <div className="panel p-3" data-testid="rack">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-[#9fc4dd]">The rack</span>
        <span className="tnum text-[10px] text-cave-400">{fmt(all.length)} spare</span>
      </div>

      {all.length === 0 ? (
        <p className="mt-1 text-[11px] italic text-cave-500">Nothing cooling on it. Pour something.</p>
      ) : (
        <>
          <div className="mt-1.5 flex gap-1">
            {(['set', 'melt'] as const).map((m) => (
              <button
                key={m}
                className={`flex-1 rounded border px-2 py-1 text-[10px] uppercase tracking-wider ${
                  mode === m ? 'border-[#9fc4dd]/60 bg-cave-800 text-cave-200' : 'border-cave-800 text-cave-500'
                }`}
                data-testid={`rack-mode-${m}`}
                onClick={() => { setMode(m); setNote(null); }}
              >
                {m === 'set' ? 'Tap to set' : `Tap to melt · ${Math.round(MELT_BACK_SHARE * 100)}% back`}
              </button>
            ))}
          </div>

          {counts.size > 1 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {(['all', ...PART_TYPES.filter((t) => counts.has(t))] as Array<PartType | 'all'>).map((t) => (
                <button
                  key={t}
                  className={`rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                    filter === t ? 'border-cave-500 text-cave-200' : 'border-cave-800 text-cave-500'
                  }`}
                  data-testid={`rack-filter-${t}`}
                  onClick={() => setFilter(t)}
                >
                  {t === 'all' ? `All ${all.length}` : `${PART_DEFS[t].name} ${counts.get(t)}`}
                </button>
              ))}
            </div>
          )}

          <div
            className="mt-1.5 grid max-h-64 grid-cols-4 gap-1 overflow-y-auto scroll-thin"
            data-testid="rack-grid"
          >
            {rack.map((p) => (
              <button
                key={p.id}
                className={`flex flex-col items-center rounded-md border p-1 hover:border-cave-500 ${
                  mode === 'melt' ? 'border-[#d8a0a0]/40' : 'border-cave-800'
                }`}
                data-testid={`rack-${p.id}`}
                title={`${PART_DEFS[p.type].name} · ${materialDef(p.materialId).name} · purity ${p.purity}`
                  + (mode === 'melt' ? ` · melts back to ${meltBackValue(p.type)}` : '')}
                onClick={() => tap(p)}
              >
                <MaterialIcon id={p.materialId} size={22} />
                <span className="mt-0.5 w-full truncate text-center text-[9px] uppercase tracking-wide text-cave-300">
                  {PART_DEFS[p.type].name.slice(0, 4)}
                </span>
                <span className="tnum text-[9px] text-cave-500">{p.purity}</span>
              </button>
            ))}
          </div>
          {note && <div className="mt-1 text-center text-[11px] text-cave-300" data-testid="rack-note">{note}</div>}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 4 — COHERENCE, WITH THE LEVER
// ---------------------------------------------------------------------------

function coherenceLine(t: ToolStats): string {
  const f = t.coherence.factor;
  if (t.parts.length < PART_TYPES.length) return 'Not finished — this is what it reads so far.';
  if (f >= 0.97) return 'These belong together. Nothing is fighting anything.';
  if (f >= 0.88) return 'Near enough a set. A world or two apart, and it barely notices.';
  if (f >= 0.65) return 'Mixed. The parts cooperate, but you can feel where they do not.';
  if (f >= 0.45) return 'Badly matched. Good pieces, and most of them wasted on each other.';
  return 'Seven strangers. They will never sit right, whatever they cost you.';
}

/** The one-word reading, for the big dial. `coherenceLine` says it in a
 *  sentence; the station has room for a word. */
function coherenceWord(f: number): string {
  if (f >= 0.97) return 'a set';
  if (f >= 0.88) return 'near enough';
  if (f >= 0.65) return 'mixed';
  if (f >= 0.45) return 'badly matched';
  return 'strangers';
}

function coherenceColor(f: number): string {
  if (f >= 0.9) return '#9ab87a';
  if (f >= 0.65) return '#e0b054';
  return '#d8a0a0';
}

/**
 * WHICH PARTS ARE PULLING, AND TOWARD WHAT. A percentage tells a player they
 * are wrong; this tells them what to change. The set has a HOME — the world
 * most of its parts come from — and everything else is named with the world it
 * came from instead, so the fix is a sentence rather than an inference.
 */
function outliers(tool: ToolStats): { home: string; strays: Array<{ type: PartType; shell: string }> } {
  const byShell = new Map<string, number>();
  for (const p of tool.parts) {
    const s = materialDef(p.materialId).shellId;
    byShell.set(s, (byShell.get(s) ?? 0) + 1);
  }
  let home = '';
  let best = -1;
  for (const [s, n] of byShell) {
    // Ties go to the DEEPER world: it is the one worth keeping and the cheaper
    // instruction ("bring the rest down to it" beats "throw away your best part").
    if (n > best || (n === best && shellOrdinal(s) > shellOrdinal(home))) { best = n; home = s; }
  }
  const strays = tool.parts
    .filter((p) => materialDef(p.materialId).shellId !== home)
    .map((p) => ({ type: p.type, shell: materialDef(p.materialId).shellId }));
  return { home, strays };
}

function CoherenceReadout({ tool, testid }: { tool: ToolStats; testid: string }) {
  const c = tool.coherence;
  const pct = Math.round(c.factor * 100);
  const { home, strays } = outliers(tool);
  return (
    <div className="mt-2 rounded-md border border-cave-800 bg-cave-900/60 p-2" data-testid={testid}>
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Coherence</span>
        <span
          className="tnum text-sm font-semibold"
          style={{ color: coherenceColor(c.factor) }}
          data-testid={`${testid}-pct`}
        >
          {pct}%
        </span>
      </div>
      <div className="text-[11px] italic leading-snug text-cave-400">{coherenceLine(tool)}</div>

      {/* THE LEVER. Never just the diagnosis. */}
      {strays.length > 0 ? (
        <div className="mt-1 rounded border-l-2 border-[#e0b054]/60 bg-cave-950/50 py-1 pl-2 pr-1"
          data-testid={`${testid}-fix`}>
          <div className="text-[10px] leading-snug text-cave-300">
            <span className="text-[#e0b054]">To raise it: </span>
            this set is mostly <span className="text-cave-100">{cap1(home)}</span>.{' '}
            {strays.length === 1 ? 'One part is not: ' : `${strays.length} parts are not: `}
            {strays.map((s, i) => (
              <span key={s.type}>
                {i > 0 && ', '}
                <span className="text-cave-100">{PART_DEFS[s.type].name}</span>
                <span className="text-cave-500"> ({cap1(s.shell)})</span>
              </span>
            ))}
            . Re-cast {strays.length === 1 ? 'it' : 'them'} in {cap1(home)} stock and the whole tool
            sits better — or lean the other way and put a <span className="text-cave-100">trueseated</span> stone
            in the Binding, which forgives mismatch.
          </div>
        </div>
      ) : tool.parts.length > 1 && (
        <div className="mt-1 text-[10px] leading-snug text-[#9ab87a]" data-testid={`${testid}-fix`}>
          Every part is {cap1(home)}. Parts from one world sit together — this is as well-matched
          as a set gets.
        </div>
      )}

      <div className="mt-1 tnum text-[10px] text-cave-500">
        shell spread {c.shellSpread.toFixed(2)} · variety {c.variety.toFixed(2)}
        {c.relief > 0 && (
          <span className="text-[#9ab87a]"> · stability forgives {Math.round(c.relief * 100)}%</span>
        )}
      </div>
      {c.factor < 1 && (
        <div className="mt-1 tnum text-[10px] text-cave-400" data-testid={`${testid}-loss`}>
          Rock rate {fmt(tool.rawStats.bite * tool.rawStats.cadence)}
          <span className="text-cave-600"> → </span>
          <span style={{ color: coherenceColor(c.factor) }}>{fmt(tool.rockRate)}</span>
          <span className="text-cave-600"> · what the mismatch costs you</span>
        </div>
      )}
    </div>
  );
}

/** The raw block, folded away. Kept because a builder eventually wants it. */
function RawStats({ tool, testid }: { tool: ToolStats; testid: string }) {
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[10px] uppercase tracking-widest text-cave-500">
        Every number
      </summary>
      <div className="mt-1 grid grid-cols-2 gap-x-2 gap-y-0.5" data-testid={testid}>
        {TOOL_STATS.map((s) => (
          <div key={s} className="flex items-baseline justify-between gap-1 border-b border-cave-850 py-0.5">
            <span className="truncate text-[10px] text-cave-400">{STAT_LABEL[s]}</span>
            <span className="tnum shrink-0 text-[10px] text-cave-200" data-testid={`${testid}-${s}`}>
              {fmt(tool.stats[s])}
            </span>
          </div>
        ))}
      </div>
    </details>
  );
}

/**
 * WHAT THE THREE STONES ON THE BENCH LEAN TOWARD — pillar 5's whole job here.
 *
 * It reads the Head, Edge and Sockets as they are slotted and describes the
 * BEHAVIOUR the pooled traits tend toward. It never names an ability, so the
 * first build in a new stone is a reasoned guess rather than a coin, and it
 * moves as you swap parts so the guess can be revised before you commit.
 */
function BenchLean({ state }: { state: GameState }) {
  const mats: string[] = [];
  for (const t of ABILITY_PARTS) {
    const id = state.casting.bench[t];
    const part = id === undefined ? undefined : rackPart(state, id);
    if (part) mats.push(part.materialId);
  }
  if (mats.length === 0) return null;
  const hint = toolAbilityHint(mats);
  if (!hint) return null;
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="bench-lean">
      <div className="text-[10px] uppercase tracking-widest text-cave-500">
        The head, the edge and the sockets
      </div>
      <div className="mt-0.5 text-[11px] italic leading-snug text-cave-400" data-testid="bench-lean-text">
        {hint}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 6 — YOUR TOOL
// ---------------------------------------------------------------------------

/**
 * THE THREE THINGS A TOOL DOES. This is the headline and everything else is
 * folded behind it, because a player glancing at a tool needs to know whether
 * it is good — not to parse ten figures in four different units.
 */
function WhatItWouldDo({ tool, testid }: { tool: ToolStats; testid: string }) {
  const e = effectOf(tool, false);
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid={testid}>
      <div className="text-[10px] uppercase tracking-widest text-cave-500">What it would do</div>
      <Gauge
        label="Reach — cells a swing touches"
        value={`${e.cells}`}
        frac={(e.cells - 1) / MAX_EXTRA_CELLS}
        testid={`${testid}-reach`}
      />
      <Gauge
        label="Ore — how fast it opens a pocket"
        value={`${e.oreRate.toFixed(1)}×`}
        frac={(e.oreRate - 1) / (ORE_RATE_CAP - 1)}
        testid={`${testid}-ore`}
      />
      <Gauge
        label="Lasts — swings before re-seating"
        value={fmt(usesOf(tool))}
        frac={Math.min(1, usesOf(tool) / 8000)}
        testid={`${testid}-lasts`}
      />
    </div>
  );
}

/**
 * WHAT USE HAS EARNED — the readout for the one thing that makes a tool yours.
 *
 * Three things, in the order a player asks them: what level am I, how far to
 * the next, and what have the levels actually given me. The last is the part
 * that is usually missing from a levelling system and the part that makes it
 * feel earned: "+30% swings, +20% pocket work, 1 modifier slot" is a record of
 * your own hours, where "Level 6" on its own is a number.
 */
function LevelCard({ state, tool }: { state: GameState; tool: ToolStats }) {
  const p = levelProgress(state);
  const g = grantsFor(p.level);
  const slots = modSlotsOf(state, tool);
  const toNextSlot = SLOT_EVERY - ((p.level - 1) % SLOT_EVERY);
  const toNextReach = REACH_EVERY - ((p.level - 1) % REACH_EVERY);

  return (
    <div className="mt-2 rounded-md border border-[#e0b054]/30 bg-cave-900/60 p-2" data-testid="tool-level">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Level</span>
        <span className="tnum text-sm font-semibold text-[#e0b054]" data-testid="tool-level-n">
          {p.level}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-cave-950">
        <div
          className="h-full bg-[#e0b054] transition-[width] duration-300"
          style={{ width: `${p.frac * 100}%` }}
          data-testid="tool-level-bar"
        />
      </div>
      <div className="mt-0.5 tnum text-[10px] text-cave-500" data-testid="tool-level-progress">
        {fmt(p.into)} / {fmt(p.need)} cells to level {p.level + 1} · {fmt(p.xp)} mined with it
      </div>

      {p.level > 1 ? (
        <div className="mt-1 text-[10px] leading-snug text-cave-300" data-testid="tool-level-grants">
          <span className="text-[#e0b054]">Earned: </span>
          +{Math.round((g.durability - 1) * 100)}% swings
          {g.oreRate > 1 && <> · +{Math.round((g.oreRate - 1) * 100)}% pocket work</>}
          {g.cells > 0 && <> · +{g.cells} cell{g.cells === 1 ? '' : 's'} of reach</>}
          {g.slots > 0 && <> · {g.slots} modifier slot{g.slots === 1 ? '' : 's'}</>}
        </div>
      ) : (
        <div className="mt-1 text-[10px] italic leading-snug text-cave-500">
          Mine with it. A tool you have worked is better than the same tool fresh off the station.
        </div>
      )}
      <div className="mt-0.5 tnum text-[10px] text-cave-600">
        {slots.total} modifier slot{slots.total === 1 ? '' : 's'}
        <span className="text-cave-700"> ({slots.fromParts} from its parts{slots.fromUse > 0 ? `, ${slots.fromUse} earned` : ''})</span>
        {' · '}next slot at level {p.level + toNextSlot} · next cell at {p.level + toNextReach}
      </div>
    </div>
  );
}

function AtTheFace({ state, tool }: { state: GameState; tool: ToolStats }) {
  const broken = isBroken(state, tool);
  const e = effectOf(tool, broken, toolLevel(state));
  const tier = castingToolTier(state);
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="at-the-face">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">At the face</span>
        <span className="text-[9px] uppercase tracking-wider text-cave-600">bare hands reach 1</span>
      </div>
      <Gauge
        label="Reach — cells a swing touches"
        value={`${e.cells}`}
        frac={(e.cells - 1) / MAX_EXTRA_CELLS}
        note={e.cells > 1 ? `taking ${Math.round(e.splash * 100)}% of each extra` : 'the cell you hit, and nothing else'}
        testid="face-reach"
      />
      <Gauge
        label="Ore — how fast it opens a pocket"
        value={`${e.oreRate.toFixed(1)}×`}
        frac={(e.oreRate - 1) / (ORE_RATE_CAP - 1)}
        testid="face-ore"
      />
      <div className="mt-1 flex items-baseline justify-between border-t border-cave-850 pt-1">
        <span className="text-[10px] text-cave-400">Hard rock it can pass</span>
        <span className="tnum text-[10px] text-cave-200" data-testid="face-tier">Tier {tier}</span>
      </div>
      <p className="mt-1 text-[10px] italic leading-snug text-cave-500">
        It clears the face faster. It cannot make the face hold more — the rock grows what it
        grows, and a swing only ever takes what is there.
      </p>
    </div>
  );
}

function Durability({ state, tool }: { state: GameState; tool: ToolStats }) {
  const broken = isBroken(state, tool);
  const w = wear01(state, tool);
  const worn = wornPart(tool);
  const left = usesLeft(state, tool);
  const part = worn ? tool.parts.find((p) => p.type === worn) : undefined;
  const have = part ? materialCount(state, part.materialId) : 0;
  const canRepair = !!part && have >= REPAIR_UNITS && state.casting.wear > 0;
  const back = worn ? Math.round(repairShare(tool, worn) * 100) : 0;

  return (
    <div className="mt-2 rounded-md border border-cave-800 bg-cave-900/60 p-2" data-testid="durability">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Condition</span>
        <span
          className="tnum text-[11px] font-semibold"
          style={{ color: broken ? '#d8a0a0' : w > 0.7 ? '#e0b054' : '#9ab87a' }}
          data-testid="durability-state"
        >
          {broken ? 'BROKEN' : `${fmt(left)} swings left`}
        </span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full border border-cave-700 bg-cave-950">
        <div
          className="h-full transition-[width] duration-300"
          style={{
            width: `${(1 - w) * 100}%`,
            background: broken ? '#7a4a4a' : w > 0.7 ? '#e0b054' : '#9ab87a',
          }}
          data-testid="durability-bar"
        />
      </div>
      <div className="mt-1 tnum text-[10px] text-cave-500">
        {fmt(usesOf(tool, toolLevel(state)))} swings when whole
        {worn && <> · the <span className="text-cave-300">{PART_DEFS[worn].name}</span> is what is giving</>}
      </div>
      {broken && (
        <p className="mt-1 text-[10px] italic leading-snug text-[#d8a0a0]" data-testid="broken-note">
          It still works — heavily penalised, never worse than your hands. It is not lost. It
          wants seeing to.
        </p>
      )}
      {part && (
        <button
          className="btn mt-1.5 w-full py-1 text-[11px]"
          disabled={!canRepair}
          data-testid="repair"
          onClick={() => dispatch({ type: 'repairTool', partType: part.type })}
        >
          {state.casting.wear <= 0
            ? 'Nothing to put right'
            : have < REPAIR_UNITS
              ? `Needs ${REPAIR_UNITS} ${materialDef(part.materialId).name} — you have ${fmt(have)}`
              : `Re-seat the ${PART_DEFS[part.type].name} · ${REPAIR_UNITS} ${materialDef(part.materialId).name} · gives back ${back}%`}
        </button>
      )}
    </div>
  );
}

/**
 * WHAT THE ROCK-FACING STONES REACH FOR — the card that makes a tool more than
 * a stat block.
 *
 * The seated abilities each get a name in their own colour, what they DO, a
 * charge meter and a Fire button, which is the drill panel's layout on purpose:
 * they are the same abilities and the player should not have to learn a second
 * vocabulary for the version in their hand.
 *
 * Anything the build GRANTS but has no room for is offered underneath, so the
 * decision ("which of these three does my one slot carry?") is on screen rather
 * than buried in a rebuild. Nothing here lists an ability the tool cannot do —
 * a locked list is the one thing pillar 5 forbids.
 */
function AbilitiesCard({ state }: { state: GameState }) {
  const fits = toolFits(state);
  const grants = toolGrants(state);
  const slots = toolAbilitySlots(state);
  const grade = toolGrade(state);
  const mats = abilityMaterials(currentTool(state));

  if (grants.length === 0) {
    // NOT A LOCKED LIST — the hint says what the stones LEAN toward and never
    // what they would make, so a first build is a reasoned guess.
    const hint = toolAbilityHint(mats);
    return (
      <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-abilities">
        <div className="text-[10px] uppercase tracking-widest text-cave-500">What it reaches for</div>
        <div className="mt-1 text-[11px] leading-snug text-cave-500" data-testid="tool-abilities-none">
          {hint ?? 'Nothing in this one is reaching for anything.'} Nothing in the
          Head, the Edge or the Sockets wants to do more than mine.
        </div>
      </div>
    );
  }

  const spare = grants.filter((g) => !fits.some((f) => f.def.id === g.id));

  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-abilities">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">What it reaches for</span>
        <span className="tnum text-[10px] text-cave-500" data-testid="tool-ability-slots">
          {fits.length}/{slots} carried{grade > 1 ? ` · grade ${ROMAN[grade] ?? grade}` : ''}
        </span>
      </div>

      {fits.map((f) => {
        const pct = Math.min(1, f.charge / Math.max(1, f.def.charge.need));
        const hex = `#${f.def.color.toString(16).padStart(6, '0')}`;
        return (
          <div key={f.slot} className="mt-1.5" data-testid={`tool-ability-${f.slot}`}>
            <div className="flex items-baseline gap-1.5">
              <span
                className="shrink-0 text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: hex }}
                data-testid={`tool-ability-name-${f.slot}`}
              >
                {f.def.name} {ROMAN[abilityLevelOf(
                  state.casting.hand?.fits?.[f.slot]?.fired ?? 0,
                )]}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-cave-500">
                every {f.def.charge.need} swings
                {f.def.charge.roll ? ' · or whenever it feels like it' : ''}
              </span>
              <span className={`tnum shrink-0 text-[9px] ${f.ready ? 'text-white' : 'text-cave-500'}`}>
                {f.ready ? 'READY' : `${Math.min(f.charge, f.def.charge.need)}/${f.def.charge.need}`}
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-1.5">
              <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-sm bg-cave-800">
                <div
                  className="h-full transition-[width] duration-150"
                  data-testid={`tool-charge-${f.slot}`}
                  style={{ width: `${Math.round(pct * 100)}%`, background: f.ready ? '#ffffff' : hex }}
                />
              </div>
              <button
                data-testid={`tool-fire-${f.slot}`}
                disabled={!f.ready}
                className={`shrink-0 rounded border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${
                  f.ready ? 'border-white/70 bg-white/10 text-white' : 'border-cave-800 text-cave-700'
                }`}
                title={f.ready
                  ? `Set ${f.def.name} off now, where you last swung`
                  : `${f.def.name} charges as you mine — it goes off by itself when it is full`}
                onClick={() => dispatch({ type: 'fireAbility', index: TOOL_CARRIER, slot: f.slot })}
              >
                {f.ready ? '▶ Fire' : `${Math.round(pct * 100)}%`}
              </button>
              <button
                data-testid={`tool-unseat-${f.slot}`}
                className="btn shrink-0 px-1 py-0.5 text-[9px]"
                title="Take it off. You can always stop doing a thing."
                onClick={() => dispatch({ type: 'setToolAbility', slot: f.slot, id: null })}
              >
                ✕
              </button>
            </div>
            <div className="mt-0.5 text-[9px] leading-snug text-cave-600">
              {effectInHand(f.def.effect)}
            </div>
          </div>
        );
      })}

      {spare.length > 0 && (
        <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="tool-ability-spare">
          <div className="text-[9px] uppercase tracking-wider text-cave-600">
            {fits.length >= slots
              ? 'Also built for — no room until it has more'
              : 'Also built for'}
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {spare.map((def) => (
              <button
                key={def.id}
                className="rounded border border-cave-800 px-1.5 py-0.5 text-[9px] hover:border-cave-600"
                style={{ color: `#${def.color.toString(16).padStart(6, '0')}` }}
                data-testid={`tool-seat-${def.id}`}
                title={effectInHand(def.effect)}
                onClick={() => dispatch({
                  type: 'setToolAbility',
                  slot: fits.length < slots ? fits.length : slots - 1,
                  id: def.id,
                })}
              >
                {def.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="mt-1.5 text-[9px] leading-snug text-cave-600">
        Off the Head, the Edge and the Sockets — re-cast one of those in different
        stone and this changes. Room to carry them comes from the Binding and from
        the swings you have put in.
      </div>
    </div>
  );
}

/**
 * THE MODIFIER BENCH — where the OP build gets assembled, and where it has to
 * be legible enough to be worth assembling.
 *
 * Three parts, in the order a player uses them:
 *
 *  1. THE STACK. What is on the tool, what each one is doing, and — the part
 *     that makes combos work at all — which ones are ASLEEP and what they are
 *     waiting for. An inert modifier the player cannot see is a slot they have
 *     lost with no explanation.
 *  2. WHAT IT ADDS UP TO. The whole stack folded into one line of plain
 *     numbers. Stacking is only fun if you can see the total move.
 *  3. THE WORKBENCH. Feed up to three stones. The lean is hinted, never the
 *     modifier (pillar 5); a known one can be AIMED at, because with thirty-two
 *     signatures live a generous mix would otherwise make an old favourite
 *     progressively harder to re-make.
 */
function ModBench({ state }: { state: GameState }) {
  const [picked, setPicked] = useState<string[]>([]);
  const [aim, setAim] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const tool = currentTool(state);
  if (!tool) return null;

  const stacks = modStacks(state);
  const total = modSlotsTotal(state);
  const used = modSlotsUsed(state);
  const abilities = toolFits(state).length;
  const cache = modCache(state, abilities);
  const library = knownMods(state);
  const held = heldMaterials(state);

  const toggle = (id: string): void => {
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : p.length >= MOD_FEED_MAX ? p : [...p, id]));
  };

  const hint = modHint(picked);
  const frac = total > 0 ? used / total : 0;

  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="mod-bench">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Worked into it</span>
        <span
          className={`tnum text-[10px] ${used > total ? 'text-[#d8a0a0]' : 'text-cave-400'}`}
          data-testid="mod-slots"
        >
          {used}/{total} slots{used > total ? ' — over' : ''}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-cave-900">
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${Math.min(1, frac) * 100}%`, background: frac >= 1 ? '#e0902a' : '#7f8f6a' }}
        />
      </div>

      {/* ── 1. THE STACK ─────────────────────────────────────────────── */}
      {stacks.length === 0 ? (
        <div className="mt-1.5 text-[11px] italic text-cave-600" data-testid="mod-stack-empty">
          Nothing worked into it yet. Feed it stone below and see what takes.
        </div>
      ) : (
        <div className="mt-1.5 space-y-1" data-testid="mod-stack">
          {stacks.map((s) => {
            const def = MOD_BY_ID.get(s.id);
            if (!def) return null;
            const dormant = whyDormant(state, def, abilities);
            const hex = `#${def.color.toString(16).padStart(6, '0')}`;
            return (
              <div
                key={s.id}
                className={`rounded border p-1.5 ${dormant ? 'border-dashed border-cave-800 opacity-70' : 'border-cave-700 bg-cave-850/40'}`}
                data-testid={`mod-${s.id}`}
              >
                <div className="flex items-baseline gap-1.5">
                  <span
                    className="shrink-0 text-[9px] font-semibold uppercase tracking-wider"
                    style={{ color: dormant ? '#6d6459' : hex }}
                    data-testid={`mod-name-${s.id}`}
                  >
                    {def.name} {ROMAN[modProgress(s).level]}{s.n > 1 ? ` ×${s.n}` : ''}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[9px] text-cave-600">
                    {def.cost * s.n} slot{def.cost * s.n === 1 ? '' : 's'}
                  </span>
                  <button
                    className="btn shrink-0 px-1 py-0.5 text-[9px]"
                    data-testid={`mod-strip-${s.id}`}
                    title="Take one back off. Free — the room comes back, the stone does not."
                    onClick={() => dispatch({ type: 'stripToolMod', id: s.id })}
                  >
                    ✕
                  </button>
                </div>
                <ModLevelBar stack={s} hex={hex} dim={!!dormant} />
                <div className="mt-0.5 text-[9px] leading-snug text-cave-500">{def.effect}</div>
                {dormant && (
                  <div className="mt-0.5 text-[9px] font-semibold text-[#c8a15a]" data-testid={`mod-dormant-${s.id}`}>
                    {dormant}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── 2. WHAT IT ADDS UP TO ────────────────────────────────────── */}
      {stacks.length > 0 && <StackTotal cache={cache} state={state} />}
      <SynergyCard state={state} />
      <InstabilityCard state={state} />

      {/* ── 3. THE WORKBENCH ─────────────────────────────────────────── */}
      <div className="mt-2 border-t border-cave-800 pt-1.5">
        <div className="text-[9px] uppercase tracking-wider text-cave-600">
          Work stone into it — up to {MOD_FEED_MAX}
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {held.slice(0, 14).map((m) => (
            <button
              key={m.id}
              className={`flex items-center gap-1 rounded border px-1.5 py-0.5 text-[9px] ${
                picked.includes(m.id) ? 'border-[#e0902a]/70 bg-cave-800/60 text-cave-100' : 'border-cave-800 text-cave-400'
              }`}
              data-testid={`mod-feed-${m.id}`}
              onClick={() => toggle(m.id)}
            >
              <MaterialIcon id={m.id} size={12} />
              <span>{materialDef(m.id).name}</span>
              <span className="tnum text-cave-600">{fmt(m.count)}</span>
            </button>
          ))}
        </div>

        {hint && (
          <div className="mt-1 text-[10px] italic leading-snug text-cave-400" data-testid="mod-lean">
            {hint}
          </div>
        )}

        {library.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5">
            <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-600">Aim at</span>
            <Select
              value={aim ?? ''}
              onChange={(v) => setAim(v || null)}
              className="min-w-0 flex-1 text-[10px]"
              data-testid="mod-aim"
              options={[
                { value: '', label: 'whatever it turns out to be' },
                ...library.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
          </div>
        )}

        <button
          className="btn btn-warm mt-1.5 w-full py-1 text-[11px]"
          disabled={picked.length === 0}
          data-testid="mod-apply"
          onClick={() => {
            const r = dispatch({ type: 'applyToolMod', materialIds: picked, prefer: aim });
            const d = r.data as { mod: string | null; reason?: string; seated?: boolean } | undefined;
            setNote(r.ok
              ? d?.reason ?? (d?.mod ? `${MOD_BY_ID.get(d.mod)?.name ?? d.mod} — worked in.` : 'It took nothing.')
              : r.reason ?? null);
            setPicked([]);
          }}
        >
          {picked.length === 0 ? 'Pick stone to work in' : `Work it in (${picked.length})`}
        </button>
        {note && (
          <div className="mt-1 text-center text-[11px] text-cave-300" data-testid="mod-note">{note}</div>
        )}

        <div className="mt-1 text-[9px] leading-snug text-cave-600">
          {library.length} of what there is to find, found. Room comes from the
          Binding stone and from the swings you have put in.
        </div>
      </div>
    </div>
  );
}

/** WHAT THIS ONE HAS LEARNED. A thin bar under the name, because the level is
 *  a per-modifier fact and belongs beside the modifier, not in a summary. */
function ModLevelBar({ stack, hex, dim }: { stack: ToolModStack; hex: string; dim: boolean }) {
  const p = modProgress(stack);
  return (
    <div className="mt-0.5" data-testid={`mod-level-${stack.id}`}>
      <div className="h-[3px] w-full overflow-hidden rounded-sm bg-cave-900">
        <div
          className="h-full transition-[width] duration-150"
          style={{ width: `${p.frac * 100}%`, background: dim ? '#4a453e' : hex, opacity: p.max ? 1 : 0.75 }}
        />
      </div>
      <div className="mt-0.5 text-[8px] text-cave-600" data-testid={`mod-level-text-${stack.id}`}>
        {p.max
          ? `${ROMAN[p.level]} — as far as it goes`
          : `${ROMAN[p.level]} · ${fmt(p.into)} / ${fmt(p.need)} to ${ROMAN[p.level + 1]}`}
      </div>
    </div>
  );
}

/**
 * WHAT IT HAS TURNED OUT TO BE, and what it is reaching for.
 *
 * Two halves, and the second is the pillar-5 one. AWAKE lists arrangements the
 * tool is currently running — named, because you found them. DIRECTIONS shows
 * the hint for anything the tool is carrying HALF of, and names neither the
 * other half nor the result: it says there is something there and makes you
 * find what.
 */
function SynergyCard({ state }: { state: GameState }) {
  const cache = modCache(state, toolFits(state).length);
  const hints = synergyHints(state);
  if (cache.awake.length === 0 && hints.length === 0) return null;
  return (
    <div className="mt-1.5 rounded border border-cave-800 bg-cave-900/40 p-1.5" data-testid="synergies">
      {cache.awake.length > 0 && (
        <>
          <div className="text-[9px] uppercase tracking-wider text-cave-600">What it turned into</div>
          {cache.awake.map((id) => {
            const syn = SYNERGY_BY_ID.get(id);
            if (!syn) return null;
            return (
              <div key={id} className="mt-0.5" data-testid={`synergy-${id}`}>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider"
                  style={{ color: `#${syn.color.toString(16).padStart(6, '0')}` }}
                >
                  {syn.name}
                </span>
                <div className="text-[9px] leading-snug text-cave-400">{syn.effect}</div>
              </div>
            );
          })}
        </>
      )}
      {hints.length > 0 && (
        <div className={cache.awake.length > 0 ? 'mt-1.5 border-t border-cave-800 pt-1' : ''}>
          <div className="text-[9px] uppercase tracking-wider text-cave-600">
            Something on it is reaching
          </div>
          {hints.slice(0, 3).map((h) => (
            <div key={h} className="mt-0.5 text-[9px] italic leading-snug text-cave-500" data-testid="synergy-hint">
              {h}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * THE COUNTERWEIGHT, ON SCREEN. A meter, what is driving it, and what it costs
 * — because "your abilities misfire 12% of the time" is only a decision if the
 * player can see the number and see which thing on the tool is buying it.
 */
function InstabilityCard({ state }: { state: GameState }) {
  const i = toolInstability(state);
  if (i.raw <= 0) return null;
  const frac = Math.min(1, i.net / 200);
  const hot = i.misfire > 0;
  return (
    <div className="mt-1.5 rounded border border-cave-800 p-1.5" data-testid="instability">
      <div className="flex items-baseline justify-between">
        <span className="text-[9px] uppercase tracking-wider text-cave-600">Instability</span>
        <span
          className={`tnum text-[9px] ${hot ? 'text-[#d8a0a0]' : 'text-cave-500'}`}
          data-testid="instability-n"
        >
          {Math.round(i.net)}{hot ? ` · ${Math.round(i.misfire * 100)}% misfire` : ' · steady'}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-cave-900">
        <div
          className="h-full transition-[width] duration-150"
          data-testid="instability-bar"
          style={{ width: `${frac * 100}%`, background: hot ? '#c86a5a' : '#7f8f6a' }}
        />
      </div>
      <div className="mt-0.5 text-[9px] leading-snug text-cave-600" data-testid="instability-from">
        {i.from.length > 0
          ? `Mostly ${i.from.slice(0, 3).map((f) => f.label).join(', ')}`
          : 'Nothing much.'}
        {i.steady > 0 ? ` · steadied by ${Math.round(i.steady)}` : ''}
      </div>
      {hot && (
        <div className="mt-0.5 text-[9px] leading-snug text-[#c8a15a]">
          It still mines exactly as it did. It is what it CARRIES that has started
          going off in the wrong place. Work a stabiliser in, or take something off.
        </div>
      )}
    </div>
  );
}

/** THE WHOLE STACK AS ONE LINE. Stacking is only fun if the total is visible —
 *  this is what makes a build feel like a build rather than a list. */
function StackTotal({ cache, state }: { cache: ModCache; state: GameState }) {
  const bits: string[] = [];
  /**
   * THE CLAMPED NUMBERS, NOT THE RAW SUM.
   *
   * A driven screenshot read "+16 reach · +205% off each cell" on a fully
   * stacked tool. Both are lies the engine correctly refuses to tell: reach is
   * floored into the 3x3 by `effectOf` and splash cannot exceed a whole cell.
   * The card was reading `cache`, which is the sum BEFORE those clamps — so it
   * promised roughly twice what the tool does, and the player's next stack of
   * reach modifiers would have bought nothing while the readout said otherwise.
   *
   * So it reports what a swing ACTUALLY does, and says when a term has stopped
   * paying — which is exactly the information a build needs at that point.
   */
  const tool = currentTool(state);
  const e = tool ? effectOf(tool, false, toolLevel(state), cache) : null;
  const bare = tool ? effectOf(tool, false, toolLevel(state)) : null;
  if (e && bare) {
    const dCells = e.cells - bare.cells;
    if (dCells > 0) {
      bits.push(`+${dCells} reach${e.cells >= 1 + MAX_EXTRA_CELLS ? ' (full 3×3)' : ''}`);
    } else if (cache.cells > 0) {
      bits.push('reach already at the full 3×3');
    }
    const dSplash = e.splash - bare.splash;
    if (dSplash > 0) {
      bits.push(`+${Math.round(dSplash * 100)}% off each cell${e.splash >= 1 ? ' (all of it)' : ''}`);
    } else if (cache.splash > 0) {
      bits.push('already takes all of every cell it reaches');
    }
  } else {
    if (cache.cells > 0) bits.push(`+${cache.cells.toFixed(1)} reach`);
    if (cache.splash > 0) bits.push(`+${Math.round(cache.splash * 100)}% off each cell`);
  }
  if (cache.oreRate > 1) bits.push(`${cache.oreRate.toFixed(2)}× pockets`);
  if (cache.uses > 1) bits.push(`${cache.uses.toFixed(2)}× swings`);
  if (cache.dropWeight > 1) bits.push(`${cache.dropWeight.toFixed(2)}× drops`);
  if (cache.xpRate > 1) bits.push(`${cache.xpRate.toFixed(2)}× learning`);
  if (cache.chargePerSwing > 0) bits.push(`${(1 + cache.chargePerSwing).toFixed(1)}× charge`);
  if (cache.abilityGrade > 0) bits.push(`+${Math.floor(cache.abilityGrade)} grade`);
  for (const [k, v] of Object.entries(cache.paramAdd)) {
    if (k === 'r' && v > 0) bits.push(`+${Math.round(v)} blast radius`);
  }
  if (cache.abilitySlots > 0) bits.push(`+${Math.floor(cache.abilitySlots)} ability seat`);
  if (cache.repairPerSec > 0) bits.push('mends itself');
  if (cache.repairOnFire > 0) bits.push('mends when it fires');
  if (cache.chargeOnFire > 0) bits.push('one firing feeds the rest');
  if (cache.refire > 0) bits.push(`${Math.round(cache.refire * 100)}% it happens twice`);
  if (cache.oreReach) bits.push('works pockets it reaches');

  return (
    <div className="mt-1.5 rounded border border-cave-800 bg-cave-900/40 p-1.5" data-testid="mod-total">
      <div className="text-[9px] uppercase tracking-wider text-cave-600">All told</div>
      <div className="mt-0.5 text-[10px] leading-snug text-cave-200" data-testid="mod-total-text">
        {bits.length > 0 ? bits.join(' · ') : 'Nothing awake yet.'}
      </div>
      {cache.amplify > 1 && (
        <div className="mt-0.5 text-[9px] font-semibold text-[#c8a15a]" data-testid="mod-amplify">
          ...and everything else on it counts {cache.amplify.toFixed(2)}× over.
        </div>
      )}
    </div>
  );
}

/**
 * WHAT IT TURNED OUT TO BE.
 *
 * Three states, and all three say something useful:
 *
 *  IN A CLASS      the name, what tipped it, and what it unlocked. The tipped
 *                  line is the pillar-5 half — it names TRAITS, which every
 *                  material row already prints, so a player who wants to build
 *                  toward this can reason their way there without a recipe.
 *  SCATTERED       says the parts do not belong together, which is the same
 *                  coherence number the stat penalty already shows, now with a
 *                  second consequence attached.
 *  LEANING NOWHERE a coherent tool that is just a tool. Not a failure, and the
 *                  copy says so — plus the nearest thing it ALMOST is, which is
 *                  a direction without being an instruction.
 */
function ClassCard({ state }: { state: GameState }) {
  const read = toolClass(state);
  const known = state.casting.knownClasses ?? [];

  if (!read.def) {
    return (
      <div className="mt-2 rounded-md border border-dashed border-cave-800 p-2" data-testid="tool-class">
        <div className="text-[10px] uppercase tracking-widest text-cave-500">What it is</div>
        <div className="mt-0.5 text-[11px] leading-snug text-cave-500" data-testid="tool-class-none">
          {read.why ?? 'Not enough of it to say.'}
        </div>
        {read.nextBest && read.score > 0 && (
          <div className="mt-0.5 text-[9px] leading-snug text-cave-600" data-testid="tool-class-near">
            Closest to something at {Math.round(read.score * 100)}% of the way there.
          </div>
        )}
      </div>
    );
  }

  const hex = `#${read.def.color.toString(16).padStart(6, '0')}`;
  const unlocked = read.def.unlocks.map((id) => MOD_BY_ID.get(id)).filter(Boolean);
  return (
    <div className="mt-2 rounded-md border border-cave-700 bg-cave-850/40 p-2" data-testid="tool-class">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">What it is</span>
        <span className="tnum text-[9px] text-cave-600">
          {known.length}/{TOOL_CLASSES.length} ever found
        </span>
      </div>
      <div
        className="mt-0.5 text-xs font-semibold uppercase tracking-wider"
        style={{ color: hex }}
        data-testid="tool-class-name"
      >
        {read.def.name}
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-cave-300">{read.def.blurb}</div>
      <div className="mt-1 text-[9px] leading-snug text-cave-500" data-testid="tool-class-tipped">
        Tipped by {read.tipped.slice(0, 3).map((t) => `${t.trait} ×${t.have}`).join(', ')}
        {/* No article — "nearly a Excavation" was on screen in the first run,
            and picking a/an per class name is more machinery than the line is
            worth. */}
        {read.nextBest ? ` · next closest, ${read.nextBest.def.name}` : ''}
      </div>
      {unlocked.length > 0 && (
        <div className="mt-1 border-t border-cave-800 pt-1" data-testid="tool-class-unlocks">
          <div className="text-[9px] uppercase tracking-wider text-cave-600">Only this one can carry</div>
          {unlocked.map((m) => (
            <div key={m!.id} className="mt-0.5">
              <span
                className="text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: `#${m!.color.toString(16).padStart(6, '0')}` }}
              >
                {m!.name}
              </span>
              <span className="ml-1 text-[9px] text-cave-500">{m!.effect}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * HOW HEAVY THE STONE MADE IT — a dial, not a slider.
 *
 * The player never set this. It is the sum of what the parts are made of, and
 * the card says so out loud: the label, where it sits on the line, WHICH TRAITS
 * put it there, and both halves of the trade in the units they land in. An even
 * tool renders nothing at all, because there is nothing to say.
 */
function BalanceCard({ state, tool }: { state: GameState; tool: ToolStats }) {
  const b = balanceOf(tool.parts);
  const e = toolEffect(state);
  if (b.value === 0) {
    return (
      <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-balance">
        <div className="flex items-baseline justify-between">
          <span className="text-[10px] uppercase tracking-widest text-cave-500">Balance</span>
          <span className="tnum text-[9px] text-cave-500" data-testid="tool-balance-label">even</span>
        </div>
        <div className="mt-0.5 text-[9px] leading-snug text-cave-600">
          Nothing in this leans heavy or light. It swings as fast as you do.
        </div>
      </div>
    );
  }
  const heavy = b.value > 0;
  const hex = heavy ? '#d08a4a' : '#9ac0d8';
  // −1 .. +1 mapped onto the bar, with the marker at the value.
  const at = (b.value + 1) / 2;
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-balance">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Balance</span>
        <span
          className="tnum text-[9px] font-semibold uppercase tracking-wider"
          style={{ color: hex }}
          data-testid="tool-balance-label"
        >
          {b.label}
        </span>
      </div>
      <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-sm bg-cave-900">
        <span className="absolute inset-y-0 left-1/2 w-px bg-cave-700" />
        <span
          className="absolute inset-y-0 w-1.5 rounded-sm"
          style={{ left: `calc(${at * 100}% - 3px)`, background: hex }}
          data-testid="tool-balance-marker"
        />
      </div>
      <div className="mt-1 flex justify-between text-[8px] uppercase tracking-wider text-cave-700">
        <span>light</span><span>heavy</span>
      </div>
      <div className="mt-0.5 text-[9px] leading-snug text-cave-300" data-testid="tool-balance-trade">
        {heavy
          ? `${e.cells} cells a swing and ${Math.round(e.splash * 100)}% off each — and it will not `
            + `come round again for ${b.windup.toFixed(2)}s.`
          : `${e.cells} cells a swing and ${Math.round(e.splash * 100)}% off each — but it swings as `
            + `fast as you do, spends ${Math.round((1 - b.wear) * 100)}% less of itself doing it, and `
            + `builds what it carries ${(1 + b.charge).toFixed(1)}× as quickly.`}
      </div>
      <div className="mt-0.5 text-[9px] leading-snug text-cave-600" data-testid="tool-balance-from">
        {b.from.length > 0
          ? `Mostly ${b.from.slice(0, 3).map((f) => f.trait).join(', ')} in the stone.`
          : ''}
      </div>
    </div>
  );
}

/**
 * WHAT IS STILL GROWING, and the choice it offers when it has done the work.
 *
 * Absent entirely for a tool with no Verdance stock in it — which is most tools,
 * and is the point: this is the reason to build with living material, and a
 * permanently empty card would read as a missing requirement rather than a road
 * not taken.
 *
 * The CHOICE is the feature. Three things it could become, one taken, and the
 * card says what each does before you commit — a maturation you cannot read is
 * a coin toss, and this is meant to be the moment you decide what your pickaxe
 * has been turning into for the last few hours.
 */
function LivingCard({ tool }: { tool: ToolStats }) {
  const [note, setNote] = useState<string | null>(null);
  const living = tool.parts.filter((p) => isLiving(p));
  if (living.length === 0) return null;
  const fold = growthFold(tool.parts);

  return (
    <div className="mt-2 rounded-md border border-[#4c6a3a]/50 p-2" data-testid="tool-living">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Still growing</span>
        <span className="tnum text-[9px] text-cave-500" data-testid="tool-living-count">
          {living.length} living part{living.length === 1 ? '' : 's'}
        </span>
      </div>

      {living.map((p) => {
        const prog = growthProgress(p);
        const taken = p.grown ?? [];
        return (
          <div key={p.type} className="mt-1.5" data-testid={`living-${p.type}`}>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[9px] font-semibold uppercase tracking-wider text-[#9ac07a]">
                {PART_DEFS[p.type as PartType].name}
              </span>
              <span className="min-w-0 flex-1 truncate text-[9px] text-cave-600">
                {taken.length > 0
                  ? taken.map((b) => BOON_BY_ID.get(b)?.name ?? b).join(' · ')
                  : 'nothing yet'}
              </span>
              <span className="tnum shrink-0 text-[9px] text-cave-500">
                {prog.grown ? 'grown' : `${prog.stage}/${GROWTH_MAX}`}
              </span>
            </div>
            {!prog.grown && (
              <>
                <div className="mt-0.5 h-1 w-full overflow-hidden rounded-sm bg-cave-900">
                  <div
                    className="h-full transition-[width] duration-150"
                    data-testid={`living-bar-${p.type}`}
                    style={{ width: `${prog.frac * 100}%`, background: prog.ready ? '#c8e0a0' : '#4c6a3a' }}
                  />
                </div>
                <div className="mt-0.5 text-[8px] text-cave-600" data-testid={`living-progress-${p.type}`}>
                  {prog.ready
                    ? 'It has done the work. It is waiting to be told what to become.'
                    : `${fmt(prog.into)} / ${fmt(prog.need)} cells`}
                </div>
              </>
            )}
            {prog.ready && (
              <div className="mt-1 space-y-1" data-testid={`living-choice-${p.type}`}>
                {GROWTH_BOONS.map((b) => (
                  <button
                    key={b.id}
                    className="w-full rounded border border-cave-700 px-1.5 py-1 text-left hover:border-[#9ac07a]/70"
                    data-testid={`living-take-${p.type}-${b.id}`}
                    onClick={() => {
                      const r = dispatch({
                        type: 'matureLivingPart', partType: p.type, boon: b.id,
                      });
                      setNote(r.ok
                        ? `The ${PART_DEFS[p.type as PartType].name} became ${b.name}.`
                        : r.reason ?? null);
                    }}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-wider text-[#9ac07a]">
                      {b.name}
                    </span>
                    <span className="mt-0.5 block text-[9px] leading-snug text-cave-400">{b.effect}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {(fold.cells > 0 || fold.repairPerSec > 0 || fold.stabilize > 0) && (
        <div className="mt-1.5 border-t border-cave-800 pt-1 text-[9px] leading-snug text-cave-300"
          data-testid="tool-living-total">
          All told: {[
            fold.cells > 0 ? `+${fold.cells} reach` : null,
            fold.repairPerSec > 0 ? 'closes its own wear' : null,
            fold.stabilize > 0 ? `steadier by ${Math.round(fold.stabilize)}` : null,
            fold.wear < 1 ? `${Math.round((1 - fold.wear) * 100)}% less wear a swing` : null,
          ].filter(Boolean).join(' · ')}
        </div>
      )}
      {note && <div className="mt-1 text-center text-[10px] text-cave-300" data-testid="living-note">{note}</div>}
    </div>
  );
}

/**
 * HOW WELL THE POURS CAME OUT. Only rendered when there is something to say —
 * a tool of Good parts has no craftsmanship story, which is most tools.
 */
/**
 * THE SOCKETS — the doc's tie-in, and the only card here that reaches OUTSIDE
 * the Forge for what it shows.
 *
 * Laid out as a ROW rather than a list, because the row IS the mechanism: rune
 * sockets speak to their NEIGHBOURS, so seeing slot 1 beside slot 2 is seeing
 * why the order matters. Everything a socket can hold is drawn from the real
 * pile — held relics, found runes, held gems — so an empty picker means an
 * empty pile and never a missing feature.
 */
function SocketsCard({
  state, tool, slot: slotProp, onSlot,
}: {
  state: GameState; tool: ToolStats;
  /** CONTROLLED BY THE DIAGRAM when the station drives it: tapping a gem seat
   *  on the tool focuses that slot here, which is the whole reason the seats
   *  are buttons. Falls back to its own state so the card still stands alone. */
  slot?: number; onSlot?: (i: number) => void;
}) {
  const [ownSlot, setOwnSlot] = useState(0);
  const slot = slotProp ?? ownSlot;
  const setSlot = onSlot ?? setOwnSlot;
  const [kind, setKind] = useState<SocketKind>('relic');
  const [why, setWhy] = useState<string | null>(null);
  const n = socketCount(tool);
  if (n <= 0) return null;

  const row = socketRow(state);
  const focus = socketFocus(tool);
  const overflow = socketOverflow(state);
  const named = (k: string): boolean => pairLabel(k) !== k;
  const pairs = socketRunePairs(state).filter(named);
  const triples = socketRuneTriples(state).filter(named);
  const at = Math.min(slot, n - 1);
  const held = row[at] ?? null;

  // WHAT COULD GO IN — the real piles, never a catalogue of what exists.
  const relicOpts = state.relics.held
    .filter((r) => !isSocketedRelic(state, r.uid))
    .slice(0, 40)
    .map((r) => ({
      value: `relic:${r.uid}`,
      label: `${relicName(r)} · ${wakingStep(r).name}`,
    }));
  const runeOpts = RUNES
    .filter((id) => (state.runes.found[id] ?? 0) > 0)
    .map((id) => ({
      value: `rune:${id}`,
      label: `${RUNE_GLYPHS[id]} ${runeName(id)} ×${state.runes.found[id]}`,
    }));
  const gemOpts = GEMS
    .filter((g) => (state.materials.gems[g.id] ?? 0) > 0)
    .map((g) => ({ value: `gem:${g.id}`, label: `${g.name} — ${g.effectText}` }));
  const opts = kind === 'relic' ? relicOpts : kind === 'rune' ? runeOpts : gemOpts;

  const put = (raw: string): void => {
    const cut = raw.indexOf(':');
    const k = raw.slice(0, cut);
    const v = raw.slice(cut + 1);
    const fill: SocketFill = k === 'relic'
      ? { kind: 'relic', uid: Number(v) }
      : k === 'rune'
        ? { kind: 'rune', id: v as RuneId }
        : { kind: 'gem', id: v };
    const r = dispatch({ type: 'setSocket', slot: at, fill });
    setWhy(r.ok ? null : (r.reason ?? 'No'));
  };

  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-sockets">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Sockets</span>
        <span className="tnum text-[9px] text-cave-400" data-testid="socket-count">
          {row.filter(Boolean).length}/{n}
          {focus > 1.005 ? ` · holds ${Math.round((focus - 1) * 100)}% harder` : ''}
        </span>
      </div>

      {/* THE ROW. Adjacency is the rune grammar, so it is drawn as adjacency. */}
      <div className="mt-1.5 flex gap-1">
        {row.map((f, i) => (
          <button
            key={i}
            className={`min-w-0 flex-1 rounded border px-0.5 py-1 text-[9px] leading-tight ${
              i === at ? 'border-[#e0b054] text-cave-200' : 'border-cave-700 text-cave-400'
            }`}
            data-testid={`socket-${i}`}
            onClick={() => { setSlot(i); setWhy(null); }}
            title={f ? fillLabel(state, f) : 'Empty'}
          >
            <div className="tnum text-[8px] text-cave-600">{i + 1}</div>
            <div className="truncate">
              {f === null
                ? '—'
                : f.kind === 'rune'
                  ? RUNE_GLYPHS[f.id]
                  : f.kind === 'gem' ? gemDef(f.id).name.slice(0, 4) : 'relic'}
            </div>
          </button>
        ))}
      </div>

      {/* WHAT IS IN THE ONE YOU PICKED, and the way back out. */}
      <div className="mt-1.5 text-[9px] leading-snug text-cave-300" data-testid="socket-detail">
        {held === null
          ? <span className="italic text-cave-500">Socket {at + 1} is empty.</span>
          : <SocketHeld state={state} fill={held} />}
      </div>
      {held !== null && (
        <button
          className="btn mt-1 w-full py-0.5 text-[9px]"
          data-testid="socket-clear"
          onClick={() => {
            const r = dispatch({ type: 'setSocket', slot: at, fill: null });
            setWhy(r.ok ? null : (r.reason ?? null));
          }}
        >
          Take it out · nothing is used up
        </button>
      )}

      {/* THE PICKER. Three kinds, each one the real pile. */}
      <div className="mt-1.5 flex gap-1">
        {SOCKET_KINDS.map((k) => (
          <button
            key={k}
            className={`min-w-0 flex-1 rounded border py-0.5 text-[9px] capitalize ${
              k === kind ? 'border-cave-500 text-cave-200' : 'border-cave-800 text-cave-500'
            }`}
            data-testid={`socket-kind-${k}`}
            onClick={() => { setKind(k); setWhy(null); }}
          >
            {k}s
          </button>
        ))}
      </div>
      <div className="mt-1">
        {opts.length === 0
          ? (
            <div className="text-[9px] italic text-cave-600" data-testid="socket-none">
              {kind === 'relic'
                ? 'You hold no free relics.'
                : kind === 'rune' ? 'You have found no runes yet.' : 'You hold no gems.'}
            </div>
          )
          : (
            <Select
              value=""
              onChange={put}
              options={opts}
              className="w-full"
              placeholder={`Set into socket ${at + 1}…`}
              ariaLabel={`Set into socket ${at + 1}`}
            />
          )}
      </div>
      {why && (
        <div className="mt-1 text-[9px] leading-snug text-[#c46a5a]" data-testid="socket-why">
          {why}
        </div>
      )}

      {/* WHAT THE ROW SAYS — the rune grammar's own readout, pairs then triples. */}
      {(pairs.length > 0 || triples.length > 0) && (
        <div className="mt-1.5 border-t border-cave-800 pt-1" data-testid="socket-speaks">
          <div className="text-[9px] uppercase tracking-wider text-cave-500">It says</div>
          {[...pairs, ...triples].map((k) => (
            <div key={k} className="text-[9px] leading-snug text-[#9ac07a]">{pairLabel(k)}</div>
          ))}
        </div>
      )}

      {overflow.length > 0 && (
        <div className="mt-1.5 text-[9px] leading-snug text-[#c4a05a]" data-testid="socket-overflow">
          {overflow.length} more {overflow.length === 1 ? 'thing is' : 'things are'} in there doing
          nothing — this Sockets part holds {n}. None of it was lost; a deeper one counts them again.
        </div>
      )}

      <div className="mt-1 text-[8px] leading-snug text-cave-600">
        A relic in a socket is off your belt, and it stops waking. Wear it to grow it; set it once it has.
      </div>
    </div>
  );
}

/** What one socketed thing is doing, said in the source system's own words. */
function SocketHeld({ state, fill }: { state: GameState; fill: SocketFill }) {
  if (fill.kind === 'rune') {
    return <span>{RUNE_GLYPHS[fill.id]} {runeName(fill.id)} — it speaks through its neighbours.</span>;
  }
  if (fill.kind === 'gem') {
    const g = gemDef(fill.id);
    return (
      <span>
        <span style={{ color: g.color }}>{g.name}</span>
        {' — '}
        {g.effectText.replace('while socketed', 'through the tool')}
      </span>
    );
  }
  const r = state.relics.held.find((x) => x.uid === fill.uid);
  if (!r) return <span className="italic text-cave-500">Gone.</span>;
  const power = powerOf(r);
  const affixes = Object.entries(r.affixes).slice(0, 4);
  return (
    <span>
      {RARITIES[r.rarity]} {r.source} · {wakingStep(r).name}
      {power && (powerLive(r)
        ? <> · <span className="text-[#c9a7e0]">{power.name}</span></>
        : (
          <>
            {' · '}
            <span className="text-cave-600">
              {power.name} is asleep — it wakes on the belt, not in here
            </span>
          </>
        ))}
      {affixes.length > 0 && (
        <div className="tnum mt-0.5 text-[9px] text-cave-400" data-testid="socket-affixes">
          {affixes.map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${(v * 100).toFixed(0)}%`).join(' · ')}
        </div>
      )}
    </span>
  );
}

function CraftCard({ tool }: { tool: ToolStats }) {
  const fold = craftFold(tool.parts);
  const notable = tool.parts.filter((p) => p.craft === 'masterwork' || p.craft === 'excellent');
  if (notable.length === 0) return null;
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-craft">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">The pours</span>
        <span
          className="tnum text-[9px] uppercase tracking-wider"
          style={{ color: `#${CRAFT_COLOR[fold.best].toString(16).padStart(6, '0')}` }}
          data-testid="tool-craft-best"
        >
          {CRAFT_LABEL[fold.best]}
          {fold.masterworks > 0 ? ` ×${fold.masterworks}` : ''}
        </span>
      </div>
      {notable.map((p) => {
        const tier = p.craft ?? 'good';
        const work = p.work ? MASTERWORK_BY_ID.get(p.work) : undefined;
        return (
          <div key={p.type} className="mt-1" data-testid={`craft-${p.type}`}>
            <div className="flex items-baseline gap-1.5">
              <span className="shrink-0 text-[9px] uppercase tracking-wider text-cave-500">
                {PART_DEFS[p.type as PartType].name}
              </span>
              <span
                className="shrink-0 text-[9px] font-semibold uppercase tracking-wider"
                style={{ color: `#${CRAFT_COLOR[tier].toString(16).padStart(6, '0')}` }}
              >
                {work ? work.name : CRAFT_LABEL[tier]}
              </span>
            </div>
            <div className="mt-0.5 text-[9px] leading-snug text-cave-400">
              {work ? work.effect : 'A touch steadier under load. Nothing more than that.'}
            </div>
          </div>
        );
      })}
      <div className="mt-1 text-[8px] leading-snug text-cave-600">
        None of this is stats. A Masterwork Head has the numbers a Poor one has.
      </div>
    </div>
  );
}

/**
 * THE BIOGRAPHY. Information, and it says so — the last line is load-bearing
 * copy, because a history panel in a game with stat screens will be read as a
 * stat screen unless it tells you otherwise.
 */
function BiographyCard({ state }: { state: GameState }) {
  const bio = readBio(state);
  if (!bio) return null;
  const shell = (id: string): string => {
    const s = allShells().find((x) => x.id === id);
    return s ? s.name : id;
  };
  const rows: Array<[string, string]> = [
    ['Cells broken', fmt(bio.cells)],
    ['Swings', fmt(bio.swings)],
    ['Hours in hand', bio.hours < 1 ? `${Math.round(bio.hours * 60)} min` : bio.hours.toFixed(1)],
    ['Deepest', `${shell(bio.deepestShell)} · ${fmt(bio.deepestDepth)}m`],
    ['Abilities set off', fmt(bio.fired)],
    ['Collapses survived', fmt(bio.collapses)],
    ['Relics turned up', fmt(bio.relics)],
  ];
  if (bio.breaches > 0) rows.push(['Worlds left behind', fmt(bio.breaches)]);
  if (bio.rebuilds > 0) rows.push(['Rebuilt', `${fmt(bio.rebuilds)}×`]);

  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-bio">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">Its history</span>
        <span className="tnum text-[9px] text-cave-600" data-testid="tool-bio-age">
          {bio.shells.length} shell{bio.shells.length === 1 ? '' : 's'} worked
        </span>
      </div>
      <div className="mt-1 space-y-0.5" data-testid="tool-bio-rows">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-baseline gap-1 text-[9px]">
            <span className="min-w-0 flex-1 truncate text-cave-600">{k}</span>
            <span className="tnum shrink-0 text-cave-300">{v}</span>
          </div>
        ))}
      </div>
      <div className="mt-1 text-[8px] leading-snug text-cave-600">
        None of this makes it stronger. It is what the tool has done.
      </div>
    </div>
  );
}

/** WHAT THE SWING LOOKS LIKE — the head's mould, on the tool it was built into. */
function ShapeCard({ state, tool }: { state: GameState; tool: ToolStats }) {
  const fold = shapeFold(tool.parts);
  const head = shapeDef(fold.head, 'head');
  const e = toolEffect(state);
  const odd = tool.parts.filter((p) => p.shape && p.shape !== defaultShape(p.type));
  return (
    <div className="mt-2 rounded-md border border-cave-800 p-2" data-testid="tool-shape">
      <div className="flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-widest text-cave-500">How it swings</span>
        <span className="tnum text-[9px] text-cave-600" data-testid="tool-shape-pattern">
          {head.name} · {e.cells} cell{e.cells === 1 ? '' : 's'}
        </span>
      </div>
      <div className="mt-0.5 text-[10px] leading-snug text-cave-300" data-testid="tool-shape-effect">
        {head.effect}
      </div>
      {odd.length > 0 && (
        <div className="mt-1 flex flex-wrap gap-1" data-testid="tool-shape-parts">
          {odd.map((p) => (
            <span key={p.type} className="rounded border border-cave-800 px-1 py-0.5 text-[9px] text-cave-500">
              {shapeDef(p.shape, p.type).name} {PART_DEFS[p.type as PartType].name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
