"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { ImageDropZone, Popover } from "../../../shared/components";
import { StepBackwardIcon, StepForwardIcon, PlayIcon, PauseIcon } from "../../../shared/components/icons";
import { compositeFrame } from "../utils/compositor";
import { useCanvasViewport } from "../../../shared/hooks/useCanvasViewport";
import { useRenderScheduler } from "../../../shared/hooks/useRenderScheduler";
import { useSpriteViewportStore, useSpriteUIStore } from "../stores";

// Background icon for popover trigger
const BackgroundPatternIcon: React.FC<{ className?: string }> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6" height="6" opacity="0.8" />
    <rect x="9" y="1" width="6" height="6" opacity="0.3" />
    <rect x="1" y="9" width="6" height="6" opacity="0.3" />
    <rect x="9" y="9" width="6" height="6" opacity="0.8" />
  </svg>
);

// ============================================
// Frame Indicator (editable)
// ============================================

function FrameIndicator({
  currentIndex,
  maxCount,
  onChange,
}: {
  currentIndex: number;
  maxCount: number;
  onChange: (index: number) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    setEditValue(String(currentIndex + 1));
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleSubmit = () => {
    const num = parseInt(editValue, 10);
    if (!isNaN(num) && num >= 1 && num <= maxCount) {
      onChange(num - 1);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") setIsEditing(false);
        }}
        className="w-12 text-xs text-center bg-surface-tertiary border border-border-default rounded px-1 py-0.5"
        autoFocus
      />
    );
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      className="text-xs text-text-secondary cursor-default select-none tabular-nums"
      title="Double-click to edit"
    >
      {currentIndex + 1}/{maxCount}
    </span>
  );
}

// ============================================
// Component
// ============================================

