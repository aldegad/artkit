"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
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
} from "../types";
import { TIMELINE } from "../constants";
import { useVideoState } from "./VideoStateContext";
import { Size } from "@/shared/types";

interface TimelineContextValue {
  // View state
  viewState: TimelineViewState;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setScrollY: (scrollY: number) => void;
  toggleSnap: () => void;

  // Track management
  tracks: VideoTrack[];
  addTrack: (name?: string) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<VideoTrack>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;

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

  // Queries
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  getClipsInTrack: (trackId: string) => Clip[];
  getTrackById: (trackId: string) => VideoTrack | null;
}

const TimelineContext = createContext<TimelineContextValue | null>(null);

export function TimelineProvider({ children }: { children: ReactNode }) {
  const { updateProjectDuration } = useVideoState();

  const [viewState, setViewState] = useState<TimelineViewState>(INITIAL_TIMELINE_VIEW);
  const [tracks, setTracks] = useState<VideoTrack[]>(() => {
    // Start with one default track
    return [createVideoTrack("Video 1", 0)];
  });
  const [clips, setClips] = useState<Clip[]>([]);

  // View state actions
  const setZoom = useCallback((zoom: number) => {
    const clampedZoom = Math.max(TIMELINE.MIN_ZOOM, Math.min(TIMELINE.MAX_ZOOM, zoom));
    setViewState((prev) => ({ ...prev, zoom: clampedZoom }));
  }, []);

  const setScrollX = useCallback((scrollX: number) => {
    setViewState((prev) => ({ ...prev, scrollX: Math.max(0, scrollX) }));
  }, []);

  const setScrollY = useCallback((scrollY: number) => {
    setViewState((prev) => ({ ...prev, scrollY: Math.max(0, scrollY) }));
  }, []);

  const toggleSnap = useCallback(() => {
    setViewState((prev) => ({ ...prev, snapEnabled: !prev.snapEnabled }));
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
    tracks,
    addTrack,
    removeTrack,
    updateTrack,
    reorderTracks,
    clips,
    addVideoClip,
    addImageClip,
    removeClip,
    updateClip,
    moveClip,
    trimClipStart,
    trimClipEnd,
    getClipAtTime,
    getClipsInTrack,
    getTrackById,
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
