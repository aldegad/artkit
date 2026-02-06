"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { ImageDropZone } from "../../../shared/components";
import { compositeFrame } from "../utils/compositor";
import { useCanvasViewport } from "../../../shared/hooks/useCanvasViewport";
import { useRenderScheduler } from "../../../shared/hooks/useRenderScheduler";

// ============================================
// Component
// ============================================

export default function AnimationPreviewContent() {
  const {
    tracks, fps, setFps, toolMode, getMaxFrameCount,
    addTrack, pushHistory,
    setPendingVideoFile, setIsVideoImportOpen,
  } = useEditor();
  const { t } = useLanguage();

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [isPanning, setIsPanning] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [bgType, setBgType] = useState<"checkerboard" | "solid" | "image">("checkerboard");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [compositedDataUrl, setCompositedDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Composited image ref for rendering without re-creating Image objects
  const compositedImgRef = useRef<HTMLImageElement | null>(null);

  const maxFrameCount = getMaxFrameCount();
  const hasContent = maxFrameCount > 0;

  // ---- Viewport (ref-based zoom/pan, no React re-renders for viewport changes) ----
  const viewport = useCanvasViewport({
    containerRef,
    canvasRef,
    contentSize: { width: 1, height: 1 },
    config: { origin: "center", minZoom: 0.1, maxZoom: 20, wheelZoomFactor: 0.1 },
    initial: { zoom: 2 },
    enableWheel: true,
    enablePinch: true,
  });

  // Throttled React state for UI display only (zoom %, CSS transform)
  const viewportSync = viewport.useReactSync(16);

  // ---- Render scheduler (RAF-based, replaces useEffect rendering) ----
  const { requestRender, setRenderFn } = useRenderScheduler(containerRef);

  // Register render function
  useEffect(() => {
    setRenderFn(() => {
      const canvas = canvasRef.current;
      const img = compositedImgRef.current;
      if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

      const zoom = viewport.getZoom();
      const w = img.width * zoom;
      const h = img.height * zoom;

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, w, h);
    });
  }, [setRenderFn, viewport]);

  // Subscribe viewport changes → render
  useEffect(() => {
    return viewport.onViewportChange(() => {
      requestRender();
    });
  }, [viewport, requestRender]);

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

  // Load composited image and trigger render
  useEffect(() => {
    if (!compositedDataUrl) {
      compositedImgRef.current = null;
      return;
    }

    const img = new Image();
    img.onload = () => {
      compositedImgRef.current = img;
      requestRender();
    };
    img.src = compositedDataUrl;
  }, [compositedDataUrl, requestRender]);

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
        viewport.endPanDrag();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [viewport]);

  // 손 툴 또는 스페이스바로 패닝 활성화
  const isHandMode = toolMode === "hand" || isPanning;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning || toolMode === "hand") {
        e.preventDefault();
        viewport.startPanDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [isPanning, toolMode, viewport],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (viewport.isPanDragging()) {
        viewport.updatePanDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [viewport],
  );

  const handleMouseUp = useCallback(() => {
    viewport.endPanDrag();
  }, [viewport]);

  // 커서 결정
  const getCursor = () => {
    if (isHandMode) {
      return viewport.isPanDragging() ? "grabbing" : "grab";
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
            ref={(el) => {
              containerRef.current = el;
              viewport.wheelRef(el);
              viewport.pinchRef(el);
            }}
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
                  transform: `translate(calc(-50% + ${viewportSync.pan.x}px), calc(-50% + ${viewportSync.pan.y}px))`,
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
            {/* Playback controls */}
            <div className="flex items-center justify-center gap-2">
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
            </div>

            {/* FPS & Zoom controls */}
            <div className="flex items-center gap-4 text-sm">
              <div className="flex items-center gap-2 flex-1">
                <span className="text-text-secondary whitespace-nowrap">FPS:</span>
                <input
                  type="range"
                  min="1"
                  max="30"
                  value={fps}
                  onChange={(e) => setFps(Number(e.target.value))}
                  className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
                />
                <span className="w-8 text-center text-text-primary">{fps}</span>
              </div>

              <div className="flex items-center gap-1">
                <button
                  onClick={() => viewport.setZoom(Math.max(0.1, viewport.getZoom() * 0.8))}
                  className="p-1 hover:bg-interactive-hover rounded transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 12h14" /></svg>
                </button>
                <span className="text-xs w-10 text-center text-text-primary">{Math.round(viewportSync.zoom * 100)}%</span>
                <button
                  onClick={() => viewport.setZoom(Math.min(20, viewport.getZoom() * 1.25))}
                  className="p-1 hover:bg-interactive-hover rounded transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
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
