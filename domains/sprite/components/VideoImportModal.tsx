"use client";

import { useState, useRef, useCallback } from "react";
import { SpriteFrame } from "../types";

// ============================================
// Types
// ============================================

interface ExtractedFrame {
  time: number;
  imageData: string;
  width: number;
  height: number;
}

interface VideoImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (frames: Omit<SpriteFrame, "id">[]) => void;
  startFrameId: number;
  translations: {
    videoImport: string;
    selectVideo: string;
    videoPreview: string;
    extractionSettings: string;
    extractFrames: string;
    everyNthFrame: string;
    timeInterval: string;
    seconds: string;
    extracting: string;
    maxFrames: string;
    extractedFrames: string;
    noFramesExtracted: string;
    selectAll: string;
    deselectAll: string;
    framesSelected: string;
    importSelected: string;
    cancel: string;
  };
}

// ============================================
// Icons
// ============================================

const VideoIcon = () => (
  <svg className="w-12 h-12 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const SpinnerIcon = () => (
  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
    <path
      className="opacity-75"
      fill="currentColor"
      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
    />
  </svg>
);

// ============================================
// Main Component
// ============================================

export default function VideoImportModal({
  isOpen,
  onClose,
  onImport,
  startFrameId,
  translations: t,
}: VideoImportModalProps) {
  // Video state
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoSize, setVideoSize] = useState({ width: 0, height: 0 });

  // Extraction settings
  const [extractionMode, setExtractionMode] = useState<"nth" | "interval">("interval");
  const [nthFrame, setNthFrame] = useState(5);
  const [timeInterval, setTimeInterval] = useState(0.1);
  const [maxFrames, setMaxFrames] = useState(100);

  // Extracted frames state
  const [extractedFrames, setExtractedFrames] = useState<ExtractedFrame[]>([]);
  const [selectedFrameIndices, setSelectedFrameIndices] = useState<Set<number>>(new Set());
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractionProgress, setExtractionProgress] = useState(0);

  // Handle video file selection
  const handleVideoSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Revoke previous URL if exists
    if (videoSrc) {
      URL.revokeObjectURL(videoSrc);
    }

    const url = URL.createObjectURL(file);
    setVideoSrc(url);
    setExtractedFrames([]);
    setSelectedFrameIndices(new Set());
  }, [videoSrc]);

  // Handle video metadata loaded
  const handleVideoLoaded = useCallback(() => {
    const video = videoRef.current;
    if (!video) return;

    setVideoDuration(video.duration);
    setVideoSize({ width: video.videoWidth, height: video.videoHeight });
  }, []);

  // Extract frames from video
  const extractFrames = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    setIsExtracting(true);
    setExtractionProgress(0);
    setExtractedFrames([]);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;

    // Calculate frame times based on mode
    const times: number[] = [];
    if (extractionMode === "nth") {
      // Estimate video frame rate (default 30fps)
      const estimatedFPS = 30;
      const frameDuration = 1 / estimatedFPS;
      for (let t = 0; t < video.duration && times.length < maxFrames; t += frameDuration * nthFrame) {
        times.push(t);
      }
    } else {
      for (let t = 0; t < video.duration && times.length < maxFrames; t += timeInterval) {
        times.push(t);
      }
    }

    const frames: ExtractedFrame[] = [];

    // Extract frames by seeking
    for (let i = 0; i < times.length; i++) {
      video.currentTime = times[i];

      // Wait for seek to complete
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
      });

      ctx.drawImage(video, 0, 0);
      const imageData = canvas.toDataURL("image/png");

      frames.push({
        time: times[i],
        imageData,
        width: canvas.width,
        height: canvas.height,
      });

      setExtractionProgress(((i + 1) / times.length) * 100);
    }

    setExtractedFrames(frames);
    setSelectedFrameIndices(new Set(frames.map((_, i) => i)));
    setIsExtracting(false);
  }, [videoSrc, extractionMode, nthFrame, timeInterval, maxFrames]);

  // Toggle frame selection
  const toggleFrameSelection = useCallback((index: number) => {
    setSelectedFrameIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  // Select/Deselect all
  const selectAll = useCallback(() => {
    setSelectedFrameIndices(new Set(extractedFrames.map((_, i) => i)));
  }, [extractedFrames]);

  const deselectAll = useCallback(() => {
    setSelectedFrameIndices(new Set());
  }, []);

  // Import selected frames
  const handleImport = useCallback(() => {
    const selectedFrames = extractedFrames
      .filter((_, i) => selectedFrameIndices.has(i))
      .map((frame, idx) => ({
        points: [],
        name: `Frame ${startFrameId + idx}`,
        imageData: frame.imageData,
        offset: { x: 0, y: 0 },
      }));

    onImport(selectedFrames);
    handleClose();
  }, [extractedFrames, selectedFrameIndices, startFrameId, onImport]);

  // Close and cleanup
  const handleClose = useCallback(() => {
    if (videoSrc) {
      URL.revokeObjectURL(videoSrc);
    }
    setVideoSrc(null);
    setExtractedFrames([]);
    setSelectedFrameIndices(new Set());
    setExtractionProgress(0);
    onClose();
  }, [videoSrc, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-primary border border-border-default rounded-xl w-[800px] max-h-[85vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-lg font-semibold text-text-primary">{t.videoImport}</h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden flex flex-col min-h-0 p-4 gap-4">
          {/* Video Selection / Preview */}
          {!videoSrc ? (
            <label className="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed border-border-default rounded-xl cursor-pointer hover:border-accent-primary hover:bg-surface-secondary transition-colors">
              <VideoIcon />
              <span className="text-text-secondary">{t.selectVideo}</span>
              <input
                type="file"
                accept="video/*"
                onChange={handleVideoSelect}
                className="hidden"
              />
            </label>
          ) : (
            <div className="flex gap-4">
              {/* Video Preview */}
              <div className="flex-shrink-0">
                <div className="text-sm font-medium text-text-secondary mb-2">{t.videoPreview}</div>
                <video
                  ref={videoRef}
                  src={videoSrc}
                  onLoadedMetadata={handleVideoLoaded}
                  controls
                  className="w-64 h-auto rounded-lg bg-black"
                />
                <div className="text-xs text-text-tertiary mt-1">
                  {videoSize.width}×{videoSize.height} · {videoDuration.toFixed(1)}s
                </div>
              </div>

              {/* Extraction Settings */}
              <div className="flex-1">
                <div className="text-sm font-medium text-text-secondary mb-2">{t.extractionSettings}</div>
                <div className="space-y-3 bg-surface-secondary rounded-lg p-3">
                  {/* Mode Selection */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExtractionMode("interval")}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        extractionMode === "interval"
                          ? "bg-accent-primary text-white"
                          : "bg-surface-tertiary text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {t.timeInterval}
                    </button>
                    <button
                      onClick={() => setExtractionMode("nth")}
                      className={`flex-1 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                        extractionMode === "nth"
                          ? "bg-accent-primary text-white"
                          : "bg-surface-tertiary text-text-secondary hover:text-text-primary"
                      }`}
                    >
                      {t.everyNthFrame}
                    </button>
                  </div>

                  {/* Settings based on mode */}
                  {extractionMode === "interval" ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary">{t.timeInterval}:</span>
                      <input
                        type="number"
                        min={0.033}
                        max={5}
                        step={0.033}
                        value={timeInterval}
                        onChange={(e) => setTimeInterval(Math.max(0.033, parseFloat(e.target.value) || 0.1))}
                        className="w-20 px-2 py-1 bg-surface-primary border border-border-default rounded text-sm"
                      />
                      <span className="text-sm text-text-tertiary">{t.seconds}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-text-secondary">{t.everyNthFrame}:</span>
                      <input
                        type="number"
                        min={1}
                        max={60}
                        value={nthFrame}
                        onChange={(e) => setNthFrame(Math.max(1, parseInt(e.target.value) || 1))}
                        className="w-20 px-2 py-1 bg-surface-primary border border-border-default rounded text-sm"
                      />
                    </div>
                  )}

                  {/* Max frames */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-text-secondary">{t.maxFrames}:</span>
                    <input
                      type="number"
                      min={1}
                      max={500}
                      value={maxFrames}
                      onChange={(e) => setMaxFrames(Math.max(1, parseInt(e.target.value) || 100))}
                      className="w-20 px-2 py-1 bg-surface-primary border border-border-default rounded text-sm"
                    />
                  </div>

                  {/* Extract button */}
                  <button
                    onClick={extractFrames}
                    disabled={isExtracting}
                    className="w-full px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-surface-tertiary disabled:text-text-tertiary text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {isExtracting ? (
                      <>
                        <SpinnerIcon />
                        {t.extracting} {Math.round(extractionProgress)}%
                      </>
                    ) : (
                      t.extractFrames
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Extracted Frames Grid */}
          {extractedFrames.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-medium text-text-secondary">
                  {t.extractedFrames} ({extractedFrames.length})
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={selectAll}
                    className="px-2 py-1 text-xs bg-surface-secondary hover:bg-surface-tertiary rounded transition-colors"
                  >
                    {t.selectAll}
                  </button>
                  <button
                    onClick={deselectAll}
                    className="px-2 py-1 text-xs bg-surface-secondary hover:bg-surface-tertiary rounded transition-colors"
                  >
                    {t.deselectAll}
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto bg-surface-secondary rounded-lg p-2">
                <div className="grid grid-cols-8 gap-2">
                  {extractedFrames.map((frame, index) => (
                    <button
                      key={index}
                      onClick={() => toggleFrameSelection(index)}
                      className={`relative aspect-square rounded-lg overflow-hidden border-2 transition-colors ${
                        selectedFrameIndices.has(index)
                          ? "border-accent-primary"
                          : "border-transparent hover:border-border-default"
                      }`}
                    >
                      <img
                        src={frame.imageData}
                        alt={`Frame ${index + 1}`}
                        className="w-full h-full object-cover"
                      />
                      {selectedFrameIndices.has(index) && (
                        <div className="absolute top-1 right-1 w-4 h-4 bg-accent-primary rounded-full flex items-center justify-center">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                      )}
                      <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] px-1 py-0.5 text-center">
                        {frame.time.toFixed(2)}s
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Empty state */}
          {videoSrc && extractedFrames.length === 0 && !isExtracting && (
            <div className="flex-1 flex items-center justify-center text-text-tertiary">
              {t.noFramesExtracted}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border-default">
          <div className="text-sm text-text-secondary">
            {selectedFrameIndices.size} {t.framesSelected}
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-surface-secondary hover:bg-surface-tertiary text-text-primary rounded-lg text-sm transition-colors"
            >
              {t.cancel}
            </button>
            <button
              onClick={handleImport}
              disabled={selectedFrameIndices.size === 0}
              className="px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-surface-tertiary disabled:text-text-tertiary text-white rounded-lg text-sm font-medium transition-colors"
            >
              {t.importSelected}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
