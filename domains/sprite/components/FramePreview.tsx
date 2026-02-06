"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";

// ============================================
// Icon Components
// ============================================

const BrushIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
);

const EyedropperIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"
    />
  </svg>
);

const EraserIcon = () => (
  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
    <path d="M16.24 3.56l4.95 4.94c.78.79.78 2.05 0 2.84L12 20.53a4.008 4.008 0 01-5.66 0L2.81 17c-.78-.79-.78-2.05 0-2.84l10.6-10.6c.79-.78 2.05-.78 2.83 0zm-1.41 1.42L6.34 13.47l4.24 4.24 8.49-8.49-4.24-4.24zM3.75 18h5l-3.54-3.53-1.46 1.46c-.39.39-.39 1.02 0 1.41l.66.66H3.75z" />
  </svg>
);

// ============================================
// Types
// ============================================

type EditToolMode = "brush" | "eyedropper" | "eraser";

// ============================================
// Component
// ============================================

export default function FramePreviewContent() {
  const {
    frames,
    setFrames,
    currentFrameIndex,
    setCurrentFrameIndex,
    pushHistory,
    toolMode,
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    frameEditZoom,
    setFrameEditZoom,
    frameEditPan,
    setFrameEditPan,
  } = useEditor();
  const { t } = useLanguage();

  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [editToolMode, setEditToolMode] = useState<EditToolMode>("brush");
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const originalImageRef = useRef<HTMLImageElement | null>(null);

  const validFrames = frames.filter((f) => f.imageData);
  const currentFrame = validFrames[currentFrameIndex];

  // Reset pan when frame changes
  useEffect(() => {
    setFrameEditPan({ x: 0, y: 0 });
    setHasDrawn(false);
  }, [currentFrameIndex, setFrameEditPan]);

  // Load original image when frame changes
  useEffect(() => {
    if (!currentFrame?.imageData) {
      originalImageRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      originalImageRef.current = img;
    };
    img.src = currentFrame.imageData;
  }, [currentFrame?.imageData]);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      const canvasTopLeftX = containerWidth / 2 + frameEditPan.x - canvasWidth / 2;
      const canvasTopLeftY = containerHeight / 2 + frameEditPan.y - canvasHeight / 2;

      const imageX = (mouseX - canvasTopLeftX) / frameEditZoom;
      const imageY = (mouseY - canvasTopLeftY) / frameEditZoom;

      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(20, frameEditZoom * delta));

      if (newZoom === frameEditZoom) return;

      const newCanvasWidth = (canvasWidth / frameEditZoom) * newZoom;
      const newCanvasHeight = (canvasHeight / frameEditZoom) * newZoom;

      const newPanX = mouseX - containerWidth / 2 + newCanvasWidth / 2 - imageX * newZoom;
      const newPanY = mouseY - containerHeight / 2 + newCanvasHeight / 2 - imageY * newZoom;

      setFrameEditZoom(newZoom);
      setFrameEditPan({ x: newPanX, y: newPanY });
    },
    [frameEditPan, frameEditZoom, setFrameEditZoom, setFrameEditPan],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  // Draw preview canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentFrame?.imageData) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * frameEditZoom;
      canvas.height = img.height * frameEditZoom;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, img.width * frameEditZoom, img.height * frameEditZoom);
    };
    img.src = currentFrame.imageData;
  }, [currentFrame, frameEditZoom]);

  const handlePrev = useCallback(() => {
    if (validFrames.length > 0) {
      setCurrentFrameIndex((currentFrameIndex - 1 + validFrames.length) % validFrames.length);
    }
  }, [currentFrameIndex, validFrames.length, setCurrentFrameIndex]);

  const handleNext = useCallback(() => {
    if (validFrames.length > 0) {
      setCurrentFrameIndex((currentFrameIndex + 1) % validFrames.length);
    }
  }, [currentFrameIndex, validFrames.length, setCurrentFrameIndex]);

  // Get pixel coordinates from mouse event
  const getPixelCoordinates = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
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

      const scaleX = canvas.width / contentWidth;
      const scaleY = canvas.height / contentHeight;

      const x = Math.floor(((e.clientX - rect.left - borderLeft) * scaleX) / frameEditZoom);
      const y = Math.floor(((e.clientY - rect.top - borderTop) * scaleY) / frameEditZoom);

      return { x, y };
    },
    [frameEditZoom],
  );

  // Draw pixel on canvas
  const drawPixel = useCallback(
    (x: number, y: number, color: string, isEraser = false) => {
      if (!currentFrame?.imageData || !originalImageRef.current) return;

      const img = originalImageRef.current;
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = img.width;
      tempCanvas.height = img.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;

      // Draw existing image data
      const existingImg = new Image();
      existingImg.onload = () => {
        tempCtx.drawImage(existingImg, 0, 0);

        // Draw the new pixel(s) based on brush size
        const halfSize = Math.floor(brushSize / 2);
        for (let dx = -halfSize; dx <= halfSize; dx++) {
          for (let dy = -halfSize; dy <= halfSize; dy++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && px < tempCanvas.width && py >= 0 && py < tempCanvas.height) {
              if (isEraser) {
                tempCtx.clearRect(px, py, 1, 1);
              } else {
                tempCtx.fillStyle = color;
                tempCtx.fillRect(px, py, 1, 1);
              }
            }
          }
        }

        const newImageData = tempCanvas.toDataURL("image/png");
        setFrames((prev) =>
          prev.map((f) => (f.id === currentFrame.id ? { ...f, imageData: newImageData } : f)),
        );
      };
      existingImg.src = currentFrame.imageData;
    },
    [currentFrame, brushSize, setFrames],
  );

  // Pick color from canvas
  const pickColor = useCallback(
    (x: number, y: number) => {
      if (!currentFrame?.imageData) return;

      const img = new Image();
      img.onload = () => {
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = img.width;
        tempCanvas.height = img.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;

        tempCtx.drawImage(img, 0, 0);
        const pixel = tempCtx.getImageData(x, y, 1, 1).data;

        if (pixel[3] > 0) {
          const hex = `#${pixel[0].toString(16).padStart(2, "0")}${pixel[1]
            .toString(16)
            .padStart(2, "0")}${pixel[2].toString(16).padStart(2, "0")}`;
          setBrushColor(hex);
        }
      };
      img.src = currentFrame.imageData;
    },
    [currentFrame, setBrushColor],
  );

  // Canvas mouse handlers for drawing
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!currentFrame) return;

      const coords = getPixelCoordinates(e);
      if (!coords) return;

      if (editToolMode === "eyedropper") {
        pickColor(coords.x, coords.y);
        return;
      }

      if (editToolMode === "brush" || editToolMode === "eraser") {
        if (!hasDrawn) {
          pushHistory();
          setHasDrawn(true);
        }
        setIsDrawing(true);
        drawPixel(coords.x, coords.y, brushColor, editToolMode === "eraser");
        lastMousePosRef.current = { x: coords.x, y: coords.y };
      }
    },
    [
      currentFrame,
      editToolMode,
      brushColor,
      hasDrawn,
      getPixelCoordinates,
      pickColor,
      drawPixel,
      pushHistory,
    ],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      // Update cursor position for the cursor overlay
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }

      if (!isDrawing || !currentFrame) return;

      if (editToolMode === "brush" || editToolMode === "eraser") {
        const coords = getPixelCoordinates(e);
        if (!coords) return;

        // Draw line from last point to current point
        const dx = coords.x - lastMousePosRef.current.x;
        const dy = coords.y - lastMousePosRef.current.y;
        const steps = Math.max(Math.abs(dx), Math.abs(dy));

        if (steps > 0) {
          for (let i = 1; i <= steps; i++) {
            const x = Math.round(lastMousePosRef.current.x + (dx * i) / steps);
            const y = Math.round(lastMousePosRef.current.y + (dy * i) / steps);
            drawPixel(x, y, brushColor, editToolMode === "eraser");
          }
        }

        lastMousePosRef.current = { x: coords.x, y: coords.y };
      }
    },
    [isDrawing, currentFrame, editToolMode, brushColor, getPixelCoordinates, drawPixel],
  );

  const handleCanvasMouseUp = useCallback(() => {
    setIsDrawing(false);
  }, []);

  const handleCanvasMouseEnter = useCallback(() => {
    setIsOverCanvas(true);
  }, []);

  const handleCanvasMouseLeave = useCallback(() => {
    setIsOverCanvas(false);
    setCursorPos(null);
  }, []);

  // Spacebar panning
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
        setIsDragging(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  const handleContainerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning || toolMode === "hand") {
        e.preventDefault();
        setIsDragging(true);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [isPanning, toolMode],
  );

  const handleContainerMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        setFrameEditPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [isDragging, setFrameEditPan],
  );

  const handleContainerMouseUp = useCallback(() => {
    setIsDragging(false);
    setIsDrawing(false);
  }, []);

  const isHandMode = toolMode === "hand" || isPanning;

  // Container cursor - always visible
  const getContainerCursor = () => {
    if (isHandMode) {
      return isDragging ? "grabbing" : "grab";
    }
    return "default";
  };

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Tool bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border-default bg-surface-secondary">
        {/* Edit tools */}
        <div className="flex gap-1 bg-surface-tertiary rounded p-1">
          <button
            onClick={() => setEditToolMode("brush")}
            className={`p-1.5 rounded ${
              editToolMode === "brush"
                ? "bg-accent-primary text-white"
                : "hover:bg-interactive-hover"
            }`}
            title={t.brushDraw}
          >
            <BrushIcon />
          </button>
          <button
            onClick={() => setEditToolMode("eraser")}
            className={`p-1.5 rounded ${
              editToolMode === "eraser"
                ? "bg-accent-primary text-white"
                : "hover:bg-interactive-hover"
            }`}
            title={t.eraser}
          >
            <EraserIcon />
          </button>
          <button
            onClick={() => setEditToolMode("eyedropper")}
            className={`p-1.5 rounded ${
              editToolMode === "eyedropper"
                ? "bg-accent-primary text-white"
                : "hover:bg-interactive-hover"
            }`}
            title={t.colorPickerTip}
          >
            <EyedropperIcon />
          </button>
        </div>

        <div className="h-6 w-px bg-border-default" />

        {/* Color picker */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t.color}:</label>
          <input
            type="color"
            value={brushColor}
            onChange={(e) => setBrushColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer border border-border-default"
            style={{ backgroundColor: brushColor }}
          />
          <span className="text-xs text-text-secondary font-mono">{brushColor}</span>
        </div>

        <div className="h-6 w-px bg-border-default" />

        {/* Brush size */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-text-secondary">{t.size}:</label>
          <input
            type="range"
            min="1"
            max="10"
            value={brushSize}
            onChange={(e) => setBrushSize(Number(e.target.value))}
            className="w-16 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
          />
          <span className="text-xs text-text-secondary w-4">{brushSize}</span>
        </div>
      </div>

      {/* Preview area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden checkerboard relative"
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onMouseLeave={handleContainerMouseUp}
        style={{ cursor: getContainerCursor() }}
      >
        {currentFrame?.imageData ? (
          <div
            className="absolute"
            style={{
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${frameEditPan.x}px), calc(-50% + ${frameEditPan.y}px))`,
            }}
          >
            <canvas
              ref={canvasRef}
              onMouseDown={isHandMode ? undefined : handleCanvasMouseDown}
              onMouseMove={isHandMode ? undefined : handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseLeave}
              onMouseEnter={handleCanvasMouseEnter}
              style={{
                cursor: "none",
                pointerEvents: isHandMode ? "none" : "auto",
              }}
            />
            {/* Brush cursor overlay */}
            {isOverCanvas &&
              cursorPos &&
              !isHandMode &&
              (editToolMode === "brush" || editToolMode === "eraser") && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: cursorPos.x,
                    top: cursorPos.y,
                    width: brushSize * frameEditZoom,
                    height: brushSize * frameEditZoom,
                    transform: "translate(-50%, -50%)",
                    border:
                      editToolMode === "eraser" ? "2px solid #f87171" : `2px solid ${brushColor}`,
                    borderRadius: "2px",
                    boxShadow: "0 0 0 1px rgba(0,0,0,0.5)",
                  }}
                />
              )}
            {/* Eyedropper cursor */}
            {isOverCanvas &&
              cursorPos &&
              !isHandMode &&
              editToolMode === "eyedropper" && (
                <div
                  className="pointer-events-none absolute"
                  style={{
                    left: cursorPos.x,
                    top: cursorPos.y,
                    width: 16,
                    height: 16,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <svg
                    className="w-4 h-4 text-white drop-shadow-lg"
                    fill="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01" />
                  </svg>
                </div>
              )}
          </div>
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm">
            {t.selectFrame}
          </div>
        )}
      </div>

      {/* Control area */}
      <div className="p-3 border-t border-border-default space-y-3">
        {/* Frame navigation */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={handlePrev}
            className="px-3 py-1.5 bg-interactive-default hover:bg-interactive-hover rounded text-sm transition-colors"
            disabled={validFrames.length === 0}
          >
            ◀ {t.previous}
          </button>
          <span className="px-4 text-sm text-text-primary">
            {validFrames.length > 0 ? `${currentFrameIndex + 1} / ${validFrames.length}` : "-"}
          </span>
          <button
            onClick={handleNext}
            className="px-3 py-1.5 bg-interactive-default hover:bg-interactive-hover rounded text-sm transition-colors"
            disabled={validFrames.length === 0}
          >
            {t.next} ▶
          </button>
        </div>

        {/* Zoom control */}
        <div className="flex items-center justify-center gap-1 text-sm">
          <button
            onClick={() => setFrameEditZoom((z) => Math.max(0.1, z * 0.8))}
            className="p-1 hover:bg-interactive-hover rounded transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 12h14" /></svg>
          </button>
          <span className="text-xs w-10 text-center text-text-primary">{Math.round(frameEditZoom * 100)}%</span>
          <button
            onClick={() => setFrameEditZoom((z) => Math.min(20, z * 1.25))}
            className="p-1 hover:bg-interactive-hover rounded transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
          </button>
        </div>

        {/* Frame name */}
        {currentFrame && (
          <div className="text-center text-xs text-text-tertiary">{currentFrame.name}</div>
        )}
      </div>
    </div>
  );
}
