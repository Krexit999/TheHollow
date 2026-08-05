/**
 * THE ROLL — one row per station, at 380px (§1).
 *
 * PLAIN HTML. Canvas has been tried twice on this codebase and reverted twice;
 * this is a list, and a list is what the DOM is for.
 *
 * IT IS THE SHAFT SCREEN. Not a small block wedged under the Dig upgrades,
 * where it was competing for room with nine other cards and had to be capped at
 * a 280px scroller to fit — the Roll is the answer to "where am I going", and
 * clicking SHAFT is how you ask that question. So it is the whole right-hand
 * side of that screen, sized so all fifteen rows land without scrolling: the
 * legible ones get real height, the fogged ones stay tight, and the floor is
 * pinned under a rule at the bottom.
 *
 * The visibility rule is the engine's (`rollRows`), not this file's: the next
 * three are fully legible, everything below is a name and a depth, and the
 * floor is pinned from the moment you enter the shell. A renderer that decided
 * that for itself could drift out of agreement with the fog.
 */
import { useGame } from '../store';
import { rollRows, floorRow, isGone, markedHere, FEATURE_LABEL, type RollRow } from '../../engine/systems/roll';
import { thresholdFor } from '../../engine/content/thresholds';
import { TYPE_LABEL } from '../../engine/content/shell1/roll';
import { materialDef } from '../../engine/materials';
import { effectiveToolTier } from '../../engine/systems/toolMining';
import { isShored } from '../../engine/systems/shoring';
import { DEEPWROUGHT_NAME } from '../../engine/systems/standoff';
import type { GameState } from '../../engine';

const TYPE_TONE: Record<string, string> = {
  seam: 'text-cave-400',
  wall: 'text-[#e0885a]',
  wreck: 'text-[#9ad4e8]',
  works: 'text-[#a8d8a0]',
  chamber: 'text-[#c9a6e0]',
  hazard: 'text-[#e0b25a]',
  rest: 'text-cave-400',
  floor: 'text-lamp-400',
  // A place that will take the heat, and has not yet.
  flood: 'text-[#e0885a]',
};

function seamName(id: string): string {
  if (!id) return '—';
  try {
    return materialDef(id).name;
  } catch {
    return '—';
  }
}

/**
 * WHAT THE MIDDLE COLUMN SAYS. A WALL does not have a seam — it has a demand,
 * and until the tool can answer it the only honest thing to print is that the
 * rock is harder than you are. That is the §1 mock's `—` given a voice.
 */
function contentsLine(row: RollRow, tier: number): { text: string; tone: string } {
  if (row.def.type === 'wall') {
    if (row.cleared) return { text: 'cleared', tone: 'text-[#a8d8a0]' };
    if (tier >= (row.def.hardness ?? 1)) return { text: 'passable', tone: 'text-cave-300' };
    return { text: 'too hard', tone: 'text-[#e0885a]' };
  }
  if (row.type === 'works') return { text: row.def.wreck ?? 'salvaged', tone: 'text-[#a8d8a0]' };
  // §27.7: A HAZARD SHOWS ITS DEEPWROUGHT BEFORE YOU ARRIVE. Engaging is
  // optional and the station's material usually is not, so the row has to name
  // the thing rather than print an intensity number and let you find out.
  if (row.def.type === 'hazard') {
    return { text: `${DEEPWROUGHT_NAME} ${row.contents.hazard}`, tone: 'text-[#e0885a]' };
  }
  const bits: string[] = [];
  if (row.contents.seam) bits.push(seamName(row.contents.seam));
  if (row.contents.feature !== 'nothing') bits.push(FEATURE_LABEL[row.contents.feature]);
  return { text: bits.length > 0 ? bits.join(' · ') : '—', tone: 'text-cave-400' };
}

/**
 * `pinned` is the FLOOR slot. §1's mock prints `150  DEEPGRAVE  FLOOR` from the
 * moment you enter the shell, so the floor's TYPE is known even though it sits
 * far below the lamp — you know there is a bottom and what kind of thing it is,
 * you just do not know what is in it. That is a renderer distinction, not an
 * engine one: `legible` stays false for the floor, because the fog over its
 * contents is real.
 */
