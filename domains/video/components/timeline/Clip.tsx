"use client";

import { useEffect, useMemo, useState } from "react";
import { Clip as ClipType } from "../../types";
import { useVideoCoordinates } from "../../hooks";
import { useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import { VideoClipIcon, AudioClipIcon, ImageClipIcon } from "@/shared/components/icons";
import { UI } from "../../constants";
import { getClipPositionKeyframes } from "../../utils/clipTransformKeyframes";

interface ClipProps {
  clip: ClipType;
  /** Whether this clip is "lifted" for cross-track drag on touch */
  isLifted?: boolean;
}

const waveformCache = new Map<string, number[]>();
const waveformPending = new Map<string, Promise<number[]>>();

async function buildWaveform(sourceUrl: string, bins = 200): Promise<number[]> {
  const cached = waveformCache.get(sourceUrl);
  if (cached) return cached;

  const pending = waveformPending.get(sourceUrl);
  if (pending) return pending;

  const promise = (async () => {
    const response = await fetch(sourceUrl);
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContext();
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      const data = audioBuffer.getChannelData(0);
      const samplesPerBin = Math.max(1, Math.floor(data.length / bins));
      const values: number[] = [];

      for (let bin = 0; bin < bins; bin++) {
        const start = bin * samplesPerBin;
        const end = Math.min(data.length, start + samplesPerBin);
        if (end <= start) {
          values.push(0);
          continue;
        }

        let sum = 0;
        for (let i = start; i < end; i++) {
          const v = data[i];
          sum += v * v;
        }

        values.push(Math.sqrt(sum / (end - start)));
      }

      const peak = Math.max(...values, 0.001);
      const normalized = values.map((v) => Math.max(0.06, Math.min(1, v / peak)));
      waveformCache.set(sourceUrl, normalized);
      return normalized;
    } finally {
      await audioContext.close();
    }
  })();

  waveformPending.set(sourceUrl, promise);
  try {
    return await promise;
  } finally {
    waveformPending.delete(sourceUrl);
  }
}

