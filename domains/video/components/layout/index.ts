export {
  SplitView as VideoSplitView,
  SplitContainer as VideoSplitContainer,
  Panel as VideoPanel,
  ResizeHandle as VideoResizeHandle,
  FloatingWindows as VideoFloatingWindows,
} from "@/shared/components/layout";

export {
  registerVideoPanelComponent,
  clearVideoPanelComponents,
  getVideoPanelContent,
  getVideoPanelTitle,
  isVideoPanelHeaderVisible,
  getVideoPanelDefaultSize,
  getVideoPanelMinSize,
  getRegisteredVideoPanelIds,
  useVideoPanelUpdate,
  subscribeToVideoPanelUpdates,
} from "./VideoPanelRegistry";

export { VideoPreviewPanelContent } from "./VideoPreviewPanelContent";
export { VideoTimelinePanelContent } from "./VideoTimelinePanelContent";
