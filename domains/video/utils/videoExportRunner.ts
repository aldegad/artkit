import { renderCompositeFrame } from "./compositeRenderer";
import type { Size } from "@/shared/types";
import { trackEvent } from "@/shared/utils/analytics";
import {
  type Clip,
  getSourceTime,
  type MaskData,
  type PlaybackState,
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
  resolveDirectVideoExportPlan,
  resolveSourceExtension,
  resolveVideoExportConfig,
} from "./videoExportHelpers";
import {
  cloneToArrayBuffer,
  encodeOutputFile,
  loadExportVideoElement,
  readBinaryOutputFile,
  resolveClipSourceBlob,
  seekExportVideoFrame,
  writeBlobToFfmpegFile,
} from "./videoExportIO";
import type {
  CompletedVideoExport,
  ExportProgressState,
  VideoExportOptions,
} from "./videoExportTypes";

interface TimedTrackMask {
  startTime: number;
  endTime: number;
  maskData: string;
}

interface VideoExportSession {
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg;
  filePrefix: string;
  outputFileName: string;
  wavFileName: string;
  cleanupFileNames: string[];
  exportVideoCache: Map<string, HTMLVideoElement>;
}

interface RunVideoExportParams {
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg;
  project: VideoProject;
  playback: PlaybackState;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  exportOptions?: VideoExportOptions;
  setExportProgress: (value: ExportProgressState) => void;
  audioBufferCache: Map<string, AudioBuffer | null>;
}

