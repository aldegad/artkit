// ============================================
// Sound Editor Domain Types
// ============================================

export type SoundToolMode = "select" | "trim" | "zoom";

export type AudioOutputFormat = "mp3" | "wav" | "ogg";

export interface AudioRegion {
  start: number; // seconds
  end: number; // seconds
}

export interface WaveformData {
  peaks: number[];
  duration: number;
  sampleRate: number;
}

export interface SoundEditorState {
  audioBuffer: AudioBuffer | null;
  audioUrl: string | null;
  fileName: string | null;
  duration: number;
  currentTime: number;
  isPlaying: boolean;
  // Trim region
  trimRegion: AudioRegion | null;
  // Zoom/scroll
  zoom: number;
  scrollPosition: number;
  // Tool state
  toolMode: SoundToolMode;
}

export interface SavedSoundProject {
  id: string;
  name: string;
  audioData: string; // base64 encoded
  trimRegion: AudioRegion | null;
  savedAt: number;
}

// Audio format options
export interface AudioFormatOption {
  value: AudioOutputFormat;
  label: string;
  mimeType: string;
}

export const AUDIO_FORMATS: AudioFormatOption[] = [
  { value: "mp3", label: "MP3", mimeType: "audio/mpeg" },
  { value: "wav", label: "WAV", mimeType: "audio/wav" },
  { value: "ogg", label: "OGG", mimeType: "audio/ogg" },
];
