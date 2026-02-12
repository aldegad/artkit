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
  mobileDefaultHeaderWidth?: number;
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

function detectMobileLikeDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth > 0 && window.innerWidth <= 1024;
  return mobileUA || (coarsePointer && narrowViewport);
}

export function useTimelineLayoutInput(
  options: UseTimelineLayoutInputOptions
): UseTimelineLayoutInputReturn {
  const {
    tracksContainerRef,
    defaultHeaderWidth = 180,
    mobileDefaultHeaderWidth = 40,
    minHeaderWidth = 40,
    maxHeaderWidth = 360,
    storageKey = "video-timeline-track-header-width",
  } = options;

  const trackHeadersRef = useRef<HTMLDivElement | null>(null);
  const [trackHeaderWidth, setTrackHeaderWidth] = useState(defaultHeaderWidth);
  const [headerResizePending, setHeaderResizePending] = useState<HeaderResizePendingState | null>(null);
  const [isMobileLike, setIsMobileLike] = useState(false);

  const resolvedStorageKey = isMobileLike
    ? `${storageKey}-mobile`
    : storageKey;
  const resolvedDefaultHeaderWidth = isMobileLike
    ? mobileDefaultHeaderWidth
    : defaultHeaderWidth;

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
    setIsMobileLike(detectMobileLikeDevice());
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(resolvedStorageKey);
    if (!stored) return;

    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      setTrackHeaderWidth(clampHeaderWidth(parsed));
    }
  }, [resolvedStorageKey, clampHeaderWidth]);

  useEffect(() => {
    const stored = localStorage.getItem(resolvedStorageKey);
    if (stored !== null) return;
    setTrackHeaderWidth(clampHeaderWidth(resolvedDefaultHeaderWidth));
  }, [resolvedStorageKey, resolvedDefaultHeaderWidth, clampHeaderWidth]);

  useDeferredPointerGesture<HeaderResizePendingState>({
    pending: headerResizePending,
    thresholdPx: 0,
    onMoveResolved: ({ pending, event }) => {
      const delta = event.clientX - pending.clientX;
      const nextWidth = clampHeaderWidth(pending.startWidth + delta);
      setTrackHeaderWidth(nextWidth);
      localStorage.setItem(resolvedStorageKey, String(nextWidth));
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
