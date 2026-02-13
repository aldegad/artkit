import {
  BACKGROUND_REMOVAL_MODELS,
  DEFAULT_BACKGROUND_REMOVAL_MODEL,
  removeBackground as removeBackgroundWithModel,
  removeBackgroundFromCanvas as removeBackgroundFromCanvasWithModel,
  type BackgroundRemovalModel,
  type BackgroundRemovalOptions,
  type BackgroundRemovalQuality,
} from "@/shared/utils/backgroundRemoval";
import { readAISettings } from "./settings";

function resolveOptions(options?: BackgroundRemovalOptions): BackgroundRemovalOptions {
  if (options?.quality && options?.model) {
    return options;
  }

  const settings = readAISettings();
  return {
    ...options,
    quality: options?.quality ?? settings.backgroundRemovalQuality,
    model: options?.model ?? settings.backgroundRemovalModel,
  };
}

export async function removeBackground(
  imageSource: string | Blob | HTMLImageElement,
  onProgress?: (progress: number, status: string) => void,
  options?: BackgroundRemovalOptions,
): Promise<HTMLCanvasElement> {
  return removeBackgroundWithModel(imageSource, onProgress, resolveOptions(options));
}

export async function removeBackgroundFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  onProgress?: (progress: number, status: string) => void,
  options?: BackgroundRemovalOptions,
): Promise<HTMLCanvasElement> {
  return removeBackgroundFromCanvasWithModel(sourceCanvas, onProgress, resolveOptions(options));
}

export {
  BACKGROUND_REMOVAL_MODELS,
  DEFAULT_BACKGROUND_REMOVAL_MODEL,
};
export type { BackgroundRemovalModel, BackgroundRemovalOptions, BackgroundRemovalQuality };
