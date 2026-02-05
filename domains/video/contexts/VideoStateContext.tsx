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
} from "../types";
import { PLAYBACK } from "../constants";

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
  selectedTrackId: string | null;

  // UI
  showAssetLibrary: boolean;
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

  // Tool actions
  setToolMode: (mode: VideoToolMode) => void;

  // Selection actions
  selectClip: (clipId: string, addToSelection?: boolean) => void;
  selectClips: (clipIds: string[]) => void;
  deselectAll: () => void;
  selectTrack: (trackId: string | null) => void;

  // UI actions
  setShowAssetLibrary: (show: boolean) => void;

  // Refs for high-frequency access
  currentTimeRef: React.RefObject<number>;
  isPlayingRef: React.RefObject<boolean>;
}

const VideoStateContext = createContext<VideoStateContextValue | null>(null);

const initialState: VideoState = {
  project: createVideoProject(),
  projectName: "Untitled Project",
  playback: INITIAL_PLAYBACK_STATE,
  toolMode: "select",
  selectedClipIds: [],
  selectedTrackId: null,
  showAssetLibrary: false,
};

export function VideoStateProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<VideoState>(initialState);

  // Refs for high-frequency access (playback loop)
  const currentTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const lastFrameTimeRef = useRef<number>(0);
  const animationFrameRef = useRef<number | null>(null);

  // Sync refs with state
  useEffect(() => {
    currentTimeRef.current = state.playback.currentTime;
  }, [state.playback.currentTime]);

  useEffect(() => {
    isPlayingRef.current = state.playback.isPlaying;
  }, [state.playback.isPlaying]);

  // Playback animation loop
  const updatePlayback = useCallback(() => {
    if (!isPlayingRef.current) return;

    const now = performance.now();
    const deltaMs = now - lastFrameTimeRef.current;
    lastFrameTimeRef.current = now;

    const deltaSeconds = (deltaMs / 1000) * state.playback.playbackRate;
    const newTime = currentTimeRef.current + deltaSeconds;

    // Check for end of project
    const projectDuration = state.project.duration || 10;
    if (newTime >= projectDuration) {
      if (state.playback.loop) {
        currentTimeRef.current = state.playback.loopStart;
      } else {
        currentTimeRef.current = projectDuration;
        isPlayingRef.current = false;
        setState((prev) => ({
          ...prev,
          playback: {
            ...prev.playback,
            isPlaying: false,
            currentTime: projectDuration,
          },
        }));
        return;
      }
    } else {
      currentTimeRef.current = newTime;
    }

    setState((prev) => ({
      ...prev,
      playback: {
        ...prev.playback,
        currentTime: currentTimeRef.current,
      },
    }));

    animationFrameRef.current = requestAnimationFrame(updatePlayback);
  }, [state.playback.playbackRate, state.playback.loop, state.playback.loopStart, state.project.duration]);

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
          duration: Math.max(maxEndTime, 10), // Minimum 10 seconds
        },
      };
    });
  }, []);

  // Playback actions
  const play = useCallback(() => {
    if (isPlayingRef.current) return;

    isPlayingRef.current = true;
    lastFrameTimeRef.current = performance.now();

    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, isPlaying: true },
    }));

    animationFrameRef.current = requestAnimationFrame(updatePlayback);
  }, [updatePlayback]);

  const pause = useCallback(() => {
    isPlayingRef.current = false;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, isPlaying: false },
    }));
  }, []);

  const stop = useCallback(() => {
    isPlayingRef.current = false;
    currentTimeRef.current = 0;

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, isPlaying: false, currentTime: 0 },
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
    const clampedTime = Math.max(0, Math.min(time, state.project.duration || 10));
    currentTimeRef.current = clampedTime;

    setState((prev) => ({
      ...prev,
      playback: { ...prev.playback, currentTime: clampedTime },
    }));
  }, [state.project.duration]);

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
    }));
  }, []);

  const selectClips = useCallback((clipIds: string[]) => {
    setState((prev) => ({ ...prev, selectedClipIds: clipIds }));
  }, []);

  const deselectAll = useCallback(() => {
    setState((prev) => ({
      ...prev,
      selectedClipIds: [],
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
    setToolMode,
    selectClip,
    selectClips,
    deselectAll,
    selectTrack,
    setShowAssetLibrary,
    currentTimeRef,
    isPlayingRef,
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
