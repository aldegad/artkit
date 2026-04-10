"use client";

import { MutableRefObject, RefObject } from "react";
import { applyPixelPreviewScalePolicy, drawScaledImage, resizeCanvasForDpr } from "@/shared/utils";
import { getCanvasColorsSync } from "@/shared/hooks";
import { PLAYBACK } from "../../constants";
import { Clip, MaskData, VideoProject, VideoTrack, getClipScaleX, getClipScaleY, getSourceTime } from "../../types";
import { resolveClipPositionAtTimelineTime } from "../../utils/clipTransformKeyframes";
import { drawCropOverlay, drawMaskRegionOverlay, drawTransformBoundsOverlay } from "./previewCanvasOverlayDrawing";
import { drawPreviewCheckerboard } from "./previewCheckerboard";
import { drawMaskedClipLayer, drawMaskTintOverlay } from "./previewMaskedClipDrawing";
import { DirectPreviewPlan, ensureRenderSurfaceCanvas } from "./previewCanvasConfig";
import { applyDirectVideoPreview } from "./previewCanvasDirectVideo";

interface CanvasSizeInfo {
  width: number;
  height: number;
  pixelWidth: number;
  pixelHeight: number;
  dpr: number;
}

interface RenderTransformState {
  isActive: boolean;
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotation?: number;
  } | null;
}

export interface PreviewBaseFrameState {
  renderTime: number | null;
  clipsRef: Clip[] | null;
  tracksRef: VideoTrack[] | null;
  masksRef: Map<string, MaskData> | null;
  playbackIsPlaying: boolean;
  directPreviewTrackId: string | null;
  fullyReady: boolean;
}

export function canReuseCommittedBaseFrame(params: {
  usesDirectVideoPreview: boolean;
  hasCachedBitmap: boolean;
  isEditingMask: boolean;
  hasCommittedCompositeFrame: boolean;
  previousBaseFrame: PreviewBaseFrameState;
  currentClipsRef: Clip[];
  currentTracksRef: VideoTrack[];
  currentMasksRef: Map<string, MaskData>;
  playbackIsPlaying: boolean;
  directPreviewTrackId: string | null;
  renderTime: number;
}): boolean {
  return !params.usesDirectVideoPreview
    && !params.hasCachedBitmap
    && !params.isEditingMask
    && params.hasCommittedCompositeFrame
    && params.previousBaseFrame.fullyReady
    && params.previousBaseFrame.clipsRef === params.currentClipsRef
    && params.previousBaseFrame.tracksRef === params.currentTracksRef
    && params.previousBaseFrame.masksRef === params.currentMasksRef
    && params.previousBaseFrame.playbackIsPlaying === params.playbackIsPlaying
    && params.previousBaseFrame.directPreviewTrackId === params.directPreviewTrackId
    && params.previousBaseFrame.renderTime !== null
    && Math.abs(params.previousBaseFrame.renderTime - params.renderTime) < 1e-6;
}

export function shouldCommitWorkingCompositeFrame(params: {
  usesDirectVideoPreview: boolean;
  canReuseCommittedBase: boolean;
  baseFrameReady: boolean;
}): boolean {
  return !params.usesDirectVideoPreview
    && !params.canReuseCommittedBase
    && params.baseFrameReady;
}

export function resolvePresentedBaseCanvasSource(params: {
  usesDirectVideoPreview: boolean;
  canReuseCommittedBase: boolean;
  baseFrameReady: boolean;
  hasCommittedCompositeFrame: boolean;
}): "none" | "committed" | "working" {
  if (params.usesDirectVideoPreview) return "none";
  if (params.canReuseCommittedBase || (!params.baseFrameReady && params.hasCommittedCompositeFrame)) {
    return "committed";
  }
  return "working";
}

