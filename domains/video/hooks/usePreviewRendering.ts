"use client";

import { useCallback, useEffect, useRef } from "react";
import { useVideoState, useVideoRefs, useTimeline } from "../contexts";
import { useVideoElements } from "./useVideoElements";
import { getCanvasColorsSync } from "@/shared/hooks";
import { drawScaledImage, resizeCanvasForDpr } from "@/shared/utils";
import { PREVIEW } from "../constants";
import { getClipScaleX, getClipScaleY } from "../types";
import { Clip, VideoClip, ImageClip } from "../types";
import { resolveClipPositionAtTimelineTime } from "../utils/clipTransformKeyframes";

/**
 * Handles compositing and rendering the preview canvas
 */
export function usePreviewRendering() {
  const { playback, project } = useVideoState();
  const { previewCanvasRef, previewContainerRef } = useVideoRefs();
  const { tracks, getClipAtTime } = useTimeline();
  const { getVideoElement, seekVideo } = useVideoElements();

  const imageCache = useRef<Map<string, HTMLImageElement>>(new Map());
  const rafRef = useRef<number | null>(null);

  // Load and cache image
  const loadImage = useCallback((sourceUrl: string): Promise<HTMLImageElement> => {
    const cached = imageCache.current.get(sourceUrl);
    if (cached && cached.complete) {
      return Promise.resolve(cached);
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        imageCache.current.set(sourceUrl, img);
        resolve(img);
      };
      img.onerror = reject;
      img.src = sourceUrl;
    });
  }, []);

  // Draw checkerboard pattern
  const drawCheckerboard = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) => {
      const colors = getCanvasColorsSync();
      const size = PREVIEW.CHECKERBOARD_SIZE;

      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, width, height);
      ctx.clip();

      for (let py = y; py < y + height; py += size) {
        for (let px = x; px < x + width; px += size) {
          const isEven = ((Math.floor((px - x) / size) + Math.floor((py - y) / size)) % 2) === 0;
          ctx.fillStyle = isEven ? colors.checkerboardLight : colors.checkerboardDark;
          ctx.fillRect(px, py, size, size);
        }
      }

      ctx.restore();
    },
    []
  );

  // Get frame source for a clip at the given time
  const getClipFrame = useCallback(
    async (clip: Clip, time: number): Promise<CanvasImageSource | null> => {
      const clipTime = time - clip.startTime;
      const sourceTime = clip.trimIn + clipTime;

      if (clip.type === "video") {
        const videoClip = clip as VideoClip;
        const video = getVideoElement(videoClip.id);
        if (!video) return null;

        // Seek if needed
        if (Math.abs(video.currentTime - sourceTime) > 0.05) {
          await seekVideo(videoClip.id, sourceTime);
        }

        if (video.readyState >= 2) {
          return video;
        }
        return null;
      } else if (clip.type === "image") {
        // Image clip
        const imageClip = clip as ImageClip;
        try {
          return await loadImage(imageClip.sourceUrl);
        } catch {
          return null;
        }
      }

      // Audio clip has no visual frame.
      return null;
    },
    [getVideoElement, seekVideo, loadImage]
  );

  // Main render function
  const render = useCallback(async () => {
    const canvas = previewCanvasRef.current;
    const container = previewContainerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = container.getBoundingClientRect();

    // Set canvas size with DPI scaling
    resizeCanvasForDpr(canvas, ctx, rect.width, rect.height, { scaleContext: true });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

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
    drawCheckerboard(ctx, offsetX, offsetY, previewWidth, previewHeight);

    // Sort tracks by zIndex (lower first = background)
    const sortedTracks = [...tracks].sort((a, b) => a.zIndex - b.zIndex);

    // Composite each track
    for (const track of sortedTracks) {
      if (!track.visible) continue;

      const clip = getClipAtTime(track.id, playback.currentTime);
      if (!clip || !clip.visible) continue;

      const frame = await getClipFrame(clip, playback.currentTime);
      if (!frame) continue;

      // Calculate clip position within preview
      const clipScaleX = getClipScaleX(clip);
      const clipScaleY = getClipScaleY(clip);
      const clipPosition = resolveClipPositionAtTimelineTime(clip, playback.currentTime);
      const clipX = offsetX + clipPosition.x * scale;
      const clipY = offsetY + clipPosition.y * scale;
      const clipWidth = clip.sourceSize.width * scale * clipScaleX;
      const clipHeight = clip.sourceSize.height * scale * clipScaleY;

      ctx.save();
      ctx.globalAlpha = clip.opacity / 100;

      // Apply rotation if any
      if (clip.rotation !== 0) {
        const centerX = clipX + clipWidth / 2;
        const centerY = clipY + clipHeight / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((clip.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }

      // Draw frame
      drawScaledImage(
        ctx,
        frame,
        { x: clipX, y: clipY, width: clipWidth, height: clipHeight },
        { mode: "continuous", progressiveMinify: !playback.isPlaying },
      );

      ctx.restore();
    }

    // Draw frame border
    ctx.strokeStyle = "#333";
    ctx.lineWidth = 1;
    ctx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
  }, [
    previewCanvasRef,
    previewContainerRef,
    project.canvasSize,
    playback.currentTime,
    playback.isPlaying,
    tracks,
    getClipAtTime,
    getClipFrame,
    drawCheckerboard,
  ]);

  // Render on time change
  useEffect(() => {
    render();
  }, [render, playback.currentTime]);

  // Handle resize
  useEffect(() => {
    const container = previewContainerRef.current;
    if (!container) return;

    const resizeObserver = new ResizeObserver(() => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      rafRef.current = requestAnimationFrame(() => {
        render();
      });
    });

    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [render, previewContainerRef]);

  return { render };
}
