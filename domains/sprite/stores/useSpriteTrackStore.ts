import { create } from "zustand";
import { Point, Size, SpriteFrame, SpriteTrack } from "../types";
import { deepCopyFrames } from "../utils/frameUtils";
import { useSpriteUIStore } from "./useSpriteUIStore";

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
  selectedFrameIds: number[];
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
  duplicateTrack: (trackId: string) => string | null;
  removeTrack: (trackId: string) => void;
  reverseTrackFrames: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Omit<SpriteTrack, "id">>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  setActiveTrackId: (id: string | null) => void;

  // Frame Actions (on specific track)
  addFramesToTrack: (trackId: string, frames: SpriteFrame[]) => void;
  insertEmptyFrameToTrack: (trackId: string, insertIndex?: number) => number | null;
  removeFrame: (trackId: string, frameId: number) => void;
  updateFrame: (trackId: string, frameId: number, updates: Partial<SpriteFrame>) => void;
  reorderFrames: (trackId: string, fromIndex: number, toIndex: number) => void;
  setNextFrameId: (id: number | ((prev: number) => number)) => void;

  // Selection / Pen Actions
  setSelectedFrameId: (id: number | null) => void;
  setSelectedFrameIds: (ids: number[]) => void;
  toggleSelectedFrameId: (id: number) => void;
  selectFrameRange: (fromId: number, toId: number) => void;
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

function resolveFrameSize(imageSize: Size): Size {
  const canvasSize = useSpriteUIStore.getState().canvasSize;
  const widthCandidate = canvasSize?.width ?? imageSize.width;
  const heightCandidate = canvasSize?.height ?? imageSize.height;
  const width = Number.isFinite(widthCandidate) ? Math.max(1, Math.round(widthCandidate)) : 1;
  const height = Number.isFinite(heightCandidate) ? Math.max(1, Math.round(heightCandidate)) : 1;
  return { width, height };
}

function createTransparentFrameDataUrl(size: Size): string | undefined {
  if (typeof document === "undefined") return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return undefined;
  ctx.clearRect(0, 0, size.width, size.height);
  return canvas.toDataURL("image/png");
}

