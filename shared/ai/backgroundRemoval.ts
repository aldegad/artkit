import {
  removeBackground as removeBackgroundWithModel,
  removeBackgroundFromCanvas as removeBackgroundFromCanvasWithModel,
  type BackgroundRemovalOptions,
  type BackgroundRemovalQuality,
} from "@/shared/utils/backgroundRemoval";
import { readAISettings } from "./settings";

function resolveOptions(options?: BackgroundRemovalOptions): BackgroundRemovalOptions {
  if (options?.quality) {
    return options;
  }

  const settings = readAISettings();
  return {
    ...options,
    quality: settings.backgroundRemovalQuality,
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

export type { BackgroundRemovalOptions, BackgroundRemovalQuality };
