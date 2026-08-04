/**
 * THE BALANCE — TRANSMUTATION (§14.4), plain HTML, in THE PLANT cluster.
 *
 * LAW 3: it lists what you HOLD on the left and what this Balance can reach on
 * the right, never a worth table. The player is shown a RATE and a COUNT —
 * things they can act on — and the loss is stated as a number of units that
 * simply vanish, because that is the whole design and hiding it would make the
 * bench feel like a bug.
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import { Select } from './Select';
import {
  TIER_CAPABILITY_BALANCE, balanceBlocker, balanceBuilt, balanceFound, balancePreview,
  balanceRate, balanceStation, convertible, crossesShells, ensureBalance, ledgerKnows,
  nextBalanceTierCost, reachable,
} from '../../engine/systems/balance';
import { MAX_MACHINE_TIER, tierOf } from '../../engine/systems/plant';
import { materialDef } from '../../engine/materials';
import { materialCount } from '../../engine/systems/forge';
import type { GameState } from '../../engine';

function nameOf(id: string): string {
  try { return materialDef(id).name; } catch { return id; }
}

export function BalancePanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [units, setUnits] = useState(1);
  if (!state) return null;
  const st = state as GameState;

  const found = balanceFound(st);
  const built = balanceBuilt(st);
  if (!found && !built) return null;

  const tier = tierOf(st, 'balance');
  const cost = nextBalanceTierCost(st);
  const rack = st.casting?.rack?.length ?? 0;
  const at = balanceStation();
  const have = convertible(st);
  const fromId = have.includes(from) ? from : (have[0] ?? '');
  const outs = fromId ? reachable(st, fromId).slice(0, 40) : [];
  const toId = outs.includes(to) ? to : (outs[0] ?? '');
  const preview = fromId && toId ? balancePreview(st, fromId, toId, units) : null;
  const blocked = fromId && toId ? balanceBlocker(st, fromId, toId, units) : 'Nothing to weigh.';
  const b = ensureBalance(st);

  return (
    <div className="panel mt-2 p-3" data-testid="balance-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-cave-300">The Balance</span>
        <span className="text-[10px] text-cave-500" data-testid="balance-tier">
          {TIER_CAPABILITY_BALANCE[Math.min(tier, MAX_MACHINE_TIER)]}
        </span>
      </div>

      {!built ? (
        <>
          <p className="text-[10px] leading-snug text-cave-500">
            It is still in the wreck at {at?.name ?? 'the deep'}. Standing, anything on it can
            become anything else — and most of it is lost on the way across.
          </p>
          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={cost === null || rack < cost}
            data-testid="build-balance"
            onClick={() => dispatch({ type: 'buildBalance' })}
          >
            Raise it — {cost ?? 0} cast parts <span className="text-cave-600">(rack holds {rack})</span>
          </button>
        </>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline gap-1">
            <Select
              ariaLabel="What goes on"
              value={fromId}
              onChange={setFrom}
              options={have.slice(0, 30).map((id) => ({
                value: id, label: `${nameOf(id)} (${materialCount(st, id)})`,
              }))}
            />
            <span className="text-[10px] text-cave-600">→</span>
            <Select
              ariaLabel="What comes off"
              value={toId}
              onChange={setTo}
              options={outs.map((id) => ({ value: id, label: nameOf(id) }))}
            />
          </div>
          <div className="mt-1 flex items-baseline gap-1">
            <span className="text-[9px] text-cave-600">units</span>
            <button className="btn px-1 py-0 text-[10px]" data-testid="units-less"
              onClick={() => setUnits((n) => Math.max(1, n - 1))}>−</button>
            <span className="tnum w-8 text-center text-[11px] text-cave-200" data-testid="units">{units}</span>
            <button className="btn px-1 py-0 text-[10px]" data-testid="units-more"
              onClick={() => setUnits((n) => n + 1)}>+</button>
            <span className="ml-2 text-[9px] text-cave-600">
              {Math.round(balanceRate(st) * 100)}% crosses
            </span>
          </div>

          {/* BOTH HALVES OF THE TRADE, before the button. */}
          {preview && (
            <div className="mt-1.5 rounded border border-cave-800 px-1.5 py-1 text-[10px]"
              data-testid="balance-preview">
              <span className="text-cave-200">
                {units} {nameOf(fromId)} → {preview.out} {nameOf(toId)}
              </span>
              <div className="text-[9px] text-[#e0885a]" data-testid="balance-loss">
                {preview.lost} units of worth are lost on the way across.
              </div>
            </div>
          )}

          <button
            className="btn mt-1.5 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
            disabled={blocked !== null}
            title={blocked ?? undefined}
            data-testid="convert"
            onClick={() => dispatch({ type: 'convert', fromId, toId, units })}
          >
            Put it on the bench
          </button>
          {blocked && <div className="mt-0.5 text-[9px] leading-snug text-cave-600">{blocked}</div>}

          {!crossesShells(st) && (
            <div className="mt-1 text-[9px] leading-snug text-cave-600">
              This Balance works inside one shell. The next one reaches into shells you have left.
            </div>
          )}

          {ledgerKnows(st).length > 0 && (
            <div className="mt-2 border-t border-cave-800 pt-1.5" data-testid="worth-ledger">
              <div className="mb-1 flex items-baseline justify-between text-[9px] uppercase tracking-widest text-cave-500">
                <span>The worth ledger</span>
                <span className="text-cave-600">{Math.round(b.lost)} lost</span>
              </div>
              {ledgerKnows(st).slice(0, 6).map((e) => (
                <div key={e.id} className="flex items-baseline gap-2 py-[1px] text-[10px]">
                  <span className="min-w-0 flex-1 truncate text-cave-200">{e.name}</span>
                  <span className="tnum shrink-0 text-cave-500">{e.units}</span>
                </div>
              ))}
            </div>
          )}

          {cost !== null && (
            <button
              className="btn mt-2 w-full px-1.5 py-1 text-[10px] disabled:opacity-50"
              disabled={rack < cost}
              data-testid="build-balance"
              onClick={() => dispatch({ type: 'buildBalance' })}
            >
              {TIER_CAPABILITY_BALANCE[tier + 1]} — {cost} cast parts
              <span className="text-cave-600"> (rack holds {rack})</span>
            </button>
          )}
        </>
      )}
    </div>
  );
}
