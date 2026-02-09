"use client";

import { useEffect, useCallback, useRef, useState, DragEvent } from "react";
import { useEditorImage, useEditorFramesMeta, useEditorTools, useEditorViewport, useEditorDrag, useEditorRefs } from "../contexts/SpriteEditorContext";
import { useTheme } from "../../../shared/contexts";
import { Point, SpriteFrame } from "../types";
import { getBoundingBox, isPointInPolygon } from "../utils/geometry";
import { ImageDropZone } from "../../../shared/components";
import { getCanvasColorsSync } from "@/shared/hooks";
import { useSpriteUIStore } from "../stores/useSpriteUIStore";
import { useCanvasViewport } from "@/shared/hooks/useCanvasViewport";
import { useRenderScheduler } from "@/shared/hooks/useRenderScheduler";

// ============================================
// Component
// ============================================

export default function CanvasContent() {
  const { imageSrc, setImageSrc, imageSize, setImageSize, imageRef } = useEditorImage();
  const {
    frames, setFrames, nextFrameId, setNextFrameId,
    selectedFrameId, setSelectedFrameId, selectedPointIndex, setSelectedPointIndex,
  } = useEditorFramesMeta();
  const { toolMode, currentPoints, setCurrentPoints, isSpacePressed } = useEditorTools();
  const { zoom, pan, scale, setScale, setZoom, setPan } = useEditorViewport();
  const { isDragging, setIsDragging, dragStart, setDragStart, didPanOrDragRef } = useEditorDrag();
  const { canvasRef, canvasContainerRef } = useEditorRefs();

  // Get current theme for canvas redraw
  const { resolvedTheme } = useTheme();

  // Track theme changes with a ref for the render function
  const resolvedThemeRef = useRef(resolvedTheme);
  resolvedThemeRef.current = resolvedTheme;

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // ---- Shared viewport hook ----
  const viewport = useCanvasViewport({
    containerRef: canvasContainerRef,
    canvasRef,
    contentSize: { width: imageSize.width, height: imageSize.height },
    config: {
      origin: "topLeft",
      minZoom: 0.1,
      maxZoom: 5,
      wheelZoomFactor: 0.03,
    },
    enableWheel: true,
    enablePinch: true,
  });

  // Extract stable references from viewport (useCallback-backed, won't change on re-render)
  const {
    onViewportChange,
    updateTransform,
    wheelRef: viewportWheelRef,
    pinchRef: viewportPinchRef,
  } = viewport;

  // ---- Shared render scheduler ----
  const { requestRender, setRenderFn } = useRenderScheduler(canvasContainerRef);

  // Track last synced values to prevent infinite sync loops
  const lastViewportSyncRef = useRef({ zoom: 1, pan: { x: 0, y: 0 }, baseScale: 1 });

  // Forward sync: viewport (wheel/pinch) → Zustand store (for autosave)
  useEffect(() => {
    return onViewportChange((state) => {
      lastViewportSyncRef.current = { zoom: state.zoom, pan: { ...state.pan }, baseScale: state.baseScale };
      setZoom(state.zoom);
      setPan(state.pan);
      setScale(state.baseScale);
    });
  }, [onViewportChange, setZoom, setPan, setScale]);

  // Reverse sync: Zustand store (autosave restore, external changes) → viewport
  useEffect(() => {
    const last = lastViewportSyncRef.current;
    if (zoom === last.zoom && pan.x === last.pan.x && pan.y === last.pan.y && scale === last.baseScale) return;
    lastViewportSyncRef.current = { zoom, pan: { ...pan }, baseScale: scale };
    updateTransform({ zoom, pan, baseScale: scale });
  }, [zoom, pan, scale, updateTransform]);

  // Merge wheel + canvas ref callbacks
  const canvasCallbackRef = useCallback(
    (el: HTMLCanvasElement | null) => {
      canvasRef.current = el;
      viewportWheelRef(el);
      viewportPinchRef(el);
    },
    [canvasRef, viewportWheelRef, viewportPinchRef],
  );

  // ---- Coordinate transforms via viewport ----
  const screenToImage = useCallback(
    (screenX: number, screenY: number): Point => {
      const result = viewport.screenToContent({ x: screenX, y: screenY });
      return { x: Math.round(result.x), y: Math.round(result.y) };
    },
    [viewport],
  );

  const imageToScreen = useCallback(
    (imgX: number, imgY: number): Point => {
      return viewport.contentToScreen({ x: imgX, y: imgY });
    },
    [viewport],
  );

  // Handle file drop for image upload - sets as main sprite image
  const handleFileDrop = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;

        setImageSrc(src);
        setCurrentPoints([]);
        setFrames((prev) => prev.map((frame) => ({ ...frame, points: [] })));

        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.width, height: img.height });
          imageRef.current = img;

          const maxWidth = 900;
          const newScale = Math.min(maxWidth / img.width, 1);
          viewport.updateTransform({
            baseScale: newScale,
            zoom: 1,
            pan: { x: 0, y: 0 },
          });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [setImageSrc, setImageSize, imageRef, viewport, setCurrentPoints, setFrames],
  );

  // Drag event handlers
  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  }, []);

  const { setPendingVideoFile, setIsVideoImportOpen } = useSpriteUIStore();

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        const file = files[0];
        if (file.type.startsWith("video/")) {
          setPendingVideoFile(file);
          setIsVideoImportOpen(true);
        } else {
          handleFileDrop(file);
        }
      }
    },
    [handleFileDrop, setPendingVideoFile, setIsVideoImportOpen],
  );

  // Load image when imageSrc changes (for autosave restore)
  useEffect(() => {
    if (!imageSrc) {
      imageRef.current = null;
      return;
    }

    // If imageRef is already set and matches current imageSrc, skip
    if (imageRef.current && imageRef.current.src === imageSrc) {
      return;
    }

    const img = new Image();
    img.onload = () => {
      imageRef.current = img;
      // Trigger a redraw
      requestRender();
    };
    img.src = imageSrc;
  }, [imageSrc, imageRef, requestRender]);

  // Check if near point
  const isNearPoint = useCallback(
    (p1: Point, p2: Point, threshold: number = 10): boolean => {
      const screen1 = imageToScreen(p1.x, p1.y);
      const screen2 = imageToScreen(p2.x, p2.y);
      return Math.hypot(screen1.x - screen2.x, screen1.y - screen2.y) < threshold;
    },
    [imageToScreen],
  );

  // Extract frame image
  const extractFrameImage = useCallback(
    (points: Point[]): string | undefined => {
      if (!imageRef.current || points.length < 3) return undefined;

      const img = imageRef.current;
      const bbox = getBoundingBox(points);
      const width = bbox.maxX - bbox.minX;
      const height = bbox.maxY - bbox.minY;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext("2d");
      if (!ctx) return undefined;

      ctx.beginPath();
      ctx.moveTo(points[0].x - bbox.minX, points[0].y - bbox.minY);
      points.slice(1).forEach((p) => {
        ctx.lineTo(p.x - bbox.minX, p.y - bbox.minY);
      });
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(img, bbox.minX, bbox.minY, width, height, 0, 0, width, height);

      return tempCanvas.toDataURL("image/png");
    },
    [imageRef],
  );

  // Complete frame
  const completeFrame = useCallback(() => {
    if (currentPoints.length < 3) return;

    const imageData = extractFrameImage(currentPoints);

    const newFrame: SpriteFrame = {
      id: nextFrameId,
      points: [...currentPoints],
      name: `Frame ${nextFrameId}`,
      imageData,
      offset: { x: 0, y: 0 },
    };

    setFrames((prev) => [...prev, newFrame]);
    setNextFrameId((prev) => prev + 1);
    setCurrentPoints([]);
  }, [currentPoints, nextFrameId, extractFrameImage, setFrames, setNextFrameId, setCurrentPoints]);

  // ---- Store refs for render function (avoids re-creating render fn on every state change) ----
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const currentPointsRef = useRef(currentPoints);
  currentPointsRef.current = currentPoints;
  const selectedFrameIdRef = useRef(selectedFrameId);
  selectedFrameIdRef.current = selectedFrameId;
  const selectedPointIndexRef = useRef(selectedPointIndex);
  selectedPointIndexRef.current = selectedPointIndex;
  const toolModeRef = useRef(toolMode);
  toolModeRef.current = toolMode;
  const imageSrcRef = useRef(imageSrc);
  imageSrcRef.current = imageSrc;

  // ---- Set up the render function (stable reference) ----
  useEffect(() => {
    setRenderFn(() => {
      if (!canvasRef.current || !canvasContainerRef.current || !imageRef.current || !imageSrcRef.current) return;

      const canvas = canvasRef.current;
      const container = canvasContainerRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const img = imageRef.current;
      const effectiveScale = viewport.getEffectiveScale();
      const pan = viewport.getPan();
      const displayWidth = img.width * effectiveScale;
      const displayHeight = img.height * effectiveScale;

      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;

      // Checkerboard background - read CSS variables
      const colors = getCanvasColorsSync();
      const checkerLight = colors.checkerboardLight;
      const checkerDark = colors.checkerboardDark;

      const checkerSize = 10;
      for (let y = 0; y < canvas.height; y += checkerSize) {
        for (let x = 0; x < canvas.width; x += checkerSize) {
          ctx.fillStyle =
            (Math.floor(x / checkerSize) + Math.floor(y / checkerSize)) % 2 === 0
              ? checkerLight
              : checkerDark;
          ctx.fillRect(x, y, checkerSize, checkerSize);
        }
      }

      // Draw main sprite image
      ctx.drawImage(img, pan.x, pan.y, displayWidth, displayHeight);

      // Helper: content -> canvas coordinates (using ref-backed viewport)
      const toScreen = (imgX: number, imgY: number): Point => {
        return viewport.contentToScreen({ x: imgX, y: imgY });
      };

      const _frames = framesRef.current;
      const _selectedFrameId = selectedFrameIdRef.current;
      const _selectedPointIndex = selectedPointIndexRef.current;
      const _toolMode = toolModeRef.current;
      const _currentPoints = currentPointsRef.current;

      // Draw saved frame polygons
      _frames.forEach((frame, idx) => {
        if (frame.points.length < 2) return;

        const isSelected = frame.id === _selectedFrameId;

        ctx.beginPath();
        const startScreen = toScreen(frame.points[0].x, frame.points[0].y);
        ctx.moveTo(startScreen.x, startScreen.y);

        frame.points.slice(1).forEach((p) => {
          const screen = toScreen(p.x, p.y);
          ctx.lineTo(screen.x, screen.y);
        });
        ctx.closePath();

        ctx.fillStyle = isSelected
          ? colors.selectionAltFill
          : `hsla(${(idx * 60) % 360}, 70%, 50%, 0.15)`;
        ctx.fill();
        ctx.strokeStyle = isSelected ? colors.selectionAlt : `hsl(${(idx * 60) % 360}, 70%, 50%)`;
        ctx.lineWidth = isSelected ? 3 : 2;
        ctx.stroke();

        // Frame number
        const centerX = frame.points.reduce((sum, p) => sum + p.x, 0) / frame.points.length;
        const centerY = frame.points.reduce((sum, p) => sum + p.y, 0) / frame.points.length;
        const centerScreen = toScreen(centerX, centerY);

        ctx.fillStyle = isSelected ? colors.selectionAlt : `hsl(${(idx * 60) % 360}, 70%, 50%)`;
        ctx.beginPath();
        ctx.arc(centerScreen.x, centerScreen.y, 12, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = colors.textOnColor;
        ctx.font = "bold 11px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(String(idx + 1), centerScreen.x, centerScreen.y);

        // Selected frame points
        if (isSelected && _toolMode === "select") {
          frame.points.forEach((p, pIdx) => {
            const screen = toScreen(p.x, p.y);
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = pIdx === _selectedPointIndex ? colors.toolHighlight : colors.selectionAlt;
            ctx.fill();
            ctx.strokeStyle = colors.textOnColor;
            ctx.lineWidth = 2;
            ctx.stroke();
          });
        }
      });

      // Draw current polygon
      if (_currentPoints.length > 0 && _toolMode === "pen") {
        ctx.beginPath();
        const startScreen = toScreen(_currentPoints[0].x, _currentPoints[0].y);
        ctx.moveTo(startScreen.x, startScreen.y);

        _currentPoints.slice(1).forEach((p) => {
          const screen = toScreen(p.x, p.y);
          ctx.lineTo(screen.x, screen.y);
        });

        ctx.strokeStyle = colors.toolDraw;
        ctx.lineWidth = 2;
        ctx.stroke();

        _currentPoints.forEach((p, idx) => {
          const screen = toScreen(p.x, p.y);
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
          ctx.fillStyle = idx === 0 ? colors.toolHighlight : colors.toolDraw;
          ctx.fill();
          ctx.strokeStyle = colors.textOnColor;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }
    });
  }, [canvasRef, canvasContainerRef, imageRef, viewport, setRenderFn]);

  // ---- Trigger render on content/state changes ----
  useEffect(() => {
    requestRender();
  }, [
    imageSrc,
    currentPoints,
    frames,
    selectedFrameId,
    selectedPointIndex,
    toolMode,
    resolvedTheme,
    requestRender,
  ]);

  // Subscribe to viewport changes to trigger re-render
  useEffect(() => {
    return onViewportChange(() => {
      requestRender();
    });
  }, [onViewportChange, requestRender]);

  // Canvas click handler
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (didPanOrDragRef.current) {
        didPanOrDragRef.current = false;
        return;
      }
      if (viewport.isPanDragging() || isDragging) return;

      const point = screenToImage(e.clientX, e.clientY);

      if (point.x < 0 || point.x > imageSize.width || point.y < 0 || point.y > imageSize.height) {
        return;
      }

      if (toolMode === "pen") {
        if (currentPoints.length >= 3) {
          const firstPoint = currentPoints[0];
          const screenFirst = imageToScreen(firstPoint.x, firstPoint.y);
          const screenClick = imageToScreen(point.x, point.y);
          const dist = Math.hypot(screenClick.x - screenFirst.x, screenClick.y - screenFirst.y);

          if (dist < 15) {
            completeFrame();
            return;
          }
        }
        setCurrentPoints((prev) => [...prev, point]);
      } else {
        // Selection mode
        if (selectedFrameId !== null) {
          const selectedFrame = frames.find((f) => f.id === selectedFrameId);
          if (selectedFrame) {
            for (let i = 0; i < selectedFrame.points.length; i++) {
              if (isNearPoint(point, selectedFrame.points[i], 12)) {
                setSelectedPointIndex(i);
                return;
              }
            }
          }
        }

        for (const frame of frames) {
          if (isPointInPolygon(point, frame.points)) {
            setSelectedFrameId(frame.id);
            setSelectedPointIndex(null);
            return;
          }
        }

        setSelectedFrameId(null);
        setSelectedPointIndex(null);
      }
    },
    [
      isDragging,
      screenToImage,
      imageSize,
      toolMode,
      currentPoints,
      imageToScreen,
      completeFrame,
      setCurrentPoints,
      selectedFrameId,
      frames,
      isNearPoint,
      setSelectedPointIndex,
      setSelectedFrameId,
      didPanOrDragRef,
      viewport,
    ],
  );

  // Mouse down handler
  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      didPanOrDragRef.current = false;

      if (
        e.button === 1 ||
        (e.button === 0 && e.altKey) ||
        (e.button === 0 && isSpacePressed) ||
        (e.button === 0 && toolMode === "hand")
      ) {
        viewport.startPanDrag({ x: e.clientX, y: e.clientY });
        e.preventDefault();
        return;
      }

      if (toolMode === "select" && e.button === 0) {
        const point = screenToImage(e.clientX, e.clientY);

        if (selectedFrameId !== null && selectedPointIndex !== null) {
          const selectedFrame = frames.find((f) => f.id === selectedFrameId);
          if (selectedFrame && isNearPoint(point, selectedFrame.points[selectedPointIndex], 12)) {
            setIsDragging(true);
            setDragStart(point);
            return;
          }
        }

        if (selectedFrameId !== null) {
          const selectedFrame = frames.find((f) => f.id === selectedFrameId);
          if (selectedFrame && isPointInPolygon(point, selectedFrame.points)) {
            setIsDragging(true);
            setDragStart(point);
            return;
          }
        }
      }
    },
    [
      isSpacePressed,
      toolMode,
      viewport,
      screenToImage,
      selectedFrameId,
      selectedPointIndex,
      frames,
      isNearPoint,
      setIsDragging,
      setDragStart,
      didPanOrDragRef,
    ],
  );

  // Mouse move handler
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (viewport.isPanDragging()) {
        didPanOrDragRef.current = true;
        viewport.updatePanDrag({ x: e.clientX, y: e.clientY });
        return;
      }

      if (isDragging && selectedFrameId !== null) {
        didPanOrDragRef.current = true;
        const point = screenToImage(e.clientX, e.clientY);
        const dx = point.x - dragStart.x;
        const dy = point.y - dragStart.y;

        setFrames((prev) =>
          prev.map((frame) => {
            if (frame.id !== selectedFrameId) return frame;

            if (selectedPointIndex !== null) {
              const newPoints = [...frame.points];
              newPoints[selectedPointIndex] = {
                x: newPoints[selectedPointIndex].x + dx,
                y: newPoints[selectedPointIndex].y + dy,
              };
              return { ...frame, points: newPoints };
            } else {
              const newPoints = frame.points.map((p) => ({
                x: p.x + dx,
                y: p.y + dy,
              }));
              return { ...frame, points: newPoints };
            }
          }),
        );
        setDragStart(point);
      }
    },
    [
      viewport,
      isDragging,
      selectedFrameId,
      screenToImage,
      dragStart,
      setFrames,
      selectedPointIndex,
      setDragStart,
      didPanOrDragRef,
    ],
  );

  // Mouse up handler
  const handleMouseUp = useCallback(() => {
    if (isDragging && selectedFrameId !== null) {
      setFrames((prev) =>
        prev.map((frame) => {
          if (frame.id !== selectedFrameId) return frame;
          const newImageData = extractFrameImage(frame.points);
          return { ...frame, imageData: newImageData };
        }),
      );
    }
    viewport.endPanDrag();
    setIsDragging(false);
  }, [isDragging, selectedFrameId, setFrames, extractFrameImage, viewport, setIsDragging]);

  return (
    <div
      ref={canvasContainerRef}
      className="w-full h-full overflow-hidden bg-surface-secondary relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {imageSrc ? (
        <>
          <canvas
            ref={canvasCallbackRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`w-full h-full rounded border border-border-default ${
              isSpacePressed || toolMode === "hand"
                ? viewport.isPanDragging()
                  ? "cursor-grabbing"
                  : "cursor-grab"
                : toolMode === "pen"
                  ? "cursor-crosshair"
                  : isDragging
                    ? "cursor-grabbing"
                    : "cursor-default"
            }`}
          />
          {/* 드래그 오버레이 - 이미지가 있을 때도 드래그 앤 드롭 피드백 표시 */}
          {isDragOver && (
            <div className="absolute inset-0 bg-accent-primary/50 border-2 border-dashed border-accent-primary flex items-center justify-center pointer-events-none">
              <div className="text-center">
                <svg
                  className="w-16 h-16 mx-auto mb-4 text-accent-primary"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={1.5}
                    d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                  />
                </svg>
                <p className="text-lg text-accent-primary">새 이미지로 교체</p>
              </div>
            </div>
          )}
        </>
      ) : (
        <ImageDropZone
          variant="sprite"
          accept="image/*,video/*"
          onFileSelect={(files) => {
            if (!files[0]) return;
            const file = files[0];
            if (file.type.startsWith("video/")) {
              setPendingVideoFile(file);
              setIsVideoImportOpen(true);
            } else {
              handleFileDrop(file);
            }
          }}
        />
      )}
    </div>
  );
}
