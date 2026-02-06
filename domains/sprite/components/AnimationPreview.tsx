"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { ImageDropZone, NumberScrubber } from "../../../shared/components";
import { compositeFrame } from "../utils/compositor";

// ============================================
// Component
// ============================================

export default function AnimationPreviewContent() {
  const {
    tracks, fps, toolMode, getMaxFrameCount,
    addTrack, pushHistory,
    setPendingVideoFile, setIsVideoImportOpen,
    previewZoom, setPreviewZoom, previewPan, setPreviewPan,
  } = useEditor();
  const { t } = useLanguage();

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [bgType, setBgType] = useState<"checkerboard" | "solid" | "image">("checkerboard");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [compositedDataUrl, setCompositedDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const previewZoomRef = useRef(previewZoom);
  const panRef = useRef(previewPan);

  // Sync refs with state for synchronous access in event handlers
  useEffect(() => { previewZoomRef.current = previewZoom; }, [previewZoom]);
  useEffect(() => { panRef.current = previewPan; }, [previewPan]);

  const maxFrameCount = getMaxFrameCount();
  const hasContent = maxFrameCount > 0;

  // Preset colors for quick selection
  const presetColors = [
    { color: "#000000", label: t.colorBlack },
    { color: "#FFFFFF", label: t.colorWhite },
    { color: "#808080", label: t.colorGray },
    { color: "#87CEEB", label: t.colorSky },
    { color: "#90EE90", label: t.colorGreen },
    { color: "#FFB6C1", label: t.colorPink },
  ];

  // Handle background image upload
  const handleBgImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setBgImage(src);
      setBgType("image");
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  // File drag-and-drop import
  const handleFileDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsFileDragOver(true);
  }, []);

  const handleFileDragLeave = useCallback((e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsFileDragOver(false);
  }, []);

  const handleFileDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsFileDragOver(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    // Check for video files
    const videoFile = files.find((f) => f.type.startsWith("video/"));
    if (videoFile) {
      setPendingVideoFile(videoFile);
      setIsVideoImportOpen(true);
      return;
    }

    // Handle image files → create new track
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      pushHistory();
      const loadPromises = imageFiles.map(
        (file) =>
          new Promise<{ imageData: string; name: string }>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              resolve({
                imageData: ev.target?.result as string,
                name: file.name.replace(/\.[^/.]+$/, ""),
              });
            };
            reader.readAsDataURL(file);
          })
      );
      Promise.all(loadPromises).then((results) => {
        const newFrames = results.map((r, idx) => ({
          id: Date.now() + idx,
          points: [] as { x: number; y: number }[],
          name: r.name,
          imageData: r.imageData,
          offset: { x: 0, y: 0 },
        }));
        addTrack("Image Import", newFrames);
      });
    }
  }, [addTrack, pushHistory, setPendingVideoFile, setIsVideoImportOpen]);

  // Handle file select from ImageDropZone (click-to-browse or drag-drop on empty state)
  const handleFileSelect = useCallback((files: File[]) => {
    if (files.length === 0) return;

    const videoFile = files.find((f) => f.type.startsWith("video/"));
    if (videoFile) {
      setPendingVideoFile(videoFile);
      setIsVideoImportOpen(true);
      return;
    }

    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    if (imageFiles.length > 0) {
      pushHistory();
      const loadPromises = imageFiles.map(
        (file) =>
          new Promise<{ imageData: string; name: string }>((resolve) => {
            const reader = new FileReader();
            reader.onload = (ev) => {
              resolve({
                imageData: ev.target?.result as string,
                name: file.name.replace(/\.[^/.]+$/, ""),
              });
            };
            reader.readAsDataURL(file);
          })
      );
      Promise.all(loadPromises).then((results) => {
        const newFrames = results.map((r, idx) => ({
          id: Date.now() + idx,
          points: [] as { x: number; y: number }[],
          name: r.name,
          imageData: r.imageData,
          offset: { x: 0, y: 0 },
        }));
        addTrack("Image Import", newFrames);
      });
    }
  }, [addTrack, pushHistory, setPendingVideoFile, setIsVideoImportOpen]);

  // Wheel zoom - 마우스 커서 위치 기준 확대/축소 (uses refs for synchronous state)
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const currentZoom = previewZoomRef.current;
      const currentPan = panRef.current;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      // Calculate image coordinates under cursor (before zoom)
      const canvasTopLeftX = containerWidth / 2 + currentPan.x - canvasWidth / 2;
      const canvasTopLeftY = containerHeight / 2 + currentPan.y - canvasHeight / 2;

      const imageX = (mouseX - canvasTopLeftX) / currentZoom;
      const imageY = (mouseY - canvasTopLeftY) / currentZoom;

      // Calculate new zoom
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoom = Math.max(0.1, Math.min(20, currentZoom * delta));

      if (newZoom === currentZoom) return;

      // New canvas size
      const newCanvasWidth = (canvasWidth / currentZoom) * newZoom;
      const newCanvasHeight = (canvasHeight / currentZoom) * newZoom;

      // Calculate new pan to keep image point under cursor
      const newPanX = mouseX - containerWidth / 2 + newCanvasWidth / 2 - imageX * newZoom;
      const newPanY = mouseY - containerHeight / 2 + newCanvasHeight / 2 - imageY * newZoom;

      // Update refs synchronously for fast consecutive events
      previewZoomRef.current = newZoom;
      panRef.current = { x: newPanX, y: newPanY };

      setPreviewZoom(newZoom);
      setPreviewPan({ x: newPanX, y: newPanY });
    },
    [],
  );

  // Register wheel event - include hasContent to re-attach when container appears
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel, hasContent]);

  // Animation playback
  useEffect(() => {
    if (!isPlaying || maxFrameCount === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % maxFrameCount);
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, fps, maxFrameCount]);

  // Composite current frame from all tracks
  useEffect(() => {
    if (maxFrameCount === 0) {
      setCompositedDataUrl(null);
      return;
    }

    let cancelled = false;
    compositeFrame(tracks, currentFrameIndex).then((result) => {
      if (!cancelled) {
        setCompositedDataUrl(result?.dataUrl ?? null);
      }
    });

    return () => { cancelled = true; };
  }, [tracks, currentFrameIndex, maxFrameCount]);

  // Draw composited frame to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !compositedDataUrl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * previewZoom;
      canvas.height = img.height * previewZoom;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = compositedDataUrl;
  }, [compositedDataUrl, previewZoom]);

  const handlePrev = useCallback(() => {
    if (maxFrameCount === 0) return;
    setCurrentFrameIndex((prev) => (prev - 1 + maxFrameCount) % maxFrameCount);
  }, [maxFrameCount]);

  const handleNext = useCallback(() => {
    if (maxFrameCount === 0) return;
    setCurrentFrameIndex((prev) => (prev + 1) % maxFrameCount);
  }, [maxFrameCount]);

  // 스페이스바 패닝 기능
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 버튼, input 등에 포커스가 있으면 스페이스바 패닝 무시
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

  // 손 툴 또는 스페이스바로 패닝 활성화
  const isHandMode = toolMode === "hand" || isPanning;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning || toolMode === "hand") {
        e.preventDefault();
        setIsDragging(true);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [isPanning, toolMode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        setPreviewPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [isDragging, setPreviewPan],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 커서 결정
  const getCursor = () => {
    if (isHandMode) {
      return isDragging ? "grabbing" : "grab";
    }
    return "default";
  };

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
            ref={containerRef}
            className={`flex-1 overflow-hidden relative ${bgType === "checkerboard" ? "checkerboard" : ""}`}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{
              cursor: getCursor(),
              backgroundColor: bgType === "solid" ? bgColor : undefined,
            }}
          >
            {/* Background image */}
            {bgType === "image" && bgImage && (
              <img
                src={bgImage}
                alt="background"
                className="absolute inset-0 w-full h-full object-cover pointer-events-none"
              />
            )}
            {compositedDataUrl ? (
              <canvas
                ref={canvasRef}
                className="absolute border border-border-default"
                style={{
                  cursor: getCursor(),
                  pointerEvents: isHandMode ? "none" : "auto",
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${previewPan.x}px), calc(-50% + ${previewPan.y}px))`,
                }}
              />
            ) : null}
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
          <div className="p-3 border-t border-border-default space-y-3">
            {/* Playback controls and Zoom */}
            <div className="flex items-center gap-2">
              <button
                onClick={handlePrev}
                className="px-3 py-1.5 bg-interactive-default hover:bg-interactive-hover rounded-lg text-sm transition-colors"
              >
                ◀
              </button>
              <button
                onClick={() => setIsPlaying(!isPlaying)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors ${
                  isPlaying
                    ? "bg-accent-danger hover:bg-accent-danger-hover"
                    : "bg-accent-primary hover:bg-accent-primary-hover"
                }`}
              >
                {isPlaying ? `⏸ ${t.pause}` : `▶ ${t.play}`}
              </button>
              <button
                onClick={handleNext}
                className="px-3 py-1.5 bg-interactive-default hover:bg-interactive-hover rounded-lg text-sm transition-colors"
              >
                ▶
              </button>

              <div className="flex-1" />

              <NumberScrubber
                value={previewZoom}
                onChange={setPreviewZoom}
                min={0.1}
                max={20}
                step={{ multiply: 1.25 }}
                format={(v) => `${Math.round(v * 100)}%`}
                size="sm"
                variant="zoom"
              />
            </div>

            {/* Background selector */}
            <div className="flex items-center gap-2 text-sm">
              <span className="text-text-secondary whitespace-nowrap">{t.background}:</span>
              <button
                onClick={() => setBgType("checkerboard")}
                className={`w-6 h-6 rounded-lg border-2 checkerboard transition-colors ${
                  bgType === "checkerboard" ? "border-accent-primary" : "border-border-default"
                }`}
                title={t.transparent}
              />
              {presetColors.map(({ color, label }) => (
                <button
                  key={color}
                  onClick={() => {
                    setBgType("solid");
                    setBgColor(color);
                  }}
                  className={`w-6 h-6 rounded-lg border-2 transition-colors ${
                    bgType === "solid" && bgColor === color
                      ? "border-accent-primary"
                      : "border-border-default"
                  }`}
                  style={{ backgroundColor: color }}
                  title={label}
                />
              ))}
              <input
                type="color"
                value={bgColor}
                onChange={(e) => {
                  setBgType("solid");
                  setBgColor(e.target.value);
                }}
                className="w-6 h-6 rounded-lg cursor-pointer border-0 p-0"
                title={t.customColor}
              />
              <div className="border-l border-border-default h-4 mx-1" />
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleBgImageUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`px-2 py-0.5 rounded-lg border-2 text-xs transition-colors ${
                  bgType === "image"
                    ? "border-accent-primary bg-accent-primary/20"
                    : "border-border-default hover:bg-interactive-hover"
                }`}
                title={t.uploadBgImage}
              >
                {t.image}
              </button>
              {bgType === "image" && bgImage && (
                <button
                  onClick={() => {
                    setBgImage(null);
                    setBgType("checkerboard");
                  }}
                  className="px-1.5 py-0.5 rounded-lg border border-border-default hover:bg-interactive-hover text-xs text-text-secondary transition-colors"
                  title={t.removeBgImage}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Frame info */}
            <div className="text-center text-xs text-text-tertiary">
              {`${t.frame} ${currentFrameIndex + 1} / ${maxFrameCount}`}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
