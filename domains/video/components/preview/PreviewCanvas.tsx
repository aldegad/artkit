"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useVideoState, useVideoRefs, useTimeline } from "../../contexts";
import { useVideoElements } from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { getCanvasColorsSync } from "@/hooks";
import { PREVIEW } from "../../constants";
import { AudioClip, Clip, VideoClip } from "../../types";

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
  } = useVideoState();
  const { tracks, clips, getClipAtTime, updateClip, saveToHistory } = useTimeline();
  const [videoReadyCount, setVideoReadyCount] = useState(0);
  const wasPlayingRef = useRef(false);
  const [isDraggingClip, setIsDraggingClip] = useState(false);
  const [isDraggingCrop, setIsDraggingCrop] = useState(false);

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

  // Handle playback state changes - sync video elements
  useEffect(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const audioClips = clips.filter((c): c is AudioClip => c.type === "audio");
    const trackById = new Map(tracks.map((track) => [track.id, track]));

    // Collect all audible clips at current time.
    const sortedTracks = [...tracks].sort((a, b) => b.zIndex - a.zIndex);
    const audibleClipIds = new Set<string>();
    for (const track of sortedTracks) {
      if (!track.visible || track.muted) continue;

      const clip = getClipAtTime(track.id, playback.currentTime);
      if (!clip || !clip.visible) continue;

      if (clip.type === "video") {
        const hasAudio = clip.hasAudio ?? true;
        const audioMuted = clip.audioMuted ?? false;
        const audioVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
        if (hasAudio && !audioMuted && audioVolume > 0) {
          audibleClipIds.add(clip.id);
        }
      } else if (clip.type === "audio") {
        const audioMuted = clip.audioMuted ?? false;
        const audioVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
        if (!audioMuted && audioVolume > 0) {
          audibleClipIds.add(clip.id);
        }
      }
    }

    if (playback.isPlaying) {
      // Playback started/continued - sync and play all visible video clips for visual render.
      for (const clip of videoClips) {
        const video = videoElementsRef.current?.get(clip.sourceUrl);
        const track = trackById.get(clip.trackId);
        if (!video || !track || video.readyState < 2) continue;

        const clipTime = playback.currentTime - clip.startTime;
        if (clipTime < 0 || clipTime >= clip.duration || !clip.visible || !track.visible) {
          video.pause();
          video.muted = true;
          continue;
        }

        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(video.currentTime - sourceTime) > 0.1) {
          video.currentTime = sourceTime;
        }

        video.playbackRate = playback.playbackRate;

        const isAudible = audibleClipIds.has(clip.id);
        video.muted = !isAudible;
        const clipVolume = typeof clip.audioVolume === "number" ? clip.audioVolume : 100;
        video.volume = isAudible ? Math.max(0, Math.min(1, clipVolume / 100)) : 0;

        video.play().catch(() => {});
      }

      // Sync and play audio-only clips.
      for (const clip of audioClips) {
        const audio = audioElementsRef.current?.get(clip.sourceUrl);
        const track = trackById.get(clip.trackId);
        if (!audio || !track) continue;

        const clipTime = playback.currentTime - clip.startTime;
        if (
          clipTime < 0 ||
          clipTime >= clip.duration ||
          !clip.visible ||
          !track.visible ||
          !audibleClipIds.has(clip.id)
        ) {
          audio.pause();
          audio.muted = true;
          continue;
        }

        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(audio.currentTime - sourceTime) > 0.1) {
          audio.currentTime = sourceTime;
        }

        audio.playbackRate = playback.playbackRate;
        audio.muted = false;
        audio.volume = Math.max(0, Math.min(1, (clip.audioVolume ?? 100) / 100));
        audio.play().catch(() => {});
      }
    } else if (wasPlayingRef.current) {
      // Playback stopped - pause all videos and mute audio.
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

    wasPlayingRef.current = playback.isPlaying;
  }, [playback.isPlaying, playback.currentTime, playback.playbackRate, clips, tracks, getClipAtTime, videoElementsRef, audioElementsRef]);

  // Setup video ready listeners
  useEffect(() => {
    const videoClips = clips.filter((c): c is VideoClip => c.type === "video");
    const cleanupFns: (() => void)[] = [];

    for (const clip of videoClips) {
      const video = videoElementsRef.current?.get(clip.sourceUrl);
      if (video) {
        const handleCanPlay = () => {
          setVideoReadyCount((c) => c + 1);
        };
        const handleSeeked = () => {
          setVideoReadyCount((c) => c + 1);
        };

        video.addEventListener("canplay", handleCanPlay);
        video.addEventListener("seeked", handleSeeked);
        video.addEventListener("loadeddata", handleCanPlay);

        cleanupFns.push(() => {
          video.removeEventListener("canplay", handleCanPlay);
          video.removeEventListener("seeked", handleSeeked);
          video.removeEventListener("loadeddata", handleCanPlay);
        });

        // If video is already ready, trigger re-render
        if (video.readyState >= 2) {
          setVideoReadyCount((c) => c + 1);
        }
      }
    }

    return () => {
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

  // Render the composited frame
  const render = useCallback(() => {
    const canvas = previewCanvasRef.current;
    const container = previewContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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

    // Clear with background color
    ctx.fillStyle = "#1a1a1a";
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

    // Sort tracks by zIndex (lower first = background)
    const sortedTracks = [...tracks].sort((a, b) => a.zIndex - b.zIndex);

    const selectedVisualClipId = selectedClipIds.find((clipId) => {
      const selected = clips.find((clip) => clip.id === clipId);
      return !!selected && selected.type !== "audio";
    }) || null;

    // Composite each track
    for (const track of sortedTracks) {
      if (!track.visible) continue;

      const clip = getClipAtTime(track.id, playback.currentTime);
      if (!clip || !clip.visible) continue;

      // Get the video/image element for this clip
      const videoElement = videoElementsRef.current.get(clip.sourceUrl);

      if (clip.type === "video" && videoElement) {
        // Check if video has enough data to display
        if (videoElement.readyState < 2) {
          // Video not ready yet, skip for now (will re-render when ready)
          continue;
        }

        // Calculate source time
        const clipTime = playback.currentTime - clip.startTime;
        const sourceTime = clip.trimIn + clipTime;

        // During playback, let the video play naturally (don't seek every frame)
        // Only seek when paused (scrubbing) or when severely out of sync
        if (!playback.isPlaying) {
          // Paused - seek to exact position
          if (Math.abs(videoElement.currentTime - sourceTime) > 0.05) {
            videoElement.currentTime = sourceTime;
            // Will re-render when seeked event fires
            continue;
          }
        }
        // During playback, just draw whatever frame the video is at
        // The video.play() handles syncing

        // Draw video frame
        ctx.globalAlpha = clip.opacity / 100;
        ctx.drawImage(
          videoElement,
          offsetX + clip.position.x * scale,
          offsetY + clip.position.y * scale,
          clip.sourceSize.width * scale * clip.scale,
          clip.sourceSize.height * scale * clip.scale
        );
        ctx.globalAlpha = 1;
      } else if (clip.type === "image") {
        // Draw image
        const img = new Image();
        img.src = clip.sourceUrl;
        if (img.complete) {
          ctx.globalAlpha = clip.opacity / 100;
          ctx.drawImage(
            img,
            offsetX + clip.position.x * scale,
            offsetY + clip.position.y * scale,
            clip.sourceSize.width * scale * clip.scale,
            clip.sourceSize.height * scale * clip.scale
          );
          ctx.globalAlpha = 1;
        }
      }

      if (selectedVisualClipId && clip.id === selectedVisualClipId && clip.type !== "audio") {
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
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
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
    ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--border-strong").trim() || "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
  }, [
    previewCanvasRef,
    playback.currentTime,
    playback.isPlaying,
    project.canvasSize,
    tracks,
    clips,
    selectedClipIds,
    toolMode,
    cropArea,
    getClipAtTime,
    videoElementsRef,
    drawCheckerboard,
    videoReadyCount,
    previewContainerRef,
  ]);

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
    const sortedTracks = [...tracks].sort((a, b) => b.zIndex - a.zIndex);

    for (const track of sortedTracks) {
      if (!track.visible || track.locked) continue;
      const clip = getClipAtTime(track.id, playback.currentTime);
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
  }, [tracks, getClipAtTime, playback.currentTime]);

  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
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
  }, [toolMode, screenToProject, canvasExpandMode, clampToCanvas, cropArea, isInsideCropArea, setCropArea, hitTestClipAtPoint, saveToHistory, selectClip]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
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
  }, [screenToProject, canvasExpandMode, clampToCanvas, project.canvasSize.width, project.canvasSize.height, setCropArea, isDraggingClip, updateClip]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
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
  }, []);

  // Render on playback time change
  useEffect(() => {
    render();
  }, [render, playback.currentTime]);

  // Handle resize
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(render);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [render, previewContainerRef]);

  return (
    <div
      ref={previewContainerRef}
      className={cn("relative w-full h-full overflow-hidden", className)}
    >
      <canvas
        ref={previewCanvasRef}
        className="absolute inset-0"
        style={{
          cursor: toolMode === "crop"
            ? (isDraggingCrop ? "grabbing" : "crosshair")
            : (isDraggingClip ? "grabbing" : (toolMode === "select" || toolMode === "move" ? "grab" : "default")),
          touchAction: "none",
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}
