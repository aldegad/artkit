"use client";

import { useCallback } from "react";
import { Size } from "@/shared/types";
import {
  AssetReference,
  Clip,
  VideoTrack,
  createAudioClip,
  createCanvasOverlayClip,
  createImageClip,
  createVideoClip,
  createVideoTrack,
  getClipPlaybackSpeed,
  getClipSourceSpan,
  getTimelineDurationForSourceDuration,
} from "../types";
import { CLIP_PLAYBACK, TIMELINE } from "../constants";
import { copyMediaBlob, moveMediaBlob } from "../utils/mediaStorage";
import {
  normalizeClipTransformKeyframes,
  scaleClipPositionKeyframesDuration,
  sliceClipPositionKeyframes,
} from "../utils/clipTransformKeyframes";
import {
  fitsTrackType,
  getDefaultTrackName,
  getFittedVisualTransform,
  hasTrackOverlap,
  normalizeClip,
  resolveNearestAvailableClipStart,
  resolveTrackIdForClipType,
  withSafeClipStart,
} from "../utils/timelineModel";
import { buildRazorSplitClips } from "../utils/razorSplit";
import { getTimelineFrameRange } from "../utils/timelineFrame";
import { SOURCE_TRIM_EPSILON } from "./TimelineContext.shared";

interface UseTimelineClipActionsParams {
  tracks: VideoTrack[];
  clips: Clip[];
  projectCanvasSize: Size;
  viewState: { snapEnabled: boolean; zoom: number };
  appendTrack: (track: VideoTrack) => void;
  registerProjectAsset: (asset: AssetReference | null | undefined) => void;
  getTimelineFrameRate: () => number;
  snapTimeToFrame: (time: number) => number;
  getMinClipDuration: () => number;
  updateClipsWithDuration: (action: React.SetStateAction<Clip[]>) => void;
  saveToHistory: () => void;
}

