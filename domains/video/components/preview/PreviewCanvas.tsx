"use client";

import { useRef, useEffect, useCallback, useState } from "react";
import { useVideoState, useVideoRefs, useTimeline } from "../../contexts";
import { useVideoElements } from "../../hooks";
import { cn } from "@/shared/utils/cn";
import { getCanvasColorsSync } from "@/hooks";
import { PREVIEW } from "../../constants";
import { AudioClip, VideoClip } from "../../types";

interface PreviewCanvasProps {
  className?: string;
}

export function PreviewCanvas({ className }: PreviewCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const { previewCanvasRef, videoElementsRef, audioElementsRef } = useVideoRefs();
  const { playback, project } = useVideoState();
  const { tracks, clips, getClipAtTime } = useTimeline();
  const [videoReadyCount, setVideoReadyCount] = useState(0);
  const wasPlayingRef = useRef(false);

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
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();

    // Set canvas size with DPI scaling
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    ctx.scale(dpr, dpr);

    const width = rect.width;
    const height = rect.height;

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

    // Draw checkerboard for transparency
    ctx.save();
    ctx.beginPath();
    ctx.rect(offsetX, offsetY, previewWidth, previewHeight);
    ctx.clip();
    drawCheckerboard(ctx, width, height);
    ctx.restore();

    // Sort tracks by zIndex (lower first = background)
    const sortedTracks = [...tracks].sort((a, b) => a.zIndex - b.zIndex);

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
    }

    // Draw frame border
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
  }, [
    previewCanvasRef,
    playback.currentTime,
    playback.isPlaying,
    project.canvasSize,
    tracks,
    clips,
    getClipAtTime,
    videoElementsRef,
    drawCheckerboard,
    videoReadyCount,
  ]);

  // Render on playback time change
  useEffect(() => {
    render();
  }, [render, playback.currentTime]);

  // Handle resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(render);
    });

    resizeObserver.observe(container);
    return () => resizeObserver.disconnect();
  }, [render]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full overflow-hidden", className)}
    >
      <canvas
        ref={previewCanvasRef}
        className="absolute inset-0"
      />
    </div>
  );
}
