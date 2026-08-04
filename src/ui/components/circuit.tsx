/**
 * THE CIRCUIT — the condition strip, as a plain panel (§7.3, §25.3, §37).
 *
 * It lives in THE PLANT cluster, with the machines it throws. Four rows a
 * machine, evaluated top-down, first match wins — and the firing row is marked
 * live, so a running strip is a column of little lights moving down a list,
 * which is what §25.3 asks for and the only part of it that needed a renderer.
 *
 * LAW 3 — HIDE THE RECIPES, SHOW THE DESTINATIONS. There is no browser of
 * everything the Circuit will ever read: the pickers are built from
 * `availableReads`/`availableActs`, so a read whose source does not exist and a
 * machine you have not built are both simply absent. What IS shown, always, is
 * WHAT EVERY READ SAYS RIGHT NOW — the destinations. You write a rule against a
 * world you can watch moving, not against a manual.
 */
import { useState } from 'react';
import { useGame, dispatch } from '../store';
import { ModifierCache } from '../../engine/modifiers';
import { Select } from './Select';
import {
  MACHINE_LABEL, MAX_ROWS, availableActs, availableMachines, availableReads,
  circuitUnlocked, ensureCircuit, readDef, rowMatches, rowSentence,
  stationHere, stripOf, winningRow,
  type CircuitRow, type MachineId,
} from '../../engine/systems/circuit';
import type { GameState } from '../../engine';

const mods = new ModifierCache();

function useFreshMods() {
  useGame((s) => s.rev);
  mods.invalidate();
  return mods;
}

/** The editor for one row. Number reads get a bounded input; enums get a list. */
function RowEditor({
  st, machine, index, row, onDone,
}: {
  st: GameState; machine: MachineId; index: number; row: CircuitRow | null; onDone: () => void;
}) {
  const reads = availableReads(st);
  const acts = availableActs(st, machine);
  const [read, setRead] = useState(row?.read ?? reads[0]?.id ?? '');
  const [op, setOp] = useState(row?.op ?? 'is');
  const [value, setValue] = useState(String(row?.value ?? ''));
  const [act, setAct] = useState(row?.act ?? acts[0]?.id ?? '');

  const rd = readDef(read);
  if (!rd) return null;
  const enumOpts = rd.kind === 'enum' ? (rd.options?.(st) ?? []) : [];
  const effectiveOp = rd.kind === 'enum'
    ? (op === 'isnt' ? 'isnt' : 'is')
    : (op === 'lt' ? 'lt' : 'gt');
  const effectiveValue = rd.kind === 'enum'
    ? (enumOpts.some((o) => o.value === value) ? value : (enumOpts[0]?.value ?? ''))
    : value;

  return (
    <div className="mt-1 rounded-md border border-[#7fa8c4]/40 bg-cave-900/60 p-1.5" data-testid="circuit-editor">
      <div className="flex flex-wrap items-center gap-1 text-[10px] text-cave-500">
        <span className="uppercase tracking-widest text-[#7fa8c4]">When</span>
        <Select
          className="min-w-[7.5rem] flex-1"
          ariaLabel="What the row reads"
          value={read}
          onChange={(v) => { setRead(v); setValue(''); }}
          options={reads.map((r) => ({ value: r.id, label: r.label }))}
        />
        <Select
          className="w-[5.5rem]"
          ariaLabel="How it compares"
          value={effectiveOp}
          onChange={(v) => setOp(v as CircuitRow['op'])}
          options={rd.kind === 'enum'
            ? [{ value: 'is', label: 'is' }, { value: 'isnt', label: 'is not' }]
            : [{ value: 'gt', label: 'is over' }, { value: 'lt', label: 'is under' }]}
        />
        {rd.kind === 'enum' ? (
          <Select
            className="min-w-[7.5rem] flex-1"
            ariaLabel="What it is compared against"
            value={effectiveValue}
            onChange={setValue}
            options={enumOpts.map((o) => ({ value: o.value, label: o.label }))}
          />
        ) : (
          <input
            type="number"
            className="tnum w-[5.5rem] rounded border border-cave-700 bg-cave-900 px-1.5 py-1 text-[11px] text-cave-200"
            aria-label="The threshold"
            min={0}
            max={rd.max ?? 100}
            value={effectiveValue}
            onChange={(e) => setValue(e.target.value)}
          />
        )}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] text-cave-500">
        <span className="uppercase tracking-widest text-[#c9a86a]">Then</span>
        <Select
          className="min-w-[9rem] flex-1"
          ariaLabel="What the machine does"
          value={act}
          onChange={setAct}
          options={acts.map((a) => ({ value: a.id, label: a.label }))}
        />
      </div>
      <div className="mt-1 flex gap-1">
        <button
          className="btn flex-1 py-1 text-[10px]"
          data-testid="circuit-save"
          onClick={() => {
            dispatch({
              type: 'setCircuitRow',
              machine,
              index,
              row: {
                read,
                op: effectiveOp,
                value: rd.kind === 'enum' ? effectiveValue : Number(effectiveValue || 0),
                act,
              },
            });
            onDone();
          }}
        >
          {row ? 'Rewrite the row' : 'Add the row'}
        </button>
        <button className="btn px-2 py-1 text-[10px] text-cave-500" onClick={onDone}>Cancel</button>
      </div>
    </div>
  );
}

