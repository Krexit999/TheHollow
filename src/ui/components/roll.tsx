/**
 * THE ROLL — one row per station, at 380px (§1).
 *
 * PLAIN HTML. Canvas has been tried twice on this codebase and reverted twice;
 * this is a list, and a list is what the DOM is for.
 *
 * IT LIVES IN THE FACE CLUSTER, not in a menu. The Roll is where you ARE — the
 * ladder you are standing on — and putting it behind a tab would make the
 * geography something you go and consult rather than something you are in.
 *
 * The visibility rule is the engine's (`rollRows`), not this file's: the next
 * three are fully legible, everything below is a name and a depth, and the
 * floor is pinned from the moment you enter the shell. A renderer that decided
 * that for itself could drift out of agreement with the fog.
 */
import { useGame } from '../store';
import { rollRows, floorRow, FEATURE_LABEL, type RollRow } from '../../engine/systems/roll';
import { TYPE_LABEL } from '../../engine/content/shell1/roll';
import { materialDef } from '../../engine/materials';
import { effectiveToolTier } from '../../engine/systems/toolMining';
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
  const bits: string[] = [];
  if (row.contents.seam) bits.push(seamName(row.contents.seam));
  if (row.contents.feature !== 'nothing') bits.push(FEATURE_LABEL[row.contents.feature]);
  if (row.contents.hazard > 0) bits.push(`dust ${row.contents.hazard}`);
  return { text: bits.length > 0 ? bits.join(' · ') : '—', tone: 'text-cave-400' };
}

function StationRow({ row, tier }: { row: RollRow; tier: number }) {
  const t = TYPE_LABEL[row.type];
  const tone = TYPE_TONE[row.type] ?? 'text-cave-400';

  // BELOW THE LAMP: name and depth only. No type, no seam, no hardness — the
  // fog is the point, and a greyed-out real value is not fog.
  if (!row.legible) {
    return (
      <div className="flex items-baseline gap-2 py-[3px] text-[11px] text-cave-600">
        <span className="tnum w-8 shrink-0 text-right">{row.def.depth}</span>
        <span className="min-w-0 flex-1 truncate">{row.def.name}</span>
        <span className="shrink-0 text-cave-700">·</span>
      </div>
    );
  }

  const c = contentsLine(row, tier);
  return (
    <div
      className={`flex items-baseline gap-2 py-[3px] text-[11px] ${
        row.current ? 'bg-lamp-500/10' : ''
      } ${row.behind ? 'opacity-60' : ''}`}
      data-testid={`station-${row.def.id}`}
    >
      <span className={`w-2 shrink-0 ${row.current ? 'text-lamp-400' : 'text-transparent'}`}>▸</span>
      <span className="tnum w-8 shrink-0 text-right text-cave-500">{row.def.depth}</span>
      <span className={`min-w-0 flex-1 truncate font-semibold ${row.current ? 'text-lamp-200' : 'text-cave-200'}`}>
        {row.def.name}
      </span>
      {row.def.hardness !== undefined && (
        <span className="tnum shrink-0 text-[10px] text-cave-500">h{row.def.hardness}</span>
      )}
      <span className={`min-w-0 max-w-[38%] shrink-0 truncate text-[10px] ${c.tone}`}>{c.text}</span>
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

  return (
    <div className="panel p-3">
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Roll</span>
        <span className="tnum text-[10px] text-cave-500">depth {state.depth}</span>
      </div>
      <div className="max-h-[280px] overflow-y-auto overflow-x-hidden pr-0.5">
        {listed.map((r) => <StationRow key={r.def.id} row={r} tier={tier} />)}
      </div>
      {floor && (
        /* PINNED FROM THE MOMENT YOU ENTER THE SHELL. You always know where the
           bottom is and what it is called, however far off it is. */
        <div className="mt-1 border-t border-cave-800 pt-1">
          <StationRow row={floor} tier={tier} />
        </div>
      )}
    </div>
  );
}
