"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditorFramesMeta, useEditorBrush, useEditorHistory, useEditorTools } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { StepBackwardIcon, StepForwardIcon, PlusIcon, MinusIcon } from "../../../shared/components/icons";
import { useCanvasViewport } from "../../../shared/hooks/useCanvasViewport";
import { useCanvasViewportPersistence } from "../../../shared/hooks/useCanvasViewportPersistence";
import { useRenderScheduler } from "../../../shared/hooks/useRenderScheduler";
import { useSpriteViewportStore, useSpriteUIStore } from "../stores";
import { useSpacePanAndSelectionKeys } from "../hooks/useSpacePanAndSelectionKeys";
import { useDabBufferCanvas } from "../hooks/useDabBufferCanvas";
import { useSpriteMagicWandSelection } from "../hooks/useSpriteMagicWandSelection";
import { useSpriteBrushStrokeSession } from "../hooks/useSpriteBrushStrokeSession";
import { useMagicWandOutlineAnimation } from "../hooks/useMagicWandOutlineAnimation";
import { useSpritePanPointerSession } from "../hooks/useSpritePanPointerSession";
import { drawSpriteBrushPixel } from "../utils/brushDrawing";
import { getCanvasPixelCoordinates } from "../utils/canvasPointer";
import { drawMagicWandOverlay } from "../utils/magicWandOverlay";
import {
  drawScaledImage,
  safeReleasePointerCapture,
  safeSetPointerCapture,
  type CanvasScaleScratch,
} from "@/shared/utils";
import BrushCursorOverlay from "@/shared/components/BrushCursorOverlay";
import { SPRITE_PREVIEW_VIEWPORT } from "../constants";