export function CircuitPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const m = useFreshMods();
  const [machine, setMachine] = useState<MachineId>('kiln');
  const [editing, setEditing] = useState<number | null>(null);
  if (!state) return null;
  const st = state as GameState;
  if (!circuitUnlocked(st)) return null;

  const machines = availableMachines(st);
  if (machines.length === 0) return null;
  const active = machines.includes(machine) ? machine : machines[0]!;
  const c = ensureCircuit(st);
  const strip = stripOf(st, active);
  const firing = winningRow(st, m, active);
  const fires = c.fires[active] ?? [];
  const flips = c.flips[active] ?? 0;
  const acts = c.acts[active] ?? 0;
  const here = stationHere(st);

  return (
    <div className="panel p-3" data-testid="circuit-panel">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-widest text-cave-400">The Circuit</span>
        <span className="tnum text-[10px] text-cave-500" data-testid="circuit-acts">
          {acts} thrown
        </span>
      </div>
      <p className="text-[10px] leading-snug text-cave-500">
        Four rows, read top to bottom, first one that fits wins. The rock is re-rolled every
        Collapse — a rule you wrote for last run is running against this one.
      </p>

      <div className="mt-1.5 flex gap-1">
        {machines.map((id) => (
          <button
            key={id}
            className={`flex-1 rounded border px-1 py-1 text-[10px] ${
              id === active
                ? 'border-[#7fa8c4]/60 bg-cave-800 text-cave-200'
                : 'border-cave-800 text-cave-500 hover:text-cave-300'
            }`}
            data-testid={`circuit-tab-${id}`}
            onClick={() => { setMachine(id); setEditing(null); }}
          >
            {MACHINE_LABEL[id]}
            {(stripOf(st, id).length > 0) && <span className="ml-1 text-cave-600">{stripOf(st, id).length}</span>}
          </button>
        ))}
      </div>

      <div className="mt-1.5 space-y-1" data-testid="circuit-strip">
        {strip.length === 0 && (
          <p className="text-[10px] italic text-cave-600">
            {MACHINE_LABEL[active]} is on its own for now.
          </p>
        )}
        {strip.map((row, i) => {
          const lit = i === firing;
          const matches = rowMatches(st, m, row, active);
          return (
            <div
              key={i}
              className={`rounded border px-1.5 py-1 ${lit ? 'border-[#c9a86a]/70 bg-[#c9a86a]/10' : 'border-cave-800'}`}
              data-testid={`circuit-row-${active}-${i}`}
              data-firing={lit ? 'yes' : 'no'}
            >
              <div className="flex items-start gap-1.5">
                <span
                  className={`mt-[3px] h-1.5 w-1.5 shrink-0 rounded-full ${
                    lit ? 'bg-[#e0b25a]' : matches ? 'bg-cave-600' : 'bg-cave-800'
                  }`}
                  title={lit ? 'firing' : matches ? 'true, but a row above it won' : 'not true here'}
                />
                <span className="min-w-0 flex-1 text-[10px] leading-snug text-cave-300">
                  {rowSentence(st, row)}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1">
                <span className="tnum min-w-0 flex-1 truncate text-[9px] text-cave-600">
                  won {fires[i] ?? 0}×
                </span>
                <button
                  className="btn px-1.5 py-0.5 text-[9px]"
                  disabled={i === 0}
                  aria-label={`Move row ${i + 1} up`}
                  onClick={() => dispatch({ type: 'moveCircuitRow', machine: active, index: i, to: i - 1 })}
                >↑</button>
                <button
                  className="btn px-1.5 py-0.5 text-[9px]"
                  disabled={i === strip.length - 1}
                  aria-label={`Move row ${i + 1} down`}
                  onClick={() => dispatch({ type: 'moveCircuitRow', machine: active, index: i, to: i + 1 })}
                >↓</button>
                <button
                  className="btn px-1.5 py-0.5 text-[9px]"
                  data-testid={`circuit-edit-${i}`}
                  onClick={() => setEditing(editing === i ? null : i)}
                >edit</button>
                <button
                  className="btn px-1.5 py-0.5 text-[9px] text-cave-500"
                  aria-label={`Cut row ${i + 1}`}
                  onClick={() => dispatch({ type: 'setCircuitRow', machine: active, index: i, row: null })}
                >×</button>
              </div>
              {editing === i && (
                <RowEditor st={st} machine={active} index={i} row={row} onDone={() => setEditing(null)} />
              )}
            </div>
          );
        })}
      </div>

      {strip.length < MAX_ROWS && editing !== strip.length && (
        <button
          className="btn mt-1 w-full py-1 text-[10px]"
          data-testid="circuit-add"
          onClick={() => setEditing(strip.length)}
        >
          Write a row · {strip.length}/{MAX_ROWS}
        </button>
      )}
      {editing === strip.length && (
        <RowEditor st={st} machine={active} index={strip.length} row={null} onDone={() => setEditing(null)} />
      )}

      {/*
        THE ARGUMENT COUNTER. §25.3: loops are not a bug, the Circuit REPORTS
        them and debugging your own plant is the point. Loam has no Line to
        cycle, so the honest form of "row 1 → row 1, 340 times" here is two rows
        taking it in turns as the world moves under them.
      */}
      {flips >= 4 && (
        <p className="mt-1 text-[10px] leading-snug text-[#e0b25a]" data-testid="circuit-flips">
          This strip has changed its mind {flips} times. Something it reads is moving faster than
          the machine can follow.
        </p>
      )}

      {/*
        WHAT IT READS RIGHT NOW. The destinations half of LAW 3, and the thing
        that makes a strip writable at all: a condition you cannot see the value
        of is a guess.
      */}
      <div className="mt-2 border-t border-cave-800 pt-1.5">
        <div className="mb-1 flex items-baseline justify-between">
          <span className="text-[9px] font-semibold uppercase tracking-widest text-cave-500">
            What it reads
          </span>
          <span className="min-w-0 truncate text-[9px] text-cave-600">
            {here ? here.name : 'above the first station'}
          </span>
        </div>
        {availableReads(st).map((r) => (
          <div key={r.id} className="flex items-baseline gap-2 py-[1px] text-[10px]" data-testid={`circuit-read-${r.id}`}>
            <span className="min-w-0 flex-1 truncate text-cave-500">{r.label}</span>
            <span className="tnum shrink-0 text-cave-300">{r.now(st, m, active)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
