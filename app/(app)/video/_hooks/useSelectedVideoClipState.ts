"use client";

import { useEffect, useMemo } from "react";
import type { Clip } from "@/domains/video";
import { getClipPositionKeyframes } from "@/domains/video/utils/clipTransformKeyframes";

type PositionKeyframeSelection = { clipId: string; keyframeId: string; trackId?: string } | null;

function findValidPositionKeyframeClip(
  clips: Clip[],
  selection: PositionKeyframeSelection
): Clip | null {
  if (!selection) return null;
  const clip = clips.find((candidate) => candidate.id === selection.clipId);
  if (!clip || clip.type === "audio") return null;

  const hasKeyframe = getClipPositionKeyframes(clip).some(
    (keyframe) => keyframe.id === selection.keyframeId
  );
  return hasKeyframe ? clip : null;
}

interface UseSelectedVideoClipStateOptions {
  clips: Clip[];
  selectedClipIds: string[];
  selectedPositionKeyframe: PositionKeyframeSelection;
  setSelectedPositionKeyframe: (selection: null) => void;
}

export function useSelectedVideoClipState(options: UseSelectedVideoClipStateOptions) {
  const {
    clips,
    selectedClipIds,
    selectedPositionKeyframe,
    setSelectedPositionKeyframe,
  } = options;

  const selectedClip = selectedClipIds.length > 0
    ? clips.find((clip) => clip.id === selectedClipIds[0]) || null
    : null;
  const selectedAudioClip = selectedClip && selectedClip.type !== "image" ? selectedClip : null;
  const selectedVisualClip = selectedClip && selectedClip.type !== "audio" ? selectedClip : null;
  const selectedPositionKeyframeClip = useMemo(
    () => findValidPositionKeyframeClip(clips, selectedPositionKeyframe),
    [clips, selectedPositionKeyframe]
  );

  useEffect(() => {
    if (selectedPositionKeyframe && !selectedPositionKeyframeClip) {
      setSelectedPositionKeyframe(null);
    }
  }, [selectedPositionKeyframe, selectedPositionKeyframeClip, setSelectedPositionKeyframe]);

  return {
    selectedClip,
    selectedAudioClip,
    selectedVisualClip,
    selectedPositionKeyframeClip,
  };
}
