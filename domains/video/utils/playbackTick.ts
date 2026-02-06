type TickListener = (currentTime: number) => void;

class PlaybackTickEmitter {
  private listeners = new Set<TickListener>();

  subscribe(listener: TickListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  emit(currentTime: number): void {
    for (const listener of this.listeners) {
      listener(currentTime);
    }
  }
}

export const playbackTick = new PlaybackTickEmitter();
