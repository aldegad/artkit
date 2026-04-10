"use client";

import { MutableRefObject, useCallback, useEffect, useMemo, useRef } from "react";
import {
  useAudioBufferCache,
  usePreRenderCache,
  useVideoElements,
  useWebAudioPlayback,
} from "../../hooks";
import { PRE_RENDER } from "../../constants";
import { Clip, PlaybackState, VideoProject, VideoTrack } from "../../types";
import { MaskData } from "../../types/mask";
import { countActiveVisualLayersAtTime, createPlaybackPerfStats, resetPlaybackPerfStatsWindow } from "./previewPlaybackStats";
import { usePreviewMediaPlaybackSync } from "./usePreviewMediaPlaybackSync";
import { usePreviewMediaReadyRender } from "./usePreviewMediaReadyRender";
import { SAMPLE_FRAME_EPSILON } from "./previewCanvasConfig";
import {
  buildPlaybackTrackClipIndex,
  collectPlaybackWindowClipIds,
} from "../../utils/playbackActiveMedia";

interface SyncMediaRequest {
  forceVideoCurrentTimeSync?: boolean;
}

interface UsePreviewPlaybackPipelineParams {
  tracks: VideoTrack[];
  clips: Clip[];
  playback: PlaybackState;
  project: VideoProject;
  activeMaskId: string | null;
  isEditingMask: boolean;
  masks: Map<string, MaskData>;
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  getMaskAtTimeForTrack: (trackId: string, time: number) => string | "__live_canvas__" | null;
  videoElementsRef: React.RefObject<Map<string, HTMLVideoElement>>;
  audioElementsRef: React.RefObject<Map<string, HTMLAudioElement>>;
  imageCacheRef: MutableRefObject<Map<string, HTMLImageElement>>;
  savedMaskImgCacheRef: MutableRefObject<Map<string, HTMLImageElement>>;
  currentTimeRef: React.RefObject<number>;
  directPreviewOptimized: boolean;
  effectivePreRenderEnabled: boolean;
  previewPerf: {
    debugLogs?: boolean;
    draftMode: boolean;
    qualityFirstMode: boolean;
    isMobileLike: boolean;
  };
  adaptivePlaybackPreviewPolicy: {
    maxCanvasDpr: number;
    playbackRenderFpsCap: number;
    smoothingQuality: ImageSmoothingQuality;
  };
  scheduleRender: () => void;
  renderRequestRef: MutableRefObject<number>;
}

