// Sound Editor Domain Public API

// Components
export {
  Waveform,
  TrimControls,
  FormatConverter,
  PlaybackControls,
  AudioDropZone,
  SoundToolbar,
} from "./components";

// Context
export { SoundEditorProvider, useSoundEditor, SoundLayoutProvider, useSoundLayout } from "./contexts";

// Types
export type {
  SoundToolMode,
  AudioOutputFormat,
  AudioRegion,
  WaveformData,
  SoundEditorState,
  SavedSoundProject,
  AudioFormatOption,
} from "./types";

export { AUDIO_FORMATS } from "./types";
