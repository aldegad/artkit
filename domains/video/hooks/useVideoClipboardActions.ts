"use client";

import { useCallback, type RefObject } from "react";
import { ClipboardData, Clip, MaskData, VideoTrack } from "../types";
import { copyMediaBlob } from "../utils/mediaStorage";
import { normalizeClipTransformKeyframes } from "../utils/clipTransformKeyframes";

interface UseVideoClipboardActionsOptions {
  selectedClipIds: string[];
  selectedMaskIds: string[];
  clips: Clip[];
  masksMap: Map<string, MaskData>;
  tracks: VideoTrack[];
  playbackCurrentTime: number;
  clipboardRef: RefObject<ClipboardData | null>;
  setHasClipboard: (hasClipboard: boolean) => void;
  saveToHistory: () => void;
  removeClip: (clipId: string) => void;
  deselectAll: () => void;
  addClips: (newClips: Clip[]) => void;
  addMasks: (newMasks: MaskData[]) => string[];
  selectClips: (clipIds: string[]) => void;
  selectMasksForTimeline: (maskIds: string[]) => void;
  duplicateMask: (maskId: string) => string | null;
  updateMaskTime: (maskId: string, startTime: number, duration: number) => void;
  deleteMask: (maskId: string) => void;
  activeMaskId: string | null;
  isEditingMask: boolean;
  endMaskEdit: () => void;
}

interface UseVideoClipboardActionsReturn {
  handleCopy: () => void;
  handleCut: () => void;
  handlePaste: () => void;
  handleDelete: () => void;
  handleDuplicate: () => void;
}

function cloneClip(clip: Clip): Clip {
  return {
    ...clip,
    position: { ...clip.position },
    sourceSize: { ...clip.sourceSize },
    transformKeyframes: normalizeClipTransformKeyframes(clip),
  };
}

function cloneMask(mask: MaskData): MaskData {
  return {
    ...mask,
    size: { ...mask.size },
  };
}