export default function AnimationPreviewContent() {
  const {
    tracks, fps, toolMode, getMaxFrameCount,
    addTrack, pushHistory,
    setPendingVideoFile, setIsVideoImportOpen,
    isPlaying, setIsPlaying,
  } = useEditor();
  const { t } = useLanguage();

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

  // Extract stable references from viewport (useCallback-backed, stable across re-renders)
  const {
    onViewportChange: onAnimViewportChange,
    setZoom: setAnimVpZoom,
    setPan: setAnimVpPan,
    getZoom: getAnimVpZoom,
    startPanDrag: animStartPanDrag,
    updatePanDrag: animUpdatePanDrag,
    endPanDrag: animEndPanDrag,
    isPanDragging: animIsPanDragging,
    wheelRef: animWheelRef,
    pinchRef: animPinchRef,
  } = viewport;

  // ---- Sync viewport to Zustand store for autosave (debounced, no subscription) ----
  const isAutosaveLoading = useSpriteUIStore((s) => s.isAutosaveLoading);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const unsub = onAnimViewportChange((state) => {
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = setTimeout(() => {
        const store = useSpriteViewportStore.getState();
        store.setAnimPreviewZoom(state.zoom);
        store.setAnimPreviewPan(state.pan);
      }, 1000);
    });
    return () => {
      unsub();
      if (syncTimeoutRef.current) clearTimeout(syncTimeoutRef.current);
    };
  }, [onAnimViewportChange]);

  // Restore viewport from autosave on load
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || isAutosaveLoading) return;
    restoredRef.current = true;
    const { animPreviewZoom, animPreviewPan } = useSpriteViewportStore.getState();
    if (animPreviewZoom > 0) {
      setAnimVpZoom(animPreviewZoom);
      setAnimVpPan(animPreviewPan);
    }
  }, [isAutosaveLoading, setAnimVpZoom, setAnimVpPan]);

  // ---- Render scheduler (RAF-based, replaces useEffect rendering) ----
  const { requestRender, setRenderFn } = useRenderScheduler(containerRef);

  // Register render function
  useEffect(() => {
    setRenderFn(() => {
      const canvas = canvasRef.current;
      const img = compositedImgRef.current;
      if (!canvas || !img || !img.complete || img.naturalWidth === 0) return;

      const zoom = getAnimVpZoom();
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
  }, [setRenderFn, getAnimVpZoom]);

  // Subscribe viewport changes → render
  useEffect(() => {
    return onAnimViewportChange(() => {
      requestRender();
    });
  }, [onAnimViewportChange, requestRender]);

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

  // Helper: find next non-disabled frame index across all tracks
  const findNextEnabledFrame = useCallback(
    (current: number, direction: 1 | -1): number => {
      if (maxFrameCount === 0) return 0;
      let next = ((current + direction) % maxFrameCount + maxFrameCount) % maxFrameCount;
      let checked = 0;
      while (checked < maxFrameCount) {
        // Check if any visible track has a non-disabled frame at this index
        const allDisabled = tracks
          .filter((t) => t.visible && t.frames.length > 0)
          .every((t) => {
            const idx = next < t.frames.length ? next : t.loop ? next % t.frames.length : -1;
            return idx === -1 || t.frames[idx]?.disabled;
          });
        if (!allDisabled) return next;
        next = ((next + direction) % maxFrameCount + maxFrameCount) % maxFrameCount;
        checked++;
      }
      return current; // all frames disabled, stay put
    },
    [tracks, maxFrameCount],
  );

  // Animation playback
  useEffect(() => {
    if (!isPlaying || maxFrameCount === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => findNextEnabledFrame(prev, 1));
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, fps, maxFrameCount, findNextEnabledFrame]);

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
    setCurrentFrameIndex((prev) => findNextEnabledFrame(prev, -1));
  }, [maxFrameCount, findNextEnabledFrame]);

  const handleNext = useCallback(() => {
    if (maxFrameCount === 0) return;
    setCurrentFrameIndex((prev) => findNextEnabledFrame(prev, 1));
  }, [maxFrameCount, findNextEnabledFrame]);

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
        animEndPanDrag();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [animEndPanDrag]);

  // 손 툴 또는 스페이스바로 패닝 활성화
  const isHandMode = toolMode === "hand" || isPanning;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning || toolMode === "hand") {
        e.preventDefault();
        animStartPanDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [isPanning, toolMode, animStartPanDrag],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (animIsPanDragging()) {
        animUpdatePanDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [animIsPanDragging, animUpdatePanDrag],
  );

  const handleMouseUp = useCallback(() => {
    animEndPanDrag();
  }, [animEndPanDrag]);

  // 커서 결정
  const getCursor = () => {
    if (isHandMode) {
      return animIsPanDragging() ? "grabbing" : "grab";
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
              animWheelRef(el);
              animPinchRef(el);
            }}
            className="flex-1 overflow-hidden relative bg-surface-secondary"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ cursor: getCursor() }}
          >
            {compositedDataUrl ? (
              <div
                className={`absolute border border-border-default overflow-hidden ${bgType === "checkerboard" ? "checkerboard" : ""}`}
                style={{
                  left: "50%",
                  top: "50%",
                  transform: `translate(calc(-50% + ${viewportSync.pan.x}px), calc(-50% + ${viewportSync.pan.y}px))`,
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
                  className="block relative"
                  style={{
                    cursor: getCursor(),
                    pointerEvents: isHandMode ? "none" : "auto",
                  }}
                />
              </div>
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
          <div className="px-2 py-1.5 border-t border-border-default">
            <div className="relative flex items-center">
              {/* Left: Frame indicator + Background */}
              <div className="flex items-center gap-1.5">
                <FrameIndicator
                  currentIndex={currentFrameIndex}
                  maxCount={maxFrameCount}
                  onChange={setCurrentFrameIndex}
                />
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
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        onClick={() => setBgType("checkerboard")}
                        className={`w-6 h-6 rounded border-2 checkerboard transition-colors ${
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
                          className={`w-6 h-6 rounded border-2 transition-colors ${
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
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0"
                        title={t.customColor}
                      />
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
                  onClick={() => setIsPlaying(!isPlaying)}
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

              {/* Right: Zoom controls */}
              <div className="ml-auto flex items-center gap-1">
                <button
                  onClick={() => setAnimVpZoom(Math.max(0.1, getAnimVpZoom() * 0.8))}
                  className="p-1 hover:bg-interactive-hover rounded transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M5 12h14" /></svg>
                </button>
                <span className="text-xs w-10 text-center text-text-primary">{Math.round(viewportSync.zoom * 100)}%</span>
                <button
                  onClick={() => setAnimVpZoom(Math.min(20, getAnimVpZoom() * 1.25))}
                  className="p-1 hover:bg-interactive-hover rounded transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeWidth={2} d="M12 5v14M5 12h14" /></svg>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
