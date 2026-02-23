"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { showErrorToast, showInfoToast, showSuccessToast } from "@/shared/components";
import { inpaintFrameWithMiGan, warmupMiGanModel } from "@/shared/ai/miganInpainting";
import {
  getClipScaleX,
  getClipScaleY,
  type Clip,
  type VideoClip,
} from "../types";
import { loadMediaBlob, saveMediaBlob } from "../utils/mediaStorage";
import type { Size } from "@/shared/types";

const SOURCE_TIME_EPSILON = 1e-4;
// Browser-side ONNX + ffmpeg workload guardrail (roughly 8s at 30fps).
const MAX_INPAINT_FRAMES = 240;

interface VideoInpaintTranslationOptions {
  selectVideoClip: string;
  selectMask: string;
  unsupportedTransform: string;
  clipTooLong: string;
  preparing: string;
  loadingModel: string;
  processing: string;
  encoding: string;
  applying: string;
  completed: string;
  failed: string;
}

interface UseVideoInpaintActionsOptions {
  selectedClip: Clip | null;
  inpaintMaskCanvasRef: RefObject<HTMLCanvasElement | null>;
  frameRate: number;
  projectCanvasSize: Size;
  isPlaying: boolean;
  pause: () => void;
  saveToHistory: () => void;
  updateClip: (clipId: string, updates: Partial<Clip>) => void;
  translations: VideoInpaintTranslationOptions;
}

interface UseVideoInpaintActionsResult {
  isInpainting: boolean;
  inpaintProgress: number;
  inpaintStatus: string;
  canInpaint: boolean;
  clearInpaintRegion: () => void;
  handleInpaintClip: () => Promise<void>;
}

function resolveSourceExtension(mimeType: string): string {
  const lower = mimeType.toLowerCase();
  if (lower.includes("webm")) return "webm";
  if (lower.includes("quicktime") || lower.includes("mov")) return "mov";
  if (lower.includes("ogg")) return "ogv";
  return "mp4";
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Failed to encode canvas frame."));
          return;
        }
        resolve(blob);
      },
      type,
    );
  });
}

function loadVideoElementFromBlob(blob: Blob): Promise<{ video: HTMLVideoElement; url: string }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
    };

    video.onloadedmetadata = () => {
      cleanup();
      resolve({ video, url });
    };
    video.onerror = () => {
      cleanup();
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode source video."));
    };
  });
}

function loadVideoMetadataFromBlob(blob: Blob): Promise<{ width: number; height: number; duration: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;
    video.src = url;

    const cleanup = () => {
      video.onloadedmetadata = null;
      video.onerror = null;
      video.pause();
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(url);
    };

    video.onloadedmetadata = () => {
      resolve({
        width: Math.max(1, Math.floor(video.videoWidth || 1)),
        height: Math.max(1, Math.floor(video.videoHeight || 1)),
        duration: Math.max(0, video.duration || 0),
      });
      cleanup();
    };
    video.onerror = () => {
      cleanup();
      reject(new Error("Failed to read video metadata."));
    };
  });
}

async function seekVideoFrame(
  video: HTMLVideoElement,
  targetTime: number,
  timeoutMs: number = 2500,
): Promise<boolean> {
  if (!Number.isFinite(video.duration) || video.duration <= 0) return false;

  const maxTime = Math.max(0, video.duration - SOURCE_TIME_EPSILON);
  const clamped = Math.max(0, Math.min(targetTime, maxTime));
  if (Math.abs(video.currentTime - clamped) <= 0.01) return true;

  return new Promise((resolve) => {
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    }, timeoutMs);

    const cleanup = () => {
      window.clearTimeout(timeout);
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    const onSeeked = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(true);
    };

    const onError = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(false);
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });

    try {
      video.currentTime = clamped;
    } catch {
      settled = true;
      cleanup();
      resolve(false);
    }
  });
}

function describeUnsupportedTransform(clip: VideoClip): string | null {
  if (Math.abs(clip.rotation) > 0.001) {
    return "rotation";
  }

  if (clip.transformKeyframes?.position && clip.transformKeyframes.position.length > 0) {
    return "position keyframe";
  }

  const scaleX = getClipScaleX(clip);
  const scaleY = getClipScaleY(clip);
  if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || scaleX <= 0 || scaleY <= 0) {
    return "scale";
  }

  return null;
}

