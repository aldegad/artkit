"use client";

import { useCallback, useRef } from "react";
import { Clip } from "../types";

type AudioEditableClip = Extract<Clip, { type: "video" | "audio" }>;

interface UseSelectedClipAudioActionsOptions {
  selectedAudioClip: AudioEditableClip | null;
  saveToHistory: () => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
}

interface UseSelectedClipAudioActionsResult {
  beginAudioAdjustment: () => void;
  endAudioAdjustment: () => void;
  handleToggleSelectedClipMute: () => void;
  handleSelectedClipVolumeChange: (volume: number) => void;
}

export function useSelectedClipAudioActions(
  options: UseSelectedClipAudioActionsOptions
): UseSelectedClipAudioActionsResult {
  const { selectedAudioClip, saveToHistory, updateClip } = options;
  const audioHistorySavedRef = useRef(false);

  const beginAudioAdjustment = useCallback(() => {
    if (audioHistorySavedRef.current) return;
    saveToHistory();
    audioHistorySavedRef.current = true;
  }, [saveToHistory]);

  const endAudioAdjustment = useCallback(() => {
    audioHistorySavedRef.current = false;
  }, []);

  const handleToggleSelectedClipMute = useCallback(() => {
    if (!selectedAudioClip) return;
    saveToHistory();
    updateClip(selectedAudioClip.id, {
      audioMuted: !(selectedAudioClip.audioMuted ?? false),
    });
  }, [selectedAudioClip, saveToHistory, updateClip]);

  const handleSelectedClipVolumeChange = useCallback((volume: number) => {
    if (!selectedAudioClip) return;
    updateClip(selectedAudioClip.id, {
      audioVolume: Math.max(0, Math.min(100, volume)),
    });
  }, [selectedAudioClip, updateClip]);

  return {
    beginAudioAdjustment,
    endAudioAdjustment,
    handleToggleSelectedClipMute,
    handleSelectedClipVolumeChange,
  };
}
