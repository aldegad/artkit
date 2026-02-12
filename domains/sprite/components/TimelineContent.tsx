"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { useEditorHistory, useEditorRefs } from "../contexts/SpriteEditorContext";
import { Scrollbar, NumberScrubber, Popover } from "@/shared/components";
import { useDeferredPointerGesture } from "@/shared/hooks";
import { safeSetPointerCapture } from "@/shared/utils";
import { SpriteTrack } from "../types";
import { useSpriteTrackStore } from "../stores/useSpriteTrackStore";
import { PlayIcon, StopIcon, EyeOpenIcon, EyeClosedIcon, LockClosedIcon, LockOpenIcon, MenuIcon, DuplicateIcon, RotateIcon, DeleteIcon } from "@/shared/components/icons";

// ============================================
// Multi-Track Timeline
// ============================================

const TRACK_HEIGHT = 48;
const CELL_WIDTH = 40;
const HEADER_MIN = 40;
const HEADER_MAX = 300;
const HEADER_DEFAULT = 144;
const HEADER_DEFAULT_MOBILE = 40;
const HEADER_COMPACT_BREAKPOINT = 120;
const CONTROL_BAR_COMPACT_BREAKPOINT = 240;
const LS_KEY = "sprite-timeline-header-width";

function detectMobileLikeDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const mobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const coarsePointer = window.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  const narrowViewport = window.innerWidth > 0 && window.innerWidth <= 1024;
  return mobileUA || (coarsePointer && narrowViewport);
}

interface ScrubPendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
  trackId: string | null;
}

interface HeaderResizePendingState {
  pointerId: number;
  clientX: number;
  clientY: number;
  startWidth: number;
}

