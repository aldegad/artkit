"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useVideoRefs, useVideoState, useTimeline, useMask } from "../../contexts";
import { useClipTransformTool } from "../../hooks";
import { PREVIEW } from "../../constants";
import { useMaskTool } from "../../hooks/useMaskTool";
import { resolvePreviewPerformanceConfig } from "../../utils/previewPerformance";
import { usePreviewFrameCapture } from "./usePreviewFrameCapture";
import { usePreviewViewportBridge } from "./usePreviewViewportBridge";
import { useMaskInteractionSession } from "./useMaskInteractionSession";
import { useCropInteractionSession } from "./useCropInteractionSession";
import { usePreviewPlaybackRenderTick } from "./usePreviewPlaybackRenderTick";
import { usePreviewResizeObserver } from "./usePreviewResizeObserver";
import { resolvePreviewCanvasCursor } from "./previewCanvasCursor";
import { usePreviewClipDragSession } from "./usePreviewClipDragSession";
import { usePreviewCoordinateHelpers } from "./usePreviewCoordinateHelpers";
import { getLoopFrameBounds } from "./previewPlaybackStats";
import {
  DirectPreviewPlan,
  resolveAdaptivePlaybackPreviewPolicy,
  resolveDirectPreviewPlan,
} from "./previewCanvasConfig";
import { usePreviewInpaintSession } from "./usePreviewInpaintSession";
import { detachDirectPreviewVideo, renderPreviewCanvasFrame } from "./previewCanvasRenderer";
import { usePreviewPlaybackPipeline } from "./usePreviewPlaybackPipeline";
import { usePreviewCanvasPointerHandlers } from "./usePreviewCanvasPointerHandlers";
import { usePreviewCanvasViewport } from "./usePreviewCanvasViewport";

