import { create } from "zustand";
import { Point, Size, SpriteFrame, SpriteTrack } from "../types";
import { deepCopyFrames } from "../utils/frameUtils";

// ============================================
// Types
// ============================================

interface TrackHistorySnapshot {
  tracks: SpriteTrack[];
  nextFrameId: number;
}

interface SpriteTrackStore {
  // Image (source image for polygon extraction)
  imageSrc: string | null;
  imageSize: Size;

  // Tracks
  tracks: SpriteTrack[];
  activeTrackId: string | null;
  nextFrameId: number;

  // Playback
  currentFrameIndex: number;
  isPlaying: boolean;
  fps: number;

  // Selection / Pen tool state
  selectedFrameId: number | null;
  selectedPointIndex: number | null;
  currentPoints: Point[];

  // History
  canUndo: boolean;
  canRedo: boolean;

  // Image Actions
  setImageSrc: (src: string | null) => void;
  setImageSize: (size: Size) => void;

  // Track Actions
  addTrack: (name?: string, frames?: SpriteFrame[]) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Omit<SpriteTrack, "id">>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  setActiveTrackId: (id: string | null) => void;

  // Frame Actions (on specific track)
  addFramesToTrack: (trackId: string, frames: SpriteFrame[]) => void;
  removeFrame: (trackId: string, frameId: number) => void;
  updateFrame: (trackId: string, frameId: number, updates: Partial<SpriteFrame>) => void;
  reorderFrames: (trackId: string, fromIndex: number, toIndex: number) => void;
  setNextFrameId: (id: number | ((prev: number) => number)) => void;

  // Selection / Pen Actions
  setSelectedFrameId: (id: number | null) => void;
  setSelectedPointIndex: (index: number | null) => void;
  setCurrentPoints: (points: Point[] | ((prev: Point[]) => Point[])) => void;

  // Playback Actions
  setCurrentFrameIndex: (index: number | ((prev: number) => number)) => void;
  setIsPlaying: (playing: boolean) => void;
  setFps: (fps: number) => void;

  // Computed
  getActiveTrack: () => SpriteTrack | undefined;
  getActiveTrackFrames: () => SpriteFrame[];
  getMaxFrameCount: () => number;

  // History Actions
  pushHistory: () => void;
  undo: () => void;
  redo: () => void;

  // Bulk restore (for autosave/project load)
  restoreTracks: (tracks: SpriteTrack[], nextFrameId: number) => void;

  // Reset
  reset: () => void;
}

// ============================================
// History Management (closure-based)
// ============================================

const historyStack: TrackHistorySnapshot[] = [];
let historyIndex = -1;
let hasUnsavedChanges = false;

function deepCopyTrack(track: SpriteTrack): SpriteTrack {
  return {
    ...track,
    frames: deepCopyFrames(track.frames),
  };
}

function deepCopyTracks(tracks: SpriteTrack[]): SpriteTrack[] {
  return tracks.map(deepCopyTrack);
}

function reindexZIndex(tracks: SpriteTrack[]): SpriteTrack[] {
  return tracks.map((t, i) => ({
    ...t,
    zIndex: tracks.length - 1 - i,
  }));
}

let nextTrackCounter = 1;

function generateTrackId(): string {
  return `track-${Date.now()}-${nextTrackCounter++}`;
}

// ============================================
// Store
// ============================================

