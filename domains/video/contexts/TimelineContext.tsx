"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
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
  MaskData,
} from "../types";
import { TIMELINE } from "../constants";
import { useVideoState } from "./VideoStateContext";
import { Size } from "@/shared/types";
import {
  loadVideoAutosave,
  saveVideoAutosave,
  VIDEO_AUTOSAVE_DEBOUNCE_MS,
} from "../utils/videoAutosave";
import { loadMediaBlob } from "../utils/mediaStorage";

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
  moveClip: (clipId: string, trackId: string, startTime: number) => void;
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
  const base = {
    ...clip,
    position: { ...clip.position },
  };

  return {
    ...base,
    sourceSize: { ...clip.sourceSize },
  };
}

function normalizeClip(clip: Clip): Clip {
  if (clip.type === "video") {
    return {
      ...clip,
      hasAudio: clip.hasAudio ?? true,
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  if (clip.type === "audio") {
    return {
      ...clip,
      sourceSize: clip.sourceSize || { width: 0, height: 0 },
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  return clip;
}

function fitsTrackType(track: VideoTrack | null, clip: Clip): boolean {
  if (!track) return false;
  if (track.type === "audio") return clip.type === "audio";
  return clip.type !== "audio";
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

export function TimelineProvider({ children }: { children: ReactNode }) {
  const {
    updateProjectDuration,
    project,
    projectName,
    toolMode,
    selectedClipIds,
    playback,
    setProject,
    setProjectName,
    selectClips,
    setToolMode,
  } = useVideoState();

  const [viewState, setViewStateInternal] = useState<TimelineViewState>(INITIAL_TIMELINE_VIEW);
  const [tracks, setTracks] = useState<VideoTrack[]>(() => {
    // Start with one default track
    return [createVideoTrack("Video 1", 0)];
  });
  const [clips, setClips] = useState<Clip[]>([]);
  const [masks, setMasks] = useState<MaskData[]>([]);
  const [isAutosaveInitialized, setIsAutosaveInitialized] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);

  // Refs for autosave
  const isInitializedRef = useRef(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const historyPastRef = useRef<TimelineHistorySnapshot[]>([]);
  const historyFutureRef = useRef<TimelineHistorySnapshot[]>([]);
  const projectRef = useRef(project);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyPastRef.current.length > 0);
    setCanRedo(historyFutureRef.current.length > 0);
  }, []);

  const captureHistorySnapshot = useCallback((): TimelineHistorySnapshot => {
    return {
      tracks: tracks.map(cloneTrack),
      clips: clips.map(cloneClip),
    };
  }, [tracks, clips]);

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
    setViewStateInternal(newViewState);
  }, []);

  // Restore functions for autosave
  const restoreTracks = useCallback((savedTracks: VideoTrack[]) => {
    setTracks(savedTracks.map(cloneTrack));
  }, []);

  const restoreClips = useCallback((savedClips: Clip[]) => {
    setClips(savedClips.map((clip) => cloneClip(normalizeClip(clip))));
    updateProjectDuration();
  }, [updateProjectDuration]);

  // Load autosave on mount
  useEffect(() => {
    const loadAutosave = async () => {
      try {
        const data = await loadVideoAutosave();
        if (data) {
          // Restore timeline data
          if (data.tracks && data.tracks.length > 0) {
            setTracks(data.tracks);
          }
          if (data.clips && data.clips.length > 0) {
            // Restore clips with blobs from IndexedDB
            const restoredClips: Clip[] = [];

            for (const clip of data.clips) {
              const normalizedClip = normalizeClip(clip as Clip);
              // Try to load blob from IndexedDB using clipId
              const blob = await loadMediaBlob(normalizedClip.id);

              if (blob) {
                // Create new blob URL from stored blob
                const newUrl = URL.createObjectURL(blob);
                restoredClips.push({ ...normalizedClip, sourceUrl: newUrl });
              } else if (!normalizedClip.sourceUrl.startsWith("blob:")) {
                // Non-blob URL (e.g., remote URL), keep as is
                restoredClips.push(normalizedClip);
              }
              // If blob URL but no stored blob, skip (invalid)
            }

            setClips(restoredClips);
          }
          if (data.timelineView) {
            setViewStateInternal(data.timelineView);
          }
          if (data.masks) {
            setMasks(data.masks);
          }
          // Restore VideoState data
          if (data.project) {
            setProject(data.project);
          }
          if (data.projectName) {
            setProjectName(data.projectName);
          }
          if (data.toolMode) {
            setToolMode(data.toolMode);
          }
          if (data.selectedClipIds) {
            selectClips(data.selectedClipIds);
          }
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
  }, [setProject, setProjectName, setToolMode, selectClips, syncHistoryFlags]);

  // Debounced autosave on state change
  useEffect(() => {
    if (!isInitializedRef.current) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      // Save all clips - blobs are stored separately in IndexedDB
      saveVideoAutosave({
        project,
        projectName,
        tracks,
        clips,
        masks,
        timelineView: viewState,
        currentTime: playback.currentTime,
        toolMode,
        selectedClipIds,
      }).catch((error) => {
        console.error("Failed to autosave:", error);
      });
    }, VIDEO_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    project,
    projectName,
    tracks,
    clips,
    masks,
    viewState,
    playback.currentTime,
    toolMode,
    selectedClipIds,
  ]);

  // Keep project.timeline data synchronized with TimelineContext state.
  useEffect(() => {
    const duration = clips.reduce((max, clip) => {
      return Math.max(max, clip.startTime + clip.duration);
    }, 0);

    setProject({
      ...projectRef.current,
      tracks: tracks.map(cloneTrack),
      clips: clips.map(cloneClip),
      masks: [...masks],
      duration: Math.max(duration, 10),
    });
  }, [tracks, clips, masks, setProject]);

  // View state actions
  const setZoom = useCallback((zoom: number) => {
    const clampedZoom = Math.max(TIMELINE.MIN_ZOOM, Math.min(TIMELINE.MAX_ZOOM, zoom));
    setViewStateInternal((prev) => ({ ...prev, zoom: clampedZoom }));
  }, []);

  const setScrollX = useCallback((scrollX: number) => {
    setViewStateInternal((prev) => ({ ...prev, scrollX: Math.max(0, scrollX) }));
  }, []);

  const setScrollY = useCallback((scrollY: number) => {
    setViewStateInternal((prev) => ({ ...prev, scrollY: Math.max(0, scrollY) }));
  }, []);

  const toggleSnap = useCallback(() => {
    setViewStateInternal((prev) => ({ ...prev, snapEnabled: !prev.snapEnabled }));
  }, []);

  // Track management
  const addTrack = useCallback((name?: string, type: "video" | "audio" = "video"): string => {
    const countForType = tracks.filter((track) => track.type === type).length + 1;
    const fallbackName = type === "audio" ? `Audio ${countForType}` : `Video ${countForType}`;
    const newTrack = createVideoTrack(
      name || fallbackName,
      tracks.length,
      type
    );
    setTracks((prev) => [...prev, newTrack]);
    return newTrack.id;
  }, [tracks]);

  const removeTrack = useCallback((trackId: string) => {
    // Don't remove the last track
    if (tracks.length <= 1) return;

    // Remove all clips in the track first
    setClips((prev) => prev.filter((clip) => clip.trackId !== trackId));

    // Remove the track
    setTracks((prev) => {
      const filtered = prev.filter((t) => t.id !== trackId);
      // Re-index zIndex
      return filtered.map((t, i) => ({ ...t, zIndex: i }));
    });

    updateProjectDuration();
  }, [tracks.length, updateProjectDuration]);

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
      // Re-index zIndex
      return newTracks.map((t, i) => ({ ...t, zIndex: i }));
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
      const track = tracks.find((t) => t.id === trackId) || null;
      const resolvedTrackId =
        track && track.type !== "audio"
          ? trackId
          : tracks.find((t) => t.type !== "audio")?.id || trackId;

      const baseClip = createVideoClip(resolvedTrackId, sourceUrl, sourceDuration, sourceSize, startTime);
      const fitted = getFittedVisualTransform(sourceSize, canvasSize ?? projectRef.current.canvasSize);
      const clip: Clip = {
        ...baseClip,
        position: fitted.position,
        scale: fitted.scale,
      };
      setClips((prev) => [...prev, clip]);
      updateProjectDuration();
      return clip.id;
    },
    [tracks, updateProjectDuration]
  );

  const addAudioClip = useCallback(
    (
      trackId: string,
      sourceUrl: string,
      sourceDuration: number,
      startTime: number = 0,
      sourceSize: Size = { width: 0, height: 0 }
    ): string => {
      const track = tracks.find((t) => t.id === trackId) || null;
      const resolvedTrackId =
        track && track.type === "audio"
          ? trackId
          : tracks.find((t) => t.type === "audio")?.id || trackId;

      const clip = createAudioClip(resolvedTrackId, sourceUrl, sourceDuration, startTime, sourceSize);
      setClips((prev) => [...prev, clip]);
      updateProjectDuration();
      return clip.id;
    },
    [tracks, updateProjectDuration]
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
      const track = tracks.find((t) => t.id === trackId) || null;
      const resolvedTrackId =
        track && track.type !== "audio"
          ? trackId
          : tracks.find((t) => t.type !== "audio")?.id || trackId;

      const baseClip = createImageClip(resolvedTrackId, sourceUrl, sourceSize, startTime, duration);
      const fitted = getFittedVisualTransform(sourceSize, canvasSize ?? projectRef.current.canvasSize);
      const clip: Clip = {
        ...baseClip,
        position: fitted.position,
        scale: fitted.scale,
      };
      setClips((prev) => [...prev, clip]);
      updateProjectDuration();
      return clip.id;
    },
    [tracks, updateProjectDuration]
  );

  const removeClip = useCallback((clipId: string) => {
    setClips((prev) => prev.filter((c) => c.id !== clipId));
    updateProjectDuration();
  }, [updateProjectDuration]);

  const updateClip = useCallback((clipId: string, updates: Partial<Clip>) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        // Preserve the type discriminant
        if (c.type === "video") {
          return { ...c, ...updates } as Clip;
        }
        return { ...c, ...updates } as Clip;
      })
    );
    updateProjectDuration();
  }, [updateProjectDuration]);

  const moveClip = useCallback((clipId: string, trackId: string, startTime: number) => {
    const targetTrack = tracks.find((t) => t.id === trackId) || null;
    if (!targetTrack) return;

    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        if (!fitsTrackType(targetTrack, c)) return c;
        return { ...c, trackId, startTime: Math.max(0, startTime) };
      })
    );
    updateProjectDuration();
  }, [tracks, updateProjectDuration]);

  const trimClipStart = useCallback((clipId: string, newStartTime: number) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;

        const deltaTime = newStartTime - c.startTime;
        const newTrimIn = c.trimIn + deltaTime;
        const newDuration = c.duration - deltaTime;

        // Validate
        if (newTrimIn < 0 || newDuration < TIMELINE.CLIP_MIN_DURATION) return c;

        return {
          ...c,
          startTime: newStartTime,
          trimIn: newTrimIn,
          duration: newDuration,
        };
      })
    );
    updateProjectDuration();
  }, [updateProjectDuration]);

  const trimClipEnd = useCallback((clipId: string, newEndTime: number) => {
    setClips((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;

        const newDuration = newEndTime - c.startTime;
        const newTrimOut = c.trimIn + newDuration;

        // Validate
        if (newDuration < TIMELINE.CLIP_MIN_DURATION) return c;
        if ((c.type === "video" || c.type === "audio") && newTrimOut > c.sourceDuration) return c;

        return {
          ...c,
          duration: newDuration,
          trimOut: newTrimOut,
        };
      })
    );
    updateProjectDuration();
  }, [updateProjectDuration]);

  // Duplicate a clip to a target track (or new track if not specified)
  const duplicateClip = useCallback((clipId: string, targetTrackId?: string): string | null => {
    const sourceClip = clips.find((c) => c.id === clipId);
    if (!sourceClip) return null;

    // Determine target track
    let trackId = targetTrackId;
    if (!trackId) {
      // Create a new track for the duplicate
      const duplicateTrackType = sourceClip.type === "audio" ? "audio" : "video";
      const duplicateTrackCount = tracks.filter((track) => track.type === duplicateTrackType).length + 1;
      const duplicateTrackName = duplicateTrackType === "audio"
        ? `Audio ${duplicateTrackCount}`
        : `Video ${duplicateTrackCount}`;
      const newTrack = createVideoTrack(
        duplicateTrackName,
        tracks.length,
        duplicateTrackType
      );
      setTracks((prev) => [...prev, newTrack]);
      trackId = newTrack.id;
    }

    // Create duplicate with new ID
    const newClip: Clip = {
      ...sourceClip,
      id: crypto.randomUUID(),
      trackId,
      name: `${sourceClip.name} (Copy)`,
    };

    setClips((prev) => [...prev, newClip]);
    updateProjectDuration();
    return newClip.id;
  }, [clips, tracks, updateProjectDuration]);

  // Add pre-formed clips (for paste)
  const addClips = useCallback((newClips: Clip[]) => {
    setClips((prev) => [...prev, ...newClips]);
    updateProjectDuration();
  }, [updateProjectDuration]);

  // Queries
  const getClipAtTime = useCallback(
    (trackId: string, time: number): Clip | null => {
      return (
        clips.find(
          (c) =>
            c.trackId === trackId &&
            time >= c.startTime &&
            time < c.startTime + c.duration
        ) || null
      );
    },
    [clips]
  );

  const getClipsInTrack = useCallback(
    (trackId: string): Clip[] => {
      return clips
        .filter((c) => c.trackId === trackId)
        .sort((a, b) => a.startTime - b.startTime);
    },
    [clips]
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
