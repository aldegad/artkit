"use client";

import { useEffect, useCallback, useState, DragEvent } from "react";
import { useEditor } from "../../contexts/EditorContext";
import { useTheme } from "../../contexts/ThemeContext";
import { Point, SpriteFrame } from "../../types";
import ImageDropZone from "../ImageDropZone";

// ============================================
// Helper Functions
// ============================================

function getBoundingBox(points: Point[]) {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys),
  };
}

function isPointInPolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x,
      yi = polygon[i].y;
    const xj = polygon[j].x,
      yj = polygon[j].y;

    if (yi > point.y !== yj > point.y && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

// ============================================
// Component
// ============================================

export default function CanvasContent() {
  const {
    imageSrc,
    setImageSrc,
    imageSize,
    setImageSize,
    imageRef,
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    currentPoints,
    setCurrentPoints,
    toolMode,
    selectedFrameId,
    setSelectedFrameId,
    selectedPointIndex,
    setSelectedPointIndex,
    scale,
    setScale,
    zoom,
    setZoom,
    pan,
    setPan,
    isSpacePressed,
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    isPanning,
    setIsPanning,
    lastPanPoint,
    setLastPanPoint,
    canvasRef,
    canvasContainerRef,
    didPanOrDragRef,
  } = useEditor();

  // Get current theme for canvas redraw
  const { resolvedTheme } = useTheme();

  // Resize counter to trigger redraw when container resizes
  const [resizeCounter, setResizeCounter] = useState(0);

  // Drag and drop state
  const [isDragOver, setIsDragOver] = useState(false);

  // Handle file drop for image upload
  const handleFileDrop = useCallback(
    (file: File) => {
      if (!file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        setImageSrc(src);
        setCurrentPoints([]); // 새 이미지 로드 시 그리던 영역 초기화
        // 프레임 데이터는 유지하고 폴리곤(points)만 초기화 (캔버스에 안 그려짐)
        setFrames((prev) => prev.map((frame) => ({ ...frame, points: [] })));

        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.width, height: img.height });
          imageRef.current = img;

          const maxWidth = 900;
          const newScale = Math.min(maxWidth / img.width, 1);
          setScale(newScale);
          setZoom(1);
          setPan({ x: 0, y: 0 });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);
    },
    [setImageSrc, setImageSize, imageRef, setScale, setZoom, setPan, setCurrentPoints, setFrames],
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

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      const files = e.dataTransfer.files;
      if (files.length > 0) {
        handleFileDrop(files[0]);
      }
    },
    [handleFileDrop],
  );

  // ResizeObserver to detect container size changes
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      setResizeCounter((c) => c + 1);
    });

    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
    };
  }, [canvasContainerRef]);

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
      setResizeCounter((c) => c + 1);
    };
    img.src = imageSrc;
  }, [imageSrc, imageRef]);

  // Coordinate transforms
  const screenToImage = useCallback(
    (screenX: number, screenY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };

      const rect = canvas.getBoundingClientRect();
      const x = (screenX - rect.left - pan.x) / (scale * zoom);
      const y = (screenY - rect.top - pan.y) / (scale * zoom);

      return { x: Math.round(x), y: Math.round(y) };
    },
    [canvasRef, pan, scale, zoom],
  );

  const imageToScreen = useCallback(
    (imgX: number, imgY: number): Point => {
      return {
        x: imgX * scale * zoom + pan.x,
        y: imgY * scale * zoom + pan.y,
      };
    },
    [scale, zoom, pan],
  );

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

  // Canvas drawing
  useEffect(() => {
    if (!canvasRef.current || !canvasContainerRef.current || !imageRef.current || !imageSrc) return;

    const canvas = canvasRef.current;
    const container = canvasContainerRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imageRef.current;
    const displayWidth = img.width * scale * zoom;
    const displayHeight = img.height * scale * zoom;

    canvas.width = container.clientWidth;
    canvas.height = container.clientHeight;

    // Checkerboard background - read CSS variables
    const computedStyle = getComputedStyle(document.documentElement);
    const checkerLight = computedStyle.getPropertyValue("--checkerboard-light").trim() || "#ffffff";
    const checkerDark = computedStyle.getPropertyValue("--checkerboard-dark").trim() || "#e5e7eb";

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

    // Draw image
    ctx.drawImage(img, pan.x, pan.y, displayWidth, displayHeight);

    // Draw saved frame polygons
    frames.forEach((frame, idx) => {
      if (frame.points.length < 2) return;

      const isSelected = frame.id === selectedFrameId;

      ctx.beginPath();
      const startScreen = imageToScreen(frame.points[0].x, frame.points[0].y);
      ctx.moveTo(startScreen.x, startScreen.y);

      frame.points.slice(1).forEach((p) => {
        const screen = imageToScreen(p.x, p.y);
        ctx.lineTo(screen.x, screen.y);
      });
      ctx.closePath();

      ctx.fillStyle = isSelected
        ? "rgba(0, 150, 255, 0.25)"
        : `hsla(${(idx * 60) % 360}, 70%, 50%, 0.15)`;
      ctx.fill();
      ctx.strokeStyle = isSelected ? "#00aaff" : `hsl(${(idx * 60) % 360}, 70%, 50%)`;
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.stroke();

      // Frame number
      const centerX = frame.points.reduce((sum, p) => sum + p.x, 0) / frame.points.length;
      const centerY = frame.points.reduce((sum, p) => sum + p.y, 0) / frame.points.length;
      const centerScreen = imageToScreen(centerX, centerY);

      ctx.fillStyle = isSelected ? "#00aaff" : `hsl(${(idx * 60) % 360}, 70%, 50%)`;
      ctx.beginPath();
      ctx.arc(centerScreen.x, centerScreen.y, 12, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#fff";
      ctx.font = "bold 11px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(idx + 1), centerScreen.x, centerScreen.y);

      // Selected frame points
      if (isSelected && toolMode === "select") {
        frame.points.forEach((p, pIdx) => {
          const screen = imageToScreen(p.x, p.y);
          ctx.beginPath();
          ctx.arc(screen.x, screen.y, 7, 0, Math.PI * 2);
          ctx.fillStyle = pIdx === selectedPointIndex ? "#ff0000" : "#00aaff";
          ctx.fill();
          ctx.strokeStyle = "#fff";
          ctx.lineWidth = 2;
          ctx.stroke();
        });
      }
    });

    // Draw current polygon
    if (currentPoints.length > 0 && toolMode === "pen") {
      ctx.beginPath();
      const startScreen = imageToScreen(currentPoints[0].x, currentPoints[0].y);
      ctx.moveTo(startScreen.x, startScreen.y);

      currentPoints.slice(1).forEach((p) => {
        const screen = imageToScreen(p.x, p.y);
        ctx.lineTo(screen.x, screen.y);
      });

      ctx.strokeStyle = "#00ff00";
      ctx.lineWidth = 2;
      ctx.stroke();

      currentPoints.forEach((p, idx) => {
        const screen = imageToScreen(p.x, p.y);
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, 5, 0, Math.PI * 2);
        ctx.fillStyle = idx === 0 ? "#ff0000" : "#00ff00";
        ctx.fill();
        ctx.strokeStyle = "#fff";
        ctx.lineWidth = 1;
        ctx.stroke();
      });
    }
  }, [
    imageSrc,
    currentPoints,
    frames,
    scale,
    zoom,
    pan,
    selectedFrameId,
    selectedPointIndex,
    toolMode,
    canvasRef,
    canvasContainerRef,
    imageRef,
    imageToScreen,
    resizeCounter, // Trigger redraw on container resize
    resolvedTheme, // Trigger redraw on theme change
  ]);

  // Canvas click handler
  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (didPanOrDragRef.current) {
        didPanOrDragRef.current = false;
        return;
      }
      if (isPanning || isDragging) return;

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
      isPanning,
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
        setIsPanning(true);
        setLastPanPoint({ x: e.clientX, y: e.clientY });
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
      setIsPanning,
      setLastPanPoint,
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
      if (isPanning) {
        const dx = e.clientX - lastPanPoint.x;
        const dy = e.clientY - lastPanPoint.y;
        if (dx !== 0 || dy !== 0) {
          didPanOrDragRef.current = true;
        }
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        setLastPanPoint({ x: e.clientX, y: e.clientY });
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
      isPanning,
      lastPanPoint,
      setPan,
      setLastPanPoint,
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
    setIsPanning(false);
    setIsDragging(false);
  }, [isDragging, selectedFrameId, setFrames, extractFrameImage, setIsPanning, setIsDragging]);

  // Wheel zoom
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const imgX = (mouseX - pan.x) / (scale * zoom);
      const imgY = (mouseY - pan.y) / (scale * zoom);

      const delta = e.deltaY > 0 ? 0.97 : 1.03;
      const newZoom = Math.max(0.1, Math.min(5, zoom * delta));

      const newPanX = mouseX - imgX * scale * newZoom;
      const newPanY = mouseY - imgY * scale * newZoom;

      setZoom(newZoom);
      setPan({ x: newPanX, y: newPanY });
    },
    [canvasRef, pan, scale, zoom, setZoom, setPan],
  );

  // Register wheel event
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
    };
  }, [canvasRef, handleWheel]);

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
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            className={`w-full h-full rounded border border-border-default ${
              isSpacePressed || toolMode === "hand"
                ? isPanning
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
          onFileSelect={(files) => files[0] && handleFileDrop(files[0])}
        />
      )}
    </div>
  );
}
