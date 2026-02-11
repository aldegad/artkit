"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  useMemo,
  ReactNode,
} from "react";
import {
  VideoTrack,
  Clip,
  TimelineViewState,
  INITIAL_TIMELINE_VIEW,
  createVideoTrack,
  createVideoClip,
  createAudioClip,
  createImageClip,
} from "../types";
import { TIMELINE } from "../constants";
import { useVideoState } from "./VideoStateContext";
import { Size } from "@/shared/types";
import {
  loadVideoAutosave,
} from "../utils/videoAutosave";
import { loadMediaBlob, copyMediaBlob } from "../utils/mediaStorage";
import { normalizeClipTransformKeyframes, sliceClipPositionKeyframes } from "../utils/clipTransformKeyframes";

interface TimelineContextValue {
  // View state
  viewState: TimelineViewState;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setScrollY: (scrollY: number) => void;
  toggleSnap: () => void;
  setViewState: (viewState: TimelineViewState) => void;

  // Track management
  tracks: VideoTrack[];
  addTrack: (name?: string, type?: "video" | "audio") => string;
  duplicateTrack: (trackId: string) => string | null;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<VideoTrack>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  restoreTracks: (tracks: VideoTrack[]) => void;

  // Clip management
  clips: Clip[];
  addVideoClip: (
    trackId: string,
    sourceUrl: string,
    sourceDuration: number,
    sourceSize: Size,
    startTime?: number,
    canvasSize?: Size
  ) => string;
  addAudioClip: (
    trackId: string,
    sourceUrl: string,
    sourceDuration: number,
    startTime?: number,
    sourceSize?: Size
  ) => string;
  addImageClip: (
    trackId: string,
    sourceUrl: string,
    sourceSize: Size,
    startTime?: number,
    duration?: number,
    canvasSize?: Size
  ) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  moveClip: (clipId: string, trackId: string, startTime: number, ignoreClipIds?: string[]) => void;
  trimClipStart: (clipId: string, newStartTime: number) => void;
  trimClipEnd: (clipId: string, newEndTime: number) => void;
  duplicateClip: (clipId: string, targetTrackId?: string) => string | null;
  addClips: (newClips: Clip[]) => void;
  restoreClips: (clips: Clip[]) => void;
  saveToHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;

  // Queries
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  getClipsInTrack: (trackId: string) => Clip[];
  getTrackById: (trackId: string) => VideoTrack | null;

  // Autosave state
  isAutosaveInitialized: boolean;
}

const TimelineContext = createContext<TimelineContextValue | null>(null);

interface TimelineHistorySnapshot {
  tracks: VideoTrack[];
  clips: Clip[];
}

const MAX_HISTORY = 100;

function cloneTrack(track: VideoTrack): VideoTrack {
  return { ...track };
}

function cloneClip(clip: Clip): Clip {
  const transformKeyframes = normalizeClipTransformKeyframes(clip);
  const base = {
    ...clip,
    position: { ...clip.position },
    transformKeyframes,
  };

  return {
    ...base,
    sourceSize: { ...clip.sourceSize },
  };
}

function calculateClipsDuration(clips: Clip[]): number {
  return clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
}

function getDuplicateTrackName(sourceName: string, existingTracks: VideoTrack[]): string {
  const base = `${sourceName} (Copy)`;
  if (!existingTracks.some((track) => track.name === base)) {
    return base;
  }

  let suffix = 2;
  let candidate = `${base} ${suffix}`;
  while (existingTracks.some((track) => track.name === candidate)) {
    suffix += 1;
    candidate = `${base} ${suffix}`;
  }
  return candidate;
}

function getDefaultTrackName(existingTracks: VideoTrack[], type: "video" | "audio"): string {
  const countForType = existingTracks.filter((track) => track.type === type).length + 1;
  return type === "audio" ? `Audio ${countForType}` : `Video ${countForType}`;
}

function reindexTracksForZOrder(tracks: VideoTrack[]): VideoTrack[] {
  // Top track (index 0) gets highest zIndex (foreground).
  return tracks.map((track, index) => ({ ...track, zIndex: tracks.length - 1 - index }));
}

