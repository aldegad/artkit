"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createBlankCanvasOverlayDataUrl,
  type Clip,
  type ImageClip,
  type VideoTrack,
} from "@/domains/video";
import type { Size } from "@/shared/types";

interface UseCanvasOverlayOptions {
  clips: Clip[];
  tracks: VideoTrack[];
  selectedVisualClip: Clip | null;
  projectCanvasSize: Size;
  playbackCurrentTime: number;
  addTrack: (name?: string, type?: "video" | "audio") => string;
  addCanvasOverlayClip: (
    trackId: string,
    sourceUrl: string,
    sourceSize: Size,
    startTime?: number,
    duration?: number,
    canvasSize?: Size,
  ) => string;
  saveToHistory: () => void;
  selectClips: (clipIds: string[]) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
}

export function useCanvasOverlay(options: UseCanvasOverlayOptions) {
  const {
    clips,
    tracks,
    selectedVisualClip,
    projectCanvasSize,
    playbackCurrentTime,
    addTrack,
    addCanvasOverlayClip,
    saveToHistory,
    selectClips,
    updateClip,
  } = options;
  const [editingCanvasOverlayClipId, setEditingCanvasOverlayClipId] = useState<string | null>(null);

  const selectedCanvasOverlayClip = selectedVisualClip?.type === "image" && selectedVisualClip.isCanvasOverlay
    ? selectedVisualClip
    : null;
  const editingCanvasOverlayClip = useMemo<ImageClip | null>(() => {
    if (!editingCanvasOverlayClipId) return null;
    const clip = clips.find((candidate) => candidate.id === editingCanvasOverlayClipId) || null;
    return clip?.type === "image" && clip.isCanvasOverlay ? clip : null;
  }, [clips, editingCanvasOverlayClipId]);

  useEffect(() => {
    if (editingCanvasOverlayClipId && !editingCanvasOverlayClip) {
      setEditingCanvasOverlayClipId(null);
    }
  }, [editingCanvasOverlayClip, editingCanvasOverlayClipId]);

  const resolveCanvasOverlayTrackId = useCallback(() => {
    if (selectedVisualClip) {
      return selectedVisualClip.trackId;
    }

    const firstVideoTrack = tracks.find((track) => track.type === "video");
    if (firstVideoTrack) {
      return firstVideoTrack.id;
    }

    return addTrack(undefined, "video");
  }, [addTrack, selectedVisualClip, tracks]);

  const handleCreateCanvasOverlay = useCallback(() => {
    const sourceUrl = createBlankCanvasOverlayDataUrl(projectCanvasSize);
    const trackId = resolveCanvasOverlayTrackId();
    saveToHistory();
    const clipId = addCanvasOverlayClip(
      trackId,
      sourceUrl,
      projectCanvasSize,
      playbackCurrentTime,
      5,
      projectCanvasSize,
    );
    selectClips([clipId]);
    setEditingCanvasOverlayClipId(clipId);
  }, [
    addCanvasOverlayClip,
    playbackCurrentTime,
    projectCanvasSize,
    resolveCanvasOverlayTrackId,
    saveToHistory,
    selectClips,
  ]);

  const handleEditCanvasOverlay = useCallback(() => {
    if (!selectedCanvasOverlayClip) return;
    setEditingCanvasOverlayClipId(selectedCanvasOverlayClip.id);
  }, [selectedCanvasOverlayClip]);

  const handleCloseCanvasOverlayModal = useCallback(() => {
    setEditingCanvasOverlayClipId(null);
  }, []);

  const handleSaveCanvasOverlay = useCallback((dataUrl: string) => {
    if (!editingCanvasOverlayClipId) return;
    saveToHistory();
    updateClip(editingCanvasOverlayClipId, {
      sourceUrl: dataUrl,
      imageData: dataUrl,
    });
    setEditingCanvasOverlayClipId(null);
  }, [editingCanvasOverlayClipId, saveToHistory, updateClip]);

  return {
    selectedCanvasOverlayClip,
    editingCanvasOverlayClip,
    handleCreateCanvasOverlay,
    handleEditCanvasOverlay,
    handleCloseCanvasOverlayModal,
    handleSaveCanvasOverlay,
  };
}
