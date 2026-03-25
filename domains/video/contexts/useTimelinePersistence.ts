"use client";

import { useCallback, useEffect, useState } from "react";
import { normalizeProjectGroupName } from "@/shared/utils/projectGroups";
import { loadVideoAutosave, type VideoAutosaveData } from "../utils/videoAutosave";
import { cloneClip, cloneTrack, normalizeClip, restoreAutosavedClips, sanitizeTimelineViewState } from "../utils/timelineModel";
import { Clip, TimelineViewState, VideoProject, VideoToolMode, VideoTrack } from "../types";

interface UseTimelinePersistenceParams {
  project: VideoProject;
  tracks: VideoTrack[];
  clips: Clip[];
  setTracks: (action: React.SetStateAction<VideoTrack[]>) => void;
  setClips: (action: React.SetStateAction<Clip[]>) => void;
  setProject: React.Dispatch<React.SetStateAction<VideoProject>>;
  setViewStateInternal: React.Dispatch<React.SetStateAction<TimelineViewState>>;
  setProjectName: (name: string) => void;
  setProjectGroup: (group: string) => void;
  setToolMode: (mode: VideoToolMode) => void;
  setAutoKeyframeEnabled: (enabled: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  selectMasksForTimeline: (maskIds: string[]) => void;
  seek: (time: number) => void;
  setLoopRange: (start: number, end: number, enableLoop?: boolean, durationHint?: number) => void;
  clearLoopRange: (durationHint?: number) => void;
  clearHistory: () => void;
  projectRef: React.MutableRefObject<VideoProject>;
}

export function useTimelinePersistence(params: UseTimelinePersistenceParams) {
  const {
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
    clearHistory,
    projectRef,
  } = params;
  const [isAutosaveInitialized, setIsAutosaveInitialized] = useState(false);
  const sanitizeDurationHint = useCallback((value: number) => {
    return Number.isFinite(value) && value > 0 ? value : 0;
  }, []);

  const restoreTracks = useCallback((savedTracks: VideoTrack[]) => {
    setTracks(savedTracks.map(cloneTrack));
  }, [setTracks]);

  const restoreClips = useCallback((savedClips: Clip[]) => {
    setClips(savedClips.map((clip) => cloneClip(normalizeClip(clip))));
  }, [setClips]);

  const restoreAutosaveData = useCallback(async (data: VideoAutosaveData) => {
    let durationHint = sanitizeDurationHint(data.project?.duration || 0);

    if (data.tracks?.length) {
      setTracks(data.tracks);
    }
    if (data.clips?.length) {
      const restored = await restoreAutosavedClips(
        data.clips as Clip[],
        data.project?.frameRate || 30
      );
      durationHint = Math.max(durationHint, sanitizeDurationHint(restored.durationHint));
      setClips(restored.restoredClips);
    }
    if (data.timelineView) {
      setViewStateInternal(sanitizeTimelineViewState(data.timelineView));
    }
    const normalizedDurationHint = Math.max(sanitizeDurationHint(durationHint), 0.001);

    if (data.project) {
      setProject({
        ...data.project,
        duration: normalizedDurationHint,
        masks: data.masks || data.project.masks || [],
      });
    }
    if (data.projectName) setProjectName(data.projectName);
    if (data.projectGroup) setProjectGroup(normalizeProjectGroupName(data.projectGroup));
    if (data.toolMode) setToolMode(data.toolMode);
    if (typeof data.autoKeyframeEnabled === "boolean") setAutoKeyframeEnabled(data.autoKeyframeEnabled);
    if (data.selectedClipIds) selectClips(data.selectedClipIds);
    if (data.selectedMaskIds) selectMasksForTimeline(data.selectedMaskIds);
    const restoredTime = typeof data.currentTime === "number" ? data.currentTime : 0;
    if (data.playbackRange) {
      setLoopRange(
        data.playbackRange.loopStart,
        data.playbackRange.loopEnd,
        Boolean(data.playbackRange.loop),
        normalizedDurationHint
      );
    } else {
      clearLoopRange(normalizedDurationHint);
    }
    seek(restoredTime);
  }, [
    clearLoopRange,
    seek,
    selectClips,
    selectMasksForTimeline,
    setAutoKeyframeEnabled,
    setClips,
    setLoopRange,
    setProject,
    setProjectGroup,
    setProjectName,
    setToolMode,
    setTracks,
    setViewStateInternal,
    sanitizeDurationHint,
  ]);

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
  }, [clearHistory, restoreAutosaveData]);

  useEffect(() => {
    const duration = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
    setProject({
      ...projectRef.current,
      tracks: tracks.map(cloneTrack),
      clips: clips.map(cloneClip),
      duration: Math.max(duration, 1),
    });
  }, [clips, setProject, tracks, projectRef]);

  return {
    isAutosaveInitialized,
    restoreAutosaveData,
    restoreClips,
    restoreTracks,
  };
}
