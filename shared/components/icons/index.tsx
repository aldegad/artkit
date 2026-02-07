/**
 * Shared Icon Components
 *
 * Centralized icon definitions used across all domains.
 * All icons are SVG-based and support className for sizing/styling.
 */

// Types
export type { IconProps } from "./types";

// Navigation & UI Controls
export {
  CloseIcon,
  ChevronDownIcon,
  MenuIcon,
  PlusIcon,
  MinusIcon,
  ZoomInIcon,
  ZoomOutIcon,
  CheckIcon,
  SpinnerIcon,
  WarningIcon,
} from "./navigation";

// Media & Playback
export {
  PlayIcon,
  PauseIcon,
  StopIcon,
  StepBackwardIcon,
  StepForwardIcon,
  PlayIcon24,
  PauseIcon24,
  StopIcon24,
  LoopIcon,
  LoopOffIcon,
  VolumeOnIcon,
  VolumeMutedIcon,
} from "./media";

// Editor Tools
export {
  CursorIcon,
  MarqueeIcon,
  MoveIcon,
  TransformIcon,
  BrushIcon,
  EraserIcon,
  FillBucketIcon,
  EyedropperIcon,
  CloneStampIcon,
  CropIcon,
  HandIcon,
  ZoomSearchIcon,
  PanIcon,
  ReorderIcon,
  OffsetIcon,
} from "./editorTools";

// Layers & Alignment
export {
  EyeOpenIcon,
  EyeClosedIcon,
  LockClosedIcon,
  LockOpenIcon,
  DuplicateIcon,
  AlignLeftIcon,
  AlignCenterHIcon,
  AlignRightIcon,
  AlignTopIcon,
  AlignMiddleVIcon,
  AlignBottomIcon,
  DistributeHIcon,
  DistributeVIcon,
} from "./layers";

// File Actions
export {
  DeleteIcon,
  ExportIcon,
  UndoIcon,
  RedoIcon,
  RotateIcon,
  ImageIcon,
  PersonIcon,
  BackgroundRemovalIcon,
} from "./fileActions";

// Theme
export { SunIcon, MoonIcon, SystemIcon } from "./theme";

// Brush Presets
export {
  PencilPresetIcon,
  AirbrushPresetIcon,
  MarkerPresetIcon,
  WatercolorPresetIcon,
  DefaultBrushPresetIcon,
  MagicWandIcon,
} from "./brushPresets";

// Video Timeline
export {
  AddVideoTrackIcon,
  AddAudioTrackIcon,
  SnapIcon,
  SnapOffIcon,
  VideoClipIcon,
  AudioClipIcon,
  ImageClipIcon,
  TrackMutedIcon,
  TrackUnmutedIcon,
  FilmStripIcon,
} from "./videoTimeline";

// Video Tools
export {
  TrimToolIcon,
  RazorToolIcon,
  MaskToolIcon,
} from "./videoTools";

// Crop
export {
  LockAspectIcon,
  UnlockAspectIcon,
  SquareExpandIcon,
  SquareFitIcon,
  CanvasExpandIcon,
} from "./crop";

// Sidebar Navigation
export {
  SidebarConverterIcon,
  SidebarSoundIcon,
  SidebarIconsIcon,
  ArtkitIcon,
} from "./sidebar";

// Landing Page (premium detail icons)
export {
  LandingImageIcon,
  LandingVideoIcon,
  LandingSpriteIcon,
} from "./landing";
