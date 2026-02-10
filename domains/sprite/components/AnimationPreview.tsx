"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useEditorTools, useEditorBrush, useEditorHistory, useEditorWindows } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { ImageDropZone, Popover } from "../../../shared/components";
import {
  StepBackwardIcon,
  StepForwardIcon,
  PlayIcon,
  PauseIcon,
  PlusIcon,
  MinusIcon,
  BackgroundPatternIcon,
} from "../../../shared/components/icons";
import { compositeFrame } from "../utils/compositor";
import { useCanvasViewport } from "../../../shared/hooks/useCanvasViewport";
import { useCanvasViewportPersistence } from "../../../shared/hooks/useCanvasViewportPersistence";
import { useRenderScheduler } from "../../../shared/hooks/useRenderScheduler";
import { useSpriteViewportStore, useSpriteUIStore, useSpriteTrackStore } from "../stores";
import { SPRITE_PREVIEW_VIEWPORT } from "../constants";

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
  const tracks = useSpriteTrackStore((s) => s.tracks);
  const addTrack = useSpriteTrackStore((s) => s.addTrack);
  const isPlaying = useSpriteTrackStore((s) => s.isPlaying);
  const setIsPlaying = useSpriteTrackStore((s) => s.setIsPlaying);
  const storeFrameIndex = useSpriteTrackStore((s) => s.currentFrameIndex);
  const setStoreFrameIndex = useSpriteTrackStore((s) => s.setCurrentFrameIndex);
  const activeTrackId = useSpriteTrackStore((s) => s.activeTrackId);
  const { toolMode, frameEditToolMode, isPanLocked } = useEditorTools();
  const { setBrushColor } = useEditorBrush();
  const { pushHistory } = useEditorHistory();
  const { setPendingVideoFile, setIsVideoImportOpen } = useEditorWindows();
  const { t } = useLanguage();

  const [isPanning, setIsPanning] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [bgType, setBgType] = useState<"checkerboard" | "solid" | "image">("checkerboard");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [hasCompositedFrame, setHasCompositedFrame] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());

  // Keep the latest composited frame as a canvas to avoid image re-decoding per frame.
  const compositedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const currentFrameIndex = storeFrameIndex;
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
    startPanDrag: animStartPanDrag,
    updatePanDrag: animUpdatePanDrag,
    endPanDrag: animEndPanDrag,
    isPanDragging: animIsPanDragging,
    wheelRef: animWheelRef,
    pinchRef: animPinchRef,
  } = viewport;

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

  // Register render function
  useEffect(() => {
    setRenderFn(() => {
      const canvas = canvasRef.current;
      const sourceCanvas = compositedCanvasRef.current;
      if (!canvas || !sourceCanvas) return;

      const zoom = getAnimVpZoom();
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

    // Ensure first paint after autosave restore even if a render was requested
    // before the scheduler render function was registered.
    requestRender();
  }, [setRenderFn, getAnimVpZoom, requestRender]);

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

  // Composite current frame from all tracks
  useEffect(() => {
    if (isAutosaveLoading) {
      return;
    }

    if (maxEnabledCount === 0) {
      compositedCanvasRef.current = null;
      setHasCompositedFrame(false);
      return;
    }

    const visualIndex = currentVisualIndex >= 0 ? currentVisualIndex : 0;
    let cancelled = false;
    compositeFrame(enabledTracks, visualIndex, undefined, { includeDataUrl: false }).then((result) => {
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
          void compositeFrame(enabledTracks, nextVisualIndex, undefined, { includeDataUrl: false });
        }
      }
    });

    return () => { cancelled = true; };
  }, [isAutosaveLoading, enabledTracks, currentVisualIndex, maxEnabledCount, requestRender]);

  // Autosave restore can toggle hasCompositedFrame after initial scheduler tick.
  // Trigger another paint once the canvas is visibly mounted.
  useEffect(() => {
    if (!hasCompositedFrame) return;
    requestAnimationFrame(() => {
      requestRender();
    });
  }, [hasCompositedFrame, requestRender]);

  const handlePrev = useCallback(() => {
    if (activeEnabledIndices.length === 0) return;
    setStoreFrameIndex((prev: number) => {
      const current = activeEnabledIndices.indexOf(prev);
      const base = current >= 0 ? current : 0;
      const next = (base - 1 + activeEnabledIndices.length) % activeEnabledIndices.length;
      return activeEnabledIndices[next] ?? prev;
    });
  }, [activeEnabledIndices, setStoreFrameIndex]);

  const handleNext = useCallback(() => {
    if (activeEnabledIndices.length === 0) return;
    setStoreFrameIndex((prev: number) => {
      const current = activeEnabledIndices.indexOf(prev);
      const base = current >= 0 ? current : 0;
      const next = (base + 1) % activeEnabledIndices.length;
      return activeEnabledIndices[next] ?? prev;
    });
  }, [activeEnabledIndices, setStoreFrameIndex]);

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

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") {
        activeTouchPointerIdsRef.current.add(e.pointerId);
      }

      const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
      if (isTouchPanOnlyInput && !e.isPrimary) {
        return;
      }

      if (activeTouchPointerIdsRef.current.size > 1) {
        animEndPanDrag();
        return;
      }

      if (isPanning || toolMode === "hand" || isTouchPanOnlyInput) {
        e.preventDefault();
        animStartPanDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [isPanning, toolMode, isPanLocked, animStartPanDrag, animEndPanDrag],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch" && activeTouchPointerIdsRef.current.size > 1) {
        animEndPanDrag();
        return;
      }

      if (animIsPanDragging()) {
        animUpdatePanDrag({ x: e.clientX, y: e.clientY });
      }
    },
    [animIsPanDragging, animUpdatePanDrag, animEndPanDrag],
  );

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === "touch") {
        activeTouchPointerIdsRef.current.delete(e.pointerId);
      }
      if (activeTouchPointerIdsRef.current.size <= 1) {
        animEndPanDrag();
      }
    },
    [animEndPanDrag],
  );

  const handlePreviewCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
      if (isTouchPanOnlyInput || isHandMode || frameEditToolMode !== "eyedropper") {
        return;
      }

      const sourceCanvas = compositedCanvasRef.current;
      const displayCanvas = canvasRef.current;
      if (!sourceCanvas || !displayCanvas) return;

      const rect = displayCanvas.getBoundingClientRect();
      const zoom = getAnimVpZoom();
      if (zoom <= 0) return;

      const srcX = Math.floor((e.clientX - rect.left) / zoom);
      const srcY = Math.floor((e.clientY - rect.top) / zoom);
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
    [frameEditToolMode, getAnimVpZoom, isHandMode, isPanLocked, setBrushColor],
  );

  // 커서 결정
  const getCursor = () => {
    if (isHandMode) {
      return animIsPanDragging() ? "grabbing" : "grab";
    }
    if (frameEditToolMode === "eyedropper") {
      return "crosshair";
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
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            onPointerCancel={handlePointerUp}
            style={{ cursor: getCursor(), touchAction: "none" }}
          >
            {hasCompositedFrame ? (
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
                  onPointerDown={handlePreviewCanvasPointerDown}
                  className="block relative"
                  style={{
                    cursor: getCursor(),
                    pointerEvents: isHandMode ? "none" : "auto",
                    touchAction: "none",
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
                {maxEnabledCount > 0 ? (
                  <FrameIndicator
                    currentIndex={currentVisualIndex >= 0 ? currentVisualIndex : 0}
                    maxCount={maxEnabledCount}
                    onChange={(visualIndex) => {
                      const target = activeEnabledIndices[visualIndex];
                      if (target !== undefined) setStoreFrameIndex(target);
                    }}
                  />
                ) : (
                  <span className="text-xs text-text-secondary cursor-default select-none tabular-nums">—/—</span>
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
                  onClick={() =>
                    setAnimVpZoom(
                      Math.max(
                        SPRITE_PREVIEW_VIEWPORT.MIN_ZOOM,
                        getAnimVpZoom() * SPRITE_PREVIEW_VIEWPORT.ZOOM_STEP_OUT
                      )
                    )
                  }
                  className="p-1 hover:bg-interactive-hover rounded transition-colors"
                >
                  <MinusIcon className="w-3.5 h-3.5" />
                </button>
                <span className="text-xs w-10 text-center text-text-primary">{Math.round(viewportSync.zoom * 100)}%</span>
                <button
                  onClick={() =>
                    setAnimVpZoom(
                      Math.min(
                        SPRITE_PREVIEW_VIEWPORT.MAX_ZOOM,
                        getAnimVpZoom() * SPRITE_PREVIEW_VIEWPORT.ZOOM_STEP_IN
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
        </div>
      )}
    </div>
  );
}