export function useVideoClipboardActions(
  options: UseVideoClipboardActionsOptions
): UseVideoClipboardActionsReturn {
  const {
    selectedClipIds,
    selectedMaskIds,
    clips,
    masksMap,
    tracks,
    playbackCurrentTime,
    clipboardRef,
    setHasClipboard,
    saveToHistory,
    removeClip,
    deselectAll,
    addClips,
    addMasks,
    selectClips,
    selectMasksForTimeline,
    duplicateMask,
    updateMaskTime,
    deleteMask,
    activeMaskId,
    isEditingMask,
    endMaskEdit,
  } = options;

  const handleCopy = useCallback(() => {
    const selectedClips = clips.filter((clip) => selectedClipIds.includes(clip.id));
    const selectedMasks = selectedMaskIds
      .map((maskId) => masksMap.get(maskId))
      .filter((mask): mask is MaskData => !!mask);
    if (selectedClips.length === 0 && selectedMasks.length === 0) return;

    clipboardRef.current = {
      clips: selectedClips.map(cloneClip),
      masks: selectedMasks.map(cloneMask),
      mode: "copy",
      sourceTime: playbackCurrentTime,
    };
    setHasClipboard(true);
  }, [clips, selectedClipIds, selectedMaskIds, masksMap, clipboardRef, playbackCurrentTime, setHasClipboard]);

  const handleCut = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    const selectedClips = clips.filter((clip) => selectedClipIds.includes(clip.id));
    if (selectedClips.length === 0) return;

    clipboardRef.current = {
      clips: selectedClips.map(cloneClip),
      mode: "cut",
      sourceTime: playbackCurrentTime,
    };
    setHasClipboard(true);

    saveToHistory();
    selectedClipIds.forEach((id) => removeClip(id));
    deselectAll();
  }, [selectedClipIds, clips, clipboardRef, playbackCurrentTime, setHasClipboard, saveToHistory, removeClip, deselectAll]);

  const handlePaste = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard) return;

    const clipboardMasks = clipboard.masks || [];
    const hasClipClipboard = clipboard.clips.length > 0;
    const hasMaskClipboard = clipboardMasks.length > 0;
    if (!hasClipClipboard && !hasMaskClipboard) return;

    saveToHistory();

    const currentTime = playbackCurrentTime;
    const earliestClipStart = hasClipClipboard
      ? Math.min(...clipboard.clips.map((clip) => clip.startTime))
      : Number.POSITIVE_INFINITY;
    const earliestMaskStart = hasMaskClipboard
      ? Math.min(...clipboardMasks.map((mask) => mask.startTime))
      : Number.POSITIVE_INFINITY;
    const earliestStart = Math.min(earliestClipStart, earliestMaskStart);
    const timeOffset = currentTime - earliestStart;
    const duplicatedClipIds: string[] = [];
    const duplicatedMaskIds: string[] = [];

    if (hasClipClipboard) {
      const newClips = clipboard.clips.map((clipData) => ({
        ...cloneClip(clipData),
        id: crypto.randomUUID(),
        startTime: Math.max(0, clipData.startTime + timeOffset),
      }));

      void Promise.all(
        newClips.map((newClip, index) =>
          copyMediaBlob(clipboard.clips[index].id, newClip.id).catch((error) => {
            console.error("Failed to copy media blob on paste:", error);
          })
        )
      );

      addClips(newClips);
      duplicatedClipIds.push(...newClips.map((clip) => clip.id));
    }

    if (hasMaskClipboard) {
      const trackIds = new Set(tracks.map((track) => track.id));
      const fallbackTrackId = tracks.find((track) => track.type !== "audio")?.id || tracks[0]?.id || null;

      const newMasks = clipboardMasks
        .map((sourceMask) => {
          const targetTrackId = trackIds.has(sourceMask.trackId) ? sourceMask.trackId : fallbackTrackId;
          if (!targetTrackId) return null;
          return {
            ...cloneMask(sourceMask),
            id: crypto.randomUUID(),
            trackId: targetTrackId,
            startTime: Math.max(0, sourceMask.startTime + timeOffset),
          };
        })
        .filter((mask): mask is MaskData => !!mask);

      if (newMasks.length > 0) {
        addMasks(newMasks);
        duplicatedMaskIds.push(...newMasks.map((mask) => mask.id));
      }
    }

    if (duplicatedClipIds.length > 0) {
      selectClips(duplicatedClipIds);
    }
    if (duplicatedMaskIds.length > 0) {
      selectMasksForTimeline(duplicatedMaskIds);
    }

    if (clipboard.mode === "cut") {
      clipboardRef.current = null;
      setHasClipboard(false);
    }
  }, [
    addClips,
    addMasks,
    clipboardRef,
    playbackCurrentTime,
    saveToHistory,
    selectClips,
    selectMasksForTimeline,
    setHasClipboard,
    tracks,
  ]);

  const handleDelete = useCallback(() => {
    if (activeMaskId && isEditingMask) {
      endMaskEdit();
      deleteMask(activeMaskId);
      return;
    }

    const hasClips = selectedClipIds.length > 0;
    const hasMasks = selectedMaskIds.length > 0;

    if (!hasClips && !hasMasks) {
      if (activeMaskId) {
        deleteMask(activeMaskId);
      }
      return;
    }

    saveToHistory();
    selectedClipIds.forEach((id) => removeClip(id));
    selectedMaskIds.forEach((id) => deleteMask(id));
    deselectAll();
  }, [
    activeMaskId,
    deleteMask,
    deselectAll,
    endMaskEdit,
    isEditingMask,
    removeClip,
    saveToHistory,
    selectedClipIds,
    selectedMaskIds,
  ]);

  const handleDuplicate = useCallback(() => {
    const hasClips = selectedClipIds.length > 0;
    const hasMasks = selectedMaskIds.length > 0;
    if (!hasClips && !hasMasks) return;

    saveToHistory();

    const duplicatedClipIds: string[] = [];
    const duplicatedMaskIds: string[] = [];

    if (hasClips) {
      const selectedClips = clips.filter((clip) => selectedClipIds.includes(clip.id));
      const duplicated = selectedClips.map((clip) => ({
        ...cloneClip(clip),
        id: crypto.randomUUID(),
        startTime: clip.startTime + 0.25,
        name: `${clip.name} (Copy)`,
      }));
      void Promise.all(
        duplicated.map((dupClip, index) =>
          copyMediaBlob(selectedClips[index].id, dupClip.id).catch((error) => {
            console.error("Failed to copy media blob on duplicate:", error);
          })
        )
      );
      addClips(duplicated);
      duplicatedClipIds.push(...duplicated.map((clip) => clip.id));
    }

    for (const maskId of selectedMaskIds) {
      const newId = duplicateMask(maskId);
      if (newId) {
        const source = masksMap.get(maskId);
        if (source) {
          updateMaskTime(newId, source.startTime + 0.25, source.duration);
        }
        duplicatedMaskIds.push(newId);
      }
    }

    if (duplicatedClipIds.length > 0) selectClips(duplicatedClipIds);
    if (duplicatedMaskIds.length > 0) selectMasksForTimeline(duplicatedMaskIds);
  }, [
    addClips,
    clips,
    duplicateMask,
    masksMap,
    saveToHistory,
    selectClips,
    selectMasksForTimeline,
    selectedClipIds,
    selectedMaskIds,
    updateMaskTime,
  ]);

  return {
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleDuplicate,
  };
}
