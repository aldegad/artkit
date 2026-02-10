type PlaybackStopListener = () => void;

const listeners = new Set<PlaybackStopListener>();

export function subscribeImmediatePlaybackStop(listener: PlaybackStopListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitImmediatePlaybackStop(): void {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      // Keep notifying remaining listeners even if one fails.
    }
  }
}