function createVideoExportSession(
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg,
  format: "mp4" | "mov"
): VideoExportSession {
  const filePrefix = `export-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const outputFileName = `${filePrefix}.${format}`;
  return {
    ffmpeg,
    filePrefix,
    outputFileName,
    wavFileName: `${filePrefix}.wav`,
    cleanupFileNames: [outputFileName],
    exportVideoCache: new Map<string, HTMLVideoElement>(),
  };
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

async function runDirectVideoExport(params: {
  session: VideoExportSession;
  project: VideoProject;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  config: ReturnType<typeof resolveVideoExportConfig>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<CompletedVideoExport | null> {
  const { session, project, clips, tracks, masksMap, config, setExportProgress } = params;
  const plan = resolveDirectVideoExportPlan({
    clips,
    tracks,
    masksMap,
    project,
    exportStart: config.exportStart,
    exportEnd: config.exportEnd,
    includeAudio: config.includeAudio,
  });
  if (!plan) return null;

  setExportProgress({
    stage: "Preparing direct export",
    percent: 8,
    detail: "Loading source media...",
  });

  const sourceBlob = await resolveClipSourceBlob(plan.clip);
  const sourceFileName = `${session.filePrefix}-source.${resolveSourceExtension(
    sourceBlob.type || plan.clip.sourceUrl
  )}`;
  session.cleanupFileNames.push(sourceFileName);
  await writeBlobToFfmpegFile(session.ffmpeg, sourceFileName, sourceBlob);

  const videoFilters = [
    `trim=start=${plan.sourceStart.toFixed(6)}:duration=${plan.sourceDuration.toFixed(6)}`,
    `setpts=(PTS-STARTPTS)/${plan.clip.playbackSpeed.toFixed(6)}`,
  ];
  const needsCrop =
    plan.cropX !== 0 ||
    plan.cropY !== 0 ||
    plan.cropWidth !== plan.clip.sourceSize.width ||
    plan.cropHeight !== plan.clip.sourceSize.height;
  if (needsCrop) {
    videoFilters.push(`crop=${plan.cropWidth}:${plan.cropHeight}:${plan.cropX}:${plan.cropY}`);
  }

  const baseArgs = [
    "-i",
    sourceFileName,
    "-map",
    "0:v:0",
    "-vf",
    videoFilters.join(","),
    "-r",
    String(config.frameRate),
  ];

  let hasAudioInput = false;
  if (plan.includeAudio) {
    const audioFilters = [
      `atrim=start=${plan.sourceStart.toFixed(6)}:duration=${plan.sourceDuration.toFixed(6)}`,
      "asetpts=N/SR/TB",
      ...buildAtempoFilters(plan.clip.playbackSpeed),
    ];
    if (Math.abs(plan.audioVolume - 100) > 1e-3) {
      audioFilters.push(`volume=${(plan.audioVolume / 100).toFixed(6)}`);
    }
    baseArgs.push("-map", "0:a:0?", "-af", audioFilters.join(","));
    hasAudioInput = true;
  }

  await encodeOutputFile({
    ffmpeg: session.ffmpeg,
    format: config.format,
    baseArgs,
    compressionSettings: config.compressionSettings,
    hasAudioInput,
    outputFileName: session.outputFileName,
    encodeBase: 70,
    encodeWeight: 28,
    setExportProgress,
  });

  const outputBytes = await readBinaryOutputFile(session.ffmpeg, session.outputFileName);
  return finalizeVideoExport({ outputBytes, config, hasAudioInput });
}

async function runFrameSequenceExport(params: {
  session: VideoExportSession;
  project: VideoProject;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  config: ReturnType<typeof resolveVideoExportConfig>;
  setExportProgress: (value: ExportProgressState) => void;
  audioBufferCache: Map<string, AudioBuffer | null>;
}): Promise<CompletedVideoExport> {
  const { session, project, clips, tracks, masksMap, config, setExportProgress, audioBufferCache } = params;
  const totalFrames = Math.max(1, Math.ceil(config.duration * config.frameRate));
  const captureWeight = 65;
  const encodeBase = 70;
  const encodeWeight = 28;
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
    for (const track of sortedTracks) {
      if (!track.visible) continue;
      const clip = getClipAtTimeForExport(track.id, frameTime);
      if (!clip || !clip.visible || clip.type !== "video") continue;
      const video = session.exportVideoCache.get(clip.id);
      if (!video) continue;
      pendingVideoSeeks.push(seekExportVideoFrame(video, getSourceTime(clip, frameTime)));
    }
    await Promise.all(pendingVideoSeeks);

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
    const frameName = `${session.filePrefix}-frame-${String(frameIndex).padStart(6, "0")}.png`;
    session.cleanupFileNames.push(frameName);
    await writeBlobToFfmpegFile(session.ffmpeg, frameName, frameBlob);

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
    const mixedAudio = await renderTimelineAudioBuffer({
      clips,
      tracks,
      timelineStart: config.exportStart,
      projectDuration: config.duration,
      sourceBufferCache: audioBufferCache,
    });
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

  await encodeOutputFile({
    ffmpeg: session.ffmpeg,
    format: config.format,
    baseArgs,
    compressionSettings: config.compressionSettings,
    hasAudioInput,
    outputFileName: session.outputFileName,
    encodeBase,
    encodeWeight,
    setExportProgress,
  });

  const outputBytes = await readBinaryOutputFile(session.ffmpeg, session.outputFileName);
  return finalizeVideoExport({ outputBytes, config, hasAudioInput });
}

async function cleanupVideoExportSession(session: VideoExportSession): Promise<void> {
  await Promise.all(
    session.cleanupFileNames.map((fileName) => session.ffmpeg.deleteFile(fileName).catch(() => {}))
  );

  for (const video of session.exportVideoCache.values()) {
    video.pause();
    video.removeAttribute("src");
    video.load();
  }
}

export async function runVideoExport(params: RunVideoExportParams): Promise<CompletedVideoExport> {
  const config = resolveVideoExportConfig({
    project: params.project,
    playback: params.playback,
    options: params.exportOptions,
  });
  const session = createVideoExportSession(params.ffmpeg, config.format);

  params.setExportProgress({
    stage: "Preparing export",
    percent: 2,
    detail: config.hasCustomRange
      ? `Range ${config.exportStart.toFixed(2)}s - ${config.exportEnd.toFixed(2)}s`
      : "Loading encoder...",
  });

  try {
    const directResult = await runDirectVideoExport({
      session,
      project: params.project,
      clips: params.clips,
      tracks: params.tracks,
      masksMap: params.masksMap,
      config,
      setExportProgress: params.setExportProgress,
    });
    const result = directResult ?? await runFrameSequenceExport({
      session,
      project: params.project,
      clips: params.clips,
      tracks: params.tracks,
      masksMap: params.masksMap,
      config,
      setExportProgress: params.setExportProgress,
      audioBufferCache: params.audioBufferCache,
    });

    trackEvent("file_export", {
      tool: "video",
      output_format: result.format,
      include_audio: result.hasAudioInput,
      compression: result.compression,
      has_custom_range: result.hasCustomRange,
      duration_seconds: Number(result.duration.toFixed(2)),
    });
    return result;
  } finally {
    await cleanupVideoExportSession(session);
  }
}

export function createVideoExportBlob(result: CompletedVideoExport): Blob {
  return new Blob([cloneToArrayBuffer(result.outputBytes)], { type: result.outputMimeType });
}
