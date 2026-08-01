import { useEffect, useMemo, useRef } from 'react';
import { useGame, type TabId } from './store';
import { CLUSTERS, clusterOf, clusterVisible, defaultSystem, type ClusterDef } from './nav';
import { Header } from './components/Header';
import { FaceCanvas } from './components/FaceCanvas';
import { ShaftCanvas } from './shaft/ShaftCanvas';
import { DepthBar } from './components/DepthBar';
import { DigPanel, KilnPanel, DrillsPanel } from './components/panels';
import { HoldPanel } from './components/HoldPanel';
import { CastingPanel } from './components/CastingPanel';
import { RefineryPanel } from './components/refinery';
import { CollapsePanel, DelverPanel } from './components/prestige';
import { GridPanel, VaultPanel } from './components/meta';
import { OfflineModal, Toasts } from './components/overlays';
import { BreachOverlay } from './components/ferrite';
import { GrowthChip } from './components/verdance';
import { RunesPanel } from './components/glassmere';
import { FloodModal, OverpressureOverlay, VentsPanel } from './components/cinder';
import { HollowPanel, ParallelView, RewritePanel } from './components/hollow';
import { NextHint } from './components/NextHint';
import { DisclosureGate } from './components/DisclosureGate';
import { SystemHeader } from './components/SystemHeader';
import { PanelErrorBoundary } from './components/ErrorBoundary';
import { SYSTEM_COPY } from './systemCopy';
import { SpiralPanel, RelicsPanel } from './components/longtail';
import { Compendium, CompendiumButton } from './components/Compendium';
import { UndoToast, RunSummaryModal, SpendConfirmModal, PinnedStrip } from './components/qol';

/**
 * Only the ACTIVE panel renders. `hidden` is a CSS class — React still builds
 * every hidden panel's tree on every store publish, which at 12Hz meant a
 * late-game save re-rendering 120 relic cards, the achievement grid and every
 * craft board continuously while the player looked at the Face. Measured on a
 * throttled phone: p95 frame 695ms, worst 1190ms, one frame in five a visible
 * hitch.
 *
 * The Lattice is the documented exception and stays mounted: it owns a Pixi
 * application, and repeatedly destroying renderers poisons Pixi's shared object
 * pools. It is hidden by CSS, as before.
 */
/** The room's display name, for the error-boundary message. */
function roomLabel(tab: TabId): string {
  return SYSTEM_COPY[tab]?.title ?? 'This screen';
}

function PanelHost({ tab }: { tab: TabId; state: ReturnType<typeof useGame.getState>['state'] }) {
  const only = (id: TabId) => tab === id;
  return (
    <>
      {only('dig') && <DigPanel />}
      {/* The Shaft is a full canvas takeover in the hero, not a panel here. */}
      {only('kiln') && <KilnPanel />}
      {only('drills') && <DrillsPanel />}
      {only('vents') && <VentsPanel />}
      {only('hollow') && <HollowPanel />}
      {only('hold') && <HoldPanel />}
      {only('casting') && <CastingPanel />}
      {only('refinery') && <RefineryPanel />}
      {only('runes') && <RunesPanel />}
      {only('delver') && <DelverPanel />}
      {only('collapse') && <CollapsePanel />}
      {only('rewrite') && <RewritePanel />}
      {only('parallel') && <ParallelView />}
      {only('grid') && <GridPanel />}
      {only('vault') && <VaultPanel />}
      {only('spiral') && <SpiralPanel />}
      {only('relics') && <RelicsPanel />}
    </>
  );
}

/**
 * THESE TWO LIVE AT MODULE SCOPE ON PURPOSE.
 *
 * They used to be defined inside App()'s body. A component declared inside a
 * render body gets a NEW FUNCTION IDENTITY every render, so React treats it as
 * a different component type and UNMOUNTS + REMOUNTS its whole subtree — here,
 * twelve times a second, because the store publishes a snapshot at ~12Hz.
 *
 * The DOM node under the pointer was therefore being destroyed and recreated
 * continuously: `transition-colors` restarted from its base colour on every
 * remount and the :hover state was dropped and re-acquired. That is the
 * "flickers and is impossible to click" the player reported — and it is
 * invisible to a geometry probe, because nothing ever moves. The tell was the
 * computed COLOUR: one distinct value on the active tab (whose styling does not
 * depend on hover), ten or eleven on every other button.
 */
