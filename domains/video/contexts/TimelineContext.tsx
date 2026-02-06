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
  addTrack: (name?: string) => string;
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
    startTime?: number
  ) => string;
  addImageClip: (
    trackId: string,
    sourceUrl: string,
    sourceSize: Size,
    startTime?: number,
    duration?: number
  ) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  moveClip: (clipId: string, trackId: string, startTime: number) => void;
  trimClipStart: (clipId: string, newStartTime: number) => void;
  trimClipEnd: (clipId: string, newEndTime: number) => void;
  duplicateClip: (clipId: string, targetTrackId?: string) => string | null;
  addClips: (newClips: Clip[]) => void;
  restoreClips: (clips: Clip[]) => void;

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

  // Refs for autosave
  const isInitializedRef = useRef(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Set view state
  const setViewState = useCallback((newViewState: TimelineViewState) => {
    setViewStateInternal(newViewState);
  }, []);

  // Restore functions for autosave
  const restoreTracks = useCallback((savedTracks: VideoTrack[]) => {
    setTracks(savedTracks);
  }, []);

  const restoreClips = useCallback((savedClips: Clip[]) => {
    setClips(savedClips);
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
              // Try to load blob from IndexedDB using clipId
              const blob = await loadMediaBlob(clip.id);

              if (blob) {
                // Create new blob URL from stored blob
                const newUrl = URL.createObjectURL(blob);
                restoredClips.push({ ...clip, sourceUrl: newUrl });
              } else if (!clip.sourceUrl.startsWith("blob:")) {
                // Non-blob URL (e.g., remote URL), keep as is
                restoredClips.push(clip);
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
        setIsAutosaveInitialized(true);
      }
    };

    loadAutosave();
  }, [setProject, setProjectName, setToolMode, selectClips]);

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
  const addTrack = useCallback((name?: string): string => {
    const newTrack = createVideoTrack(
      name || `Video ${tracks.length + 1}`,
      tracks.length
    );
    setTracks((prev) => [...prev, newTrack]);
    return newTrack.id;
  }, [tracks.length]);

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
      startTime: number = 0
    ): string => {
      const clip = createVideoClip(trackId, sourceUrl, sourceDuration, sourceSize, startTime);
      setClips((prev) => [...prev, clip]);
      updateProjectDuration();
      return clip.id;
    },
    [updateProjectDuration]
  );

  const addImageClip = useCallback(
    (
      trackId: string,
      sourceUrl: string,
      sourceSize: Size,
      startTime: number = 0,
      duration: number = 5
    ): string => {
      const clip = createImageClip(trackId, sourceUrl, sourceSize, startTime, duration);
      setClips((prev) => [...prev, clip]);
      updateProjectDuration();
      return clip.id;
    },
    [updateProjectDuration]
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
    setClips((prev) =>
      prev.map((c) =>
        c.id === clipId ? { ...c, trackId, startTime: Math.max(0, startTime) } : c
      )
    );
    updateProjectDuration();
  }, [updateProjectDuration]);

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
        if (c.type === "video" && newTrimOut > c.sourceDuration) return c;

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
      const newTrack = createVideoTrack(
        `Video ${tracks.length + 1}`,
        tracks.length
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
    addImageClip,
    removeClip,
    updateClip,
    moveClip,
    trimClipStart,
    trimClipEnd,
    duplicateClip,
    addClips,
    restoreClips,
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
