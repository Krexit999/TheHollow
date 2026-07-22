/**
 * Tiny typed event bus for cross-system reactions (achievements listen for
 * purchases, collapses, level-ups...). Engine-internal; the UI consumes the
 * feed ring buffer on GameState instead.
 */
import type { GameEvent, GameEventType } from './types';

type Handler = (event: GameEvent) => void;

export class EventBus {
  private handlers = new Map<GameEventType | '*', Set<Handler>>();

  on(type: GameEventType | '*', fn: Handler): () => void {
    let set = this.handlers.get(type);
    if (!set) {
      set = new Set();
      this.handlers.set(type, set);
    }
    set.add(fn);
    return () => set.delete(fn);
  }

  emit(event: GameEvent): void {
    this.handlers.get(event.type)?.forEach((fn) => fn(event));
    this.handlers.get('*')?.forEach((fn) => fn(event));
  }
}
