// ============================================
// Ruler Utilities
// Tick calculation and ruler rendering helpers
// ============================================

// ============================================
// Types
// ============================================

export interface TickConfig {
  majorInterval: number; // Pixels between major ticks (in image coords)
  minorInterval: number; // Pixels between minor ticks (in image coords)
  labelInterval: number; // Pixels between labels (in image coords)
}

export interface Tick {
  position: number; // In image coordinates
  isMajor: boolean;
  label?: string;
}

// ============================================
// Tick Calculation
// ============================================

/**
 * Nice numbers for tick intervals
 * Used to create aesthetically pleasing ruler markings
 */
const NICE_NUMBERS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000];

/**
 * Calculate tick intervals based on zoom level
 * Targets approximately 100 screen pixels between major ticks
 */
export function calculateTickIntervals(zoom: number): TickConfig {
  // Target: major ticks ~100 screen pixels apart
  const targetScreenInterval = 100;
  const imageInterval = targetScreenInterval / zoom;

  // Find the smallest nice number >= imageInterval
  let majorInterval = NICE_NUMBERS.find((n) => n >= imageInterval) || 10000;

  // For very zoomed out views, use larger intervals
  if (majorInterval < 1) majorInterval = 1;

  // Minor ticks: divide major by 5 or 10 depending on the major interval
  let minorDivisions: number;
  if (majorInterval % 10 === 0) {
    minorDivisions = 10;
  } else if (majorInterval % 5 === 0) {
    minorDivisions = 5;
  } else if (majorInterval % 2 === 0) {
    minorDivisions = 2;
  } else {
    minorDivisions = 5;
  }

  const minorInterval = majorInterval / minorDivisions;

  return {
    majorInterval,
    minorInterval,
    labelInterval: majorInterval,
  };
}

/**
 * Get visible ticks for a ruler segment
 * Returns ticks within the visible range in image coordinates
 */
export function getVisibleTicks(
  viewStart: number, // Start of visible range in image coords
  viewEnd: number, // End of visible range in image coords
  config: TickConfig
): Tick[] {
  const ticks: Tick[] = [];

  // Align to minor interval
  const start = Math.floor(viewStart / config.minorInterval) * config.minorInterval;
  const end = Math.ceil(viewEnd / config.minorInterval) * config.minorInterval;

  for (let pos = start; pos <= end; pos += config.minorInterval) {
    const isMajor = pos % config.majorInterval === 0;
    const hasLabel = pos % config.labelInterval === 0;

    ticks.push({
      position: pos,
      isMajor,
      label: hasLabel ? formatTickLabel(pos) : undefined,
    });
  }

  return ticks;
}

/**
 * Format tick label (compress large numbers)
 */
function formatTickLabel(value: number): string {
  if (value === 0) return "0";

  const absValue = Math.abs(value);
  if (absValue >= 10000) {
    return `${value / 1000}k`;
  }
  return String(value);
}

// ============================================
// Ruler Dimensions
// ============================================

/** Default ruler thickness in pixels */
export const RULER_THICKNESS = 16;

/** Tick sizes relative to ruler thickness */
export const TICK_SIZE = {
  major: 8, // Major tick height
  minor: 4, // Minor tick height
};

/** Font settings for ruler labels */
export const RULER_FONT = {
  family: "system-ui, -apple-system, sans-serif",
  size: 9,
};

// ============================================
// Coordinate Conversion Helpers
// ============================================

/**
 * Convert screen position to image position for ruler
 * @param screenPos Screen coordinate (relative to ruler)
 * @param rulerOffset Offset of the ruler (accounts for pan)
 * @param zoom Current zoom level
 */
export function screenToImageRuler(
  screenPos: number,
  rulerOffset: number,
  zoom: number
): number {
  return (screenPos - rulerOffset) / zoom;
}

/**
 * Convert image position to screen position for ruler
 * @param imagePos Image coordinate
 * @param rulerOffset Offset of the ruler (accounts for pan)
 * @param zoom Current zoom level
 */
export function imageToScreenRuler(
  imagePos: number,
  rulerOffset: number,
  zoom: number
): number {
  return imagePos * zoom + rulerOffset;
}
