"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import {
  useEditorTools,
  useEditorBrush,
  useEditorHistory,
  useEditorWindows,
  useEditorFramesMeta,
} from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { ImageDropZone, Popover } from "../../../shared/components";
import {
  StepBackwardIcon,
  StepForwardIcon,
  PlayIcon,
  PauseIcon,
  BackgroundPatternIcon,
} from "../../../shared/components/icons";
import { compositeFrame } from "../utils/compositor";
import { useCanvasViewport } from "../../../shared/hooks/useCanvasViewport";
import { useCanvasViewportPersistence } from "../../../shared/hooks/useCanvasViewportPersistence";
import { useRenderScheduler } from "../../../shared/hooks/useRenderScheduler";
import { getCanvasColorsSync } from "@/shared/hooks";
import { useSpriteViewportStore, useSpriteUIStore, useSpriteTrackStore } from "../stores";
import { useSpacePanAndSelectionKeys } from "../hooks/useSpacePanAndSelectionKeys";
import { useDabBufferCanvas } from "../hooks/useDabBufferCanvas";
import { useSpriteCropInteractionSession } from "../hooks/useSpriteCropInteractionSession";
import { useSpriteMagicWandSelection } from "../hooks/useSpriteMagicWandSelection";
import { useSpriteBrushStrokeSession } from "../hooks/useSpriteBrushStrokeSession";
import { useMagicWandOutlineAnimation } from "../hooks/useMagicWandOutlineAnimation";
import { useSpritePanPointerSession } from "../hooks/useSpritePanPointerSession";
import { useSpritePreviewImportHandlers } from "../hooks/useSpritePreviewImportHandlers";
import { useSpritePreviewPointerHandlers } from "../hooks/useSpritePreviewPointerHandlers";
import { useSpritePreviewBackgroundState } from "../hooks/useSpritePreviewBackgroundState";
import { useSpriteEditableFrameCanvasSync } from "../hooks/useSpriteEditableFrameCanvasSync";
import { SPRITE_PREVIEW_VIEWPORT } from "../constants";
import { drawSpriteBrushPixel } from "../utils/brushDrawing";
import { getCanvasPixelCoordinates } from "../utils/canvasPointer";
import { drawMagicWandOverlay } from "../utils/magicWandOverlay";
import {
  drawScaledImage,
  clampZoom,
  resizeCanvasForDpr,
  type CanvasScaleScratch,
  zoomAtPoint,
} from "@/shared/utils";
import BrushCursorOverlay from "@/shared/components/BrushCursorOverlay";
import { AnimationFrameIndicator } from "./AnimationFrameIndicator";
import { drawSpriteCropOverlay } from "./spriteCropOverlayDrawing";
import { resolveAnimationPreviewCursor } from "./animationPreviewCursor";

// ============================================
// Component
// ============================================

