import type { SpriteTrack } from "../types";
import type { SpriteExportFrameSize } from "./export";
import {
  clampResampleDimension,
  parseResampleInput,
  resampleImageDataByScale,
  loadImageFromSource,
} from "@/shared/utils/resample";

export {
  clampResampleDimension,
  parseResampleInput,
  resampleImageDataByScale,
};

export async function estimateCanvasSizeFromTracks(
  tracks: SpriteTrack[],
): Promise<SpriteExportFrameSize | null> {
  const frames = tracks.flatMap((track) => track.frames).filter((frame) => Boolean(frame.imageData));
  if (frames.length === 0) return null;

  const sizeCache = new Map<string, Promise<{ width: number; height: number } | null>>();
  const getImageSize = (dataUrl: string) => {
    const cached = sizeCache.get(dataUrl);
    if (cached) return cached;

    const promise = loadImageFromSource(dataUrl)
      .then((image) => ({ width: image.width, height: image.height }))
      .catch(() => null);
    sizeCache.set(dataUrl, promise);
    return promise;
  };

  let maxRight = 0;
  let maxBottom = 0;

  await Promise.all(
    frames.map(async (frame) => {
      if (!frame.imageData) return;
      const size = await getImageSize(frame.imageData);
      if (!size) return;
      const ox = frame.offset?.x ?? 0;
      const oy = frame.offset?.y ?? 0;
      maxRight = Math.max(maxRight, ox + size.width);
      maxBottom = Math.max(maxBottom, oy + size.height);
    }),
  );

  if (maxRight <= 0 || maxBottom <= 0) return null;
  return {
    width: clampResampleDimension(maxRight),
    height: clampResampleDimension(maxBottom),
  };
}