export function useTimelineClipActions(params: UseTimelineClipActionsParams) {
  const {
    tracks,
    clips,
    projectCanvasSize,
    viewState,
    appendTrack,
    registerProjectAsset,
    getTimelineFrameRate,
    snapTimeToFrame,
    getMinClipDuration,
    updateClipsWithDuration,
    saveToHistory,
  } = params;

  const copyMediaBlobSafely = useCallback((sourceClipId: string, targetClipId: string, reason: string) => {
    return copyMediaBlob(sourceClipId, targetClipId).catch((error) => {
      console.error(`Failed to copy media blob (${reason}):`, error);
    });
  }, []);

  const moveMediaBlobSafely = useCallback((sourceClipId: string, targetClipId: string, reason: string) => {
    return moveMediaBlob(sourceClipId, targetClipId).catch((error) => {
      console.error(`Failed to move media blob (${reason}):`, error);
    });
  }, []);

  const createSafeFittedVisualClip = useCallback((options: {
    baseClip: Clip;
    sourceSize: Size;
    startTime: number;
    canvasSize?: Size;
  }): Clip => {
    const frameRate = getTimelineFrameRate();
    const fitted = getFittedVisualTransform(options.sourceSize, options.canvasSize ?? projectCanvasSize);
    return withSafeClipStart(clips, {
      ...options.baseClip,
      position: fitted.position,
      scale: fitted.scale,
    }, options.startTime, { frameRate });
  }, [clips, getTimelineFrameRate, projectCanvasSize]);

  const addVideoClip = useCallback((
    trackId: string,
    sourceUrl: string,
    sourceDuration: number,
    sourceSize: Size,
    startTime: number = 0,
    canvasSize?: Size,
    options?: { sourceId?: string; asset?: AssetReference }
  ): string => {
    const resolvedTrackId = resolveTrackIdForClipType(trackId, "video", tracks);
    const frameAlignedStart = snapTimeToFrame(startTime);
    const baseClip = createVideoClip(
      resolvedTrackId,
      sourceUrl,
      sourceDuration,
      sourceSize,
      frameAlignedStart,
      options?.sourceId
    );
    const clip = createSafeFittedVisualClip({ baseClip, sourceSize, startTime: frameAlignedStart, canvasSize });
    registerProjectAsset(options?.asset);
    updateClipsWithDuration((prev) => [...prev, clip]);
    return clip.id;
  }, [tracks, snapTimeToFrame, createSafeFittedVisualClip, registerProjectAsset, updateClipsWithDuration]);

  const addAudioClip = useCallback((
    trackId: string,
    sourceUrl: string,
    sourceDuration: number,
    startTime: number = 0,
    sourceSize: Size = { width: 0, height: 0 },
    options?: { sourceId?: string; asset?: AssetReference }
  ): string => {
    const resolvedTrackId = resolveTrackIdForClipType(trackId, "audio", tracks);
    const frameAlignedStart = snapTimeToFrame(startTime);
    const clip = createAudioClip(
      resolvedTrackId,
      sourceUrl,
      sourceDuration,
      frameAlignedStart,
      sourceSize,
      options?.sourceId
    );
    const normalizedClip = withSafeClipStart(clips, clip, frameAlignedStart, {
      frameRate: getTimelineFrameRate(),
    });
    registerProjectAsset(options?.asset);
    updateClipsWithDuration((prev) => [...prev, normalizedClip]);
    return normalizedClip.id;
  }, [tracks, snapTimeToFrame, clips, getTimelineFrameRate, registerProjectAsset, updateClipsWithDuration]);

  const addImageClip = useCallback((
    trackId: string,
    sourceUrl: string,
    sourceSize: Size,
    startTime: number = 0,
    duration: number = 5,
    canvasSize?: Size,
    options?: { sourceId?: string; asset?: AssetReference }
  ): string => {
    const resolvedTrackId = resolveTrackIdForClipType(trackId, "image", tracks);
    const frameAlignedStart = snapTimeToFrame(startTime);
    const baseClip = createImageClip(
      resolvedTrackId,
      sourceUrl,
      sourceSize,
      frameAlignedStart,
      duration,
      options?.sourceId
    );
    const clip = createSafeFittedVisualClip({ baseClip, sourceSize, startTime: frameAlignedStart, canvasSize });
    registerProjectAsset(options?.asset);
    updateClipsWithDuration((prev) => [...prev, clip]);
    return clip.id;
  }, [tracks, snapTimeToFrame, createSafeFittedVisualClip, registerProjectAsset, updateClipsWithDuration]);

  const addCanvasOverlayClip = useCallback((
    trackId: string,
    sourceUrl: string,
    sourceSize: Size,
    startTime: number = 0,
    duration: number = 5,
    canvasSize?: Size,
    options?: { sourceId?: string; asset?: AssetReference }
  ): string => {
    const resolvedTrackId = resolveTrackIdForClipType(trackId, "image", tracks);
    const frameAlignedStart = snapTimeToFrame(startTime);
    const baseClip = createCanvasOverlayClip(
      resolvedTrackId,
      sourceUrl,
      sourceSize,
      frameAlignedStart,
      duration,
      options?.sourceId
    );
    const clip = createSafeFittedVisualClip({ baseClip, sourceSize, startTime: frameAlignedStart, canvasSize });
    registerProjectAsset(options?.asset);
    updateClipsWithDuration((prev) => [...prev, clip]);
    return clip.id;
  }, [tracks, snapTimeToFrame, createSafeFittedVisualClip, registerProjectAsset, updateClipsWithDuration]);

  const removeClip = useCallback((clipId: string) => {
    updateClipsWithDuration((prev) => prev.filter((c) => c.id !== clipId));
  }, [updateClipsWithDuration]);

  const updateClip = useCallback((clipId: string, updates: Partial<Clip>) => {
    updateClipsWithDuration((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const next = normalizeClip({ ...c, ...updates } as Clip);
        return normalizeClip({
          ...next,
          transformKeyframes: normalizeClipTransformKeyframes(next),
        } as Clip);
      })
    );
  }, [updateClipsWithDuration]);

  const setClipPlaybackSpeed = useCallback((clipId: string, playbackSpeed: number) => {
    const sourceClip = clips.find((candidate) => candidate.id === clipId);
    if (!sourceClip || sourceClip.type === "image") return;

    const sourceSpan = getClipSourceSpan(sourceClip);
    if (sourceSpan <= SOURCE_TRIM_EPSILON) return;

    const frameRate = getTimelineFrameRate();
    const minDuration = getMinClipDuration();
    const requestedSpeed = Math.max(CLIP_PLAYBACK.MIN_SPEED, Math.min(CLIP_PLAYBACK.MAX_SPEED, playbackSpeed));
    const idealDuration = getTimelineDurationForSourceDuration({ playbackSpeed: requestedSpeed }, sourceSpan);
    const quantizedDuration = getTimelineFrameRange(0, idealDuration, frameRate).duration;
    const nextDuration = Math.max(minDuration, quantizedDuration);
    const appliedSpeed = Math.max(
      CLIP_PLAYBACK.MIN_SPEED,
      Math.min(CLIP_PLAYBACK.MAX_SPEED, sourceSpan / Math.max(nextDuration, SOURCE_TRIM_EPSILON))
    );

    const currentSpeed = getClipPlaybackSpeed(sourceClip);
    if (
      Math.abs(appliedSpeed - currentSpeed) <= SOURCE_TRIM_EPSILON &&
      Math.abs(nextDuration - sourceClip.duration) <= SOURCE_TRIM_EPSILON
    ) {
      return;
    }

    saveToHistory();
    updateClipsWithDuration((prev) =>
      prev.map((clip) => {
        if (clip.id !== clipId || clip.type === "image") return clip;
        const transformKeyframes = scaleClipPositionKeyframesDuration(clip, nextDuration);
        const nextPosition = transformKeyframes?.position?.[0]?.value || clip.position;
        return normalizeClip({
          ...clip,
          playbackSpeed: appliedSpeed,
          duration: nextDuration,
          position: { ...nextPosition },
          transformKeyframes,
        } as Clip);
      })
    );
  }, [clips, getMinClipDuration, getTimelineFrameRate, saveToHistory, updateClipsWithDuration]);

  const moveClip = useCallback((clipId: string, trackId: string, startTime: number, ignoreClipIds: string[] = []) => {
    const targetTrack = tracks.find((t) => t.id === trackId) || null;
    if (!targetTrack) return;
    const frameRate = getTimelineFrameRate();

    updateClipsWithDuration((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        if (!fitsTrackType(targetTrack, c)) return c;
        const candidateStart = snapTimeToFrame(startTime);
        const excludeIds = new Set<string>([clipId, ...ignoreClipIds]);
        const overlaps = hasTrackOverlap(prev, { trackId, startTime: candidateStart, duration: c.duration }, excludeIds, frameRate);
        if (!overlaps) return { ...c, trackId, startTime: candidateStart };

        const clampedStart = resolveNearestAvailableClipStart(
          prev,
          { trackId, startTime: candidateStart, duration: c.duration },
          excludeIds,
          frameRate
        );

        if (
          Math.abs(clampedStart - c.startTime) <= SOURCE_TRIM_EPSILON ||
          hasTrackOverlap(prev, { trackId, startTime: clampedStart, duration: c.duration }, excludeIds, frameRate)
        ) {
          return c;
        }
        return { ...c, trackId, startTime: clampedStart };
      })
    );
  }, [tracks, getTimelineFrameRate, snapTimeToFrame, updateClipsWithDuration]);

  const trimClipStart = useCallback((clipId: string, newStartTime: number) => {
    const frameRate = getTimelineFrameRate();
    updateClipsWithDuration((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const minDuration = getMinClipDuration();
        const frameAlignedStart = snapTimeToFrame(newStartTime);
        const deltaTime = frameAlignedStart - c.startTime;
        const newTrimIn = c.trimIn + (deltaTime * getClipPlaybackSpeed(c));
        const newDuration = c.duration - deltaTime;
        if (newTrimIn < 0 || newDuration < minDuration) return c;
        if (hasTrackOverlap(prev, { trackId: c.trackId, startTime: frameAlignedStart, duration: newDuration }, new Set([clipId]), frameRate)) {
          return c;
        }
        const transformKeyframes = sliceClipPositionKeyframes(c, deltaTime, newDuration, { includeStart: true, includeEnd: false });
        const nextPosition = transformKeyframes?.position?.[0]?.value || c.position;
        return normalizeClip({
          ...c,
          startTime: frameAlignedStart,
          trimIn: newTrimIn,
          duration: newDuration,
          position: { ...nextPosition },
          transformKeyframes,
        } as Clip);
      })
    );
  }, [getMinClipDuration, getTimelineFrameRate, snapTimeToFrame, updateClipsWithDuration]);

  const trimClipEnd = useCallback((clipId: string, newEndTime: number) => {
    const frameRate = getTimelineFrameRate();
    updateClipsWithDuration((prev) =>
      prev.map((c) => {
        if (c.id !== clipId) return c;
        const minDuration = getMinClipDuration();
        const frameAlignedEnd = snapTimeToFrame(newEndTime);
        const newDuration = frameAlignedEnd - c.startTime;
        const newTrimOut = c.trimIn + (newDuration * getClipPlaybackSpeed(c));
        if (newDuration < minDuration) return c;
        if ((c.type === "video" || c.type === "audio") && newTrimOut > c.sourceDuration + SOURCE_TRIM_EPSILON) {
          return c;
        }
        const safeTrimOut = (c.type === "video" || c.type === "audio")
          ? Math.min(newTrimOut, c.sourceDuration)
          : newTrimOut;
        if (hasTrackOverlap(prev, { trackId: c.trackId, startTime: c.startTime, duration: newDuration }, new Set([clipId]), frameRate)) {
          return c;
        }
        const transformKeyframes = sliceClipPositionKeyframes(c, 0, newDuration, { includeStart: true, includeEnd: true });
        const nextPosition = transformKeyframes?.position?.[0]?.value || c.position;
        return normalizeClip({
          ...c,
          duration: newDuration,
          trimOut: safeTrimOut,
          position: { ...nextPosition },
          transformKeyframes,
        } as Clip);
      })
    );
  }, [getMinClipDuration, getTimelineFrameRate, snapTimeToFrame, updateClipsWithDuration]);

  const duplicateClip = useCallback((clipId: string, targetTrackId?: string): string | null => {
    const sourceClip = clips.find((c) => c.id === clipId);
    if (!sourceClip) return null;

    let trackId = targetTrackId;
    if (!trackId) {
      const duplicateTrackType = sourceClip.type === "audio" ? "audio" : "video";
      const newTrack = createVideoTrack(getDefaultTrackName(tracks, duplicateTrackType), 0, duplicateTrackType);
      appendTrack(newTrack);
      trackId = newTrack.id;
    }

    const newClip = withSafeClipStart(clips, {
      ...sourceClip,
      id: crypto.randomUUID(),
      trackId,
      name: `${sourceClip.name} (Copy)`,
      position: { ...sourceClip.position },
      sourceSize: { ...sourceClip.sourceSize },
      transformKeyframes: normalizeClipTransformKeyframes(sourceClip),
    }, snapTimeToFrame(sourceClip.startTime + 0.25), { frameRate: getTimelineFrameRate() });

    void copyMediaBlobSafely(sourceClip.id, newClip.id, "timeline duplicate");
    updateClipsWithDuration((prev) => [...prev, newClip]);
    return newClip.id;
  }, [clips, tracks, appendTrack, snapTimeToFrame, getTimelineFrameRate, copyMediaBlobSafely, updateClipsWithDuration]);

  const splitClipAtTime = useCallback((clipId: string, splitCursorTime: number): string | null => {
    const clip = clips.find((candidate) => candidate.id === clipId);
    if (!clip) return null;
    const frameRate = getTimelineFrameRate();

    const snapToPoints = (time: number): number => {
      if (!viewState.snapEnabled) return snapTimeToFrame(time);
      const safeZoom = Number.isFinite(viewState.zoom) && viewState.zoom > 0 ? viewState.zoom : TIMELINE.DEFAULT_ZOOM;
      const threshold = TIMELINE.SNAP_THRESHOLD / safeZoom;
      const points: number[] = [0];
      for (const candidate of clips) {
        if (candidate.id === clip.id) continue;
        const range = getTimelineFrameRange(candidate.startTime, candidate.duration, frameRate);
        points.push(range.startTime, range.endTime);
      }
      for (const point of points) {
        if (Math.abs(time - point) < threshold) return snapTimeToFrame(point);
      }
      return snapTimeToFrame(time);
    };

    const splitResult = buildRazorSplitClips({
      clip,
      splitCursorTime: snapTimeToFrame(splitCursorTime),
      snapToPoints,
    });
    if (!splitResult) return null;

    const { firstClip, secondClip } = splitResult;
    saveToHistory();
    void moveMediaBlobSafely(clip.id, firstClip.id, "timeline split");
    updateClipsWithDuration((prev) => [
      ...prev.filter((candidate) => candidate.id !== clip.id),
      firstClip,
      secondClip,
    ]);
    return secondClip.id;
  }, [clips, viewState.snapEnabled, viewState.zoom, getTimelineFrameRate, saveToHistory, moveMediaBlobSafely, snapTimeToFrame, updateClipsWithDuration]);

  const addClips = useCallback((newClips: Clip[]) => {
    updateClipsWithDuration((prev) => {
      const next = [...prev];
      const normalized: Clip[] = [];
      for (const clip of newClips) {
        const frameAlignedStart = snapTimeToFrame(clip.startTime);
        const adjusted = withSafeClipStart(
          next,
          { ...normalizeClip(clip), startTime: frameAlignedStart },
          frameAlignedStart,
          { excludeClipIds: new Set([clip.id]), frameRate: getTimelineFrameRate() }
        );
        normalized.push(adjusted);
        next.push(adjusted);
      }
      return [...prev, ...normalized];
    });
  }, [getTimelineFrameRate, snapTimeToFrame, updateClipsWithDuration]);

  return {
    addAudioClip,
    addCanvasOverlayClip,
    addClips,
    addImageClip,
    addVideoClip,
    duplicateClip,
    removeClip,
    setClipPlaybackSpeed,
    splitClipAtTime,
    trimClipEnd,
    trimClipStart,
    updateClip,
    moveClip,
  };
}