export function usePreviewCanvasController() {
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
    currentTimeRef,
  } = useVideoState();
  const { tracks, clips, getClipAtTime, updateClip, saveToHistory } = useTimeline();
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

  const renderRequestRef = useRef(0);
  const renderRef = useRef<() => void>(() => {});
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const maskTempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const previewWorkingCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const savedMaskImgCacheRef = useRef(new Map<string, HTMLImageElement>());
  const hasCommittedCompositeFrameRef = useRef(false);
  const baseFrameStateRef = useRef({
    renderTime: null as number | null,
    clipsRef: null as typeof clips | null,
    tracksRef: null as typeof tracks | null,
    masksRef: null as typeof masks | null,
    playbackIsPlaying: false,
    directPreviewTrackId: null as string | null,
    fullyReady: false,
  });
  const directPreviewHostRef = useRef<HTMLDivElement | null>(null);
  const directPreviewAttachedVideoRef = useRef<HTMLVideoElement | null>(null);
  const cssColorsRef = useRef<{ surfacePrimary: string; borderDefault: string } | null>(null);
  const checkerPatternRef = useRef<CanvasPattern | null>(null);
  const checkerPatternKeyRef = useRef("");
  const checkerPatternCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRectRef = useRef({ width: 0, height: 0 });
  const previewPerfRef = useRef(resolvePreviewPerformanceConfig());
  const directPreviewPlaybackStateRef = useRef<{ activeClipId: string | null }>({
    activeClipId: null,
  });
  const previewPerf = previewPerfRef.current;
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);

  previewPerf.preRenderEnabled = previewPreRenderEnabled;
  previewPerf.qualityFirstMode = previewQualityFirstEnabled;
  previewPerf.maxCanvasDpr = previewQualityFirstEnabled ? Number.POSITIVE_INFINITY : 2;

  const directPreviewPlan = useMemo<DirectPreviewPlan | null>(
    () => resolveDirectPreviewPlan(tracks, clips, masks.size),
    [tracks, clips, masks.size],
  );
  const directPreviewOptimized = Boolean(directPreviewPlan);

  const visualClipCount = clips.filter((clip) => clip.type !== "audio").length;
  const adaptivePlaybackPreviewPolicy = resolveAdaptivePlaybackPreviewPolicy({
    playbackIsPlaying: playback.isPlaying,
    qualityFirstMode: previewPerf.qualityFirstMode,
    clipCount: clips.length,
    visualClipCount,
    baseMaxCanvasDpr: previewPerf.maxCanvasDpr,
    basePlaybackRenderFpsCap: previewPerf.playbackRenderFpsCap,
    directPreviewOptimized,
    isMobileLike: previewPerf.isMobileLike,
  });
  const effectivePreRenderEnabled = previewPerf.preRenderEnabled && !directPreviewOptimized;

  const scheduleRender = useCallback(() => {
    cancelAnimationFrame(renderRequestRef.current);
    renderRequestRef.current = requestAnimationFrame(() => renderRef.current());
  }, []);

  useEffect(() => () => {
    detachDirectPreviewVideo({ directPreviewHostRef, directPreviewAttachedVideoRef });
  }, []);

  useEffect(() => {
    const handleInpaintRegionUpdate = () => scheduleRender();
    window.addEventListener("artkit:inpaint-region-updated", handleInpaintRegionUpdate);
    return () => window.removeEventListener("artkit:inpaint-region-updated", handleInpaintRegionUpdate);
  }, [scheduleRender]);

  const {
    containerRefCallback,
    contentToScreen,
    fitToContainer,
    getEffectiveScale,
    getTransform,
    getRenderOffset,
    getZoom,
    isPanningRef,
    onViewportChange,
    preventAndCapturePointer,
    screenToContent,
    setBaseScale,
    setZoom,
    startPanDragFromPointer,
    stopPanDrag,
    updatePanDrag,
    zoomAtClientPoint,
    zoomPercent,
  } = usePreviewCanvasViewport({
    previewContainerRef,
    previewCanvasRef,
    projectCanvasSize: project.canvasSize,
    scheduleRender,
  });

  const { clampToCanvas, screenToProject, screenToMaskCoords, hitTestClipAtPoint } = usePreviewCoordinateHelpers({
    projectSize: project.canvasSize,
    previewContainerRef,
    vpScreenToContent: screenToContent,
    tracks,
    getClipAtTime,
    currentTimeRef,
  });

  const {
    ensureInpaintMaskCanvas,
    handleInpaintPointerDown,
    handleInpaintPointerMove,
    stopInpaintStroke,
    inpaintBrushMode,
    inpaintBrushHardness,
    inpaintBrushSize,
  } = usePreviewInpaintSession({
    isInpaintMode: toolMode === "inpaint",
    projectSize: project.canvasSize,
    inpaintMaskCanvasRef,
    screenToProject,
    clampToCanvas,
    scheduleRender,
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

  usePreviewViewportBridge({
    previewViewportRef,
    onViewportChange,
    getZoom,
    setZoom,
    getEffectiveScale,
    fitToContainer: () => fitToContainer(PREVIEW.FIT_PADDING),
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
    if (!isEditingMask || maskRegionClearRequestId > 0 || Boolean(activeMaskId)) {
      clearMaskRegionSelection();
    }
  }, [activeMaskId, clearMaskRegionSelection, isEditingMask, maskRegionClearRequestId]);

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

  const playbackPipeline = usePreviewPlaybackPipeline({
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
  });

  renderRef.current = () => {
    renderPreviewCanvasFrame({
      previewCanvasRef,
      previewContainerRef,
      compositingCanvasRef,
      previewWorkingCanvasRef,
      previewPerfRef,
      containerRectRef,
      cssColorsRef,
      checkerPatternRef,
      checkerPatternKeyRef,
      checkerPatternCanvasRef,
      hasCommittedCompositeFrameRef,
      baseFrameStateRef,
      maskTempCanvasRef,
      maskOverlayCanvasRef,
      imageCacheRef,
      savedMaskImgCacheRef,
      directPreviewHostRef,
      directPreviewAttachedVideoRef,
      directPreviewPlaybackStateRef,
      currentTimeRef,
      playbackPerfRef: playbackPipeline.playbackPerfRef as never,
      project,
      playback,
      tracks,
      clips,
      masks,
      selectedClipIds,
      toolMode,
      cropArea,
      activeMaskId,
      activeTrackId,
      isEditingMask,
      isInpaintMode: toolMode === "inpaint",
      directPreviewPlan,
      effectivePreRenderEnabled,
      adaptivePlaybackPreviewPolicy,
      transformState: transformTool.state,
      getClipAtTime,
      getMaskAtTimeForTrack,
      getCachedFrame: playbackPipeline.getCachedFrame,
      getPlaybackSampleTime: playbackPipeline.getPlaybackSampleTime,
      getLoopFrameBounds,
      getVisibleMaskRegion,
      ensureInpaintMaskCanvas,
      vpGetEffectiveScale: getEffectiveScale,
      vpGetRenderOffset: getRenderOffset,
      vpContentToScreen: contentToScreen,
      videoElementsRef,
      maskContextCanvasRef,
    });
  };

  const { handlePointerDown, handlePointerMove, handlePointerUp } = usePreviewCanvasPointerHandlers({
    isPanningRef,
    previewContainerRef,
    isEditingMask,
    isInpaintMode: toolMode === "inpaint",
    isPanLocked,
    isSpacePanning,
    toolMode,
    activeTrackId,
    startPanDragFromPointer,
    zoomAtClientPoint,
    updatePanDrag,
    preventAndCapturePointer,
    handleInpaintPointerDown,
    handleInpaintPointerMove,
    handleMaskPointerDown,
    handleMaskPointerMove,
    handleMaskPointerUp,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    handleClipPointerDown,
    handleClipPointerMove,
    handleClipPointerUp,
    transformTool,
    stopPanDrag,
    stopInpaintStroke,
    scheduleRender,
    setBrushCursor,
  });

  usePreviewPlaybackRenderTick({
    playbackIsPlaying: playback.isPlaying,
    playbackRate: playback.playbackRate,
    playbackRenderFpsCap: adaptivePlaybackPreviewPolicy.playbackRenderFpsCap,
    playbackPerfRef: playbackPipeline.playbackPerfRef,
    lastPlaybackTickTimeRef: playbackPipeline.lastPlaybackTickTimeRef,
    syncMediaRef: playbackPipeline.syncMediaRef,
    renderRef,
    maybeReportPlaybackStats: playbackPipeline.maybeReportPlaybackStats,
    resetPlaybackPerfStats: playbackPipeline.resetPlaybackPerfStats,
  });

  useEffect(() => {
    scheduleRender();
  }, [
    clips,
    isEditingMask,
    maskCanvasVersion,
    masks,
    playback.isPlaying,
    project.canvasSize,
    scheduleRender,
    tracks,
  ]);

  useEffect(() => {
    scheduleRender();
  }, [
    activeTrackId,
    cropArea,
    selectedClipIds,
    scheduleRender,
    toolMode,
    transformTool.state.bounds,
    transformTool.state.isActive,
  ]);

  useEffect(() => {
    cssColorsRef.current = null;
    scheduleRender();
  }, [scheduleRender]);

  useEffect(() => onViewportChange(() => scheduleRender()), [onViewportChange, scheduleRender]);

  usePreviewResizeObserver({
    previewContainerRef,
    containerRectRef,
    getTransform,
    fitToContainer,
    setBaseScale,
    projectCanvasSize: project.canvasSize,
    renderRef,
  });

  const isInpaintMode = toolMode === "inpaint";
  const canvasCursor = resolvePreviewCanvasCursor({
    isPanning: isPanningRef.current,
    isHandMode: toolMode === "hand" || isSpacePanning,
    isEditingMask,
    isInpaintMode,
    maskDrawShape,
    isZoomTool: toolMode === "zoom",
    toolMode,
    isDraggingCrop,
    cropDragMode,
    cropCursor,
    transformCursor: transformTool.cursor,
    isDraggingClip,
  });

  return {
    containerRefCallback,
    directPreviewHostRef,
    previewCanvasRef,
    canvasCursor,
    brushCursor,
    brushDisplaySize: (isInpaintMode ? inpaintBrushSize : brushSettings.size) * getEffectiveScale(),
    brushHardness: isInpaintMode ? inpaintBrushHardness : brushSettings.hardness,
    brushMode: isInpaintMode ? inpaintBrushMode : brushSettings.mode,
    draftMode: previewPerf.draftMode,
    effectivePreRenderEnabled,
    isEditingMask,
    isInpaintMode,
    maskDrawShape,
    zoomPercent,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    clearBrushCursor: () => setBrushCursor(null),
  };
}
