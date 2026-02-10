"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useVideoState, useVideoRefs, useTimeline } from "../../contexts";
import {
  useVideoElements,
  usePlaybackTick,
  usePreRenderCache,
  useAudioBufferCache,
  useWebAudioPlayback,
  useClipTransformTool,
} from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { safeReleasePointerCapture, safeSetPointerCapture } from "@/shared/utils";
import { getCanvasColorsSync, useViewportZoomTool } from "@/shared/hooks";
import BrushCursorOverlay from "@/shared/components/BrushCursorOverlay";
import { PREVIEW, PLAYBACK, PRE_RENDER } from "../../constants";
import { AudioClip, Clip, VideoClip, getClipScaleX, getClipScaleY } from "../../types";
import { useMask } from "../../contexts";
import { useMaskTool } from "../../hooks/useMaskTool";
import { useCanvasViewport } from "@/shared/hooks/useCanvasViewport";
import {
  getRectHandleAtPosition,
  resizeRectByHandle,
  createRectFromDrag,
  type RectHandle,
} from "@/shared/utils/rectTransform";
import { ASPECT_RATIO_VALUES } from "@/shared/types/aspectRatio";
import { resolvePreviewPerformanceConfig } from "../../utils/previewPerformance";
import { subscribeImmediatePlaybackStop } from "../../utils/playbackStopSignal";
import { usePreviewFrameCapture } from "./usePreviewFrameCapture";
import { usePreviewViewportBridge } from "./usePreviewViewportBridge";

interface PreviewCanvasProps {
  className?: string;
}

const SAMPLE_FRAME_EPSILON = 1e-6;

function getLoopFrameBounds(
  loop: boolean,
  loopStart: number,
  loopEnd: number,
  duration: number
): { minFrame: number; maxFrame: number } | null {
  if (!loop) return null;

  const safeDuration = Math.max(0, duration);
  const rangeStart = Math.max(0, Math.min(loopStart, safeDuration));
  const hasRange = loopEnd > rangeStart + 0.001;
  const rangeEnd = hasRange
    ? Math.max(rangeStart + 0.001, Math.min(loopEnd, safeDuration))
    : safeDuration;

  // Keep sampled frames inside [loopStart, loopEnd) to avoid one-frame flashes
  // from just before IN when loop points are not aligned to frame boundaries.
  const minFrame = Math.max(0, Math.ceil(rangeStart * PRE_RENDER.FRAME_RATE - SAMPLE_FRAME_EPSILON));
  const exclusiveEndFrame = Math.max(
    minFrame + 1,
    Math.ceil(rangeEnd * PRE_RENDER.FRAME_RATE - SAMPLE_FRAME_EPSILON)
  );

  return { minFrame, maxFrame: exclusiveEndFrame - 1 };
}

