// Types
export type { LayoutConfiguration, LayoutContextValue, PanelMeta } from "./types";

// Factories
export { createLayoutContext } from "./createLayoutContext";
export { createPanelRegistry } from "./createPanelRegistry";

// Context hooks
export { useLayout, useLayoutConfig, LayoutConfigProvider } from "./LayoutConfigContext";

// Components
export { default as SplitView } from "./SplitView";
export { default as SplitContainer } from "./SplitContainer";
export { default as Panel } from "./Panel";
export { default as ResizeHandle } from "./ResizeHandle";
export { default as FloatingWindows } from "./FloatingWindows";
