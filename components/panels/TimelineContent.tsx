"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import { OverlayScrollbarsComponentRef } from "overlayscrollbars-react";
import { useEditor } from "../../domains/sprite/contexts/SpriteEditorContext";
import { Scrollbar, NumberScrubber } from "../../shared/components";
import { ExportDropdown } from "../timeline";
import { SpriteTrack } from "../../domains/sprite/types";
import { compositeFrame } from "../../domains/sprite/utils/compositor";
import { useSpriteTrackStore } from "../../domains/sprite/stores/useSpriteTrackStore";
import { generateCompositedSpriteSheet } from "../../domains/sprite/utils/export";
import { PlayIcon, StopIcon, EyeOpenIcon, EyeClosedIcon, LockClosedIcon, LockOpenIcon } from "../../shared/components/icons";

// ============================================
// Multi-Track Timeline
// ============================================

const TRACK_HEIGHT = 48;
const CELL_WIDTH = 40;
const HEADER_MIN = 100;
const HEADER_MAX = 300;
const HEADER_DEFAULT = 144;
const LS_KEY = "sprite-timeline-header-width";

export default function TimelineContent() {
  const {
    tracks,
    activeTrackId,
    setActiveTrackId,
    addTrack,
    removeTrack,
    updateTrack,
    currentFrameIndex,
    setCurrentFrameIndex,
    isPlaying,
    setIsPlaying,
    fps,
    setFps,
    pushHistory,
    previewCanvasRef,
    animationRef,
    lastFrameTimeRef,
    getMaxFrameCount,
  } = useEditor();

  const [editingTrackId, setEditingTrackId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Header resize state
  const [headerWidth, setHeaderWidth] = useState(HEADER_DEFAULT);
  const [isHeaderResizing, setIsHeaderResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, width: HEADER_DEFAULT });

  // Scroll sync refs
  const trackHeadersRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const scrollbarRef = useRef<OverlayScrollbarsComponentRef>(null);

  // Preview frame drawing (composited from all tracks)
  const drawPreviewFrame = useCallback(
    (frameIndex: number) => {
      if (!previewCanvasRef.current) return;

      compositeFrame(tracks, frameIndex).then((result) => {
        if (!result || !previewCanvasRef.current) return;

        const canvas = previewCanvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        const img = new Image();
        img.onload = () => {
          const maxSize = 100;
          const frameScale = Math.min(maxSize / img.width, maxSize / img.height, 1);
          canvas.width = img.width * frameScale;
          canvas.height = img.height * frameScale;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        };
        img.src = result.dataUrl;
      });
    },
    [tracks, previewCanvasRef],
  );

  // Animation loop
  useEffect(() => {
    const maxFrames = getMaxFrameCount();
    if (!isPlaying || maxFrames === 0) {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      return;
    }

    const frameDuration = 1000 / fps;

    const animate = (timestamp: number) => {
      if (timestamp - lastFrameTimeRef.current >= frameDuration) {
        lastFrameTimeRef.current = timestamp;
        setCurrentFrameIndex((prev: number) => {
          const latestTracks = useSpriteTrackStore.getState().tracks;
          let next = (prev + 1) % maxFrames;
          let checked = 0;
          while (checked < maxFrames) {
            const allDisabled = latestTracks
              .filter((t) => t.visible && t.frames.length > 0)
              .every((t) => {
                const idx = next < t.frames.length ? next : t.loop ? next % t.frames.length : -1;
                return idx === -1 || t.frames[idx]?.disabled;
              });
            if (!allDisabled) return next;
            next = (next + 1) % maxFrames;
            checked++;
          }
          return prev;
        });
      }
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isPlaying, fps, getMaxFrameCount, animationRef, lastFrameTimeRef, setCurrentFrameIndex]);

  useEffect(() => {
    drawPreviewFrame(currentFrameIndex);
  }, [currentFrameIndex, drawPreviewFrame]);

  // Load header width from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    if (!stored) return;
    const parsed = Number(stored);
    if (Number.isFinite(parsed)) {
      setHeaderWidth(Math.max(HEADER_MIN, Math.min(HEADER_MAX, parsed)));
    }
  }, []);

  // Header resize drag
  const handleStartHeaderResize = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    resizeStartRef.current = { x: e.clientX, width: headerWidth };
    setIsHeaderResizing(true);
  }, [headerWidth]);

  useEffect(() => {
    if (!isHeaderResizing) return;

    const handleMove = (event: PointerEvent) => {
      const delta = event.clientX - resizeStartRef.current.x;
      const nextWidth = Math.max(HEADER_MIN, Math.min(HEADER_MAX, resizeStartRef.current.width + delta));
      setHeaderWidth(nextWidth);
      localStorage.setItem(LS_KEY, String(nextWidth));
    };

    const handleUp = () => {
      setIsHeaderResizing(false);
    };

    document.addEventListener("pointermove", handleMove);
    document.addEventListener("pointerup", handleUp);
    document.addEventListener("pointercancel", handleUp);
    return () => {
      document.removeEventListener("pointermove", handleMove);
      document.removeEventListener("pointerup", handleUp);
      document.removeEventListener("pointercancel", handleUp);
    };
  }, [isHeaderResizing]);

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

  // Export composited sprite sheet
  const exportSpriteSheet = useCallback(async () => {
    const dataUrl = await generateCompositedSpriteSheet(tracks);
    if (!dataUrl) return;

    const link = document.createElement("a");
    link.download = "spritesheet.png";
    link.href = dataUrl;
    link.click();
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

  const maxFrameCount = getMaxFrameCount();

  // Per-track enabled (non-disabled) frame indices — disabled frames are "trimmed" from timeline
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

  // ---- Scrubbing (drag-to-navigate) ----
  const [isScrubbing, setIsScrubbing] = useState(false);

  const getFrameFromClientX = useCallback((clientX: number, overrideTrackId?: string) => {
    const el = rulerRef.current;
    if (!el) return -1;
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

  const handleScrubStart = useCallback((e: React.MouseEvent, trackId?: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsScrubbing(true);
    setIsPlaying(false);
    if (trackId) setActiveTrackId(trackId);
    const idx = getFrameFromClientX(e.clientX, trackId);
    if (idx >= 0) setCurrentFrameIndex(idx);
  }, [getFrameFromClientX, setIsPlaying, setCurrentFrameIndex, setActiveTrackId]);

  useEffect(() => {
    if (!isScrubbing) return;

    const handleMove = (e: MouseEvent) => {
      e.preventDefault();
      const idx = getFrameFnRef.current(e.clientX);
      if (idx >= 0) setCurrentFrameIndex(idx);
    };

    const handleUp = () => setIsScrubbing(false);

    document.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseup", handleUp);

    return () => {
      document.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseup", handleUp);
    };
  }, [isScrubbing, setCurrentFrameIndex]);

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Control bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-default shrink-0 bg-surface-secondary/50">
        {/* Playback */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={maxFrameCount === 0}
          className="p-1.5 bg-accent-primary hover:bg-accent-primary-hover disabled:opacity-40 text-white rounded transition-colors"
        >
          {isPlaying ? <StopIcon className="w-3.5 h-3.5" /> : <PlayIcon className="w-3.5 h-3.5" />}
        </button>

        {/* FPS */}
        <NumberScrubber
          value={fps}
          onChange={setFps}
          min={1}
          max={60}
          step={1}
          label="FPS"
          size="sm"
        />

        {/* Frame counter */}
        <span className="text-[10px] text-text-secondary">
          {maxEnabledCount > 0
            ? `${(activeEnabledIndices.indexOf(currentFrameIndex) + 1) || "—"}/${maxEnabledCount}`
            : "—"}
        </span>

        {/* Preview */}
        <div className="checkerboard w-10 h-10 rounded flex items-center justify-center overflow-hidden border border-border-default">
          {maxFrameCount > 0 ? (
            <canvas ref={previewCanvasRef} className="max-w-full max-h-full" />
          ) : (
            <span className="text-text-tertiary text-[9px]">—</span>
          )}
        </div>

        <div className="flex-1" />

        {/* Add track */}
        <button
          onClick={handleAddTrack}
          className="px-2 py-1 bg-surface-tertiary hover:bg-interactive-hover text-text-secondary rounded text-xs transition-colors"
        >
          + Track
        </button>

        {/* Export */}
        {getMaxFrameCount() > 0 && (
          <ExportDropdown tracks={tracks} fps={fps} onExportSpriteSheet={exportSpriteSheet} />
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
          onMouseDown={(e) => handleScrubStart(e)}
        >
          <div className="flex items-end h-full bg-surface-secondary" style={{ width: maxEnabledCount * CELL_WIDTH }}>
            {Array.from({ length: maxEnabledCount }).map((_, i) => {
              const isCurrent = activeEnabledIndices[i] === currentFrameIndex;
              return (
                <div
                  key={i}
                  className={`flex items-center justify-center shrink-0 border-r border-border-default/30 text-[9px] pointer-events-none transition-colors ${
                    isCurrent
                      ? "text-accent-primary font-bold bg-accent-primary/10"
                      : "text-text-tertiary"
                  }`}
                  style={{ width: CELL_WIDTH, height: "100%" }}
                >
                  {i + 1}
                </div>
              );
            })}
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
          {tracks.map((track: SpriteTrack) => (
            <div
              key={track.id}
              onClick={() => setActiveTrackId(track.id)}
              className={`flex items-center gap-1 px-2 border-b border-r border-border-default cursor-pointer transition-colors ${
                track.id === activeTrackId
                  ? "bg-accent-primary/10"
                  : "bg-surface-primary hover:bg-surface-secondary/50"
              } ${!track.visible ? "opacity-40" : ""}`}
              style={{ height: TRACK_HEIGHT }}
            >
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

              {/* Delete track */}
              {tracks.length > 1 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteTrack(track.id);
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-[9px] text-text-tertiary hover:text-accent-danger hover:bg-accent-danger/10 transition-colors"
                  title="Delete track"
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>

        {/* Resize handle */}
        <div
          className="w-1 shrink-0 cursor-ew-resize touch-none bg-border-default hover:bg-accent-primary transition-colors"
          onPointerDown={handleStartHeaderResize}
          title="Resize track headers"
        />

        {/* Right: Frame content (scrollable) */}
        <Scrollbar ref={scrollbarRef} className="flex-1 min-w-0">
          <div style={{ minWidth: maxEnabledCount * CELL_WIDTH }}>
            {tracks.map((track: SpriteTrack) => {
              const enabledIndices = trackEnabledIndicesMap.get(track.id) ?? [];
              return (
                <div
                  key={track.id}
                  className={`flex border-b border-border-default transition-colors cursor-pointer ${
                    track.id === activeTrackId ? "bg-accent-primary/5" : ""
                  } ${!track.visible ? "opacity-40" : ""}`}
                  style={{ height: TRACK_HEIGHT }}
                  onMouseDown={(e) => handleScrubStart(e, track.id)}
                >
                  {/* Frame cells (only enabled frames — disabled are trimmed) */}
                  {Array.from({ length: maxEnabledCount }).map((_, visualIdx) => {
                    const absIdx = enabledIndices[visualIdx];
                    const frame = absIdx !== undefined ? track.frames[absIdx] : undefined;
                    const isCurrentFrame = absIdx !== undefined && absIdx === currentFrameIndex;

                    return (
                      <div
                        key={visualIdx}
                        className={`shrink-0 border-r border-border-default/20 flex items-center justify-center transition-colors pointer-events-none ${
                          isCurrentFrame ? "bg-accent-primary/10" : ""
                        }`}
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
            })}

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
