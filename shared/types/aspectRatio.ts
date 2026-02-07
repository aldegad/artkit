// ============================================
// Aspect Ratio Types (shared across domains)
// ============================================

export type AspectRatio = "free" | "fixed" | "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "custom";

export interface AspectRatioOption {
  value: AspectRatio;
  label: string;
}

export const ASPECT_RATIOS: AspectRatioOption[] = [
  { value: "free", label: "Free" },
  { value: "fixed", label: "Fixed" },
  { value: "1:1", label: "1:1" },
  { value: "16:9", label: "16:9" },
  { value: "9:16", label: "9:16" },
  { value: "4:3", label: "4:3" },
  { value: "3:4", label: "3:4" },
];

export const ASPECT_RATIO_VALUES: Record<AspectRatio, number | null> = {
  free: null,
  fixed: null, // Fixed uses current aspect ratio (calculated dynamically)
  "1:1": 1,
  "16:9": 16 / 9,
  "9:16": 9 / 16,
  "4:3": 4 / 3,
  "3:4": 3 / 4,
  custom: null, // Custom ratio uses lockAspect for dynamic ratio
};
