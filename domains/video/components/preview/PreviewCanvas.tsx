"use client";

import { useRef, useEffect, useCallback, useState, useMemo } from "react";
import { useVideoState, useVideoRefs, useTimeline } from "../../contexts";
import {
  useVideoElements,
  usePreRenderCache,
  useAudioBufferCache,
  useWebAudioPlayback,
  useClipTransformTool,
} from "../../hooks";
import { cn } from "@/shared/utils/cn";
import {
  applyPixelPreviewScalePolicy,
  drawScaledImage,
  resizeCanvasForDpr,
  safeReleasePointerCapture,
  safeSetPointerCapture,
} from "@/shared/utils";
import { getCanvasColorsSync, useViewportZoomTool } from "@/shared/hooks";
import { PLAYBACK, PREVIEW, PRE_RENDER } from "../../constants";
import {
  Clip,
  VideoClip,
  VideoTrack,
  getClipPlaybackSpeed,
  getClipScaleX,
  getClipScaleY,
  getSourceTime,
} from "../../types";
import { useMask } from "../../contexts";
import { useMaskTool } from "../../hooks/useMaskTool";
import { useCanvasViewport } from "@/shared/hooks/useCanvasViewport";
import { resolvePreviewPerformanceConfig } from "../../utils/previewPerformance";
import { resolveClipPositionAtTimelineTime } from "../../utils/clipTransformKeyframes";
import { usePreviewFrameCapture } from "./usePreviewFrameCapture";
import { usePreviewViewportBridge } from "./usePreviewViewportBridge";
import { useMaskInteractionSession } from "./useMaskInteractionSession";
import { useCropInteractionSession } from "./useCropInteractionSession";
import { usePreviewMediaPlaybackSync } from "./usePreviewMediaPlaybackSync";
import { usePreviewMediaReadyRender } from "./usePreviewMediaReadyRender";
import { usePreviewPlaybackRenderTick } from "./usePreviewPlaybackRenderTick";
import { usePreviewResizeObserver } from "./usePreviewResizeObserver";
import { resolvePreviewCanvasCursor } from "./previewCanvasCursor";
import {
  drawCropOverlay,
  drawMaskRegionOverlay,
  drawTransformBoundsOverlay,
} from "./previewCanvasOverlayDrawing";
import { drawPreviewCheckerboard } from "./previewCheckerboard";
import { drawMaskedClipLayer } from "./previewMaskedClipDrawing";
import { PreviewCanvasOverlays } from "./PreviewCanvasOverlays";
import { usePreviewClipDragSession } from "./usePreviewClipDragSession";
import { usePreviewCoordinateHelpers } from "./usePreviewCoordinateHelpers";
import {
  getLoopFrameBounds,
  createPlaybackPerfStats,
  resetPlaybackPerfStatsWindow,
  countActiveVisualLayersAtTime,
} from "./previewPlaybackStats";
import {
  drawDab as drawBrushDab,
  drawLine as drawBrushLine,
  eraseDabLinear,
  eraseLineLinear,
  resetEraseAlphaCarry,
  resetPaintAlphaCarry,
} from "@/shared/utils/brushEngine";

interface PreviewCanvasProps {
  className?: string;
}

const SAMPLE_FRAME_EPSILON = 1e-6;
const INPAINT_BRUSH_SIZE = 44;
const INPAINT_BRUSH_HARDNESS = 80;
const INPAINT_STROKE_SPACING = Math.max(1, INPAINT_BRUSH_SIZE * 0.35);
type InpaintBrushMode = "paint" | "erase";

function resolveAdaptivePlaybackPreviewPolicy(params: {
  playbackIsPlaying: boolean;
  qualityFirstMode: boolean;
  clipCount: number;
  visualClipCount: number;
  baseMaxCanvasDpr: number;
  basePlaybackRenderFpsCap: number;
}): {
  maxCanvasDpr: number;
  playbackRenderFpsCap: number;
  smoothingQuality: ImageSmoothingQuality;
} {
  const {
    playbackIsPlaying,
    qualityFirstMode,
    clipCount,
    visualClipCount,
    baseMaxCanvasDpr,
    basePlaybackRenderFpsCap,
  } = params;

  if (!playbackIsPlaying || qualityFirstMode) {
    return {
      maxCanvasDpr: baseMaxCanvasDpr,
      playbackRenderFpsCap: basePlaybackRenderFpsCap,
      smoothingQuality: "high",
    };
  }

  const loadScore = Math.max(clipCount, visualClipCount * 1.5);

  if (loadScore >= 24) {
    return {
      maxCanvasDpr: 1,
      playbackRenderFpsCap: Math.min(basePlaybackRenderFpsCap, 24),
      smoothingQuality: "low",
    };
  }

  if (loadScore >= 12) {
    return {
      maxCanvasDpr: 1.25,
      playbackRenderFpsCap: Math.min(basePlaybackRenderFpsCap, 30),
      smoothingQuality: "medium",
    };
  }

  if (loadScore >= 6) {
    return {
      maxCanvasDpr: Math.min(baseMaxCanvasDpr, 1.5),
      playbackRenderFpsCap: Math.min(basePlaybackRenderFpsCap, 45),
      smoothingQuality: "medium",
    };
  }

  return {
    maxCanvasDpr: Math.min(baseMaxCanvasDpr, 2),
    playbackRenderFpsCap: basePlaybackRenderFpsCap,
    smoothingQuality: "high",
  };
}

