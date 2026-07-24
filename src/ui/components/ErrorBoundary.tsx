/**
 * ONE BROKEN PANEL MUST NEVER TAKE DOWN THE GAME.
 *
 * A throw during render (the classic being a content-id lookup that throws —
 * `materialDef`/`recipeDef`/`gemDef` on an id that isn't registered) propagates
 * up and React unmounts the ENTIRE root: a black screen and a forced refresh
 * that loses the session. This boundary catches that throw at the room level and
 * degrades to an in-place message, so the rest of the app — the nav, the Shaft,
 * the other rooms — keeps working.
 *
 * It is deliberately given a `key` of the active tab at the call site, so moving
 * to another room and back mounts a FRESH boundary and re-attempts the render —
 * a transient bad state does not wedge the room forever.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Named for the message — "The Refinery hit a snag", etc. */
  label?: string;
  /** Optional fallback override — used by the hero boundary to show nothing. */
  fallback?: ReactNode;
}
interface State {
  error: Error | null;
}

export class PanelErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Keep it in the console for a bug report, but never let it reach the root.
    // eslint-disable-next-line no-console
    console.error('[panel error]', this.props.label ?? 'panel', error, info.componentStack);
  }

  private retry = (): void => this.setState({ error: null });

  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;
    return (
      <div className="panel p-4 text-center" role="alert">
        <div className="text-sm font-semibold text-[#e0906a]">
          {this.props.label ? `${this.props.label} hit a snag.` : 'This screen hit a snag.'}
        </div>
        <p className="mt-1 text-[11px] leading-snug text-cave-400">
          Something in here threw and the screen was caught before it could take the rest of the
          game with it. Your run is safe — move to another room, or try again.
        </p>
        <pre className="mt-2 max-h-24 overflow-auto rounded bg-cave-950 p-2 text-left text-[10px] text-cave-500">
          {error.message}
        </pre>
        <button className="btn mt-2 min-h-[44px] px-4 text-xs" onClick={this.retry}>
          Try again
        </button>
      </div>
    );
  }
}

/**
 * THE LAST NET. Everything the game renders OUTSIDE a panel — the nav, the
 * Header, the modals, and (the one that bites) the HERO's Pixi canvases and the
 * chips floating over them — sat under no boundary at all, and `main.tsx`
 * mounted `<App/>` bare. So a throw anywhere up there unmounted the WHOLE React
 * root: React ran every `useEffect` cleanup, which called `FaceView.destroy()` /
 * `ShaftView.destroy()`, which STOP the Pixi tickers for good. The engine kept
 * ticking on its own `startLoop` (currency still moved), but the screen was
 * black and frozen until a manual refresh — exactly the live-playtest report.
 *
 * This boundary wraps the entire app. It cannot degrade "in place" (there is no
 * in-place — it IS the place), so it shows a full-screen, honest card with a
 * reload: the save is written to IndexedDB continuously, so a reload loses
 * nothing and comes back clean. In dev it also prints the throw so the specific
 * culprit is never hidden behind the net.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State { return { error }; }
  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[app error — caught at the root, the game did NOT die]', error, info.componentStack);
  }
  override render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <div className="lamplight flex h-full flex-col items-center justify-center gap-3 p-6 text-center" role="alert">
        <div className="text-lg font-semibold text-[#e0b054]">The lantern guttered.</div>
        <p className="max-w-sm text-sm leading-snug text-cave-300">
          Something on the screen threw and was caught here before it could take the whole game
          down. Your run is safe — it saves as you play. Reload to relight it.
        </p>
        <pre className="max-h-32 max-w-sm overflow-auto rounded bg-cave-950 p-2 text-left text-[10px] text-cave-500">
          {error.message}
        </pre>
        <button className="btn btn-warm min-h-[44px] px-5 text-sm" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
