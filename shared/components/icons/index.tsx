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

// Video Timeline (16x16)
export {
  AddVideoTrackIcon,
  AddAudioTrackIcon,
  SnapIcon,
  SnapOffIcon,
  TimelineZoomInIcon,
  TimelineZoomOutIcon,
  VideoClipIcon,
  AudioClipIcon,
  ImageClipIcon,
  TrackVisibleIcon,
  TrackHiddenIcon,
  TrackMutedIcon,
  TrackUnmutedIcon,
} from "./videoTimeline";

// Video Tools
export {
  TrimToolIcon,
  RazorToolIcon,
  MaskToolIcon,
  VideoCropToolIcon,
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
  SidebarEditorIcon,
  SidebarSpriteIcon,
  SidebarConverterIcon,
  SidebarSoundIcon,
  SidebarVideoIcon,
  SidebarIconsIcon,
} from "./sidebar";