function ensureRenderSurfaceCanvas(
  canvasRef: { current: HTMLCanvasElement | null },
  pixelWidth: number,
  pixelHeight: number,
): { canvas: HTMLCanvasElement; resized: boolean } {
  let canvas = canvasRef.current;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvasRef.current = canvas;
  }

  const nextWidth = Math.max(1, Math.round(pixelWidth));
  const nextHeight = Math.max(1, Math.round(pixelHeight));
  const resized = canvas.width !== nextWidth || canvas.height !== nextHeight;
  if (resized) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }

  return { canvas, resized };
}

interface DirectPreviewPlan {
  trackId: string;
  sourceKey: string;
}

function resolveDirectPreviewPlan(tracks: VideoTrack[], clips: Clip[], maskCount: number): DirectPreviewPlan | null {
  if (maskCount > 0) return null;

  const visibleVisualTracks = tracks.filter((track) => track.visible && track.type !== "audio");
  if (visibleVisualTracks.length !== 1) return null;

  const track = visibleVisualTracks[0];
  const trackClips = clips.filter((clip) => clip.trackId === track.id && clip.visible);
  if (trackClips.length === 0) return null;
  if (trackClips.some((clip) => clip.type !== "video")) return null;

  const videoClips = trackClips as VideoClip[];
  const sourceKey = videoClips[0].sourceId || videoClips[0].sourceUrl;
  if (!sourceKey) return null;
  if (videoClips.some((clip) => (clip.sourceId || clip.sourceUrl) !== sourceKey)) {
    return null;
  }

  return {
    trackId: track.id,
    sourceKey,
  };
}

