import { useEffect, useRef } from 'react';
import { FaceView } from '../face/FaceView';
import { useGame } from '../store';

export function FaceCanvas({ active = true }: { active?: boolean }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<FaceView | null>(null);
  const engine = useGame((s) => s.engine);
  const reducedMotion = useGame((s) => s.reducedMotion);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !engine) return;
    let view: FaceView | null = null;
    let cancelled = false;
    void FaceView.create(host, engine, reducedMotion).then((v) => {
      if (cancelled) v.destroy();
      else {
        view = v;
        viewRef.current = v;
        v.setActive(activeRef.current);
        // Dev-only: the repro/shot harness needs to measure ticker liveness
        // directly — currency moving is NOT proof the canvas is alive (Pixi's
        // event system is DOM-driven and keeps dispatching chips on a dead view).
        if (import.meta.env.DEV) (window as unknown as { __faceView?: unknown }).__faceView = v;
      }
    });
    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
    };
  }, [engine, reducedMotion]);

  // One renderer at a time: pause while the Shaft owns the hero (see A.38).
  const activeRef = useRef(active);
  activeRef.current = active;
  useEffect(() => { viewRef.current?.setActive(active); }, [active]);

  return (
    <div
      className="relative h-full w-full overflow-hidden rounded-xl border border-cave-700 bg-cave-950"
      aria-label="The mining face — press and hold to chip"
    >
      <div
        ref={hostRef}
        className="absolute inset-0 cursor-crosshair"
        style={{ touchAction: 'none' }}
      />
    </div>
  );
}
