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
import { SPRITE_PREVIEW_VIEWPORT } from "../constants";
import { calculateDrawingParameters } from "@/domains/image/constants/brushPresets";
import { drawDab as sharedDrawDab } from "@/shared/utils/brushEngine";
import {
  createRectFromDrag,
  getRectHandleAtPosition,
  resizeRectByHandle,
  type RectHandle,
} from "@/shared/utils/rectTransform";
import {
  drawScaledImage,
  clampZoom,
  safeReleasePointerCapture,
  safeSetPointerCapture,
  type CanvasScaleScratch,
  zoomAtPoint,
} from "@/shared/utils";
import {
  computeMagicWandSelection,
  createMagicWandMaskCanvas,
  drawMagicWandSelectionOutline,
  isMagicWandPixelSelected,
  type MagicWandSelection,
} from "@/shared/utils/magicWand";
import { ASPECT_RATIO_VALUES } from "@/shared/types/aspectRatio";
import BrushCursorOverlay from "@/shared/components/BrushCursorOverlay";

const MAGIC_WAND_OVERLAY_ALPHA = 0.24;
const MAGIC_WAND_OUTLINE_DASH = [4, 4];
const MAGIC_WAND_OUTLINE_SPEED_MS = 140;
const FIT_TO_SCREEN_PADDING = 40;

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
  } = useEditorTools();
  const canvasSize = useSpriteUIStore((s) => s.canvasSize);
  const {
    brushColor,
    setBrushColor,
    brushSize,
    brushHardness,
    activePreset,
    pressureEnabled,
  } = useEditorBrush();
  const { pushHistory } = useEditorHistory();
  const { setPendingVideoFile, setIsVideoImportOpen } = useEditorWindows();
  const { t } = useLanguage();

  const [isPanning, setIsPanning] = useState(false);
  const [isFileDragOver, setIsFileDragOver] = useState(false);
  const [bgType, setBgType] = useState<"checkerboard" | "solid" | "image">("checkerboard");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [hasCompositedFrame, setHasCompositedFrame] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);
  const [cursorPos, setCursorPos] = useState<{ x: number; y: number } | null>(null);
  const [isOverCanvas, setIsOverCanvas] = useState(false);
  const [cropCursor, setCropCursor] = useState<string>("crosshair");
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeTouchPointerIdsRef = useRef<Set<number>>(new Set());
  const drawingPointerIdRef = useRef<number | null>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const magicWandSelectionRef = useRef<MagicWandSelection | null>(null);
  const magicWandMaskCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const magicWandSeedRef = useRef<{ x: number; y: number } | null>(null);
  const dabBufferCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dabBufferCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const cropDragRef = useRef<{
    mode: "none" | "create" | "move" | "resize";
    pointerStart: { x: number; y: number };
    cropStart: { x: number; y: number; width: number; height: number } | null;
    resizeHandle: RectHandle | null;
  }>({
    mode: "none",
    pointerStart: { x: 0, y: 0 },
    cropStart: null,
    resizeHandle: null,
  });
  const originalCropAreaRef = useRef<{ x: number; y: number; width: number; height: number } | null>(null);

  // Keep the latest composited frame as a canvas to avoid image re-decoding per frame.
  const compositedCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Editable frame buffer used when brush/eraser is active.
  const editFrameCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editFrameCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  const scaleScratchRef = useRef<CanvasScaleScratch>({ primary: null, secondary: null });
  const currentEditTrackIdRef = useRef<string | null>(null);
  const currentEditFrameIdRef = useRef<number | null>(null);
  const isEditFrameDirtyRef = useRef(false);

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

      const p = padding ?? FIT_TO_SCREEN_PADDING;
      const maxWidth = container.clientWidth - p;
      const maxHeight = container.clientHeight - p;
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

  const clearMagicWandSelection = useCallback(() => {
    magicWandSelectionRef.current = null;
    magicWandMaskCanvasRef.current = null;
    magicWandSeedRef.current = null;
    requestRender();
  }, [requestRender]);

  const ensureDabBufferCanvas = useCallback((width: number, height: number) => {
    if (
      !dabBufferCanvasRef.current
      || dabBufferCanvasRef.current.width !== width
      || dabBufferCanvasRef.current.height !== height
      || !dabBufferCtxRef.current
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }
      ctx.imageSmoothingEnabled = false;
      dabBufferCanvasRef.current = canvas;
      dabBufferCtxRef.current = ctx;
    }

    return {
      canvas: dabBufferCanvasRef.current,
      ctx: dabBufferCtxRef.current,
    } as const;
  }, []);

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

      canvas.width = w;
      canvas.height = h;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      ctx.clearRect(0, 0, w, h);
      drawScaledImage(
        ctx,
        sourceCanvas,
        { x: 0, y: 0, width: w, height: h },
        {
          mode: "pixel-art",
          smoothingQuality: "low",
          progressiveMinify: false,
          scratch: scaleScratchRef.current,
        },
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
        const dashCycle = MAGIC_WAND_OUTLINE_DASH.reduce((sum, value) => sum + value, 0);
        const antsOffset = dashCycle > 0
          ? -((performance.now() / MAGIC_WAND_OUTLINE_SPEED_MS) % dashCycle)
          : 0;

        ctx.save();
        ctx.globalAlpha = MAGIC_WAND_OVERLAY_ALPHA;
        ctx.drawImage(selectionMaskCanvas, 0, 0, w, h);
        ctx.restore();

        drawMagicWandSelectionOutline(ctx, selection, {
          zoom,
          color: "rgba(0, 0, 0, 0.9)",
          lineWidth: 2,
          dash: MAGIC_WAND_OUTLINE_DASH,
          dashOffset: antsOffset,
        });
        drawMagicWandSelectionOutline(ctx, selection, {
          zoom,
          color: "rgba(255, 255, 255, 0.95)",
          lineWidth: 1,
          dash: MAGIC_WAND_OUTLINE_DASH,
          dashOffset: antsOffset + (dashCycle / 2),
        });
      }

      if (toolMode === "crop") {
        const activeCrop = cropArea || {
          x: 0,
          y: 0,
          width: sourceCanvas.width,
          height: sourceCanvas.height,
        };
        const cropX = activeCrop.x * zoom;
        const cropY = activeCrop.y * zoom;
        const cropW = activeCrop.width * zoom;
        const cropH = activeCrop.height * zoom;
        const colors = getCanvasColorsSync();

        ctx.save();
        ctx.fillStyle = colors.overlay;
        ctx.fillRect(0, 0, w, Math.max(0, cropY));
        ctx.fillRect(0, cropY + cropH, w, Math.max(0, h - (cropY + cropH)));
        ctx.fillRect(0, cropY, Math.max(0, cropX), cropH);
        ctx.fillRect(cropX + cropW, cropY, Math.max(0, w - (cropX + cropW)), cropH);
        ctx.restore();

        ctx.save();
        ctx.strokeStyle = colors.selection;
        ctx.lineWidth = 2;
        ctx.strokeRect(cropX, cropY, cropW, cropH);

        ctx.strokeStyle = colors.grid || "rgba(255,255,255,0.25)";
        ctx.lineWidth = 1;
        for (let i = 1; i < 3; i++) {
          ctx.beginPath();
          ctx.moveTo(cropX + (cropW * i) / 3, cropY);
          ctx.lineTo(cropX + (cropW * i) / 3, cropY + cropH);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cropX, cropY + (cropH * i) / 3);
          ctx.lineTo(cropX + cropW, cropY + (cropH * i) / 3);
          ctx.stroke();
        }

        const handleSize = 10;
        const handles = [
          { x: cropX, y: cropY },
          { x: cropX + cropW / 2, y: cropY },
          { x: cropX + cropW, y: cropY },
          { x: cropX + cropW, y: cropY + cropH / 2 },
          { x: cropX + cropW, y: cropY + cropH },
          { x: cropX + cropW / 2, y: cropY + cropH },
          { x: cropX, y: cropY + cropH },
          { x: cropX, y: cropY + cropH / 2 },
        ];
        ctx.fillStyle = colors.selection;
        ctx.strokeStyle = colors.textOnColor;
        for (const handle of handles) {
          ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
          ctx.strokeRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
        }
        ctx.restore();
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

  useEffect(() => {
    let rafId = 0;
    const animateSelectionOutline = () => {
      if (magicWandSelectionRef.current) {
        requestRender();
      }
      rafId = window.requestAnimationFrame(animateSelectionOutline);
    };
    rafId = window.requestAnimationFrame(animateSelectionOutline);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [requestRender]);

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

    // Handle image files -> create new track
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

  // Keep editable frame canvas in sync with active frame.
  useEffect(() => {
    const nextFrameId = editableFrame?.id ?? null;
    const nextTrackId = editableFrame ? activeTrackId : null;

    if (
      currentEditFrameIdRef.current !== null &&
      (currentEditFrameIdRef.current !== nextFrameId || currentEditTrackIdRef.current !== nextTrackId)
    ) {
      commitFrameEdits();
    }

    setHasDrawn(false);

    if (!editableFrame?.imageData) {
      editFrameCanvasRef.current = null;
      editFrameCtxRef.current = null;
      currentEditTrackIdRef.current = null;
      currentEditFrameIdRef.current = null;
      isEditFrameDirtyRef.current = false;
      clearMagicWandSelection();
      requestRender();
      return;
    }

    clearMagicWandSelection();
    dabBufferCanvasRef.current = null;
    dabBufferCtxRef.current = null;

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const offscreen = document.createElement("canvas");
      offscreen.width = img.width;
      offscreen.height = img.height;
      const offscreenCtx = offscreen.getContext("2d");
      if (!offscreenCtx) return;

      offscreenCtx.clearRect(0, 0, offscreen.width, offscreen.height);
      offscreenCtx.drawImage(img, 0, 0);

      editFrameCanvasRef.current = offscreen;
      editFrameCtxRef.current = offscreenCtx;
      currentEditTrackIdRef.current = activeTrackId;
      currentEditFrameIdRef.current = editableFrame.id;
      isEditFrameDirtyRef.current = false;
      requestRender();
    };
    img.src = editableFrame.imageData;

    return () => {
      cancelled = true;
    };
  }, [editableFrame?.id, editableFrame?.imageData, activeTrackId, clearMagicWandSelection, commitFrameEdits, requestRender]);

  useEffect(() => {
    if (!isEditMode) {
      commitFrameEdits();
      drawingPointerIdRef.current = null;
      setIsDrawing(false);
      setCursorPos(null);
      setIsOverCanvas(false);
      requestRender();
    }
  }, [isEditMode, commitFrameEdits, requestRender]);

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
  }, [toolMode, cropArea, cropCursor, isDraggingCrop, requestRender]);

  useEffect(() => {
    if (toolMode === "crop") return;
    cropDragRef.current = {
      mode: "none",
      pointerStart: { x: 0, y: 0 },
      cropStart: null,
      resizeHandle: null,
    };
    originalCropAreaRef.current = null;
    setIsDraggingCrop(false);
    setCropCursor("crosshair");
  }, [toolMode]);

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
      const zoom = getAnimVpZoom();

      const x = Math.floor(((clientX - rect.left - borderLeft) * scaleX) / zoom);
      const y = Math.floor(((clientY - rect.top - borderTop) * scaleY) / zoom);

      return { x, y };
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

  const applyMagicWandSelection = useCallback((x: number, y: number) => {
    const frameCtx = editFrameCtxRef.current;
    const frameCanvas = editFrameCanvasRef.current;
    if (!frameCtx || !frameCanvas) return;

    if (x < 0 || y < 0 || x >= frameCanvas.width || y >= frameCanvas.height) {
      clearMagicWandSelection();
      return;
    }

    const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
    const selection = computeMagicWandSelection(imageData, x, y, {
      tolerance: magicWandTolerance,
      connectedOnly: true,
    });

    if (!selection) {
      clearMagicWandSelection();
      return;
    }

    magicWandSeedRef.current = { x, y };
    magicWandSelectionRef.current = selection;
    magicWandMaskCanvasRef.current = createMagicWandMaskCanvas(selection, {
      feather: magicWandFeather,
    });
    requestRender();
  }, [clearMagicWandSelection, magicWandFeather, magicWandTolerance, requestRender]);

  useEffect(() => {
    const seed = magicWandSeedRef.current;
    const frameCtx = editFrameCtxRef.current;
    const frameCanvas = editFrameCanvasRef.current;
    if (!seed || !frameCtx || !frameCanvas) {
      return;
    }

    if (seed.x < 0 || seed.y < 0 || seed.x >= frameCanvas.width || seed.y >= frameCanvas.height) {
      clearMagicWandSelection();
      return;
    }

    const imageData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height);
    const selection = computeMagicWandSelection(imageData, seed.x, seed.y, {
      tolerance: magicWandTolerance,
      connectedOnly: true,
    });

    if (!selection) {
      clearMagicWandSelection();
      return;
    }

    magicWandSelectionRef.current = selection;
    magicWandMaskCanvasRef.current = createMagicWandMaskCanvas(selection, {
      feather: magicWandFeather,
    });
    requestRender();
  }, [clearMagicWandSelection, magicWandFeather, magicWandTolerance, requestRender]);

  const clearSelectedPixels = useCallback(() => {
    const frameCtx = editFrameCtxRef.current;
    const maskCanvas = magicWandMaskCanvasRef.current;
    if (!frameCtx || !maskCanvas) return false;

    frameCtx.save();
    frameCtx.globalCompositeOperation = "destination-out";
    frameCtx.drawImage(maskCanvas, 0, 0);
    frameCtx.restore();
    isEditFrameDirtyRef.current = true;
    return true;
  }, []);

  const drawPixel = useCallback(
    (x: number, y: number, color: string, isEraser = false, pressure = 1) => {
      const frameCtx = editFrameCtxRef.current;
      const frameCanvas = editFrameCanvasRef.current;
      if (!frameCtx || !frameCanvas) return false;

      const params = calculateDrawingParameters(
        Number.isFinite(pressure) ? Math.max(0.01, Math.min(1, pressure)) : 1,
        activePreset,
        brushSize,
        pressureEnabled,
      );

      const selection = magicWandSelectionRef.current;
      const selectionMaskCanvas = magicWandMaskCanvasRef.current;

      if (selection && selectionMaskCanvas) {
        if (
          selection.width !== frameCanvas.width
          || selection.height !== frameCanvas.height
          || !isMagicWandPixelSelected(selection, x, y)
        ) {
          return false;
        }

        const dabBuffer = ensureDabBufferCanvas(frameCanvas.width, frameCanvas.height);
        if (!dabBuffer) return false;

        dabBuffer.ctx.clearRect(0, 0, frameCanvas.width, frameCanvas.height);
        sharedDrawDab(dabBuffer.ctx, {
          x,
          y,
          radius: params.size / 2,
          hardness: brushHardness / 100,
          color,
          alpha: params.opacity * params.flow,
          isEraser,
        });

        dabBuffer.ctx.save();
        dabBuffer.ctx.globalCompositeOperation = "destination-in";
        dabBuffer.ctx.drawImage(selectionMaskCanvas, 0, 0);
        dabBuffer.ctx.restore();

        frameCtx.save();
        if (isEraser) {
          frameCtx.globalCompositeOperation = "destination-out";
        }
        frameCtx.drawImage(dabBuffer.canvas, 0, 0);
        frameCtx.restore();
      } else {
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
      }
      isEditFrameDirtyRef.current = true;
      return true;
    },
    [activePreset, brushHardness, brushSize, ensureDabBufferCanvas, pressureEnabled],
  );

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
        { width: canvas.width, height: canvas.height },
      );

      setAnimVpPan(result.pan);
      setAnimVpZoom(result.zoom);
      requestRender();
    },
    [getAnimVpPan, getAnimVpZoom, requestRender, setAnimVpPan, setAnimVpZoom],
  );

  // Spacebar pan mode
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

      if (!isInteractiveElement && !e.repeat && (e.key === "Delete" || e.key === "Backspace")) {
        if (magicWandSelectionRef.current && magicWandMaskCanvasRef.current) {
          e.preventDefault();
          e.stopPropagation();
          pushHistory();
          if (clearSelectedPixels()) {
            requestRender();
            commitFrameEdits();
          }
        }
      }

      if (!isInteractiveElement && e.key === "Escape" && magicWandSelectionRef.current) {
        e.preventDefault();
        clearMagicWandSelection();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsPanning(false);
        animEndPanDrag();
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [animEndPanDrag, clearMagicWandSelection, clearSelectedPixels, commitFrameEdits, pushHistory, requestRender]);

  // Hand tool or spacebar pan
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
      if (drawingPointerIdRef.current === e.pointerId) {
        drawingPointerIdRef.current = null;
        setIsDrawing(false);
        commitFrameEdits();
      }
    },
    [animEndPanDrag, commitFrameEdits],
  );

  const handlePreviewCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === "touch") {
        activeTouchPointerIdsRef.current.add(e.pointerId);
      }

      if (activeTouchPointerIdsRef.current.size > 1) {
        setIsDrawing(false);
        return;
      }

      const isTouchPanOnlyInput = isPanLocked && e.pointerType === "touch";
      if (isTouchPanOnlyInput || isHandMode) {
        return;
      }

      if (isZoomTool) {
        zoomAtCursor(e);
        return;
      }

      if (isEyedropperTool) {
        pickColorFromComposited(e.clientX, e.clientY);
        return;
      }

      if (toolMode === "crop") {
        const rawPoint = getPixelCoordinates(e.clientX, e.clientY);
        if (!rawPoint) return;

        const bounds = getCropCanvasBounds();
        if (!bounds) return;
        const point = canvasExpandMode ? rawPoint : clampToCropCanvas(rawPoint);

        e.preventDefault();
        safeSetPointerCapture(e.currentTarget, e.pointerId);

        if (cropArea && cropArea.width > 0 && cropArea.height > 0) {
          const hit = getRectHandleAtPosition(point, cropArea, {
            handleSize: 12,
            includeMove: true,
          });

          if (hit && hit !== "move") {
            originalCropAreaRef.current = { ...cropArea };
            cropDragRef.current = {
              mode: "resize",
              pointerStart: point,
              cropStart: { ...cropArea },
              resizeHandle: hit as RectHandle,
            };
            setIsDraggingCrop(true);
            return;
          }

          if (hit === "move") {
            cropDragRef.current = {
              mode: "move",
              pointerStart: point,
              cropStart: { ...cropArea },
              resizeHandle: null,
            };
            setIsDraggingCrop(true);
            return;
          }
        }

        const nextArea = {
          x: Math.round(point.x),
          y: Math.round(point.y),
          width: 0,
          height: 0,
        };
        setCropArea(nextArea);
        cropDragRef.current = {
          mode: "create",
          pointerStart: point,
          cropStart: nextArea,
          resizeHandle: null,
        };
        setIsDraggingCrop(true);
        return;
      }

      if (!isEditMode || !editableFrame) {
        return;
      }

      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (!coords) return;

      if (isMagicWandTool) {
        applyMagicWandSelection(coords.x, coords.y);
        return;
      }

      if (!isBrushEditMode) {
        return;
      }

      if (!hasDrawn) {
        pushHistory();
        setHasDrawn(true);
      }

      if (isPlaying) {
        setIsPlaying(false);
      }

      drawingPointerIdRef.current = e.pointerId;
      setIsDrawing(true);
      const pressure = e.pointerType === "pen" ? Math.max(0.01, e.pressure || 1) : 1;

      if (drawPixel(coords.x, coords.y, brushColor, isEraserTool, pressure)) {
        requestRender();
      }
      lastMousePosRef.current = { x: coords.x, y: coords.y };

      safeSetPointerCapture(e.currentTarget, e.pointerId);
    },
    [
      isPanLocked,
      isHandMode,
      isZoomTool,
      zoomAtCursor,
      isEyedropperTool,
      pickColorFromComposited,
      toolMode,
      getCropCanvasBounds,
      canvasExpandMode,
      clampToCropCanvas,
      cropArea,
      setCropArea,
      isEditMode,
      isBrushEditMode,
      isMagicWandTool,
      editableFrame,
      getPixelCoordinates,
      hasDrawn,
      pushHistory,
      isPlaying,
      setIsPlaying,
      applyMagicWandSelection,
      drawPixel,
      brushColor,
      isEraserTool,
      requestRender,
    ],
  );

  const handlePreviewCanvasPointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (canvas) {
        const rect = canvas.getBoundingClientRect();
        setCursorPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }

      if (e.pointerType === "touch" && activeTouchPointerIdsRef.current.size > 1) {
        return;
      }

      if (toolMode === "crop" && cropDragRef.current.mode === "none") {
        const hoverPoint = getPixelCoordinates(e.clientX, e.clientY);
        if (hoverPoint && cropArea && cropArea.width > 0 && cropArea.height > 0) {
          const hit = getRectHandleAtPosition(hoverPoint, cropArea, {
            handleSize: 12,
            includeMove: true,
          });
          if (hit && hit !== "move") {
            const cursorMap: Record<string, string> = {
              nw: "nwse-resize",
              se: "nwse-resize",
              ne: "nesw-resize",
              sw: "nesw-resize",
              n: "ns-resize",
              s: "ns-resize",
              e: "ew-resize",
              w: "ew-resize",
            };
            setCropCursor(cursorMap[hit] || "crosshair");
          } else if (hit === "move") {
            setCropCursor("move");
          } else {
            setCropCursor("crosshair");
          }
        } else {
          setCropCursor("crosshair");
        }
      }

      if (cropDragRef.current.mode !== "none") {
        const rawPoint = getPixelCoordinates(e.clientX, e.clientY);
        if (!rawPoint) return;
        const point = canvasExpandMode ? rawPoint : clampToCropCanvas(rawPoint);
        const bounds = getCropCanvasBounds();
        if (!bounds) return;

        if (cropDragRef.current.mode === "create") {
          const start = cropDragRef.current.pointerStart;
          const ratioValue = ASPECT_RATIO_VALUES[cropAspectRatio] ?? null;
          const clampedPos = canvasExpandMode
            ? point
            : {
                x: Math.max(0, Math.min(Math.round(point.x), bounds.width)),
                y: Math.max(0, Math.min(Math.round(point.y), bounds.height)),
              };
          const nextArea = createRectFromDrag(start, clampedPos, {
            keepAspect: Boolean(ratioValue),
            targetAspect: ratioValue ?? undefined,
            round: true,
            bounds: canvasExpandMode
              ? undefined
              : {
                  minX: 0,
                  minY: 0,
                  maxX: bounds.width,
                  maxY: bounds.height,
                },
          });
          setCropArea(nextArea);
          return;
        }

        if (cropDragRef.current.mode === "move" && cropDragRef.current.cropStart) {
          const start = cropDragRef.current.cropStart;
          const dx = point.x - cropDragRef.current.pointerStart.x;
          const dy = point.y - cropDragRef.current.pointerStart.y;
          let nextX = start.x + dx;
          let nextY = start.y + dy;

          if (!canvasExpandMode) {
            nextX = Math.max(0, Math.min(bounds.width - start.width, nextX));
            nextY = Math.max(0, Math.min(bounds.height - start.height, nextY));
          }

          setCropArea({
            x: Math.round(nextX),
            y: Math.round(nextY),
            width: Math.round(start.width),
            height: Math.round(start.height),
          });
          return;
        }

        if (cropDragRef.current.mode === "resize" && originalCropAreaRef.current && cropDragRef.current.resizeHandle) {
          const orig = originalCropAreaRef.current;
          const dx = point.x - cropDragRef.current.pointerStart.x;
          const dy = point.y - cropDragRef.current.pointerStart.y;
          const ratioValue = ASPECT_RATIO_VALUES[cropAspectRatio] ?? null;
          const originalAspect = orig.width / Math.max(1, orig.height);
          const effectiveRatio = ratioValue || (lockCropAspect ? originalAspect : null);

          let newArea = resizeRectByHandle(
            orig,
            cropDragRef.current.resizeHandle,
            { dx, dy },
            {
              minWidth: 10,
              minHeight: 10,
              keepAspect: Boolean(effectiveRatio),
              targetAspect: effectiveRatio ?? undefined,
            },
          );

          if (!canvasExpandMode) {
            newArea = {
              x: Math.max(0, newArea.x),
              y: Math.max(0, newArea.y),
              width: Math.min(newArea.width, bounds.width - Math.max(0, newArea.x)),
              height: Math.min(newArea.height, bounds.height - Math.max(0, newArea.y)),
            };
          }

          setCropArea({
            x: Math.round(newArea.x),
            y: Math.round(newArea.y),
            width: Math.round(newArea.width),
            height: Math.round(newArea.height),
          });
          return;
        }
      }

      if (!isEditMode || !isDrawing || drawingPointerIdRef.current !== e.pointerId || !editableFrame) {
        return;
      }

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
    [
      toolMode,
      cropArea,
      setCropArea,
      cropAspectRatio,
      lockCropAspect,
      canvasExpandMode,
      clampToCropCanvas,
      getCropCanvasBounds,
      isEditMode,
      isDrawing,
      editableFrame,
      getPixelCoordinates,
      drawPixel,
      brushColor,
      isEraserTool,
      requestRender,
    ],
  );

  const handlePreviewCanvasPointerUp = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.pointerType === "touch") {
        activeTouchPointerIdsRef.current.delete(e.pointerId);
      }

      safeReleasePointerCapture(e.currentTarget, e.pointerId);

      if (drawingPointerIdRef.current === e.pointerId) {
        drawingPointerIdRef.current = null;
        setIsDrawing(false);
        commitFrameEdits();
      }

      originalCropAreaRef.current = null;
      cropDragRef.current = {
        mode: "none",
        pointerStart: { x: 0, y: 0 },
        cropStart: null,
        resizeHandle: null,
      };
      setIsDraggingCrop(false);

      if (cropArea && (cropArea.width < 10 || cropArea.height < 10)) {
        setCropArea(null);
      }
    },
    [commitFrameEdits, cropArea, setCropArea],
  );

  const handlePreviewCanvasPointerEnter = useCallback(() => {
    setIsOverCanvas(true);
  }, []);

  const handlePreviewCanvasPointerLeave = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
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
      if (cropDragRef.current.mode !== "none" && e.pointerId !== drawingPointerIdRef.current) {
        cropDragRef.current = {
          mode: "none",
          pointerStart: { x: 0, y: 0 },
          cropStart: null,
          resizeHandle: null,
        };
        originalCropAreaRef.current = null;
        setIsDraggingCrop(false);
      }
    },
    [commitFrameEdits],
  );

  const hasVisibleCanvas = isEditMode ? Boolean(editFrameCanvasRef.current) : hasCompositedFrame;
  const previewPan = viewportSync.zoom >= 1
    ? { x: Math.round(viewportSync.pan.x), y: Math.round(viewportSync.pan.y) }
    : viewportSync.pan;

  // Cursor selection
  const getCursor = () => {
    if (isHandMode) {
      return animIsPanDragging() ? "grabbing" : "grab";
    }
    if (isZoomTool) {
      return "zoom-in";
    }
    if (isEyedropperTool) {
      return "crosshair";
    }
    if (isMagicWandTool) {
      return "crosshair";
    }
    if (toolMode === "crop") {
      return isDraggingCrop
        ? cropDragRef.current.mode === "move"
          ? "grabbing"
          : cropCursor
        : cropCursor;
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
                    cursor: isBrushEditMode ? "none" : getCursor(),
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
                  <FrameIndicator
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