const SystemSelector = ({
  compact, systems, tab, freshTabs, label, onPick,
}: {
  compact?: boolean;
  systems: { id: TabId; label: string }[];
  tab: TabId;
  freshTabs: TabId[];
  label: string;
  onPick: (id: TabId) => void;
}) => (
  <div className="flex flex-wrap gap-1" role="tablist" aria-label={`${label} systems`}>
    {systems.map((sys) => (
      <button
        key={sys.id}
        role="tab"
        aria-selected={tab === sys.id}
        onClick={() => onPick(sys.id)}
        className={`shrink-0 rounded-md px-2.5 py-1 text-xs font-semibold uppercase tracking-wider transition-colors ${
          tab === sys.id ? 'bg-cave-700 text-lamp-300' : 'text-cave-400 hover:bg-cave-800 hover:text-cave-200'
        } ${freshTabs.includes(sys.id) && tab !== sys.id ? 'tab-new text-lamp-400' : ''} ${compact ? 'text-[11px]' : ''}`}
      >
        {sys.label}
      </button>
    ))}
  </div>
);

const ClusterButton = ({
  c, orientation, isActive, fresh, onGo,
}: {
  c: ClusterDef;
  orientation: 'rail' | 'bar';
  isActive: boolean;
  fresh: boolean;
  onGo: (c: ClusterDef) => void;
}) => {
  const rail = orientation === 'rail';
  return (
    <button
      onClick={() => onGo(c)}
      aria-current={isActive ? 'page' : undefined}
      aria-label={c.label}
      className={`relative flex items-center gap-2 rounded-lg transition-colors ${
        rail ? 'w-full px-3 py-2' : 'flex-1 flex-col justify-center gap-0.5 py-1.5'
      } ${isActive ? 'bg-cave-700 text-lamp-300' : 'text-cave-400 hover:bg-cave-800 hover:text-cave-200'}`}
    >
      <span className={rail ? 'text-lg leading-none' : 'text-base leading-none'} aria-hidden>{c.glyph}</span>
      <span className={`font-semibold uppercase tracking-wider ${rail ? 'text-xs' : 'text-[9px]'}`}>{c.label}</span>
      {fresh && (
        <span className={`absolute rounded-full bg-lamp-400 ${rail ? 'right-2 top-2 h-1.5 w-1.5' : 'right-1/4 top-1 h-1.5 w-1.5'}`} aria-hidden />
      )}
    </button>
  );
};