export default function AnimationPreviewContent() {
  const tracks = useSpriteTrackStore((s) => s.tracks);
  const addTrack = useSpriteTrackStore((s) => s.addTrack);
  const isPlaying = useSpriteTrackStore((s) => s.isPlaying);
  const setIsPlaying = useSpriteTrackStore((s) => s.setIsPlaying);
  const storeFrameIndex = useSpriteTrackStore((s) => s.currentFrameIndex);
  const setStoreFrameIndex = useSpriteTrackStore((s) => s.setCurrentFrameIndex);
  const activeTrackId = useSpriteTrackStore((s) => s.activeTrackId);
  const { frames: activeTrackFrames } = useEditorFramesMeta();
  const {
    toolMode,
    isPanLocked,
    cropArea,
    setCropArea,
    cropAspectRatio,
    lockCropAspect,
    canvasExpandMode,
    magicWandTolerance,
    magicWandFeather,
    magicWandSelectionMode,
  } = useEditorTools();
  const canvasSize = useSpriteUIStore((s) => s.canvasSize);
  const {
    brushColor,
    setBrushColor,
    brushSize,
    brushHardness,
    brushOpacity,
    activePreset,
    pressureEnabled,
  } = useEditorBrush();
  const { pushHistory } = useEditorHistory();
  const { setPendingVideoFile, setIsVideoImportOpen } = useEditorWindows();
  const { t } = useLanguage();

  const [isPanning, setIsPanning] = useState(false);
  const { bgType, setBgType, bgColor, setBgColor, bgImage, setBgImage, handleBgImageUpload } = useSpritePreviewBackgroundState();
  const [hasCompositedFrame, setHasCompositedFrame] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Keep the latest composited frame as a canvas to avoid image re-decoding per frame.
  const compositedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Editable frame buffer used when brush/eraser is active.
  const editFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editFrameCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const scaleScratchRef = useRef<CanvasScaleScratch>({ primary: null, secondary: null });
  const currentEditTrackIdRef = useRef<string | null>(null);
  const currentEditFrameIdRef = useRef<number | null>(null);
  const isEditFrameDirtyRef = useRef(false);
  const { ensureDabBufferCanvas, resetDabBufferCanvas } = useDabBufferCanvas();

  const currentFrameIndex = storeFrameIndex;
  const activeFrame = activeTrackFrames[currentFrameIndex];
  const editableFrame = activeFrame && !activeFrame.disabled && activeFrame.imageData ? activeFrame : null;

  const trackEnabledIndicesMap = useMemo(() => {
    const map = new Map<string, number[]>();
    for (const track of tracks) {
      map.set(
        track.id,
        track.frames
          .map((f, i) => (f.disabled ? -1 : i))
          .filter((i) => i >= 0),
      );
    }
    return map;
  }, [tracks]);

  const maxEnabledCount = useMemo(() => {
    let max = 0;
    for (const indices of trackEnabledIndicesMap.values()) {
      if (indices.length > max) max = indices.length;
    }
    return max;
  }, [trackEnabledIndicesMap]);

  const activeEnabledIndices = trackEnabledIndicesMap.get(activeTrackId ?? "") ?? [];
  const currentVisualIndex = activeEnabledIndices.indexOf(currentFrameIndex);

  const enabledTracks = useMemo(
    () =>
      tracks.map((track) => ({
        ...track,
        frames: track.frames.filter((f) => !f.disabled),
      })),
    [tracks],
  );

  const hasContent = tracks.some((track) => track.frames.length > 0);
  const isMagicWandTool = toolMode === "magicwand";
  const isBrushEditMode = toolMode === "brush" || toolMode === "eraser";
  const isEditMode = isBrushEditMode || isMagicWandTool;
  const isEraserTool = toolMode === "eraser";
  const isZoomTool = toolMode === "zoom";
  const isEyedropperTool = toolMode === "eyedropper";

  // ---- Viewport (ref-based zoom/pan, no React re-renders for viewport changes) ----
  const viewport = useCanvasViewport({
    containerRef,
    canvasRef,
    contentSize: { width: 1, height: 1 },
    config: {
      origin: "center",
      minZoom: SPRITE_PREVIEW_VIEWPORT.MIN_ZOOM,
      maxZoom: SPRITE_PREVIEW_VIEWPORT.MAX_ZOOM,
      wheelZoomFactor: SPRITE_PREVIEW_VIEWPORT.WHEEL_ZOOM_FACTOR,
    },
    initial: { zoom: SPRITE_PREVIEW_VIEWPORT.INITIAL_ANIM_ZOOM },
    enableWheel: true,
    enablePinch: true,
  });

  // Throttled React state for UI display only (zoom %, CSS transform)
  const viewportSync = viewport.useReactSync(16);

  // Extract stable references from viewport (useCallback-backed, stable across re-renders)
  const {
    onViewportChange: onAnimViewportChange,
    setZoom: setAnimVpZoom,
    setPan: setAnimVpPan,
    getZoom: getAnimVpZoom,
    getPan: getAnimVpPan,
    startPanDrag: animStartPanDrag,
    updatePanDrag: animUpdatePanDrag,
    endPanDrag: animEndPanDrag,
    isPanDragging: animIsPanDragging,
    wheelRef: animWheelRef,
    pinchRef: animPinchRef,
  } = viewport;

  const fitAnimPreviewToContainer = useCallback(
    (padding?: number, maxScale?: number) => {
      const container = containerRef.current;
      if (!container) return;

      const sourceCanvas = isEditMode
        ? editFrameCanvasRef.current
        : compositedCanvasRef.current;
      const sourceWidth = sourceCanvas?.width ?? canvasSize?.width ?? 0;
      const sourceHeight = sourceCanvas?.height ?? canvasSize?.height ?? 0;
      if (sourceWidth <= 0 || sourceHeight <= 0) return;

      const p = padding ?? SPRITE_PREVIEW_VIEWPORT.FIT_PADDING;
      const maxWidth = container.clientWidth - p * 2;
      const maxHeight = container.clientHeight - p * 2;
      if (maxWidth <= 0 || maxHeight <= 0) return;

      const fitZoom = Math.min(maxWidth / sourceWidth, maxHeight / sourceHeight, maxScale ?? 1);
      setAnimVpZoom(fitZoom);
      setAnimVpPan({ x: 0, y: 0 });
    },
    [canvasSize?.height, canvasSize?.width, isEditMode, setAnimVpPan, setAnimVpZoom],
  );

  // ---- Register viewport API to store (for toolbar zoom/fit control) ----
  useEffect(() => {
    const store = useSpriteViewportStore.getState();
    store.registerAnimPreviewVpApi({
      setZoom: setAnimVpZoom,
      setPan: setAnimVpPan,
      getZoom: getAnimVpZoom,
      fitToContainer: fitAnimPreviewToContainer,
    });
    return () => store.unregisterAnimPreviewVpApi();
  }, [setAnimVpZoom, setAnimVpPan, getAnimVpZoom, fitAnimPreviewToContainer]);

  // ---- Real-time zoom sync to store (for toolbar NumberScrubber display) ----
  useEffect(() => {
    const unsub = onAnimViewportChange((state) => {
      useSpriteViewportStore.getState().setAnimPreviewZoom(state.zoom);
    });
    return unsub;
  }, [onAnimViewportChange]);

  // ---- Sync viewport to Zustand store for autosave (debounced, no subscription) ----
  const isAutosaveLoading = useSpriteUIStore((s) => s.isAutosaveLoading);
  useCanvasViewportPersistence({
    onViewportChange: onAnimViewportChange,
    setZoom: setAnimVpZoom,
    setPan: setAnimVpPan,
    isRestoreBlocked: isAutosaveLoading,
    debounceMs: 1000,
    loadState: () => {
      const { animPreviewZoom, animPreviewPan } = useSpriteViewportStore.getState();
      return { zoom: animPreviewZoom, pan: animPreviewPan };
    },
    saveState: (state) => {
      const store = useSpriteViewportStore.getState();
      store.setAnimPreviewZoom(state.zoom);
      store.setAnimPreviewPan(state.pan);
    },
  });

  // ---- Render scheduler (RAF-based, replaces useEffect rendering) ----
  const { requestRender, setRenderFn } = useRenderScheduler(containerRef);
  const {
    magicWandSelectionRef,
    magicWandMaskCanvasRef,
    isAiSelecting,
    clearMagicWandSelection,
    invalidateAiSelectionCache,
    applyMagicWandSelection,
    clearSelectedPixels,
    hasMagicWandSelection,
  } = useSpriteMagicWandSelection({
    frameCanvasRef: editFrameCanvasRef,
    frameCtxRef: editFrameCtxRef,
    mode: magicWandSelectionMode,
    tolerance: magicWandTolerance,
    feather: magicWandFeather,
    requestRender,
    getAiCacheKey: () =>
      `${currentEditTrackIdRef.current ?? "none"}:${currentEditFrameIdRef.current ?? -1}`,
  });

  const commitFrameEdits = useCallback(() => {
    const trackId = currentEditTrackIdRef.current;
    const frameId = currentEditFrameIdRef.current;
    const frameCanvas = editFrameCanvasRef.current;
    if (!trackId || frameId === null || !frameCanvas || !isEditFrameDirtyRef.current) return;

    const newImageData = frameCanvas.toDataURL("image/png");
    const trackStore = useSpriteTrackStore.getState();
    const targetTrack = trackStore.tracks.find((track) => track.id === trackId);
    if (!targetTrack) return;

    trackStore.updateTrack(trackId, {
      frames: targetTrack.frames.map((frame) =>
        frame.id === frameId ? { ...frame, imageData: newImageData } : frame,
      ),
    });
    isEditFrameDirtyRef.current = false;
  }, []);

  // Register render function
  useEffect(() => {
    setRenderFn(() => {
      const canvas = canvasRef.current;
      const sourceCanvas = isEditMode ? editFrameCanvasRef.current : compositedCanvasRef.current;
      if (!canvas || !sourceCanvas) return;

      const zoom = getAnimVpZoom();
      const w = sourceCanvas.width * zoom;
      const h = sourceCanvas.height * zoom;
      if (w <= 0 || h <= 0) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { width: canvasWidth, height: canvasHeight } = resizeCanvasForDpr(
        canvas,
        ctx,
        w,
        h,
        { scaleContext: true },
      );

      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      drawScaledImage(
        ctx,
        sourceCanvas,
        { x: 0, y: 0, width: canvasWidth, height: canvasHeight },
        { mode: "pixel-art", scratch: scaleScratchRef.current },
      );

      const selection = magicWandSelectionRef.current;
      const selectionMaskCanvas = magicWandMaskCanvasRef.current;
      if (
        isEditMode
        && selection
        && selectionMaskCanvas
        && selection.width === sourceCanvas.width
        && selection.height === sourceCanvas.height
      ) {
        drawMagicWandOverlay({
          ctx,
          selection,
          selectionMaskCanvas,
          zoom,
          width: canvasWidth,
          height: canvasHeight,
        });
      }

      if (toolMode === "crop") {
        const colors = getCanvasColorsSync();
        drawSpriteCropOverlay({
          ctx,
          zoom,
          canvasWidth,
          canvasHeight,
          sourceWidth: sourceCanvas.width,
          sourceHeight: sourceCanvas.height,
          cropArea,
          colors: {
            overlay: colors.overlay,
            selection: colors.selection,
            grid: colors.grid,
            textOnColor: colors.textOnColor,
          },
        });
      }
    });

    // Ensure first paint after autosave restore even if a render was requested
    // before the scheduler render function was registered.
    requestRender();
  }, [setRenderFn, getAnimVpZoom, requestRender, isEditMode, toolMode, cropArea]);

  // Subscribe viewport changes -> render
  useEffect(() => {
    return onAnimViewportChange(() => {
      requestRender();
    });
  }, [onAnimViewportChange, requestRender]);

  useMagicWandOutlineAnimation({
    hasSelection: hasMagicWandSelection,
    requestRender,
  });

  const {
    isFileDragOver,
    handleFileDragOver,
    handleFileDragLeave,
    handleFileDrop,
    handleFileSelect,
  } = useSpritePreviewImportHandlers({
    addTrack,
    pushHistory,
    setPendingVideoFile,
    setIsVideoImportOpen,
  });

  // Composite current frame from all tracks
  useEffect(() => {
    if (isAutosaveLoading) {
      return;
    }

    if (maxEnabledCount === 0) {
      compositedCanvasRef.current = null;
      setHasCompositedFrame(false);
      requestRender();
      return;
    }

    const visualIndex = currentVisualIndex >= 0 ? currentVisualIndex : 0;
    const outputSize = canvasSize ?? undefined;
    let cancelled = false;
    compositeFrame(enabledTracks, visualIndex, outputSize, { includeDataUrl: false }).then((result) => {
      if (!cancelled) {
        compositedCanvasRef.current = result?.canvas ?? null;
        setHasCompositedFrame(Boolean(result));
        requestRender();

        // Ensure render after DOM commit when canvas visibility toggles.
        if (result) {
          requestAnimationFrame(() => {
            requestRender();
          });
        }

        // Prefetch next frame to reduce first-loop stutter.
        if (maxEnabledCount > 1) {
          const nextVisualIndex = (visualIndex + 1) % maxEnabledCount;
          void compositeFrame(enabledTracks, nextVisualIndex, outputSize, { includeDataUrl: false });
        }
      }
    });

    return () => {
      cancelled = true;
    };
  }, [isAutosaveLoading, enabledTracks, currentVisualIndex, maxEnabledCount, requestRender, canvasSize]);

  useSpriteEditableFrameCanvasSync({
    editableFrame,
    activeTrackId,
    editFrameCanvasRef,
    editFrameCtxRef,
    currentEditTrackIdRef,
    currentEditFrameIdRef,
    isEditFrameDirtyRef,
    clearMagicWandSelection,
    invalidateAiSelectionCache,
    resetDabBufferCanvas,
    commitFrameEdits,
    requestRender,
  });

  // Flush frame edits on unmount.
  useEffect(() => {
    return () => {
      commitFrameEdits();
    };
  }, [commitFrameEdits]);

  // Autosave restore can toggle hasCompositedFrame after initial scheduler tick.
  // Trigger another paint once the canvas is visibly mounted.
  useEffect(() => {
    if (!hasCompositedFrame && !isEditMode) return;
    requestAnimationFrame(() => {
      requestRender();
    });
  }, [hasCompositedFrame, isEditMode, requestRender]);

  useEffect(() => {
    if (toolMode !== "crop") return;
    requestRender();
  }, [toolMode, cropArea, requestRender]);

  const handlePrev = useCallback(() => {
    if (activeEnabledIndices.length === 0) return;
    commitFrameEdits();
    setStoreFrameIndex((prev: number) => {
      const current = activeEnabledIndices.indexOf(prev);
      const base = current >= 0 ? current : 0;
      const next = (base - 1 + activeEnabledIndices.length) % activeEnabledIndices.length;
      return activeEnabledIndices[next] ?? prev;
    });
  }, [activeEnabledIndices, commitFrameEdits, setStoreFrameIndex]);

  const handleNext = useCallback(() => {
    if (activeEnabledIndices.length === 0) return;
    commitFrameEdits();
    setStoreFrameIndex((prev: number) => {
      const current = activeEnabledIndices.indexOf(prev);
      const base = current >= 0 ? current : 0;
      const next = (base + 1) % activeEnabledIndices.length;
      return activeEnabledIndices[next] ?? prev;
    });
  }, [activeEnabledIndices, commitFrameEdits, setStoreFrameIndex]);

  const getPixelCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return getCanvasPixelCoordinates(canvas, clientX, clientY, getAnimVpZoom());
    },
    [getAnimVpZoom],
  );

  const getCropCanvasBounds = useCallback(() => {
    const sourceCanvas = compositedCanvasRef.current;
    if (sourceCanvas) {
      return {
        width: sourceCanvas.width,
        height: sourceCanvas.height,
      };
    }
    if (canvasSize) {
      return {
        width: canvasSize.width,
        height: canvasSize.height,
      };
    }
    return null;
  }, [canvasSize]);

  const clampToCropCanvas = useCallback((point: { x: number; y: number }) => {
    const bounds = getCropCanvasBounds();
    if (!bounds) return point;
    return {
      x: Math.max(0, Math.min(bounds.width, point.x)),
      y: Math.max(0, Math.min(bounds.height, point.y)),
    };
  }, [getCropCanvasBounds]);

  useEffect(() => {
    if (toolMode !== "crop") return;
    if (cropArea) return;
    const bounds = getCropCanvasBounds();
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return;

    setCropArea({
      x: 0,
      y: 0,
      width: bounds.width,
      height: bounds.height,
    });
  }, [toolMode, cropArea, getCropCanvasBounds, setCropArea, hasCompositedFrame, currentVisualIndex]);

  const {
    cropCursor,
    cropDragMode,
    isDraggingCrop,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    cancelCropDrag,
  } = useSpriteCropInteractionSession({
    isCropMode: toolMode === "crop",
    cropArea,
    setCropArea,
    cropAspectRatio,
    lockCropAspect,
    canvasExpandMode,
    getPixelCoordinates,
    getCropCanvasBounds,
    clampToCropCanvas,
  });

  const drawPixel = useCallback(
    (x: number, y: number, color: string, isEraser = false, pressure = 1, isStrokeStart = false) => {
      const didDraw = drawSpriteBrushPixel({
        x,
        y,
        color,
        isEraser,
        isStrokeStart,
        pressure,
        frameCtx: editFrameCtxRef.current,
        frameCanvas: editFrameCanvasRef.current,
        activePreset,
        brushSize,
        brushHardness,
        brushOpacity,
        pressureEnabled,
        selection: magicWandSelectionRef.current,
        selectionMaskCanvas: magicWandMaskCanvasRef.current,
        ensureDabBufferCanvas,
      });
      if (!didDraw) return false;

      isEditFrameDirtyRef.current = true;
      invalidateAiSelectionCache();
      return true;
    },
    [
      activePreset,
      brushHardness,
      brushOpacity,
      brushSize,
      ensureDabBufferCanvas,
      invalidateAiSelectionCache,
      pressureEnabled,
    ],
  );

  const {
    isDrawing,
    resetHasDrawn,
    startBrushStroke,
    continueBrushStroke,
    endBrushStroke,
    cancelBrushStroke,
  } = useSpriteBrushStrokeSession({
    pushHistory,
    drawAt: (x, y, pressure, isStrokeStart) =>
      drawPixel(x, y, brushColor, isEraserTool, pressure, isStrokeStart),
    requestRender,
    commitStroke: commitFrameEdits,
  });

  useEffect(() => {
    resetHasDrawn();
  }, [editableFrame?.id, activeTrackId, resetHasDrawn]);

  const pickColorFromComposited = useCallback(
    (clientX: number, clientY: number) => {
      const sourceCanvas = compositedCanvasRef.current;
      const displayCanvas = canvasRef.current;
      if (!sourceCanvas || !displayCanvas) return;

      const rect = displayCanvas.getBoundingClientRect();
      const zoom = getAnimVpZoom();
      if (zoom <= 0) return;

      const srcX = Math.floor((clientX - rect.left) / zoom);
      const srcY = Math.floor((clientY - rect.top) / zoom);
      if (srcX < 0 || srcY < 0 || srcX >= sourceCanvas.width || srcY >= sourceCanvas.height) {
        return;
      }

      const sourceCtx = sourceCanvas.getContext("2d");
      if (!sourceCtx) return;
      const pixel = sourceCtx.getImageData(srcX, srcY, 1, 1).data;
      if (pixel[3] === 0) return;

      const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1]
        .toString(16)
        .padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
      setBrushColor(hex);
    },
    [getAnimVpZoom, setBrushColor],
  );

  const zoomAtCursor = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;

      const zoomFactor = e.altKey
        ? SPRITE_PREVIEW_VIEWPORT.ZOOM_STEP_OUT
        : SPRITE_PREVIEW_VIEWPORT.ZOOM_STEP_IN;
      const currentZoom = getAnimVpZoom();
      const newZoom = clampZoom(
        currentZoom * zoomFactor,
        SPRITE_PREVIEW_VIEWPORT.MIN_ZOOM,
        SPRITE_PREVIEW_VIEWPORT.MAX_ZOOM,
      );
      if (newZoom === currentZoom) return;

      const currentPan = getAnimVpPan();
      const result = zoomAtPoint(
        { x: e.clientX - rect.left, y: e.clientY - rect.top },
        { zoom: currentZoom, pan: currentPan, baseScale: 1 },
        newZoom,
        "center",
        { width: rect.width, height: rect.height },
      );

      setAnimVpPan(result.pan);
      setAnimVpZoom(result.zoom);
      requestRender();
    },
    [getAnimVpPan, getAnimVpZoom, requestRender, setAnimVpPan, setAnimVpZoom],
  );

  const deleteMagicWandSelection = useCallback(() => {
    pushHistory();
    if (clearSelectedPixels()) {
      isEditFrameDirtyRef.current = true;
      requestRender();
      commitFrameEdits();
    }
  }, [clearSelectedPixels, commitFrameEdits, pushHistory, requestRender]);

  useSpacePanAndSelectionKeys({
    setIsPanning,
    endPanDrag: animEndPanDrag,
    hasSelection: hasMagicWandSelection,
    onDeleteSelection: deleteMagicWandSelection,
    onClearSelection: clearMagicWandSelection,
  });

  // Hand tool or spacebar pan
  const isHandMode = toolMode === "hand" || isPanning;
  const {
    activeTouchPointerIdsRef,
    handleContainerPointerDown: handlePointerDown,
    handleContainerPointerMove: handlePointerMove,
    handleContainerPointerUp: handlePointerUp,
  } = useSpritePanPointerSession({
    isPanLocked,
    isPanning,
    isHandTool: toolMode === "hand",
    startPanDrag: animStartPanDrag,
    updatePanDrag: animUpdatePanDrag,
    endPanDrag: animEndPanDrag,
    isPanDragging: animIsPanDragging,
    onContainerPointerUp: (e) => {
      endBrushStroke(e.pointerId);
    },
  });

  const {
    cursorPos,
    isOverCanvas,
    resetPointerOverlayState,
    handlePreviewCanvasPointerDown,
    handlePreviewCanvasPointerMove,
    handlePreviewCanvasPointerUp,
    handlePreviewCanvasPointerEnter,
    handlePreviewCanvasPointerLeave,
  } = useSpritePreviewPointerHandlers({
    canvasRef,
    activeTouchPointerIdsRef,
    isPanLocked,
    isHandMode,
    isZoomTool,
    isEyedropperTool,
    isEditMode,
    isBrushEditMode,
    isMagicWandTool,
    isAiSelecting,
    isPlaying,
    isDrawing,
    editableFrame,
    zoomAtCursor,
    pickColorFromComposited,
    handleCropPointerDown,
    handleCropPointerMove,
    handleCropPointerUp,
    cancelCropDrag,
    applyMagicWandSelection,
    startBrushStroke,
    continueBrushStroke,
    endBrushStroke,
    cancelBrushStroke,
    getPixelCoordinates,
    setIsPlaying,
  });

  useEffect(() => {
    if (!isEditMode) {
      commitFrameEdits();
      cancelBrushStroke();
      resetPointerOverlayState();
      requestRender();
    }
  }, [isEditMode, cancelBrushStroke, commitFrameEdits, requestRender, resetPointerOverlayState]);

  const hasVisibleCanvas = isEditMode ? Boolean(editFrameCanvasRef.current) : hasCompositedFrame;
  const previewPan = viewportSync.zoom >= 1
    ? { x: Math.round(viewportSync.pan.x), y: Math.round(viewportSync.pan.y) }
    : viewportSync.pan;
  const previewCursor = resolveAnimationPreviewCursor({
    isAiSelecting,
    isHandMode,
    isPanDragging: animIsPanDragging(),
    isZoomTool,
    isEyedropperTool,
    isMagicWandTool,
    toolMode,
    isDraggingCrop,
    cropDragMode,
    cropCursor,
  });

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {!hasContent ? (
        <ImageDropZone
          variant="sprite"
          accept="image/*,video/*"
          onFileSelect={handleFileSelect}
        />
      ) : (
        <div
          className="flex-1 flex flex-col min-h-0 relative"
          onDragOver={handleFileDragOver}
          onDragLeave={handleFileDragLeave}
          onDrop={handleFileDrop}
        >
          {/* Preview area */}
          <div
            ref={(el) => {
              containerRef.current = el;
              animWheelRef(el);
              animPinchRef(el);
            }}
            className="flex-1 overflow-hidden relative bg-surface-secondary"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ cursor: previewCursor, touchAction: "none" }}
          >
            {hasVisibleCanvas ? (
              <div
                className={`absolute border border-border-default overflow-hidden ${bgType === "checkerboard" ? "checkerboard" : ""}`}
                style={{
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${previewPan.x}px), calc(-50% + ${previewPan.y}px))`,
                  backgroundColor: bgType === "solid" ? bgColor : undefined,
                }}
              >
                {bgType === "image" && bgImage && (
                  <img
                    src={bgImage}
                    alt="background"
                    className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  />
                )}
                <canvas
                  ref={canvasRef}
                  onPointerDown={handlePreviewCanvasPointerDown}
                  onPointerMove={handlePreviewCanvasPointerMove}
                  onPointerUp={handlePreviewCanvasPointerUp}
                  onPointerCancel={handlePreviewCanvasPointerUp}
                  onPointerEnter={handlePreviewCanvasPointerEnter}
                  onPointerLeave={handlePreviewCanvasPointerLeave}
                  className="block relative"
                  style={{
                    cursor: isBrushEditMode ? "none" : previewCursor,
                    pointerEvents: isHandMode ? "none" : "auto",
                    touchAction: "none",
                  }}
                />
                {isOverCanvas &&
                  cursorPos &&
                  !isHandMode &&
                  isEditMode &&
                  (toolMode === "brush" || toolMode === "eraser") && (
                    <BrushCursorOverlay
                      x={cursorPos.x}
                      y={cursorPos.y}
                      size={brushSize * viewportSync.zoom}
                      hardness={brushHardness}
                      color={isEraserTool ? "#f87171" : brushColor}
                      isEraser={isEraserTool}
                    />
                  )}
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm">
                {t.selectFrame}
              </div>
            )}
          </div>

          {/* Drop overlay */}
          {isFileDragOver && (
            <div className="absolute inset-0 z-20 bg-accent-primary/10 border-2 border-dashed border-accent-primary rounded-lg flex items-center justify-center pointer-events-none">
              <div className="bg-surface-primary/90 px-6 py-4 rounded-xl text-center">
                <p className="text-lg text-accent-primary font-medium">
                  {t.dropMediaHere}
                </p>
              </div>
            </div>
          )}

          {/* Control area */}
          <div className="px-2 py-1.5 border-t border-border-default">
            <div className="relative flex items-center">
              {/* Left: Frame indicator + Background */}
              <div className="flex items-center gap-1.5">
                {maxEnabledCount > 0 ? (
                  <AnimationFrameIndicator
                    currentIndex={currentVisualIndex >= 0 ? currentVisualIndex : 0}
                    maxCount={maxEnabledCount}
                    onChange={(visualIndex) => {
                      commitFrameEdits();
                      const target = activeEnabledIndices[visualIndex];
                      if (target !== undefined) setStoreFrameIndex(target);
                    }}
                  />
                ) : (
                  <span className="text-xs text-text-secondary cursor-default select-none tabular-nums">-/-</span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleBgImageUpload}
                  className="hidden"
                />
                <Popover
                  trigger={
                    <button
                      className={`p-1.5 rounded transition-colors ${
                        bgType !== "checkerboard"
                          ? "bg-accent/20 text-accent hover:bg-accent/30"
                          : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
                      }`}
                      title={t.background}
                    >
                      <BackgroundPatternIcon />
                    </button>
                  }
                  align="start"
                  side="top"
                >
                  <div className="p-3 space-y-2 min-w-[200px]">
                    <div className="text-xs text-text-secondary font-medium">{t.background}</div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setBgType("checkerboard")}
                        className={`w-6 h-6 rounded border-2 checkerboard transition-colors ${
                          bgType === "checkerboard" ? "border-accent-primary" : "border-border-default"
                        }`}
                        title={t.transparent}
                      />
                      <input
                        type="color"
                        value={bgColor}
                        onChange={(e) => {
                          setBgType("solid");
                          setBgColor(e.target.value);
                        }}
                        className={`w-6 h-6 rounded cursor-pointer border-2 p-0 ${
                          bgType === "solid" ? "border-accent-primary" : "border-border-default"
                        }`}
                        title={t.customColor}
                      />
                      <span className="text-[10px] text-text-tertiary font-mono">{bgColor}</span>
                    </div>
                    <div className="border-t border-border-default pt-2">
                      <button
                        onClick={() => fileInputRef.current?.click()}
                        className={`w-full px-2 py-1.5 rounded text-xs text-left transition-colors ${
                          bgType === "image"
                            ? "bg-accent-primary/10 text-accent-primary"
                            : "hover:bg-interactive-hover text-text-secondary"
                        }`}
                      >
                        {t.uploadBgImage}
                      </button>
                      {bgType === "image" && bgImage && (
                        <button
                          onClick={() => {
                            setBgImage(null);
                            setBgType("checkerboard");
                          }}
                          className="w-full px-2 py-1 rounded text-xs text-left text-accent-danger hover:bg-interactive-hover transition-colors mt-1"
                        >
                          {t.removeBgImage}
                        </button>
                      )}
                    </div>
                  </div>
                </Popover>
              </div>

              {/* Center: Transport controls (absolute center) */}
              <div className="absolute left-1/2 -translate-x-1/2 flex items-center gap-1">
                <button
                  onClick={handlePrev}
                  className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
                >
                  <StepBackwardIcon />
                </button>
                <button
                  onClick={() => {
                    commitFrameEdits();
                    setIsPlaying(!isPlaying);
                  }}
                  className="p-1.5 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
                >
                  {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
                </button>
                <button
                  onClick={handleNext}
                  className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
                >
                  <StepForwardIcon />
                </button>
              </div>

              <div className="ml-auto" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