export interface PreviewCanvasRenderParams {
  previewCanvasRef: RefObject<HTMLCanvasElement | null>;
  previewContainerRef: RefObject<HTMLDivElement | null>;
  compositingCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  previewWorkingCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  previewPerfRef: MutableRefObject<{ draftMode: boolean }>;
  containerRectRef: MutableRefObject<{ width: number; height: number }>;
  cssColorsRef: MutableRefObject<{ surfacePrimary: string; borderDefault: string } | null>;
  checkerPatternRef: MutableRefObject<CanvasPattern | null>;
  checkerPatternKeyRef: MutableRefObject<string>;
  checkerPatternCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  hasCommittedCompositeFrameRef: MutableRefObject<boolean>;
  baseFrameStateRef: MutableRefObject<PreviewBaseFrameState>;
  maskTempCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  maskOverlayCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  imageCacheRef: MutableRefObject<Map<string, HTMLImageElement>>;
  savedMaskImgCacheRef: MutableRefObject<Map<string, HTMLImageElement>>;
  directPreviewHostRef: MutableRefObject<HTMLDivElement | null>;
  directPreviewAttachedVideoRef: MutableRefObject<HTMLVideoElement | null>;
  directPreviewPlaybackStateRef: MutableRefObject<{ activeClipId: string | null }>;
  currentTimeRef: RefObject<number>;
  playbackPerfRef: MutableRefObject<{
    cacheFrames: number;
    liveFrames: number;
  }>;
  project: VideoProject;
  playback: {
    isPlaying: boolean;
    currentTime: number;
    loop: boolean;
    loopStart: number;
    loopEnd: number;
    playbackRate: number;
  };
  tracks: VideoTrack[];
  clips: Clip[];
  masks: Map<string, MaskData>;
  selectedClipIds: string[];
  toolMode: string;
  cropArea: { x: number; y: number; width: number; height: number } | null;
  activeMaskId: string | null;
  activeTrackId: string | null;
  isEditingMask: boolean;
  isInpaintMode: boolean;
  directPreviewPlan: DirectPreviewPlan | null;
  effectivePreRenderEnabled: boolean;
  adaptivePlaybackPreviewPolicy: {
    maxCanvasDpr: number;
    smoothingQuality: ImageSmoothingQuality;
  };
  transformState: RenderTransformState;
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  getMaskAtTimeForTrack: (trackId: string, time: number) => string | "__live_canvas__" | null;
  getCachedFrame: (time: number) => ImageBitmap | null;
  getPlaybackSampleTime: (time: number, bounds: { minFrame: number; maxFrame: number } | null) => number;
  getLoopFrameBounds: (loop: boolean, loopStart: number, loopEnd: number, duration: number) => { minFrame: number; maxFrame: number } | null;
  getVisibleMaskRegion: () => { region: { x: number; y: number; width: number; height: number }; isDragging: boolean } | null;
  ensureInpaintMaskCanvas: () => HTMLCanvasElement | null;
  vpGetEffectiveScale: () => number;
  vpGetRenderOffset: () => { x: number; y: number };
  vpContentToScreen: (point: { x: number; y: number }) => { x: number; y: number };
  videoElementsRef: RefObject<Map<string, HTMLVideoElement>>;
  maskContextCanvasRef: RefObject<HTMLCanvasElement | null>;
}

export function detachDirectPreviewVideo(params: {
  directPreviewHostRef: MutableRefObject<HTMLDivElement | null>;
  directPreviewAttachedVideoRef: MutableRefObject<HTMLVideoElement | null>;
}) {
  const host = params.directPreviewHostRef.current;
  const attachedVideo = params.directPreviewAttachedVideoRef.current;
  if (host && attachedVideo && attachedVideo.parentElement === host) {
    host.removeChild(attachedVideo);
  }
  params.directPreviewAttachedVideoRef.current = null;
  if (host) {
    host.style.display = "none";
  }
}

function getCanvasSize(
  params: Pick<PreviewCanvasRenderParams, "previewCanvasRef" | "previewContainerRef" | "containerRectRef" | "adaptivePlaybackPreviewPolicy">
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; size: CanvasSizeInfo } | null {
  const canvas = params.previewCanvasRef.current;
  const container = params.previewContainerRef.current;
  if (!canvas || !container) return null;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let width = params.containerRectRef.current.width;
  let height = params.containerRectRef.current.height;
  if (width <= 0 || height <= 0) {
    const rect = container.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    params.containerRectRef.current = { width, height };
  }

  const size = resizeCanvasForDpr(canvas, ctx, width, height, {
    maxDevicePixelRatio: params.adaptivePlaybackPreviewPolicy.maxCanvasDpr,
    scaleContext: true,
  });
  if (size.width <= 0 || size.height <= 0) return null;

  return { canvas, ctx, size };
}

