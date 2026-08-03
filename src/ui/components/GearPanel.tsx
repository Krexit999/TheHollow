/**
 * GEAR — three slots, and the refusal is the mechanic (§40.1).
 *
 * The panel is readable everywhere and ACTIONABLE only at a rest, because
 * "what you carry into a stretch is a commitment" only means anything if you
 * can see what you are committed to while you are out in it. When it refuses it
 * names the station and its depth: a rule the player cannot act on reads as a
 * bug, not as a rule.
 *
 * LAW 3: you never see kit you have not found. There is no greyed list of what
 * the other wrecks hold — only a count, so "more is out there" is a horizon
 * rather than a shopping list.
 */
import { useGame, dispatch } from '../store';
import { GEAR, GEAR_SLOTS, type GearSlot } from '../../engine/content/shell1/gear';
import { atRest, nearestRest } from '../../engine/systems/gear';

const SLOT_LABEL: Record<GearSlot, string> = {
  lamp: 'Lamp', gloves: 'Gloves', boots: 'Boots',
};

export function GearPanel() {
  const state = useGame((s) => s.state);
  if (!state) return null;
  const owned = state.gear?.owned ?? [];
  const worn = state.gear?.worn ?? {};
  const rest = atRest(state);
  const near = nearestRest(state);
  const undiscovered = GEAR.length - owned.length;

  return (
    <div className="space-y-3">
      <div
        className={`panel p-3 ${rest.ok ? 'border-[#9ad4e8]/40' : 'border-cave-800'}`}
        data-testid="gear-rest"
      >
        <div className="text-xs font-semibold uppercase tracking-wider text-[#9ad4e8]">
          {rest.ok ? `At rest · ${rest.station}` : 'Not at rest'}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-cave-400">
          {rest.ok
            ? 'You can change what you carry here.'
            : near
              ? `Kit changes at a rest. The nearest is ${near.name}, depth ${near.depth}.`
              : 'Kit changes at a rest, and this shell has none.'}
        </p>
      </div>

      {GEAR_SLOTS.map((slot) => {
        const mine = GEAR.filter((g) => g.slot === slot && owned.includes(g.id));
        const on = worn[slot] ?? null;
        return (
          <div key={slot} className="panel p-3" data-testid={`slot-${slot}`}>
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-[#e8d48f]">
                {SLOT_LABEL[slot]}
              </span>
              <span className="text-[10px] text-cave-500" data-testid={`worn-${slot}`}>
                {on ? GEAR.find((g) => g.id === on)?.name : 'empty'}
              </span>
            </div>
            {mine.length === 0 ? (
              <p className="mt-1 text-[11px] italic leading-snug text-cave-400">
                Nothing for this slot yet. Somebody left theirs down here.
              </p>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {mine.map((g) => {
                  const isOn = on === g.id;
                  return (
                    <li
                      key={g.id}
                      className={`rounded border p-2 ${isOn ? 'border-[#9ad4e8]/50 bg-[#9ad4e8]/5' : 'border-cave-800'}`}
                    >
                      <div className="text-[12px] text-cave-200">{g.name}</div>
                      {/* WHAT IT DOES, never what it is worth. */}
                      <div className="mt-0.5 text-[11px] leading-snug text-cave-400">{g.effect}</div>
                      <div className="mt-0.5 text-[10px] italic leading-snug text-cave-600">{g.flavor}</div>
                      <button
                        data-testid={`${isOn ? 'doff' : 'don'}-${g.id}`}
                        disabled={!rest.ok}
                        className={`mt-1.5 w-full rounded border py-1 text-[10px] uppercase tracking-wider ${
                          !rest.ok
                            ? 'border-cave-800 text-cave-700'
                            : isOn
                              ? 'border-cave-700 text-cave-300 hover:bg-cave-800'
                              : 'border-[#e8d48f]/50 text-[#e8d48f] hover:bg-[#e8d48f]/10'
                        }`}
                        onClick={() => dispatch({ type: 'equipGear', slot, id: isOn ? null : g.id })}
                      >
                        {!rest.ok ? 'Not here' : isOn ? 'Take it off' : 'Put it on'}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        );
      })}

      {undiscovered > 0 && (
        <p className="px-1 text-[10px] leading-snug text-cave-600" data-testid="gear-horizon">
          {undiscovered} more {undiscovered === 1 ? 'piece is' : 'pieces are'} still down there, in
          the wrecks of people who did not come back up.
        </p>
      )}
    </div>
  );
}
