// ============================================
// Brush Preset Types
// ============================================

/**
 * Pressure sensitivity settings for a brush preset
 */
export interface PressureSettings {
  /** Whether pen pressure affects brush size */
  affectsSize: boolean;
  /** Whether pen pressure affects opacity */
  affectsOpacity: boolean;
  /** Whether pen pressure affects flow (paint accumulation rate) */
  affectsFlow: boolean;
  /** Size range as percentage [min, max], e.g., [20, 100] */
  sizeRange: [number, number];
  /** Opacity range as percentage [min, max], e.g., [30, 100] */
  opacityRange: [number, number];
  /** Flow range as percentage [min, max], e.g., [10, 100] */
  flowRange: [number, number];
}

/**
 * Brush preset type identifiers
 */
export type BrushPresetType =
  | "pencil" // Pressure affects size
  | "airbrush" // Pressure affects opacity/flow
  | "marker" // No pressure sensitivity
  | "watercolor" // Pressure affects size + opacity
  | "custom"; // User-defined settings

/**
 * Complete brush preset definition
 */
export interface BrushPreset {
  /** Unique identifier */
  id: string;
  /** Display name */
  name: string;
  /** Preset type for icon/categorization */
  type: BrushPresetType;
  /** Whether this is a built-in preset (cannot be deleted) */
  isBuiltIn: boolean;
  /** Pressure sensitivity settings */
  pressure: PressureSettings;
  /** Default brush size */
  defaultSize: number;
  /** Default hardness (0-100) */
  defaultHardness: number;
  /** Spacing between dabs as percentage of brush size */
  spacing: number;
}

/**
 * Drawing parameters calculated from pressure and preset
 */
export interface DrawingParameters {
  /** Effective brush size after pressure applied */
  size: number;
  /** Effective opacity (0-1) after pressure applied */
  opacity: number;
  /** Effective flow (0-1) after pressure applied */
  flow: number;
  /** Original pressure value (0-1) */
  pressure: number;
}