export const useSpriteTrackStore = create<SpriteTrackStore>((set, get) => ({
  // Initial State
  imageSrc: null,
  imageSize: { width: 0, height: 0 },
  tracks: [],
  activeTrackId: null,
  nextFrameId: 1,
  currentFrameIndex: 0,
  isPlaying: false,
  fps: 12,
  selectedFrameId: null,
  selectedPointIndex: null,
  currentPoints: [],
  canUndo: false,
  canRedo: false,

  // Image Actions
  setImageSrc: (src) => set({ imageSrc: src }),
  setImageSize: (size) => set({ imageSize: size }),

  // Track Actions
  addTrack: (name, frames) => {
    const id = generateTrackId();
    const { tracks } = get();
    const trackName = name || `Track ${tracks.length + 1}`;

    const newTrack: SpriteTrack = {
      id,
      name: trackName,
      frames: frames ? deepCopyFrames(frames) : [],
      visible: true,
      locked: false,
      opacity: 100,
      zIndex: tracks.length, // top of stack
      loop: false,
    };

    const newTracks = reindexZIndex([newTrack, ...tracks]);

    set({
      tracks: newTracks,
      activeTrackId: id,
    });

    return id;
  },

  removeTrack: (trackId) => {
    const { tracks, activeTrackId } = get();
    if (tracks.length <= 1) return; // prevent removing last track

    const filtered = reindexZIndex(tracks.filter((t) => t.id !== trackId));
    const newActiveId =
      activeTrackId === trackId ? (filtered[0]?.id ?? null) : activeTrackId;

    set({
      tracks: filtered,
      activeTrackId: newActiveId,
    });
  },

  updateTrack: (trackId, updates) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, ...updates } : t,
      ),
    }));
  },

  reorderTracks: (fromIndex, toIndex) => {
    set((state) => {
      const newTracks = [...state.tracks];
      const [moved] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, moved);
      return { tracks: reindexZIndex(newTracks) };
    });
  },

  setActiveTrackId: (id) => set({ activeTrackId: id }),

  // Frame Actions
  addFramesToTrack: (trackId, frames) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, frames: [...t.frames, ...deepCopyFrames(frames)] }
          : t,
      ),
    }));
  },

  removeFrame: (trackId, frameId) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, frames: t.frames.filter((f) => f.id !== frameId) }
          : t,
      ),
    }));
  },

  updateFrame: (trackId, frameId, updates) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? {
              ...t,
              frames: t.frames.map((f) =>
                f.id === frameId ? { ...f, ...updates } : f,
              ),
            }
          : t,
      ),
    }));
  },

  reorderFrames: (trackId, fromIndex, toIndex) => {
    set((state) => ({
      tracks: state.tracks.map((t) => {
        if (t.id !== trackId) return t;
        const newFrames = [...t.frames];
        const [moved] = newFrames.splice(fromIndex, 1);
        newFrames.splice(toIndex, 0, moved);
        return { ...t, frames: newFrames };
      }),
    }));
  },

  setNextFrameId: (idOrFn) =>
    set((state) => ({
      nextFrameId:
        typeof idOrFn === "function" ? idOrFn(state.nextFrameId) : idOrFn,
    })),

  // Selection / Pen Actions
  setSelectedFrameId: (id) => set({ selectedFrameId: id }),
  setSelectedPointIndex: (index) => set({ selectedPointIndex: index }),

  setCurrentPoints: (pointsOrFn) =>
    set((state) => ({
      currentPoints:
        typeof pointsOrFn === "function"
          ? pointsOrFn(state.currentPoints)
          : pointsOrFn,
    })),

  // Playback Actions
  setCurrentFrameIndex: (indexOrFn) =>
    set((state) => ({
      currentFrameIndex:
        typeof indexOrFn === "function"
          ? indexOrFn(state.currentFrameIndex)
          : indexOrFn,
    })),

  setIsPlaying: (playing) => set({ isPlaying: playing }),
  setFps: (fps) => set({ fps }),

  // Computed
  getActiveTrack: () => {
    const { tracks, activeTrackId } = get();
    return tracks.find((t) => t.id === activeTrackId);
  },

  getActiveTrackFrames: () => {
    const { tracks, activeTrackId } = get();
    const track = tracks.find((t) => t.id === activeTrackId);
    return track?.frames ?? [];
  },

  getMaxFrameCount: () => {
    const { tracks } = get();
    if (tracks.length === 0) return 0;
    return Math.max(...tracks.map((t) => t.frames.length));
  },

  // History Actions
  pushHistory: () => {
    const { tracks, nextFrameId } = get();

    if (historyIndex < historyStack.length - 1) {
      historyStack.length = historyIndex + 1;
    }

    historyStack.push({
      tracks: deepCopyTracks(tracks),
      nextFrameId,
    });
    historyIndex = historyStack.length - 1;
    hasUnsavedChanges = true;

    if (historyStack.length > 50) {
      historyStack.shift();
      historyIndex--;
    }

    set({ canUndo: true, canRedo: false });
  },

  undo: () => {
    const { tracks, nextFrameId } = get();

    if (historyStack.length > 0 && historyIndex >= 0) {
      if (hasUnsavedChanges && historyIndex === historyStack.length - 1) {
        historyStack.push({
          tracks: deepCopyTracks(tracks),
          nextFrameId,
        });
        hasUnsavedChanges = false;
      }

      const prev = historyStack[historyIndex];
      historyIndex--;

      set({
        tracks: deepCopyTracks(prev.tracks),
        nextFrameId: prev.nextFrameId,
        canUndo: historyIndex >= 0,
        canRedo: true,
      });
    }
  },

  redo: () => {
    if (historyIndex < historyStack.length - 1) {
      historyIndex++;
      const next = historyStack[historyIndex];

      set({
        tracks: deepCopyTracks(next.tracks),
        nextFrameId: next.nextFrameId,
        canUndo: true,
        canRedo: historyIndex < historyStack.length - 1,
      });
    }
  },

  // Bulk restore
  restoreTracks: (tracks, nextFrameId) => {
    set({
      tracks: deepCopyTracks(tracks),
      nextFrameId,
      activeTrackId: tracks[0]?.id ?? null,
    });
  },

  // Reset
  reset: () => {
    historyStack.length = 0;
    historyIndex = -1;
    hasUnsavedChanges = false;

    set({
      imageSrc: null,
      imageSize: { width: 0, height: 0 },
      tracks: [],
      activeTrackId: null,
      nextFrameId: 1,
      currentFrameIndex: 0,
      isPlaying: false,
      fps: 12,
      selectedFrameId: null,
      selectedPointIndex: null,
      currentPoints: [],
      canUndo: false,
      canRedo: false,
    });
  },
}));