async function buildHoleMaskForClip(options: {
  clip: VideoClip;
  regionCanvas: HTMLCanvasElement;
  projectCanvasSize: Size;
}): Promise<{ holeMask: Uint8Array; holePixels: number }> {
  const {
    clip,
    regionCanvas,
    projectCanvasSize,
  } = options;

  const sourceWidth = Math.max(1, Math.floor(clip.sourceSize.width));
  const sourceHeight = Math.max(1, Math.floor(clip.sourceSize.height));

  const projectMaskCanvas = document.createElement("canvas");
  projectMaskCanvas.width = Math.max(1, Math.floor(regionCanvas.width || projectCanvasSize.width));
  projectMaskCanvas.height = Math.max(1, Math.floor(regionCanvas.height || projectCanvasSize.height));
  const projectMaskCtx = projectMaskCanvas.getContext("2d");
  if (!projectMaskCtx) {
    throw new Error("Failed to allocate project mask canvas.");
  }

  projectMaskCtx.clearRect(0, 0, projectMaskCanvas.width, projectMaskCanvas.height);
  projectMaskCtx.drawImage(regionCanvas, 0, 0, projectMaskCanvas.width, projectMaskCanvas.height);

  const sourceMaskCanvas = document.createElement("canvas");
  sourceMaskCanvas.width = sourceWidth;
  sourceMaskCanvas.height = sourceHeight;
  const sourceMaskCtx = sourceMaskCanvas.getContext("2d");
  if (!sourceMaskCtx) {
    throw new Error("Failed to allocate source mask canvas.");
  }

  const clipScaleX = getClipScaleX(clip);
  const clipScaleY = getClipScaleY(clip);
  const clipDrawWidth = clip.sourceSize.width * clipScaleX;
  const clipDrawHeight = clip.sourceSize.height * clipScaleY;

  sourceMaskCtx.clearRect(0, 0, sourceWidth, sourceHeight);
  sourceMaskCtx.drawImage(
    projectMaskCanvas,
    clip.position.x,
    clip.position.y,
    clipDrawWidth,
    clipDrawHeight,
    0,
    0,
    sourceWidth,
    sourceHeight,
  );

  const imageData = sourceMaskCtx.getImageData(0, 0, sourceWidth, sourceHeight);
  const holeMask = new Uint8Array(sourceWidth * sourceHeight);

  let holePixels = 0;
  for (let i = 0; i < holeMask.length; i += 1) {
    const alpha = imageData.data[i * 4 + 3];
    const holeValue = alpha < 245 ? 255 : 0;
    holeMask[i] = holeValue;
    if (holeValue > 0) holePixels += 1;
  }

  return { holeMask, holePixels };
}

async function loadSourceBlobForClip(clip: VideoClip): Promise<Blob> {
  const stored = await loadMediaBlob(clip.id);
  if (stored) return stored;

  const response = await fetch(clip.sourceUrl);
  if (!response.ok) {
    throw new Error(`Failed to load clip source (${response.status}).`);
  }

  return response.blob();
}

function clearInpaintMaskCanvas(canvasRef: RefObject<HTMLCanvasElement | null>): void {
  const canvas = canvasRef.current;
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function notifyInpaintRegionUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("artkit:inpaint-region-updated"));
}

