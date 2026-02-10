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
import { SoundEditorState, AudioRegion, SoundToolMode } from "../types";
import { audioBufferToMp3 } from "../utils/mp3Encoder";

interface SoundEditorContextValue extends SoundEditorState {
  // Actions
  loadAudio: (file: File) => Promise<void>;
  play: () => void;
  pause: () => void;
  stop: () => void;
  seek: (time: number) => void;
  setTrimRegion: (region: AudioRegion | null) => void;
  setZoom: (zoom: number) => void;
  setScrollPosition: (position: number) => void;
  setToolMode: (mode: SoundToolMode) => void;
  // Export
  exportTrimmed: (format: "mp3" | "wav" | "ogg") => Promise<Blob | null>;
  // Clear
  clearAudio: () => void;
  // Refs
  audioContextRef: React.RefObject<AudioContext | null>;
}

const SoundEditorContext = createContext<SoundEditorContextValue | null>(null);

const initialState: SoundEditorState = {
  audioBuffer: null,
  audioUrl: null,
  fileName: null,
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  trimRegion: null,
  zoom: 1,
  scrollPosition: 0,
  toolMode: "select",
};

export function SoundEditorProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SoundEditorState>(initialState);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const audioContextStartTimeRef = useRef<number>(0); // AudioContext.currentTime when playback started
  const playbackStartOffsetRef = useRef<number>(0); // The audio position when playback started
  const currentTimeRef = useRef<number>(0);
  const isPlayingRef = useRef<boolean>(false);
  const animationFrameRef = useRef<number | null>(null);
  const audioBufferRef = useRef<AudioBuffer | null>(null);

  // Sync refs with state
  useEffect(() => {
    currentTimeRef.current = state.currentTime;
  }, [state.currentTime]);

  useEffect(() => {
    isPlayingRef.current = state.isPlaying;
  }, [state.isPlaying]);

  useEffect(() => {
    audioBufferRef.current = state.audioBuffer;
  }, [state.audioBuffer]);

  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContext();
    }
    return audioContextRef.current;
  }, []);

  const loadAudio = useCallback(async (file: File) => {
    const audioContext = getAudioContext();

    // Stop currently playing source before replacing the loaded media.
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore errors if already stopped.
      }
      sourceNodeRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    const arrayBuffer = await file.arrayBuffer();
    let decodedBuffer: AudioBuffer;
    try {
      // slice(0) keeps a copy compatible with browser decode implementations.
      decodedBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
    } catch {
      throw new Error("No decodable audio stream was found in this file.");
    }

    const nextUrl = URL.createObjectURL(file);
    let previousUrl: string | null = null;

    currentTimeRef.current = 0;
    isPlayingRef.current = false;
    audioBufferRef.current = decodedBuffer;

    setState((prev) => {
      previousUrl = prev.audioUrl;
      return {
        ...prev,
        audioBuffer: decodedBuffer,
        audioUrl: nextUrl,
        fileName: file.name,
        duration: decodedBuffer.duration,
        currentTime: 0,
        isPlaying: false,
        trimRegion: null,
      };
    });

    if (previousUrl) {
      URL.revokeObjectURL(previousUrl);
    }
  }, [getAudioContext]);

  const updateCurrentTime = useCallback(() => {
    if (!audioContextRef.current || !isPlayingRef.current) return;

    const elapsed = audioContextRef.current.currentTime - audioContextStartTimeRef.current;
    const newTime = playbackStartOffsetRef.current + elapsed;

    // Update ref immediately
    const audioBuffer = audioBufferRef.current;
    if (!audioBuffer) return;

    currentTimeRef.current = newTime;

    if (newTime >= audioBuffer.duration) {
      // End of audio
      currentTimeRef.current = 0;
      isPlayingRef.current = false;
      setState((prev) => ({ ...prev, isPlaying: false, currentTime: 0 }));
      return;
    }

    setState((prev) => ({
      ...prev,
      currentTime: Math.min(newTime, prev.duration),
    }));

    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, []);

  const stopCurrentSource = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.onended = null;
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch {
        // Ignore errors if already stopped
      }
      sourceNodeRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  }, []);

  const playFromTime = useCallback((startOffset: number) => {
    const audioBuffer = audioBufferRef.current;
    if (!audioBuffer) return;

    const audioContext = getAudioContext();
    if (audioContext.state === "suspended") {
      audioContext.resume();
    }

    // Stop existing source
    stopCurrentSource();

    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(audioContext.destination);

    // Update refs before starting
    currentTimeRef.current = startOffset;
    playbackStartOffsetRef.current = startOffset;
    audioContextStartTimeRef.current = audioContext.currentTime;
    isPlayingRef.current = true;

    source.start(0, startOffset);

    source.onended = () => {
      if (isPlayingRef.current) {
        // Only reset if we're still in playing state (not manually stopped)
        currentTimeRef.current = 0;
        isPlayingRef.current = false;
        setState((prev) => ({
          ...prev,
          isPlaying: false,
          currentTime: 0,
        }));
      }
    };

    sourceNodeRef.current = source;

    setState((prev) => ({ ...prev, isPlaying: true, currentTime: startOffset }));
    animationFrameRef.current = requestAnimationFrame(updateCurrentTime);
  }, [getAudioContext, stopCurrentSource, updateCurrentTime]);

  const play = useCallback(() => {
    const audioBuffer = audioBufferRef.current;
    if (!audioBuffer) return;

    const startOffset = currentTimeRef.current;

    // If at the end, restart from beginning
    if (startOffset >= audioBuffer.duration - 0.01) {
      playFromTime(0);
    } else {
      playFromTime(startOffset);
    }
  }, [playFromTime]);

  const pause = useCallback(() => {
    if (!isPlayingRef.current) return;

    // Calculate current position before stopping
    const audioContext = audioContextRef.current;
    if (audioContext) {
      const elapsed = audioContext.currentTime - audioContextStartTimeRef.current;
      currentTimeRef.current = playbackStartOffsetRef.current + elapsed;
    }

    stopCurrentSource();
    isPlayingRef.current = false;

    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: currentTimeRef.current,
    }));
  }, [stopCurrentSource]);

  const stop = useCallback(() => {
    stopCurrentSource();

    currentTimeRef.current = 0;
    isPlayingRef.current = false;

    setState((prev) => ({
      ...prev,
      isPlaying: false,
      currentTime: 0,
    }));
  }, [stopCurrentSource]);

  const seek = useCallback((time: number) => {
    const wasPlaying = isPlayingRef.current;

    // Stop current playback
    stopCurrentSource();

    // Update position
    currentTimeRef.current = time;

    if (wasPlaying) {
      // Resume playing from new position
      playFromTime(time);
    } else {
      // Just update the position
      setState((prev) => ({ ...prev, currentTime: time }));
    }
  }, [stopCurrentSource, playFromTime]);

  const setTrimRegion = useCallback((region: AudioRegion | null) => {
    setState((prev) => ({ ...prev, trimRegion: region }));
  }, []);

  const setZoom = useCallback((zoom: number) => {
    setState((prev) => ({ ...prev, zoom: Math.max(1, Math.min(100, zoom)) }));
  }, []);

  const setScrollPosition = useCallback((position: number) => {
    setState((prev) => ({ ...prev, scrollPosition: Math.max(0, position) }));
  }, []);

  const setToolMode = useCallback((mode: SoundToolMode) => {
    setState((prev) => ({ ...prev, toolMode: mode }));
  }, []);

  const exportTrimmed = useCallback(async (format: "mp3" | "wav" | "ogg"): Promise<Blob | null> => {
    const audioBuffer = audioBufferRef.current;
    if (!audioBuffer) return null;

    const audioContext = getAudioContext();
    const { trimRegion } = state;

    const startSample = Math.floor((trimRegion?.start || 0) * audioBuffer.sampleRate);
    const endSample = Math.floor((trimRegion?.end || audioBuffer.duration) * audioBuffer.sampleRate);
    const length = endSample - startSample;

    // Create a new buffer with trimmed audio
    const trimmedBuffer = audioContext.createBuffer(
      audioBuffer.numberOfChannels,
      length,
      audioBuffer.sampleRate
    );

    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      const originalData = audioBuffer.getChannelData(channel);
      const trimmedData = trimmedBuffer.getChannelData(channel);
      for (let i = 0; i < length; i++) {
        trimmedData[i] = originalData[startSample + i];
      }
    }

    // Export based on format
    switch (format) {
      case "mp3":
        return audioBufferToMp3(trimmedBuffer, { bitrate: 192 });
      case "wav":
        return audioBufferToWav(trimmedBuffer);
      case "ogg":
        // OGG encoding not yet implemented, fallback to WAV
        return audioBufferToWav(trimmedBuffer);
      default:
        return audioBufferToWav(trimmedBuffer);
    }
  }, [state.trimRegion, getAudioContext]);

  const clearAudio = useCallback(() => {
    stop();

    if (state.audioUrl) {
      URL.revokeObjectURL(state.audioUrl);
    }

    audioBufferRef.current = null;
    setState(initialState);
  }, [state.audioUrl, stop]);

  const value: SoundEditorContextValue = {
    ...state,
    loadAudio,
    play,
    pause,
    stop,
    seek,
    setTrimRegion,
    setZoom,
    setScrollPosition,
    setToolMode,
    exportTrimmed,
    clearAudio,
    audioContextRef,
  };

  return (
    <SoundEditorContext.Provider value={value}>
      {children}
    </SoundEditorContext.Provider>
  );
}

export function useSoundEditor() {
  const context = useContext(SoundEditorContext);
  if (!context) {
    throw new Error("useSoundEditor must be used within a SoundEditorProvider");
  }
  return context;
}

// Helper function to convert AudioBuffer to WAV Blob
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;

  const dataLength = buffer.length * blockAlign;
  const bufferLength = 44 + dataLength;

  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // WAV header
  writeString(view, 0, "RIFF");
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // subchunk1size
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, "data");
  view.setUint32(40, dataLength, true);

  // Interleave audio data
  const offset = 44;
  const channels: Float32Array[] = [];
  for (let i = 0; i < numChannels; i++) {
    channels.push(buffer.getChannelData(i));
  }

  for (let i = 0; i < buffer.length; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch][i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset + (i * blockAlign) + (ch * bytesPerSample), intSample, true);
    }
  }

  return new Blob([arrayBuffer], { type: "audio/wav" });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}