export function Clip({ clip, isLifted }: ClipProps) {
  const { timeToPixel, durationToWidth } = useVideoCoordinates();
  const { selectedClipIds, playback } = useVideoState();
  const clipHasAudio =
    clip.type === "audio" || (clip.type === "video" && (clip.hasAudio ?? true));
  const clipSourceUrl = clip.type === "image" ? "" : clip.sourceUrl;
  const [waveform, setWaveform] = useState<number[] | null>(
    clip.type === "image" ? null : waveformCache.get(clip.sourceUrl) || null
  );

  const isSelected = selectedClipIds.includes(clip.id);
  const x = timeToPixel(clip.startTime);
  const width = durationToWidth(clip.duration);
  const positionKeyframes = useMemo(
    () => (clip.type === "audio" ? [] : getClipPositionKeyframes(clip)),
    [clip]
  );
  const currentLocalTime = playback.currentTime - clip.startTime;

  // Slice waveform to match trimIn/trimOut
  const visibleWaveform = useMemo(() => {
    if (!waveform || clip.type === "image") return null;
    const sourceDuration = clip.sourceDuration;
    if (!sourceDuration || sourceDuration <= 0) return waveform;
    const startRatio = clip.trimIn / sourceDuration;
    const endRatio = clip.trimOut / sourceDuration;
    const totalBins = waveform.length;
    const startBin = Math.floor(startRatio * totalBins);
    const endBin = Math.ceil(endRatio * totalBins);
    return waveform.slice(startBin, Math.max(startBin + 1, endBin));
  }, [waveform, clip]);

  // Don't render if clip would be invisible
  const minWidth = Math.max(width, UI.MIN_CLIP_WIDTH);

  const clipColor = useMemo(() => {
    if (clip.type === "video") {
      return "bg-clip-video";
    }
    if (clip.type === "audio") {
      return "bg-clip-audio";
    }
    return "bg-clip-image";
  }, [clip.type]);

  useEffect(() => {
    if (clip.type === "image" || !clipHasAudio) {
      setWaveform(null);
      return;
    }

    let cancelled = false;

    buildWaveform(clipSourceUrl)
      .then((values) => {
        if (!cancelled) setWaveform(values);
      })
      .catch(() => {
        if (!cancelled) setWaveform(null);
      });

    return () => {
      cancelled = true;
    };
  }, [clip.type, clipHasAudio, clipSourceUrl]);

  // Note: Click/drag events are handled by useTimelineInput in Timeline component

  return (
    <div
      className={cn(
        "absolute top-[2px] bottom-[2px] rounded cursor-pointer transition-[transform,box-shadow] duration-150",
        clipColor,
        isSelected && "ring-2 ring-clip-selection-ring ring-offset-1 ring-offset-transparent",
        !clip.visible && "opacity-50",
        isLifted && "scale-105 shadow-lg shadow-black/40 z-50 ring-2 ring-white/50"
      )}
      style={{
        left: x,
        width: minWidth,
      }}
    >
      {/* Clip name */}
      <div className="px-2 py-1 text-xs text-clip-text truncate">
        {clip.name}
      </div>

      {/* Waveform preview */}
      {clip.type !== "image" && clipHasAudio && visibleWaveform && (
        <div
          className={cn(
            "absolute left-1 right-1 h-4 flex items-end gap-[1px] opacity-70 pointer-events-none",
            positionKeyframes.length > 0 ? "bottom-4" : "bottom-1"
          )}
        >
          {visibleWaveform.map((value, idx) => (
            <div
              key={`${clip.id}-wave-${idx}`}
              className="bg-clip-waveform rounded-sm flex-1"
              style={{ height: `${Math.round(value * 100)}%` }}
            />
          ))}
        </div>
      )}

      {/* Position keyframe lane */}
      {clip.type !== "audio" && positionKeyframes.length > 0 && (
        <div className="absolute left-0 right-0 bottom-0 h-3 border-t border-black/25 bg-black/10 pointer-events-none">
          <div className="absolute left-1 right-1 top-[6px] h-px bg-white/20" />
          {positionKeyframes.map((keyframe) => {
            const ratio = clip.duration > 0 ? keyframe.time / clip.duration : 0;
            const leftPercent = Math.max(0, Math.min(100, ratio * 100));
            const isCurrent = Math.abs(keyframe.time - currentLocalTime) <= 0.02;
            return (
              <span
                key={`${clip.id}-pos-kf-${keyframe.id}`}
                className={cn(
                  "absolute top-[2px] w-2 h-2 -translate-x-1/2 rotate-45 border",
                  isCurrent
                    ? "bg-accent-primary border-accent-primary"
                    : "bg-white/85 border-black/30"
                )}
                style={{ left: `${leftPercent}%` }}
              />
            );
          })}
        </div>
      )}

      {/* Trim handles */}
      {isSelected && (
        <>
          {/* Left trim handle */}
          <div
            className="absolute left-0 top-0 bottom-0 w-1.5 bg-clip-trim-handle hover:bg-clip-trim-handle-hover cursor-ew-resize rounded-l"
          />
          {/* Right trim handle */}
          <div
            className="absolute right-0 top-0 bottom-0 w-1.5 bg-clip-trim-handle hover:bg-clip-trim-handle-hover cursor-ew-resize rounded-r"
          />
        </>
      )}

      {/* Type indicator */}
      <div className="absolute bottom-1 right-1">
        {clip.type === "video" ? (
          <VideoClipIcon className="w-3 h-3 text-clip-text-muted" />
        ) : clip.type === "audio" ? (
          <AudioClipIcon className="w-3 h-3 text-clip-text-muted" />
        ) : (
          <ImageClipIcon className="w-3 h-3 text-clip-text-muted" />
        )}
      </div>
    </div>
  );
}
