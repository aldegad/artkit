"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditorFramesMeta, useEditorBrush, useEditorHistory, useEditorTools } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { StepBackwardIcon, StepForwardIcon, PlusIcon, MinusIcon } from "../../../shared/components/icons";
import { useCanvasViewport } from "../../../shared/hooks/useCanvasViewport";
import { useCanvasViewportPersistence } from "../../../shared/hooks/useCanvasViewportPersistence";
import { useRenderScheduler } from "../../../shared/hooks/useRenderScheduler";
import { useSpriteViewportStore, useSpriteUIStore } from "../stores";
import { calculateDrawingParameters } from "@/domains/image/constants/brushPresets";
import { drawDab as sharedDrawDab } from "@/shared/utils/brushEngine";
import { safeReleasePointerCapture, safeSetPointerCapture } from "@/shared/utils";
import { SPRITE_PREVIEW_VIEWPORT } from "../constants";

export default function FramePreviewContent() {
  const { frames, setFrames, selectedFrameId } = useEditorFramesMeta();
  const { brushColor, setBrushColor, brushSize, brushHardness, activePreset, pressureEnabled } = useEditorBrush();
  const { pushHistory } = useEditorHistory();
  const { toolMode, isPanLocked } = useEditorTools();
  const { t } = useLanguage();

  const isBrushTool = toolMode === "brush" || toolMode === "eraser";
  const isEraserTool = toolMode === "eraser";
  const isEyedropperTool = toolMode === "eyedropper";

  const [isPanning, setIsPanning] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);
  const [editFrameId, setEditFrameId] = useState<number | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const frameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const frameCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const currentFrameIdRef = useRef<number | null>(null);
  const isFrameDirtyRef = useRef(false);
  const drawingPointerIdRef = useRef<number | null>(null);
  const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());

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
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(sourceCanvas, 0, 0, w, h);
    });
  }, [setRenderFn, getFrameVpZoom]);

  useEffect(() => {
    return onFrameViewportChange(() => {
      requestRender();
    });
  }, [onFrameViewportChange, requestRender]);

  useEffect(() => {
    setFrameVpPan({ x: 0, y: 0 });
    setHasDrawn(false);
  }, [editFrameId, setFrameVpPan]);

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
    if (!currentFrame?.imageData) {
      frameCanvasRef.current = null;
      frameCtxRef.current = null;
      currentFrameIdRef.current = null;
      isFrameDirtyRef.current = false;
      return;
    }

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
  }, [currentFrame?.id, currentFrame?.imageData, requestRender]);

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

      const rect = canvas.getBoundingClientRect();
      const style = getComputedStyle(canvas);
      const borderLeft = parseFloat(style.borderLeftWidth) || 0;
      const borderTop = parseFloat(style.borderTopWidth) || 0;
      const borderRight = parseFloat(style.borderRightWidth) || 0;
      const borderBottom = parseFloat(style.borderBottomWidth) || 0;

      const contentWidth = rect.width - borderLeft - borderRight;
      const contentHeight = rect.height - borderTop - borderBottom;

      if (contentWidth <= 0 || contentHeight <= 0) return null;

      const scaleX = canvas.width / contentWidth;
      const scaleY = canvas.height / contentHeight;

      const zoom = getFrameVpZoom();
      const x = Math.floor(((clientX - rect.left - borderLeft) * scaleX) / zoom);
      const y = Math.floor(((clientY - rect.top - borderTop) * scaleY) / zoom);

      return { x, y };
    },
    [getFrameVpZoom]
  );

  const drawPixel = useCallback(
    (x: number, y: number, color: string, isEraser = false, pressure: number = 1) => {
      const frameCtx = frameCtxRef.current;
      const frameCanvas = frameCanvasRef.current;
      if (!frameCtx || !frameCanvas) return false;

      const params = calculateDrawingParameters(
        Number.isFinite(pressure) ? Math.max(0.01, Math.min(1, pressure)) : 1,
        activePreset,
        brushSize,
        pressureEnabled,
      );

      frameCtx.save();
      if (isEraser) {
        frameCtx.globalCompositeOperation = "destination-out";
      }

      sharedDrawDab(frameCtx, {
        x,
        y,
        radius: params.size / 2,
        hardness: brushHardness / 100,
        color,
        alpha: params.opacity * params.flow,
        isEraser,
      });

      frameCtx.restore();
      isFrameDirtyRef.current = true;
      return true;
    },
    [activePreset, brushHardness, brushSize, pressureEnabled]
  );

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInteractiveElement =
        target.tagName === "BUTTON" ||
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.code === "Space" && !e.repeat && !isInteractiveElement) {
        e.preventDefault();
        setIsPanning(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsPanning(false);
        frameEndPanDrag();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [frameEndPanDrag]);

  const handleContainerPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") {
        activeTouchPointerIdsRef.current.add(e.pointerId);
      }

      const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
      if (isTouchPanOnlyInput && !e.isPrimary) {
        return;
      }

      if (activeTouchPointerIdsRef.current.size > 1) {
        frameEndPanDrag();
        return;
      }

      if (isPanning || toolMode === "hand" || isTouchPanOnlyInput) {
        e.preventDefault();
        frameStartPanDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [isPanning, toolMode, isPanLocked, frameStartPanDrag, frameEndPanDrag]
  );

  const handleContainerPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch" && activeTouchPointerIdsRef.current.size > 1) {
        frameEndPanDrag();
        return;
      }

      if (frameIsPanDragging()) {
        frameUpdatePanDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [frameIsPanDragging, frameUpdatePanDrag, frameEndPanDrag]
  );

  const handleContainerPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") {
        activeTouchPointerIdsRef.current.delete(e.pointerId);
      }
      if (activeTouchPointerIdsRef.current.size <= 1) {
        frameEndPanDrag();
      }
      if (drawingPointerIdRef.current === e.pointerId) {
        drawingPointerIdRef.current = null;
        setIsDrawing(false);
        commitFrameEdits();
      }
    },
    [frameEndPanDrag, commitFrameEdits]
  );

  const handleCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!currentFrame) return;

      if (e.pointerType === "touch") {
        activeTouchPointerIdsRef.current.add(e.pointerId);
      }

      if (activeTouchPointerIdsRef.current.size > 1) {
        setIsDrawing(false);
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

      if (isBrushTool) {
        if (!hasDrawn) {
          pushHistory();
          setHasDrawn(true);
        }

        drawingPointerIdRef.current = e.pointerId;
        setIsDrawing(true);
        const pressure = e.pointerType === "pen" ? Math.max(0.01, e.pressure || 1) : 1;
        if (drawPixel(coords.x, coords.y, brushColor, isEraserTool, pressure)) {
          requestRender();
        }
        lastMousePosRef.current = { x: coords.x, y: coords.y };

        safeSetPointerCapture(e.currentTarget, e.pointerId);
      }
    },
    [
      currentFrame,
      isPanLocked,
      toolMode,
      isPanning,
      isEyedropperTool,
      isBrushTool,
      hasDrawn,
      getPixelCoordinates,
      pickColor,
      pushHistory,
      drawPixel,
      brushColor,
      isEraserTool,
      requestRender,
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

      if (!isDrawing || drawingPointerIdRef.current !== e.pointerId || !currentFrame) return;
      if (!isBrushTool) return;

      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (!coords) return;

      const lineDx = coords.x - lastMousePosRef.current.x;
      const lineDy = coords.y - lastMousePosRef.current.y;
      const steps = Math.max(Math.abs(lineDx), Math.abs(lineDy));

      if (steps > 0) {
        const pressure = e.pointerType === "pen" ? Math.max(0.01, e.pressure || 1) : 1;
        for (let i = 1; i <= steps; i++) {
          const x = Math.round(lastMousePosRef.current.x + (lineDx * i) / steps);
          const y = Math.round(lastMousePosRef.current.y + (lineDy * i) / steps);
          drawPixel(x, y, brushColor, isEraserTool, pressure);
        }
        requestRender();
      }

      lastMousePosRef.current = { x: coords.x, y: coords.y };
    },
    [isDrawing, currentFrame, isBrushTool, getPixelCoordinates, drawPixel, brushColor, isEraserTool, requestRender]
  );

  const handleCanvasPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
    }

    safeReleasePointerCapture(e.currentTarget, e.pointerId);

    if (drawingPointerIdRef.current === e.pointerId) {
      drawingPointerIdRef.current = null;
      setIsDrawing(false);
      commitFrameEdits();
    }
  }, [commitFrameEdits]);

  const handleCanvasPointerEnter = useCallback(() => {
    setIsOverCanvas(true);
  }, []);

  const handleCanvasPointerLeave = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === "touch") {
      activeTouchPointerIdsRef.current.delete(e.pointerId);
    }
    setIsOverCanvas(false);
    setCursorPos(null);
    if (drawingPointerIdRef.current === e.pointerId) {
      drawingPointerIdRef.current = null;
      setIsDrawing(false);
      commitFrameEdits();
    }
  }, [commitFrameEdits]);

  const isHandMode = toolMode === "hand" || isPanning;

  const getContainerCursor = () => {
    if (isHandMode) {
      return frameIsPanDragging() ? "grabbing" : "grab";
    }
    if (isEyedropperTool) {
      return "crosshair";
    }
    return "default";
  };

  const currentZoom = viewportSync.zoom;

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
              transform: `translate(calc(-50% + ${viewportSync.pan.x}px), calc(-50% + ${viewportSync.pan.y}px))`,
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
                cursor: isEyedropperTool ? "crosshair" : "none",
                pointerEvents: isHandMode ? "none" : "auto",
                touchAction: "none",
              }}
            />
            {isOverCanvas &&
              cursorPos &&
              !isHandMode &&
              isBrushTool && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: cursorPos.x,
                    top: cursorPos.y,
                    width: brushSize * currentZoom,
                    height: brushSize * currentZoom,
                    transform: "translate(-50%, -50%)",
                    border:
                      isEraserTool ? "2px solid #f87171" : `2px solid ${brushColor}`,
                    borderRadius: "2px",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                  }}
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
