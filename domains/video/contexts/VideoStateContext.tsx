"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
  ReactNode,
  useEffect,
} from "react";
import {
  VideoProject,
  VideoToolMode,
  PlaybackState,
  INITIAL_PLAYBACK_STATE,
  createVideoProject,
  ClipboardData,
} from "../types";
import { PLAYBACK } from "../constants";
import { playbackTick } from "../utils/playbackTick";
import type { AspectRatio } from "@/shared/types/aspectRatio";

interface VideoState {
  // Project
  project: VideoProject;
  projectName: string;

  // Playback
  playback: PlaybackState;

  // Tool
  toolMode: VideoToolMode;

  // Selection
  selectedClipIds: string[];
  selectedMaskIds: string[];
  selectedTrackId: string | null;

  // UI
  showAssetLibrary: boolean;

  // Crop
  cropArea: { x: number; y: number; width: number; height: number } | null;
  canvasExpandMode: boolean;
  cropAspectRatio: AspectRatio;
  lockCropAspect: boolean;
}

interface VideoStateContextValue extends VideoState {
  // Project actions
  setProject: (project: VideoProject) => void;
  setProjectName: (name: string) => void;
  updateProjectDuration: () => void;

  // Playback actions
  play: () => void;
  pause: () => void;
  stop: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  stepForward: () => void;
  stepBackward: () => void;
  setPlaybackRate: (rate: number) => void;
  toggleLoop: () => void;
  setLoopRange: (start: number, end: number, enableLoop?: boolean) => void;
  clearLoopRange: () => void;

  // Tool actions
  setToolMode: (mode: VideoToolMode) => void;

  // Selection actions
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  selectMaskForTimeline: (maskId: string, addToSelection?: boolean) => void;
  selectMasksForTimeline: (maskIds: string[]) => void;
  deselectAll: () => void;
  selectTrack: (trackId: string | null) => void;

  // UI actions
  setShowAssetLibrary: (show: boolean) => void;

  // Crop actions
  setCropArea: (area: { x: number; y: number; width: number; height: number } | null) => void;
  setCanvasExpandMode: (enabled: boolean) => void;
  setCropAspectRatio: (ratio: AspectRatio) => void;
  setLockCropAspect: (locked: boolean) => void;

  // Refs for high-frequency access
  currentTimeRef: React.RefObject<number>;
  isPlayingRef: React.RefObject<boolean>;

  // Clipboard
  clipboardRef: React.RefObject<ClipboardData | null>;
  hasClipboard: boolean;
  setHasClipboard: (has: boolean) => void;
}

const VideoStateContext = createContext<VideoStateContextValue | null>(null);

const initialState: VideoState = {
  project: createVideoProject(),
  projectName: "Untitled Project",
  playback: INITIAL_PLAYBACK_STATE,
  toolMode: "select",
  selectedClipIds: [],
  selectedMaskIds: [],
  selectedTrackId: null,
  showAssetLibrary: false,
  cropArea: null,
  canvasExpandMode: false,
  cropAspectRatio: "free" as AspectRatio,
  lockCropAspect: false,
};

