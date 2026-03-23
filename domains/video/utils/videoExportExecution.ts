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
  type DirectVideoSequenceSegmentPlan,
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
  cleanupObjectUrls: string[];
  exportVideoCache: Map<string, HTMLVideoElement>;
}

interface FrameSequenceMetrics {
  seekMs: number;
  captureMs: number;
  writeMs: number;
  audioRenderMs: number;
  encodeMs: number;
}

function appendEvenDimensionPad(filters: string[]): string[] {
  return [...filters, "pad=ceil(iw/2)*2:ceil(ih/2)*2"];
}

function toFfmpegColor(color: string): string {
  return color.startsWith("#") ? `0x${color.slice(1)}` : color;
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

function findExportClipAtTime(
  trackClips: Clip[],
  time: number,
  tolerance: number,
): Clip | null {
  const exactClip = findActiveClipAtTime(trackClips, time);
  if (exactClip) return exactClip;
  if (trackClips.length === 0) return null;

  let lo = 0;
  let hi = trackClips.length - 1;
  let candidate = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (trackClips[mid].startTime <= time) {
      candidate = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const nextClip = trackClips[candidate + 1] ?? null;
  if (
    nextClip
    && Math.abs(nextClip.startTime - time) <= tolerance
    && time < nextClip.startTime + nextClip.duration + tolerance
  ) {
    return nextClip;
  }

  const prevClip = candidate >= 0 ? trackClips[candidate] : null;
  if (
    prevClip
    && Math.abs(time - (prevClip.startTime + prevClip.duration)) <= tolerance
    && time >= prevClip.startTime - tolerance
  ) {
    return prevClip;
  }

  return null;
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

async function preloadExportImages(
  session: VideoExportSession,
  clips: Clip[],
  sourceBlobCache: Map<string, Blob>
): Promise<Map<string, HTMLImageElement>> {
  const imageCache = new Map<string, HTMLImageElement>();
  const imageClips = clips.filter((clip) => clip.type === "image");
  await Promise.all(
    imageClips.map(
      async (clip) =>
        new Promise<void>((resolve) => {
          const img = new Image();
          img.onload = () => {
            imageCache.set(clip.sourceUrl, img);
            resolve();
          };
          img.onerror = () => resolve();
          resolveClipSourceBlob(clip, sourceBlobCache)
            .then((blob) => {
              const objectUrl = URL.createObjectURL(blob);
              session.cleanupObjectUrls.push(objectUrl);
              img.src = objectUrl;
            })
            .catch(() => {
              img.src = clip.sourceUrl;
            });
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

async function preloadExportVideos(
  session: VideoExportSession,
  clips: Clip[],
  sourceBlobCache: Map<string, Blob>
): Promise<void> {
  const videoClips = clips.filter((clip) => clip.type === "video");
  await Promise.all(
    videoClips.map(async (clip) => {
      let video = await loadExportVideoElement(clip.sourceUrl);
      if (!video) {
        try {
          const sourceBlob = await resolveClipSourceBlob(clip, sourceBlobCache);
          const objectUrl = URL.createObjectURL(sourceBlob);
          session.cleanupObjectUrls.push(objectUrl);
          video = await loadExportVideoElement(objectUrl);
        } catch {
          video = null;
        }
      }
      if (video) session.exportVideoCache.set(clip.id, video);
    })
  );
}

export async function runDirectVideoExport(params: {
  session: VideoExportSession;
  decision: ResolvedVideoExportStrategy;
  config: ReturnType<typeof resolveVideoExportConfig>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<CompletedVideoExport> {
  const { session, decision, config, setExportProgress } = params;
  if (decision.strategy !== "direct-single-video" || !decision.directPlan || !decision.sourceBlob) {
    throw new Error("FFmpeg 직접 경로 전략 구성이 올바르지 않습니다.");
  }
  const plan = decision.directPlan;
  if (plan.kind === "sequence") {
    return runDirectVideoSequenceExport({
      session,
      decision,
      config,
      setExportProgress,
      plan,
    });
  }
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
    sourceBlob.type || plan.clip.sourceUrl
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
  const needsCanvasPad =
    plan.outputWidth !== plan.cropWidth ||
    plan.outputHeight !== plan.cropHeight ||
    plan.padX !== 0 ||
    plan.padY !== 0;
  if (needsCanvasPad) {
    videoFilters.push(
      `pad=${plan.outputWidth}:${plan.outputHeight}:${plan.padX}:${plan.padY}:color=${toFfmpegColor(config.backgroundColor)}`
    );
  }
  const directVideoFilters = appendEvenDimensionPad(videoFilters);

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
    const filterSections = [`[0:v]${directVideoFilters.join(",")},format=rgba[${baseVideoLabel}]`];
    let currentLabel = baseVideoLabel;

    plan.overlays.forEach((overlay, index) => {
      const overlayInputIndex = index + 1;
      const overlayLabel = `overlayv${index}`;
      const outputLabel = `compv${index}`;
      const overlayNeedsScale =
        Math.abs(overlay.width - overlay.sourceWidth) > VIDEO_EXPORT_EPSILON ||
        Math.abs(overlay.height - overlay.sourceHeight) > VIDEO_EXPORT_EPSILON;
      const overlayFilters: string[] = [];
      if (overlayNeedsScale) {
        overlayFilters.push(`scale=${overlay.width.toFixed(3)}:${overlay.height.toFixed(3)}`);
      }
      overlayFilters.push("format=rgba");
      if (Math.abs(overlay.opacity - 100) > VIDEO_EXPORT_EPSILON) {
        overlayFilters.push(`colorchannelmixer=aa=${(overlay.opacity / 100).toFixed(6)}`);
      }
      const enableExpr = `between(t\\,${overlay.startTime.toFixed(6)}\\,${overlay.endTime.toFixed(6)})`;

      filterSections.push(`[${overlayInputIndex}:v]${overlayFilters.join(",")}[${overlayLabel}]`);
      filterSections.push(
        `[${currentLabel}][${overlayLabel}]overlay=${overlay.offsetX.toFixed(3)}:${overlay.offsetY.toFixed(3)}:enable='${enableExpr}':eof_action=pass[${outputLabel}]`
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
      directVideoFilters.join(","),
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
      width: plan.outputWidth,
      height: plan.outputHeight,
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

async function runDirectVideoSequenceExport(params: {
  session: VideoExportSession;
  decision: ResolvedVideoExportStrategy;
  config: ReturnType<typeof resolveVideoExportConfig>;
  setExportProgress: (value: ExportProgressState) => void;
  plan: Extract<NonNullable<ResolvedVideoExportStrategy["directPlan"]>, { kind: "sequence" }>;
}): Promise<CompletedVideoExport> {
  const { session, decision, config, setExportProgress, plan } = params;
  if (!decision.sourceBlob) {
    throw new Error("분할 클립 직접 경로 전략 구성이 올바르지 않습니다.");
  }

  const metrics = {
    mountMs: 0,
    encodeMs: 0,
    outputReadMs: 0,
  };

  setExportProgress({
    stage: "Preparing direct export",
    percent: 8,
    detail: `직접 경로 준비 중 · 동일 원본 분할 ${plan.segments.length}개 concat`,
  });

  const sourceBlob = decision.sourceBlob;
  const sourceFileName = `${session.filePrefix}-source.${resolveSourceExtension(
    sourceBlob.type || plan.sourceClip.sourceUrl
  )}`;
  const mountStartedAt = performance.now();
  const sourceInput = await mountBlobToFfmpegFile(session.ffmpeg, sourceFileName, sourceBlob);
  metrics.mountMs = performance.now() - mountStartedAt;
  session.cleanupMountPoints.push(sourceInput.mountPoint);

  const baseArgs: string[] = [];
  const filterSections: string[] = [];
  const concatInputs: string[] = [];
  const hasAudioInput = plan.includeAudio;

  const buildSegmentAudioFilter = (segment: DirectVideoSequenceSegmentPlan, inputIndex: number): string => {
    const audioLabel = `a${inputIndex}`;
    if (!hasAudioInput) {
      return audioLabel;
    }

    if (segment.includeAudio) {
      const audioFilters = ["asetpts=N/SR/TB", ...buildAtempoFilters(segment.clip.playbackSpeed)];
      if (Math.abs(segment.audioVolume - 100) > VIDEO_EXPORT_EPSILON) {
        audioFilters.push(`volume=${(segment.audioVolume / 100).toFixed(6)}`);
      }
      filterSections.push(`[${inputIndex}:a]${audioFilters.join(",")}[${audioLabel}]`);
      return audioLabel;
    }

    filterSections.push(
      `anullsrc=r=44100:cl=stereo,atrim=duration=${segment.timelineDuration.toFixed(6)},asetpts=N/SR/TB[${audioLabel}]`
    );
    return audioLabel;
  };

  plan.segments.forEach((segment, index) => {
    baseArgs.push(
      "-ss",
      segment.sourceStart.toFixed(6),
      "-t",
      segment.sourceDuration.toFixed(6),
      "-probesize",
      "1048576",
      "-analyzeduration",
      "1000000",
      "-i",
      sourceInput.filePath,
    );

    const videoFilters = [`setpts=(PTS-STARTPTS)/${segment.clip.playbackSpeed.toFixed(6)}`];
    const needsCrop =
      segment.cropX !== 0 ||
      segment.cropY !== 0 ||
      segment.cropWidth !== segment.clip.sourceSize.width ||
      segment.cropHeight !== segment.clip.sourceSize.height;
    if (needsCrop) {
      videoFilters.push(
        `crop=${segment.cropWidth}:${segment.cropHeight}:${segment.cropX}:${segment.cropY}`
      );
    }
    const needsCanvasPad =
      plan.outputWidth !== segment.cropWidth ||
      plan.outputHeight !== segment.cropHeight ||
      segment.padX !== 0 ||
      segment.padY !== 0;
    if (needsCanvasPad) {
      videoFilters.push(
        `pad=${plan.outputWidth}:${plan.outputHeight}:${segment.padX}:${segment.padY}:color=${toFfmpegColor(config.backgroundColor)}`
      );
    }
    filterSections.push(
      `[${index}:v]${appendEvenDimensionPad(videoFilters).join(",")}[v${index}]`
    );
    concatInputs.push(`[v${index}]`);
    if (hasAudioInput) {
      concatInputs.push(`[${buildSegmentAudioFilter(segment, index)}]`);
    }
  });

  filterSections.push(
    `${concatInputs.join("")}concat=n=${plan.segments.length}:v=1:a=${hasAudioInput ? 1 : 0}[vout]${hasAudioInput ? "[aout]" : ""}`
  );

  baseArgs.push(
    "-filter_complex",
    filterSections.join(";"),
    "-map",
    "[vout]",
  );

  if (hasAudioInput) {
    baseArgs.push("-map", "[aout]");
  } else {
    baseArgs.push("-an");
  }

  baseArgs.push("-r", String(config.frameRate));

  const encodeStartedAt = performance.now();
  await encodeOutputFile({
    ffmpeg: session.ffmpeg,
    format: config.format,
    baseArgs,
    compressionSettings: config.compressionSettings,
    hasAudioInput,
    outputFileName: session.outputFileName,
    outputSize: {
      width: plan.outputWidth,
      height: plan.outputHeight,
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
  console.info("[VideoExport] direct sequence export metrics", {
    segments: plan.segments.length,
    hasAudioInput,
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
  sourceBlobCache: Map<string, Blob>;
  decision: VideoExportStrategyDecision;
}): Promise<CompletedVideoExport> {
  const {
    session,
    project,
    clips,
    tracks,
    masksMap,
    config,
    setExportProgress,
    audioBufferCache,
    sourceBlobCache,
    decision,
  } = params;
  const totalFrames = Math.max(1, Math.ceil(config.duration * config.frameRate));
  const frameDuration = 1 / Math.max(1, config.frameRate);
  const boundaryTolerance = Math.max(VIDEO_EXPORT_EPSILON, Math.min(frameDuration * 0.25, 0.01));
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
  const exportImageCache = await preloadExportImages(session, clips, sourceBlobCache);
  const exportMaskImgCache = await preloadMaskImages(masksMap);
  await preloadExportVideos(session, clips, sourceBlobCache);

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = project.canvasSize.width;
  exportCanvas.height = project.canvasSize.height;
  const exportCtx = exportCanvas.getContext("2d");
  if (!exportCtx) {
    throw new Error("export canvas unavailable");
  }
  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = "high";

  const committedFrameCanvas = document.createElement("canvas");
  committedFrameCanvas.width = project.canvasSize.width;
  committedFrameCanvas.height = project.canvasSize.height;
  const committedFrameCtx = committedFrameCanvas.getContext("2d");
  if (!committedFrameCtx) {
    throw new Error("export committed canvas unavailable");
  }
  let hasCommittedFrame = false;

  const exportMaskTmpCanvas = document.createElement("canvas");
  exportMaskTmpCanvas.width = project.canvasSize.width;
  exportMaskTmpCanvas.height = project.canvasSize.height;

  const getClipAtTimeForExport = (trackId: string, time: number) => {
    const trackClips = clipsByTrack.get(trackId);
    return trackClips ? findExportClipAtTime(trackClips, time, boundaryTolerance) : null;
  };

  const getMaskAtTimeForExport = (trackId: string, time: number) => {
    const trackMasks = masksByTrack.get(trackId) ?? [];
    return findActiveMaskAtTime(trackMasks, time);
  };

  const seekVideosForFrame = async (time: number) => {
    const pendingVideoSeeks: Promise<boolean>[] = [];
    for (const track of sortedTracks) {
      if (!track.visible) continue;
      const clip = getClipAtTimeForExport(track.id, time);
      if (!clip || !clip.visible || clip.type !== "video") continue;
      const video = session.exportVideoCache.get(clip.id);
      if (!video) continue;
      pendingVideoSeeks.push(seekExportVideoFrame(video, getSourceTime(clip, time)));
    }
    await Promise.all(pendingVideoSeeks);
  };

  const hasExpectedVisualContentAtTime = (time: number) =>
    sortedTracks.some((track) => {
      if (!track.visible) return false;
      const clip = getClipAtTimeForExport(track.id, time);
      return Boolean(clip && clip.visible && clip.type !== "audio");
    });

  const clearExportFrame = () => {
    exportCtx.fillStyle = config.backgroundColor;
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  };

  setExportProgress({
    stage: "Capturing frames",
    percent: 4,
    detail: `0/${totalFrames}`,
  });

  for (let frameIndex = 0; frameIndex < totalFrames; frameIndex += 1) {
    const maxFrameTime = Math.max(config.exportStart, config.exportEnd - 0.5 / config.frameRate);
    const frameTime = Math.min(maxFrameTime, config.exportStart + frameIndex / config.frameRate);
    clearExportFrame();

    const seekStartedAt = performance.now();
    await seekVideosForFrame(frameTime);
    metrics.seekMs += performance.now() - seekStartedAt;

    const captureStartedAt = performance.now();
    const expectedVisualContent = hasExpectedVisualContentAtTime(frameTime);
    let fullyRendered = renderCompositeFrame(exportCtx, {
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

    if (!fullyRendered && expectedVisualContent) {
      const retrySeekStartedAt = performance.now();
      await seekVideosForFrame(frameTime);
      metrics.seekMs += performance.now() - retrySeekStartedAt;
      clearExportFrame();
      fullyRendered = renderCompositeFrame(exportCtx, {
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
    }

    if (fullyRendered) {
      committedFrameCtx.clearRect(0, 0, committedFrameCanvas.width, committedFrameCanvas.height);
      committedFrameCtx.drawImage(exportCanvas, 0, 0);
      hasCommittedFrame = true;
    }

    const frameCanvasToEncode =
      !fullyRendered && expectedVisualContent && hasCommittedFrame
        ? committedFrameCanvas
        : exportCanvas;

    const frameBlob = await canvasToBlob(frameCanvasToEncode, "image/png");
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
      sourceBlobCache,
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
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
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