export default function FramePreviewContent() {
  const { frames, setFrames, selectedFrameId } = useEditorFramesMeta();
  const { brushColor, setBrushColor, brushSize, brushHardness, activePreset, pressureEnabled } = useEditorBrush();
  const { pushHistory } = useEditorHistory();
  const {
    toolMode,
    isPanLocked,
    magicWandTolerance,
    magicWandFeather,
    magicWandSelectionMode,
  } = useEditorTools();
  const { t } = useLanguage();

  const isBrushTool = toolMode === "brush" || toolMode === "eraser";
  const isEraserTool = toolMode === "eraser";
  const isMagicWandTool = toolMode === "magicwand";
  const isEyedropperTool = toolMode === "eyedropper";

  const [isPanning, setIsPanning] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);
  const [editFrameId, setEditFrameId] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const scaleScratchRef = useRef<CanvasScaleScratch>({ primary: null, secondary: null });
  const currentFrameIdRef = useRef<number | null>(null);
  const isFrameDirtyRef = useRef(false);
  const { ensureDabBufferCanvas, resetDabBufferCanvas } = useDabBufferCanvas();

  const validFrames = frames.filter((f) => f.imageData);
  const editFrameIndex = editFrameId !== null ? validFrames.findIndex((f) => f.id === editFrameId) : -1;
  const currentFrame = editFrameIndex >= 0 ? validFrames[editFrameIndex] : validFrames[0];

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
    initial: { zoom: SPRITE_PREVIEW_VIEWPORT.INITIAL_FRAME_ZOOM },
    enableWheel: true,
    enablePinch: true,
  });

  const viewportSync = viewport.useReactSync(16);

  const {
    onViewportChange: onFrameViewportChange,
    setZoom: setFrameVpZoom,
    setPan: setFrameVpPan,
    getZoom: getFrameVpZoom,
    startPanDrag: frameStartPanDrag,
    updatePanDrag: frameUpdatePanDrag,
    endPanDrag: frameEndPanDrag,
    isPanDragging: frameIsPanDragging,
    wheelRef: frameWheelRef,
    pinchRef: framePinchRef,
  } = viewport;

  const isAutosaveLoading = useSpriteUIStore((s) => s.isAutosaveLoading);
  useCanvasViewportPersistence({
    onViewportChange: onFrameViewportChange,
    setZoom: setFrameVpZoom,
    setPan: setFrameVpPan,
    isRestoreBlocked: isAutosaveLoading,
    debounceMs: 1000,
    loadState: () => {
      const { frameEditZoom, frameEditPan } = useSpriteViewportStore.getState();
      return { zoom: frameEditZoom, pan: frameEditPan };
    },
    saveState: (state) => {
      const store = useSpriteViewportStore.getState();
      store.setFrameEditZoom(state.zoom);
      store.setFrameEditPan(state.pan);
    },
  });

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
    frameCanvasRef,
    frameCtxRef,
    mode: magicWandSelectionMode,
    tolerance: magicWandTolerance,
    feather: magicWandFeather,
    requestRender,
    getAiCacheKey: () => currentFrameIdRef.current,
  });

  useEffect(() => {
    setRenderFn(() => {
      const canvas = canvasRef.current;
      const sourceCanvas = frameCanvasRef.current;
      if (!canvas || !sourceCanvas || sourceCanvas.width === 0 || sourceCanvas.height === 0) return;

      const zoom = getFrameVpZoom();
      const w = sourceCanvas.width * zoom;
      const h = sourceCanvas.height * zoom;

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);
      drawScaledImage(
        ctx,
        sourceCanvas,
        { x: 0, y: 0, width: w, height: h },
        { mode: "pixel-art", scratch: scaleScratchRef.current },
      );

      const selection = magicWandSelectionRef.current;
      const selectionMaskCanvas = magicWandMaskCanvasRef.current;
      if (
        selection
        && selectionMaskCanvas
        && selection.width === sourceCanvas.width
        && selection.height === sourceCanvas.height
      ) {
        drawMagicWandOverlay({
          ctx,
          selection,
          selectionMaskCanvas,
          zoom,
          width: w,
          height: h,
        });
      }
    });
  }, [setRenderFn, getFrameVpZoom]);

  useEffect(() => {
    return onFrameViewportChange(() => {
      requestRender();
    });
  }, [onFrameViewportChange, requestRender]);

  useMagicWandOutlineAnimation({
    hasSelection: hasMagicWandSelection,
    requestRender,
  });

  const commitFrameEdits = useCallback(() => {
    const frameId = currentFrameIdRef.current;
    const frameCanvas = frameCanvasRef.current;
    if (frameId === null || !frameCanvas || !isFrameDirtyRef.current) return;

    const newImageData = frameCanvas.toDataURL("image/png");
    setFrames((prev) => prev.map((f) => (f.id === frameId ? { ...f, imageData: newImageData } : f)));
    isFrameDirtyRef.current = false;
  }, [setFrames]);

  useEffect(() => {
    if (selectedFrameId !== null) {
      commitFrameEdits();
      setEditFrameId(selectedFrameId);
    }
  }, [selectedFrameId, commitFrameEdits]);

  useEffect(() => {
    invalidateAiSelectionCache();

    if (!currentFrame?.imageData) {
      frameCanvasRef.current = null;
      frameCtxRef.current = null;
      currentFrameIdRef.current = null;
      isFrameDirtyRef.current = false;
      clearMagicWandSelection();
      return;
    }

    clearMagicWandSelection();
    resetDabBufferCanvas();

    const img = new Image();
    img.onload = () => {
      const offscreen = document.createElement("canvas");
      offscreen.width = img.width;
      offscreen.height = img.height;
      const offscreenCtx = offscreen.getContext("2d");
      if (!offscreenCtx) return;

      offscreenCtx.clearRect(0, 0, offscreen.width, offscreen.height);
      offscreenCtx.drawImage(img, 0, 0);

      frameCanvasRef.current = offscreen;
      frameCtxRef.current = offscreenCtx;
      currentFrameIdRef.current = currentFrame.id;
      isFrameDirtyRef.current = false;
      requestRender();
    };
    img.src = currentFrame.imageData;
  }, [currentFrame?.id, currentFrame?.imageData, clearMagicWandSelection, invalidateAiSelectionCache, requestRender, resetDabBufferCanvas]);

  const handlePrev = useCallback(() => {
    if (validFrames.length > 0 && editFrameIndex >= 0) {
      commitFrameEdits();
      const newIdx = (editFrameIndex - 1 + validFrames.length) % validFrames.length;
      setEditFrameId(validFrames[newIdx].id);
    }
  }, [editFrameIndex, validFrames, commitFrameEdits]);

  const handleNext = useCallback(() => {
    if (validFrames.length > 0 && editFrameIndex >= 0) {
      commitFrameEdits();
      const newIdx = (editFrameIndex + 1) % validFrames.length;
      setEditFrameId(validFrames[newIdx].id);
    }
  }, [editFrameIndex, validFrames, commitFrameEdits]);

  const getPixelCoordinates = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return getCanvasPixelCoordinates(canvas, clientX, clientY, getFrameVpZoom());
    },
    [getFrameVpZoom]
  );

  const drawPixel = useCallback(
    (x: number, y: number, color: string, isEraser = false, pressure: number = 1) => {
      const didDraw = drawSpriteBrushPixel({
        x,
        y,
        color,
        isEraser,
        pressure,
        frameCtx: frameCtxRef.current,
        frameCanvas: frameCanvasRef.current,
        activePreset,
        brushSize,
        brushHardness,
        pressureEnabled,
        selection: magicWandSelectionRef.current,
        selectionMaskCanvas: magicWandMaskCanvasRef.current,
        ensureDabBufferCanvas,
      });
      if (!didDraw) return false;

      isFrameDirtyRef.current = true;
      invalidateAiSelectionCache();
      return true;
    },
    [activePreset, brushHardness, brushSize, ensureDabBufferCanvas, invalidateAiSelectionCache, pressureEnabled],
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
    drawAt: (x, y, pressure) => drawPixel(x, y, brushColor, isEraserTool, pressure),
    requestRender,
    commitStroke: commitFrameEdits,
  });

  useEffect(() => {
    setFrameVpPan({ x: 0, y: 0 });
    resetHasDrawn();
  }, [editFrameId, setFrameVpPan, resetHasDrawn]);

  const pickColor = useCallback(
    (x: number, y: number) => {
      const frameCtx = frameCtxRef.current;
      const frameCanvas = frameCanvasRef.current;
      if (!frameCtx || !frameCanvas) return;
      if (x < 0 || y < 0 || x >= frameCanvas.width || y >= frameCanvas.height) return;

      const pixel = frameCtx.getImageData(x, y, 1, 1).data;
      if (pixel[3] > 0) {
        const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1]
          .toString(16)
          .padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
        setBrushColor(hex);
      }
    },
    [setBrushColor]
  );

  const deleteMagicWandSelection = useCallback(() => {
    pushHistory();
    if (clearSelectedPixels()) {
      isFrameDirtyRef.current = true;
      requestRender();
      commitFrameEdits();
    }
  }, [clearSelectedPixels, commitFrameEdits, pushHistory, requestRender]);

  useSpacePanAndSelectionKeys({
    setIsPanning,
    endPanDrag: frameEndPanDrag,
    hasSelection: hasMagicWandSelection,
    onDeleteSelection: deleteMagicWandSelection,
    onClearSelection: clearMagicWandSelection,
  });

  const {
    activeTouchPointerIdsRef,
    handleContainerPointerDown,
    handleContainerPointerMove,
    handleContainerPointerUp,
  } = useSpritePanPointerSession({
    isPanLocked,
    isPanning,
    isHandTool: toolMode === "hand",
    startPanDrag: frameStartPanDrag,
    updatePanDrag: frameUpdatePanDrag,
    endPanDrag: frameEndPanDrag,
    isPanDragging: frameIsPanDragging,
    onContainerPointerUp: (e) => {
      endBrushStroke(e.pointerId);
    },
  });

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!currentFrame) return;

      if (e.pointerType === "touch") {
        activeTouchPointerIdsRef.current.add(e.pointerId);
      }

      if (activeTouchPointerIdsRef.current.size > 1) {
        cancelBrushStroke();
        return;
      }

      const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
      if (isTouchPanOnlyInput || toolMode === "hand" || isPanning) {
        return;
      }

      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (!coords) return;

      if (isEyedropperTool) {
        pickColor(coords.x, coords.y);
        return;
      }

      if (isMagicWandTool) {
        if (isAiSelecting) {
          return;
        }
        void applyMagicWandSelection(coords.x, coords.y);
        return;
      }

      if (isBrushTool) {
        startBrushStroke(e, coords);
        safeSetPointerCapture(e.currentTarget, e.pointerId);
      }
    },
    [
      currentFrame,
      isPanLocked,
      toolMode,
      isPanning,
      isEyedropperTool,
      isMagicWandTool,
      isAiSelecting,
      isBrushTool,
      getPixelCoordinates,
      applyMagicWandSelection,
      pickColor,
      startBrushStroke,
      cancelBrushStroke,
    ]
  );

  const handleCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }

      if (e.pointerType === "touch" && activeTouchPointerIdsRef.current.size > 1) {
        return;
      }

      if (!isDrawing || !currentFrame) return;
      if (!isBrushTool) return;

      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (!coords) return;
      continueBrushStroke(e, coords);
    },
    [isDrawing, currentFrame, isBrushTool, getPixelCoordinates, continueBrushStroke]
  );

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
    }

    safeReleasePointerCapture(e.currentTarget, e.pointerId);

    endBrushStroke(e.pointerId);
  }, [endBrushStroke]);

  const handleCanvasPointerEnter = useCallback(() => {
    setIsOverCanvas(true);
  }, []);

  const handleCanvasPointerLeave = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
    }
    setIsOverCanvas(false);
    setCursorPos(null);
    endBrushStroke(e.pointerId);
  }, [endBrushStroke]);

  const isHandMode = toolMode === "hand" || isPanning;

  const getContainerCursor = () => {
    if (isAiSelecting) {
      return "progress";
    }
    if (isHandMode) {
      return frameIsPanDragging() ? "grabbing" : "grab";
    }
    if (isEyedropperTool) {
      return "crosshair";
    }
    if (isMagicWandTool) {
      return "crosshair";
    }
    return "default";
  };

  const currentZoom = viewportSync.zoom;
  const snappedPan = currentZoom >= 1
    ? { x: Math.round(viewportSync.pan.x), y: Math.round(viewportSync.pan.y) }
    : viewportSync.pan;

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      <div
        ref={(el) => {
          containerRef.current = el;
          frameWheelRef(el);
          framePinchRef(el);
        }}
        className="flex-1 overflow-hidden bg-surface-secondary relative"
        onPointerDown={handleContainerPointerDown}
        onPointerMove={handleContainerPointerMove}
        onPointerUp={handleContainerPointerUp}
        onPointerLeave={handleContainerPointerUp}
        onPointerCancel={handleContainerPointerUp}
        style={{ cursor: getContainerCursor(), touchAction: "none" }}
      >
        {currentFrame?.imageData ? (
          <div
            className="absolute checkerboard border border-border-default"
            style={{
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${snappedPan.x}px), calc(-50% + ${snappedPan.y}px))`,
            }}
          >
            <canvas
              ref={canvasRef}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={handleCanvasPointerUp}
              onPointerCancel={handleCanvasPointerUp}
              onPointerLeave={handleCanvasPointerLeave}
              onPointerEnter={handleCanvasPointerEnter}
              style={{
                cursor: isAiSelecting
                  ? "progress"
                  : isBrushTool
                    ? "none"
                    : (isEyedropperTool || isMagicWandTool)
                      ? "crosshair"
                      : "default",
                pointerEvents: isHandMode ? "none" : "auto",
                touchAction: "none",
              }}
            />
            {isOverCanvas &&
              cursorPos &&
              !isHandMode &&
              isBrushTool && (
                <BrushCursorOverlay
                  x={cursorPos.x}
                  y={cursorPos.y}
                  size={brushSize * currentZoom}
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

      <div className="flex items-center px-2 py-1.5 border-t border-border-default gap-1">
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={handlePrev}
            className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
            disabled={validFrames.length === 0}
          >
            <StepBackwardIcon />
          </button>
          <span className="text-xs text-text-primary tabular-nums select-none min-w-[48px] text-center">
            {validFrames.length > 0 && editFrameIndex >= 0 ? `${editFrameIndex + 1} / ${validFrames.length}` : "-"}
          </span>
          <button
            onClick={handleNext}
            className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary hover:text-text-primary transition-colors"
            disabled={validFrames.length === 0}
          >
            <StepForwardIcon />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() =>
              setFrameVpZoom(
                Math.max(
                  SPRITE_PREVIEW_VIEWPORT.MIN_ZOOM,
                  getFrameVpZoom() * SPRITE_PREVIEW_VIEWPORT.ZOOM_STEP_OUT
                )
              )
            }
            className="p-1 hover:bg-interactive-hover rounded transition-colors"
          >
            <MinusIcon className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs w-10 text-center text-text-primary">{Math.round(currentZoom * 100)}%</span>
          <button
            onClick={() =>
              setFrameVpZoom(
                Math.min(
                  SPRITE_PREVIEW_VIEWPORT.MAX_ZOOM,
                  getFrameVpZoom() * SPRITE_PREVIEW_VIEWPORT.ZOOM_STEP_IN
                )
              )
            }
            className="p-1 hover:bg-interactive-hover rounded transition-colors"
          >
            <PlusIcon className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