export function renderPreviewCanvasFrame(params: PreviewCanvasRenderParams) {
  const renderTarget = getCanvasSize(params);
  if (!renderTarget) return;

  const { canvas, ctx, size: canvasSize } = renderTarget;
  const ct = params.currentTimeRef.current;
  const safeProjectDuration = Number.isFinite(params.project.duration) ? Math.max(params.project.duration, 0) : 0;
  const loopFrameBounds = params.getLoopFrameBounds(
    params.playback.loop,
    params.playback.loopStart,
    params.playback.loopEnd,
    safeProjectDuration,
  );
  const renderTime = (params.playback.isPlaying && params.effectivePreRenderEnabled)
    ? params.getPlaybackSampleTime(ct, loopFrameBounds)
    : ct;

  if (!params.cssColorsRef.current) {
    const rootStyle = getComputedStyle(document.documentElement);
    params.cssColorsRef.current = {
      surfacePrimary: rootStyle.getPropertyValue("--surface-primary").trim() || "#1a1a1a",
      borderDefault: rootStyle.getPropertyValue("--border-default").trim() || "#333333",
    };
  }
  const { surfacePrimary, borderDefault } = params.cssColorsRef.current;
  const colors = getCanvasColorsSync();
  const { canvas: committedCompositeCanvas, resized: committedCanvasResized } = ensureRenderSurfaceCanvas(
    params.compositingCanvasRef,
    canvasSize.pixelWidth,
    canvasSize.pixelHeight,
  );
  const committedCompositeCtx = committedCompositeCanvas.getContext("2d");
  const { canvas: workingCompositeCanvas } = ensureRenderSurfaceCanvas(
    params.previewWorkingCanvasRef,
    canvasSize.pixelWidth,
    canvasSize.pixelHeight,
  );
  const workingCompositeCtx = workingCompositeCanvas.getContext("2d");
  if (!committedCompositeCtx || !workingCompositeCtx) return;

  if (committedCanvasResized) {
    params.hasCommittedCompositeFrameRef.current = false;
  }

  let usesDirectVideoPreview = false;
  const scale = params.vpGetEffectiveScale();
  const renderOffset = params.vpGetRenderOffset();
  const previewWidth = params.project.canvasSize.width * scale;
  const previewHeight = params.project.canvasSize.height * scale;
  const offsetX = renderOffset.x;
  const offsetY = renderOffset.y;
  const previewScalePolicy = applyPixelPreviewScalePolicy(workingCompositeCtx, scale);
  const selectedVisualClipId = params.selectedClipIds.find((clipId) => {
    const selected = params.clips.find((clip) => clip.id === clipId);
    return !!selected && selected.type !== "audio";
  }) || null;

  usesDirectVideoPreview = applyDirectVideoPreview({
    directPreviewPlan: params.directPreviewPlan,
    directPreviewHostRef: params.directPreviewHostRef,
    directPreviewAttachedVideoRef: params.directPreviewAttachedVideoRef,
    directPreviewPlaybackStateRef: params.directPreviewPlaybackStateRef,
    getClipAtTime: params.getClipAtTime,
    videoElementsRef: params.videoElementsRef,
    renderTime,
    playback: params.playback,
    scale,
    vpContentToScreen: params.vpContentToScreen,
    detachDirectPreviewVideo: () => detachDirectPreviewVideo(params),
  });

  const cachedBitmap = usesDirectVideoPreview || params.isEditingMask
    ? null
    : params.getCachedFrame(renderTime);
  const directPreviewTrackId = params.directPreviewPlan?.trackId ?? null;
  const canReuseCommittedBase = canReuseCommittedBaseFrame({
    usesDirectVideoPreview,
    hasCachedBitmap: Boolean(cachedBitmap),
    isEditingMask: params.isEditingMask,
    hasCommittedCompositeFrame: params.hasCommittedCompositeFrameRef.current,
    previousBaseFrame: params.baseFrameStateRef.current,
    currentClipsRef: params.clips,
    currentTracksRef: params.tracks,
    currentMasksRef: params.masks,
    playbackIsPlaying: params.playback.isPlaying,
    directPreviewTrackId,
    renderTime,
  });

  if (!usesDirectVideoPreview && !canReuseCommittedBase) {
    workingCompositeCtx.setTransform(canvasSize.dpr, 0, 0, canvasSize.dpr, 0, 0);
    workingCompositeCtx.clearRect(0, 0, canvasSize.width, canvasSize.height);
    workingCompositeCtx.fillStyle = surfacePrimary;
    workingCompositeCtx.fillRect(0, 0, canvasSize.width, canvasSize.height);
  }

  if (!usesDirectVideoPreview && !canReuseCommittedBase) {
    workingCompositeCtx.save();
    workingCompositeCtx.beginPath();
    workingCompositeCtx.rect(offsetX, offsetY, previewWidth, previewHeight);
    workingCompositeCtx.clip();
    drawPreviewCheckerboard({
      ctx: workingCompositeCtx,
      width: canvasSize.width,
      height: canvasSize.height,
      isDraftMode: params.previewPerfRef.current.draftMode,
      cache: {
        patternRef: params.checkerPatternRef,
        patternKeyRef: params.checkerPatternKeyRef,
        patternCanvasRef: params.checkerPatternCanvasRef,
      },
    });
    workingCompositeCtx.restore();
  }

  let baseFrameReady = usesDirectVideoPreview || Boolean(cachedBitmap);
  if (usesDirectVideoPreview) {
    workingCompositeCtx.clearRect(0, 0, canvasSize.width, canvasSize.height);
  } else if (cachedBitmap) {
    if (params.playback.isPlaying) {
      params.playbackPerfRef.current.cacheFrames += 1;
    }
    drawScaledImage(
      workingCompositeCtx,
      cachedBitmap,
      { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
      {
        mode: previewScalePolicy.mode,
        progressiveMinify: !params.playback.isPlaying,
        smoothingQuality: params.adaptivePlaybackPreviewPolicy.smoothingQuality,
      },
    );
  } else if (!canReuseCommittedBase) {
    if (params.playback.isPlaying) {
      params.playbackPerfRef.current.liveFrames += 1;
    }
    baseFrameReady = true;

    for (const track of [...params.tracks].reverse()) {
      if (!track.visible) continue;
      const clip = params.getClipAtTime(track.id, renderTime);
      if (!clip || !clip.visible) continue;

      const videoElement = params.videoElementsRef.current.get(clip.id);
      let sourceEl: CanvasImageSource | null = null;

      if (clip.type === "video") {
        if (!videoElement || videoElement.readyState < 2) {
          baseFrameReady = false;
          continue;
        }
        const sourceTime = getSourceTime(clip, renderTime);
        if (params.playback.isPlaying && Math.abs(videoElement.currentTime - sourceTime) > PLAYBACK.SEEK_DRIFT_THRESHOLD * 1.25) {
          baseFrameReady = false;
        }
        if (!params.playback.isPlaying && Math.abs(videoElement.currentTime - sourceTime) > 0.05) {
          videoElement.currentTime = sourceTime;
        }
        sourceEl = videoElement;
      } else if (clip.type === "image") {
        const img = params.imageCacheRef.current.get(clip.sourceUrl) || null;
        if (img && img.complete && img.naturalWidth > 0) {
          sourceEl = img;
        } else {
          baseFrameReady = false;
        }
      }

      if (!sourceEl) continue;

      const clipPosition = resolveClipPositionAtTimelineTime(clip, renderTime);
      const drawPoint = params.vpContentToScreen(clipPosition);
      const drawW = clip.sourceSize.width * scale * getClipScaleX(clip);
      const drawH = clip.sourceSize.height * scale * getClipScaleY(clip);
      const maskResult = params.getMaskAtTimeForTrack(clip.trackId, renderTime);
      let clipMaskSource: CanvasImageSource | null = null;

      if (maskResult === "__live_canvas__" && params.maskContextCanvasRef.current) {
        clipMaskSource = params.maskContextCanvasRef.current;
      } else if (maskResult && maskResult !== "__live_canvas__") {
        const maskImg = params.savedMaskImgCacheRef.current.get(maskResult) || null;
        if (maskImg && maskImg.complete && maskImg.naturalWidth > 0) {
          clipMaskSource = maskImg;
        } else {
          baseFrameReady = false;
        }
      }

      if (clipMaskSource) {
        drawMaskedClipLayer({
          ctx: workingCompositeCtx,
          sourceEl,
          clipMaskSource,
          clipProjectRect: {
            x: clipPosition.x,
            y: clipPosition.y,
            width: clip.sourceSize.width * getClipScaleX(clip),
            height: clip.sourceSize.height * getClipScaleY(clip),
          },
          projectSize: params.project.canvasSize,
          previewRect: { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
          clipOpacity: clip.opacity / 100,
          progressiveMinify: !params.playback.isPlaying,
          previewScaleMode: previewScalePolicy.mode,
          smoothingQuality: params.adaptivePlaybackPreviewPolicy.smoothingQuality,
          maskTempCanvasRef: params.maskTempCanvasRef,
          maskOverlayCanvasRef: params.maskOverlayCanvasRef,
          overlayTint: null,
        });
      } else {
        workingCompositeCtx.globalAlpha = clip.opacity / 100;
        drawScaledImage(
          workingCompositeCtx,
          sourceEl,
          { x: drawPoint.x, y: drawPoint.y, width: drawW, height: drawH },
          {
            mode: previewScalePolicy.mode,
            progressiveMinify: !params.playback.isPlaying,
            smoothingQuality: params.adaptivePlaybackPreviewPolicy.smoothingQuality,
          },
        );
        workingCompositeCtx.globalAlpha = 1;
      }
    }
  }

  if (!usesDirectVideoPreview && !cachedBitmap && !canReuseCommittedBase) {
    params.baseFrameStateRef.current = {
      renderTime,
      clipsRef: params.clips,
      tracksRef: params.tracks,
      masksRef: params.masks,
      playbackIsPlaying: params.playback.isPlaying,
      directPreviewTrackId,
      fullyReady: baseFrameReady,
    };
  }

  if (shouldCommitWorkingCompositeFrame({
    usesDirectVideoPreview,
    canReuseCommittedBase,
    baseFrameReady,
  })) {
    committedCompositeCtx.setTransform(1, 0, 0, 1, 0, 0);
    committedCompositeCtx.clearRect(0, 0, committedCompositeCanvas.width, committedCompositeCanvas.height);
    committedCompositeCtx.drawImage(workingCompositeCanvas, 0, 0);
    params.hasCommittedCompositeFrameRef.current = true;
  }

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!usesDirectVideoPreview) {
    const baseCanvasToPresent = resolvePresentedBaseCanvasSource({
      usesDirectVideoPreview,
      canReuseCommittedBase,
      baseFrameReady,
      hasCommittedCompositeFrame: params.hasCommittedCompositeFrameRef.current,
    }) === "committed"
      ? committedCompositeCanvas
      : workingCompositeCanvas;
    ctx.drawImage(baseCanvasToPresent, 0, 0);
  }
  ctx.setTransform(canvasSize.dpr, 0, 0, canvasSize.dpr, 0, 0);

  if (params.activeTrackId && params.activeMaskId) {
    const activeClip = params.getClipAtTime(params.activeTrackId, renderTime);
    const activeMaskResult = params.getMaskAtTimeForTrack(params.activeTrackId, renderTime);
    const overlayTint = params.isEditingMask
      ? "rgba(255, 60, 60, 0.35)"
      : "rgba(168, 85, 247, 0.3)";
    let activeMaskSource: CanvasImageSource | null = null;

    if (activeMaskResult === "__live_canvas__" && params.maskContextCanvasRef.current) {
      activeMaskSource = params.maskContextCanvasRef.current;
    } else if (activeMaskResult && activeMaskResult !== "__live_canvas__") {
      const maskImg = params.savedMaskImgCacheRef.current.get(activeMaskResult) || null;
      if (maskImg && maskImg.complete && maskImg.naturalWidth > 0) {
        activeMaskSource = maskImg;
      }
    }

    if (activeClip && activeClip.visible && activeMaskSource) {
      drawMaskTintOverlay({
        ctx,
        clipMaskSource: activeMaskSource,
        projectSize: params.project.canvasSize,
        previewRect: { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
        previewScaleMode: previewScalePolicy.mode,
        smoothingQuality: params.adaptivePlaybackPreviewPolicy.smoothingQuality,
        maskOverlayCanvasRef: params.maskOverlayCanvasRef,
        overlayTint,
      });
    }
  }

  if (selectedVisualClipId && !(params.toolMode === "transform" && params.transformState.isActive)) {
    const selectedVisualClip = params.clips.find((clip) => clip.id === selectedVisualClipId);
    if (selectedVisualClip && selectedVisualClip.type !== "audio") {
      const clipPosition = resolveClipPositionAtTimelineTime(selectedVisualClip, renderTime);
      const boxPoint = params.vpContentToScreen(clipPosition);
      const boxW = selectedVisualClip.sourceSize.width * scale * getClipScaleX(selectedVisualClip);
      const boxH = selectedVisualClip.sourceSize.height * scale * getClipScaleY(selectedVisualClip);

      ctx.save();
      if (selectedVisualClip.rotation !== 0) {
        const centerX = boxPoint.x + boxW / 2;
        const centerY = boxPoint.y + boxH / 2;
        ctx.translate(centerX, centerY);
        ctx.rotate((selectedVisualClip.rotation * Math.PI) / 180);
        ctx.translate(-centerX, -centerY);
      }
      ctx.strokeStyle = colors.selection;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(boxPoint.x, boxPoint.y, boxW, boxH);
      ctx.restore();
    }
  }

  if (params.toolMode === "crop") {
    drawCropOverlay({
      ctx,
      activeCrop: params.cropArea || {
        x: 0,
        y: 0,
        width: params.project.canvasSize.width,
        height: params.project.canvasSize.height,
      },
      scale,
      offsetX,
      offsetY,
      previewWidth,
      previewHeight,
      colors: {
        selection: colors.selection,
        overlay: colors.overlay,
        grid: colors.grid,
      },
      contentToScreen: params.vpContentToScreen,
    });
  }

  if (params.toolMode === "transform" && params.transformState.isActive && params.transformState.bounds) {
    drawTransformBoundsOverlay({
      ctx,
      bounds: params.transformState.bounds,
      scale,
      colors: {
        selection: colors.selection,
        textOnColor: colors.textOnColor,
      },
      contentToScreen: params.vpContentToScreen,
    });
  }

  if (params.isEditingMask) {
    const visibleMaskRegion = params.getVisibleMaskRegion();
    if (visibleMaskRegion) {
      drawMaskRegionOverlay({
        ctx,
        region: visibleMaskRegion.region,
        isDragging: visibleMaskRegion.isDragging,
        scale,
        contentToScreen: params.vpContentToScreen,
      });
    }
  }

  if (params.isInpaintMode) {
    const inpaintMaskCanvas = params.ensureInpaintMaskCanvas();
    if (inpaintMaskCanvas) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(offsetX, offsetY, previewWidth, previewHeight);
      ctx.clip();
      ctx.globalAlpha = 0.38;
      drawScaledImage(
        ctx,
        inpaintMaskCanvas,
        { x: offsetX, y: offsetY, width: previewWidth, height: previewHeight },
        {
          mode: previewScalePolicy.mode,
          progressiveMinify: !params.playback.isPlaying,
          smoothingQuality: params.adaptivePlaybackPreviewPolicy.smoothingQuality,
        },
      );
      ctx.globalCompositeOperation = "source-atop";
      ctx.fillStyle = "rgba(255, 109, 74, 0.95)";
      ctx.fillRect(offsetX, offsetY, previewWidth, previewHeight);
      ctx.restore();
    }
  }

  ctx.strokeStyle = borderDefault;
  ctx.lineWidth = 1;
  ctx.strokeRect(offsetX, offsetY, previewWidth, previewHeight);
}
