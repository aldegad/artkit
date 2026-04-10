"use client";

import { MutableRefObject, RefObject } from "react";
import { Clip, getClipPlaybackSpeed, getClipScaleX, getClipScaleY, getSourceTime } from "../../types";
import { resolveClipPositionAtTimelineTime } from "../../utils/clipTransformKeyframes";
import { DirectPreviewPlan } from "./previewCanvasConfig";
import { hasDirectPreviewClipTransition } from "./previewPlaybackDiscontinuity";

interface ApplyDirectPreviewParams {
  directPreviewPlan: DirectPreviewPlan | null;
  directPreviewHostRef: MutableRefObject<HTMLDivElement | null>;
  directPreviewAttachedVideoRef: MutableRefObject<HTMLVideoElement | null>;
  directPreviewPlaybackStateRef: MutableRefObject<{ activeClipId: string | null }>;
  getClipAtTime: (trackId: string, time: number) => Clip | null;
  videoElementsRef: RefObject<Map<string, HTMLVideoElement>>;
  renderTime: number;
  playback: { isPlaying: boolean; playbackRate: number };
  scale: number;
  vpContentToScreen: (point: { x: number; y: number }) => { x: number; y: number };
  detachDirectPreviewVideo: () => void;
}

export function applyDirectVideoPreview(params: ApplyDirectPreviewParams): boolean {
  const directPreviewHost = params.directPreviewHostRef.current;
  if (!params.directPreviewPlan || !directPreviewHost) {
    params.directPreviewPlaybackStateRef.current.activeClipId = null;
    params.detachDirectPreviewVideo();
    return false;
  }

  const activeClip = params.getClipAtTime(params.directPreviewPlan.trackId, params.renderTime);
  const directVideoClip = activeClip && activeClip.type === "video" ? activeClip : null;
  const directVideoElement = directVideoClip
    ? params.videoElementsRef.current.get(directVideoClip.id) || null
    : null;

  if (!directVideoClip || !directVideoElement || directVideoElement.readyState < 1) {
    params.directPreviewPlaybackStateRef.current.activeClipId = null;
    params.detachDirectPreviewVideo();
    return false;
  }

  const attachedVideoChanged = params.directPreviewAttachedVideoRef.current !== directVideoElement;
  if (params.directPreviewAttachedVideoRef.current !== directVideoElement) {
    directPreviewHost.replaceChildren(directVideoElement);
    params.directPreviewAttachedVideoRef.current = directVideoElement;
  }

  const directSourceTime = getSourceTime(directVideoClip, params.renderTime);
  const previousClipId = params.directPreviewPlaybackStateRef.current.activeClipId;
  const clipTransitioned = hasDirectPreviewClipTransition(previousClipId, directVideoClip.id);
  params.directPreviewPlaybackStateRef.current.activeClipId = directVideoClip.id;

  if (params.playback.isPlaying) {
    if (
      Number.isFinite(directSourceTime)
      && (attachedVideoChanged || clipTransitioned)
      && Math.abs(directVideoElement.currentTime - directSourceTime) > 0.01
    ) {
      directVideoElement.currentTime = directSourceTime;
    }
    directVideoElement.playbackRate = params.playback.playbackRate * getClipPlaybackSpeed(directVideoClip);
    if (directVideoElement.paused) {
      directVideoElement.play().catch(() => {});
    }
  } else {
    if (Math.abs(directVideoElement.currentTime - directSourceTime) > 0.05) {
      directVideoElement.currentTime = directSourceTime;
    }
    directVideoElement.pause();
  }

  // Audio ownership lives in usePreviewMediaPlaybackSync.
  // For direct preview we reuse the same <video> element for visuals,
  // so forcing mute here causes audible clips to flap between muted/unmuted.

  const clipPosition = resolveClipPositionAtTimelineTime(directVideoClip, params.renderTime);
  const drawPoint = params.vpContentToScreen(clipPosition);
  const drawW = directVideoClip.sourceSize.width * params.scale * getClipScaleX(directVideoClip);
  const drawH = directVideoClip.sourceSize.height * params.scale * getClipScaleY(directVideoClip);
  const rotation = directVideoClip.rotation || 0;

  directPreviewHost.style.display = "block";
  directPreviewHost.style.position = "absolute";
  directPreviewHost.style.inset = "0";
  directPreviewHost.style.pointerEvents = "none";
  directPreviewHost.style.overflow = "hidden";

  directVideoElement.style.position = "absolute";
  directVideoElement.style.left = `${drawPoint.x}px`;
  directVideoElement.style.top = `${drawPoint.y}px`;
  directVideoElement.style.width = `${drawW}px`;
  directVideoElement.style.height = `${drawH}px`;
  directVideoElement.style.opacity = `${Math.max(0, Math.min(1, directVideoClip.opacity / 100))}`;
  directVideoElement.style.objectFit = "fill";
  directVideoElement.style.pointerEvents = "none";
  directVideoElement.style.transformOrigin = "center center";
  directVideoElement.style.transform = rotation === 0 ? "none" : `rotate(${rotation}deg)`;
  return true;
}
