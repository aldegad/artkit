"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useVideoState, useVideoRefs, useTimeline } from "../../contexts";
import { useVideoElements, usePlaybackTick, usePreRenderCache } from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { getCanvasColorsSync } from "@/hooks";
import { PREVIEW, PLAYBACK } from "../../constants";
import { AudioClip, Clip, VideoClip } from "../../types";
import { useMask } from "../../contexts";
import { useMaskTool } from "../../hooks/useMaskTool";
import { renderCompositeFrame } from "../../utils/compositeRenderer";

interface PreviewCanvasProps {
  className?: string;
}

export function PreviewCanvas({ className }: PreviewCanvasProps) {
  const { previewCanvasRef, previewContainerRef, videoElementsRef, audioElementsRef } = useVideoRefs();
  const {
    playback,
    project,
    selectedClipIds,
    toolMode,
    selectClip,
    cropArea,
    setCropArea,
    canvasExpandMode,
    currentTimeRef: stateTimeRef,
  } = useVideoState();
  const { tracks, clips, getClipAtTime, updateClip, saveToHistory } = useTimeline();
  const wasPlayingRef = useRef(false);
  const renderRequestRef = useRef(0);
  const renderRef = useRef<() => void>(() => {});
  const imageCacheRef = useRef(new Map<string, HTMLImageElement>());
  const maskTempCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const maskOverlayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isMaskDrawingRef = useRef(false);
  const savedMaskImgCacheRef = useRef(new Map<string, HTMLImageElement>());
  const prevBrushModeRef = useRef<"paint" | "erase" | null>(null);
  const [isDraggingClip, setIsDraggingClip] = useState(false);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);
  const [brushCursor, setBrushCursor] = useState<{ x: number; y: number } | null>(null);

  // Mask
  const {
    activeMaskId,
    isEditingMask,
    activeTrackId,
    maskCanvasRef: maskContextCanvasRef,
    getMaskAtTimeForTrack,
    brushSettings,
    setBrushMode,
    saveMaskData,
  } = useMask();
  const { startDraw, continueDraw, endDraw } = useMaskTool();

  const previewGeometryRef = useRef({
    offsetX: 0,
    offsetY: 0,
    scale: 1,
    previewWidth: 0,
    previewHeight: 0,
  });
  const dragStateRef = useRef<{
    clipId: string | null;
    pointerStart: { x: number; y: number };
    clipStart: { x: number; y: number };
  }>({
    clipId: null,
    pointerStart: { x: 0, y: 0 },
    clipStart: { x: 0, y: 0 },
  });
  const cropDragRef = useRef<{
    mode: "none" | "create" | "move";
    pointerStart: { x: number; y: number };
    cropStart: { x: number; y: number; width: number; height: number } | null;
  }>({
    mode: "none",
    pointerStart: { x: 0, y: 0 },
    cropStart: null,
  });

  // Initialize video elements pool - preloads videos when clips change
  useVideoElements();

  // Use the shared ref from VideoStateContext as source of truth for current time
  const currentTimeRef = stateTimeRef;

  // Pre-render cache
  const { getCachedFrame } = usePreRenderCache({
    tracks,
    clips,
    getClipAtTime,
    getMaskAtTimeForTrack,
    videoElements: videoElementsRef.current,
    imageCache: imageCacheRef.current,
    maskImageCache: savedMaskImgCacheRef.current,
    projectSize: project.canvasSize,
    projectDuration: project.duration || 10,
    isPlaying: playback.isPlaying,
    currentTimeRef,
  });

  // Cache for getComputedStyle results (avoid forcing style recalc every frame)
  const cssColorsRef = useRef<{ surfacePrimary: string; borderDefault: string } | null>(null);
  const invalidateCssCache = useCallback(() => { cssColorsRef.current = null; }, []);

  // Handle playback state changes - sync video/audio elements.
  // Runs only when play state or clip/track structure changes, NOT every frame.
  useEffect(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const audioClips = clips.filter((c): c is AudioClip => c.type === "audio");

    if (!playback.isPlaying) {
      if (wasPlayingRef.current) {
        // Playback stopped - pause all media.
        for (const clip of videoClips) {
          const video = videoElementsRef.current?.get(clip.sourceUrl);
          if (!video) continue;
          video.pause();
          video.muted = true;
        }
        for (const clip of audioClips) {
          const audio = audioElementsRef.current?.get(clip.sourceUrl);
          if (!audio) continue;
          audio.pause();
          audio.muted = true;
        }
      }
      wasPlayingRef.current = false;
      return;
    }

    // Sync and start/stop media elements
    const syncMedia = () => {
      const ct = currentTimeRef.current;
      const trackById = new Map(tracks.map((t) => [t.id, t]));

      // Collect audible clips at current time
      const audibleClipIds = new Set<string>();
      for (const track of tracks) {
        if (!track.visible || track.muted) continue;
        const clip = getClipAtTime(track.id, ct);
        if (!clip || !clip.visible) continue;
        if (clip.type === "video") {
          if ((clip.hasAudio ?? true) && !(clip.audioMuted ?? false) && ((typeof clip.audioVolume === "number" ? clip.audioVolume : 100) > 0)) {
            audibleClipIds.add(clip.id);
          }
        } else if (clip.type === "audio") {
          if (!(clip.audioMuted ?? false) && ((typeof clip.audioVolume === "number" ? clip.audioVolume : 100) > 0)) {
            audibleClipIds.add(clip.id);
          }
        }
      }

      for (const clip of videoClips) {
        const video = videoElementsRef.current?.get(clip.sourceUrl);
        const track = trackById.get(clip.trackId);
        if (!video || !track || video.readyState < 2) continue;

        const clipTime = ct - clip.startTime;
        if (clipTime < 0 || clipTime >= clip.duration || !clip.visible || !track.visible) {
          video.pause();
          video.muted = true;
          continue;
        }

        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(video.currentTime - sourceTime) > PLAYBACK.SEEK_DRIFT_THRESHOLD) {
          video.currentTime = sourceTime;
        }

        video.playbackRate = playback.playbackRate;
        const isAudible = audibleClipIds.has(clip.id);
        video.muted = !isAudible;
        const clipVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
        video.volume = isAudible ? Math.max(0, Math.min(1, clipVolume / 100)) : 0;

        if (video.paused) video.play().catch(() => {});
      }

      for (const clip of audioClips) {
        const audio = audioElementsRef.current?.get(clip.sourceUrl);
        const track = trackById.get(clip.trackId);
        if (!audio || !track) continue;

        const clipTime = ct - clip.startTime;
        if (clipTime < 0 || clipTime >= clip.duration || !clip.visible || !track.visible || !audibleClipIds.has(clip.id)) {
          audio.pause();
          audio.muted = true;
          continue;
        }

        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(audio.currentTime - sourceTime) > PLAYBACK.SEEK_DRIFT_THRESHOLD) {
          audio.currentTime = sourceTime;
        }

        audio.playbackRate = playback.playbackRate;
        audio.muted = false;
        audio.volume = Math.max(0, Math.min(1, (clip.audioVolume ?? 100) / 100));

        if (audio.paused) audio.play().catch(() => {});
      }
    };

    syncMedia(); // Initial sync when playback starts
    // Periodic re-sync for clip boundaries and drift correction (not every frame)
    const intervalId = setInterval(syncMedia, PLAYBACK.SYNC_INTERVAL_MS);
    wasPlayingRef.current = true;

    return () => clearInterval(intervalId);
  }, [playback.isPlaying, playback.playbackRate, clips, tracks, getClipAtTime, videoElementsRef, audioElementsRef]);

  // Setup video ready listeners - trigger render via rAF only when paused (scrubbing)
  useEffect(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const cleanupFns: (() => void)[] = [];

    const scheduleRender = () => {
      // During playback, the playback loop already drives rendering
      if (wasPlayingRef.current) return;
      cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = requestAnimationFrame(() => {
        renderRef.current();
      });
    };

    for (const clip of videoClips) {
      const video = videoElementsRef.current?.get(clip.sourceUrl);
      if (video) {
        video.addEventListener("canplay", scheduleRender);
        video.addEventListener("seeked", scheduleRender);
        video.addEventListener("loadeddata", scheduleRender);

        cleanupFns.push(() => {
          video.removeEventListener("canplay", scheduleRender);
          video.removeEventListener("seeked", scheduleRender);
          video.removeEventListener("loadeddata", scheduleRender);
        });
      }
    }

    return () => {
      cancelAnimationFrame(renderRequestRef.current);
      cleanupFns.forEach((fn) => fn());
    };
  }, [clips, videoElementsRef]);

  // Draw checkerboard pattern for transparency
  const drawCheckerboard = useCallback(
    (ctx: CanvasRenderingContext2D, width: number, height: number) => {
      const size = PREVIEW.CHECKERBOARD_SIZE;
      const colors = getCanvasColorsSync();

      for (let y = 0; y < height; y += size) {
        for (let x = 0; x < width; x += size) {
          const isEven = ((x / size + y / size) % 2) === 0;
          ctx.fillStyle = isEven ? colors.checkerboardLight : colors.checkerboardDark;
          ctx.fillRect(x, y, size, size);
        }
      }
    },
    []
  );

  // Render the composited frame - assigned to ref to avoid stale closures
  renderRef.current = () => {
    const canvas = previewCanvasRef.current;
    const container = previewContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Read current time from ref (source of truth during playback)
    const ct = currentTimeRef.current;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    // Set canvas size with DPI scaling
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const width = rect.width;
    const height = rect.height;
    const colors = getCanvasColorsSync();
    // Cache getComputedStyle results to avoid per-frame style recalculation
    if (!cssColorsRef.current) {
      const rootStyle = getComputedStyle(document.documentElement);
      cssColorsRef.current = {
        surfacePrimary: rootStyle.getPropertyValue("--surface-primary").trim() || "#1a1a1a",
        borderDefault: rootStyle.getPropertyValue("--border-default").trim() || "#333333",
      };
    }
    const { surfacePrimary, borderDefault } = cssColorsRef.current;

    // Clear with background color
    ctx.fillStyle = surfacePrimary;
    ctx.fillRect(0, 0, width, height);

    // Calculate preview area (fit project canvas to container)
    const projectWidth = project.canvasSize.width;
    const projectHeight = project.canvasSize.height;
    const scale = Math.min(
      (width - 40) / projectWidth,
      (height - 40) / projectHeight
    );
    const previewWidth = projectWidth * scale;
    const previewHeight = projectHeight * scale;
    const offsetX = (width - previewWidth) / 2;
    const offsetY = (height - previewHeight) / 2;
    previewGeometryRef.current = { offsetX, offsetY, scale, previewWidth, previewHeight };

    // Draw checkerboard for transparency
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, previewWidth, previewHeight);
    ctx.clip();
    drawCheckerboard(ctx, width, height);
    ctx.restore();

    // Try cached frame first (during playback for smooth output)
    const cachedBitmap = playback.isPlaying ? getCachedFrame(ct) : null;

    if (cachedBitmap) {
      // Use pre-rendered cached frame
      ctx.drawImage(cachedBitmap, offsetX, offsetY, previewWidth, previewHeight);
    } else {
      // Lazy-init mask temp canvas
      if (!maskTempCanvasRef.current) {
        maskTempCanvasRef.current = document.createElement("canvas");
      }

      // Render composited frame in real-time
      renderCompositeFrame(ctx, {
        time: ct,
        tracks,
        getClipAtTime,
        getMaskAtTimeForTrack,
        videoElements: videoElementsRef.current,
        imageCache: imageCacheRef.current,
        maskImageCache: savedMaskImgCacheRef.current,
        maskTempCanvas: maskTempCanvasRef.current,
        projectSize: project.canvasSize,
        renderRect: { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
        liveMaskCanvas: maskContextCanvasRef.current,
        isPlaying: playback.isPlaying,
        onMaskImageLoad: () => renderRef.current(),
      });
    }

    // --- UI Overlays (mask tint + selection highlight) ---
    const selectedVisualClipId = selectedClipIds.find((clipId) => {
      const selected = clips.find((clip) => clip.id === clipId);
      return !!selected && selected.type !== "audio";
    }) || null;

    const sortedTracks = [...tracks].reverse();
    for (const track of sortedTracks) {
      if (!track.visible) continue;
      const clip = getClipAtTime(track.id, ct);
      if (!clip || !clip.visible || clip.type === "audio") continue;

      // Mask overlay when selected or editing
      const maskResult = getMaskAtTimeForTrack(clip.trackId, ct);
      if (maskResult && activeTrackId === clip.trackId && activeMaskId) {
        let clipMaskSource: CanvasImageSource | null = null;
        if (maskResult === "__live_canvas__" && maskContextCanvasRef.current) {
          clipMaskSource = maskContextCanvasRef.current;
        } else if (maskResult !== "__live_canvas__") {
          const maskImg = savedMaskImgCacheRef.current.get(maskResult);
          if (maskImg?.complete && maskImg.naturalWidth > 0) {
            clipMaskSource = maskImg;
          }
        }
        if (clipMaskSource) {
          const maskW = project.canvasSize.width;
          const maskH = project.canvasSize.height;
          if (!maskOverlayCanvasRef.current) {
            maskOverlayCanvasRef.current = document.createElement("canvas");
          }
          const overlayCanvas = maskOverlayCanvasRef.current;
          if (overlayCanvas.width !== maskW || overlayCanvas.height !== maskH) {
            overlayCanvas.width = maskW;
            overlayCanvas.height = maskH;
          }
          const overlayCtx = overlayCanvas.getContext("2d");
          if (overlayCtx) {
            overlayCtx.clearRect(0, 0, maskW, maskH);
            overlayCtx.globalCompositeOperation = "source-over";
            overlayCtx.drawImage(clipMaskSource, 0, 0, maskW, maskH);
            overlayCtx.globalCompositeOperation = "source-in";
            overlayCtx.fillStyle = isEditingMask
              ? "rgba(255, 60, 60, 0.35)"
              : "rgba(168, 85, 247, 0.3)";
            overlayCtx.fillRect(0, 0, maskW, maskH);
            ctx.drawImage(overlayCanvas, offsetX, offsetY, previewWidth, previewHeight);
          }
        }
      }

      // Selection highlight
      if (selectedVisualClipId && clip.id === selectedVisualClipId) {
        const boxX = offsetX + clip.position.x * scale;
        const boxY = offsetY + clip.position.y * scale;
        const boxW = clip.sourceSize.width * scale * clip.scale;
        const boxH = clip.sourceSize.height * scale * clip.scale;

        ctx.save();
        if (clip.rotation !== 0) {
          const centerX = boxX + boxW / 2;
          const centerY = boxY + boxH / 2;
          ctx.translate(centerX, centerY);
          ctx.rotate((clip.rotation * Math.PI) / 180);
          ctx.translate(-centerX, -centerY);
        }
        ctx.strokeStyle = colors.selection;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(boxX, boxY, boxW, boxH);
        ctx.restore();
      }
    }

    if (toolMode === "crop") {
      const activeCrop = cropArea || {
        x: 0,
        y: 0,
        width: project.canvasSize.width,
        height: project.canvasSize.height,
      };
      const cropX = offsetX + activeCrop.x * scale;
      const cropY = offsetY + activeCrop.y * scale;
      const cropW = activeCrop.width * scale;
      const cropH = activeCrop.height * scale;

      // Dim everything outside crop.
      ctx.save();
      ctx.fillStyle = colors.overlay;
      ctx.fillRect(0, 0, width, height);
      ctx.clearRect(cropX, cropY, cropW, cropH);
      ctx.restore();

      ctx.save();
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([8, 4]);
      ctx.strokeRect(cropX, cropY, cropW, cropH);
      ctx.setLineDash([]);

      const handleSize = 8;
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
      for (const handle of handles) {
        ctx.fillRect(handle.x - handleSize / 2, handle.y - handleSize / 2, handleSize, handleSize);
      }
      ctx.restore();
    }

    // Draw frame border
    ctx.strokeStyle = borderDefault;
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
  };

  const clampToCanvas = useCallback((point: { x: number; y: number }) => {
    return {
      x: Math.max(0, Math.min(project.canvasSize.width, point.x)),
      y: Math.max(0, Math.min(project.canvasSize.height, point.y)),
    };
  }, [project.canvasSize.height, project.canvasSize.width]);

  const screenToProject = useCallback((clientX: number, clientY: number, allowOutside: boolean = false) => {
    const container = previewContainerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const { offsetX, offsetY, scale, previewWidth, previewHeight } = previewGeometryRef.current;
    if (scale <= 0) return null;

    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const localX = x - offsetX;
    const localY = y - offsetY;

    if (!allowOutside && (localX < 0 || localY < 0 || localX > previewWidth || localY > previewHeight)) {
      return null;
    }

    return {
      x: localX / scale,
      y: localY / scale,
    };
  }, [previewContainerRef]);

  // Mask uses project coordinates (not clip-local) since it's track-level
  const screenToMaskCoords = useCallback((clientX: number, clientY: number) => {
    const point = screenToProject(clientX, clientY, true);
    if (!point) return null;
    return {
      x: Math.max(0, Math.min(project.canvasSize.width, point.x)),
      y: Math.max(0, Math.min(project.canvasSize.height, point.y)),
    };
  }, [screenToProject, project.canvasSize]);

  const isInsideCropArea = useCallback((point: { x: number; y: number }, area: { x: number; y: number; width: number; height: number }) => {
    return (
      point.x >= area.x &&
      point.x <= area.x + area.width &&
      point.y >= area.y &&
      point.y <= area.y + area.height
    );
  }, []);

  const hitTestClipAtPoint = useCallback((point: { x: number; y: number }): Clip | null => {
    const tracksById = new Map(tracks.map((track) => [track.id, track]));
    // Top track (index 0) is foreground — check it first for hit testing
    const sortedTracks = [...tracks];

    for (const track of sortedTracks) {
      if (!track.visible || track.locked) continue;
      const clip = getClipAtTime(track.id, currentTimeRef.current);
      if (!clip || !clip.visible || clip.type === "audio") continue;

      const width = clip.sourceSize.width * clip.scale;
      const height = clip.sourceSize.height * clip.scale;
      const centerX = clip.position.x + width / 2;
      const centerY = clip.position.y + height / 2;
      const angle = ((clip.rotation || 0) * Math.PI) / 180;

      const dx = point.x - centerX;
      const dy = point.y - centerY;
      const cos = Math.cos(-angle);
      const sin = Math.sin(-angle);
      const localX = dx * cos - dy * sin;
      const localY = dx * sin + dy * cos;

      const inside =
        localX >= -width / 2 &&
        localX <= width / 2 &&
        localY >= -height / 2 &&
        localY <= height / 2;

      const trackState = tracksById.get(clip.trackId);
      if (inside && trackState && !trackState.locked) {
        return clip;
      }
    }

    return null;
  }, [tracks, getClipAtTime, currentTimeRef]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (isEditingMask && activeTrackId) {
      const maskCoords = screenToMaskCoords(e.clientX, e.clientY);
      if (!maskCoords) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      // Alt key toggles erase mode temporarily
      if (e.altKey && brushSettings.mode !== "erase") {
        prevBrushModeRef.current = brushSettings.mode;
        setBrushMode("erase");
      }

      startDraw(maskCoords.x, maskCoords.y);
      isMaskDrawingRef.current = true;
      cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = requestAnimationFrame(() => renderRef.current());
      return;
    }

    if (toolMode === "crop") {
      const rawPoint = screenToProject(e.clientX, e.clientY, canvasExpandMode);
      if (!rawPoint) return;
      const point = canvasExpandMode ? rawPoint : clampToCanvas(rawPoint);

      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);

      if (cropArea && isInsideCropArea(point, cropArea)) {
        cropDragRef.current = {
          mode: "move",
          pointerStart: point,
          cropStart: { ...cropArea },
        };
      } else {
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
        };
      }
      setIsDraggingCrop(true);
      return;
    }

    if (toolMode !== "select" && toolMode !== "move") return;

    const point = screenToProject(e.clientX, e.clientY);
    if (!point) return;

    const hitClip = hitTestClipAtPoint(point);
    if (!hitClip || hitClip.type === "audio") return;

    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    saveToHistory();
    selectClip(hitClip.id, false);
    dragStateRef.current = {
      clipId: hitClip.id,
      pointerStart: point,
      clipStart: { ...hitClip.position },
    };
    setIsDraggingClip(true);
  }, [toolMode, screenToProject, canvasExpandMode, clampToCanvas, cropArea, isInsideCropArea, setCropArea, hitTestClipAtPoint, saveToHistory, selectClip, isEditingMask, activeTrackId, screenToMaskCoords, startDraw, brushSettings.mode, setBrushMode]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    // Update brush cursor position when editing mask
    if (isEditingMask) {
      const container = previewContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }

    if (isMaskDrawingRef.current) {
      const maskCoords = screenToMaskCoords(e.clientX, e.clientY);
      if (maskCoords) {
        continueDraw(maskCoords.x, maskCoords.y);
        cancelAnimationFrame(renderRequestRef.current);
        renderRequestRef.current = requestAnimationFrame(() => renderRef.current());
      }
      return;
    }

    if (cropDragRef.current.mode !== "none") {
      const rawPoint = screenToProject(e.clientX, e.clientY, canvasExpandMode);
      if (!rawPoint) return;
      const point = canvasExpandMode ? rawPoint : clampToCanvas(rawPoint);

      if (cropDragRef.current.mode === "create") {
        const start = cropDragRef.current.pointerStart;
        const nextArea = {
          x: Math.round(Math.min(start.x, point.x)),
          y: Math.round(Math.min(start.y, point.y)),
          width: Math.max(1, Math.round(Math.abs(point.x - start.x))),
          height: Math.max(1, Math.round(Math.abs(point.y - start.y))),
        };
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
          nextX = Math.max(0, Math.min(project.canvasSize.width - start.width, nextX));
          nextY = Math.max(0, Math.min(project.canvasSize.height - start.height, nextY));
        }

        setCropArea({
          x: Math.round(nextX),
          y: Math.round(nextY),
          width: Math.round(start.width),
          height: Math.round(start.height),
        });
        return;
      }
    }

    if (!isDraggingClip || !dragStateRef.current.clipId) return;

    const point = screenToProject(e.clientX, e.clientY);
    if (!point) return;

    const dragState = dragStateRef.current;
    const clipId = dragState.clipId;
    if (!clipId) return;
    const dx = point.x - dragState.pointerStart.x;
    const dy = point.y - dragState.pointerStart.y;
    updateClip(clipId, {
      position: {
        x: dragState.clipStart.x + dx,
        y: dragState.clipStart.y + dy,
      },
    });
  }, [screenToProject, canvasExpandMode, clampToCanvas, project.canvasSize.width, project.canvasSize.height, setCropArea, isDraggingClip, updateClip, screenToMaskCoords, continueDraw, toolMode, isEditingMask, previewContainerRef]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    if (isMaskDrawingRef.current) {
      endDraw();
      isMaskDrawingRef.current = false;

      // Auto-save mask data after each stroke
      saveMaskData();

      // Restore brush mode if Alt was used
      if (prevBrushModeRef.current !== null) {
        setBrushMode(prevBrushModeRef.current);
        prevBrushModeRef.current = null;
      }

      cancelAnimationFrame(renderRequestRef.current);
      renderRequestRef.current = requestAnimationFrame(() => renderRef.current());
    }

    if (e && e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragStateRef.current = {
      clipId: null,
      pointerStart: { x: 0, y: 0 },
      clipStart: { x: 0, y: 0 },
    };
    setIsDraggingClip(false);
    cropDragRef.current = {
      mode: "none",
      pointerStart: { x: 0, y: 0 },
      cropStart: null,
    };
    setIsDraggingCrop(false);
  }, [endDraw, setBrushMode, saveMaskData]);

  // Render on playback tick (driven by RAF, not React state) — no re-renders
  usePlaybackTick(() => {
    renderRef.current();
  });

  // Render on structural changes (tracks, clips, selection, etc.)
  useEffect(() => {
    renderRef.current();
  }, [playback.isPlaying, tracks, clips, selectedClipIds, toolMode, cropArea, project.canvasSize, isEditingMask, activeTrackId]);

  // Invalidate CSS color cache on theme changes
  useEffect(() => {
    invalidateCssCache();
    renderRef.current();
  }, [invalidateCssCache]);

  // Handle resize
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(() => renderRef.current());
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [previewContainerRef]);

  return (
    <div
      ref={previewContainerRef}
      className={cn("relative w-full h-full overflow-hidden", className)}
    >
      <canvas
        ref={previewCanvasRef}
        className="absolute inset-0"
        style={{
          cursor: isEditingMask
            ? "none"
            : toolMode === "crop"
              ? (isDraggingCrop ? "grabbing" : "crosshair")
              : (isDraggingClip ? "grabbing" : (toolMode === "select" || toolMode === "move" ? "grab" : "default")),
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={(e) => {
          handlePointerUp(e);
          setBrushCursor(null);
        }}
      />
      {/* Brush cursor preview */}
      {isEditingMask && brushCursor && (() => {
        const { scale } = previewGeometryRef.current;
        const displaySize = brushSettings.size * scale;
        return (
          <div
            className="absolute pointer-events-none"
            style={{
              left: brushCursor.x - displaySize / 2,
              top: brushCursor.y - displaySize / 2,
              width: displaySize,
              height: displaySize,
              borderRadius: "50%",
              border: `1.5px solid ${brushSettings.mode === "erase" ? "rgba(255,100,100,0.8)" : "rgba(255,255,255,0.8)"}`,
              boxShadow: `0 0 0 1px ${brushSettings.mode === "erase" ? "rgba(0,0,0,0.5)" : "rgba(0,0,0,0.5)"}`,
            }}
          />
        );
      })()}
    </div>
  );
}
