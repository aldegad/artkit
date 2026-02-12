"use client";

export interface ResolveTimelineClipSelectionOptions {
  clipId: string;
  selectedClipIds: string[];
  selectedMaskIds: string[];
  shiftKey: boolean;
}

export interface ResolvedTimelineClipSelection {
  activeClipIds: string[];
  activeMaskIds: string[];
  shouldSelectClip: boolean;
  selectAppend: boolean;
  shouldClearMaskSelection: boolean;
}

export function resolveTimelineClipSelection(
  options: ResolveTimelineClipSelectionOptions
): ResolvedTimelineClipSelection {
  const { clipId, selectedClipIds, selectedMaskIds, shiftKey } = options;
  const isAlreadySelected = selectedClipIds.includes(clipId);

  if (isAlreadySelected) {
    return {
      activeClipIds: selectedClipIds,
      activeMaskIds: selectedMaskIds,
      shouldSelectClip: false,
      selectAppend: false,
      shouldClearMaskSelection: false,
    };
  }

  if (shiftKey) {
    return {
      activeClipIds: [...selectedClipIds, clipId],
      activeMaskIds: selectedMaskIds,
      shouldSelectClip: true,
      selectAppend: true,
      shouldClearMaskSelection: false,
    };
  }

  return {
    activeClipIds: [clipId],
    activeMaskIds: [],
    shouldSelectClip: true,
    selectAppend: false,
    shouldClearMaskSelection: true,
  };
}
