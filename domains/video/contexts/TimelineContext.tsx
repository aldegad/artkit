"use client";

import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  AssetReference,
  Clip,
  createVideoTrack,
  TimelineViewState,
  VideoTrack,
} from "../types";
import { TIMELINE } from "../constants";
import { useVideoState } from "./VideoStateContext";
import { normalizeTimelineFrameRate, alignTimelineTimeToFrame } from "../utils/timelineFrame";
import {
  cloneClip,
  cloneTrack,
  findClipAtTime,
  getDefaultTrackName,
  getDuplicateTrackName,
  reindexTracksForZOrder,
  sanitizeTimelineViewState,
} from "../utils/timelineModel";
import { useTimelineHistory } from "./useTimelineHistory";
import {
  TimelineContext,
  TimelineContextValue,
  TIMELINE_INITIAL_VIEW,
  upsertAssetReference,
} from "./TimelineContext.shared";
import { useTimelineClipActions } from "./useTimelineClipActions";
import { useTimelinePersistence } from "./useTimelinePersistence";
import { copyMediaBlob } from "../utils/mediaStorage";

export function TimelineProvider({ children }: { children: ReactNode }) {
  const videoState = useVideoState();
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
  } = videoState;

  const [viewState, setViewStateInternal] = useState<TimelineViewState>(
    sanitizeTimelineViewState(TIMELINE_INITIAL_VIEW)
  );
  const [tracks, _setTracks] = useState<VideoTrack[]>(() => [createVideoTrack("Video 1", 0)]);
  const [clips, _setClips] = useState<Clip[]>([]);
  const projectRef = useRef(project);
  const tracksRef = useRef(tracks);
  const clipsRef = useRef(clips);
  tracksRef.current = tracks;
  clipsRef.current = clips;

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

  const copyMediaBlobSafely = useCallback((sourceClipId: string, targetClipId: string, reason: string) => {
    return copyMediaBlob(sourceClipId, targetClipId).catch((error) => {
      console.error(`Failed to copy media blob (${reason}):`, error);
    });
  }, []);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  const appendTrack = useCallback((track: VideoTrack) => {
    setTracks((prev) => reindexTracksForZOrder([...prev, track]));
  }, [setTracks]);

  const registerProjectAsset = useCallback((asset: AssetReference | null | undefined) => {
    if (!asset) return;
    setProject((prev) => {
      const nextProject = {
        ...prev,
        assets: upsertAssetReference(prev.assets || [], asset),
      };
      projectRef.current = nextProject;
      return nextProject;
    });
  }, [setProject]);

  const getTimelineFrameRate = useCallback(() => normalizeTimelineFrameRate(projectRef.current.frameRate), []);
  const snapTimeToFrame = useCallback((time: number) => {
    return alignTimelineTimeToFrame(time, getTimelineFrameRate());
  }, [getTimelineFrameRate]);
  const getMinClipDuration = useCallback(() => {
    return Math.max(TIMELINE.CLIP_MIN_DURATION, 1 / getTimelineFrameRate());
  }, [getTimelineFrameRate]);

  const clipsByTrack = useMemo(() => {
    const index = new Map<string, Clip[]>();
    for (const clip of clips) {
      const list = index.get(clip.trackId);
      if (list) list.push(clip);
      else index.set(clip.trackId, [clip]);
    }
    for (const list of index.values()) {
      list.sort((a, b) => a.startTime - b.startTime);
    }
    return index;
  }, [clips]);

  const history = useTimelineHistory({
    tracksRef,
    clipsRef,
    setTracks,
    setClips,
    cloneTrack,
    cloneClip: (clip) => ({ ...clip, position: { ...clip.position }, sourceSize: { ...clip.sourceSize } }),
    maxHistory: 100,
  });

  const persistence = useTimelinePersistence({
    project,
    tracks,
    clips,
    setTracks,
    setClips,
    setProject,
    setViewStateInternal,
    setProjectName,
    setProjectGroup,
    setToolMode,
    setAutoKeyframeEnabled,
    selectClips,
    selectMasksForTimeline,
    seek,
    setLoopRange,
    clearLoopRange,
    clearHistory: history.clearHistory,
    projectRef,
  });

  const clipActions = useTimelineClipActions({
    tracks,
    clips,
    projectCanvasSize: project.canvasSize,
    viewState: { snapEnabled: viewState.snapEnabled, zoom: viewState.zoom },
    appendTrack,
    registerProjectAsset,
    getTimelineFrameRate,
    snapTimeToFrame,
    getMinClipDuration,
    updateClipsWithDuration,
    saveToHistory: history.saveToHistory,
  });

  const setViewState = useCallback((nextViewState: TimelineViewState) => {
    setViewStateInternal(sanitizeTimelineViewState(nextViewState));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    const safeZoom = Number.isFinite(zoom) ? zoom : TIMELINE.DEFAULT_ZOOM;
    const clampedZoom = Math.max(TIMELINE.MIN_ZOOM, Math.min(TIMELINE.MAX_ZOOM, safeZoom));
    setViewStateInternal((prev) => ({ ...prev, zoom: clampedZoom }));
  }, []);

  const setScrollX = useCallback((scrollX: number) => {
    setViewStateInternal((prev) => ({ ...prev, scrollX: Math.max(0, Number.isFinite(scrollX) ? scrollX : 0) }));
  }, []);

  const setScrollY = useCallback((scrollY: number) => {
    setViewStateInternal((prev) => ({ ...prev, scrollY: Math.max(0, Number.isFinite(scrollY) ? scrollY : 0) }));
  }, []);

  const toggleSnap = useCallback(() => {
    setViewStateInternal((prev) => ({ ...prev, snapEnabled: !prev.snapEnabled }));
  }, []);

  const addTrack = useCallback((name?: string, type: "video" | "audio" = "video") => {
    const newTrack = createVideoTrack(name || getDefaultTrackName(tracks, type), 0, type);
    appendTrack(newTrack);
    return newTrack.id;
  }, [appendTrack, tracks]);

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
  }, [clips, copyMediaBlobSafely, setTracks, tracks, updateClipsWithDuration]);

  const removeTrack = useCallback((trackId: string) => {
    if (tracks.length <= 1) return;
    updateClipsWithDuration((prev) => prev.filter((clip) => clip.trackId !== trackId));
    setTracks((prev) => reindexTracksForZOrder(prev.filter((track) => track.id !== trackId)));
  }, [tracks.length, setTracks, updateClipsWithDuration]);

  const updateTrack = useCallback((trackId: string, updates: Partial<VideoTrack>) => {
    setTracks((prev) => prev.map((track) => (track.id === trackId ? { ...track, ...updates } : track)));
  }, [setTracks]);

  const reorderTracks = useCallback((fromIndex: number, toIndex: number) => {
    setTracks((prev) => {
      const next = [...prev];
      const [removed] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, removed);
      return reindexTracksForZOrder(next);
    });
  }, [setTracks]);

  const getClipAtTime = useCallback((trackId: string, time: number): Clip | null => {
    const trackClips = clipsByTrack.get(trackId);
    return trackClips ? findClipAtTime(trackClips, time) : null;
  }, [clipsByTrack]);

  const getClipsInTrack = useCallback((trackId: string): Clip[] => {
    return clipsByTrack.get(trackId) ? [...clipsByTrack.get(trackId)!] : [];
  }, [clipsByTrack]);

  const getTrackById = useCallback((trackId: string): VideoTrack | null => {
    return tracks.find((track) => track.id === trackId) || null;
  }, [tracks]);

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
    restoreTracks: persistence.restoreTracks,
    clips,
    addVideoClip: clipActions.addVideoClip,
    addAudioClip: clipActions.addAudioClip,
    addImageClip: clipActions.addImageClip,
    addCanvasOverlayClip: clipActions.addCanvasOverlayClip,
    removeClip: clipActions.removeClip,
    updateClip: clipActions.updateClip,
    setClipPlaybackSpeed: clipActions.setClipPlaybackSpeed,
    moveClip: clipActions.moveClip,
    trimClipStart: clipActions.trimClipStart,
    trimClipEnd: clipActions.trimClipEnd,
    splitClipAtTime: clipActions.splitClipAtTime,
    closeTrackGaps: clipActions.closeTrackGaps,
    duplicateClip: clipActions.duplicateClip,
    addClips: clipActions.addClips,
    restoreClips: persistence.restoreClips,
    saveToHistory: history.saveToHistory,
    undo: history.undo,
    redo: history.redo,
    clearHistory: history.clearHistory,
    canUndo: history.canUndo,
    canRedo: history.canRedo,
    getClipAtTime,
    getClipsInTrack,
    getTrackById,
    isAutosaveInitialized: persistence.isAutosaveInitialized,
  };

  return <TimelineContext.Provider value={value}>{children}</TimelineContext.Provider>;
}

export { useTimeline } from "./TimelineContext.shared";