export function VideoStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VideoState>(initialState);

  // Refs for high-frequency access (playback loop)
  const currentTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);

  // Clipboard
  const clipboardRef = useRef<ClipboardData | null>(null);
  const [hasClipboard, setHasClipboard] = useState(false);
  const lastFrameTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Sync isPlayingRef with state
  useEffect(() => {
    isPlayingRef.current = state.playback.isPlaying;
  }, [state.playback.isPlaying]);

  // Playback-rate and loop refs to avoid recreating the RAF callback
  const playbackRateRef = useRef(state.playback.playbackRate);
  const loopRef = useRef(state.playback.loop);
  const loopStartRef = useRef(state.playback.loopStart);
  const loopEndRef = useRef(state.playback.loopEnd);
  const projectDurationRef = useRef(state.project.duration || 10);

  useEffect(() => { playbackRateRef.current = state.playback.playbackRate; }, [state.playback.playbackRate]);
  useEffect(() => { loopRef.current = state.playback.loop; }, [state.playback.loop]);
  useEffect(() => { loopStartRef.current = state.playback.loopStart; }, [state.playback.loopStart]);
  useEffect(() => { loopEndRef.current = state.playback.loopEnd; }, [state.playback.loopEnd]);
  useEffect(() => { projectDurationRef.current = state.project.duration || 10; }, [state.project.duration]);

  // Playback animation loop — emits tick events instead of setState every frame
  const updatePlayback = useCallback(() => {
    if (!isPlayingRef.current) return;

    const now = performance.now();
    const deltaMs = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    const deltaSeconds = (deltaMs / 1000) * playbackRateRef.current;
    const newTime = currentTimeRef.current + deltaSeconds;

    const duration = projectDurationRef.current;
    const rangeStart = Math.max(0, Math.min(loopStartRef.current, duration));
    const hasRange = loopEndRef.current > rangeStart + 0.001;
    const rangeEnd = hasRange
      ? Math.max(rangeStart + 0.001, Math.min(loopEndRef.current, duration))
      : duration;

    if (loopRef.current) {
      if (newTime >= rangeEnd) {
        currentTimeRef.current = rangeStart;
      } else if (newTime < rangeStart) {
        currentTimeRef.current = rangeStart;
      } else {
        currentTimeRef.current = newTime;
      }
    } else {
      if (newTime >= duration) {
        currentTimeRef.current = duration;
        isPlayingRef.current = false;
        // Sync final time to React state when playback ends
        setState((prev) => ({
          ...prev,
          playback: {
            ...prev.playback,
            isPlaying: false,
            currentTime: duration,
          },
        }));
        playbackTick.emit(duration);
        return;
      }
      currentTimeRef.current = newTime;
    }

    // Emit tick to subscribers (canvas, playhead, ruler) — no React re-render
    playbackTick.emit(currentTimeRef.current);

    animationFrameRef.current = requestAnimationFrame(updatePlayback);
  }, []); // Stable callback — reads all values from refs

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Project actions
  const setProject = useCallback((project: VideoProject) => {
    setState((prev) => ({ ...prev, project }));
  }, []);

  const setProjectName = useCallback((name: string) => {
    setState((prev) => ({
      ...prev,
      projectName: name,
      project: { ...prev.project, name },
    }));
  }, []);

  const updateProjectDuration = useCallback(() => {
    setState((prev) => {
      const maxEndTime = prev.project.clips.reduce((max, clip) => {
        return Math.max(max, clip.startTime + clip.duration);
      }, 0);
      return {
        ...prev,
        project: {
          ...prev.project,
          duration: Math.max(maxEndTime, 1), // Minimum 1 second
        },
      };
    });
  }, []);

  // Playback actions
  const play = useCallback(() => {
    if (isPlayingRef.current) return;

    const duration = projectDurationRef.current;
    const rangeStart = Math.max(0, Math.min(loopStartRef.current, duration));
    const hasRange = loopEndRef.current > rangeStart + 0.001;
    const rangeEnd = hasRange
      ? Math.max(rangeStart + 0.001, Math.min(loopEndRef.current, duration))
      : duration;

    // If loop is enabled, keep playback time inside loop range.
    if (loopRef.current) {
      if (currentTimeRef.current < rangeStart || currentTimeRef.current >= rangeEnd) {
        currentTimeRef.current = rangeStart;
      }
    } else if (currentTimeRef.current >= duration) {
      // If at the end, restart from beginning
      currentTimeRef.current = 0;
    }

    isPlayingRef.current = true;
    lastFrameTimeRef.current = performance.now();

    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, isPlaying: true, currentTime: currentTimeRef.current },
    }));

    animationFrameRef.current = requestAnimationFrame(updatePlayback);
  }, [updatePlayback]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    // Sync final time back to React state
    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, isPlaying: false, currentTime: currentTimeRef.current },
    }));
  }, []);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    const duration = projectDurationRef.current;
    const rangeStart = Math.max(0, Math.min(loopStartRef.current, duration));
    currentTimeRef.current = loopRef.current ? rangeStart : 0;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, isPlaying: false, currentTime: currentTimeRef.current },
    }));
  }, []);

  const togglePlay = useCallback(() => {
    if (isPlayingRef.current) {
      pause();
    } else {
      play();
    }
  }, [play, pause]);

  const seek = useCallback((time: number) => {
    const duration = projectDurationRef.current;
    let clampedTime = Math.max(0, Math.min(time, duration));

    if (loopRef.current) {
      const rangeStart = Math.max(0, Math.min(loopStartRef.current, duration));
      const hasRange = loopEndRef.current > rangeStart + 0.001;
      const rangeEnd = hasRange
        ? Math.max(rangeStart + 0.001, Math.min(loopEndRef.current, duration))
        : duration;
      clampedTime = Math.max(rangeStart, Math.min(clampedTime, rangeEnd));
    }

    currentTimeRef.current = clampedTime;

    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, currentTime: clampedTime },
    }));
    playbackTick.emit(clampedTime);
  }, []);

  const stepForward = useCallback(() => {
    seek(currentTimeRef.current + PLAYBACK.FRAME_STEP);
  }, [seek]);

  const stepBackward = useCallback(() => {
    seek(currentTimeRef.current - PLAYBACK.FRAME_STEP);
  }, [seek]);

  const setPlaybackRate = useCallback((rate: number) => {
    const clampedRate = Math.max(PLAYBACK.MIN_RATE, Math.min(PLAYBACK.MAX_RATE, rate));
    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, playbackRate: clampedRate },
    }));
  }, []);

  const toggleLoop = useCallback(() => {
    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, loop: !prev.playback.loop },
    }));
  }, []);

  const setLoopRange = useCallback((start: number, end: number, enableLoop: boolean = true) => {
    const duration = projectDurationRef.current;
    const clampedStart = Math.max(0, Math.min(start, duration));
    const clampedEnd = Math.max(0, Math.min(end, duration));
    const normalizedStart = Math.min(clampedStart, clampedEnd);
    const normalizedEnd = Math.max(normalizedStart + 0.001, clampedEnd);
    const current = Math.max(normalizedStart, Math.min(currentTimeRef.current, normalizedEnd));
    currentTimeRef.current = current;

    setState((prev) => ({
      ...prev,
      playback: {
        ...prev.playback,
        loopStart: normalizedStart,
        loopEnd: normalizedEnd,
        loop: enableLoop ? true : prev.playback.loop,
        currentTime: current,
      },
    }));
    playbackTick.emit(current);
  }, []);

  const clearLoopRange = useCallback(() => {
    const duration = projectDurationRef.current;
    const current = Math.max(0, Math.min(currentTimeRef.current, duration));
    currentTimeRef.current = current;

    setState((prev) => ({
      ...prev,
      playback: {
        ...prev.playback,
        loop: false,
        loopStart: 0,
        loopEnd: duration,
        currentTime: current,
      },
    }));
    playbackTick.emit(current);
  }, []);

  // Tool actions
  const setToolMode = useCallback((mode: VideoToolMode) => {
    setState((prev) => ({ ...prev, toolMode: mode }));
  }, []);

  // Selection actions
  const selectClip = useCallback((clipId: string, addToSelection: boolean = false) => {
    setState((prev) => ({
      ...prev,
      selectedClipIds: addToSelection
        ? [...prev.selectedClipIds, clipId]
        : [clipId],
      selectedMaskIds: addToSelection ? prev.selectedMaskIds : [],
    }));
  }, []);

  const selectClips = useCallback((clipIds: string[]) => {
    setState((prev) => ({ ...prev, selectedClipIds: clipIds }));
  }, []);

  const selectMaskForTimeline = useCallback((maskId: string, addToSelection: boolean = false) => {
    setState((prev) => ({
      ...prev,
      selectedMaskIds: addToSelection
        ? [...prev.selectedMaskIds, maskId]
        : [maskId],
      selectedClipIds: addToSelection ? prev.selectedClipIds : [],
    }));
  }, []);

  const selectMasksForTimeline = useCallback((maskIds: string[]) => {
    setState((prev) => ({ ...prev, selectedMaskIds: maskIds }));
  }, []);

  const deselectAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedClipIds: [],
      selectedMaskIds: [],
      selectedTrackId: null,
    }));
  }, []);

  const selectTrack = useCallback((trackId: string | null) => {
    setState((prev) => ({ ...prev, selectedTrackId: trackId }));
  }, []);

  // UI actions
  const setShowAssetLibrary = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showAssetLibrary: show }));
  }, []);

  const setCropArea = useCallback((area: { x: number; y: number; width: number; height: number } | null) => {
    setState((prev) => ({ ...prev, cropArea: area }));
  }, []);

  const setCanvasExpandMode = useCallback((enabled: boolean) => {
    setState((prev) => ({ ...prev, canvasExpandMode: enabled }));
  }, []);

  const setCropAspectRatio = useCallback((ratio: AspectRatio) => {
    setState((prev) => ({ ...prev, cropAspectRatio: ratio }));
  }, []);

  const setLockCropAspect = useCallback((locked: boolean) => {
    setState((prev) => ({ ...prev, lockCropAspect: locked }));
  }, []);

  const value: VideoStateContextValue = {
    ...state,
    setProject,
    setProjectName,
    updateProjectDuration,
    play,
    pause,
    stop,
    togglePlay,
    seek,
    stepForward,
    stepBackward,
    setPlaybackRate,
    toggleLoop,
    setLoopRange,
    clearLoopRange,
    setToolMode,
    selectClip,
    selectClips,
    selectMaskForTimeline,
    selectMasksForTimeline,
    deselectAll,
    selectTrack,
    setShowAssetLibrary,
    setCropArea,
    setCanvasExpandMode,
    setCropAspectRatio,
    setLockCropAspect,
    currentTimeRef,
    isPlayingRef,
    clipboardRef,
    hasClipboard,
    setHasClipboard,
  };

  return (
    <VideoStateContext.Provider value={value}>
      {children}
    </VideoStateContext.Provider>
  );
}

export function useVideoState() {
  const context = useContext(VideoStateContext);
  if (!context) {
    throw new Error("useVideoState must be used within VideoStateProvider");
  }
  return context;
}