function normalizeClip(clip: Clip): Clip {
  const baseScale = typeof clip.scale === "number" ? clip.scale : 1;
  const scaleX = typeof clip.scaleX === "number" ? clip.scaleX : 1;
  const scaleY = typeof clip.scaleY === "number" ? clip.scaleY : 1;
  const transformKeyframes = normalizeClipTransformKeyframes(clip);

  if (clip.type === "video") {
    return {
      ...clip,
      scale: baseScale,
      scaleX,
      scaleY,
      transformKeyframes,
      hasAudio: clip.hasAudio ?? true,
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  if (clip.type === "audio") {
    return {
      ...clip,
      scale: baseScale,
      scaleX,
      scaleY,
      transformKeyframes,
      sourceSize: clip.sourceSize || { width: 0, height: 0 },
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  return {
    ...clip,
    scale: baseScale,
    scaleX,
    scaleY,
    transformKeyframes,
  };
}

function fitsTrackType(track: VideoTrack | null, clip: Clip): boolean {
  if (!track) return false;
  if (track.type === "audio") return clip.type === "audio";
  return clip.type !== "audio";
}

function resolveTrackIdForClipType(
  trackId: string,
  clipType: Clip["type"],
  tracks: VideoTrack[],
): string {
  const track = tracks.find((candidate) => candidate.id === trackId) || null;
  if (!track) return trackId;

  if (clipType === "audio") {
    if (track.type === "audio") return trackId;
    return tracks.find((candidate) => candidate.type === "audio")?.id || trackId;
  }

  if (track.type !== "audio") return trackId;
  return tracks.find((candidate) => candidate.type !== "audio")?.id || trackId;
}

function getFittedVisualTransform(sourceSize: Size, canvasSize: Size): { position: { x: number; y: number }; scale: number } {
  if (
    sourceSize.width <= 0 ||
    sourceSize.height <= 0 ||
    canvasSize.width <= 0 ||
    canvasSize.height <= 0
  ) {
    return {
      position: { x: 0, y: 0 },
      scale: 1,
    };
  }

  const scale = Math.min(
    canvasSize.width / sourceSize.width,
    canvasSize.height / sourceSize.height
  );
  const fittedWidth = sourceSize.width * scale;
  const fittedHeight = sourceSize.height * scale;

  return {
    position: {
      x: (canvasSize.width - fittedWidth) / 2,
      y: (canvasSize.height - fittedHeight) / 2,
    },
    scale,
  };
}

function rangesOverlap(startA: number, durationA: number, startB: number, durationB: number): boolean {
  const endA = startA + durationA;
  const endB = startB + durationB;
  return startA < endB && endA > startB;
}

function hasTrackOverlap(
  allClips: Clip[],
  candidate: { trackId: string; startTime: number; duration: number },
  excludeClipIds: Set<string> = new Set()
): boolean {
  for (const clip of allClips) {
    if (clip.trackId !== candidate.trackId) continue;
    if (excludeClipIds.has(clip.id)) continue;
    if (rangesOverlap(candidate.startTime, candidate.duration, clip.startTime, clip.duration)) {
      return true;
    }
  }
  return false;
}

function findNextNonOverlappingStart(
  allClips: Clip[],
  trackId: string,
  startTime: number,
  duration: number,
  excludeClipIds: Set<string> = new Set()
): number {
  let nextStart = Math.max(0, startTime);
  const trackClips = allClips
    .filter((clip) => clip.trackId === trackId && !excludeClipIds.has(clip.id))
    .sort((a, b) => a.startTime - b.startTime);

  let changed = true;
  while (changed) {
    changed = false;
    for (const clip of trackClips) {
      if (rangesOverlap(nextStart, duration, clip.startTime, clip.duration)) {
        nextStart = clip.startTime + clip.duration;
        changed = true;
      }
    }
  }

  return nextStart;
}

function sanitizeTimelineViewState(viewState: TimelineViewState): TimelineViewState {
  const zoom = Number.isFinite(viewState.zoom) ? viewState.zoom : INITIAL_TIMELINE_VIEW.zoom;
  const scrollX = Number.isFinite(viewState.scrollX) ? viewState.scrollX : 0;
  const scrollY = Number.isFinite(viewState.scrollY) ? viewState.scrollY : 0;
  return {
    ...INITIAL_TIMELINE_VIEW,
    ...viewState,
    zoom: Math.max(TIMELINE.MIN_ZOOM, Math.min(TIMELINE.MAX_ZOOM, zoom)),
    scrollX: Math.max(0, scrollX),
    scrollY: Math.max(0, scrollY),
  };
}

function isTimeInsideClip(clip: Clip, time: number): boolean {
  return time >= clip.startTime && time < clip.startTime + clip.duration;
}

function findClipAtTime(trackClips: Clip[], time: number): Clip | null {
  if (trackClips.length === 0) return null;

  // Find the right-most clip whose startTime <= time.
  let lo = 0;
  let hi = trackClips.length - 1;
  let candidate = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (trackClips[mid].startTime <= time) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  if (candidate < 0) return null;

  const primary = trackClips[candidate];
  if (isTimeInsideClip(primary, time)) return primary;

  // Fallback for unexpected overlap/out-of-order legacy data.
  for (let i = candidate - 1; i >= 0; i -= 1) {
    const clip = trackClips[i];
    if (clip.startTime + clip.duration <= time) break;
    if (isTimeInsideClip(clip, time)) return clip;
  }

  return null;
}

async function restoreAutosavedClips(savedClips: Clip[]): Promise<{ restoredClips: Clip[]; durationHint: number }> {
  const restoredClips: Clip[] = [];
  const normalizedClips = savedClips.map((clip) => normalizeClip(clip));
  let durationHint = calculateClipsDuration(normalizedClips);
  const clipIdsBySourceId = new Map<string, string[]>();

  for (const clip of normalizedClips) {
    if (!clip.sourceId) continue;
    const ids = clipIdsBySourceId.get(clip.sourceId) || [];
    ids.push(clip.id);
    clipIdsBySourceId.set(clip.sourceId, ids);
  }

  const sourceBlobCache = new Map<string, Blob>();

  for (const normalizedClip of normalizedClips) {
    let blob = await loadMediaBlob(normalizedClip.id);
    if (!blob && normalizedClip.sourceId) {
      blob = sourceBlobCache.get(normalizedClip.sourceId) || null;
      if (!blob) {
        const candidateIds = clipIdsBySourceId.get(normalizedClip.sourceId) || [];
        for (const candidateId of candidateIds) {
          if (candidateId === normalizedClip.id) continue;
          const candidateBlob = await loadMediaBlob(candidateId);
          if (candidateBlob) {
            blob = candidateBlob;
            sourceBlobCache.set(normalizedClip.sourceId, candidateBlob);
            break;
          }
        }
      }
    }

    if (blob) {
      if (normalizedClip.sourceId && !sourceBlobCache.has(normalizedClip.sourceId)) {
        sourceBlobCache.set(normalizedClip.sourceId, blob);
      }
      restoredClips.push({ ...normalizedClip, sourceUrl: URL.createObjectURL(blob) });
      continue;
    }

    // Non-blob URL (e.g., remote URL), keep as is.
    if (!normalizedClip.sourceUrl.startsWith("blob:")) {
      restoredClips.push(normalizedClip);
    }
    // If blob URL but no stored blob, skip (invalid).
  }

  if (restoredClips.length > 0) {
    durationHint = Math.max(durationHint, calculateClipsDuration(restoredClips));
  }

  return { restoredClips, durationHint };
}

export function TimelineProvider({ children }: { children: ReactNode }) {
  const {
    updateProjectDuration,
    project,
    setProject,
    setProjectName,
    selectClips,
    selectMasksForTimeline,
    setToolMode,
    setAutoKeyframeEnabled,
    seek,
    setLoopRange,
    clearLoopRange,
  } = useVideoState();

  const [viewState, setViewStateInternal] = useState<TimelineViewState>(sanitizeTimelineViewState(INITIAL_TIMELINE_VIEW));
  const [tracks, _setTracks] = useState<VideoTrack[]>(() => {
    // Start with one default track
    return [createVideoTrack("Video 1", 0)];
  });
  const [clips, _setClips] = useState<Clip[]>([]);
  const [isAutosaveInitialized, setIsAutosaveInitialized] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Refs for autosave
  const isInitializedRef = useRef(false);
  const historyPastRef = useRef<TimelineHistorySnapshot[]>([]);
  const historyFutureRef = useRef<TimelineHistorySnapshot[]>([]);
  const projectRef = useRef(project);

  // Refs for latest tracks/clips — kept in sync even during React batched updates
  // so captureHistorySnapshot always reads the freshest state.
  const tracksRef = useRef(tracks);
  const clipsRef = useRef(clips);
  tracksRef.current = tracks;
  clipsRef.current = clips;

  // Wrapped setters: keep refs in sync immediately inside the functional updater,
  // preventing stale snapshots when multiple mutations are batched before re-render.
  const setTracks = useCallback((action: React.SetStateAction<VideoTrack[]>) => {
    _setTracks((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      tracksRef.current = next;
      return next;
    });
  }, []);

  const setClips = useCallback((action: React.SetStateAction<Clip[]>) => {
    _setClips((prev) => {
      const next = typeof action === "function" ? action(prev) : action;
      clipsRef.current = next;
      return next;
    });
  }, []);

  const updateClipsWithDuration = useCallback((action: React.SetStateAction<Clip[]>) => {
    setClips(action);
    updateProjectDuration();
  }, [setClips, updateProjectDuration]);

  const appendTrack = useCallback((track: VideoTrack) => {
    setTracks((prev) => {
      const updated = [...prev, track];
      return reindexTracksForZOrder(updated);
    });
  }, [setTracks]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const clipsByTrack = useMemo(() => {
    const index = new Map<string, Clip[]>();
    for (const clip of clips) {
      const list = index.get(clip.trackId);
      if (list) {
        list.push(clip);
      } else {
        index.set(clip.trackId, [clip]);
      }
    }
    for (const list of index.values()) {
      list.sort((a, b) => a.startTime - b.startTime);
    }
    return index;
  }, [clips]);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyPastRef.current.length > 0);
    setCanRedo(historyFutureRef.current.length > 0);
  }, []);

  const captureHistorySnapshot = useCallback((): TimelineHistorySnapshot => {
    return {
      tracks: tracksRef.current.map(cloneTrack),
      clips: clipsRef.current.map(cloneClip),
    };
  }, []);

  const saveToHistory = useCallback(() => {
    historyPastRef.current.push(captureHistorySnapshot());
    if (historyPastRef.current.length > MAX_HISTORY) {
      historyPastRef.current.shift();
    }
    historyFutureRef.current = [];
    syncHistoryFlags();
  }, [captureHistorySnapshot, syncHistoryFlags]);

  const clearHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const undo = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;

    historyFutureRef.current.push(captureHistorySnapshot());
    setTracks(previous.tracks.map(cloneTrack));
    setClips(previous.clips.map(cloneClip));
    syncHistoryFlags();
  }, [captureHistorySnapshot, syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = historyFutureRef.current.pop();
    if (!next) return;

    historyPastRef.current.push(captureHistorySnapshot());
    setTracks(next.tracks.map(cloneTrack));
    setClips(next.clips.map(cloneClip));
    syncHistoryFlags();
  }, [captureHistorySnapshot, syncHistoryFlags]);

  // Set view state
  const setViewState = useCallback((newViewState: TimelineViewState) => {
    setViewStateInternal(sanitizeTimelineViewState(newViewState));
  }, []);

  // Restore functions for autosave
  const restoreTracks = useCallback((savedTracks: VideoTrack[]) => {
    setTracks(savedTracks.map(cloneTrack));
  }, []);

  const restoreClips = useCallback((savedClips: Clip[]) => {
    updateClipsWithDuration(savedClips.map((clip) => cloneClip(normalizeClip(clip))));
  }, [updateClipsWithDuration]);

  // Load autosave on mount
  useEffect(() => {
    const loadAutosave = async () => {
      try {
        const data = await loadVideoAutosave();
        if (data) {
          let durationHint = Math.max(data.project?.duration || 0, 0);

          // Restore timeline data
          if (data.tracks && data.tracks.length > 0) {
            setTracks(data.tracks);
          }
          if (data.clips && data.clips.length > 0) {
            const { restoredClips, durationHint: clipDurationHint } = await restoreAutosavedClips(data.clips as Clip[]);
            durationHint = Math.max(durationHint, clipDurationHint);
            setClips(restoredClips);
          }
          if (data.timelineView) {
            setViewStateInternal(sanitizeTimelineViewState(data.timelineView));
          }
          const normalizedDurationHint = Math.max(durationHint, 0.001);

          // Restore VideoState data
          // Merge correct masks (data.masks) into project to avoid stale project.masks
          if (data.project) {
            setProject({
              ...data.project,
              duration: normalizedDurationHint,
              masks: data.masks || data.project.masks || [],
            });
          }
          if (data.projectName) {
            setProjectName(data.projectName);
          }
          if (data.toolMode) {
            setToolMode(data.toolMode);
          }
          if (typeof data.autoKeyframeEnabled === "boolean") {
            setAutoKeyframeEnabled(data.autoKeyframeEnabled);
          }
          if (data.selectedClipIds) {
            selectClips(data.selectedClipIds);
          }
          if (data.selectedMaskIds) {
            selectMasksForTimeline(data.selectedMaskIds);
          }
          const restoredTime = typeof data.currentTime === "number" ? data.currentTime : 0;
          if (data.playbackRange) {
            setLoopRange(
              data.playbackRange.loopStart,
              data.playbackRange.loopEnd,
              Boolean(data.playbackRange.loop),
              normalizedDurationHint
            );
          } else {
            // Autosave can omit playbackRange when user cleared IN/OUT.
            // In that case, explicitly restore a cleared range.
            clearLoopRange(normalizedDurationHint);
          }
          seek(restoredTime);
        }
      } catch (error) {
        console.error("Failed to load autosave:", error);
      } finally {
        isInitializedRef.current = true;
        historyPastRef.current = [];
        historyFutureRef.current = [];
        syncHistoryFlags();
        setIsAutosaveInitialized(true);
      }
    };

    loadAutosave();
  }, [setProject, setProjectName, setToolMode, setAutoKeyframeEnabled, selectClips, selectMasksForTimeline, seek, setLoopRange, clearLoopRange, syncHistoryFlags]);

  // NOTE: Autosave writes are handled by useVideoSave (in page.tsx) which has
  // access to MaskContext for correct mask data. TimelineContext only handles
  // autosave RESTORE (on mount, above).

  // Keep project.timeline data synchronized with TimelineContext state.
  // NOTE: masks are NOT synced here — MaskContext is the single source of truth
  // for mask data. project.masks is synced from MaskContext in page.tsx.
  useEffect(() => {
    const duration = clips.reduce((max, clip) => {
      return Math.max(max, clip.startTime + clip.duration);
    }, 0);

    setProject({
      ...projectRef.current,
      tracks: tracks.map(cloneTrack),
      clips: clips.map(cloneClip),
      duration: Math.max(duration, 1),
    });
  }, [tracks, clips, setProject]);

  // View state actions
  const setZoom = useCallback((zoom: number) => {
    const safeZoom = Number.isFinite(zoom) ? zoom : TIMELINE.DEFAULT_ZOOM;
    const clampedZoom = Math.max(TIMELINE.MIN_ZOOM, Math.min(TIMELINE.MAX_ZOOM, safeZoom));
    setViewStateInternal((prev) => ({ ...prev, zoom: clampedZoom }));
  }, []);

  const setScrollX = useCallback((scrollX: number) => {
    const safeScrollX = Math.max(0, Number.isFinite(scrollX) ? scrollX : 0);
    setViewStateInternal((prev) => ({ ...prev, scrollX: safeScrollX }));
  }, []);

  const setScrollY = useCallback((scrollY: number) => {
    const safeScrollY = Math.max(0, Number.isFinite(scrollY) ? scrollY : 0);
    setViewStateInternal((prev) => ({ ...prev, scrollY: safeScrollY }));
  }, []);

  const toggleSnap = useCallback(() => {
    setViewStateInternal((prev) => ({ ...prev, snapEnabled: !prev.snapEnabled }));
  }, []);

  // Track management
  const addTrack = useCallback((name?: string, type: "video" | "audio" = "video"): string => {
    const newTrack = createVideoTrack(
      name || getDefaultTrackName(tracks, type),
      0, // New track starts at bottom (background)
      type
    );
    appendTrack(newTrack);
    return newTrack.id;
  }, [tracks, appendTrack]);

  const duplicateTrack = useCallback((trackId: string): string | null => {
    const sourceTrack = tracks.find((track) => track.id === trackId);
    if (!sourceTrack) return null;

    const sourceTrackIndex = tracks.findIndex((track) => track.id === trackId);
    const duplicatedTrack: VideoTrack = {
      ...cloneTrack(sourceTrack),
      id: crypto.randomUUID(),
      name: getDuplicateTrackName(sourceTrack.name, tracks),
    };

    setTracks((prev) => {
      const insertAt = sourceTrackIndex >= 0 ? sourceTrackIndex + 1 : prev.length;
      const next = [...prev];
      next.splice(insertAt, 0, duplicatedTrack);
      return reindexTracksForZOrder(next);
    });

    const sourceClips = clips
      .filter((clip) => clip.trackId === trackId)
      .sort((a, b) => a.startTime - b.startTime);
    const duplicatedClips = sourceClips.map((clip) => ({
      ...cloneClip(clip),
      id: crypto.randomUUID(),
      trackId: duplicatedTrack.id,
    }));

    if (duplicatedClips.length > 0) {
      void Promise.all(
        duplicatedClips.map((newClip, index) =>
          copyMediaBlob(sourceClips[index].id, newClip.id).catch((error) => {
            console.error("Failed to copy media blob on track duplicate:", error);
          })
        )
      );
      updateClipsWithDuration((prev) => [...prev, ...duplicatedClips]);
    }

    return duplicatedTrack.id;
  }, [tracks, clips, updateClipsWithDuration]);

  const removeTrack = useCallback((trackId: string) => {
    // Don't remove the last track
    if (tracks.length <= 1) return;

    // Remove all clips in the track first
    updateClipsWithDuration((prev) => prev.filter((clip) => clip.trackId !== trackId));

    // Remove the track
    setTracks((prev) => {
      const filtered = prev.filter((t) => t.id !== trackId);
      return reindexTracksForZOrder(filtered);
    });

  }, [tracks.length, updateClipsWithDuration]);

  const updateTrack = useCallback((trackId: string, updates: Partial<VideoTrack>) => {
    setTracks((prev) =>
      prev.map((t) => (t.id === trackId ? { ...t, ...updates } : t))
    );
  }, []);

  const reorderTracks = useCallback((fromIndex: number, toIndex: number) => {
    setTracks((prev) => {
      const newTracks = [...prev];
      const [removed] = newTracks.splice(fromIndex, 1);
      newTracks.splice(toIndex, 0, removed);
      return reindexTracksForZOrder(newTracks);
    });
  }, []);

  // Clip management
  const addVideoClip = useCallback(
    (
      trackId: string,
      sourceUrl: string,
      sourceDuration: number,
      sourceSize: Size,
      startTime: number = 0,
      canvasSize?: Size
    ): string => {
      const resolvedTrackId = resolveTrackIdForClipType(trackId, "video", tracks);

      const baseClip = createVideoClip(resolvedTrackId, sourceUrl, sourceDuration, sourceSize, startTime);
      const fitted = getFittedVisualTransform(sourceSize, canvasSize ?? projectRef.current.canvasSize);
      const safeStartTime = findNextNonOverlappingStart(
        clipsRef.current,
        resolvedTrackId,
        startTime,
        baseClip.duration
      );
      const clip: Clip = {
        ...baseClip,
        startTime: safeStartTime,
        position: fitted.position,
        scale: fitted.scale,
      };
      updateClipsWithDuration((prev) => [...prev, clip]);
      return clip.id;
    },
    [tracks, updateClipsWithDuration]
  );

  const addAudioClip = useCallback(
    (
      trackId: string,
      sourceUrl: string,
      sourceDuration: number,
      startTime: number = 0,
      sourceSize: Size = { width: 0, height: 0 }
    ): string => {
      const resolvedTrackId = resolveTrackIdForClipType(trackId, "audio", tracks);

      const clip = createAudioClip(resolvedTrackId, sourceUrl, sourceDuration, startTime, sourceSize);
      const safeStartTime = findNextNonOverlappingStart(
        clipsRef.current,
        resolvedTrackId,
        startTime,
        clip.duration
      );
      const normalizedClip: Clip = {
        ...clip,
        startTime: safeStartTime,
      };
      updateClipsWithDuration((prev) => [...prev, normalizedClip]);
      return normalizedClip.id;
    },
    [tracks, updateClipsWithDuration]
  );

  const addImageClip = useCallback(
    (
      trackId: string,
      sourceUrl: string,
      sourceSize: Size,
      startTime: number = 0,
      duration: number = 5,
      canvasSize?: Size
    ): string => {
      const resolvedTrackId = resolveTrackIdForClipType(trackId, "image", tracks);

      const baseClip = createImageClip(resolvedTrackId, sourceUrl, sourceSize, startTime, duration);
      const fitted = getFittedVisualTransform(sourceSize, canvasSize ?? projectRef.current.canvasSize);
      const safeStartTime = findNextNonOverlappingStart(
        clipsRef.current,
        resolvedTrackId,
        startTime,
        baseClip.duration
      );
      const clip: Clip = {
        ...baseClip,
        startTime: safeStartTime,
        position: fitted.position,
        scale: fitted.scale,
      };
      updateClipsWithDuration((prev) => [...prev, clip]);
      return clip.id;
    },
    [tracks, updateClipsWithDuration]
  );

  const removeClip = useCallback((clipId: string) => {
    updateClipsWithDuration((prev) => prev.filter((c) => c.id !== clipId));
  }, [updateClipsWithDuration]);

  const updateClip = useCallback((clipId: string, updates: Partial<Clip>) => {
    updateClipsWithDuration((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const next = { ...c, ...updates } as Clip;
        const normalizedTransformKeyframes = normalizeClipTransformKeyframes(next);
        return {
          ...next,
          transformKeyframes: normalizedTransformKeyframes,
        } as Clip;
      })
    );
  }, [updateClipsWithDuration]);

  const moveClip = useCallback((clipId: string, trackId: string, startTime: number, ignoreClipIds: string[] = []) => {
    const targetTrack = tracks.find((t) => t.id === trackId) || null;
    if (!targetTrack) return;

    updateClipsWithDuration((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        if (!fitsTrackType(targetTrack, c)) return c;
        const candidateStart = Math.max(0, startTime);
        const excludeIds = new Set<string>([clipId, ...ignoreClipIds]);
        const overlaps = hasTrackOverlap(prev, {
          trackId,
          startTime: candidateStart,
          duration: c.duration,
        }, excludeIds);
        if (overlaps) return c;
        return { ...c, trackId, startTime: candidateStart };
      })
    );
  }, [tracks, updateClipsWithDuration]);

  const trimClipStart = useCallback((clipId: string, newStartTime: number) => {
    updateClipsWithDuration((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;

        const deltaTime = newStartTime - c.startTime;
        const newTrimIn = c.trimIn + deltaTime;
        const newDuration = c.duration - deltaTime;

        // Validate
        if (newTrimIn < 0 || newDuration < TIMELINE.CLIP_MIN_DURATION) return c;

        const candidate = {
          trackId: c.trackId,
          startTime: newStartTime,
          duration: newDuration,
        };
        const overlaps = hasTrackOverlap(prev, candidate, new Set([clipId]));
        if (overlaps) return c;

        const transformKeyframes = sliceClipPositionKeyframes(
          c,
          deltaTime,
          newDuration,
          { includeStart: true, includeEnd: false }
        );
        const nextPosition = transformKeyframes?.position?.[0]?.value || c.position;

        return {
          ...c,
          startTime: newStartTime,
          trimIn: newTrimIn,
          duration: newDuration,
          position: { ...nextPosition },
          transformKeyframes,
        };
      })
    );
  }, [updateClipsWithDuration]);

  const trimClipEnd = useCallback((clipId: string, newEndTime: number) => {
    updateClipsWithDuration((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;

        const newDuration = newEndTime - c.startTime;
        const newTrimOut = c.trimIn + newDuration;

        // Validate
        if (newDuration < TIMELINE.CLIP_MIN_DURATION) return c;
        if ((c.type === "video" || c.type === "audio") && newTrimOut > c.sourceDuration) return c;

        const candidate = {
          trackId: c.trackId,
          startTime: c.startTime,
          duration: newDuration,
        };
        const overlaps = hasTrackOverlap(prev, candidate, new Set([clipId]));
        if (overlaps) return c;

        const transformKeyframes = sliceClipPositionKeyframes(
          c,
          0,
          newDuration,
          { includeStart: true, includeEnd: true }
        );
        const nextPosition = transformKeyframes?.position?.[0]?.value || c.position;

        return {
          ...c,
          duration: newDuration,
          trimOut: newTrimOut,
          position: { ...nextPosition },
          transformKeyframes,
        };
      })
    );
  }, [updateClipsWithDuration]);

  // Duplicate a clip to a target track (or new track if not specified)
  const duplicateClip = useCallback((clipId: string, targetTrackId?: string): string | null => {
    const sourceClip = clips.find((c) => c.id === clipId);
    if (!sourceClip) return null;

    // Determine target track
    let trackId = targetTrackId;
    if (!trackId) {
      // Create a new track for the duplicate
      const duplicateTrackType = sourceClip.type === "audio" ? "audio" : "video";
      const newTrack = createVideoTrack(
        getDefaultTrackName(tracks, duplicateTrackType),
        0,
        duplicateTrackType
      );
      appendTrack(newTrack);
      trackId = newTrack.id;
    }

    // Create duplicate with new ID
    const candidateStart = findNextNonOverlappingStart(
      clips,
      trackId,
      sourceClip.startTime + 0.25,
      sourceClip.duration
    );

    const newClip: Clip = {
      ...sourceClip,
      id: crypto.randomUUID(),
      trackId,
      name: `${sourceClip.name} (Copy)`,
      startTime: candidateStart,
      position: { ...sourceClip.position },
      sourceSize: { ...sourceClip.sourceSize },
      transformKeyframes: normalizeClipTransformKeyframes(sourceClip),
    };

    void copyMediaBlob(sourceClip.id, newClip.id).catch((error) => {
      console.error("Failed to copy media blob on timeline duplicate:", error);
    });

    updateClipsWithDuration((prev) => [...prev, newClip]);
    return newClip.id;
  }, [clips, tracks, appendTrack, updateClipsWithDuration]);

  // Add pre-formed clips (for paste)
  const addClips = useCallback((newClips: Clip[]) => {
    updateClipsWithDuration((prev) => {
      const next = [...prev];
      const normalized: Clip[] = [];

      for (const clip of newClips) {
        const candidateStart = findNextNonOverlappingStart(
          next,
          clip.trackId,
          clip.startTime,
          clip.duration,
          new Set([clip.id])
        );
        const adjusted: Clip = {
          ...cloneClip(clip),
          startTime: candidateStart,
        };
        normalized.push(adjusted);
        next.push(adjusted);
      }

      return [...prev, ...normalized];
    });
  }, [updateClipsWithDuration]);

  // Queries
  const getClipAtTime = useCallback(
    (trackId: string, time: number): Clip | null => {
      const trackClips = clipsByTrack.get(trackId);
      if (!trackClips) return null;
      return findClipAtTime(trackClips, time);
    },
    [clipsByTrack]
  );

  const getClipsInTrack = useCallback(
    (trackId: string): Clip[] => {
      const trackClips = clipsByTrack.get(trackId);
      return trackClips ? [...trackClips] : [];
    },
    [clipsByTrack]
  );

  const getTrackById = useCallback(
    (trackId: string): VideoTrack | null => {
      return tracks.find((t) => t.id === trackId) || null;
    },
    [tracks]
  );

  const value: TimelineContextValue = {
    viewState,
    setZoom,
    setScrollX,
    setScrollY,
    toggleSnap,
    setViewState,
    tracks,
    addTrack,
    duplicateTrack,
    removeTrack,
    updateTrack,
    reorderTracks,
    restoreTracks,
    clips,
    addVideoClip,
    addAudioClip,
    addImageClip,
    removeClip,
    updateClip,
    moveClip,
    trimClipStart,
    trimClipEnd,
    duplicateClip,
    addClips,
    restoreClips,
    saveToHistory,
    undo,
    redo,
    clearHistory,
    canUndo,
    canRedo,
    getClipAtTime,
    getClipsInTrack,
    getTrackById,
    isAutosaveInitialized,
  };

  return (
    <TimelineContext.Provider value={value}>
      {children}
    </TimelineContext.Provider>
  );
}

export function useTimeline() {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error("useTimeline must be used within TimelineProvider");
  }
  return context;
}
