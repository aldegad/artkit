import {
  interpolateFramesWithRife,
  type RifeInterpolationQuality,
} from "@/shared/utils/rifeInterpolation";
import { readAISettings } from "./settings";

export interface AIFrameInterpolationOptions {
  fromImageData: string;
  toImageData: string;
  steps: number;
  quality?: RifeInterpolationQuality;
  modelUrl?: string;
  onProgress?: (progress: number, status: string) => void;
}

export async function interpolateFramesWithAI(
  options: AIFrameInterpolationOptions,
): Promise<string[]> {
  const settings = readAISettings();

  return interpolateFramesWithRife({
    ...options,
    quality: options.quality ?? settings.frameInterpolationQuality,
  });
}

export type { RifeInterpolationQuality };
