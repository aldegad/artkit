"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useVideoState, useVideoRefs, useTimeline } from "../../contexts";
import {
  useVideoElements,
  usePreRenderCache,
  useAudioBufferCache,
  useWebAudioPlayback,
  useClipTransformTool,
} from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { drawScaledImage, safeReleasePointerCapture, safeSetPointerCapture } from "@/shared/utils";
import { getCanvasColorsSync, useViewportZoomTool } from "@/shared/hooks";
import { PREVIEW, PRE_RENDER } from "../../constants";
import { getClipScaleX, getClipScaleY } from "../../types";
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
import { PreviewCanvasOverlays } from "./PreviewCanvasOverlays";
import { usePreviewClipDragSession } from "./usePreviewClipDragSession";
import { usePreviewCoordinateHelpers } from "./usePreviewCoordinateHelpers";
import {
  getLoopFrameBounds,
  createPlaybackPerfStats,
  resetPlaybackPerfStatsWindow,
  countActiveVisualLayersAtTime,
} from "./previewPlaybackStats";

interface PreviewCanvasProps {
  className?: string;
}

const SAMPLE_FRAME_EPSILON = 1e-6;

function getEightResizeHandles(x: number, y: number, width: number, height: number): Array<{ x: number; y: number }> {
  return [
    { x, y },
    { x: x + width / 2, y },
    { x: x + width, y },
    { x: x + width, y: y + height / 2 },
    { x: x + width, y: y + height },
    { x: x + width / 2, y: y + height },
    { x, y: y + height },
    { x, y: y + height / 2 },
  ];
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
  const savedMaskImgCacheRef = useRef(new Map<string, HTMLImageElement>());
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);
  const previewPerfRef = useRef(resolvePreviewPerformanceConfig());
  const previewPerf = previewPerfRef.current;
  previewPerf.preRenderEnabled = previewPreRenderEnabled;
  const playbackPerfRef = useRef(createPlaybackPerfStats());
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

    const activeVisualLayers = countActiveVisualLayersAtTime(
      tracks,
      getClipAtTime,
      currentTimeRef.current,
    );

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
    resetPlaybackPerfStatsWindow(stats);
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
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
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
      drawScaledImage(
        ctx,
        cachedBitmap,
        { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
        { mode: "continuous", progressiveMinify: !playback.isPlaying },
      );
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
              tmpCtx.imageSmoothingEnabled = true;
              tmpCtx.imageSmoothingQuality = "high";
              tmpCtx.clearRect(0, 0, maskW, maskH);
              tmpCtx.globalCompositeOperation = "source-over";
              tmpCtx.globalAlpha = 1;
              // Draw clip at its position within the project canvas
              drawScaledImage(
                tmpCtx,
                sourceEl,
                {
                  x: clipPosition.x,
                  y: clipPosition.y,
                  width: clip.sourceSize.width * getClipScaleX(clip),
                  height: clip.sourceSize.height * getClipScaleY(clip),
                },
                { mode: "continuous", progressiveMinify: !playback.isPlaying },
              );
              tmpCtx.globalCompositeOperation = "destination-in";
              drawScaledImage(
                tmpCtx,
                clipMaskSource,
                { x: 0, y: 0, width: maskW, height: maskH },
                { mode: "continuous" },
              );
              tmpCtx.globalCompositeOperation = "source-over";

              ctx.globalAlpha = clip.opacity / 100;
              drawScaledImage(
                ctx,
                tmpCanvas,
                { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
                { mode: "continuous", progressiveMinify: !playback.isPlaying },
              );
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
                overlayCtx.imageSmoothingEnabled = true;
                overlayCtx.imageSmoothingQuality = "high";
                overlayCtx.clearRect(0, 0, maskW, maskH);
                overlayCtx.globalCompositeOperation = "source-over";
                drawScaledImage(
                  overlayCtx,
                  clipMaskSource,
                  { x: 0, y: 0, width: maskW, height: maskH },
                  { mode: "continuous" },
                );
                // Tint: red when editing, purple when selected
                overlayCtx.globalCompositeOperation = "source-in";
                overlayCtx.fillStyle = isEditingMask
                  ? "rgba(255, 60, 60, 0.35)"
                  : "rgba(168, 85, 247, 0.3)";
                overlayCtx.fillRect(0, 0, maskW, maskH);

                drawScaledImage(
                  ctx,
                  overlayCanvas,
                  { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
                  { mode: "continuous", progressiveMinify: !playback.isPlaying },
                );
              }
            }
          } else {
            ctx.globalAlpha = clip.opacity / 100;
            drawScaledImage(
              ctx,
              sourceEl,
              { x: drawX, y: drawY, width: drawW, height: drawH },
              { mode: "continuous", progressiveMinify: !playback.isPlaying },
            );
            ctx.globalAlpha = 1;
          }
        }

        if (
          selectedVisualClipId
          && clip.id === selectedVisualClipId
          && clip.type !== "audio"
          && !(toolMode === "transform" && transformTool.state.isActive)
        ) {
          const clipPosition = resolveClipPositionAtTimelineTime(clip, renderTime);
          const boxPoint = vpContentToScreen(clipPosition);
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
      const handles = getEightResizeHandles(cropX, cropY, cropW, cropH);
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
      const handles = getEightResizeHandles(transformX, transformY, transformW, transformH);

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
      const visibleMaskRegion = getVisibleMaskRegion();
      if (visibleMaskRegion) {
        const { region, isDragging } = visibleMaskRegion;
        const regionTopLeft = vpContentToScreen({ x: region.x, y: region.y });
        const rectX = regionTopLeft.x;
        const rectY = regionTopLeft.y;
        const rectW = region.width * scale;
        const rectH = region.height * scale;

        ctx.save();
        ctx.fillStyle = isDragging ? "rgba(59, 130, 246, 0.16)" : "rgba(59, 130, 246, 0.08)";
        ctx.strokeStyle = "rgba(147, 197, 253, 0.95)";
        ctx.lineWidth = isDragging ? 1.75 : 1.25;
        ctx.setLineDash(isDragging ? [8, 4] : [6, 6]);
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

  const { clampToCanvas, screenToProject, screenToMaskCoords, hitTestClipAtPoint } = usePreviewCoordinateHelpers({
    projectSize: project.canvasSize,
    previewContainerRef,
    vpScreenToContent,
    tracks,
    getClipAtTime,
    currentTimeRef,
  });

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
    vpFitToContainer(40);
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

    // Update brush cursor position when editing mask
    if (isEditingMask) {
      const container = previewContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
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
  }, [vpUpdatePanDrag, toolMode, isEditingMask, previewContainerRef, transformTool, handleMaskPointerMove, handleCropPointerMove, handleClipPointerMove]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    stopPanDrag();
    handleMaskPointerUp();

    if (e) {
      safeReleasePointerCapture(e.currentTarget, e.pointerId);
    }
    transformTool.handlePointerUp();
    handleClipPointerUp();
    handleCropPointerUp();
  }, [stopPanDrag, handleMaskPointerUp, transformTool, handleClipPointerUp, handleCropPointerUp]);

  usePreviewPlaybackRenderTick({
    playbackIsPlaying: playback.isPlaying,
    playbackRenderFpsCap: previewPerf.playbackRenderFpsCap,
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
    maskDrawShape,
    isZoomTool,
    toolMode,
    isDraggingCrop,
    cropDragMode,
    cropCursor,
    transformCursor: transformTool.cursor,
    isDraggingClip,
  });
  const brushDisplaySize = brushSettings.size * vpGetEffectiveScale();

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
          cursor: canvasCursor,
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
      <PreviewCanvasOverlays
        isEditingMask={isEditingMask}
        maskDrawShape={maskDrawShape}
        brushCursor={brushCursor}
        brushDisplaySize={brushDisplaySize}
        brushHardness={brushSettings.hardness}
        brushMode={brushSettings.mode}
        draftMode={previewPerf.draftMode}
        preRenderEnabled={previewPerf.preRenderEnabled}
        zoomPercent={zoomPercent}
      />
    </div>
  );
}