export function PreviewCanvas({ className }: PreviewCanvasProps) {
  const {
    previewCanvasRef,
    previewContainerRef,
    previewViewportRef,
    compositingCanvasRef,
    videoElementsRef,
    audioElementsRef,
    inpaintMaskCanvasRef,
  } = useVideoRefs();
  const {
    playback,
    project,
    selectedClipIds,
    toolMode,
    selectClip,
    deselectAll,
    cropArea,
    setCropArea,
    canvasExpandMode,
    cropAspectRatio,
    lockCropAspect,
    previewPreRenderEnabled,
    previewQualityFirstEnabled,
    isPanLocked,
    isSpacePanning,
    autoKeyframeEnabled,
    currentTimeRef: stateTimeRef,
  } = useVideoState();
  const { tracks, clips, getClipAtTime, updateClip, saveToHistory } = useTimeline();
  const wasPlayingRef = useRef(false);
  const renderRequestRef = useRef(0);
  const renderRef = useRef<() => void>(() => {});
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const maskTempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewWorkingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const savedMaskImgCacheRef = useRef(new Map<string, HTMLImageElement>());
  const hasCommittedCompositeFrameRef = useRef(false);
  const directPreviewHostRef = useRef<HTMLDivElement | null>(null);
  const directPreviewAttachedVideoRef = useRef<HTMLVideoElement | null>(null);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);
  const [inpaintBrushMode, setInpaintBrushMode] = useState<InpaintBrushMode>("paint");
  const inpaintStrokeActiveRef = useRef(false);
  const inpaintLastPointRef = useRef<{ x: number; y: number } | null>(null);
  const inpaintStrokeModeRef = useRef<InpaintBrushMode>("paint");
  const previewPerfRef = useRef(resolvePreviewPerformanceConfig());
  const previewPerf = previewPerfRef.current;
  previewPerf.preRenderEnabled = previewPreRenderEnabled;
  previewPerf.qualityFirstMode = previewQualityFirstEnabled;
  previewPerf.maxCanvasDpr = previewQualityFirstEnabled ? Number.POSITIVE_INFINITY : 2;
  const playbackPerfRef = useRef(createPlaybackPerfStats());
  const visualClipCount = clips.filter((clip) => clip.type !== "audio").length;
  const adaptivePlaybackPreviewPolicy = resolveAdaptivePlaybackPreviewPolicy({
    playbackIsPlaying: playback.isPlaying,
    qualityFirstMode: previewPerf.qualityFirstMode,
    clipCount: clips.length,
    visualClipCount,
    baseMaxCanvasDpr: previewPerf.maxCanvasDpr,
    basePlaybackRenderFpsCap: previewPerf.playbackRenderFpsCap,
  });
  const syncMediaRef = useRef<(() => void) | null>(null);
  const syncMediaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPlaybackTickTimeRef = useRef<number | null>(null);
  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(renderRequestRef.current);
    renderRequestRef.current = requestAnimationFrame(() => renderRef.current());
  }, []);

  const detachDirectPreviewVideo = useCallback(() => {
    const host = directPreviewHostRef.current;
    const attachedVideo = directPreviewAttachedVideoRef.current;
    if (host && attachedVideo && attachedVideo.parentElement === host) {
      host.removeChild(attachedVideo);
    }
    directPreviewAttachedVideoRef.current = null;
    if (host) {
      host.style.display = "none";
    }
  }, []);

  useEffect(() => {
    const handleInpaintRegionUpdate = () => {
      scheduleRender();
    };
    window.addEventListener("artkit:inpaint-region-updated", handleInpaintRegionUpdate);
    return () => {
      window.removeEventListener("artkit:inpaint-region-updated", handleInpaintRegionUpdate);
    };
  }, [scheduleRender]);

  useEffect(() => {
    return () => {
      detachDirectPreviewVideo();
    };
  }, [detachDirectPreviewVideo]);

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
  const directPreviewPlan = useMemo(
    () => resolveDirectPreviewPlan(tracks, clips, masks.size),
    [tracks, clips, masks.size]
  );

  const isHandTool = toolMode === "hand";
  const isZoomTool = toolMode === "zoom";
  const isHandMode = isHandTool || isSpacePanning;
  const isInpaintMode = toolMode === "inpaint";

  const ensureInpaintMaskCanvas = useCallback((): HTMLCanvasElement | null => {
    const targetWidth = Math.max(1, Math.floor(project.canvasSize.width));
    const targetHeight = Math.max(1, Math.floor(project.canvasSize.height));
    if (targetWidth <= 0 || targetHeight <= 0) return null;

    let canvas = inpaintMaskCanvasRef.current;
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = targetWidth;
      canvas.height = targetHeight;
      inpaintMaskCanvasRef.current = canvas;
      return canvas;
    }

    if (canvas.width === targetWidth && canvas.height === targetHeight) {
      return canvas;
    }

    const resized = document.createElement("canvas");
    resized.width = targetWidth;
    resized.height = targetHeight;
    const resizedCtx = resized.getContext("2d");
    if (resizedCtx) {
      resizedCtx.clearRect(0, 0, targetWidth, targetHeight);
      resizedCtx.drawImage(canvas, 0, 0, targetWidth, targetHeight);
    }
    inpaintMaskCanvasRef.current = resized;
    return resized;
  }, [inpaintMaskCanvasRef, project.canvasSize.height, project.canvasSize.width]);

  useEffect(() => {
    ensureInpaintMaskCanvas();
  }, [ensureInpaintMaskCanvas]);

  // Shared viewport hook — fitOnMount auto-calculates baseScale
  const viewport = useCanvasViewport({
    containerRef: previewContainerRef,
    canvasRef: previewCanvasRef,
    contentSize: project.canvasSize,
    config: { origin: "center", minZoom: PREVIEW.MIN_ZOOM, maxZoom: PREVIEW.MAX_ZOOM },
    fitOnMount: true,
    fitPadding: PREVIEW.FIT_PADDING,
    enableWheel: true,
    enablePinch: true,
    coordinateSpace: "container",
  });
  const isPanningRef = useRef(false);
  const containerRectRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const { zoom: viewportZoom, baseScale: viewportBaseScale } = viewport.useReactSync(200);
  const zoomPercent = Math.round(
    (viewportBaseScale > 0 ? viewportZoom * viewportBaseScale : viewportZoom) * 100
  );

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

  const preventAndCapturePointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    safeSetPointerCapture(e.currentTarget, e.pointerId);
  }, []);

  const startPanDragFromPointer = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    preventAndCapturePointer(e);
    vpStartPanDrag({ x: e.clientX, y: e.clientY });
    isPanningRef.current = true;
  }, [preventAndCapturePointer, vpStartPanDrag]);

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
    debugLogs: previewPerf.debugLogs,
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
    previewPerf.debugLogs,
    previewPerf.draftMode,
    previewPerf.preRenderEnabled,
    previewPerf.qualityFirstMode,
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

    const activeVisualLayers = countActiveVisualLayersAtTime(
      tracks,
      getClipAtTime,
      currentTimeRef.current,
    );
    const visibleClipCount = clips.filter((clip) => clip.visible).length;
    const videoClipCount = clips.filter((clip) => clip.type === "video").length;
    const audioClipCount = clips.filter((clip) => clip.type === "audio").length;
    const visualClipCount = clips.filter((clip) => clip.type !== "audio").length;

    console.info("[VideoPreviewPerf]", {
      draftMode: previewPerf.draftMode,
      preRenderEnabled: previewPerf.preRenderEnabled,
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
    previewPerf.debugLogs,
    previewPerf.draftMode,
    previewPerf.preRenderEnabled,
    playback.isPlaying,
    clips,
    tracks,
    getClipAtTime,
    currentTimeRef,
  ]);

  const resetPlaybackPerfStats = useCallback(() => {
    playbackPerfRef.current = createPlaybackPerfStats();
  }, []);

  usePreviewMediaPlaybackSync({
    clips,
    tracks,
    playback,
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

    let width = containerRectRef.current.width;
    let height = containerRectRef.current.height;
    if (width <= 0 || height <= 0) {
      const rect = container.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      containerRectRef.current = { width, height };
    }

    // Set canvas size with DPI scaling
    const canvasSize = resizeCanvasForDpr(canvas, ctx, width, height, {
      maxDevicePixelRatio: adaptivePlaybackPreviewPolicy.maxCanvasDpr,
      scaleContext: true,
    });
    width = canvasSize.width;
    height = canvasSize.height;
    if (width <= 0 || height <= 0) return;
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

    const { canvas: committedCompositeCanvas, resized: committedCanvasResized } =
      ensureRenderSurfaceCanvas(compositingCanvasRef, canvasSize.pixelWidth, canvasSize.pixelHeight);
    const committedCompositeCtx = committedCompositeCanvas.getContext("2d");
    const { canvas: workingCompositeCanvas } =
      ensureRenderSurfaceCanvas(previewWorkingCanvasRef, canvasSize.pixelWidth, canvasSize.pixelHeight);
    const workingCompositeCtx = workingCompositeCanvas.getContext("2d");
    if (!committedCompositeCtx || !workingCompositeCtx) return;

    if (committedCanvasResized) {
      hasCommittedCompositeFrameRef.current = false;
    }

    workingCompositeCtx.setTransform(canvasSize.dpr, 0, 0, canvasSize.dpr, 0, 0);
    workingCompositeCtx.clearRect(0, 0, width, height);
    workingCompositeCtx.fillStyle = surfacePrimary;
    workingCompositeCtx.fillRect(0, 0, width, height);

    // Calculate preview area from shared viewport transform
    const projectWidth = project.canvasSize.width;
    const projectHeight = project.canvasSize.height;
    const scale = vpGetEffectiveScale();
    const renderOffset = vpGetRenderOffset();
    const previewWidth = projectWidth * scale;
    const previewHeight = projectHeight * scale;
    const offsetX = renderOffset.x;
    const offsetY = renderOffset.y;
    const previewScalePolicy = applyPixelPreviewScalePolicy(workingCompositeCtx, scale);
    const selectedVisualClipId = selectedClipIds.find((clipId) => {
      const selected = clips.find((clip) => clip.id === clipId);
      return !!selected && selected.type !== "audio";
    }) || null;
    const directPreviewHost = directPreviewHostRef.current;
    let usesDirectVideoPreview = false;

    if (directPreviewPlan && directPreviewHost) {
      const activeClip = getClipAtTime(directPreviewPlan.trackId, renderTime);
      const directVideoClip = activeClip && activeClip.type === "video" ? activeClip : null;
      const directVideoElement = directVideoClip
        ? videoElementsRef.current.get(directVideoClip.id) || null
        : null;

      if (directVideoClip && directVideoElement && directVideoElement.readyState >= 1) {
        usesDirectVideoPreview = true;
        if (directPreviewAttachedVideoRef.current !== directVideoElement) {
          directPreviewHost.replaceChildren(directVideoElement);
          directPreviewAttachedVideoRef.current = directVideoElement;
        }

        const directSourceTime = getSourceTime(directVideoClip, renderTime);
        if (playback.isPlaying) {
          if (Math.abs(directVideoElement.currentTime - directSourceTime) > PLAYBACK.SEEK_DRIFT_THRESHOLD) {
            directVideoElement.currentTime = directSourceTime;
          }
          directVideoElement.playbackRate = playback.playbackRate * getClipPlaybackSpeed(directVideoClip);
          if (directVideoElement.paused) {
            directVideoElement.play().catch(() => {});
          }
        } else {
          if (Math.abs(directVideoElement.currentTime - directSourceTime) > 0.05) {
            directVideoElement.currentTime = directSourceTime;
          }
          directVideoElement.pause();
        }
        directVideoElement.muted = true;
        directVideoElement.volume = 0;

        const clipPosition = resolveClipPositionAtTimelineTime(directVideoClip, renderTime);
        const drawPoint = vpContentToScreen(clipPosition);
        const drawW = directVideoClip.sourceSize.width * scale * getClipScaleX(directVideoClip);
        const drawH = directVideoClip.sourceSize.height * scale * getClipScaleY(directVideoClip);
        const rotation = directVideoClip.rotation || 0;

        directPreviewHost.style.display = "block";
        directPreviewHost.style.position = "absolute";
        directPreviewHost.style.inset = "0";
        directPreviewHost.style.pointerEvents = "none";
        directPreviewHost.style.overflow = "hidden";

        directVideoElement.style.position = "absolute";
        directVideoElement.style.left = `${drawPoint.x}px`;
        directVideoElement.style.top = `${drawPoint.y}px`;
        directVideoElement.style.width = `${drawW}px`;
        directVideoElement.style.height = `${drawH}px`;
        directVideoElement.style.opacity = `${Math.max(0, Math.min(1, directVideoClip.opacity / 100))}`;
        directVideoElement.style.objectFit = "fill";
        directVideoElement.style.pointerEvents = "none";
        directVideoElement.style.transformOrigin = "center center";
        directVideoElement.style.transform = rotation === 0 ? "none" : `rotate(${rotation}deg)`;
      } else {
        detachDirectPreviewVideo();
      }
    } else {
      detachDirectPreviewVideo();
    }

    if (!usesDirectVideoPreview) {
      // Draw checkerboard for transparency
      workingCompositeCtx.save();
      workingCompositeCtx.beginPath();
      workingCompositeCtx.rect(offsetX, offsetY, previewWidth, previewHeight);
      workingCompositeCtx.clip();
      drawPreviewCheckerboard({
        ctx: workingCompositeCtx,
        width,
        height,
        isDraftMode: previewPerfRef.current.draftMode,
        cache: {
          patternRef: checkerPatternRef,
          patternKeyRef: checkerPatternKeyRef,
          patternCanvasRef: checkerPatternCanvasRef,
        },
      });
      workingCompositeCtx.restore();
    }

    // Try cached frame first (any state — instant display on seek/scrub)
    // Skip cache during mask editing — cached frames don't include live mask
    // overlay or edits, so they would hide the mask completely.
    // Skip cache when mask is active (editing or selected) — overlay needs live rendering
    const cachedBitmap = usesDirectVideoPreview || (isEditingMask || activeMaskId)
      ? null
      : getCachedFrame(renderTime);

    let baseFrameReady = usesDirectVideoPreview || Boolean(cachedBitmap);

    if (usesDirectVideoPreview) {
      workingCompositeCtx.clearRect(0, 0, width, height);
    } else if (cachedBitmap) {
      if (playback.isPlaying) {
        playbackPerfRef.current.cacheFrames += 1;
      }
      // Use pre-rendered cached frame — skip per-track compositing
      drawScaledImage(
        workingCompositeCtx,
        cachedBitmap,
        { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
        {
          mode: previewScalePolicy.mode,
          progressiveMinify: !playback.isPlaying,
          smoothingQuality: adaptivePlaybackPreviewPolicy.smoothingQuality,
        },
      );
    } else {
      if (playback.isPlaying) {
        playbackPerfRef.current.liveFrames += 1;
      }
      baseFrameReady = true;
      // Draw bottom track first (background), top track last (foreground).
      // Use array order directly — tracks[0] is the topmost track in the timeline.
      const sortedTracks = [...tracks].reverse();

      // Composite each track
      for (const track of sortedTracks) {
        if (!track.visible) continue;

        const clip = getClipAtTime(track.id, renderTime);
        if (!clip || !clip.visible) continue;

        // Get the video/image element for this clip
        const videoElement = videoElementsRef.current.get(clip.id);

        // Determine source element
        let sourceEl: CanvasImageSource | null = null;

        if (clip.type === "video") {
          if (!videoElement || videoElement.readyState < 2) {
            baseFrameReady = false;
            continue;
          }
          const sourceTime = getSourceTime(clip, renderTime);
          if (
            playback.isPlaying
            && Math.abs(videoElement.currentTime - sourceTime) > PLAYBACK.SEEK_DRIFT_THRESHOLD * 1.25
          ) {
            baseFrameReady = false;
            continue;
          }
          if (!playback.isPlaying) {
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
          } else {
            baseFrameReady = false;
          }
        }

        if (sourceEl) {
          const clipPosition = resolveClipPositionAtTimelineTime(clip, renderTime);
          const drawPoint = vpContentToScreen(clipPosition);
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
            } else {
              baseFrameReady = false;
            }
          }

          if (clipMaskSource) {
            const overlayTint = activeTrackId === clip.trackId && activeMaskId
              ? isEditingMask
                ? "rgba(255, 60, 60, 0.35)"
                : "rgba(168, 85, 247, 0.3)"
              : null;
            drawMaskedClipLayer({
              ctx: workingCompositeCtx,
              sourceEl,
              clipMaskSource,
              clipProjectRect: {
                x: clipPosition.x,
                y: clipPosition.y,
                width: clip.sourceSize.width * getClipScaleX(clip),
                height: clip.sourceSize.height * getClipScaleY(clip),
              },
              projectSize: project.canvasSize,
              previewRect: { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
              clipOpacity: clip.opacity / 100,
              progressiveMinify: !playback.isPlaying,
              previewScaleMode: previewScalePolicy.mode,
              smoothingQuality: adaptivePlaybackPreviewPolicy.smoothingQuality,
              maskTempCanvasRef,
              maskOverlayCanvasRef,
              overlayTint,
            });
          } else {
            workingCompositeCtx.globalAlpha = clip.opacity / 100;
            drawScaledImage(
              workingCompositeCtx,
              sourceEl,
              { x: drawX, y: drawY, width: drawW, height: drawH },
              {
                mode: previewScalePolicy.mode,
                progressiveMinify: !playback.isPlaying,
                smoothingQuality: adaptivePlaybackPreviewPolicy.smoothingQuality,
              },
            );
            workingCompositeCtx.globalAlpha = 1;
          }
        }
      }
    }

    if (!usesDirectVideoPreview && (baseFrameReady || !playback.isPlaying)) {
      committedCompositeCtx.setTransform(1, 0, 0, 1, 0, 0);
      committedCompositeCtx.clearRect(0, 0, committedCompositeCanvas.width, committedCompositeCanvas.height);
      committedCompositeCtx.drawImage(workingCompositeCanvas, 0, 0);
      hasCommittedCompositeFrameRef.current = true;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!usesDirectVideoPreview) {
      const baseCanvasToPresent =
        playback.isPlaying && !baseFrameReady && hasCommittedCompositeFrameRef.current
          ? committedCompositeCanvas
          : workingCompositeCanvas;
      ctx.drawImage(baseCanvasToPresent, 0, 0);
    }
    ctx.setTransform(canvasSize.dpr, 0, 0, canvasSize.dpr, 0, 0);

    if (
      selectedVisualClipId
      && !(toolMode === "transform" && transformTool.state.isActive)
    ) {
      const selectedVisualClip = clips.find((clip) => clip.id === selectedVisualClipId);
      if (selectedVisualClip && selectedVisualClip.type !== "audio") {
        const clipPosition = resolveClipPositionAtTimelineTime(selectedVisualClip, renderTime);
        const boxPoint = vpContentToScreen(clipPosition);
        const boxX = boxPoint.x;
        const boxY = boxPoint.y;
        const boxW = selectedVisualClip.sourceSize.width * scale * getClipScaleX(selectedVisualClip);
        const boxH = selectedVisualClip.sourceSize.height * scale * getClipScaleY(selectedVisualClip);

        ctx.save();
        if (selectedVisualClip.rotation !== 0) {
          const centerX = boxX + boxW / 2;
          const centerY = boxY + boxH / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((selectedVisualClip.rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }
        ctx.strokeStyle = colors.selection;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.restore();
      }
    }

    if (toolMode === "crop") {
      const activeCrop = cropArea || {
        x: 0,
        y: 0,
        width: project.canvasSize.width,
        height: project.canvasSize.height,
      };
      drawCropOverlay({
        ctx,
        activeCrop,
        scale,
        offsetX,
        offsetY,
        previewWidth,
        previewHeight,
        colors: {
          selection: colors.selection,
          overlay: colors.overlay,
          grid: colors.grid,
        },
        contentToScreen: vpContentToScreen,
      });
    }

    if (toolMode === "transform" && transformTool.state.isActive && transformTool.state.bounds) {
      drawTransformBoundsOverlay({
        ctx,
        bounds: transformTool.state.bounds,
        scale,
        colors: {
          selection: colors.selection,
          textOnColor: colors.textOnColor,
        },
        contentToScreen: vpContentToScreen,
      });
    }

    if (isEditingMask) {
      const visibleMaskRegion = getVisibleMaskRegion();
      if (visibleMaskRegion) {
        drawMaskRegionOverlay({
          ctx,
          region: visibleMaskRegion.region,
          isDragging: visibleMaskRegion.isDragging,
          scale,
          contentToScreen: vpContentToScreen,
        });
      }
    }

    if (isInpaintMode) {
      const inpaintMaskCanvas = ensureInpaintMaskCanvas();
      if (inpaintMaskCanvas) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(offsetX, offsetY, previewWidth, previewHeight);
        ctx.clip();
        ctx.globalAlpha = 0.38;
        drawScaledImage(
          ctx,
          inpaintMaskCanvas,
          { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
          {
            mode: previewScalePolicy.mode,
            progressiveMinify: !playback.isPlaying,
            smoothingQuality: adaptivePlaybackPreviewPolicy.smoothingQuality,
          },
        );
        ctx.globalCompositeOperation = "source-atop";
        ctx.fillStyle = "rgba(255, 109, 74, 0.95)";
        ctx.fillRect(offsetX, offsetY, previewWidth, previewHeight);
        ctx.restore();
      }
    }

    // Draw frame border
    ctx.strokeStyle = borderDefault;
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
  };

  const { clampToCanvas, screenToProject, screenToMaskCoords, hitTestClipAtPoint } = usePreviewCoordinateHelpers({
    projectSize: project.canvasSize,
    previewContainerRef,
    vpScreenToContent,
    tracks,
    getClipAtTime,
    currentTimeRef,
  });

  const getInpaintPointFromClient = useCallback((clientX: number, clientY: number) => {
    const projectPoint = screenToProject(clientX, clientY, true);
    if (!projectPoint) return null;
    return clampToCanvas(projectPoint);
  }, [screenToProject, clampToCanvas]);

  const drawInpaintDab = useCallback((
    ctx: CanvasRenderingContext2D,
    point: { x: number; y: number },
    mode: InpaintBrushMode
  ) => {
    const radius = INPAINT_BRUSH_SIZE / 2;
    const hardness = INPAINT_BRUSH_HARDNESS / 100;
    if (mode === "erase") {
      eraseDabLinear(ctx, {
        x: point.x,
        y: point.y,
        radius,
        hardness,
        alpha: 1,
      });
      return;
    }

    drawBrushDab(ctx, {
      x: point.x,
      y: point.y,
      radius,
      hardness,
      color: "#ffffff",
      alpha: 1,
      isEraser: false,
    });
  }, []);

  const drawInpaintLine = useCallback((
    ctx: CanvasRenderingContext2D,
    from: { x: number; y: number },
    to: { x: number; y: number },
    mode: InpaintBrushMode
  ) => {
    const radius = INPAINT_BRUSH_SIZE / 2;
    const hardness = INPAINT_BRUSH_HARDNESS / 100;
    if (mode === "erase") {
      eraseLineLinear(ctx, {
        from,
        to,
        spacing: INPAINT_STROKE_SPACING,
        dab: {
          radius,
          hardness,
          alpha: 1,
        },
      });
      return;
    }

    drawBrushLine(ctx, {
      from,
      to,
      spacing: INPAINT_STROKE_SPACING,
      dab: {
        radius,
        hardness,
        color: "#ffffff",
        alpha: 1,
        isEraser: false,
      },
    });
  }, []);

  const handleInpaintPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isInpaintMode || e.button !== 0) return false;
    const point = getInpaintPointFromClient(e.clientX, e.clientY);
    if (!point) return false;

    const canvas = ensureInpaintMaskCanvas();
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return false;

    const mode: InpaintBrushMode = e.altKey ? "erase" : "paint";
    inpaintStrokeModeRef.current = mode;
    setInpaintBrushMode(mode);
    inpaintStrokeActiveRef.current = true;
    inpaintLastPointRef.current = point;

    if (mode === "erase") {
      resetEraseAlphaCarry(ctx);
    } else {
      resetPaintAlphaCarry(ctx);
    }
    drawInpaintDab(ctx, point, mode);
    scheduleRender();
    return true;
  }, [isInpaintMode, getInpaintPointFromClient, ensureInpaintMaskCanvas, drawInpaintDab, scheduleRender]);

  const handleInpaintPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>): boolean => {
    if (!isInpaintMode) return false;

    const mode: InpaintBrushMode = e.altKey ? "erase" : "paint";
    setInpaintBrushMode((prev) => (prev === mode ? prev : mode));

    if (!inpaintStrokeActiveRef.current) {
      return false;
    }

    const point = getInpaintPointFromClient(e.clientX, e.clientY);
    if (!point) return true;

    const canvas = ensureInpaintMaskCanvas();
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return true;

    const strokeMode = inpaintStrokeModeRef.current;
    if (inpaintLastPointRef.current) {
      drawInpaintLine(ctx, inpaintLastPointRef.current, point, strokeMode);
    } else {
      drawInpaintDab(ctx, point, strokeMode);
    }
    inpaintLastPointRef.current = point;
    scheduleRender();
    return true;
  }, [isInpaintMode, getInpaintPointFromClient, ensureInpaintMaskCanvas, drawInpaintLine, drawInpaintDab, scheduleRender]);

  const stopInpaintStroke = useCallback(() => {
    inpaintStrokeActiveRef.current = false;
    inpaintLastPointRef.current = null;
  }, []);

  const transformTool = useClipTransformTool({
    clips,
    selectedClipIds,
    toolMode,
    selectClip,
    updateClip,
    saveToHistory,
    getCurrentTimelineTime: () => currentTimeRef.current,
    autoKeyframeEnabled,
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
    vpFitToContainer(PREVIEW.FIT_PADDING);
  }, [vpFitToContainer]);
  usePreviewViewportBridge({
    previewViewportRef,
    onViewportChange: onVideoViewportChange,
    getZoom: vpGetZoom,
    setZoom: vpSetZoom,
    getEffectiveScale: vpGetEffectiveScale,
    fitToContainer: fitViewportToContainer,
    transformTool,
    captureCompositeFrame,
  });

  const {
    clearMaskRegionSelection,
    getVisibleMaskRegion,
    handleMaskPointerDown,
    handleMaskPointerMove,
    handleMaskPointerUp,
  } = useMaskInteractionSession({
    isEditingMask,
    activeTrackId,
    maskDrawShape,
    brushMode: brushSettings.mode,
    maskCanvasRef: maskContextCanvasRef,
    maskRegion,
    setMaskRegion,
    setBrushMode,
    screenToMaskCoords,
    startDraw,
    continueDraw,
    endDraw,
    saveMaskData,
    saveMaskHistoryPoint,
    scheduleRender,
  });

  useEffect(() => {
    const shouldClearMaskRegion = !isEditingMask || maskRegionClearRequestId > 0 || Boolean(activeMaskId);
    if (!shouldClearMaskRegion) return;
    clearMaskRegionSelection();
  }, [isEditingMask, maskRegionClearRequestId, activeMaskId, clearMaskRegionSelection]);

  const {
    cropCursor,
    cropDragMode,
    isDraggingCrop,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
  } = useCropInteractionSession({
    isCropMode: toolMode === "crop",
    cropArea,
    setCropArea,
    cropAspectRatio,
    lockCropAspect,
    canvasExpandMode,
    canvasWidth: project.canvasSize.width,
    canvasHeight: project.canvasSize.height,
    screenToProject,
    clampToCanvas,
  });

  const { isDraggingClip, handleClipPointerDown, handleClipPointerMove, handleClipPointerUp } = usePreviewClipDragSession({
    toolMode,
    autoKeyframeEnabled,
    currentTimeRef,
    screenToProject,
    hitTestClipAtPoint,
    saveToHistory,
    selectClip,
    deselectAll,
    updateClip,
    scheduleRender,
  });

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.focus();

    // Middle mouse button drag for pan
    if (e.button === 1) {
      startPanDragFromPointer(e);
      return;
    }

    const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
    if (isTouchPanOnlyInput && e.button === 0) {
      startPanDragFromPointer(e);
      return;
    }

    if (isZoomTool) {
      if (e.button !== 0) return;
      e.preventDefault();
      zoomAtClientPoint(e.clientX, e.clientY, e.altKey);
      return;
    }

    if (isHandMode && e.button === 0) {
      startPanDragFromPointer(e);
      return;
    }

    if (handleInpaintPointerDown(e)) {
      preventAndCapturePointer(e);
      return;
    }

    if (isEditingMask && activeTrackId) {
      const handledMask = handleMaskPointerDown(e);
      if (handledMask) {
        preventAndCapturePointer(e);
      }
      return;
    }

    if (handleCropPointerDown(e)) {
      preventAndCapturePointer(e);
      return;
    }

    if (toolMode === "transform") {
      const handled = transformTool.handlePointerDown(e);
      if (handled) {
        preventAndCapturePointer(e);
      }
      return;
    }

    if (handleClipPointerDown(e)) {
      preventAndCapturePointer(e);
    }
  }, [
    startPanDragFromPointer,
    isPanLocked,
    isZoomTool,
    zoomAtClientPoint,
    isHandMode,
    handleInpaintPointerDown,
    isEditingMask,
    activeTrackId,
    handleMaskPointerDown,
    toolMode,
    handleCropPointerDown,
    handleClipPointerDown,
    preventAndCapturePointer,
    transformTool,
  ]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Middle mouse button pan
    if (isPanningRef.current) {
      vpUpdatePanDrag({ x: e.clientX, y: e.clientY });
      return;
    }

    // Update brush cursor position for mask/inpaint brush tools
    if (isEditingMask || isInpaintMode) {
      const container = previewContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }

    if (handleInpaintPointerMove(e)) {
      return;
    }

    if (handleMaskPointerMove(e)) {
      return;
    }

    if (toolMode === "transform") {
      const handled = transformTool.handlePointerMove(e);
      if (handled) {
        scheduleRender();
      }
      return;
    }

    if (handleCropPointerMove(e)) {
      return;
    }

    handleClipPointerMove(e);
  }, [
    vpUpdatePanDrag,
    toolMode,
    isEditingMask,
    isInpaintMode,
    previewContainerRef,
    transformTool,
    handleInpaintPointerMove,
    handleMaskPointerMove,
    handleCropPointerMove,
    handleClipPointerMove,
  ]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    stopPanDrag();
    stopInpaintStroke();
    handleMaskPointerUp();

    if (e) {
      safeReleasePointerCapture(e.currentTarget, e.pointerId);
    }
    transformTool.handlePointerUp();
    handleClipPointerUp();
    handleCropPointerUp();
  }, [stopPanDrag, stopInpaintStroke, handleMaskPointerUp, transformTool, handleClipPointerUp, handleCropPointerUp]);

  usePreviewPlaybackRenderTick({
    playbackIsPlaying: playback.isPlaying,
    playbackRenderFpsCap: adaptivePlaybackPreviewPolicy.playbackRenderFpsCap,
    playbackPerfRef,
    lastPlaybackTickTimeRef,
    syncMediaRef,
    renderRef,
    maybeReportPlaybackStats,
    resetPlaybackPerfStats,
  });

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

  usePreviewResizeObserver({
    previewContainerRef,
    containerRectRef,
    getTransform: vpGetTransform,
    fitToContainer: vpFitToContainer,
    setBaseScale: vpSetBaseScale,
    projectCanvasSize: project.canvasSize,
    renderRef,
  });

  const canvasCursor = resolvePreviewCanvasCursor({
    isPanning: isPanningRef.current,
    isHandMode,
    isEditingMask,
    isInpaintMode,
    maskDrawShape,
    isZoomTool,
    toolMode,
    isDraggingCrop,
    cropDragMode,
    cropCursor,
    transformCursor: transformTool.cursor,
    isDraggingClip,
  });
  const brushDisplaySize = (isInpaintMode ? INPAINT_BRUSH_SIZE : brushSettings.size) * vpGetEffectiveScale();
  const brushHardness = isInpaintMode ? INPAINT_BRUSH_HARDNESS : brushSettings.hardness;
  const brushMode = isInpaintMode ? inpaintBrushMode : brushSettings.mode;

  return (
    <div
      ref={containerRefCallback}
      data-video-preview-root=""
      className={cn("relative w-full h-full overflow-hidden focus:outline-none bg-[var(--surface-primary)]", className)}
      tabIndex={0}
      onPointerDownCapture={(e) => {
        e.currentTarget.focus();
      }}
    >
      <div
        ref={directPreviewHostRef}
        className="absolute inset-0 pointer-events-none"
        style={{ display: "none" }}
      />
      <canvas
        ref={previewCanvasRef}
        className="absolute inset-0 z-10"
        tabIndex={0}
        style={{
          cursor: canvasCursor,
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={() => {
          setBrushCursor(null);
        }}
      />
      <PreviewCanvasOverlays
        isEditingMask={isEditingMask}
        isInpaintMode={isInpaintMode}
        maskDrawShape={maskDrawShape}
        brushCursor={brushCursor}
        brushDisplaySize={brushDisplaySize}
        brushHardness={brushHardness}
        brushMode={brushMode}
        draftMode={previewPerf.draftMode}
        preRenderEnabled={previewPerf.preRenderEnabled}
        zoomPercent={zoomPercent}
      />
    </div>
  );
}
