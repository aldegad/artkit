import { renderCompositeFrame } from "./compositeRenderer";
import type { Size } from "@/shared/types";
import {
  type Clip,
  getSourceTime,
  type MaskData,
  type VideoProject,
  type VideoTrack,
} from "../types";
import {
  audioBufferToWavBlob,
  buildAtempoFilters,
  canvasToBlob,
  findActiveClipAtTime,
  findActiveMaskAtTime,
  renderTimelineAudioBuffer,
  resolveSourceExtension,
  resolveVideoExportConfig,
  VIDEO_EXPORT_EPSILON,
} from "./videoExportHelpers";
import {
  encodeOutputFile,
  loadExportVideoElement,
  mountBlobToFfmpegFile,
  readBinaryOutputFile,
  resolveClipSourceBlob,
  seekExportVideoFrame,
  unmountFfmpegMountPoint,
  writeBlobToFfmpegFile,
} from "./videoExportIO";
import type {
  CompletedVideoExport,
  ExportProgressState,
  VideoExportStrategyDecision,
} from "./videoExportTypes";
import type { ResolvedVideoExportStrategy } from "./videoExportStrategy";

interface TimedTrackMask {
  startTime: number;
  endTime: number;
  maskData: string;
}

export interface VideoExportSession {
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg;
  filePrefix: string;
  outputFileName: string;
  wavFileName: string;
  cleanupFileNames: string[];
  cleanupMountPoints: string[];
  exportVideoCache: Map<string, HTMLVideoElement>;
}

interface FrameSequenceMetrics {
  seekMs: number;
  captureMs: number;
  writeMs: number;
  audioRenderMs: number;
  encodeMs: number;
}

function finalizeVideoExport(params: {
  outputBytes: Uint8Array;
  config: ReturnType<typeof resolveVideoExportConfig>;
  hasAudioInput: boolean;
}): CompletedVideoExport {
  const { outputBytes, config, hasAudioInput } = params;
  return {
    outputBytes,
    hasAudioInput,
    format: config.format,
    compression: config.compression,
    duration: config.duration,
    hasCustomRange: config.hasCustomRange,
    outputMimeType: config.outputMimeType,
  };
}

function buildClipIndex(clips: Clip[]): Map<string, Clip[]> {
  const clipsByTrack = new Map<string, Clip[]>();
  for (const clip of clips) {
    const list = clipsByTrack.get(clip.trackId);
    if (list) {
      list.push(clip);
    } else {
      clipsByTrack.set(clip.trackId, [clip]);
    }
  }

  for (const trackClips of clipsByTrack.values()) {
    trackClips.sort((a, b) => a.startTime - b.startTime);
  }

  return clipsByTrack;
}

function buildMaskIndex(masksMap: Map<string, MaskData>): Map<string, TimedTrackMask[]> {
  const masksByTrack = new Map<string, TimedTrackMask[]>();
  for (const mask of masksMap.values()) {
    if (!mask.maskData) continue;
    const timedMask = {
      startTime: mask.startTime,
      endTime: mask.startTime + mask.duration,
      maskData: mask.maskData,
    };
    const list = masksByTrack.get(mask.trackId);
    if (list) {
      list.push(timedMask);
    } else {
      masksByTrack.set(mask.trackId, [timedMask]);
    }
  }

  for (const trackMasks of masksByTrack.values()) {
    trackMasks.sort((a, b) => a.startTime - b.startTime);
  }

  return masksByTrack;
}

async function preloadExportImages(clips: Clip[]): Promise<Map<string, HTMLImageElement>> {
  const imageCache = new Map<string, HTMLImageElement>();
  const imageClips = clips.filter((clip) => clip.type === "image");
  await Promise.all(
    imageClips.map(
      (clip) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imageCache.set(clip.sourceUrl, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = clip.sourceUrl;
        })
    )
  );
  return imageCache;
}

async function preloadMaskImages(masksMap: Map<string, MaskData>): Promise<Map<string, HTMLImageElement>> {
  const maskCache = new Map<string, HTMLImageElement>();
  const maskDataUrls = new Set<string>();
  for (const mask of masksMap.values()) {
    if (mask.maskData) maskDataUrls.add(mask.maskData);
  }

  await Promise.all(
    [...maskDataUrls].map(
      (data) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            maskCache.set(data, img);
            resolve();
          };
          img.onerror = () => resolve();
          img.src = data;
        })
    )
  );
  return maskCache;
}

async function preloadExportVideos(session: VideoExportSession, clips: Clip[]): Promise<void> {
  const videoClips = clips.filter((clip) => clip.type === "video");
  await Promise.all(
    videoClips.map(async (clip) => {
      const video = await loadExportVideoElement(clip.sourceUrl);
      if (video) session.exportVideoCache.set(clip.id, video);
    })
  );
}