export function usePreviewPlaybackPipeline(params: UsePreviewPlaybackPipelineParams) {
  const {
    tracks,
    clips,
    playback,
    project,
    activeMaskId,
    isEditingMask,
    masks,
    getClipAtTime,
    getMaskAtTimeForTrack,
    videoElementsRef,
    audioElementsRef,
    imageCacheRef,
    savedMaskImgCacheRef,
    currentTimeRef,
    directPreviewOptimized,
    effectivePreRenderEnabled,
    previewPerf,
    adaptivePlaybackPreviewPolicy,
    scheduleRender,
    renderRequestRef,
  } = params;
  const safeProjectDuration = Number.isFinite(project.duration) && project.duration > 0 ? project.duration : 1;
  const clipsByTrack = useMemo(() => buildPlaybackTrackClipIndex(clips), [clips]);
  const warmPlaybackClipIds = useMemo(() => collectPlaybackWindowClipIds({
    tracks,
    clipsByTrack,
    time: playback.currentTime,
    lookBehind: playback.isPlaying ? 0.25 : 0.5,
    lookAhead: playback.isPlaying ? 2 : 6,
  }), [clipsByTrack, playback.currentTime, playback.isPlaying, tracks]);
  const warmAudioSourceUrls = useMemo(() => {
    const sourceUrls = new Set<string>();
    for (const clip of clips) {
      if (!warmPlaybackClipIds.has(clip.id)) continue;
      if (clip.type === "audio") {
        sourceUrls.add(clip.sourceUrl);
      } else if (clip.type === "video" && (clip.hasAudio ?? true)) {
        sourceUrls.add(clip.sourceUrl);
      }
    }
    return [...sourceUrls];
  }, [clips, warmPlaybackClipIds]);

  useVideoElements();

  useEffect(() => {
    const activeImageUrls = new Set<string>();
    for (const clip of clips) {
      if (clip.type === "image" && typeof clip.sourceUrl === "string" && clip.sourceUrl.length > 0) {
        activeImageUrls.add(clip.sourceUrl);
        if (!imageCacheRef.current.has(clip.sourceUrl)) {
          const image = new Image();
          image.decoding = "async";
          image.src = clip.sourceUrl;
          imageCacheRef.current.set(clip.sourceUrl, image);
        }
      }
    }

    for (const [sourceUrl] of imageCacheRef.current) {
      if (!activeImageUrls.has(sourceUrl)) {
        imageCacheRef.current.delete(sourceUrl);
      }
    }

    const activeMaskUrls = new Set<string>();
    for (const mask of masks.values()) {
      if (typeof mask.maskData !== "string" || mask.maskData.length === 0) continue;
      activeMaskUrls.add(mask.maskData);
      if (!savedMaskImgCacheRef.current.has(mask.maskData)) {
        const image = new Image();
        image.decoding = "async";
        image.src = mask.maskData;
        savedMaskImgCacheRef.current.set(mask.maskData, image);
      }
    }

    for (const [maskUrl] of savedMaskImgCacheRef.current) {
      if (!activeMaskUrls.has(maskUrl)) {
        savedMaskImgCacheRef.current.delete(maskUrl);
      }
    }
  }, [clips, imageCacheRef, masks, savedMaskImgCacheRef]);

  const { getCachedFrame, isPreRenderingRef } = usePreRenderCache({
    tracks,
    clips,
    getClipAtTime,
    getMaskAtTimeForTrack,
    masks,
    videoElements: videoElementsRef.current,
    imageCache: imageCacheRef.current,
    maskImageCache: savedMaskImgCacheRef.current,
    projectSize: project.canvasSize,
    projectDuration: safeProjectDuration,
    isPlaying: playback.isPlaying,
    suspendPreRender: Boolean(isEditingMask || activeMaskId),
    currentTime: playback.currentTime,
    currentTimeRef,
    enabled: effectivePreRenderEnabled,
    debugLogs: previewPerf.debugLogs,
  });

  useAudioBufferCache({
    enabled: !directPreviewOptimized,
    warmSourceUrls: warmAudioSourceUrls,
  });

  const { isWebAudioReady } = useWebAudioPlayback({
    tracks,
    clips,
    getClipAtTime,
    isPlaying: playback.isPlaying,
    playbackRate: playback.playbackRate,
    currentTimeRef,
    debugLogs: previewPerf.debugLogs,
    enabled: !directPreviewOptimized,
  });

  const isWebAudioReadyRef = useRef(isWebAudioReady);
  useEffect(() => {
    isWebAudioReadyRef.current = isWebAudioReady;
  }, [isWebAudioReady]);

  const wasPlayingRef = useRef(false);
  const syncMediaRef = useRef<((request?: SyncMediaRequest) => void) | null>(null);
  const syncMediaIntervalRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPlaybackTickTimeRef = useRef<number | null>(null);
  const playbackPerfRef = useRef(createPlaybackPerfStats());

  usePreviewMediaPlaybackSync({
    tracks,
    clips,
    playback,
    directPreviewOptimized,
    currentTimeRef,
    getClipAtTime,
    videoElementsRef,
    audioElementsRef,
    isWebAudioReadyRef,
    syncMediaRef,
    syncMediaIntervalRef,
    lastPlaybackTickTimeRef,
    wasPlayingRef,
  });

  usePreviewMediaReadyRender({
    clips,
    videoElementsRef,
    isPreRenderingRef,
    wasPlayingRef,
    scheduleRender,
    renderRequestRef,
  });

  useEffect(() => {
    if (!previewPerf.debugLogs) return;
    console.info("[VideoPreviewConfig]", {
      draftMode: previewPerf.draftMode,
      preRenderEnabled: effectivePreRenderEnabled,
      directVideoPreview: directPreviewOptimized,
      qualityFirstMode: previewPerf.qualityFirstMode,
      playbackRenderFpsCap: adaptivePlaybackPreviewPolicy.playbackRenderFpsCap,
      maxCanvasDpr: adaptivePlaybackPreviewPolicy.maxCanvasDpr,
      smoothingQuality: adaptivePlaybackPreviewPolicy.smoothingQuality,
      isMobileLike: previewPerf.isMobileLike,
    });
  }, [
    adaptivePlaybackPreviewPolicy.maxCanvasDpr,
    adaptivePlaybackPreviewPolicy.playbackRenderFpsCap,
    adaptivePlaybackPreviewPolicy.smoothingQuality,
    directPreviewOptimized,
    effectivePreRenderEnabled,
    previewPerf.debugLogs,
    previewPerf.draftMode,
    previewPerf.isMobileLike,
    previewPerf.qualityFirstMode,
  ]);

  const maybeReportPlaybackStats = useCallback((now: number) => {
    if (!previewPerf.debugLogs || !playback.isPlaying) return;

    const stats = playbackPerfRef.current;
    if (stats.windowStartMs === 0) {
      stats.windowStartMs = now;
      return;
    }

    const elapsedMs = now - stats.windowStartMs;
    if (elapsedMs < 3000) return;

    const elapsedSec = elapsedMs / 1000;
    const renderedFps = stats.renderedFrames / elapsedSec;
    const totalCompositedFrames = stats.cacheFrames + stats.liveFrames;
    const cacheHitRate = totalCompositedFrames > 0 ? stats.cacheFrames / totalCompositedFrames : 0;
    const activeVisualLayers = countActiveVisualLayersAtTime(tracks, getClipAtTime, currentTimeRef.current);
    const visibleClipCount = clips.filter((clip) => clip.visible).length;
    const videoClipCount = clips.filter((clip) => clip.type === "video").length;
    const audioClipCount = clips.filter((clip) => clip.type === "audio").length;
    const visualClipCount = clips.filter((clip) => clip.type !== "audio").length;

    console.info("[VideoPreviewPerf]", {
      draftMode: previewPerf.draftMode,
      preRenderEnabled: effectivePreRenderEnabled,
      directVideoPreview: directPreviewOptimized,
      fpsCap: adaptivePlaybackPreviewPolicy.playbackRenderFpsCap,
      maxCanvasDpr: adaptivePlaybackPreviewPolicy.maxCanvasDpr,
      smoothingQuality: adaptivePlaybackPreviewPolicy.smoothingQuality,
      renderedFps: Number(renderedFps.toFixed(1)),
      renderedFrames: stats.renderedFrames,
      skippedByCap: stats.skippedByCap,
      longTickCount: stats.longTickCount,
      cacheHitRate: Number((cacheHitRate * 100).toFixed(1)),
      activeVisualLayers,
      clipCount: clips.length,
      visibleClipCount,
      visualClipCount,
      videoClipCount,
      audioClipCount,
      visibleTracks: tracks.filter((track) => track.visible).length,
    });

    stats.windowStartMs = now;
    resetPlaybackPerfStatsWindow(stats);
  }, [
    adaptivePlaybackPreviewPolicy.maxCanvasDpr,
    adaptivePlaybackPreviewPolicy.playbackRenderFpsCap,
    adaptivePlaybackPreviewPolicy.smoothingQuality,
    clips,
    currentTimeRef,
    directPreviewOptimized,
    effectivePreRenderEnabled,
    getClipAtTime,
    playback.isPlaying,
    previewPerf.debugLogs,
    previewPerf.draftMode,
    tracks,
  ]);

  const resetPlaybackPerfStats = useCallback(() => {
    playbackPerfRef.current = createPlaybackPerfStats();
  }, []);

  const getPlaybackSampleTime = useCallback((
    time: number,
    bounds: { minFrame: number; maxFrame: number } | null = null
  ) => {
    let frameIdx = Math.max(0, Math.floor(time * PRE_RENDER.FRAME_RATE + SAMPLE_FRAME_EPSILON));
    if (bounds) {
      frameIdx = Math.max(bounds.minFrame, Math.min(frameIdx, bounds.maxFrame));
    }
    return frameIdx / PRE_RENDER.FRAME_RATE;
  }, []);

  return {
    getCachedFrame,
    getPlaybackSampleTime,
    isPreRenderingRef,
    lastPlaybackTickTimeRef,
    maybeReportPlaybackStats,
    playbackPerfRef,
    resetPlaybackPerfStats,
    syncMediaRef,
  };
}
