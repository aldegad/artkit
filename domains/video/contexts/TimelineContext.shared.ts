"use client";

import { createContext, useContext } from "react";
import { Size } from "@/shared/types";
import {
  AssetReference,
  Clip,
  INITIAL_TIMELINE_VIEW,
  TimelineViewState,
  VideoTrack,
} from "../types";

export interface TimelineContextValue {
  viewState: TimelineViewState;
  setZoom: (zoom: number) => void;
  setScrollX: (scrollX: number) => void;
  setScrollY: (scrollY: number) => void;
  toggleSnap: () => void;
  setViewState: (viewState: TimelineViewState) => void;
  tracks: VideoTrack[];
  addTrack: (name?: string, type?: "video" | "audio") => string;
  duplicateTrack: (trackId: string) => string | null;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<VideoTrack>) => void;
  reorderTracks: (fromIndex: number, toIndex: number) => void;
  restoreTracks: (tracks: VideoTrack[]) => void;
  clips: Clip[];
  addVideoClip: (
    trackId: string,
    sourceUrl: string,
    sourceDuration: number,
    sourceSize: Size,
    startTime?: number,
    canvasSize?: Size,
    options?: { sourceId?: string; asset?: AssetReference }
  ) => string;
  addAudioClip: (
    trackId: string,
    sourceUrl: string,
    sourceDuration: number,
    startTime?: number,
    sourceSize?: Size,
    options?: { sourceId?: string; asset?: AssetReference }
  ) => string;
  addImageClip: (
    trackId: string,
    sourceUrl: string,
    sourceSize: Size,
    startTime?: number,
    duration?: number,
    canvasSize?: Size,
    options?: { sourceId?: string; asset?: AssetReference }
  ) => string;
  addCanvasOverlayClip: (
    trackId: string,
    sourceUrl: string,
    sourceSize: Size,
    startTime?: number,
    duration?: number,
    canvasSize?: Size,
    options?: { sourceId?: string; asset?: AssetReference }
  ) => string;
  removeClip: (clipId: string) => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  setClipPlaybackSpeed: (clipId: string, playbackSpeed: number) => void;
  moveClip: (clipId: string, trackId: string, startTime: number, ignoreClipIds?: string[]) => void;
  trimClipStart: (clipId: string, newStartTime: number) => void;
  trimClipEnd: (clipId: string, newEndTime: number) => void;
  splitClipAtTime: (clipId: string, splitCursorTime: number) => string | null;
  duplicateClip: (clipId: string, targetTrackId?: string) => string | null;
  addClips: (newClips: Clip[]) => void;
  restoreClips: (clips: Clip[]) => void;
  saveToHistory: () => void;
  undo: () => void;
  redo: () => void;
  clearHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  getClipsInTrack: (trackId: string) => Clip[];
  getTrackById: (trackId: string) => VideoTrack | null;
  isAutosaveInitialized: boolean;
}

export const TimelineContext = createContext<TimelineContextValue | null>(null);
export const TIMELINE_INITIAL_VIEW = INITIAL_TIMELINE_VIEW;
export const SOURCE_TRIM_EPSILON = 1e-6;

export function upsertAssetReference(
  existingAssets: AssetReference[],
  nextAsset: AssetReference | null | undefined
): AssetReference[] {
  if (!nextAsset) return existingAssets;
  const next = [...existingAssets];
  const index = next.findIndex((asset) => asset.id === nextAsset.id);
  if (index >= 0) {
    next[index] = { ...next[index], ...nextAsset };
    return next;
  }
  next.push(nextAsset);
  return next;
}

export function useTimeline() {
  const context = useContext(TimelineContext);
  if (!context) {
    throw new Error("useTimeline must be used within TimelineProvider");
  }
  return context;
}