function createEmptyFrame(frameId: number, frameSize: Size): SpriteFrame {
  const imageData = createTransparentFrameDataUrl(frameSize);
  return {
    id: frameId,
    points: [],
    name: `Frame ${frameId}`,
    imageData,
    offset: { x: 0, y: 0 },
  };
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
  selectedFrameIds: [],
  selectedPointIndex: null,
  currentPoints: [],
  canUndo: false,
  canRedo: false,

  // Image Actions
  setImageSrc: (src) => set({ imageSrc: src, isPlaying: false }),
  setImageSize: (size) => set({ imageSize: size, isPlaying: false }),

  // Track Actions
  addTrack: (name, frames) => {
    const id = generateTrackId();
    const { tracks, nextFrameId, imageSize } = get();
    const trackName = name || `Track ${tracks.length + 1}`;
    const hasProvidedFrames = Array.isArray(frames);
    const newTrackFrames = hasProvidedFrames
      ? deepCopyFrames(frames)
      : [createEmptyFrame(nextFrameId, resolveFrameSize(imageSize))];
    const defaultFrameId = hasProvidedFrames ? null : newTrackFrames[0]?.id ?? null;

    const newTrack: SpriteTrack = {
      id,
      name: trackName,
      frames: newTrackFrames,
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
      nextFrameId: hasProvidedFrames ? nextFrameId : nextFrameId + 1,
      selectedFrameId: defaultFrameId,
      selectedFrameIds: defaultFrameId !== null ? [defaultFrameId] : [],
      currentFrameIndex: 0,
      isPlaying: false,
    });

    return id;
  },

  duplicateTrack: (trackId) => {
    const { tracks, nextFrameId } = get();
    const sourceTrackIndex = tracks.findIndex((t) => t.id === trackId);
    if (sourceTrackIndex === -1) return null;

    const sourceTrack = tracks[sourceTrackIndex];
    const newTrackId = generateTrackId();
    const duplicatedFrames = sourceTrack.frames.map((frame, index) => ({
      ...frame,
      id: nextFrameId + index,
      points: frame.points.map((p) => ({ ...p })),
      offset: { ...frame.offset },
    }));

    const duplicatedTrack: SpriteTrack = {
      ...sourceTrack,
      id: newTrackId,
      name: `${sourceTrack.name} Copy`,
      frames: duplicatedFrames,
      zIndex: tracks.length, // temporary; normalized below
    };

    const newTracks = [...tracks];
    newTracks.splice(sourceTrackIndex + 1, 0, duplicatedTrack);

    set({
      tracks: reindexZIndex(newTracks),
      activeTrackId: newTrackId,
      nextFrameId: nextFrameId + duplicatedFrames.length,
      isPlaying: false,
    });

    return newTrackId;
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
      isPlaying: false,
    });
  },

  reverseTrackFrames: (trackId) => {
    set((state) => ({
      tracks: state.tracks.map((track) =>
        track.id === trackId ? { ...track, frames: [...track.frames].reverse() } : track,
      ),
      isPlaying: false,
    }));
  },

  updateTrack: (trackId, updates) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId ? { ...t, ...updates } : t,
      ),
      isPlaying: false,
    }));
  },

  reorderTracks: (fromIndex, toIndex) => {
    set((state) => {
      const newTracks = [...state.tracks];
      const [moved] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, moved);
      return { tracks: reindexZIndex(newTracks), isPlaying: false };
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
      isPlaying: false,
    }));
  },

  insertEmptyFrameToTrack: (trackId, insertIndex) => {
    const { tracks, nextFrameId, imageSize } = get();
    const targetTrack = tracks.find((track) => track.id === trackId);
    if (!targetTrack) return null;

    const boundedIndex =
      typeof insertIndex === "number"
        ? Math.max(0, Math.min(targetTrack.frames.length, insertIndex))
        : targetTrack.frames.length;

    const newFrameId = nextFrameId;
    const emptyFrame = createEmptyFrame(newFrameId, resolveFrameSize(imageSize));

    set((state) => ({
      tracks: state.tracks.map((track) => {
        if (track.id !== trackId) return track;
        const newFrames = [...track.frames];
        newFrames.splice(boundedIndex, 0, emptyFrame);
        return { ...track, frames: newFrames };
      }),
      nextFrameId: state.nextFrameId + 1,
      isPlaying: false,
    }));

    return newFrameId;
  },

  removeFrame: (trackId, frameId) => {
    set((state) => ({
      tracks: state.tracks.map((t) =>
        t.id === trackId
          ? { ...t, frames: t.frames.filter((f) => f.id !== frameId) }
          : t,
      ),
      isPlaying: false,
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
      isPlaying: false,
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
      isPlaying: false,
    }));
  },

  setNextFrameId: (idOrFn) =>
    set((state) => ({
      nextFrameId:
        typeof idOrFn === "function" ? idOrFn(state.nextFrameId) : idOrFn,
      isPlaying: false,
    })),

  // Selection / Pen Actions
  setSelectedFrameId: (id) => set({ selectedFrameId: id }),
  setSelectedFrameIds: (ids) => set({ selectedFrameIds: ids }),
  toggleSelectedFrameId: (id) =>
    set((state) => {
      const exists = state.selectedFrameIds.includes(id);
      return {
        selectedFrameIds: exists
          ? state.selectedFrameIds.filter((fid) => fid !== id)
          : [...state.selectedFrameIds, id],
      };
    }),
  selectFrameRange: (fromId, toId) => {
    const frames = get().getActiveTrackFrames();
    const fromIdx = frames.findIndex((f) => f.id === fromId);
    const toIdx = frames.findIndex((f) => f.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;
    const start = Math.min(fromIdx, toIdx);
    const end = Math.max(fromIdx, toIdx);
    const rangeIds = frames.slice(start, end + 1).map((f) => f.id);
    set({ selectedFrameIds: rangeIds });
  },
  setSelectedPointIndex: (index) => set({ selectedPointIndex: index }),

  setCurrentPoints: (pointsOrFn) =>
    set((state) => ({
      currentPoints:
        typeof pointsOrFn === "function"
          ? pointsOrFn(state.currentPoints)
          : pointsOrFn,
      isPlaying: false,
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
        isPlaying: false,
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
        isPlaying: false,
      });
    }
  },

  // Bulk restore
  restoreTracks: (tracks, nextFrameId) => {
    const normalizedTracks = reindexZIndex(deepCopyTracks(tracks));
    set({
      tracks: normalizedTracks,
      nextFrameId,
      activeTrackId: normalizedTracks[0]?.id ?? null,
      currentFrameIndex: 0,
      isPlaying: false,
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
      selectedFrameIds: [],
      selectedPointIndex: null,
      currentPoints: [],
      canUndo: false,
      canRedo: false,
    });
  },
}));
