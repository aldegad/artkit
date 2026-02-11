"use client";

import { useCallback, useRef, useState } from "react";

interface TimelineHistorySnapshot<TTrack, TClip> {
  tracks: TTrack[];
  clips: TClip[];
}

interface UseTimelineHistoryOptions<TTrack, TClip> {
  tracksRef: React.MutableRefObject<TTrack[]>;
  clipsRef: React.MutableRefObject<TClip[]>;
  setTracks: (action: React.SetStateAction<TTrack[]>) => void;
  setClips: (action: React.SetStateAction<TClip[]>) => void;
  cloneTrack: (track: TTrack) => TTrack;
  cloneClip: (clip: TClip) => TClip;
  maxHistory?: number;
}

interface UseTimelineHistoryResult {
  canUndo: boolean;
  canRedo: boolean;
  saveToHistory: () => void;
  clearHistory: () => void;
  undo: () => void;
  redo: () => void;
}

export function useTimelineHistory<TTrack, TClip>(
  options: UseTimelineHistoryOptions<TTrack, TClip>
): UseTimelineHistoryResult {
  const {
    tracksRef,
    clipsRef,
    setTracks,
    setClips,
    cloneTrack,
    cloneClip,
    maxHistory = 100,
  } = options;

  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const historyPastRef = useRef<Array<TimelineHistorySnapshot<TTrack, TClip>>>([]);
  const historyFutureRef = useRef<Array<TimelineHistorySnapshot<TTrack, TClip>>>([]);

  const syncHistoryFlags = useCallback(() => {
    setCanUndo(historyPastRef.current.length > 0);
    setCanRedo(historyFutureRef.current.length > 0);
  }, []);

  const captureHistorySnapshot = useCallback((): TimelineHistorySnapshot<TTrack, TClip> => {
    return {
      tracks: tracksRef.current.map(cloneTrack),
      clips: clipsRef.current.map(cloneClip),
    };
  }, [tracksRef, clipsRef, cloneTrack, cloneClip]);

  const saveToHistory = useCallback(() => {
    historyPastRef.current.push(captureHistorySnapshot());
    if (historyPastRef.current.length > maxHistory) {
      historyPastRef.current.shift();
    }
    historyFutureRef.current = [];
    syncHistoryFlags();
  }, [captureHistorySnapshot, maxHistory, syncHistoryFlags]);

  const clearHistory = useCallback(() => {
    historyPastRef.current = [];
    historyFutureRef.current = [];
    syncHistoryFlags();
  }, [syncHistoryFlags]);

  const undo = useCallback(() => {
    const previous = historyPastRef.current.pop();
    if (!previous) return;

    historyFutureRef.current.push(captureHistorySnapshot());
    setTracks(previous.tracks.map(cloneTrack));
    setClips(previous.clips.map(cloneClip));
    syncHistoryFlags();
  }, [captureHistorySnapshot, setTracks, setClips, cloneTrack, cloneClip, syncHistoryFlags]);

  const redo = useCallback(() => {
    const next = historyFutureRef.current.pop();
    if (!next) return;

    historyPastRef.current.push(captureHistorySnapshot());
    setTracks(next.tracks.map(cloneTrack));
    setClips(next.clips.map(cloneClip));
    syncHistoryFlags();
  }, [captureHistorySnapshot, setTracks, setClips, cloneTrack, cloneClip, syncHistoryFlags]);

  return {
    canUndo,
    canRedo,
    saveToHistory,
    clearHistory,
    undo,
    redo,
  };
}
