"use client";

import { useRef, useEffect, useCallback } from "react";
import { useTimeline, useVideoState } from "../../contexts";
import { subscribeCacheStatus, getCacheStatus } from "../../hooks/usePreRenderCache";
import { PRE_RENDER } from "../../constants";

const BAR_HEIGHT = 3;

export function PreRenderBar() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { viewState } = useTimeline();
  const { project } = useVideoState();

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = BAR_HEIGHT;

    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // Read CSS variables
    const style = getComputedStyle(container);
    const cachedColor = style.getPropertyValue("--pre-render-cached").trim() || "#22c55e";
    const uncachedColor = style.getPropertyValue("--pre-render-uncached").trim() || "#374151";

    // Clear
    ctx.clearRect(0, 0, w, h);

    const { cachedSet, totalFrames } = getCacheStatus();
    if (totalFrames <= 0) return;

    const { zoom, scrollX } = viewState;
    const duration = project.duration || 10;
    // Draw uncached background for the visible duration range
    const visibleStartTime = scrollX;
    const visibleEndTime = scrollX + w / zoom;
    const startPx = 0;
    const endPx = Math.min(w, (duration - scrollX) * zoom);

    if (endPx > startPx) {
      ctx.fillStyle = uncachedColor;
      ctx.fillRect(startPx, 0, endPx - startPx, h);
    }

    // Draw cached segments
    ctx.fillStyle = cachedColor;

    // Optimize: batch contiguous cached frames into rectangles
    let batchStartPx = -1;

    const firstVisibleFrame = Math.max(0, Math.floor(visibleStartTime * PRE_RENDER.FRAME_RATE));
    const lastVisibleFrame = Math.min(
      totalFrames - 1,
      Math.ceil(visibleEndTime * PRE_RENDER.FRAME_RATE),
    );

    for (let fi = firstVisibleFrame; fi <= lastVisibleFrame; fi++) {
      const frameTime = fi / PRE_RENDER.FRAME_RATE;
      const px = (frameTime - scrollX) * zoom;

      if (cachedSet.has(fi)) {
        if (batchStartPx < 0) batchStartPx = px;
      } else {
        if (batchStartPx >= 0) {
          ctx.fillRect(batchStartPx, 0, px - batchStartPx, h);
          batchStartPx = -1;
        }
      }
    }

    // Flush last batch
    if (batchStartPx >= 0) {
      const endFrameTime = (lastVisibleFrame + 1) / PRE_RENDER.FRAME_RATE;
      const endFramePx = (endFrameTime - scrollX) * zoom;
      ctx.fillRect(batchStartPx, 0, endFramePx - batchStartPx, h);
    }
  }, [viewState, project.duration]);

  // Subscribe to cache status updates
  useEffect(() => {
    draw();
    return subscribeCacheStatus(draw);
  }, [draw]);

  // Redraw on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => draw());
    observer.observe(container);
    return () => observer.disconnect();
  }, [draw]);

  return (
    <div ref={containerRef} className="w-full" style={{ height: BAR_HEIGHT }}>
      <canvas ref={canvasRef} className="block" />
    </div>
  );
}
