import { useState } from 'react';
import {
  ACH_COLS,
  ACH_ROWS,
  ACHIEVEMENTS,
  achievementAt,
  COL_BONUSES,
  isColComplete,
  isRowComplete,
  ROW_BONUSES,
} from '../../engine/content/shell1/achievements';
import { exportSave, importSave } from '../../engine/save/exportSave';
import { serialize } from '../../engine/save/codec';
import { dispatch, useGame } from '../store';
import { HoldButton } from './shared';
import { AutoResolveRow } from './combat';
import { ComfortSettings } from './qol';

// ---------------------------------------------------------------------------
// The achievement grid — 25 x 10, mostly empty. The emptiness is the hook.
// ---------------------------------------------------------------------------

export function GridPanel() {
  const state = useGame((s) => s.state);
  useGame((s) => s.rev);
  const [selected, setSelected] = useState<string | null>(null);
  if (!state) return null;

  const unlockedCount = Object.keys(state.achievements.unlocked).length;
  const sel = selected ? ACHIEVEMENTS.find((a) => a.id === selected) : null;

  return (
    <div className="space-y-2">
      <div className="panel flex items-baseline justify-between p-3">
        <span className="text-sm font-semibold text-cave-200">The Grid</span>
        <span className="tnum text-xs text-cave-400">
          {unlockedCount} / {ACH_COLS * ACH_ROWS}
        </span>
      </div>
      <div className="panel overflow-x-auto p-3 scroll-thin">
        <div className="min-w-[520px]">
          {Array.from({ length: ACH_ROWS }, (_, row) => (
            <div key={row} className="mb-0.5 flex items-center gap-0.5">
              {Array.from({ length: ACH_COLS }, (_, col) => {
                const ach = achievementAt(row, col);
                const unlocked = ach && state.achievements.unlocked[ach.id];
                return (
                  <button
                    key={col}
                    onClick={() => ach && setSelected(ach.id)}
                    title={ach ? ach.name : undefined}
                    className={`h-4 w-4 shrink-0 rounded-[3px] border transition-colors ${
                      unlocked
                        ? 'border-lamp-400/70 bg-lamp-500/70 shadow-[0_0_5px_rgba(245,158,11,0.5)]'
                        : ach
                          ? 'border-cave-600 bg-cave-800 hover:border-lamp-500/50'
                          : 'border-cave-800 bg-cave-900'
                    }`}
                  />
                );
              })}
              {isRowComplete(state, row) && <span className="ml-1 text-[10px] text-lamp-400">★</span>}
            </div>
          ))}
          <div className="mt-1 flex gap-0.5">
            {Array.from({ length: ACH_COLS }, (_, col) => (
              <span key={col} className="flex h-3 w-4 shrink-0 items-start justify-center text-[9px] text-lamp-400">
                {isColComplete(state, col) ? '★' : ''}
              </span>
            ))}
          </div>
        </div>
      </div>
      {sel && (
        <div className="panel p-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm font-semibold text-cave-200">{sel.name}</span>
            <span className={`text-[10px] uppercase tracking-wider ${state.achievements.unlocked[sel.id] ? 'text-lamp-400' : 'text-cave-400'}`}>
              {state.achievements.unlocked[sel.id] ? 'Earned' : 'Not yet'}
            </span>
          </div>
          <div className="mt-1 text-xs text-cave-400">{sel.description}</div>
          <div className="mt-1 text-xs text-lamp-400">{sel.bonus.label}</div>
        </div>
      )}
      <div className="panel space-y-1 p-3 text-[11px] text-cave-400">
        <div className="font-semibold uppercase tracking-wider text-cave-300">Line bonuses</div>
        {Object.entries(COL_BONUSES).map(([col, b]) => (
          <div key={col} className={isColComplete(state, Number(col)) ? 'text-lamp-400' : ''}>
            Column {Number(col) + 1}: {b.label}
          </div>
        ))}
        {Object.entries(ROW_BONUSES).map(([row, b]) => (
          <div key={row} className={isRowComplete(state, Number(row)) ? 'text-lamp-400' : ''}>
            Row {Number(row) + 1}: {b.label}
          </div>
        ))}
        <div className="pt-1 italic">238 squares wait in the dark. Most belong to deeper shells.</div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Vault — save / export / import / reset (+ dev tools)
// ---------------------------------------------------------------------------

export function VaultPanel() {
  const state = useGame((s) => s.state);
  const persistence = useGame((s) => s.persistence);
  const engine = useGame((s) => s.engine);
  useGame((s) => s.rev);
  const [exported, setExported] = useState('');
  const [importText, setImportText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  if (!state || !engine) return null;

  const doExport = () => {
    const text = exportSave(engine.getState(), Date.now());
    setExported(text);
    dispatch({ type: 'markExported' });
    void navigator.clipboard?.writeText(text).then(
      () => setMessage('Copied to clipboard.'),
      () => setMessage('Select and copy the text below.'),
    );
  };

  const doImport = () => {
    try {
      const imported = importSave(importText);
      // Round-trip through the codec so bad shapes fail loudly here.
      serialize(imported, Date.now());
      dispatch({ type: 'hydrate', state: imported, nowMs: Date.now() });
      void persistence?.saveNow();
      setMessage('Save imported.');
      setImportText('');
    } catch (err) {
      setMessage(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  return (
    <div className="space-y-2">
      <AutoResolveRow />
      <ComfortSettings />
      <div className="panel space-y-2 p-3">
        <div className="flex items-center justify-between text-xs text-cave-400">
          <span>Autosaves every 10s and when the tab hides.</span>
          <button className="btn px-2.5 py-1 text-xs" onClick={() => void persistence?.saveNow().then(() => setMessage('Saved.'))}>
            Save now
          </button>
        </div>
        <div className="flex gap-2">
          <button className="btn flex-1 py-1.5 text-xs" onClick={doExport}>
            Export save
          </button>
        </div>
        {exported && (
          <textarea
            readOnly
            value={exported}
            onFocus={(e) => e.currentTarget.select()}
            className="h-20 w-full rounded-md border border-cave-700 bg-cave-950 p-2 font-mono text-[10px] text-cave-300"
          />
        )}
        <textarea
          placeholder="Paste a save string to import…"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          className="h-14 w-full rounded-md border border-cave-700 bg-cave-950 p-2 font-mono text-[10px] text-cave-300 placeholder:text-cave-600"
        />
        <button className="btn w-full py-1.5 text-xs" disabled={!importText.trim()} onClick={doImport}>
          Import
        </button>
        {message && <div className="text-center text-[11px] text-lamp-400">{message}</div>}
      </div>

      <div className="panel p-3">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-red-400/80">Abandon the dig</div>
        <HoldButton
          onConfirm={() => {
            dispatch({ type: 'hardReset' });
            void persistence?.saveNow();
          }}
          holdMs={1500}
          className="btn w-full border-red-900 py-1.5 text-xs text-red-400 hover:border-red-600"
        >
          Hold to erase everything
        </HoldButton>
      </div>

      {import.meta.env.DEV && <DebugPanel />}
    </div>
  );
}

function DebugPanel() {
  return (
    <div className="panel space-y-1.5 p-3">
      <div className="text-xs font-semibold uppercase tracking-wider text-core">Debug (dev build)</div>
      <div className="grid grid-cols-2 gap-1.5">
        <button className="btn py-1 text-[11px]" onClick={() => dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e4 })}>
          +10K Dust
        </button>
        <button className="btn py-1 text-[11px]" onClick={() => dispatch({ type: 'debug', op: 'grant', currency: 'brick', amount: 100 })}>
          +100 Brick
        </button>
        <button className="btn py-1 text-[11px]" onClick={() => dispatch({ type: 'debug', op: 'grant', currency: 'core', amount: 50 })}>
          +50 Cores
        </button>
        <button className="btn py-1 text-[11px]" onClick={() => dispatch({ type: 'debug', op: 'warp', seconds: 3600 })}>
          Warp 1h (live)
        </button>
        <button className="btn py-1 text-[11px]" onClick={() => dispatch({ type: 'applyOffline', seconds: 8 * 3600 })}>
          Offline 8h
        </button>
        <button className="btn py-1 text-[11px]" onClick={() => dispatch({ type: 'debug', op: 'grant', currency: 'dust', amount: 1e9 })}>
          +1B Dust
        </button>
      </div>
    </div>
  );
}
