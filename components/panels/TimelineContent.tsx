"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import { useEditor } from "../../domains/sprite/contexts/SpriteEditorContext";
import { Scrollbar, NumberScrubber } from "../../shared/components";
import { ExportDropdown } from "../timeline";
import { SpriteTrack } from "../../domains/sprite/types";
import { compositeFrame } from "../../domains/sprite/utils/compositor";
import { generateCompositedSpriteSheet } from "../../domains/sprite/utils/export";

// ============================================
// Multi-Track Timeline
// ============================================

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
        setCurrentFrameIndex((prev: number) => (prev + 1) % maxFrames);
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
  const TRACK_HEIGHT = 48;
  const CELL_WIDTH = 40;

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Control bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border-default shrink-0 bg-surface-secondary/50">
        {/* Playback */}
        <button
          onClick={() => setIsPlaying(!isPlaying)}
          disabled={maxFrameCount === 0}
          className="px-2 py-1 bg-accent-primary hover:bg-accent-primary-hover disabled:opacity-40 text-white rounded text-xs transition-colors"
        >
          {isPlaying ? "⏹" : "▶"}
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
          {maxFrameCount > 0 ? `${currentFrameIndex + 1}/${maxFrameCount}` : "—"}
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

      {/* Multi-track area */}
      <div className="flex-1 min-h-0 flex">
        {/* Track headers (left side) */}
        <div className="w-36 shrink-0 border-r border-border-default overflow-hidden">
          {/* Header spacer for frame ruler */}
          <div className="h-6 border-b border-border-default bg-surface-secondary/30" />

          <Scrollbar className="flex-1" overflow={{ y: "scroll", x: "hidden" }}>
            {tracks.map((track: SpriteTrack) => (
              <div
                key={track.id}
                onClick={() => setActiveTrackId(track.id)}
                className={`flex items-center gap-1 px-2 border-b border-border-default cursor-pointer transition-colors ${
                  track.id === activeTrackId
                    ? "bg-accent-primary/10"
                    : "hover:bg-surface-secondary/50"
                }`}
                style={{ height: TRACK_HEIGHT }}
              >
                {/* Visibility toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTrack(track.id, { visible: !track.visible });
                  }}
                  className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${
                    track.visible ? "text-text-primary" : "text-text-tertiary opacity-50"
                  }`}
                  title={track.visible ? "Hide" : "Show"}
                >
                  {track.visible ? "👁" : "👁‍🗨"}
                </button>

                {/* Lock toggle */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    updateTrack(track.id, { locked: !track.locked });
                  }}
                  className={`w-5 h-5 flex items-center justify-center rounded text-[10px] transition-colors ${
                    track.locked ? "text-accent-warning" : "text-text-tertiary"
                  }`}
                  title={track.locked ? "Unlock" : "Lock"}
                >
                  {track.locked ? "🔒" : "🔓"}
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
                    className="w-4 h-4 flex items-center justify-center rounded text-[9px] text-text-tertiary hover:text-accent-danger hover:bg-accent-danger/10 transition-colors opacity-0 group-hover:opacity-100"
                    title="Delete track"
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </Scrollbar>
        </div>

        {/* Frame grid (right side) */}
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* Frame ruler */}
          <div className="h-6 border-b border-border-default bg-surface-secondary/30 flex items-end">
            <Scrollbar overflow={{ x: "scroll", y: "hidden" }} className="w-full h-full">
              <div className="flex items-end h-full" style={{ width: maxFrameCount * CELL_WIDTH }}>
                {Array.from({ length: maxFrameCount }).map((_, i) => (
                  <div
                    key={i}
                    className={`flex items-center justify-center shrink-0 border-r border-border-default/30 text-[9px] cursor-pointer transition-colors ${
                      i === currentFrameIndex
                        ? "text-accent-primary font-bold bg-accent-primary/10"
                        : "text-text-tertiary hover:bg-surface-secondary/50"
                    }`}
                    style={{ width: CELL_WIDTH, height: "100%" }}
                    onClick={() => {
                      setIsPlaying(false);
                      setCurrentFrameIndex(i);
                    }}
                  >
                    {i + 1}
                  </div>
                ))}
              </div>
            </Scrollbar>
          </div>

          {/* Track rows */}
          <Scrollbar className="flex-1">
            {tracks.map((track: SpriteTrack) => (
              <div
                key={track.id}
                onClick={() => setActiveTrackId(track.id)}
                className={`flex border-b border-border-default transition-colors ${
                  track.id === activeTrackId
                    ? "bg-accent-primary/5"
                    : ""
                } ${!track.visible ? "opacity-40" : ""}`}
                style={{ height: TRACK_HEIGHT }}
              >
                {Array.from({ length: Math.max(maxFrameCount, track.frames.length) }).map(
                  (_, frameIdx) => {
                    const frame = track.frames[frameIdx];
                    const isCurrentFrame = frameIdx === currentFrameIndex;

                    return (
                      <div
                        key={frameIdx}
                        className={`shrink-0 border-r border-border-default/20 flex items-center justify-center transition-colors ${
                          isCurrentFrame ? "bg-accent-primary/10" : ""
                        }`}
                        style={{ width: CELL_WIDTH, height: TRACK_HEIGHT }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setIsPlaying(false);
                          setCurrentFrameIndex(frameIdx);
                          setActiveTrackId(track.id);
                        }}
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
                                {frameIdx + 1}
                              </div>
                            )}
                          </div>
                        ) : (
                          // Empty cell (track shorter than max)
                          <div className="w-1 h-1 rounded-full bg-border-default/30" />
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            ))}

            {/* Empty state */}
            {tracks.length === 0 && (
              <div className="flex items-center justify-center h-full text-text-tertiary text-xs py-8">
                Click &quot;+ Track&quot; to add a track
              </div>
            )}
          </Scrollbar>
        </div>
      </div>
    </div>
  );
}