export async function runDirectVideoExport(params: {
  session: VideoExportSession;
  decision: ResolvedVideoExportStrategy;
  config: ReturnType<typeof resolveVideoExportConfig>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<CompletedVideoExport | null> {
  const { session, decision, config, setExportProgress } = params;
  if (decision.strategy !== "direct-single-video" || !decision.directPlan || !decision.sourceBlob) {
    return null;
  }
  const plan = decision.directPlan;
  const metrics = {
    mountMs: 0,
    encodeMs: 0,
    outputReadMs: 0,
  };

  setExportProgress({
    stage: "Preparing direct export",
    percent: 8,
    detail: `직접 경로 준비 중 · ${decision.subStrategy === "copy" ? "stream copy" : "re-encode"}`,
  });

  const sourceBlob = decision.sourceBlob;
  const sourceFileName = `${session.filePrefix}-source.${resolveSourceExtension(
    sourceBlob.type || decision.sourceExtension || plan.clip.sourceUrl
  )}`;
  const mountStartedAt = performance.now();
  const sourceInput = await mountBlobToFfmpegFile(session.ffmpeg, sourceFileName, sourceBlob);
  metrics.mountMs = performance.now() - mountStartedAt;
  session.cleanupMountPoints.push(sourceInput.mountPoint);

  const seekTime = plan.sourceStart.toFixed(6);
  const seekDuration = plan.sourceDuration.toFixed(6);
  const videoFilters = [`setpts=(PTS-STARTPTS)/${plan.clip.playbackSpeed.toFixed(6)}`];
  const needsCrop =
    plan.cropX !== 0 ||
    plan.cropY !== 0 ||
    plan.cropWidth !== plan.clip.sourceSize.width ||
    plan.cropHeight !== plan.clip.sourceSize.height;
  if (needsCrop) {
    videoFilters.push(`crop=${plan.cropWidth}:${plan.cropHeight}:${plan.cropX}:${plan.cropY}`);
  }

  if (decision.subStrategy === "copy") {
    setExportProgress({
      stage: `Encoding ${config.format.toUpperCase()}`,
      percent: 72,
      detail: "stream copy 중...",
      phasePercent: 0,
      isIndeterminate: true,
    });
    const copyArgs = [
      "-ss",
      seekTime,
      "-t",
      seekDuration,
      "-probesize",
      "1048576",
      "-analyzeduration",
      "1000000",
      "-i",
      sourceInput.filePath,
      "-map",
      "0:v:0",
      ...(plan.includeAudio ? ["-map", "0:a:0?"] : ["-an"]),
      "-c",
      "copy",
      ...(config.format === "mov" || config.format === "mp4" ? ["-movflags", "+faststart"] : []),
      session.outputFileName,
    ];
    const encodeStartedAt = performance.now();
    const exitCode = await session.ffmpeg.exec(copyArgs);
    metrics.encodeMs = performance.now() - encodeStartedAt;
    if (exitCode !== 0) {
      throw new Error(`ffmpeg exited with code ${exitCode} during stream copy`);
    }
    const outputReadStartedAt = performance.now();
    const outputBytes = await readBinaryOutputFile(session.ffmpeg, session.outputFileName);
    metrics.outputReadMs = performance.now() - outputReadStartedAt;
    console.info("[VideoExport] direct export metrics", {
      subStrategy: decision.subStrategy,
      ...metrics,
    });
    return finalizeVideoExport({ outputBytes, config, hasAudioInput: plan.includeAudio });
  }

  const baseArgs = [
    "-ss",
    seekTime,
    "-t",
    seekDuration,
    "-probesize",
    "1048576",
    "-analyzeduration",
    "1000000",
    "-i",
    sourceInput.filePath,
  ];

  if (plan.overlays.length > 0) {
    for (const [index, overlay] of plan.overlays.entries()) {
      const overlayBlob = await resolveClipSourceBlob(overlay.clip, new Map<string, Blob>());
      const overlayInput = await mountBlobToFfmpegFile(
        session.ffmpeg,
        `${session.filePrefix}-overlay-${index}.${resolveSourceExtension(overlayBlob.type || overlay.clip.sourceUrl)}`,
        overlayBlob
      );
      session.cleanupMountPoints.push(overlayInput.mountPoint);
      baseArgs.push("-loop", "1", "-i", overlayInput.filePath);
    }
  }

  if (plan.overlays.length > 0) {
    const baseVideoLabel = "basev0";
    const filterSections = [`[0:v]${videoFilters.join(",")},format=rgba[${baseVideoLabel}]`];
    let currentLabel = baseVideoLabel;

    plan.overlays.forEach((overlay, index) => {
      const overlayInputIndex = index + 1;
      const overlayLabel = `overlayv${index}`;
      const outputLabel = `compv${index}`;
      const opacityFilters = Math.abs(overlay.opacity - 100) > VIDEO_EXPORT_EPSILON
        ? `format=rgba,colorchannelmixer=aa=${(overlay.opacity / 100).toFixed(6)}`
        : "format=rgba";
      const enableExpr = `between(t\\,${overlay.startTime.toFixed(6)}\\,${overlay.endTime.toFixed(6)})`;

      filterSections.push(`[${overlayInputIndex}:v]${opacityFilters}[${overlayLabel}]`);
      filterSections.push(
        `[${currentLabel}][${overlayLabel}]overlay=${overlay.offsetX}:${overlay.offsetY}:enable='${enableExpr}':eof_action=pass[${outputLabel}]`
      );
      currentLabel = outputLabel;
    });

    baseArgs.push(
      "-filter_complex",
      filterSections.join(";"),
      "-map",
      `[${currentLabel}]`,
      "-r",
      String(config.frameRate)
    );
  } else {
    baseArgs.push(
      "-map",
      "0:v:0",
      "-vf",
      videoFilters.join(","),
      "-r",
      String(config.frameRate)
    );
  }

  let hasAudioInput = false;
  if (plan.includeAudio) {
    const audioFilters = ["asetpts=N/SR/TB", ...buildAtempoFilters(plan.clip.playbackSpeed)];
    if (Math.abs(plan.audioVolume - 100) > 1e-3) {
      audioFilters.push(`volume=${(plan.audioVolume / 100).toFixed(6)}`);
    }
    baseArgs.push("-map", "0:a:0?", "-af", audioFilters.join(","));
    hasAudioInput = true;
  }

  const encodeStartedAt = performance.now();
  await encodeOutputFile({
    ffmpeg: session.ffmpeg,
    format: config.format,
    baseArgs,
    compressionSettings: config.compressionSettings,
    hasAudioInput,
    outputFileName: session.outputFileName,
    outputSize: {
      width: plan.cropWidth,
      height: plan.cropHeight,
    },
    videoTune: "fastdecode",
    preferFastEncoding: true,
    encodeBase: 70,
    encodeWeight: 28,
    setExportProgress,
  });
  metrics.encodeMs = performance.now() - encodeStartedAt;

  const outputReadStartedAt = performance.now();
  const outputBytes = await readBinaryOutputFile(session.ffmpeg, session.outputFileName);
  metrics.outputReadMs = performance.now() - outputReadStartedAt;
  console.info("[VideoExport] direct export metrics", {
    subStrategy: decision.subStrategy,
    overlays: plan.overlays.length,
    ...metrics,
  });
  return finalizeVideoExport({ outputBytes, config, hasAudioInput });
}

export async function runFrameSequenceExport(params: {
  session: VideoExportSession;
  project: VideoProject;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  config: ReturnType<typeof resolveVideoExportConfig>;
  setExportProgress: (value: ExportProgressState) => void;
  audioBufferCache: Map<string, AudioBuffer | null>;
  decision: VideoExportStrategyDecision;
}): Promise<CompletedVideoExport> {
  const { session, project, clips, tracks, masksMap, config, setExportProgress, audioBufferCache, decision } = params;
  const totalFrames = Math.max(1, Math.ceil(config.duration * config.frameRate));
  const captureWeight = 65;
  const encodeBase = 70;
  const encodeWeight = 28;
  const metrics: FrameSequenceMetrics = {
    seekMs: 0,
    captureMs: 0,
    writeMs: 0,
    audioRenderMs: 0,
    encodeMs: 0,
  };
  const sortedTracks = [...tracks].reverse();
  const clipsByTrack = buildClipIndex(clips);
  const masksByTrack = buildMaskIndex(masksMap);
  const exportImageCache = await preloadExportImages(clips);
  const exportMaskImgCache = await preloadMaskImages(masksMap);
  await preloadExportVideos(session, clips);

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = project.canvasSize.width;
  exportCanvas.height = project.canvasSize.height;
  const exportCtx = exportCanvas.getContext("2d");
  if (!exportCtx) {
    throw new Error("export canvas unavailable");
  }
  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = "high";

  const exportMaskTmpCanvas = document.createElement("canvas");
  exportMaskTmpCanvas.width = project.canvasSize.width;
  exportMaskTmpCanvas.height = project.canvasSize.height;

  const getClipAtTimeForExport = (trackId: string, time: number) => {
    const trackClips = clipsByTrack.get(trackId);
    return trackClips ? findActiveClipAtTime(trackClips, time) : null;
  };

  const getMaskAtTimeForExport = (trackId: string, time: number) => {
    const trackMasks = masksByTrack.get(trackId) ?? [];
    return findActiveMaskAtTime(trackMasks, time);
  };

  setExportProgress({
    stage: "Capturing frames",
    percent: 4,
    detail: `0/${totalFrames}`,
  });

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const maxFrameTime = Math.max(config.exportStart, config.exportEnd - 0.5 / config.frameRate);
    const frameTime = Math.min(maxFrameTime, config.exportStart + frameIndex / config.frameRate);
    exportCtx.fillStyle = config.backgroundColor;
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);

    const pendingVideoSeeks: Promise<boolean>[] = [];
    const seekStartedAt = performance.now();
    for (const track of sortedTracks) {
      if (!track.visible) continue;
      const clip = getClipAtTimeForExport(track.id, frameTime);
      if (!clip || !clip.visible || clip.type !== "video") continue;
      const video = session.exportVideoCache.get(clip.id);
      if (!video) continue;
      pendingVideoSeeks.push(seekExportVideoFrame(video, getSourceTime(clip, frameTime)));
    }
    await Promise.all(pendingVideoSeeks);
    metrics.seekMs += performance.now() - seekStartedAt;

    const captureStartedAt = performance.now();
    renderCompositeFrame(exportCtx, {
      time: frameTime,
      tracks,
      getClipAtTime: getClipAtTimeForExport,
      getMaskAtTimeForTrack: getMaskAtTimeForExport,
      videoElements: session.exportVideoCache,
      imageCache: exportImageCache,
      maskImageCache: exportMaskImgCache,
      maskTempCanvas: exportMaskTmpCanvas,
      projectSize: project.canvasSize as Size,
      renderRect: { x: 0, y: 0, width: exportCanvas.width, height: exportCanvas.height },
      isPlaying: false,
      preSeekVerified: true,
    });

    const frameBlob = await canvasToBlob(exportCanvas, "image/png");
    metrics.captureMs += performance.now() - captureStartedAt;
    const frameName = `${session.filePrefix}-frame-${String(frameIndex).padStart(6, "0")}.png`;
    session.cleanupFileNames.push(frameName);
    const writeStartedAt = performance.now();
    await writeBlobToFfmpegFile(session.ffmpeg, frameName, frameBlob);
    metrics.writeMs += performance.now() - writeStartedAt;

    if (frameIndex % 3 === 0 || frameIndex === totalFrames - 1) {
      const ratio = (frameIndex + 1) / totalFrames;
      setExportProgress({
        stage: "Capturing frames",
        percent: Math.min(4 + ratio * captureWeight, 69),
        detail: `${frameIndex + 1}/${totalFrames}`,
      });
    }
  }

  let hasAudioInput = false;
  if (config.includeAudio) {
    setExportProgress({
      stage: "Rendering audio",
      percent: 70,
      detail: "Mixing timeline audio...",
    });
    const audioRenderStartedAt = performance.now();
    const mixedAudio = await renderTimelineAudioBuffer({
      clips,
      tracks,
      timelineStart: config.exportStart,
      projectDuration: config.duration,
      sourceBufferCache: audioBufferCache,
    });
    metrics.audioRenderMs += performance.now() - audioRenderStartedAt;
    if (mixedAudio) {
      session.cleanupFileNames.push(session.wavFileName);
      await writeBlobToFfmpegFile(session.ffmpeg, session.wavFileName, audioBufferToWavBlob(mixedAudio));
      hasAudioInput = true;
    }
  }

  const baseArgs = [
    "-framerate",
    String(config.frameRate),
    "-i",
    `${session.filePrefix}-frame-%06d.png`,
    ...(hasAudioInput ? ["-i", session.wavFileName] : []),
  ];

  const encodeStartedAt = performance.now();
  await encodeOutputFile({
    ffmpeg: session.ffmpeg,
    format: config.format,
    baseArgs,
    compressionSettings: config.compressionSettings,
    hasAudioInput,
    outputFileName: session.outputFileName,
    outputSize: {
      width: project.canvasSize.width,
      height: project.canvasSize.height,
    },
    videoTune: "animation",
    encodeBase,
    encodeWeight,
    setExportProgress,
  });
  metrics.encodeMs = performance.now() - encodeStartedAt;

  const outputBytes = await readBinaryOutputFile(session.ffmpeg, session.outputFileName);
  console.info("[VideoExport] frame-sequence metrics", {
    strategy: decision.strategy,
    totalFrames,
    metrics,
  });
  return finalizeVideoExport({ outputBytes, config, hasAudioInput });
}