function StationRow({ row, tier, pinned, shored, mark, gone }: {
  row: RollRow; tier: number; pinned?: boolean; shored?: boolean; mark?: string; gone?: boolean;
}) {
  const t = TYPE_LABEL[row.type];
  const tone = TYPE_TONE[row.type] ?? 'text-cave-400';

  /**
   * §53 RULE 3 — THE HOLE (§55 row 6). A station this world took back reads as
   * a struck row and nothing else: no type, no seam, no hardness, because there
   * is nothing there to read. It is left ON the Roll rather than removed from
   * it, which is the entire point — "a 300-hour save has two or three holes in
   * its Roll and they are the most legible thing on it."
   */
  if (gone) {
    return (
      <div className="flex items-baseline gap-2 py-[4px] text-[12px] opacity-70" data-testid={`station-${row.def.id}`}>
        <span className="w-2 shrink-0 text-transparent">▸</span>
        <span className="tnum w-8 shrink-0 text-right text-cave-600">{row.def.depth}</span>
        <span className="min-w-0 flex-1 truncate font-semibold text-cave-600 line-through">{row.def.name}</span>
        <span
          className="shrink-0 text-[9px] font-semibold tracking-wide text-[#8a5a4a]"
          data-testid={`station-gone-${row.def.id}`}
          title="it gave way while you were in it, and it does not come back"
        >
          GONE
        </span>
      </div>
    );
  }

  if (pinned && !row.legible) {
    return (
      <div className="flex items-baseline gap-2 py-[4px] text-[12px]" data-testid={`station-${row.def.id}`}>
        <span className="w-2 shrink-0 text-transparent">▸</span>
        <span className="tnum w-8 shrink-0 text-right text-cave-500">{row.def.depth}</span>
        <span className="min-w-0 flex-1 truncate font-semibold text-cave-300">{row.def.name}</span>
        <span className="shrink-0 text-[10px] text-cave-600">—</span>
        <span className={`w-[52px] shrink-0 text-right text-[9px] font-semibold tracking-wide ${tone}`}>{t}</span>
      </div>
    );
  }

  // BELOW THE LAMP: name and depth only. No type, no seam, no hardness — the
  // fog is the point, and a greyed-out real value is not fog. These rows stay
  // TIGHT: ten of them, and every pixel they take is a pixel the three legible
  // rows do not get.
  if (!row.legible) {
    return (
      <div className="flex h-[15px] items-baseline gap-2 text-[10px] leading-[15px] text-cave-600">
        <span className="tnum w-8 shrink-0 text-right">{row.def.depth}</span>
        <span className="min-w-0 flex-1 truncate">{row.def.name}</span>
        {/*
          ...AND THE MARK SURVIVES THE FOG (§53 rule 1, and this was a real bug).
          The marks land on the DEEP half of the Roll, which is exactly the half
          below the lamp — so a mark only rendered on legible rows was a mark
          that could never be seen at the moment it appeared. §53's whole
          "holy-shit moment" is "a station's row CHANGED and you did not do
          anything to it", and a row you cannot read changing is a better
          version of that, not a worse one: something happened down there.
        */}
        {mark ? (
          <span
            className="shrink-0 text-[9px] font-semibold tracking-wide text-[#a8794a]"
            data-testid={`station-mark-${row.def.id}`}
            title="the shell changed here. You took enough out of it that it noticed."
          >
            {mark}
          </span>
        ) : (
          <span className="shrink-0 text-cave-700">·</span>
        )}
      </div>
    );
  }

  const c = contentsLine(row, tier);
  return (
    <div
      className={`flex items-baseline gap-2 rounded-sm py-[4px] pr-0.5 text-[12px] ${
        row.current ? 'bg-lamp-500/10' : ''
      } ${row.behind ? 'opacity-60' : ''}`}
      data-testid={`station-${row.def.id}`}
    >
      <span className={`w-2 shrink-0 ${row.current ? 'text-lamp-400' : 'text-transparent'}`}>▸</span>
      <span className="tnum w-8 shrink-0 text-right text-cave-500">{row.def.depth}</span>
      <span className={`min-w-0 flex-1 truncate font-semibold ${row.current ? 'text-lamp-200' : 'text-cave-200'}`}>
        {row.def.name}
      </span>
      {/*
        A TIMBERED BAND IS MARKED ON THE ROLL ITSELF (§9.4). The Roll is where
        you read what a station holds, so it has to be where you read that this
        one will never hold anything else — otherwise the price of the drift is
        only legible on the screen that sold it to you.
      */}
      {/*
        §53 RULE 3 — VISIBLE ON THE ROLL. "The Roll becomes a record of what you
        did to the place." The word is the threshold's own — CRACKED, INVERTED,
        FERAL, BENT, BURNT, DEEP — so the marker names what happened rather than
        printing a generic badge the player has to go and look up.
      */}
      {mark && (
        <span
          className="shrink-0 text-[9px] font-semibold tracking-wide text-[#a8794a]"
          data-testid={`station-mark-${row.def.id}`}
          title="the shell changed here. You took enough out of it that it noticed."
        >
          {mark}
        </span>
      )}
      {shored && (
        <span className="shrink-0 text-[10px] text-[#c9a86a]" title="timbered — the fall drops through it, and its contents never re-roll">
          ⌸
        </span>
      )}
      {row.def.hardness !== undefined && (
        <span className="tnum shrink-0 text-[10px] text-cave-500">h{row.def.hardness}</span>
      )}
      <span className={`min-w-0 max-w-[36%] shrink-0 truncate text-[10px] ${c.tone}`}>{c.text}</span>
      <span className={`w-[52px] shrink-0 text-right text-[9px] font-semibold tracking-wide ${tone}`}>{t}</span>
    </div>
  );
}

export function RollPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  if (!state) return null;
  const rows = rollRows(state as GameState);
  if (rows.length === 0) return null; // a shell whose Roll is not authored yet
  const floor = floorRow(state as GameState);
  const tier = effectiveToolTier(state as GameState);
  // The floor is pinned separately, so it is never the row that scrolls away.
  const listed = rows.filter((r) => r.def.type !== 'floor');
  // §53 — what this world has done to this shell, read off the Roll itself.
  const marked = new Set(markedHere(state as GameState));
  const word = thresholdFor((state as GameState).shell.current)?.mark;

  return (
    <div className="panel p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Roll</span>
        <span className="tnum text-[10px] text-cave-500">
          {state.shell.current} · depth {state.depth}
        </span>
      </div>
      {/* NO SCROLLER. Fifteen rows at these heights land inside the Shaft
          screen's column, and a list you have to scroll to see the floor of is
          not a list of where you are going — it is a menu. */}
      <div className="overflow-x-hidden">
        {listed.map((r) => (
          <StationRow
            key={r.def.id}
            row={r}
            tier={tier}
            shored={isShored(state as GameState, r.def.id)}
            mark={marked.has(r.def.id) ? word : undefined}
            gone={isGone(state as GameState, r.def.id)}
          />
        ))}
      </div>
      {floor && (
        /* PINNED FROM THE MOMENT YOU ENTER THE SHELL. You always know where the
           bottom is and what it is called, however far off it is. */
        <div className="mt-1 border-t border-cave-700 pt-1">
          <StationRow row={floor} tier={tier} pinned />
        </div>
      )}
    </div>
  );
}