export function App() {
  const state = useGame((s) => s.state);
  const tab = useGame((s) => s.tab);
  const setTab = useGame((s) => s.setTab);
  const freshTabs = useGame((s) => s.freshTabs);
  const markFresh = useGame((s) => s.markFresh);
  useGame((s) => s.rev);

  // Glow-hint systems the moment they first appear (the disclosure gate, in
  // DisclosureGate, batches the "something opened" beat).
  const seen = useRef<Set<TabId>>(new Set(['dig', 'delver', 'grid', 'vault']));
  useEffect(() => {
    if (!state) return;
    for (const c of CLUSTERS) {
      for (const sys of c.systems) {
        if (sys.visible(state) && !seen.current.has(sys.id)) {
          seen.current.add(sys.id);
          markFresh(sys.id);
        }
      }
    }
  });

  const active = useMemo(() => clusterOf(tab), [tab]);
  const inRoom = active.id !== 'face';

  if (!state) {
    return (
      <div className="lamplight flex h-full items-center justify-center text-cave-400">
        Lighting the lantern…
      </div>
    );
  }

  const visibleClusters = CLUSTERS.filter((c) => clusterVisible(c, state));
  const clusterFresh = (c: ClusterDef) => c.systems.some((s) => freshTabs.includes(s.id) && s.id !== tab);
  const visibleSystems = active.systems.filter((s) => s.visible(state));

  // The Shaft takes over the hero. Its canvas mounts once the shaft exists and
  // stays mounted thereafter (maxDepthRecord never falls), so the Pixi app is
  // never destroyed under a live Face.
  const onShaft = tab === 'shaft';
  const shaftAvailable = state.maxDepthRecord >= 10 || state.shaft.reached >= 10;

  const goCluster = (c: ClusterDef) => {
    const d = defaultSystem(c, state);
    if (d) setTab(d);
  };

  return (
    <div className="lamplight flex h-full flex-col">
      <Header />

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:gap-2 lg:px-4 lg:pb-4">
        {/* Desktop: the section rail. */}
        <nav className="hidden w-32 shrink-0 flex-col gap-1 pl-2 pt-1 lg:flex" aria-label="Sections">
          {visibleClusters.map((c) => (
            <ClusterButton key={c.id} c={c} orientation="rail" isActive={active.id === c.id} fresh={clusterFresh(c)} onGo={goCluster} />
          ))}
        </nav>

        {/* The face — the hero. Persistent on desktop; the home screen on phone
            (hidden while inside a room, but never unmounted — the canvas lives).
            The SHAFT is the same hero, seen sideways: it takes the whole stage
            when its tab is active, and both canvases stay mounted (Pixi's shared
            batch pools do not survive a renderer being destroyed mid-flight). */}
        <div className={`shrink-0 flex-col gap-2 px-2 pt-1 lg:flex lg:min-h-0 lg:min-w-0 lg:flex-1 lg:px-0 lg:pt-0 ${inRoom ? 'hidden' : 'flex'}`}>
          <div className={`relative shrink-0 lg:h-auto lg:min-h-0 lg:flex-1 ${onShaft ? 'h-[66vh]' : 'h-[42vh]'}`}>
            <div className={`absolute inset-0 ${onShaft ? 'invisible' : ''}`}>
              {/* One live renderer at a time: the Face sleeps while the Shaft
                  owns the hero, and wakes with a full repaint (A.38). */}
              <FaceCanvas active={!onShaft} />
              {/* The chips/banners that float OVER the face live in their own
                  boundary, apart from the canvas: if one throws (a weather or
                  encounter edge case), it vanishes instead of unmounting the
                  hero — which would destroy the Face's Pixi renderer. The canvas
                  itself sits outside, protected by the root AppErrorBoundary. */}
              <PanelErrorBoundary label="Face overlays" fallback={null}>
                <GrowthChip />
                <OverpressureOverlay />
              </PanelErrorBoundary>
            </div>
            {shaftAvailable && (
              <div className={`absolute inset-0 ${onShaft ? '' : 'invisible pointer-events-none'}`}>
                <ShaftCanvas active={onShaft} />
              </div>
            )}
          </div>
          {!onShaft && <DepthBar />}
          {!onShaft && <PinnedStrip compact />}
          {!onShaft && <div className="lg:hidden"><NextHint /></div>}
        </div>

        {/* The room region: secondary selector + the active system. On desktop
            it is the right column; on phone it is the face-home footer (face
            cluster) or a full-screen room (any other cluster). */}
        <section
          className="flex min-h-0 flex-1 flex-col lg:min-w-0 lg:flex-[0_1_560px]"
          aria-label={active.label}
        >
          {/* Phone room header: context strip + back to the face. */}
          {inRoom && (
            <div className="flex items-center gap-2 px-3 pt-2 lg:hidden">
              <button onClick={() => setTab('dig')} className="btn px-2 py-1 text-xs" aria-label="Back to the face">←</button>
              <span className="text-xs font-semibold uppercase tracking-wider text-lamp-300">{active.glyph} {active.label}</span>
              <span className="ml-auto truncate text-[10px] text-cave-400">{state.shell.current} · depth {state.depth}</span>
            </div>
          )}
          <div className="px-3 pt-2 lg:px-0">
            <SystemSelector systems={visibleSystems} tab={tab} freshTabs={freshTabs} label={active.label} onPick={setTab} />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-24 pt-2 scroll-thin lg:px-1 lg:pb-1">
            {/* Every system, no exceptions. The old exclusion set assumed the
                P9/P10 panels "self-explained" — the same assumption that left
                the Kiln unexplained until a player said so out loud. */}
            <SystemHeader system={tab} />
            {/* One broken room degrades in place instead of black-screening the
                whole game. Keyed by tab so leaving and returning re-attempts. */}
            <PanelErrorBoundary key={tab} label={roomLabel(tab)}>
              <PanelHost tab={tab} state={state} />
            </PanelErrorBoundary>
            {inRoom && <div className="mt-3 lg:hidden"><NextHint /></div>}
          </div>
        </section>
      </div>

      {/* Phone: the fixed bottom cluster bar. Five items, never scrolls. */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex gap-0.5 border-t border-cave-700 bg-cave-950/95 px-1 pb-[env(safe-area-inset-bottom)] pt-0.5 backdrop-blur lg:hidden" aria-label="Sections">
        {visibleClusters.map((c) => (
          <ClusterButton key={c.id} c={c} orientation="bar" isActive={active.id === c.id} fresh={clusterFresh(c)} onGo={goCluster} />
        ))}
      </nav>

      <Compendium />
      <CompendiumButton variant="fab" />
      <OfflineModal />
      <DisclosureGate />
      <Toasts />
      <UndoToast />
      <RunSummaryModal />
      <SpendConfirmModal />
      <BreachOverlay />
      <FloodModal />
    </div>
  );
}
