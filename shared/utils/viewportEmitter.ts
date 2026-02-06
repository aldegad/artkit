import { Point } from "../types";

// ============================================
// Types
// ============================================

export interface ViewportState {
  zoom: number;
  pan: Point;
  baseScale: number;
}

// ============================================
// ViewportEmitter
// ============================================

type ViewportListener = (state: ViewportState) => void;

/**
 * Typed event emitter for viewport changes.
 * Follows the same pattern as playbackTick.ts.
 * Bypasses React state entirely for 16ms frame targets.
 */
export class ViewportEmitter {
  private listeners = new Set<ViewportListener>();

  subscribe(listener: ViewportListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(state: ViewportState): void {
    console.log("[ViewportEmitter] emit called, listeners:", this.listeners.size, state);
    for (const listener of this.listeners) {
      listener(state);
    }
  }

  listenerCount(): number {
    return this.listeners.size;
  }
}