export function useVideoInpaintActions(
  options: UseVideoInpaintActionsOptions,
): UseVideoInpaintActionsResult {
  const {
    selectedClip,
    inpaintMaskCanvasRef,
    frameRate,
    projectCanvasSize,
    isPlaying,
    pause,
    saveToHistory,
    updateClip,
    translations: t,
  } = options;

  const ffmpegRef = useRef<import("@ffmpeg/ffmpeg").FFmpeg | null>(null);
  const ffmpegLoadingPromiseRef = useRef<Promise<import("@ffmpeg/ffmpeg").FFmpeg> | null>(null);
  const [isInpainting, setIsInpainting] = useState(false);
  const [inpaintProgress, setInpaintProgress] = useState(0);
  const [inpaintStatus, setInpaintStatus] = useState("");

  const getFFmpeg = useCallback(async (): Promise<import("@ffmpeg/ffmpeg").FFmpeg> => {
    if (ffmpegRef.current) return ffmpegRef.current;
    if (ffmpegLoadingPromiseRef.current) return ffmpegLoadingPromiseRef.current;

    ffmpegLoadingPromiseRef.current = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);

      const ffmpeg = new FFmpeg();
      const baseURL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
      await ffmpeg.load({
        coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
        wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
      });

      ffmpegRef.current = ffmpeg;
      return ffmpeg;
    })();

    try {
      return await ffmpegLoadingPromiseRef.current;
    } finally {
      ffmpegLoadingPromiseRef.current = null;
    }
  }, []);

  const canInpaint = useMemo(() => {
    return Boolean(selectedClip && selectedClip.type === "video" && !isInpainting);
  }, [selectedClip, isInpainting]);

  const clearInpaintRegion = useCallback(() => {
    clearInpaintMaskCanvas(inpaintMaskCanvasRef);
    notifyInpaintRegionUpdated();
  }, [inpaintMaskCanvasRef]);

  const handleInpaintClip = useCallback(async () => {
    if (isInpainting) return;

    if (!selectedClip || selectedClip.type !== "video") {
      showInfoToast(t.selectVideoClip);
      return;
    }

    const clip = selectedClip;

    const unsupported = describeUnsupportedTransform(clip);
    if (unsupported) {
      showInfoToast(`${t.unsupportedTransform} (${unsupported})`);
      return;
    }

    const totalFrames = Math.max(1, Math.ceil(clip.duration * Math.max(1, frameRate)));
    if (totalFrames > MAX_INPAINT_FRAMES) {
      showInfoToast(`${t.clipTooLong} (${totalFrames}/${MAX_INPAINT_FRAMES} frames)`);
      return;
    }

    const inpaintRegionCanvas = inpaintMaskCanvasRef.current;
    if (!inpaintRegionCanvas || inpaintRegionCanvas.width <= 0 || inpaintRegionCanvas.height <= 0) {
      showInfoToast(t.selectMask);
      return;
    }

    const filePrefix = `migan-${Date.now()}-${Math.round(Math.random() * 10000)}`;
    const outputFileName = `${filePrefix}.mp4`;
    const frameNames: string[] = [];
    let sourceFileName = `${filePrefix}-source.mp4`;

    let sourceBlob: Blob | null = null;
    let sourceVideoUrl: string | null = null;
    let sourceVideoElement: HTMLVideoElement | null = null;

    try {
      if (isPlaying) pause();

      setIsInpainting(true);
      setInpaintProgress(2);
      setInpaintStatus(t.preparing);

      await warmupMiGanModel({
        onProgress: (progress) => {
          setInpaintProgress(Math.max(3, Math.min(18, progress * 0.15 + 3)));
          setInpaintStatus(t.loadingModel);
        },
      });

      sourceBlob = await loadSourceBlobForClip(clip);
      sourceFileName = `${filePrefix}-source.${resolveSourceExtension(sourceBlob.type || clip.sourceUrl)}`;
      const sourceMeta = await loadVideoMetadataFromBlob(sourceBlob);
      const sourceWidth = Math.max(1, Math.floor(sourceMeta.width || clip.sourceSize.width));
      const sourceHeight = Math.max(1, Math.floor(sourceMeta.height || clip.sourceSize.height));

      const effectiveClip = {
        ...clip,
        sourceSize: { width: sourceWidth, height: sourceHeight },
      };

      const { holeMask, holePixels } = await buildHoleMaskForClip({
        clip: effectiveClip,
        regionCanvas: inpaintRegionCanvas,
        projectCanvasSize,
      });

      if (holePixels === 0) {
        showInfoToast(t.selectMask);
        return;
      }

      const loadedVideo = await loadVideoElementFromBlob(sourceBlob);
      sourceVideoElement = loadedVideo.video;
      sourceVideoUrl = loadedVideo.url;

      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = sourceWidth;
      frameCanvas.height = sourceHeight;
      const frameCtx = frameCanvas.getContext("2d", { willReadFrequently: true });
      if (!frameCtx) {
        throw new Error("Failed to create frame canvas context.");
      }

      setInpaintProgress(20);
      setInpaintStatus(t.preparing);

      const ffmpeg = await getFFmpeg();
      await ffmpeg.writeFile(sourceFileName, new Uint8Array(await sourceBlob.arrayBuffer()));

      for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
        const localTime = Math.min(
          Math.max(0, clip.duration - 0.5 / Math.max(1, frameRate)),
          frameIndex / Math.max(1, frameRate),
        );
        const sourceTime = clip.trimIn + localTime;
        const seekOk = await seekVideoFrame(sourceVideoElement, sourceTime);
        if (!seekOk) {
          throw new Error(`Failed to seek source video at ${sourceTime.toFixed(3)}s.`);
        }

        frameCtx.clearRect(0, 0, sourceWidth, sourceHeight);
        frameCtx.drawImage(sourceVideoElement, 0, 0, sourceWidth, sourceHeight);

        const currentFrame = frameCtx.getImageData(0, 0, sourceWidth, sourceHeight);
        const inpaintedRgba = await inpaintFrameWithMiGan({
          rgba: currentFrame.data,
          holeMask,
          width: sourceWidth,
          height: sourceHeight,
        });

        currentFrame.data.set(inpaintedRgba);
        frameCtx.putImageData(currentFrame, 0, 0);

        const frameBlob = await canvasToBlob(frameCanvas, "image/png");
        const frameName = `${filePrefix}-frame-${String(frameIndex).padStart(6, "0")}.png`;
        frameNames.push(frameName);

        await ffmpeg.writeFile(frameName, new Uint8Array(await frameBlob.arrayBuffer()));

        if (frameIndex % 2 === 0 || frameIndex === totalFrames - 1) {
          const ratio = (frameIndex + 1) / totalFrames;
          setInpaintProgress(Math.min(84, 22 + ratio * 62));
          setInpaintStatus(`${t.processing} (${frameIndex + 1}/${totalFrames})`);
        }
      }

      setInpaintProgress(86);
      setInpaintStatus(t.encoding);

      const argsWithAudio = [
        "-framerate",
        String(Math.max(1, frameRate)),
        "-i",
        `${filePrefix}-frame-%06d.png`,
        "-i",
        sourceFileName,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0?",
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        outputFileName,
      ];

      const argsWithoutAudio = [
        "-framerate",
        String(Math.max(1, frameRate)),
        "-i",
        `${filePrefix}-frame-%06d.png`,
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        outputFileName,
      ];

      let encodedWithAudio = false;
      try {
        const audioExit = await ffmpeg.exec(argsWithAudio);
        if (audioExit !== 0) {
          throw new Error(`ffmpeg exited with code ${audioExit}`);
        }
        encodedWithAudio = true;
      } catch {
        await ffmpeg.deleteFile(outputFileName).catch(() => {});
        const fallbackExit = await ffmpeg.exec(argsWithoutAudio);
        if (fallbackExit !== 0) {
          throw new Error(`ffmpeg exited with code ${fallbackExit}`);
        }
      }

      const outputData = await ffmpeg.readFile(outputFileName);
      if (typeof outputData === "string") {
        throw new Error("Encoded clip output was not binary data.");
      }
      const outputBytes = outputData instanceof Uint8Array ? outputData : new Uint8Array(outputData);
      const outputCopy = new Uint8Array(outputBytes);
      const outputBlob = new Blob([outputCopy.buffer], { type: "video/mp4" });

      setInpaintProgress(94);
      setInpaintStatus(t.applying);

      await saveMediaBlob(clip.id, outputBlob);
      const outputMetadata = await loadVideoMetadataFromBlob(outputBlob);
      const outputUrl = URL.createObjectURL(outputBlob);
      const outputDuration = Math.max(0.001, outputMetadata.duration || clip.sourceDuration || clip.duration);

      const minimumDuration = Math.max(1 / Math.max(1, frameRate), 0.001);
      const nextTrimIn = Math.max(0, Math.min(clip.trimIn, Math.max(0, outputDuration - minimumDuration)));
      const nextTrimOutBase = Math.max(nextTrimIn + minimumDuration, Math.min(outputDuration, clip.trimOut));
      const nextDuration = Math.min(clip.duration, Math.max(minimumDuration, nextTrimOutBase - nextTrimIn));
      const nextTrimOut = Math.min(outputDuration, nextTrimIn + nextDuration);

      saveToHistory();
      updateClip(clip.id, {
        sourceUrl: outputUrl,
        sourceDuration: outputDuration,
        sourceSize: {
          width: Math.max(1, Math.floor(outputMetadata.width || sourceWidth)),
          height: Math.max(1, Math.floor(outputMetadata.height || sourceHeight)),
        },
        trimIn: nextTrimIn,
        trimOut: nextTrimOut,
        duration: nextDuration,
        hasAudio: encodedWithAudio && clip.hasAudio,
        audioMuted: encodedWithAudio ? clip.audioMuted : true,
      });

      setInpaintProgress(100);
      setInpaintStatus(t.completed);
      showSuccessToast(t.completed);
      clearInpaintMaskCanvas(inpaintMaskCanvasRef);
      notifyInpaintRegionUpdated();
    } catch (error) {
      console.error("Video inpaint failed:", error);
      const message = (error as Error).message;
      showErrorToast(`${t.failed}: ${message}`);
      setInpaintStatus(t.failed);
    } finally {
      try {
        const ffmpeg = ffmpegRef.current;
        if (ffmpeg) {
          await ffmpeg.deleteFile(outputFileName).catch(() => {});
          await ffmpeg.deleteFile(sourceFileName).catch(() => {});
          for (const frameName of frameNames) {
            await ffmpeg.deleteFile(frameName).catch(() => {});
          }
        }
      } catch {
        // best-effort cleanup
      }

      if (sourceVideoElement) {
        sourceVideoElement.pause();
        sourceVideoElement.removeAttribute("src");
        sourceVideoElement.load();
      }
      if (sourceVideoUrl) {
        URL.revokeObjectURL(sourceVideoUrl);
      }

      setIsInpainting(false);
      window.setTimeout(() => {
        setInpaintProgress(0);
        setInpaintStatus("");
      }, 1200);
    }
  }, [
    isInpainting,
    selectedClip,
    t,
    inpaintMaskCanvasRef,
    frameRate,
    projectCanvasSize,
    getFFmpeg,
    isPlaying,
    pause,
    saveToHistory,
    updateClip,
  ]);

  return {
    isInpainting,
    inpaintProgress,
    inpaintStatus,
    canInpaint,
    clearInpaintRegion,
    handleInpaintClip,
  };
}
