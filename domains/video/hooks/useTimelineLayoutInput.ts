"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useDeferredPointerGesture } from "@/shared/hooks";
import { safeSetPointerCapture } from "@/shared/utils";

interface HeaderResizePendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
  startWidth: number;
}

interface UseTimelineLayoutInputOptions {
  tracksContainerRef: React.RefObject<HTMLDivElement | null>;
  defaultHeaderWidth?: number;
  minHeaderWidth?: number;
  maxHeaderWidth?: number;
  storageKey?: string;
}

interface UseTimelineLayoutInputReturn {
  trackHeadersRef: React.RefObject<HTMLDivElement | null>;
  trackHeaderWidth: number;
  headerWidthStyle: { width: number };
  headerWidthPx: string;
  handleStartHeaderResize: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function useTimelineLayoutInput(
  options: UseTimelineLayoutInputOptions
): UseTimelineLayoutInputReturn {
  const {
    tracksContainerRef,
    defaultHeaderWidth = 180,
    minHeaderWidth = 40,
    maxHeaderWidth = 360,
    storageKey = "video-timeline-track-header-width",
  } = options;

  const trackHeadersRef = useRef<HTMLDivElement | null>(null);
  const [trackHeaderWidth, setTrackHeaderWidth] = useState(defaultHeaderWidth);
  const [headerResizePending, setHeaderResizePending] = useState<HeaderResizePendingState | null>(null);

  const clampHeaderWidth = useCallback(
    (width: number) => Math.max(minHeaderWidth, Math.min(maxHeaderWidth, width)),
    [minHeaderWidth, maxHeaderWidth]
  );

  const handleStartHeaderResize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation(); // prevent timeline pointerdown from firing (seek/drag)
      safeSetPointerCapture(e.target, e.pointerId);
      setHeaderResizePending({
        pointerId: e.pointerId,
        clientX: e.clientX,
        clientY: e.clientY,
        startWidth: trackHeaderWidth,
      });
    },
    [trackHeaderWidth]
  );

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;

    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      setTrackHeaderWidth(clampHeaderWidth(parsed));
    }
  }, [storageKey, clampHeaderWidth]);

  useDeferredPointerGesture<HeaderResizePendingState>({
    pending: headerResizePending,
    thresholdPx: 0,
    onMoveResolved: ({ pending, event }) => {
      const delta = event.clientX - pending.clientX;
      const nextWidth = clampHeaderWidth(pending.startWidth + delta);
      setTrackHeaderWidth(nextWidth);
      localStorage.setItem(storageKey, String(nextWidth));
    },
    onEnd: () => {
      setHeaderResizePending(null);
    },
  });

  // Sync vertical scroll from clips area to track headers.
  useEffect(() => {
    const tracksEl = tracksContainerRef.current;
    const headersEl = trackHeadersRef.current;
    if (!tracksEl || !headersEl) return;

    const onScroll = () => {
      headersEl.scrollTop = tracksEl.scrollTop;
    };

    tracksEl.addEventListener("scroll", onScroll, { passive: true });
    return () => tracksEl.removeEventListener("scroll", onScroll);
  }, [tracksContainerRef]);

  return {
    trackHeadersRef,
    trackHeaderWidth,
    headerWidthStyle: { width: trackHeaderWidth },
    headerWidthPx: `${trackHeaderWidth}px`,
    handleStartHeaderResize,
  };
}

