// ============================================
// Shared Components - Public API
// ============================================

export { default as ImageDropZone } from "./ImageDropZone";
export { default as Tooltip } from "./Tooltip";
export { default as SettingsMenu } from "./SettingsMenu";
export { Popover } from "./Popover";
export type { PopoverProps } from "./Popover";
export { Select } from "./Select";
export type { SelectProps, SelectOption } from "./Select";
export { Scrollbar } from "./Scrollbar";
export type { ScrollbarProps } from "./Scrollbar";
export { NumberScrubber } from "./NumberScrubber";
export { CanvasCropControls } from "./CanvasCropControls";
export type { CanvasCropArea } from "./CanvasCropControls";

// Layout Components
export * from "./layout";

// Icons
export * from "./icons";

// Header
export { HeaderContent } from "./HeaderContent";

// MenuBar
export { MenuDropdown } from "./MenuBar";
export type { MenuItem, MenuDropdownProps } from "./MenuBar";

// Modals
export { Modal } from "./Modal";
export type { ModalProps } from "./Modal";
export { ExportModal } from "./ExportModal";
export type { ExportModalProps, ExportProgress } from "./ExportModal";
export { BackgroundRemovalModals } from "./BackgroundRemovalModals";
export { ExportCanvasSizeControls } from "./ExportCanvasSizeControls";
export type { ExportCanvasSize } from "./ExportCanvasSizeControls";

// Feedback
export { SaveToast } from "./SaveToast";
export { LoadingOverlay } from "./LoadingOverlay";