export default function TimelineContent() {
  const tracks = useSpriteTrackStore((s) => s.tracks);
  const activeTrackId = useSpriteTrackStore((s) => s.activeTrackId);
  const setActiveTrackId = useSpriteTrackStore((s) => s.setActiveTrackId);
  const addTrack = useSpriteTrackStore((s) => s.addTrack);
  const duplicateTrack = useSpriteTrackStore((s) => s.duplicateTrack);
  const removeTrack = useSpriteTrackStore((s) => s.removeTrack);
  const reverseTrackFrames = useSpriteTrackStore((s) => s.reverseTrackFrames);
  const updateTrack = useSpriteTrackStore((s) => s.updateTrack);
  const reorderTracks = useSpriteTrackStore((s) => s.reorderTracks);
  const currentFrameIndex = useSpriteTrackStore((s) => s.currentFrameIndex);
  const setCurrentFrameIndex = useSpriteTrackStore((s) => s.setCurrentFrameIndex);
  const isPlaying = useSpriteTrackStore((s) => s.isPlaying);
  const setIsPlaying = useSpriteTrackStore((s) => s.setIsPlaying);
  const fps = useSpriteTrackStore((s) => s.fps);
  const setFps = useSpriteTrackStore((s) => s.setFps);
  const maxFrameCount = useSpriteTrackStore((s) =>
    s.tracks.length === 0 ? 0 : Math.max(...s.tracks.map((t) => t.frames.length))
  );
  const { animationRef, lastFrameTimeRef } = useEditorRefs();
  const { pushHistory } = useEditorHistory();

  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggedTrackId, setDraggedTrackId] = useState<string | null>(null);
  const [dragOverTrackId, setDragOverTrackId] = useState<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Header resize state
  const [headerWidth, setHeaderWidth] = useState(HEADER_DEFAULT);
  const [headerResizePending, setHeaderResizePending] = useState<HeaderResizePendingState | null>(null);
  const [isMobileLike, setIsMobileLike] = useState(false);
  const headerStorageKey = isMobileLike ? `${LS_KEY}-mobile` : LS_KEY;
  const defaultHeaderWidth = isMobileLike ? HEADER_DEFAULT_MOBILE : HEADER_DEFAULT;

  // Scroll sync refs
  const trackHeadersRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<OverlayScrollbarsComponentRef>(null);

  // Compact mode
  const controlBarRef = useRef<HTMLDivElement>(null);
  const [isControlBarCompact, setIsControlBarCompact] = useState(false);

  // Control bar compact mode detection
  useEffect(() => {
    const el = controlBarRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsControlBarCompact(entry.contentRect.width < CONTROL_BAR_COMPACT_BREAKPOINT);
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Animation loop
  useEffect(() => {
    const maxFrames = maxFrameCount;
    if (!isPlaying || maxFrames === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameDuration = 1000 / fps;
    const maxCatchUpSteps = Math.max(1, Math.min(maxFrames, 8));

    const animate = (timestamp: number) => {
      if (lastFrameTimeRef.current === 0) {
        lastFrameTimeRef.current = timestamp;
      }

      const elapsed = timestamp - lastFrameTimeRef.current;
      if (elapsed >= frameDuration) {
        const rawSteps = Math.floor(elapsed / frameDuration);
        const steps = Math.max(1, Math.min(rawSteps, maxCatchUpSteps));
        lastFrameTimeRef.current += steps * frameDuration;

        setCurrentFrameIndex((prev: number) => {
          const latestTracks = useSpriteTrackStore.getState().tracks;
          let current = prev;

          for (let step = 0; step < steps; step++) {
            let next = (current + 1) % maxFrames;
            let checked = 0;
            while (checked < maxFrames) {
              const allDisabled = latestTracks
                .filter((t) => t.visible && t.frames.length > 0)
                .every((t) => {
                  const idx = next < t.frames.length ? next : t.loop ? next % t.frames.length : -1;
                  return idx === -1 || t.frames[idx]?.disabled;
                });
              if (!allDisabled) {
                current = next;
                break;
              }
              next = (next + 1) % maxFrames;
              checked++;
            }

            // No playable frame found
            if (checked >= maxFrames) {
              break;
            }
          }

          return current;
        });
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, fps, maxFrameCount, animationRef, lastFrameTimeRef, setCurrentFrameIndex]);

  useEffect(() => {
    // Keep timestamp in sync when playback stops/starts to avoid first-frame jump.
    if (!isPlaying) {
      lastFrameTimeRef.current = 0;
    }
  }, [isPlaying, lastFrameTimeRef]);

  // Load header width from localStorage
  useEffect(() => {
    setIsMobileLike(detectMobileLikeDevice());
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(headerStorageKey);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      setHeaderWidth(Math.max(HEADER_MIN, Math.min(HEADER_MAX, parsed)));
    }
  }, [headerStorageKey]);

  useEffect(() => {
    const stored = localStorage.getItem(headerStorageKey);
    if (stored !== null) return;
    setHeaderWidth(defaultHeaderWidth);
  }, [headerStorageKey, defaultHeaderWidth]);

  // Header resize drag
  const handleStartHeaderResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    safeSetPointerCapture(e.target, e.pointerId);
    setHeaderResizePending({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      startWidth: headerWidth,
    });
  }, [headerWidth]);

  useDeferredPointerGesture<HeaderResizePendingState>({
    pending: headerResizePending,
    thresholdPx: 0,
    onMoveResolved: ({ pending, event }) => {
      const delta = event.clientX - pending.clientX;
      const nextWidth = Math.max(HEADER_MIN, Math.min(HEADER_MAX, pending.startWidth + delta));
      setHeaderWidth(nextWidth);
      localStorage.setItem(headerStorageKey, String(nextWidth));
    },
    onEnd: () => {
      setHeaderResizePending(null);
    },
  });

  // Scroll sync: frame content → headers (vertical) + ruler (horizontal)
  useEffect(() => {
    const instance = scrollbarRef.current?.osInstance();
    if (!instance) return;

    const viewport = instance.elements().viewport;
    const headersEl = trackHeadersRef.current;
    const rulerEl = rulerRef.current;

    const onScroll = () => {
      if (headersEl) headersEl.scrollTop = viewport.scrollTop;
      if (rulerEl) rulerEl.scrollLeft = viewport.scrollLeft;
    };

    viewport.addEventListener("scroll", onScroll, { passive: true });
    return () => viewport.removeEventListener("scroll", onScroll);
  }, [tracks]);

  // Add new track
  const handleAddTrack = useCallback(() => {
    pushHistory();
    addTrack();
  }, [pushHistory, addTrack]);

  // Delete track
  const handleDeleteTrack = useCallback(
    (trackId: string) => {
      if (tracks.length <= 1) return;
      pushHistory();
      removeTrack(trackId);
    },
    [tracks.length, pushHistory, removeTrack],
  );

  const handleDuplicateTrack = useCallback(
    (trackId: string) => {
      pushHistory();
      duplicateTrack(trackId);
    },
    [pushHistory, duplicateTrack],
  );

  const handleReverseTrackFrames = useCallback(
    (trackId: string) => {
      pushHistory();
      reverseTrackFrames(trackId);
    },
    [pushHistory, reverseTrackFrames],
  );

  const isInteractiveDragTarget = useCallback((target: EventTarget | null) => {
    if (!(target instanceof HTMLElement)) return false;
    return Boolean(target.closest("button, input, textarea, select, [contenteditable='true']"));
  }, []);

  const handleTrackDropById = useCallback((fromTrackId: string, toTrackId: string) => {
    if (!fromTrackId || !toTrackId || fromTrackId === toTrackId) return;
    const fromIndex = tracks.findIndex((track) => track.id === fromTrackId);
    const toIndex = tracks.findIndex((track) => track.id === toTrackId);
    if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return;
    pushHistory();
    reorderTracks(fromIndex, toIndex);
  }, [tracks, pushHistory, reorderTracks]);

  const handleTrackDragStart = useCallback((event: React.DragEvent<HTMLDivElement>, trackId: string) => {
    if (editingTrackId === trackId || isInteractiveDragTarget(event.target)) {
      event.preventDefault();
      return;
    }
    setDraggedTrackId(trackId);
    setDragOverTrackId(trackId);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", trackId);
  }, [editingTrackId, isInteractiveDragTarget]);

  const handleTrackDragOver = useCallback((event: React.DragEvent<HTMLDivElement>, trackId: string) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    setDragOverTrackId((prev) => (prev === trackId ? prev : trackId));
  }, []);

  const handleTrackDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>, trackId: string) => {
    if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return;
    setDragOverTrackId((prev) => (prev === trackId ? null : prev));
  }, []);

  const handleTrackDrop = useCallback((event: React.DragEvent<HTMLDivElement>, toTrackId: string) => {
    event.preventDefault();
    const fromTrackId = draggedTrackId ?? event.dataTransfer.getData("text/plain");
    if (fromTrackId) {
      handleTrackDropById(fromTrackId, toTrackId);
    }
    setDraggedTrackId(null);
    setDragOverTrackId(null);
  }, [draggedTrackId, handleTrackDropById]);

  const handleTrackDragEnd = useCallback(() => {
    setDraggedTrackId(null);
    setDragOverTrackId(null);
  }, []);

  // Start editing track name
  const startEditingName = useCallback((track: SpriteTrack) => {
    setEditingTrackId(track.id);
    setEditingName(track.name);
    setTimeout(() => nameInputRef.current?.select(), 0);
  }, []);

  // Finish editing track name
  const finishEditingName = useCallback(() => {
    if (editingTrackId && editingName.trim()) {
      updateTrack(editingTrackId, { name: editingName.trim() });
    }
    setEditingTrackId(null);
  }, [editingTrackId, editingName, updateTrack]);

  // Per-track enabled (non-disabled) frame indices — disabled frames are hidden from timeline
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
  const playheadLeft = currentVisualIndex >= 0 ? currentVisualIndex * CELL_WIDTH + CELL_WIDTH / 2 : null;

  const rulerCells = useMemo(
    () =>
      Array.from({ length: maxEnabledCount }).map((_, i) => (
        <div
          key={i}
          className="flex items-center justify-center shrink-0 border-r border-border-default/30 text-[9px] pointer-events-none text-text-tertiary"
          style={{ width: CELL_WIDTH, height: "100%" }}
        >
          {i + 1}
        </div>
      )),
    [maxEnabledCount],
  );

  // ---- Scrubbing (drag-to-navigate) ----
  const scrubTrackIdRef = useRef<string | null>(null);
  const [scrubPending, setScrubPending] = useState<ScrubPendingState | null>(null);

  const getFrameFromClientX = useCallback((clientX: number, overrideTrackId?: string) => {
    const el = rulerRef.current;
    if (!el) return -1;
    if (maxEnabledCount <= 0) return -1;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    const visualIdx = Math.max(0, Math.min(maxEnabledCount - 1, Math.floor(x / CELL_WIDTH)));
    const tId = overrideTrackId || activeTrackId;
    const enabledIndices = trackEnabledIndicesMap.get(tId ?? "") ??
      ([...trackEnabledIndicesMap.values()][0] ?? []);
    return enabledIndices[visualIdx] ?? -1;
  }, [maxEnabledCount, activeTrackId, trackEnabledIndicesMap]);

  const getFrameFnRef = useRef(getFrameFromClientX);
  getFrameFnRef.current = getFrameFromClientX;

  const handleScrubStart = useCallback((e: React.PointerEvent, trackId?: string, jumpOnStart = true) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsPlaying(false);
    scrubTrackIdRef.current = trackId ?? activeTrackId ?? null;
    if (trackId) setActiveTrackId(trackId);

    if (jumpOnStart) {
      const idx = getFrameFromClientX(e.clientX, scrubTrackIdRef.current ?? undefined);
      if (idx >= 0) setCurrentFrameIndex(idx);
    }
    setScrubPending({
      pointerId: e.pointerId,
      clientX: e.clientX,
      clientY: e.clientY,
      trackId: scrubTrackIdRef.current,
    });
  }, [getFrameFromClientX, setIsPlaying, setCurrentFrameIndex, setActiveTrackId, activeTrackId]);

  useDeferredPointerGesture<ScrubPendingState>({
    pending: scrubPending,
    thresholdPx: 0,
    onMoveResolved: ({ pending, event }) => {
      event.preventDefault();
      const idx = getFrameFnRef.current(event.clientX, pending.trackId ?? undefined);
      if (idx >= 0) setCurrentFrameIndex(idx);
    },
    onEnd: () => {
      setScrubPending(null);
      scrubTrackIdRef.current = null;
    },
  });

  const trackRows = useMemo(
    () =>
      tracks.map((track: SpriteTrack) => {
        const enabledIndices = trackEnabledIndicesMap.get(track.id) ?? [];
        return (
          <div
            key={track.id}
            className={`flex border-b border-border-default transition-colors cursor-pointer ${
              track.id === activeTrackId ? "bg-accent-primary/5" : ""
            } ${!track.visible ? "opacity-40" : ""}`}
            style={{ height: TRACK_HEIGHT }}
            onPointerDown={(e) => handleScrubStart(e, track.id, false)}
          >
            {Array.from({ length: maxEnabledCount }).map((_, visualIdx) => {
              const absIdx = enabledIndices[visualIdx];
              const frame = absIdx !== undefined ? track.frames[absIdx] : undefined;

              return (
                <div
                  key={visualIdx}
                  className="shrink-0 border-r border-border-default/20 flex items-center justify-center transition-colors pointer-events-none"
                  style={{ width: CELL_WIDTH, height: TRACK_HEIGHT }}
                >
                  {frame ? (
                    <div className="w-[34px] h-[34px] rounded overflow-hidden bg-surface-tertiary">
                      {frame.imageData ? (
                        <img
                          src={frame.imageData}
                          alt=""
                          className="w-full h-full object-contain"
                          draggable={false}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[8px] text-text-tertiary">
                          {visualIdx + 1}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="w-1 h-1 rounded-full bg-border-default/30" />
                  )}
                </div>
              );
            })}
          </div>
        );
      }),
    [tracks, trackEnabledIndicesMap, activeTrackId, maxEnabledCount, handleScrubStart],
  );

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Control bar */}
      <div ref={controlBarRef} className="flex items-center gap-2 px-3 py-1.5 border-b border-border-default shrink-0 bg-surface-secondary/50">
        {/* Playback - always visible */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={maxFrameCount === 0}
          className="p-1.5 bg-accent-primary hover:bg-accent-primary-hover disabled:opacity-40 text-white rounded transition-colors"
        >
          {isPlaying ? <StopIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />}
        </button>

        {isControlBarCompact ? (
          <>
            <div className="flex-1" />
            <Popover
              trigger={
                <button className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors" title="Timeline controls">
                  <MenuIcon className="w-3.5 h-3.5" />
                </button>
              }
              align="start"
              side="bottom"
              closeOnScroll={false}
            >
              <div className="flex flex-col gap-1 p-2 min-w-[160px]">
                <div className="flex items-center gap-2 px-1">
                  <NumberScrubber value={fps} onChange={setFps} min={1} max={60} step={1} label="FPS" size="sm" />
                </div>
                <div className="px-2 py-1 text-[10px] text-text-secondary">
                  {maxEnabledCount > 0 ? `Frame ${(currentVisualIndex + 1) || "—"} / ${maxEnabledCount}` : "No frames"}
                </div>
                <div className="h-px bg-border-default mx-1" />
                <button
                  onClick={handleAddTrack}
                  className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                >
                  + Add Track
                </button>
              </div>
            </Popover>
          </>
        ) : (
          <>
            {/* FPS */}
            <NumberScrubber value={fps} onChange={setFps} min={1} max={60} step={1} label="FPS" size="sm" />

            {/* Frame counter */}
            <span className="text-[10px] text-text-secondary">
              {maxEnabledCount > 0 ? `${(currentVisualIndex + 1) || "—"}/${maxEnabledCount}` : "—"}
            </span>

            <div className="flex-1" />

            {/* Add track */}
            <button
              onClick={handleAddTrack}
              className="px-2 py-1 bg-surface-tertiary hover:bg-interactive-hover text-text-secondary rounded text-xs transition-colors"
            >
              + Track
            </button>
          </>
        )}
      </div>

      {/* Ruler row */}
      <div className="flex border-b border-border-default shrink-0">
        {/* Corner spacer */}
        <div
          className="shrink-0 bg-surface-secondary border-r border-border-default h-6"
          style={{ width: headerWidth }}
        />
        {/* Resize handle spacer */}
        <div className="w-1 shrink-0" />
        {/* Frame ruler (synced horizontally, drag to scrub) */}
        <div
          ref={rulerRef}
          className="flex-1 overflow-hidden h-6 cursor-ew-resize"
          onPointerDown={(e) => handleScrubStart(e, undefined, true)}
        >
          <div className="relative h-full bg-surface-secondary" style={{ width: maxEnabledCount * CELL_WIDTH }}>
            <div className="flex items-end h-full">
              {rulerCells}
            </div>
            {playheadLeft !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-accent-primary pointer-events-none"
                style={{ left: playheadLeft }}
              />
            )}
          </div>
        </div>
      </div>

      {/* Tracks area - 3 columns */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Left: Track headers */}
        <div
          ref={trackHeadersRef}
          className="shrink-0 overflow-hidden"
          style={{ width: headerWidth }}
        >
          {tracks.map((track: SpriteTrack) => {
            const isDropTarget = dragOverTrackId === track.id && draggedTrackId !== null && draggedTrackId !== track.id;
            const isDragSource = draggedTrackId === track.id;

            return (
                <div
                  key={track.id}
                  onClick={() => setActiveTrackId(track.id)}
                  className={`flex items-center gap-1 px-2 border-b border-r border-border-default transition-colors ${
                    isDropTarget
                      ? "bg-accent-primary/20 ring-1 ring-inset ring-accent-primary"
                      : track.id === activeTrackId
                        ? "bg-accent-primary/10"
                        : "bg-surface-primary hover:bg-surface-secondary/50"
                  } ${isDragSource ? "opacity-60" : ""} ${!track.visible ? "opacity-40" : ""} ${
                    editingTrackId === track.id ? "cursor-pointer" : "cursor-grab active:cursor-grabbing"
                  }`}
                  style={{ height: TRACK_HEIGHT }}
                  draggable={editingTrackId !== track.id}
                  onDragStart={(event) => handleTrackDragStart(event, track.id)}
                  onDragOver={(event) => handleTrackDragOver(event, track.id)}
                  onDragLeave={(event) => handleTrackDragLeave(event, track.id)}
                  onDrop={(event) => handleTrackDrop(event, track.id)}
                  onDragEnd={handleTrackDragEnd}
                >
                  {headerWidth >= HEADER_COMPACT_BREAKPOINT ? (
                    <>
                  {/* Visibility toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateTrack(track.id, { visible: !track.visible });
                    }}
                    className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                      track.visible ? "text-text-primary" : "text-text-tertiary opacity-50"
                    }`}
                    title={track.visible ? "Hide" : "Show"}
                  >
                    {track.visible ? <EyeOpenIcon className="w-3.5 h-3.5" /> : <EyeClosedIcon className="w-3.5 h-3.5" />}
                  </button>

                  {/* Lock toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateTrack(track.id, { locked: !track.locked });
                    }}
                    className={`w-5 h-5 flex items-center justify-center rounded transition-colors ${
                      track.locked ? "text-accent-warning" : "text-text-tertiary"
                    }`}
                    title={track.locked ? "Unlock" : "Lock"}
                  >
                    {track.locked ? <LockClosedIcon className="w-3.5 h-3.5" /> : <LockOpenIcon className="w-3.5 h-3.5" />}
                  </button>

                  {/* Track name */}
                  <div className="flex-1 min-w-0">
                    {editingTrackId === track.id ? (
                      <input
                        ref={nameInputRef}
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={finishEditingName}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") finishEditingName();
                          if (e.key === "Escape") setEditingTrackId(null);
                        }}
                        className="w-full bg-surface-secondary border border-border-default rounded px-1 text-[10px] outline-none focus:border-accent-primary"
                      />
                    ) : (
                      <span
                        className="text-[10px] truncate block cursor-text"
                        onDoubleClick={() => startEditingName(track)}
                      >
                        {track.name}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDuplicateTrack(track.id);
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary transition-colors"
                    title="Duplicate track"
                  >
                    <DuplicateIcon className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleReverseTrackFrames(track.id);
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-text-primary hover:bg-surface-tertiary transition-colors"
                    title="Reverse frames"
                  >
                    <RotateIcon className="w-3.5 h-3.5" />
                  </button>

                  {/* Delete track */}
                  {tracks.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteTrack(track.id);
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded text-text-tertiary hover:text-accent-danger hover:bg-accent-danger/10 transition-colors"
                      title="Delete track"
                    >
                      <DeleteIcon className="w-3.5 h-3.5" />
                    </button>
                  )}
                    </>
                  ) : (
                    /* Compact mode: single menu icon */
                    <Popover
                      trigger={
                        <button
                          onClick={(e) => e.stopPropagation()}
                          className="p-1 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
                          title={track.name}
                        >
                          <MenuIcon className="w-3 h-3" />
                        </button>
                      }
                      align="start"
                      side="bottom"
                      closeOnScroll={false}
                    >
                      <div className="flex flex-col gap-0.5 p-1.5 min-w-[140px]">
                        <span
                          className="text-xs font-medium text-text-primary px-2 py-1 truncate cursor-text"
                          onDoubleClick={() => startEditingName(track)}
                        >
                          {track.name}
                        </span>
                        <div className="h-px bg-border-default mx-1" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDuplicateTrack(track.id);
                          }}
                          className="flex items-center gap-2 px-2 py-1 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                        >
                          <DuplicateIcon className="w-3 h-3" />
                          Duplicate
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleReverseTrackFrames(track.id);
                          }}
                          className="flex items-center gap-2 px-2 py-1 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                        >
                          <RotateIcon className="w-3 h-3" />
                          Reverse Frames
                        </button>
                        <div className="h-px bg-border-default mx-1" />
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTrack(track.id, { visible: !track.visible });
                          }}
                          className="flex items-center gap-2 px-2 py-1 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                        >
                          {track.visible ? <EyeOpenIcon className="w-3 h-3" /> : <EyeClosedIcon className="w-3 h-3" />}
                          {track.visible ? "Hide" : "Show"}
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            updateTrack(track.id, { locked: !track.locked });
                          }}
                          className="flex items-center gap-2 px-2 py-1 rounded text-xs text-text-secondary hover:bg-interactive-hover transition-colors"
                        >
                          {track.locked ? <LockClosedIcon className="w-3 h-3" /> : <LockOpenIcon className="w-3 h-3" />}
                          {track.locked ? "Unlock" : "Lock"}
                        </button>
                        {tracks.length > 1 && (
                          <>
                            <div className="h-px bg-border-default mx-1" />
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteTrack(track.id);
                              }}
                              className="flex items-center gap-2 px-2 py-1 rounded text-xs text-accent-danger hover:bg-accent-danger/10 transition-colors"
                            >
                              <DeleteIcon className="w-3 h-3" />
                              Delete
                            </button>
                          </>
                        )}
                      </div>
                    </Popover>
                  )}
                </div>
            );
          })}
        </div>

        {/* Resize handle */}
        <div
          className="w-1 shrink-0 cursor-ew-resize touch-none bg-border-default hover:bg-accent-primary transition-colors"
          onPointerDown={handleStartHeaderResize}
          title="Resize track headers"
        />

        {/* Right: Frame content (scrollable) */}
        <Scrollbar ref={scrollbarRef} className="flex-1 min-w-0">
          <div className="relative" style={{ minWidth: maxEnabledCount * CELL_WIDTH }}>
            {trackRows}
            {playheadLeft !== null && (
              <div
                className="absolute top-0 bottom-0 w-0.5 bg-accent-primary/80 pointer-events-none"
                style={{ left: playheadLeft }}
              />
            )}

            {/* Empty state */}
            {tracks.length === 0 && (
              <div className="flex items-center justify-center text-text-tertiary text-xs py-8">
                Click &quot;+ Track&quot; to add a track
              </div>
            )}
          </div>
        </Scrollbar>
      </div>
    </div>
  );
}