export function PreviewCanvas({ className }: PreviewCanvasProps) {
  const { previewCanvasRef, previewContainerRef, previewViewportRef, videoElementsRef, audioElementsRef } = useVideoRefs();
  const {
    playback,
    project,
    selectedClipIds,
    toolMode,
    selectClip,
    cropArea,
    setCropArea,
    canvasExpandMode,
    cropAspectRatio,
    lockCropAspect,
    previewPreRenderEnabled,
    isPanLocked,
    isSpacePanning,
    currentTimeRef: stateTimeRef,
  } = useVideoState();
  const { tracks, clips, getClipAtTime, updateClip, saveToHistory } = useTimeline();
  const wasPlayingRef = useRef(false);
  const renderRequestRef = useRef(0);
  const renderRef = useRef<() => void>(() => {});
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const maskTempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMaskDrawingRef = useRef(false);
  const isMaskRegionDraggingRef = useRef(false);
  const maskClipActiveRef = useRef(false);
  const maskRectDragRef = useRef<{
    start: { x: number; y: number };
    current: { x: number; y: number };
  } | null>(null);
  const maskRegionRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const savedMaskImgCacheRef = useRef(new Map<string, HTMLImageElement>());
  const prevBrushModeRef = useRef<"paint" | "erase" | null>(null);
  const [isDraggingClip, setIsDraggingClip] = useState(false);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);
  const previewPerfRef = useRef(resolvePreviewPerformanceConfig());
  const previewPerf = previewPerfRef.current;
  previewPerf.preRenderEnabled = previewPreRenderEnabled;
  const playbackPerfRef = useRef({
    windowStartMs: 0,
    lastTickMs: 0,
    lastRenderMs: 0,
    renderedFrames: 0,
    skippedByCap: 0,
    longTickCount: 0,
    cacheFrames: 0,
    liveFrames: 0,
  });
  const syncMediaRef = useRef<(() => void) | null>(null);
  const syncMediaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPlaybackTickTimeRef = useRef<number | null>(null);
  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(renderRequestRef.current);
    renderRequestRef.current = requestAnimationFrame(() => renderRef.current());
  }, []);

  // Mask
  const {
    activeMaskId,
    isEditingMask,
    activeTrackId,
    maskCanvasRef: maskContextCanvasRef,
    getMaskAtTimeForTrack,
    masks,
    brushSettings,
    setBrushMode,
    maskDrawShape,
    maskRegion,
    setMaskRegion,
    saveMaskData,
    saveMaskHistoryPoint,
    maskCanvasVersion,
    maskRegionClearRequestId,
  } = useMask();
  const { startDraw, continueDraw, endDraw } = useMaskTool();

  maskRegionRef.current = maskRegion;

  const updateMaskRegion = useCallback((nextRegion: { x: number; y: number; width: number; height: number } | null) => {
    setMaskRegion(nextRegion);
  }, [setMaskRegion]);

  const createMaskRegionFromPoints = useCallback(
    (start: { x: number; y: number }, current: { x: number; y: number }) => {
      const x = Math.round(Math.min(start.x, current.x));
      const y = Math.round(Math.min(start.y, current.y));
      const width = Math.round(Math.max(1, Math.abs(current.x - start.x)));
      const height = Math.round(Math.max(1, Math.abs(current.y - start.y)));
      return { x, y, width, height };
    },
    []
  );

  const applyMaskRegionClip = useCallback((region: { x: number; y: number; width: number; height: number }) => {
    if (maskClipActiveRef.current) return;
    const ctx = maskContextCanvasRef.current?.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(region.x, region.y, region.width, region.height);
    ctx.clip();
    maskClipActiveRef.current = true;
  }, [maskContextCanvasRef]);

  const clearMaskRegionClip = useCallback(() => {
    if (!maskClipActiveRef.current) return;
    const ctx = maskContextCanvasRef.current?.getContext("2d");
    if (ctx) {
      ctx.restore();
    }
    maskClipActiveRef.current = false;
  }, [maskContextCanvasRef]);

  const clearMaskRegionSelection = useCallback(() => {
    const hadRegion = Boolean(maskRegionRef.current || maskRectDragRef.current || isMaskRegionDraggingRef.current);
    const hadClip = maskClipActiveRef.current;
    if (!hadRegion && !hadClip) return false;

    updateMaskRegion(null);
    maskRectDragRef.current = null;
    isMaskRegionDraggingRef.current = false;
    if (hadClip) {
      clearMaskRegionClip();
    }

    scheduleRender();
    return true;
  }, [clearMaskRegionClip, scheduleRender, updateMaskRegion]);

  useEffect(() => {
    if (isEditingMask) return;
    clearMaskRegionSelection();
  }, [isEditingMask, clearMaskRegionSelection]);

  useEffect(() => {
    if (!isEditingMask) return;
    if (maskRegionClearRequestId <= 0) return;
    clearMaskRegionSelection();
  }, [isEditingMask, maskRegionClearRequestId, clearMaskRegionSelection]);

  useEffect(() => {
    if (!isEditingMask || !activeMaskId) return;
    clearMaskRegionSelection();
  }, [isEditingMask, activeMaskId, clearMaskRegionSelection]);

  const isHandTool = toolMode === "hand";
  const isZoomTool = toolMode === "zoom";
  const isHandMode = isHandTool || isSpacePanning;

  // Shared viewport hook — fitOnMount auto-calculates baseScale
  const viewport = useCanvasViewport({
    containerRef: previewContainerRef,
    canvasRef: previewCanvasRef,
    contentSize: project.canvasSize,
    config: { origin: "center", minZoom: PREVIEW.MIN_ZOOM, maxZoom: PREVIEW.MAX_ZOOM },
    fitOnMount: true,
    fitPadding: 40,
    enableWheel: true,
    enablePinch: true,
    coordinateSpace: "container",
  });
  const isPanningRef = useRef(false);
  const containerRectRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const { zoom: viewportZoom } = viewport.useReactSync(200);
  const zoomPercent = Math.round(viewportZoom * 100);

  // Extract stable refs from viewport (useCallback-backed, stable across re-renders)
  const {
    onViewportChange: onVideoViewportChange,
    wheelRef: vpWheelRef,
    pinchRef: vpPinchRef,
    startPanDrag: vpStartPanDrag,
    updatePanDrag: vpUpdatePanDrag,
    endPanDrag: vpEndPanDrag,
    fitToContainer: vpFitToContainer,
    setZoom: vpSetZoom,
    getZoom: vpGetZoom,
    setPan: vpSetPan,
    getPan: vpGetPan,
    setBaseScale: vpSetBaseScale,
    getTransform: vpGetTransform,
    getRenderOffset: vpGetRenderOffset,
    getEffectiveScale: vpGetEffectiveScale,
    screenToContent: vpScreenToContent,
    contentToScreen: vpContentToScreen,
  } = viewport;

  // Merge container ref with viewport wheel/pinch refs
  const containerRefCallback = useCallback((el: HTMLDivElement | null) => {
    previewContainerRef.current = el;
    vpWheelRef(el);
    vpPinchRef(el);
  }, [previewContainerRef, vpWheelRef, vpPinchRef]);

  const { zoomAtClientPoint } = useViewportZoomTool({
    viewportRef: previewContainerRef,
    getZoom: vpGetZoom,
    getPan: vpGetPan,
    setZoom: vpSetZoom,
    setPan: vpSetPan,
    minZoom: PREVIEW.MIN_ZOOM,
    maxZoom: PREVIEW.MAX_ZOOM,
    zoomInFactor: PREVIEW.ZOOM_STEP_IN,
    zoomOutFactor: PREVIEW.ZOOM_STEP_OUT,
    onZoom: () => {
      cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = requestAnimationFrame(() => renderRef.current());
    },
  });

  const stopPanDrag = useCallback(() => {
    if (!isPanningRef.current) return;
    vpEndPanDrag();
    isPanningRef.current = false;
  }, [vpEndPanDrag]);

  const dragStateRef = useRef<{
    clipId: string | null;
    pointerStart: { x: number; y: number };
    clipStart: { x: number; y: number };
  }>({
    clipId: null,
    pointerStart: { x: 0, y: 0 },
    clipStart: { x: 0, y: 0 },
  });
  const cropDragRef = useRef<{
    mode: "none" | "create" | "move" | "resize";
    pointerStart: { x: number; y: number };
    cropStart: { x: number; y: number; width: number; height: number } | null;
    resizeHandle: RectHandle | null;
  }>({
    mode: "none",
    pointerStart: { x: 0, y: 0 },
    cropStart: null,
    resizeHandle: null,
  });
  const originalCropAreaRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);
  const [cropCursor, setCropCursor] = useState<string>("crosshair");

  // Initialize video elements pool - preloads videos when clips change
  useVideoElements();

  // Use the shared ref from VideoStateContext as source of truth for current time
  const currentTimeRef = stateTimeRef;

  // Pre-render cache
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
    projectDuration: project.duration || 1,
    isPlaying: playback.isPlaying,
    // While a mask is active, preview must own media seeking/rendering.
    // Otherwise pre-render and preview can fight over shared video elements.
    suspendPreRender: Boolean(isEditingMask || activeMaskId),
    currentTime: playback.currentTime,
    currentTimeRef,
    enabled: previewPerf.preRenderEnabled,
  });

  // Pre-decode audio buffers for all audible clips (Web Audio API)
  useAudioBufferCache(clips);

  // Web Audio playback engine — plays audio via AudioBufferSourceNode
  const { isWebAudioReady } = useWebAudioPlayback({
    tracks,
    clips,
    getClipAtTime,
    isPlaying: playback.isPlaying,
    playbackRate: playback.playbackRate,
    currentTimeRef,
    debugLogs: previewPerf.debugLogs,
  });

  // Ref for isWebAudioReady to avoid stale closure in syncMedia
  const isWebAudioReadyRef = useRef(isWebAudioReady);
  useEffect(() => { isWebAudioReadyRef.current = isWebAudioReady; }, [isWebAudioReady]);

  // Cache for getComputedStyle results (avoid forcing style recalc every frame)
  const cssColorsRef = useRef<{ surfacePrimary: string; borderDefault: string } | null>(null);
  const invalidateCssCache = useCallback(() => { cssColorsRef.current = null; }, []);
  const checkerPatternRef = useRef<CanvasPattern | null>(null);
  const checkerPatternKeyRef = useRef<string>("");
  const checkerPatternCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!previewPerf.debugLogs) return;
    console.info("[VideoPreviewConfig]", {
      draftMode: previewPerf.draftMode,
      preRenderEnabled: previewPerf.preRenderEnabled,
      playbackRenderFpsCap: previewPerf.playbackRenderFpsCap,
      maxCanvasDpr: previewPerf.maxCanvasDpr,
      isMobileLike: previewPerf.isMobileLike,
    });
  }, [
    previewPerf.debugLogs,
    previewPerf.draftMode,
    previewPerf.preRenderEnabled,
    previewPerf.playbackRenderFpsCap,
    previewPerf.maxCanvasDpr,
    previewPerf.isMobileLike,
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
    const cacheHitRate = totalCompositedFrames > 0
      ? stats.cacheFrames / totalCompositedFrames
      : 0;

    let activeVisualLayers = 0;
    for (const track of tracks) {
      if (!track.visible) continue;
      const clip = getClipAtTime(track.id, currentTimeRef.current);
      if (!clip || !clip.visible || clip.type === "audio") continue;
      activeVisualLayers += 1;
    }

    console.info("[VideoPreviewPerf]", {
      draftMode: previewPerf.draftMode,
      preRenderEnabled: previewPerf.preRenderEnabled,
      fpsCap: previewPerf.playbackRenderFpsCap,
      renderedFps: Number(renderedFps.toFixed(1)),
      renderedFrames: stats.renderedFrames,
      skippedByCap: stats.skippedByCap,
      longTickCount: stats.longTickCount,
      cacheHitRate: Number((cacheHitRate * 100).toFixed(1)),
      activeVisualLayers,
      visibleTracks: tracks.filter((track) => track.visible).length,
    });

    stats.windowStartMs = now;
    stats.renderedFrames = 0;
    stats.skippedByCap = 0;
    stats.longTickCount = 0;
    stats.cacheFrames = 0;
    stats.liveFrames = 0;
  }, [
    previewPerf.debugLogs,
    previewPerf.draftMode,
    previewPerf.preRenderEnabled,
    previewPerf.playbackRenderFpsCap,
    playback.isPlaying,
    tracks,
    getClipAtTime,
    currentTimeRef,
  ]);

  const stopAllMediaElements = useCallback(() => {
    videoElementsRef.current?.forEach((video) => {
      video.pause();
      video.muted = true;
      video.volume = 0;
    });

    audioElementsRef.current?.forEach((audio) => {
      audio.pause();
      audio.muted = true;
      audio.volume = 0;
    });
  }, [videoElementsRef, audioElementsRef]);

  const forceStopMediaImmediately = useCallback(() => {
    if (syncMediaIntervalRef.current !== null) {
      clearInterval(syncMediaIntervalRef.current);
      syncMediaIntervalRef.current = null;
    }
    syncMediaRef.current = null;
    lastPlaybackTickTimeRef.current = null;
    stopAllMediaElements();
  }, [stopAllMediaElements]);

  useEffect(() => {
    return subscribeImmediatePlaybackStop(forceStopMediaImmediately);
  }, [forceStopMediaImmediately]);

  // Handle playback state changes - sync video/audio elements.
  // Runs only when play state or clip/track structure changes, NOT every frame.
  useEffect(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const audioClips = clips.filter((c): c is AudioClip => c.type === "audio");

    if (!playback.isPlaying) {
      forceStopMediaImmediately();
      wasPlayingRef.current = false;
      return;
    }

    // Sync and start/stop media elements
    const syncMedia = () => {
      const ct = currentTimeRef.current;
      const trackById = new Map(tracks.map((t) => [t.id, t]));

      // Collect audible clips at current time
      const audibleClipIds = new Set<string>();
      for (const track of tracks) {
        if (!track.visible || track.muted) continue;
        const clip = getClipAtTime(track.id, ct);
        if (!clip || !clip.visible) continue;
        if (clip.type === "video") {
          if ((clip.hasAudio ?? true) && !(clip.audioMuted ?? false) && ((typeof clip.audioVolume === "number" ? clip.audioVolume : 100) > 0)) {
            audibleClipIds.add(clip.id);
          }
        } else if (clip.type === "audio") {
          if (!(clip.audioMuted ?? false) && ((typeof clip.audioVolume === "number" ? clip.audioVolume : 100) > 0)) {
            audibleClipIds.add(clip.id);
          }
        }
      }

      for (const clip of videoClips) {
        const video = videoElementsRef.current?.get(clip.id);
        const track = trackById.get(clip.trackId);
        if (!video || !track || video.readyState < 2) continue;

        const clipTime = ct - clip.startTime;
        if (clipTime < 0 || clipTime >= clip.duration || !clip.visible || !track.visible) {
          video.pause();
          video.muted = true;
          continue;
        }

        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(video.currentTime - sourceTime) > PLAYBACK.SEEK_DRIFT_THRESHOLD) {
          video.currentTime = sourceTime;
        }

        video.playbackRate = playback.playbackRate;

        // Web Audio handles audio when buffer is ready — mute HTMLVideoElement
        if (isWebAudioReadyRef.current(clip.sourceUrl)) {
          video.muted = true;
          video.volume = 0;
        } else {
          // Fallback: HTMLMediaElement audio (draft mode)
          const isAudible = audibleClipIds.has(clip.id);
          video.muted = !isAudible;
          const clipVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
          video.volume = isAudible ? Math.max(0, Math.min(1, clipVolume / 100)) : 0;
        }

        if (video.paused) video.play().catch(() => {});
      }

      for (const clip of audioClips) {
        const audio = audioElementsRef.current?.get(clip.id);
        const track = trackById.get(clip.trackId);
        if (!audio || !track) continue;

        // Web Audio handles this clip — skip HTMLAudioElement entirely
        if (isWebAudioReadyRef.current(clip.sourceUrl)) {
          audio.pause();
          audio.muted = true;
          continue;
        }

        // Fallback: HTMLMediaElement audio (draft mode)
        const clipTime = ct - clip.startTime;
        if (clipTime < 0 || clipTime >= clip.duration || !clip.visible || !track.visible || !audibleClipIds.has(clip.id)) {
          audio.pause();
          audio.muted = true;
          continue;
        }

        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(audio.currentTime - sourceTime) > PLAYBACK.AUDIO_SEEK_DRIFT_THRESHOLD) {
          audio.currentTime = sourceTime;
        }

        audio.playbackRate = playback.playbackRate;
        audio.muted = false;
        audio.volume = Math.max(0, Math.min(1, (clip.audioVolume ?? 100) / 100));

        if (audio.paused) audio.play().catch(() => {});
      }
    };

    syncMediaRef.current = syncMedia;
    syncMedia(); // Initial sync when playback starts
    // Periodic re-sync for clip boundaries and drift correction (not every frame)
    const intervalId = setInterval(syncMedia, PLAYBACK.SYNC_INTERVAL_MS);
    syncMediaIntervalRef.current = intervalId;
    wasPlayingRef.current = true;

    return () => {
      clearInterval(intervalId);
      if (syncMediaIntervalRef.current === intervalId) {
        syncMediaIntervalRef.current = null;
      }
      syncMediaRef.current = null;
      if (!playback.isPlaying) {
        stopAllMediaElements();
      }
    };
  }, [playback.isPlaying, playback.playbackRate, clips, tracks, getClipAtTime, videoElementsRef, audioElementsRef, stopAllMediaElements, forceStopMediaImmediately]);

  // Hard-stop HTML media elements when the tab/window loses foreground.
  useEffect(() => {
    const stopWhenBackgrounded = () => {
      if (document.visibilityState !== "visible") {
        forceStopMediaImmediately();
      }
    };

    const stopNow = () => {
      forceStopMediaImmediately();
    };

    document.addEventListener("visibilitychange", stopWhenBackgrounded);
    window.addEventListener("blur", stopNow);
    window.addEventListener("pagehide", stopNow);

    return () => {
      document.removeEventListener("visibilitychange", stopWhenBackgrounded);
      window.removeEventListener("blur", stopNow);
      window.removeEventListener("pagehide", stopNow);
    };
  }, [forceStopMediaImmediately]);
  // Setup video ready listeners - trigger render via rAF only when paused (scrubbing)
  useEffect(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const cleanupFns: (() => void)[] = [];

    const scheduleRenderFromMediaReady = () => {
      // During playback, the playback loop already drives rendering
      if (wasPlayingRef.current) return;
      // During pre-rendering, the pre-render loop seeks video elements to
      // different times. Don't re-render in response — it would fight over
      // video element currentTime and cause frame drops.
      if (isPreRenderingRef.current) return;
      scheduleRender();
    };

    for (const clip of videoClips) {
      const video = videoElementsRef.current?.get(clip.id);
      if (video) {
        video.addEventListener("canplay", scheduleRenderFromMediaReady);
        video.addEventListener("seeked", scheduleRenderFromMediaReady);
        video.addEventListener("loadeddata", scheduleRenderFromMediaReady);

        cleanupFns.push(() => {
          video.removeEventListener("canplay", scheduleRenderFromMediaReady);
          video.removeEventListener("seeked", scheduleRenderFromMediaReady);
          video.removeEventListener("loadeddata", scheduleRenderFromMediaReady);
        });
      }
    }

    return () => {
      cancelAnimationFrame(renderRequestRef.current);
      cleanupFns.forEach((fn) => fn());
    };
  }, [clips, videoElementsRef, isPreRenderingRef, scheduleRender]);

  // Draw checkerboard with cached CanvasPattern to avoid per-frame tile loops.
  const drawCheckerboard = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const size = previewPerfRef.current.draftMode
      ? PREVIEW.CHECKERBOARD_SIZE * 2
      : PREVIEW.CHECKERBOARD_SIZE;
    const colors = getCanvasColorsSync();
    const patternKey = `${size}:${colors.checkerboardLight}:${colors.checkerboardDark}`;

    if (checkerPatternKeyRef.current !== patternKey || !checkerPatternRef.current) {
      const tileCanvas = checkerPatternCanvasRef.current ?? document.createElement("canvas");
      checkerPatternCanvasRef.current = tileCanvas;
      tileCanvas.width = size * 2;
      tileCanvas.height = size * 2;

      const tileCtx = tileCanvas.getContext("2d");
      if (!tileCtx) return;

      tileCtx.clearRect(0, 0, tileCanvas.width, tileCanvas.height);
      tileCtx.fillStyle = colors.checkerboardLight;
      tileCtx.fillRect(0, 0, tileCanvas.width, tileCanvas.height);
      tileCtx.fillStyle = colors.checkerboardDark;
      tileCtx.fillRect(0, 0, size, size);
      tileCtx.fillRect(size, size, size, size);

      checkerPatternRef.current = ctx.createPattern(tileCanvas, "repeat");
      checkerPatternKeyRef.current = patternKey;
    }

    if (!checkerPatternRef.current) return;
    ctx.fillStyle = checkerPatternRef.current;
    ctx.fillRect(0, 0, width, height);
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

  // Render the composited frame - assigned to ref to avoid stale closures
  renderRef.current = () => {
    const canvas = previewCanvasRef.current;
    const container = previewContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Read current time from ref (source of truth during playback)
    const ct = currentTimeRef.current;
    const loopFrameBounds = getLoopFrameBounds(
      playback.loop,
      playback.loopStart,
      playback.loopEnd,
      project.duration || 0
    );
    const renderTime = (playback.isPlaying && previewPerf.preRenderEnabled)
      ? getPlaybackSampleTime(ct, loopFrameBounds)
      : ct;

    const deviceDpr = window.devicePixelRatio || 1;
    const dpr = Math.max(1, Math.min(deviceDpr, previewPerf.maxCanvasDpr));
    let width = containerRectRef.current.width;
    let height = containerRectRef.current.height;
    if (width <= 0 || height <= 0) {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      containerRectRef.current = { width, height };
    }

    // Set canvas size with DPI scaling
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = getCanvasColorsSync();
    // Cache getComputedStyle results to avoid per-frame style recalculation
    if (!cssColorsRef.current) {
      const rootStyle = getComputedStyle(document.documentElement);
      cssColorsRef.current = {
        surfacePrimary: rootStyle.getPropertyValue("--surface-primary").trim() || "#1a1a1a",
        borderDefault: rootStyle.getPropertyValue("--border-default").trim() || "#333333",
      };
    }
    const { surfacePrimary, borderDefault } = cssColorsRef.current;

    // Clear with background color
    ctx.fillStyle = surfacePrimary;
    ctx.fillRect(0, 0, width, height);

    // Calculate preview area from shared viewport transform
    const projectWidth = project.canvasSize.width;
    const projectHeight = project.canvasSize.height;
    const scale = vpGetEffectiveScale();
    const renderOffset = vpGetRenderOffset();
    const previewWidth = projectWidth * scale;
    const previewHeight = projectHeight * scale;
    const offsetX = renderOffset.x;
    const offsetY = renderOffset.y;

    // Draw checkerboard for transparency
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, previewWidth, previewHeight);
    ctx.clip();
    drawCheckerboard(ctx, width, height);
    ctx.restore();

    // Try cached frame first (any state — instant display on seek/scrub)
    // Skip cache during mask editing — cached frames don't include live mask
    // overlay or edits, so they would hide the mask completely.
    // Skip cache when mask is active (editing or selected) — overlay needs live rendering
    const cachedBitmap = (isEditingMask || activeMaskId) ? null : getCachedFrame(renderTime);

    if (cachedBitmap) {
      if (playback.isPlaying) {
        playbackPerfRef.current.cacheFrames += 1;
      }
      // Use pre-rendered cached frame — skip per-track compositing
      ctx.drawImage(cachedBitmap, offsetX, offsetY, previewWidth, previewHeight);
    } else {
      if (playback.isPlaying) {
        playbackPerfRef.current.liveFrames += 1;
      }
      // Draw bottom track first (background), top track last (foreground).
      // Use array order directly — tracks[0] is the topmost track in the timeline.
      const sortedTracks = [...tracks].reverse();

      const selectedVisualClipId = selectedClipIds.find((clipId) => {
        const selected = clips.find((clip) => clip.id === clipId);
        return !!selected && selected.type !== "audio";
      }) || null;

      // Composite each track
      for (const track of sortedTracks) {
        if (!track.visible) continue;

        const clip = getClipAtTime(track.id, renderTime);
        if (!clip || !clip.visible) continue;

        // Get the video/image element for this clip
        const videoElement = videoElementsRef.current.get(clip.id);

        // Determine source element
        let sourceEl: CanvasImageSource | null = null;

        if (clip.type === "video" && videoElement) {
          if (videoElement.readyState < 2) {
            continue;
          }
          if (!playback.isPlaying) {
            const clipTime = renderTime - clip.startTime;
            const sourceTime = clip.trimIn + clipTime;
            if (Math.abs(videoElement.currentTime - sourceTime) > 0.05) {
              videoElement.currentTime = sourceTime;
              // Keep rendering the currently available frame while seek settles.
              // Without this, mask-selected state (cache bypass) can show blank frames.
            }
          }
          sourceEl = videoElement;
        } else if (clip.type === "image") {
          let img = imageCacheRef.current.get(clip.sourceUrl);
          if (!img) {
            img = new Image();
            img.src = clip.sourceUrl;
            imageCacheRef.current.set(clip.sourceUrl, img);
          }
          if (img.complete && img.naturalWidth > 0) {
            sourceEl = img;
          }
        }

        if (sourceEl) {
          const drawPoint = vpContentToScreen(clip.position);
          const drawX = drawPoint.x;
          const drawY = drawPoint.y;
          const drawW = clip.sourceSize.width * scale * getClipScaleX(clip);
          const drawH = clip.sourceSize.height * scale * getClipScaleY(clip);

          // Check for mask on this track at current time
          const maskResult = getMaskAtTimeForTrack(clip.trackId, renderTime);
          let clipMaskSource: CanvasImageSource | null = null;

          if (maskResult === "__live_canvas__" && maskContextCanvasRef.current) {
            // Live editing: use mask canvas directly
            clipMaskSource = maskContextCanvasRef.current;
          } else if (maskResult && maskResult !== "__live_canvas__") {
            // Saved keyframe data
            let maskImg = savedMaskImgCacheRef.current.get(maskResult);
            if (!maskImg) {
              maskImg = new Image();
              maskImg.src = maskResult;
              savedMaskImgCacheRef.current.set(maskResult, maskImg);
              maskImg.onload = () => {
                renderRef.current();
              };
            }
            if (maskImg.complete && maskImg.naturalWidth > 0) {
              clipMaskSource = maskImg;
            }
          }

          if (clipMaskSource) {
            // Draw with mask using offscreen compositing
            if (!maskTempCanvasRef.current) {
              maskTempCanvasRef.current = document.createElement("canvas");
            }
            const tmpCanvas = maskTempCanvasRef.current;
            // Mask is project-canvas sized
            const maskW = project.canvasSize.width;
            const maskH = project.canvasSize.height;
            if (tmpCanvas.width !== maskW || tmpCanvas.height !== maskH) {
              tmpCanvas.width = maskW;
              tmpCanvas.height = maskH;
            }
            const tmpCtx = tmpCanvas.getContext("2d");
            if (tmpCtx) {
              tmpCtx.clearRect(0, 0, maskW, maskH);
              tmpCtx.globalCompositeOperation = "source-over";
              tmpCtx.globalAlpha = 1;
              // Draw clip at its position within the project canvas
              tmpCtx.drawImage(
                sourceEl,
                clip.position.x,
                clip.position.y,
                clip.sourceSize.width * getClipScaleX(clip),
                clip.sourceSize.height * getClipScaleY(clip)
              );
              tmpCtx.globalCompositeOperation = "destination-in";
              tmpCtx.drawImage(clipMaskSource, 0, 0, maskW, maskH);
              tmpCtx.globalCompositeOperation = "source-over";

              ctx.globalAlpha = clip.opacity / 100;
              ctx.drawImage(tmpCanvas, offsetX, offsetY, previewWidth, previewHeight);
              ctx.globalAlpha = 1;
            }

            // Draw mask overlay when selected or editing
            const showOverlay = activeTrackId === clip.trackId && activeMaskId && clipMaskSource;
            if (showOverlay) {
              if (!maskOverlayCanvasRef.current) {
                maskOverlayCanvasRef.current = document.createElement("canvas");
              }
              const overlayCanvas = maskOverlayCanvasRef.current;
              if (overlayCanvas.width !== maskW || overlayCanvas.height !== maskH) {
                overlayCanvas.width = maskW;
                overlayCanvas.height = maskH;
              }
              const overlayCtx = overlayCanvas.getContext("2d");
              if (overlayCtx) {
                overlayCtx.clearRect(0, 0, maskW, maskH);
                overlayCtx.globalCompositeOperation = "source-over";
                overlayCtx.drawImage(clipMaskSource, 0, 0, maskW, maskH);
                // Tint: red when editing, purple when selected
                overlayCtx.globalCompositeOperation = "source-in";
                overlayCtx.fillStyle = isEditingMask
                  ? "rgba(255, 60, 60, 0.35)"
                  : "rgba(168, 85, 247, 0.3)";
                overlayCtx.fillRect(0, 0, maskW, maskH);

                ctx.drawImage(overlayCanvas, offsetX, offsetY, previewWidth, previewHeight);
              }
            }
          } else {
            ctx.globalAlpha = clip.opacity / 100;
            ctx.drawImage(sourceEl, drawX, drawY, drawW, drawH);
            ctx.globalAlpha = 1;
          }
        }

        if (
          selectedVisualClipId
          && clip.id === selectedVisualClipId
          && clip.type !== "audio"
          && !(toolMode === "transform" && transformTool.state.isActive)
        ) {
          const boxPoint = vpContentToScreen(clip.position);
          const boxX = boxPoint.x;
          const boxY = boxPoint.y;
          const boxW = clip.sourceSize.width * scale * getClipScaleX(clip);
          const boxH = clip.sourceSize.height * scale * getClipScaleY(clip);

          ctx.save();
          if (clip.rotation !== 0) {
            const centerX = boxX + boxW / 2;
            const centerY = boxY + boxH / 2;
            ctx.translate(centerX, centerY);
            ctx.rotate((clip.rotation * Math.PI) / 180);
            ctx.translate(-centerX, -centerY);
          }
          ctx.strokeStyle = colors.selection;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.strokeRect(boxX, boxY, boxW, boxH);
          ctx.restore();
        }
      }
    }

    if (toolMode === "crop") {
      const activeCrop = cropArea || {
        x: 0,
        y: 0,
        width: project.canvasSize.width,
        height: project.canvasSize.height,
      };
      const cropPoint = vpContentToScreen({ x: activeCrop.x, y: activeCrop.y });
      const cropX = cropPoint.x;
      const cropY = cropPoint.y;
      const cropW = activeCrop.width * scale;
      const cropH = activeCrop.height * scale;

      // Dark overlay outside crop area
      ctx.save();
      ctx.fillStyle = colors.overlay;
      // Top
      ctx.fillRect(offsetX, offsetY, previewWidth, cropY - offsetY);
      // Bottom
      ctx.fillRect(offsetX, cropY + cropH, previewWidth, (offsetY + previewHeight) - (cropY + cropH));
      // Left
      ctx.fillRect(offsetX, cropY, cropX - offsetX, cropH);
      // Right
      ctx.fillRect(cropX + cropW, cropY, (offsetX + previewWidth) - (cropX + cropW), cropH);
      ctx.restore();

      // Solid border (matching editor style)
      ctx.save();
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 2;
      ctx.strokeRect(cropX, cropY, cropW, cropH);

      // Rule of thirds grid
      ctx.strokeStyle = colors.grid || "rgba(255,255,255,0.25)";
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cropX + (cropW * i) / 3, cropY);
        ctx.lineTo(cropX + (cropW * i) / 3, cropY + cropH);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(cropX, cropY + (cropH * i) / 3);
        ctx.lineTo(cropX + cropW, cropY + (cropH * i) / 3);
        ctx.stroke();
      }

      // 8 resize handles (corners + midpoints)
      const handleSize = 10;
      const handles = [
        { x: cropX, y: cropY },
        { x: cropX + cropW / 2, y: cropY },
        { x: cropX + cropW, y: cropY },
        { x: cropX + cropW, y: cropY + cropH / 2 },
        { x: cropX + cropW, y: cropY + cropH },
        { x: cropX + cropW / 2, y: cropY + cropH },
        { x: cropX, y: cropY + cropH },
        { x: cropX, y: cropY + cropH / 2 },
      ];
      ctx.fillStyle = colors.selection;
      for (const handle of handles) {
        ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
      }
      ctx.restore();
    }

    if (toolMode === "transform" && transformTool.state.isActive && transformTool.state.bounds) {
      const bounds = transformTool.state.bounds;
      const topLeft = vpContentToScreen({ x: bounds.x, y: bounds.y });
      const transformX = topLeft.x;
      const transformY = topLeft.y;
      const transformW = bounds.width * scale;
      const transformH = bounds.height * scale;

      ctx.save();
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.strokeRect(transformX, transformY, transformW, transformH);

      const handleSize = 10;
      const handles = [
        { x: transformX, y: transformY },
        { x: transformX + transformW / 2, y: transformY },
        { x: transformX + transformW, y: transformY },
        { x: transformX + transformW, y: transformY + transformH / 2 },
        { x: transformX + transformW, y: transformY + transformH },
        { x: transformX + transformW / 2, y: transformY + transformH },
        { x: transformX, y: transformY + transformH },
        { x: transformX, y: transformY + transformH / 2 },
      ];

      ctx.fillStyle = colors.selection;
      ctx.strokeStyle = colors.textOnColor;
      ctx.lineWidth = 1;
      for (const handle of handles) {
        ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
      }
      ctx.restore();
    }

    if (isEditingMask) {
      const rectangleDrag = maskRectDragRef.current;
      const draggingRegion = maskDrawShape === "rectangle" && rectangleDrag
        ? createMaskRegionFromPoints(rectangleDrag.start, rectangleDrag.current)
        : null;
      const visibleRegion = draggingRegion ?? maskRegionRef.current;

      if (visibleRegion) {
        const regionTopLeft = vpContentToScreen({ x: visibleRegion.x, y: visibleRegion.y });
        const rectX = regionTopLeft.x;
        const rectY = regionTopLeft.y;
        const rectW = visibleRegion.width * scale;
        const rectH = visibleRegion.height * scale;
        const isDraggingRegion = Boolean(draggingRegion);

        ctx.save();
        ctx.fillStyle = isDraggingRegion ? "rgba(59, 130, 246, 0.16)" : "rgba(59, 130, 246, 0.08)";
        ctx.strokeStyle = "rgba(147, 197, 253, 0.95)";
        ctx.lineWidth = isDraggingRegion ? 1.75 : 1.25;
        ctx.setLineDash(isDraggingRegion ? [8, 4] : [6, 6]);
        ctx.fillRect(rectX, rectY, rectW, rectH);
        ctx.strokeRect(rectX, rectY, rectW, rectH);
        ctx.restore();
      }
    }

    // Draw frame border
    ctx.strokeStyle = borderDefault;
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
  };

  const clampToCanvas = useCallback((point: { x: number; y: number }) => {
    return {
      x: Math.max(0, Math.min(project.canvasSize.width, point.x)),
      y: Math.max(0, Math.min(project.canvasSize.height, point.y)),
    };
  }, [project.canvasSize.height, project.canvasSize.width]);

  const screenToProject = useCallback((clientX: number, clientY: number, allowOutside: boolean = false) => {
    if (!previewContainerRef.current) return null;
    const point = vpScreenToContent({ x: clientX, y: clientY });

    if (!allowOutside && (
      point.x < 0
      || point.y < 0
      || point.x > project.canvasSize.width
      || point.y > project.canvasSize.height
    )) {
      return null;
    }

    return point;
  }, [previewContainerRef, vpScreenToContent, project.canvasSize.width, project.canvasSize.height]);

  // Mask uses project coordinates (not clip-local) since it's track-level
  const screenToMaskCoords = useCallback((clientX: number, clientY: number) => {
    const point = screenToProject(clientX, clientY, true);
    if (!point) return null;
    return {
      x: Math.max(0, Math.min(project.canvasSize.width, point.x)),
      y: Math.max(0, Math.min(project.canvasSize.height, point.y)),
    };
  }, [screenToProject, project.canvasSize]);

  const hitTestClipAtPoint = useCallback((point: { x: number; y: number }): Clip | null => {
    const tracksById = new Map(tracks.map((track) => [track.id, track]));
    // Top track (index 0) is foreground — check it first for hit testing
    const sortedTracks = [...tracks];

    for (const track of sortedTracks) {
      if (!track.visible || track.locked) continue;
      const clip = getClipAtTime(track.id, currentTimeRef.current);
      if (!clip || !clip.visible || clip.type === "audio") continue;

      const width = clip.sourceSize.width * getClipScaleX(clip);
      const height = clip.sourceSize.height * getClipScaleY(clip);
      const centerX = clip.position.x + width / 2;
      const centerY = clip.position.y + height / 2;
      const angle = ((clip.rotation || 0) * Math.PI) / 180;

      const dx = point.x - centerX;
      const dy = point.y - centerY;
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      const inside =
        localX >= -width / 2 &&
        localX <= width / 2 &&
        localY >= -height / 2 &&
        localY <= height / 2;

      const trackState = tracksById.get(clip.trackId);
      if (inside && trackState && !trackState.locked) {
        return clip;
      }
    }

    return null;
  }, [tracks, getClipAtTime, currentTimeRef]);

  const transformTool = useClipTransformTool({
    clips,
    selectedClipIds,
    toolMode,
    selectClip,
    updateClip,
    saveToHistory,
    screenToProject,
    hitTestClipAtPoint,
  });
  const captureCompositeFrame = usePreviewFrameCapture({
    projectSize: project.canvasSize,
    currentTimeRef,
    isPlaying: playback.isPlaying,
    tracks,
    getClipAtTime,
    getMaskAtTimeForTrack,
    videoElementsRef,
    imageCacheRef,
    maskImageCacheRef: savedMaskImgCacheRef,
    maskTempCanvasRef,
    liveMaskCanvasRef: maskContextCanvasRef,
  });
  const fitViewportToContainer = useCallback(() => {
    vpFitToContainer(40);
  }, [vpFitToContainer]);
  usePreviewViewportBridge({
    previewViewportRef,
    onViewportChange: onVideoViewportChange,
    getZoom: vpGetZoom,
    setZoom: vpSetZoom,
    fitToContainer: fitViewportToContainer,
    transformTool,
    captureCompositeFrame,
  });

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.focus();

    // Middle mouse button drag for pan
    if (e.button === 1) {
      e.preventDefault();
      safeSetPointerCapture(e.currentTarget, e.pointerId);
      vpStartPanDrag({ x: e.clientX, y: e.clientY });
      isPanningRef.current = true;
      return;
    }

    const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
    if (isTouchPanOnlyInput && e.button === 0) {
      e.preventDefault();
      safeSetPointerCapture(e.currentTarget, e.pointerId);
      vpStartPanDrag({ x: e.clientX, y: e.clientY });
      isPanningRef.current = true;
      return;
    }

    if (isZoomTool) {
      if (e.button !== 0) return;
      e.preventDefault();
      zoomAtClientPoint(e.clientX, e.clientY, e.altKey);
      return;
    }

    if (isHandMode && e.button === 0) {
      e.preventDefault();
      safeSetPointerCapture(e.currentTarget, e.pointerId);
      vpStartPanDrag({ x: e.clientX, y: e.clientY });
      isPanningRef.current = true;
      return;
    }

    if (isEditingMask && activeTrackId) {
      const maskCoords = screenToMaskCoords(e.clientX, e.clientY);
      if (!maskCoords) return;
      e.preventDefault();
      safeSetPointerCapture(e.currentTarget, e.pointerId);

      if (maskDrawShape === "rectangle") {
        isMaskRegionDraggingRef.current = true;
        maskRectDragRef.current = {
          start: maskCoords,
          current: maskCoords,
        };
      } else {
        // Alt key toggles erase mode temporarily
        if (e.altKey && brushSettings.mode !== "erase") {
          prevBrushModeRef.current = brushSettings.mode;
          setBrushMode("erase");
        }

        saveMaskHistoryPoint();
        const region = maskRegionRef.current;
        if (region) {
          applyMaskRegionClip(region);
        }
        const pressure = e.pointerType === "pen" ? Math.max(0.01, e.pressure || 1) : 1;
        startDraw(maskCoords.x, maskCoords.y, pressure);
        isMaskDrawingRef.current = true;
      }
      scheduleRender();
      return;
    }

    if (toolMode === "crop") {
      const rawPoint = screenToProject(e.clientX, e.clientY, canvasExpandMode);
      if (!rawPoint) return;
      const point = canvasExpandMode ? rawPoint : clampToCanvas(rawPoint);

      e.preventDefault();
      safeSetPointerCapture(e.currentTarget, e.pointerId);

      // Check handle hit first (resize)
      if (cropArea && cropArea.width > 0 && cropArea.height > 0) {
        const hit = getRectHandleAtPosition(point, cropArea, {
          handleSize: 12,
          includeMove: true,
        });

        if (hit && hit !== "move") {
          originalCropAreaRef.current = { ...cropArea };
          cropDragRef.current = {
            mode: "resize",
            pointerStart: point,
            cropStart: { ...cropArea },
            resizeHandle: hit as RectHandle,
          };
          setIsDraggingCrop(true);
          return;
        }

        if (hit === "move") {
          cropDragRef.current = {
            mode: "move",
            pointerStart: point,
            cropStart: { ...cropArea },
            resizeHandle: null,
          };
          setIsDraggingCrop(true);
          return;
        }
      }

      // Create new crop area
      const nextArea = {
        x: Math.round(point.x),
        y: Math.round(point.y),
        width: 0,
        height: 0,
      };
      setCropArea(nextArea);
      cropDragRef.current = {
        mode: "create",
        pointerStart: point,
        cropStart: nextArea,
        resizeHandle: null,
      };
      setIsDraggingCrop(true);
      return;
    }

    if (toolMode === "transform") {
      const handled = transformTool.handlePointerDown(e);
      if (handled) {
        e.preventDefault();
        safeSetPointerCapture(e.currentTarget, e.pointerId);
      }
      return;
    }

    if (toolMode !== "select") return;

    const point = screenToProject(e.clientX, e.clientY);
    if (!point) return;

    const hitClip = hitTestClipAtPoint(point);
    if (!hitClip || hitClip.type === "audio") return;

    e.preventDefault();
    safeSetPointerCapture(e.currentTarget, e.pointerId);
    saveToHistory();
    selectClip(hitClip.id, false);
    dragStateRef.current = {
      clipId: hitClip.id,
      pointerStart: point,
      clipStart: { ...hitClip.position },
    };
    setIsDraggingClip(true);
  }, [
    vpStartPanDrag,
    isPanLocked,
    isZoomTool,
    zoomAtClientPoint,
    isHandMode,
    isEditingMask,
    activeTrackId,
    screenToMaskCoords,
    startDraw,
    brushSettings.mode,
    setBrushMode,
    toolMode,
    screenToProject,
    canvasExpandMode,
    clampToCanvas,
    cropArea,
    setCropArea,
    hitTestClipAtPoint,
    saveToHistory,
    selectClip,
    saveMaskHistoryPoint,
    maskDrawShape,
    transformTool,
    applyMaskRegionClip,
    scheduleRender,
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Middle mouse button pan
    if (isPanningRef.current) {
      vpUpdatePanDrag({ x: e.clientX, y: e.clientY });
      return;
    }

    // Update brush cursor position when editing mask
    if (isEditingMask) {
      const container = previewContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }

    if (isMaskRegionDraggingRef.current) {
      const maskCoords = screenToMaskCoords(e.clientX, e.clientY);
      if (maskCoords && maskRectDragRef.current) {
        maskRectDragRef.current.current = maskCoords;
        scheduleRender();
      }
      return;
    }

    if (isMaskDrawingRef.current) {
      const maskCoords = screenToMaskCoords(e.clientX, e.clientY);
      if (maskCoords) {
        const pressure = e.pointerType === "pen" ? Math.max(0.01, e.pressure || 1) : 1;
        continueDraw(maskCoords.x, maskCoords.y, pressure);
        scheduleRender();
      }
      return;
    }

    if (toolMode === "transform") {
      const handled = transformTool.handlePointerMove(e);
      if (handled) {
        scheduleRender();
      }
      return;
    }

    // Update crop cursor on hover (when not dragging)
    if (toolMode === "crop" && cropDragRef.current.mode === "none") {
      const hoverPoint = screenToProject(e.clientX, e.clientY, canvasExpandMode);
      if (hoverPoint && cropArea && cropArea.width > 0 && cropArea.height > 0) {
        const hit = getRectHandleAtPosition(hoverPoint, cropArea, {
          handleSize: 12,
          includeMove: true,
        });
        if (hit && hit !== "move") {
          const cursorMap: Record<string, string> = {
            nw: "nwse-resize", se: "nwse-resize",
            ne: "nesw-resize", sw: "nesw-resize",
            n: "ns-resize", s: "ns-resize",
            e: "ew-resize", w: "ew-resize",
          };
          setCropCursor(cursorMap[hit] || "crosshair");
        } else if (hit === "move") {
          setCropCursor("move");
        } else {
          setCropCursor("crosshair");
        }
      } else {
        setCropCursor("crosshair");
      }
    }

    if (cropDragRef.current.mode !== "none") {
      const rawPoint = screenToProject(e.clientX, e.clientY, canvasExpandMode);
      if (!rawPoint) return;
      const point = canvasExpandMode ? rawPoint : clampToCanvas(rawPoint);

      if (cropDragRef.current.mode === "create") {
        const start = cropDragRef.current.pointerStart;
        const ratioValue = ASPECT_RATIO_VALUES[cropAspectRatio] ?? null;
        const clampedPos = canvasExpandMode ? point : {
          x: Math.max(0, Math.min(Math.round(point.x), project.canvasSize.width)),
          y: Math.max(0, Math.min(Math.round(point.y), project.canvasSize.height)),
        };
        const nextArea = createRectFromDrag(start, clampedPos, {
          keepAspect: Boolean(ratioValue),
          targetAspect: ratioValue ?? undefined,
          round: true,
          bounds: canvasExpandMode ? undefined : {
            minX: 0, minY: 0,
            maxX: project.canvasSize.width,
            maxY: project.canvasSize.height,
          },
        });
        setCropArea(nextArea);
        return;
      }

      if (cropDragRef.current.mode === "move" && cropDragRef.current.cropStart) {
        const start = cropDragRef.current.cropStart;
        const dx = point.x - cropDragRef.current.pointerStart.x;
        const dy = point.y - cropDragRef.current.pointerStart.y;
        let nextX = start.x + dx;
        let nextY = start.y + dy;

        if (!canvasExpandMode) {
          nextX = Math.max(0, Math.min(project.canvasSize.width - start.width, nextX));
          nextY = Math.max(0, Math.min(project.canvasSize.height - start.height, nextY));
        }

        setCropArea({
          x: Math.round(nextX),
          y: Math.round(nextY),
          width: Math.round(start.width),
          height: Math.round(start.height),
        });
        return;
      }

      if (cropDragRef.current.mode === "resize" && originalCropAreaRef.current && cropDragRef.current.resizeHandle) {
        const orig = originalCropAreaRef.current;
        const dx = point.x - cropDragRef.current.pointerStart.x;
        const dy = point.y - cropDragRef.current.pointerStart.y;
        const ratioValue = ASPECT_RATIO_VALUES[cropAspectRatio] ?? null;
        const originalAspect = orig.width / orig.height;
        const effectiveRatio = ratioValue || (lockCropAspect ? originalAspect : null);

        let newArea = resizeRectByHandle(
          orig,
          cropDragRef.current.resizeHandle,
          { dx, dy },
          {
            minWidth: 10,
            minHeight: 10,
            keepAspect: Boolean(effectiveRatio),
            targetAspect: effectiveRatio ?? undefined,
          }
        );

        if (!canvasExpandMode) {
          newArea = {
            x: Math.max(0, newArea.x),
            y: Math.max(0, newArea.y),
            width: Math.min(newArea.width, project.canvasSize.width - Math.max(0, newArea.x)),
            height: Math.min(newArea.height, project.canvasSize.height - Math.max(0, newArea.y)),
          };
        }

        setCropArea({
          x: Math.round(newArea.x),
          y: Math.round(newArea.y),
          width: Math.round(newArea.width),
          height: Math.round(newArea.height),
        });
        return;
      }
    }

    if (!isDraggingClip || !dragStateRef.current.clipId) return;

    const point = screenToProject(e.clientX, e.clientY);
    if (!point) return;

    const dragState = dragStateRef.current;
    const clipId = dragState.clipId;
    if (!clipId) return;
    const dx = point.x - dragState.pointerStart.x;
    const dy = point.y - dragState.pointerStart.y;
    updateClip(clipId, {
      position: {
        x: dragState.clipStart.x + dx,
        y: dragState.clipStart.y + dy,
      },
    });
  }, [vpUpdatePanDrag, screenToProject, canvasExpandMode, clampToCanvas, project.canvasSize.width, project.canvasSize.height, setCropArea, isDraggingClip, updateClip, screenToMaskCoords, continueDraw, toolMode, isEditingMask, previewContainerRef, transformTool, scheduleRender]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    stopPanDrag();

    if (isMaskRegionDraggingRef.current) {
      const rectDrag = maskRectDragRef.current;
      isMaskRegionDraggingRef.current = false;
      maskRectDragRef.current = null;

      if (rectDrag) {
        const region = createMaskRegionFromPoints(rectDrag.start, rectDrag.current);
        if (region.width < 2 || region.height < 2) {
          updateMaskRegion(null);
        } else {
          updateMaskRegion(region);
        }
      }

      scheduleRender();
    }

    if (isMaskDrawingRef.current) {
      endDraw();
      isMaskDrawingRef.current = false;
      clearMaskRegionClip();

      // Auto-save mask data after each stroke
      saveMaskData();

      // Restore brush mode if Alt was used
      if (prevBrushModeRef.current !== null) {
        setBrushMode(prevBrushModeRef.current);
        prevBrushModeRef.current = null;
      }

      scheduleRender();
    } else {
      clearMaskRegionClip();
    }

    if (e) {
      safeReleasePointerCapture(e.currentTarget, e.pointerId);
    }
    transformTool.handlePointerUp();
    dragStateRef.current = {
      clipId: null,
      pointerStart: { x: 0, y: 0 },
      clipStart: { x: 0, y: 0 },
    };
    setIsDraggingClip(false);
    originalCropAreaRef.current = null;
    cropDragRef.current = {
      mode: "none",
      pointerStart: { x: 0, y: 0 },
      cropStart: null,
      resizeHandle: null,
    };
    setIsDraggingCrop(false);

    // Remove crop if too small
    if (cropArea && (cropArea.width < 10 || cropArea.height < 10)) {
      setCropArea(null);
    }
  }, [stopPanDrag, endDraw, setBrushMode, saveMaskData, cropArea, setCropArea, transformTool, createMaskRegionFromPoints, clearMaskRegionClip, updateMaskRegion, scheduleRender]);

  // Render on playback tick (driven by RAF, not React state) — no re-renders
  usePlaybackTick((tickTime) => {
    const now = performance.now();
    const stats = playbackPerfRef.current;
    const previousTickTime = lastPlaybackTickTimeRef.current;
    lastPlaybackTickTimeRef.current = tickTime;

    // Loop wrap / playback seek can jump timeline backward between ticks.
    // Force immediate media sync instead of waiting for interval drift correction.
    if (
      playback.isPlaying &&
      previousTickTime !== null &&
      tickTime < previousTickTime - PLAYBACK.FRAME_STEP
    ) {
      syncMediaRef.current?.();
    }

    if (stats.lastTickMs > 0) {
      const tickDelta = now - stats.lastTickMs;
      const idealFrameMs = 1000 / Math.max(1, previewPerf.playbackRenderFpsCap);
      if (tickDelta > idealFrameMs * 1.75) {
        stats.longTickCount += 1;
      }
    }
    stats.lastTickMs = now;

    const minRenderIntervalMs = 1000 / Math.max(1, previewPerf.playbackRenderFpsCap);
    if (playback.isPlaying && now - stats.lastRenderMs < minRenderIntervalMs) {
      stats.skippedByCap += 1;
      maybeReportPlaybackStats(now);
      return;
    }

    stats.lastRenderMs = now;
    stats.renderedFrames += 1;
    renderRef.current();
    maybeReportPlaybackStats(now);
  });

  useEffect(() => {
    if (playback.isPlaying) return;
    playbackPerfRef.current = {
      windowStartMs: 0,
      lastTickMs: 0,
      lastRenderMs: 0,
      renderedFrames: 0,
      skippedByCap: 0,
      longTickCount: 0,
      cacheFrames: 0,
      liveFrames: 0,
    };
  }, [playback.isPlaying]);

  // Render on structural changes (tracks, clips, selection, etc.)
  useEffect(() => {
    renderRef.current();
  }, [
    playback.isPlaying,
    tracks,
    clips,
    masks,
    maskCanvasVersion,
    selectedClipIds,
    toolMode,
    cropArea,
    project.canvasSize,
    isEditingMask,
    activeTrackId,
    transformTool.state.isActive,
    transformTool.state.bounds,
  ]);

  // Invalidate CSS color cache on theme changes
  useEffect(() => {
    invalidateCssCache();
    renderRef.current();
  }, [invalidateCssCache]);

  // Re-render when viewport changes (zoom/pan)
  useEffect(() => {
    return onVideoViewportChange(() => {
      scheduleRender();
    });
  }, [onVideoViewportChange, scheduleRender]);

  // Handle resize — recalculate fit scale via viewport, then re-render
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const updateContainerRect = (width: number, height: number) => {
      containerRectRef.current = { width, height };
    };

    const initialRect = container.getBoundingClientRect();
    updateContainerRect(initialRect.width, initialRect.height);

    const resizeObserver = new ResizeObserver((entries) => {
      const observedRect = entries[0]?.contentRect;
      const width = observedRect?.width ?? containerRectRef.current.width;
      const height = observedRect?.height ?? containerRectRef.current.height;
      updateContainerRect(width, height);

      const { zoom, pan } = vpGetTransform();
      if (zoom === 1 && pan.x === 0 && pan.y === 0) {
        // Default view — fit to container
        vpFitToContainer(40);
      } else {
        // User has zoomed/panned — only update baseScale
        const padding = 40;
        const maxW = width - padding * 2;
        const maxH = height - padding * 2;
        const pw = project.canvasSize.width;
        const ph = project.canvasSize.height;
        if (maxW > 0 && maxH > 0 && pw > 0 && ph > 0) {
          vpSetBaseScale(Math.min(maxW / pw, maxH / ph));
        }
      }
      requestAnimationFrame(() => renderRef.current());
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [previewContainerRef, vpGetTransform, vpFitToContainer, vpSetBaseScale, project.canvasSize.width, project.canvasSize.height]);

  const handleFitToScreen = useCallback(() => {
    vpFitToContainer(40);
  }, [vpFitToContainer]);

  return (
    <div
      ref={containerRefCallback}
      data-video-preview-root=""
      className={cn("relative w-full h-full overflow-hidden focus:outline-none", className)}
      tabIndex={0}
      onPointerDownCapture={(e) => {
        e.currentTarget.focus();
      }}
    >
      <canvas
        ref={previewCanvasRef}
        className="absolute inset-0"
        tabIndex={0}
        style={{
          cursor: isPanningRef.current
            ? "grabbing"
            : isHandMode
              ? "grab"
              : isEditingMask
              ? (maskDrawShape === "rectangle" ? "crosshair" : "none")
              : isZoomTool
                  ? "zoom-in"
              : toolMode === "crop"
                ? (isDraggingCrop ? (cropDragRef.current.mode === "move" ? "grabbing" : cropCursor) : cropCursor)
                : toolMode === "transform"
                  ? transformTool.cursor
                  : (isDraggingClip ? "grabbing" : (toolMode === "select" ? "grab" : "default")),
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(e) => {
          handlePointerUp(e);
          setBrushCursor(null);
        }}
      />
      {/* Brush cursor preview */}
      {isEditingMask && maskDrawShape === "brush" && brushCursor && (() => {
        const scale = vpGetEffectiveScale();
        const displaySize = brushSettings.size * scale;
        return (
          <BrushCursorOverlay
            x={brushCursor.x}
            y={brushCursor.y}
            size={displaySize}
            hardness={brushSettings.hardness}
            color={brushSettings.mode === "erase" ? "#f87171" : "#ffffff"}
            isEraser={brushSettings.mode === "erase"}
          />
        );
      })()}
      {(previewPerf.draftMode || !previewPerf.preRenderEnabled) && (
        <div className="absolute bottom-2 left-2 rounded bg-surface-primary/80 px-2 py-1 text-[11px] text-text-secondary backdrop-blur-sm pointer-events-none">
          {previewPerf.draftMode ? "Draft" : "Full"} · PR {previewPerf.preRenderEnabled ? "On" : "Off"}
        </div>
      )}
      {/* Zoom indicator — shown when zoomed in/out */}
      {zoomPercent !== 100 && (
        <div className="absolute bottom-2 right-2 flex items-center gap-1.5 bg-surface-primary/80 backdrop-blur-sm rounded px-2 py-1 text-[11px] text-text-secondary pointer-events-auto">
          <span>{zoomPercent}%</span>
          <button
            onClick={handleFitToScreen}
            className="hover:text-text-primary transition-colors text-[10px] underline"
          >
            Fit
          </button>
        </div>
      )}
    </div>
  );
}
