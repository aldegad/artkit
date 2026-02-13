import {
  DEFAULT_BACKGROUND_REMOVAL_MODEL,
  type BackgroundRemovalModel,
  type BackgroundRemovalQuality,
} from "@/shared/utils/backgroundRemoval";
import type { RifeInterpolationQuality } from "@/shared/utils/rifeInterpolation";

const AI_SETTINGS_STORAGE_KEY = "artkit-ai-settings";

export interface AISettings {
  backgroundRemovalQuality: BackgroundRemovalQuality;
  backgroundRemovalModel: BackgroundRemovalModel;
  frameInterpolationQuality: RifeInterpolationQuality;
}

const DEFAULT_AI_SETTINGS: AISettings = {
  backgroundRemovalQuality: "balanced",
  backgroundRemovalModel: DEFAULT_BACKGROUND_REMOVAL_MODEL,
  frameInterpolationQuality: "fast",
};

function sanitizeQuality(value: unknown): BackgroundRemovalQuality {
  if (value === "fast" || value === "high" || value === "balanced") return value;
  return DEFAULT_AI_SETTINGS.backgroundRemovalQuality;
}

function sanitizeModel(value: unknown): BackgroundRemovalModel {
  if (value === "rmbg-1.4" || value === "birefnet-lite" || value === "birefnet") return value;
  return DEFAULT_AI_SETTINGS.backgroundRemovalModel;
}

function sanitizeInterpolationQuality(value: unknown): RifeInterpolationQuality {
  if (value === "fast" || value === "high") return value;
  return DEFAULT_AI_SETTINGS.frameInterpolationQuality;
}

function sanitizeSettings(value: unknown): AISettings {
  if (!value || typeof value !== "object") return DEFAULT_AI_SETTINGS;
  const objectValue = value as Record<string, unknown>;
  return {
    backgroundRemovalQuality: sanitizeQuality(objectValue.backgroundRemovalQuality),
    backgroundRemovalModel: sanitizeModel(objectValue.backgroundRemovalModel),
    frameInterpolationQuality: sanitizeInterpolationQuality(objectValue.frameInterpolationQuality),
  };
}

export function getDefaultAISettings(): AISettings {
  return { ...DEFAULT_AI_SETTINGS };
}

export function readAISettings(): AISettings {
  if (typeof window === "undefined") return getDefaultAISettings();
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(AI_SETTINGS_STORAGE_KEY);
  } catch {
    return getDefaultAISettings();
  }
  if (!raw) return getDefaultAISettings();

  try {
    return sanitizeSettings(JSON.parse(raw));
  } catch {
    return getDefaultAISettings();
  }
}

export function updateAISettings(partial: Partial<AISettings>): AISettings {
  const merged = {
    ...readAISettings(),
    ...partial,
  };
  const sanitized = sanitizeSettings(merged);

  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(AI_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
    } catch {
      // Ignore storage failures (private mode / quota limits).
    }
  }

  return sanitized;
}
