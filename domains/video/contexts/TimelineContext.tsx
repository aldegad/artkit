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
import { normalizeProjectGroupName } from "@/shared/utils/projectGroups";
import {
  loadVideoAutosave,
  type VideoAutosaveData,
} from "../utils/videoAutosave";
import { copyMediaBlob } from "../utils/mediaStorage";
import { normalizeClipTransformKeyframes, sliceClipPositionKeyframes } from "../utils/clipTransformKeyframes";
import {
  cloneTrack,
  cloneClip,
  calculateClipsDuration,
  getDuplicateTrackName,
  getDefaultTrackName,
  reindexTracksForZOrder,
  normalizeClip,
  fitsTrackType,
  resolveTrackIdForClipType,
  getFittedVisualTransform,
  hasTrackOverlap,
  withSafeClipStart,
  sanitizeTimelineViewState,
  findClipAtTime,
  restoreAutosavedClips,
} from "../utils/timelineModel";
import { buildRazorSplitClips } from "../utils/razorSplit";
import { useTimelineHistory } from "./useTimelineHistory";

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
  splitClipAtTime: (clipId: string, splitCursorTime: number) => string | null;
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

export function TimelineProvider({ children }: { children: ReactNode }) {
  const {
    updateProjectDuration,
    project,
    setProject,
    setProjectName,
    setProjectGroup,
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
  // Refs for autosave
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

  const copyMediaBlobSafely = useCallback((sourceClipId: string, targetClipId: string, reason: string) => {
    return copyMediaBlob(sourceClipId, targetClipId).catch((error) => {
      console.error(`Failed to copy media blob (${reason}):`, error);
    });
  }, []);

  const createSafeFittedVisualClip = useCallback((options: {
    baseClip: Clip;
    sourceSize: Size;
    startTime: number;
    canvasSize?: Size;
  }): Clip => {
    const fitted = getFittedVisualTransform(options.sourceSize, options.canvasSize ?? projectRef.current.canvasSize);
    return withSafeClipStart(clipsRef.current, {
      ...options.baseClip,
      position: fitted.position,
      scale: fitted.scale,
    }, options.startTime);
  }, []);

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

  const {
    canUndo,
    canRedo,
    saveToHistory,
    clearHistory,
    undo,
    redo,
  } = useTimelineHistory({
    tracksRef,
    clipsRef,
    setTracks,
    setClips,
    cloneTrack,
    cloneClip,
    maxHistory: 100,
  });

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

  const restoreAutosaveData = useCallback(async (data: VideoAutosaveData) => {
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
    if (data.projectGroup) {
      setProjectGroup(normalizeProjectGroupName(data.projectGroup));
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
  }, [
    clearLoopRange,
    seek,
    selectClips,
    selectMasksForTimeline,
    setAutoKeyframeEnabled,
    setLoopRange,
    setProject,
    setProjectGroup,
    setProjectName,
    setToolMode,
  ]);

  // Load autosave on mount
  useEffect(() => {
    const loadAutosave = async () => {
      try {
        const data = await loadVideoAutosave();
        if (data) {
          await restoreAutosaveData(data);
        }
      } catch (error) {
        console.error("Failed to load autosave:", error);
      } finally {
        clearHistory();
        setIsAutosaveInitialized(true);
      }
    };

    loadAutosave();
  }, [restoreAutosaveData, clearHistory]);

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
          copyMediaBlobSafely(sourceClips[index].id, newClip.id, "track duplicate")
        )
      );
      updateClipsWithDuration((prev) => [...prev, ...duplicatedClips]);
    }

    return duplicatedTrack.id;
  }, [tracks, clips, copyMediaBlobSafely, updateClipsWithDuration]);

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
      const clip = createSafeFittedVisualClip({
        baseClip,
        sourceSize,
        startTime,
        canvasSize,
      });
      updateClipsWithDuration((prev) => [...prev, clip]);
      return clip.id;
    },
    [tracks, createSafeFittedVisualClip, updateClipsWithDuration]
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
      const normalizedClip: Clip = withSafeClipStart(clipsRef.current, clip, startTime);
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
      const clip = createSafeFittedVisualClip({
        baseClip,
        sourceSize,
        startTime,
        canvasSize,
      });
      updateClipsWithDuration((prev) => [...prev, clip]);
      return clip.id;
    },
    [tracks, createSafeFittedVisualClip, updateClipsWithDuration]
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
    const newClip: Clip = withSafeClipStart(clips, {
      ...sourceClip,
      id: crypto.randomUUID(),
      trackId,
      name: `${sourceClip.name} (Copy)`,
      position: { ...sourceClip.position },
      sourceSize: { ...sourceClip.sourceSize },
      transformKeyframes: normalizeClipTransformKeyframes(sourceClip),
    }, sourceClip.startTime + 0.25);

    void copyMediaBlobSafely(sourceClip.id, newClip.id, "timeline duplicate");

    updateClipsWithDuration((prev) => [...prev, newClip]);
    return newClip.id;
  }, [clips, tracks, appendTrack, copyMediaBlobSafely, updateClipsWithDuration]);

  const splitClipAtTime = useCallback((clipId: string, splitCursorTime: number): string | null => {
    const clip = clips.find((candidate) => candidate.id === clipId);
    if (!clip) return null;

    const snapToPoints = (time: number): number => {
      if (!viewState.snapEnabled) return time;
      const safeZoom = Number.isFinite(viewState.zoom) && viewState.zoom > 0
        ? viewState.zoom
        : TIMELINE.DEFAULT_ZOOM;
      const threshold = TIMELINE.SNAP_THRESHOLD / safeZoom;
      const points: number[] = [0];

      for (const candidate of clips) {
        if (candidate.id === clip.id) continue;
        points.push(candidate.startTime);
        points.push(candidate.startTime + candidate.duration);
      }

      for (const point of points) {
        if (Math.abs(time - point) < threshold) {
          return point;
        }
      }
      return time;
    };

    const splitResult = buildRazorSplitClips({
      clip,
      splitCursorTime,
      snapToPoints,
    });
    if (!splitResult) return null;

    const { firstClip, secondClip } = splitResult;
    saveToHistory();

    void Promise.all([
      copyMediaBlobSafely(clip.id, firstClip.id, "timeline split"),
      copyMediaBlobSafely(clip.id, secondClip.id, "timeline split"),
    ]);

    updateClipsWithDuration((prev) => [
      ...prev.filter((candidate) => candidate.id !== clip.id),
      firstClip,
      secondClip,
    ]);

    return secondClip.id;
  }, [clips, viewState.snapEnabled, viewState.zoom, saveToHistory, copyMediaBlobSafely, updateClipsWithDuration]);

  // Add pre-formed clips (for paste)
  const addClips = useCallback((newClips: Clip[]) => {
    updateClipsWithDuration((prev) => {
      const next = [...prev];
      const normalized: Clip[] = [];

      for (const clip of newClips) {
        const adjusted = withSafeClipStart(
          next,
          cloneClip(clip),
          clip.startTime,
          new Set([clip.id])
        );
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
    splitClipAtTime,
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
