import { VideoTrack, Clip, getClipScaleX, getClipScaleY } from "../types";
import { Size } from "@/shared/types";
import { resolveClipPositionAtTimelineTime } from "./clipTransformKeyframes";

export interface CompositeRenderParams {
  time: number;
  tracks: VideoTrack[];
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  getMaskAtTimeForTrack: (trackId: string, time: number) => string | null;
  // clip.id -> HTMLVideoElement
  videoElements: Map<string, HTMLVideoElement>;
  imageCache: Map<string, HTMLImageElement>;
  maskImageCache: Map<string, HTMLImageElement>;
  maskTempCanvas: HTMLCanvasElement;
  projectSize: Size;
  renderRect: { x: number; y: number; width: number; height: number };
  liveMaskCanvas?: HTMLCanvasElement | null;
  isPlaying?: boolean;
  /** When true, skip video currentTime validation (caller already handled seeking via waitForSeek). */
  preSeekVerified?: boolean;
  onMaskImageLoad?: () => void;
}

/**
 * Render composited frame: all visible tracks with clips and masks.
 * Does NOT render UI overlays (selection, crop, brush cursor).
 * Returns true if all clips were rendered successfully.
 */
export function renderCompositeFrame(
  ctx: CanvasRenderingContext2D,
  params: CompositeRenderParams,
): boolean {
  const {
    time,
    tracks,
    getClipAtTime,
    getMaskAtTimeForTrack,
    videoElements,
    imageCache,
    maskImageCache,
    maskTempCanvas,
    projectSize,
    renderRect,
    liveMaskCanvas,
    isPlaying,
    preSeekVerified,
    onMaskImageLoad,
  } = params;

  const { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight } = renderRect;
  const scale = previewWidth / projectSize.width;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Draw bottom track first (background), top track last (foreground).
  // tracks[0] is the topmost track in the timeline.
  const sortedTracks = [...tracks].reverse();
  let allRendered = true;

  for (const track of sortedTracks) {
    if (!track.visible) continue;

    const clip = getClipAtTime(track.id, time);
    if (!clip || !clip.visible) continue;

    const videoElement = videoElements.get(clip.id);
    let sourceEl: CanvasImageSource | null = null;

    if (clip.type === "video" && videoElement) {
      if (videoElement.readyState < 2) {
        allRendered = false;
        continue;
      }
      if (!isPlaying && !preSeekVerified) {
        const clipTime = time - clip.startTime;
        const sourceTime = clip.trimIn + clipTime;
        if (Math.abs(videoElement.currentTime - sourceTime) > 0.05) {
          videoElement.currentTime = sourceTime;
          allRendered = false;
          continue;
        }
      }
      sourceEl = videoElement;
    } else if (clip.type === "image") {
      let img = imageCache.get(clip.sourceUrl);
      if (!img) {
        img = new Image();
        img.src = clip.sourceUrl;
        imageCache.set(clip.sourceUrl, img);
      }
      if (img.complete && img.naturalWidth > 0) {
        sourceEl = img;
      } else {
        allRendered = false;
      }
    }

    if (!sourceEl) continue;

    const clipPosition = resolveClipPositionAtTimelineTime(clip, time);
    const clipScaleX = getClipScaleX(clip);
    const clipScaleY = getClipScaleY(clip);
    const drawX = offsetX + clipPosition.x * scale;
    const drawY = offsetY + clipPosition.y * scale;
    const drawW = clip.sourceSize.width * scale * clipScaleX;
    const drawH = clip.sourceSize.height * scale * clipScaleY;

    // Check for mask on this track at current time
    const maskResult = getMaskAtTimeForTrack(clip.trackId, time);
    let clipMaskSource: CanvasImageSource | null = null;

    if (maskResult === "__live_canvas__" && liveMaskCanvas) {
      clipMaskSource = liveMaskCanvas;
    } else if (maskResult && maskResult !== "__live_canvas__") {
      let maskImg = maskImageCache.get(maskResult);
      if (!maskImg) {
        maskImg = new Image();
        maskImg.src = maskResult;
        maskImageCache.set(maskResult, maskImg);
        if (onMaskImageLoad) {
          maskImg.onload = onMaskImageLoad;
        }
      }
      if (maskImg.complete && maskImg.naturalWidth > 0) {
        clipMaskSource = maskImg;
      } else {
        // Mask image still loading — mark frame as incomplete
        allRendered = false;
      }
    }

    if (clipMaskSource) {
      // Draw with mask using offscreen compositing
      const maskW = projectSize.width;
      const maskH = projectSize.height;
      if (maskTempCanvas.width !== maskW || maskTempCanvas.height !== maskH) {
        maskTempCanvas.width = maskW;
        maskTempCanvas.height = maskH;
      }
      const tmpCtx = maskTempCanvas.getContext("2d");
      if (tmpCtx) {
        tmpCtx.imageSmoothingEnabled = true;
        tmpCtx.imageSmoothingQuality = "high";
        tmpCtx.clearRect(0, 0, maskW, maskH);
        tmpCtx.globalCompositeOperation = "source-over";
        tmpCtx.globalAlpha = 1;
        tmpCtx.drawImage(
          sourceEl,
          clipPosition.x,
          clipPosition.y,
          clip.sourceSize.width * clipScaleX,
          clip.sourceSize.height * clipScaleY,
        );
        tmpCtx.globalCompositeOperation = "destination-in";
        tmpCtx.drawImage(clipMaskSource, 0, 0, maskW, maskH);
        tmpCtx.globalCompositeOperation = "source-over";

        ctx.globalAlpha = clip.opacity / 100;
        ctx.drawImage(maskTempCanvas, offsetX, offsetY, previewWidth, previewHeight);
        ctx.globalAlpha = 1;
      }
    } else {
      ctx.globalAlpha = clip.opacity / 100;
      ctx.drawImage(sourceEl, drawX, drawY, drawW, drawH);
      ctx.globalAlpha = 1;
    }
  }

  return allRendered;
}
