import { BrushPreset, PressureSettings } from "../types/brush";

// ============================================
// Default Pressure Settings
// ============================================

const NO_PRESSURE: PressureSettings = {
  affectsSize: false,
  affectsOpacity: false,
  affectsFlow: false,
  sizeRange: [100, 100],
  opacityRange: [100, 100],
  flowRange: [100, 100],
};

const SIZE_PRESSURE: PressureSettings = {
  affectsSize: true,
  affectsOpacity: false,
  affectsFlow: false,
  sizeRange: [20, 100],
  opacityRange: [100, 100],
  flowRange: [100, 100],
};

const OPACITY_PRESSURE: PressureSettings = {
  affectsSize: false,
  affectsOpacity: true,
  affectsFlow: true,
  sizeRange: [100, 100],
  opacityRange: [30, 100],
  flowRange: [20, 100],
};

const FULL_PRESSURE: PressureSettings = {
  affectsSize: true,
  affectsOpacity: true,
  affectsFlow: false,
  sizeRange: [30, 100],
  opacityRange: [40, 100],
  flowRange: [100, 100],
};

// ============================================
// Default Brush Presets
// ============================================

export const DEFAULT_BRUSH_PRESETS: BrushPreset[] = [
  {
    id: "pencil",
    name: "Pencil",
    type: "pencil",
    isBuiltIn: true,
    pressure: SIZE_PRESSURE,
    defaultSize: 4,
    defaultHardness: 100,
    spacing: 10,
  },
  {
    id: "soft-brush",
    name: "Soft Brush",
    type: "pencil",
    isBuiltIn: true,
    pressure: SIZE_PRESSURE,
    defaultSize: 20,
    defaultHardness: 30,
    spacing: 15,
  },
  {
    id: "airbrush",
    name: "Airbrush",
    type: "airbrush",
    isBuiltIn: true,
    pressure: OPACITY_PRESSURE,
    defaultSize: 30,
    defaultHardness: 0,
    spacing: 5,
  },
  {
    id: "marker",
    name: "Marker",
    type: "marker",
    isBuiltIn: true,
    pressure: NO_PRESSURE,
    defaultSize: 15,
    defaultHardness: 90,
    spacing: 15,
  },
  {
    id: "watercolor",
    name: "Watercolor",
    type: "watercolor",
    isBuiltIn: true,
    pressure: FULL_PRESSURE,
    defaultSize: 25,
    defaultHardness: 20,
    spacing: 8,
  },
  {
    id: "hard-round",
    name: "Hard Round",
    type: "pencil",
    isBuiltIn: true,
    pressure: SIZE_PRESSURE,
    defaultSize: 10,
    defaultHardness: 100,
    spacing: 15,
  },
];

// ============================================
// Local Storage Keys
// ============================================

export const BRUSH_PRESETS_STORAGE_KEY = "artkit-brush-presets";
export const ACTIVE_PRESET_STORAGE_KEY = "artkit-active-brush-preset";

// ============================================
// Helper Functions
// ============================================

/**
 * Linear interpolation helper
 */
const lerp = (min: number, max: number, t: number): number => min + (max - min) * t;

/**
 * Calculate drawing parameters from pressure and preset settings
 */
export function calculateDrawingParameters(
  pressure: number,
  preset: BrushPreset,
  baseSize: number,
  pressureEnabled: boolean
): { size: number; opacity: number; flow: number } {
  // If pressure is disabled or this is mouse input (pressure = 1), use full values
  const effectivePressure = pressureEnabled ? pressure : 1;

  const { affectsSize, affectsOpacity, affectsFlow, sizeRange, opacityRange, flowRange } =
    preset.pressure;

  // Calculate effective values
  const sizePercent = affectsSize
    ? lerp(sizeRange[0], sizeRange[1], effectivePressure) / 100
    : 1;

  const opacityPercent = affectsOpacity
    ? lerp(opacityRange[0], opacityRange[1], effectivePressure) / 100
    : 1;

  const flowPercent = affectsFlow
    ? lerp(flowRange[0], flowRange[1], effectivePressure) / 100
    : 1;

  return {
    size: baseSize * sizePercent,
    opacity: opacityPercent,
    flow: flowPercent,
  };
}

/**
 * Load custom presets from localStorage
 */
export function loadCustomPresets(): BrushPreset[] {
  if (typeof window === "undefined") return [];

  try {
    const stored = localStorage.getItem(BRUSH_PRESETS_STORAGE_KEY);
    if (!stored) return [];
    return JSON.parse(stored);
  } catch {
    return [];
  }
}

/**
 * Save custom presets to localStorage
 */
export function saveCustomPresets(presets: BrushPreset[]): void {
  if (typeof window === "undefined") return;

  const customOnly = presets.filter((p) => !p.isBuiltIn);
  localStorage.setItem(BRUSH_PRESETS_STORAGE_KEY, JSON.stringify(customOnly));
}

/**
 * Load last active preset ID from localStorage
 */
export function loadActivePresetId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ACTIVE_PRESET_STORAGE_KEY);
}

/**
 * Save active preset ID to localStorage
 */
export function saveActivePresetId(presetId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ACTIVE_PRESET_STORAGE_KEY, presetId);
}
