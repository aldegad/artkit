import { renderCompositeFrame } from "./compositeRenderer";
import type { Size } from "@/shared/types";
import { getSourceTime, type Clip, type MaskData, type VideoClip, type VideoProject, type VideoTrack } from "../types";
import {
  audioBufferToWavBlob,
  fitAudioBufferToDuration,
  renderDirectPlanAudioBuffer,
  renderTimelineAudioBuffer,
  resolveVideoExportCompression,
  VIDEO_EXPORT_EPSILON,
  type DirectVideoExportPlan,
} from "./videoExportHelpers";
import {
  loadExportVideoElement,
  mountBlobToFfmpegFile,
  readBinaryOutputFile,
  resolveClipSourceBlob,
  resolveBlobMediaDuration,
  seekExportVideoFrame,
  writeBlobToFfmpegFile,
} from "./videoExportIO";
import {
  buildClipIndex,
  buildMaskIndex,
  findActiveMaskAtTime,
  findExportClipAtTime,
  preloadExportImages,
  preloadExportVideos,
  preloadMaskImages,
} from "./videoExportRenderAssets";
import type {
  CompletedVideoExport,
  ExportProgressState,
  ResolvedVideoExportConfig,
  VideoExportCompression,
} from "./videoExportTypes";

const NATIVE_RECORDER_MP4_MIME_CANDIDATES = [
  'video/mp4;codecs="avc1.64001f,mp4a.40.2"',
  'video/mp4;codecs="avc1.4d401f,mp4a.40.2"',
  'video/mp4;codecs="avc1.42E01E,mp4a.40.2"',
  "video/mp4;codecs=h264,aac",
  "video/mp4",
];

interface NativeRecorderSupport {
  supported: boolean;
  mimeType?: string;
  reason: string;
}

interface NativeOverlayImage {
  image: HTMLImageElement;
}

export interface NativeRecordedVideoExport {
  videoBlob: Blob;
  outputMimeType: string;
  recordedSegmentTimelineDurations?: number[];
}

function logNativeRecorderStep(step: string, extra?: Record<string, unknown>) {
  console.info("[VideoExport] native recorder step", {
    step,
    ...(extra ?? {}),
  });
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timer: number | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = window.setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer !== null) {
      window.clearTimeout(timer);
    }
  }
}

async function waitForRecorderState(
  recorder: MediaRecorder,
  targetState: "paused" | "recording",
  timeoutMs: number,
  message: string
): Promise<void> {
  if (recorder.state === targetState) {
    return;
  }

  const eventName = targetState === "paused" ? "pause" : "resume";
  await withTimeout(new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      recorder.removeEventListener(eventName, handleStateChange);
      recorder.removeEventListener("error", handleError);
    };

    const handleStateChange = () => {
      cleanup();
      resolve();
    };

    const handleError = () => {
      cleanup();
      reject(new Error(`네이티브 recorder ${eventName} 이벤트 대기 중 오류가 발생했습니다.`));
    };

    recorder.addEventListener(eventName, handleStateChange, { once: true });
    recorder.addEventListener("error", handleError, { once: true });
  }), timeoutMs, message);
}

async function pauseRecorderForBoundary(recorder: MediaRecorder): Promise<void> {
  if (recorder.state !== "recording") {
    return;
  }
  recorder.pause();
  await waitForRecorderState(
    recorder,
    "paused",
    2000,
    "네이티브 recorder pause가 지연되고 있습니다."
  );
}

async function resumeRecorderForBoundary(recorder: MediaRecorder): Promise<void> {
  if (recorder.state !== "paused") {
    return;
  }
  recorder.resume();
  await waitForRecorderState(
    recorder,
    "recording",
    2000,
    "네이티브 recorder resume이 지연되고 있습니다."
  );
}

function resolveNativeRecorderMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  for (const candidate of NATIVE_RECORDER_MP4_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) {
      return candidate;
    }
  }
  return null;
}

function getNativeRecorderBitrate(params: {
  compression: VideoExportCompression;
  includeAudio: boolean;
}) {
  const compressionSettings = resolveVideoExportCompression(params.compression);
  const videoBitsPerSecond =
    compressionSettings.crf <= 14
      ? 20_000_000
      : compressionSettings.crf >= 24
        ? 8_000_000
        : 12_000_000;
  return {
    videoBitsPerSecond,
    audioBitsPerSecond: params.includeAudio ? 192_000 : undefined,
  };
}

function setPitchPreservation(video: HTMLVideoElement): void {
  const element = video as HTMLVideoElement & {
    preservesPitch?: boolean;
    mozPreservesPitch?: boolean;
    webkitPreservesPitch?: boolean;
  };
  if (typeof element.preservesPitch === "boolean") element.preservesPitch = true;
  if (typeof element.mozPreservesPitch === "boolean") element.mozPreservesPitch = true;
  if (typeof element.webkitPreservesPitch === "boolean") element.webkitPreservesPitch = true;
}

function stopTracks(stream: MediaStream | null): void {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

function toUint8Array(buffer: ArrayBuffer): Uint8Array {
  return new Uint8Array(buffer.slice(0));
}

async function waitForVideoFrame(video: HTMLVideoElement, timeoutMs: number, message: string): Promise<void> {
  if (typeof video.requestVideoFrameCallback !== "function") {
    return;
  }
  await withTimeout(new Promise<void>((resolve) => {
    video.requestVideoFrameCallback(() => resolve());
  }), timeoutMs, message);
}

export function getNativeRecorderSupport(
  config: ResolvedVideoExportConfig,
  plan?: DirectVideoExportPlan | null
): NativeRecorderSupport {
  if (typeof window === "undefined") {
    return { supported: false, reason: "브라우저 환경이 아니어서 네이티브 인코더를 사용할 수 없습니다." };
  }
  if (config.format !== "mp4") {
    return { supported: false, reason: "네이티브 인코더는 현재 MP4 출력에서만 사용합니다." };
  }
  if (typeof MediaRecorder === "undefined") {
    return { supported: false, reason: "이 브라우저는 MediaRecorder를 지원하지 않습니다." };
  }
  if (typeof document.createElement("canvas").captureStream !== "function") {
    return { supported: false, reason: "이 브라우저는 canvas captureStream을 지원하지 않습니다." };
  }
  if (
    plan &&
    typeof document.createElement("video").requestVideoFrameCallback !== "function"
  ) {
    return { supported: false, reason: "이 브라우저는 requestVideoFrameCallback을 지원하지 않습니다." };
  }
  const mimeType = resolveNativeRecorderMimeType();
  if (!mimeType) {
    return { supported: false, reason: "이 브라우저는 MP4 MediaRecorder 인코딩을 지원하지 않습니다." };
  }
  return {
    supported: true,
    mimeType,
    reason: !plan
      ? "브라우저 네이티브 인코더로 타임라인 캔버스를 직접 기록할 수 있습니다."
      : plan.kind === "sequence"
        ? "브라우저 네이티브 인코더로 분할 시퀀스를 직접 재인코딩할 수 있습니다."
        : "브라우저 네이티브 인코더로 직접 재인코딩할 수 있습니다.",
  };
}

export async function runNativeRecorderDirectExport(params: {
  plan: DirectVideoExportPlan;
  sourceBlob: Blob;
  mimeType: string;
  config: ResolvedVideoExportConfig;
  setExportProgress: (value: ExportProgressState) => void;
  sourceBlobCache: Map<string, Blob>;
}): Promise<NativeRecordedVideoExport> {
  const { plan, sourceBlob, mimeType, config, setExportProgress, sourceBlobCache } = params;
  const singlePlan = plan.kind === "single" ? plan : null;
  const sequencePlan = plan.kind === "sequence" ? plan : null;
  const objectUrl = URL.createObjectURL(sourceBlob);
  const overlayObjectUrls: string[] = [];

  setExportProgress({
    stage: "Preparing export",
    percent: 3,
    detail: "네이티브 인코더 준비 중 · 원본 비디오 로드",
  });
  logNativeRecorderStep("load-video:start", {
    mimeType,
    includeAudio: plan.includeAudio,
    sourceSize: sourceBlob.size,
  });

  const video = await withTimeout(
    loadExportVideoElement(objectUrl),
    10000,
    "네이티브 export용 비디오 메타데이터 로드가 지연되고 있습니다."
  );
  if (!video) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("네이티브 export용 비디오를 열 수 없습니다.");
  }

  logNativeRecorderStep("load-video:done", {
    duration: video.duration,
    videoWidth: video.videoWidth,
    videoHeight: video.videoHeight,
  });

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = singlePlan ? singlePlan.cropWidth : sequencePlan!.outputWidth;
  outputCanvas.height = singlePlan ? singlePlan.cropHeight : sequencePlan!.outputHeight;
  const ctx = outputCanvas.getContext("2d");
  if (!ctx) {
    URL.revokeObjectURL(objectUrl);
    throw new Error("네이티브 export 캔버스를 만들 수 없습니다.");
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  const canvasStream = outputCanvas.captureStream(config.frameRate);
  let combinedStream: MediaStream | null = null;
  const chunks: Blob[] = [];
  const recordedSegmentTimelineDurations: number[] = [];
  let recorder: MediaRecorder | null = null;
  let progressTimer: number | null = null;
  const expectedWallDuration = singlePlan
    ? Math.max(0.1, singlePlan.sourceDuration / Math.max(singlePlan.clip.playbackSpeed, 0.01))
    : Math.max(0.1, sequencePlan!.segments.reduce((sum, segment) => sum + Math.max(segment.timelineDuration, 0), 0));
  const startedAt = Date.now();

  const cleanup = async () => {
    if (progressTimer !== null) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    stopTracks(combinedStream);
    stopTracks(canvasStream);
    try {
      video.pause();
    } catch {}
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(objectUrl);
    for (const overlayObjectUrl of overlayObjectUrls) {
      URL.revokeObjectURL(overlayObjectUrl);
    }
  };

  const overlayImages: NativeOverlayImage[] = singlePlan
    ? await Promise.all(
      singlePlan.overlays.map(async (overlay) => {
        const overlayBlob = await resolveClipSourceBlob(overlay.clip, sourceBlobCache);
        const overlayUrl = URL.createObjectURL(overlayBlob);
        overlayObjectUrls.push(overlayUrl);
        const image = await new Promise<HTMLImageElement>((resolve, reject) => {
          const nextImage = new Image();
          nextImage.decoding = "async";
          nextImage.onload = () => resolve(nextImage);
          nextImage.onerror = () => reject(new Error("네이티브 export 오버레이 이미지를 불러오지 못했습니다."));
          nextImage.src = overlayUrl;
        });
        return { image };
      })
    )
    : [];

  const drawSingleFrame = (currentTime: number) => {
    if (!singlePlan) return;
    ctx.clearRect(0, 0, singlePlan.cropWidth, singlePlan.cropHeight);
    ctx.drawImage(
      video,
      singlePlan.cropX,
      singlePlan.cropY,
      singlePlan.cropWidth,
      singlePlan.cropHeight,
      0,
      0,
      singlePlan.cropWidth,
      singlePlan.cropHeight
    );
    singlePlan.overlays.forEach((overlay, index) => {
      if (currentTime < overlay.startTime || currentTime > overlay.endTime) return;
      const overlayImage = overlayImages[index]?.image;
      if (!overlayImage) return;
      const previousAlpha = ctx.globalAlpha;
      ctx.globalAlpha = Math.max(0, Math.min(1, overlay.opacity / 100));
      ctx.drawImage(
        overlayImage,
        overlay.offsetX,
        overlay.offsetY,
        overlay.width,
        overlay.height
      );
      ctx.globalAlpha = previousAlpha;
    });
  };

  const drawSequenceFrame = (segmentIndex: number) => {
    const segment = sequencePlan?.segments[segmentIndex];
    if (!segment || !sequencePlan) return;
    ctx.fillStyle = config.backgroundColor;
    ctx.fillRect(0, 0, sequencePlan.outputWidth, sequencePlan.outputHeight);
    ctx.drawImage(
      video,
      segment.cropX,
      segment.cropY,
      segment.cropWidth,
      segment.cropHeight,
      segment.padX,
      segment.padY,
      segment.cropWidth,
      segment.cropHeight
    );
  };

  try {
    setExportProgress({
      stage: "Preparing export",
      percent: 3,
      detail: "네이티브 인코더 준비 중 · 재생 초기화",
    });
    logNativeRecorderStep("video-setup:start");
    video.preload = "auto";
    video.playsInline = true;
    video.muted = true;
    video.defaultMuted = true;
    video.volume = 0;
    video.defaultPlaybackRate = singlePlan ? singlePlan.clip.playbackSpeed : 1;
    video.playbackRate = singlePlan ? singlePlan.clip.playbackSpeed : 1;
    setPitchPreservation(video);

    setExportProgress({
      stage: "Preparing export",
      percent: 3,
      detail: "네이티브 인코더 준비 중 · 시작 지점 이동",
    });
    logNativeRecorderStep("seek:start", {
      sourceStart: singlePlan ? singlePlan.sourceStart : sequencePlan?.segments[0]?.sourceStart ?? 0,
      sourceDuration: singlePlan ? singlePlan.sourceDuration : sequencePlan?.segments[0]?.sourceDuration ?? 0,
      playbackSpeed: singlePlan ? singlePlan.clip.playbackSpeed : sequencePlan?.segments[0]?.clip.playbackSpeed ?? 1,
    });

    const seeked = await withTimeout(
      seekExportVideoFrame(
        video,
        singlePlan ? singlePlan.sourceStart : sequencePlan?.segments[0]?.sourceStart ?? 0,
        5000
      ),
      7000,
      "네이티브 export 시작 지점 seek가 지연되고 있습니다."
    );
    if (!seeked) {
      throw new Error("네이티브 export 시작 지점으로 이동할 수 없습니다.");
    }

    logNativeRecorderStep("seek:done", {
      currentTime: video.currentTime,
    });

    if (singlePlan) {
      drawSingleFrame(0);
    } else {
      drawSequenceFrame(0);
    }

    combinedStream = new MediaStream();
    for (const track of canvasStream.getVideoTracks()) {
      combinedStream.addTrack(track);
    }
    logNativeRecorderStep("canvas-stream:ready", {
      videoTracks: combinedStream.getVideoTracks().length,
    });

    setExportProgress({
      stage: "Preparing export",
      percent: 3,
      detail: "네이티브 인코더 준비 중 · recorder 생성",
    });
    logNativeRecorderStep("recorder:create");
    recorder = new MediaRecorder(combinedStream, {
      mimeType,
      ...getNativeRecorderBitrate({
        compression: config.compression,
        includeAudio: false,
      }),
    });

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunks.push(event.data);
      }
    };

    let stopped = false;
    let completedTimelineDuration = 0;
    let activeSegmentIndex = 0;
    let settleRecording:
      | ((value: Blob | PromiseLike<Blob>) => void)
      | null = null;
    let rejectRecording:
      | ((reason?: unknown) => void)
      | null = null;
    let recordingSettled = false;

    const recordingPromise = new Promise<Blob>((resolve, reject) => {
      settleRecording = resolve;
      rejectRecording = reject;
    });

    const resolveRecording = () => {
      if (recordingSettled) return;
      recordingSettled = true;
      const blob = new Blob(chunks, { type: mimeType });
      if (blob.size <= 0) {
        rejectRecording?.(new Error("네이티브 recorder 결과가 비어 있습니다."));
        return;
      }
      settleRecording?.(blob);
    };

    const failRecording = (error: unknown) => {
      if (recordingSettled) return;
      recordingSettled = true;
      rejectRecording?.(error);
    };

    recorder.onerror = () => {
      failRecording(new Error("네이티브 recorder가 실패했습니다."));
    };
    recorder.onstop = () => {
      resolveRecording();
    };

    const stopRecording = () => {
      if (stopped) return;
      stopped = true;
      if (progressTimer !== null) {
        window.clearInterval(progressTimer);
        progressTimer = null;
      }
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      }
      video.pause();
    };

    const updateProgress = () => {
      const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
      const progressRatio = singlePlan
        ? Math.max(0, Math.min(1, (video.currentTime - singlePlan.sourceStart) / Math.max(singlePlan.sourceDuration, 0.001)))
        : Math.max(
          0,
          Math.min(
            1,
            (
              completedTimelineDuration +
              Math.max(
                0,
                (
                  video.currentTime - (sequencePlan?.segments[activeSegmentIndex]?.sourceStart ?? 0)
                ) / Math.max(sequencePlan?.segments[activeSegmentIndex]?.clip.playbackSpeed ?? 1, 0.001)
              )
            ) / Math.max(expectedWallDuration, 0.001)
          )
        );
      const overallPercent = Math.min(98, 70 + progressRatio * 28);
      const phasePercent = Math.round(progressRatio * 100);
      setExportProgress({
        stage: `Encoding ${config.format.toUpperCase()}`,
        percent: overallPercent,
        detail: `브라우저 네이티브 인코딩 ${phasePercent}% · ${elapsedSeconds}s`,
        phasePercent,
        elapsedSeconds,
      });
    };

    progressTimer = window.setInterval(updateProgress, 500);
    console.info("[VideoExport] native recorder started", {
      frameRate: config.frameRate,
      mimeType,
      includeAudio: false,
      expectedWallDuration,
      outputSize: {
        width: singlePlan ? singlePlan.cropWidth : sequencePlan!.outputWidth,
        height: singlePlan ? singlePlan.cropHeight : sequencePlan!.outputHeight,
      },
    });
    recorder.start(1000);
    logNativeRecorderStep("recorder:start", {
      recorderState: recorder.state,
    });

    const playSequenceSegments = async () => {
      if (!sequencePlan) return;
      for (let segmentIndex = 0; segmentIndex < sequencePlan.segments.length; segmentIndex += 1) {
        const segment = sequencePlan.segments[segmentIndex];
        logNativeRecorderStep("sequence-segment:start", {
          segmentIndex: segmentIndex + 1,
          segmentCount: sequencePlan.segments.length,
          sourceStart: segment.sourceStart,
          sourceDuration: segment.sourceDuration,
          timelineDuration: segment.timelineDuration,
          playbackSpeed: segment.clip.playbackSpeed,
        });
        activeSegmentIndex = segmentIndex;
        if (segmentIndex > 0 && recorder && typeof recorder.pause === "function") {
          logNativeRecorderStep("sequence-segment:pause-recorder", {
            segmentIndex: segmentIndex + 1,
          });
          await pauseRecorderForBoundary(recorder);
        }
        video.defaultPlaybackRate = segment.clip.playbackSpeed;
        video.playbackRate = segment.clip.playbackSpeed;

        const segmentSeeked = await withTimeout(
          seekExportVideoFrame(video, segment.sourceStart, 5000),
          7000,
          "네이티브 export 세그먼트 seek가 지연되고 있습니다."
        );
        if (!segmentSeeked) {
          throw new Error(`네이티브 export 세그먼트 ${segmentIndex + 1} 시작 지점으로 이동할 수 없습니다.`);
        }

        drawSequenceFrame(segmentIndex);
        if (segmentIndex > 0 && recorder && typeof recorder.resume === "function") {
          logNativeRecorderStep("sequence-segment:resume-recorder", {
            segmentIndex: segmentIndex + 1,
          });
          await resumeRecorderForBoundary(recorder);
        }
        await withTimeout(
          video.play(),
          5000,
          "네이티브 export 세그먼트 재생 시작이 지연되고 있습니다."
        );
        const segmentCaptureStartedAt = performance.now();

        await new Promise<void>((resolve, reject) => {
          const segmentEnd = segment.sourceStart + segment.sourceDuration;
          const timeoutId = window.setTimeout(() => {
            reject(new Error(`네이티브 export 세그먼트 ${segmentIndex + 1}가 지연되고 있습니다.`));
          }, Math.max(12000, Math.ceil(segment.timelineDuration * 1000) + 6000));

          const step = () => {
            video.requestVideoFrameCallback(() => {
              if (stopped) {
                window.clearTimeout(timeoutId);
                resolve();
                return;
              }
              drawSequenceFrame(segmentIndex);
              updateProgress();
              if (video.currentTime >= segmentEnd - (1 / Math.max(config.frameRate, 1))) {
                video.pause();
                completedTimelineDuration += segment.timelineDuration;
                recordedSegmentTimelineDurations[segmentIndex] = Math.max(
                  1 / Math.max(config.frameRate, 1),
                  (performance.now() - segmentCaptureStartedAt) / 1000
                );
                logNativeRecorderStep("sequence-segment:done", {
                  segmentIndex: segmentIndex + 1,
                  currentTime: video.currentTime,
                  recordedTimelineDuration: recordedSegmentTimelineDurations[segmentIndex],
                });
                window.clearTimeout(timeoutId);
                resolve();
                return;
              }
              step();
            });
          };

          step();
        });
      }
      stopRecording();
    };

    setExportProgress({
      stage: "Preparing export",
      percent: 3,
      detail: "네이티브 인코더 준비 중 · 재생 시작",
    });
    logNativeRecorderStep("play:start");

    if (singlePlan) {
      const sourceEnd = singlePlan.sourceStart + singlePlan.sourceDuration;
      const scheduleFrameDraw = () => {
        video.requestVideoFrameCallback(() => {
          if (stopped) return;
          const timelineTime = Math.max(0, (video.currentTime - singlePlan.sourceStart) / Math.max(singlePlan.clip.playbackSpeed, 0.001));
          drawSingleFrame(timelineTime);
          updateProgress();
          if (video.currentTime >= sourceEnd - (1 / Math.max(config.frameRate, 1))) {
            stopRecording();
            return;
          }
          scheduleFrameDraw();
        });
      };

      scheduleFrameDraw();
      await withTimeout(
        video.play(),
        5000,
        "네이티브 export 재생 시작이 지연되고 있습니다."
      );
      logNativeRecorderStep("play:done", {
        currentTime: video.currentTime,
        playbackRate: video.playbackRate,
        paused: video.paused,
      });
      window.setTimeout(() => {
        if (stopped) return;
        if (video.currentTime >= sourceEnd - 0.05) {
          stopRecording();
        }
      }, Math.ceil(expectedWallDuration * 1000) + 1500);
    } else {
      logNativeRecorderStep("play:done", {
        currentTime: video.currentTime,
        playbackRate: video.playbackRate,
        paused: video.paused,
        segments: sequencePlan?.segments.length ?? 0,
      });
      void playSequenceSegments().catch((error) => {
        failRecording(error);
        stopRecording();
      });
    }

    const recordedBlob = await recordingPromise;
    console.info("[VideoExport] native recorder finished", {
      elapsedSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      outputBytes: recordedBlob.size,
    });
    return {
      videoBlob: recordedBlob,
      outputMimeType: mimeType,
      recordedSegmentTimelineDurations: sequencePlan ? recordedSegmentTimelineDurations : undefined,
    };
  } finally {
    await cleanup();
  }
}

export async function runNativeRecorderTimelineExport(params: {
  project: VideoProject;
  clips: Clip[];
  tracks: VideoTrack[];
  masksMap: Map<string, MaskData>;
  mimeType: string;
  config: ResolvedVideoExportConfig;
  setExportProgress: (value: ExportProgressState) => void;
  sourceBlobCache: Map<string, Blob>;
}): Promise<NativeRecordedVideoExport> {
  const {
    project,
    clips,
    tracks,
    masksMap,
    mimeType,
    config,
    setExportProgress,
    sourceBlobCache,
  } = params;
  const cleanupObjectUrls: string[] = [];
  const totalFrames = Math.max(1, Math.ceil(config.duration * config.frameRate));
  const frameDuration = 1 / Math.max(1, config.frameRate);
  const boundaryTolerance = Math.max(VIDEO_EXPORT_EPSILON, Math.min(frameDuration * 0.25, 0.01));
  const hardSeekThreshold = Math.max(frameDuration * 3, 0.18);
  const softSeekThreshold = Math.max(frameDuration * 1.5, 0.05);
  const startedAt = Date.now();
  const sortedTracks = [...tracks].reverse();
  const clipsByTrack = buildClipIndex(clips);
  const masksByTrack = buildMaskIndex(masksMap);

  setExportProgress({
    stage: "Preparing export",
    percent: 3,
    detail: "네이티브 타임라인 인코더 준비 중 · 미디어 프리로드",
  });
  logNativeRecorderStep("timeline-preload:start", {
    totalClips: clips.length,
    trackCount: tracks.length,
  });

  const exportImageCache = await preloadExportImages({
    cleanupObjectUrls,
    clips,
    sourceBlobCache,
  });
  const exportMaskImgCache = await preloadMaskImages(masksMap);
  const exportVideoCache = await preloadExportVideos({
    cleanupObjectUrls,
    clips,
    sourceBlobCache,
  });

  logNativeRecorderStep("timeline-preload:done", {
    images: exportImageCache.size,
    masks: exportMaskImgCache.size,
    videos: exportVideoCache.size,
  });

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = project.canvasSize.width;
  outputCanvas.height = project.canvasSize.height;
  const exportCtx = outputCanvas.getContext("2d");
  if (!exportCtx) {
    throw new Error("네이티브 타임라인 export 캔버스를 만들 수 없습니다.");
  }
  exportCtx.imageSmoothingEnabled = true;
  exportCtx.imageSmoothingQuality = "high";

  const committedFrameCanvas = document.createElement("canvas");
  committedFrameCanvas.width = project.canvasSize.width;
  committedFrameCanvas.height = project.canvasSize.height;
  const committedFrameCtx = committedFrameCanvas.getContext("2d");
  if (!committedFrameCtx) {
    throw new Error("네이티브 타임라인 export committed 캔버스를 만들 수 없습니다.");
  }
  let hasCommittedFrame = false;

  const exportMaskTmpCanvas = document.createElement("canvas");
  exportMaskTmpCanvas.width = project.canvasSize.width;
  exportMaskTmpCanvas.height = project.canvasSize.height;

  const canvasStream = outputCanvas.captureStream(config.frameRate);
  let combinedStream: MediaStream | null = new MediaStream();
  for (const track of canvasStream.getVideoTracks()) {
    combinedStream.addTrack(track);
  }

  let recorder: MediaRecorder | null = null;
  let rafId: number | null = null;
  let progressTimer: number | null = null;
  let stopped = false;
  let lastActiveVideoIds = new Set<string>();
  const chunks: Blob[] = [];
  const maxFrameTime = Math.max(config.exportStart, config.exportEnd - 0.5 / config.frameRate);
  const expectedWallDuration = Math.max(0.1, config.duration);

  const stopExportVideos = () => {
    for (const video of exportVideoCache.values()) {
      try {
        video.pause();
      } catch {}
      video.muted = true;
      video.volume = 0;
      video.removeAttribute("src");
      video.load();
    }
  };

  const cleanup = async () => {
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    if (progressTimer !== null) {
      window.clearInterval(progressTimer);
      progressTimer = null;
    }
    stopTracks(combinedStream);
    stopTracks(canvasStream);
    stopExportVideos();
    for (const objectUrl of cleanupObjectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
  };

  const getClipAtTimeForExport = (trackId: string, time: number) => {
    const trackClips = clipsByTrack.get(trackId);
    return trackClips ? findExportClipAtTime(trackClips, time, boundaryTolerance) : null;
  };

  const getMaskAtTimeForExport = (trackId: string, time: number) => {
    const trackMasks = masksByTrack.get(trackId) ?? [];
    return findActiveMaskAtTime(trackMasks, time);
  };

  const hasExpectedVisualContentAtTime = (time: number) =>
    sortedTracks.some((track) => {
      if (!track.visible) return false;
      const clip = getClipAtTimeForExport(track.id, time);
      return Boolean(clip && clip.visible && clip.type !== "audio");
    });

  const clearExportFrame = () => {
    exportCtx.fillStyle = config.backgroundColor;
    exportCtx.fillRect(0, 0, outputCanvas.width, outputCanvas.height);
  };

  const syncActiveVideosForTime = async (time: number, forceSeek = false) => {
    const activeTargets: Array<{
      clip: VideoClip;
      video: HTMLVideoElement;
      sourceTime: number;
      hardSeek: boolean;
    }> = [];
    const nextActiveVideoIds = new Set<string>();

    for (const track of sortedTracks) {
      if (!track.visible) continue;
      const clip = getClipAtTimeForExport(track.id, time);
      if (!clip || !clip.visible || clip.type !== "video") continue;
      const video = exportVideoCache.get(clip.id);
      if (!video || video.readyState < 2) continue;
      const sourceTime = getSourceTime(clip, time);
      const drift = Math.abs(video.currentTime - sourceTime);
      nextActiveVideoIds.add(clip.id);
      activeTargets.push({
        clip,
        video,
        sourceTime,
        hardSeek: forceSeek || !lastActiveVideoIds.has(clip.id) || drift > hardSeekThreshold,
      });
    }

    for (const [clipId, video] of exportVideoCache.entries()) {
      if (nextActiveVideoIds.has(clipId)) continue;
      video.pause();
      video.muted = true;
      video.volume = 0;
    }

    for (const target of activeTargets) {
      const { clip, video, sourceTime, hardSeek } = target;
      video.preload = "auto";
      video.playsInline = true;
      video.muted = true;
      video.defaultMuted = true;
      video.volume = 0;
      video.defaultPlaybackRate = clip.playbackSpeed;
      video.playbackRate = clip.playbackSpeed;
      setPitchPreservation(video);

      if (hardSeek) {
        const seeked = await withTimeout(
          seekExportVideoFrame(video, sourceTime, 5000),
          7000,
          "네이티브 타임라인 export seek가 지연되고 있습니다."
        );
        if (!seeked) {
          throw new Error("네이티브 타임라인 export가 대상 프레임으로 이동하지 못했습니다.");
        }
      } else if (Math.abs(video.currentTime - sourceTime) > softSeekThreshold) {
        video.currentTime = sourceTime;
      }

      if (video.paused) {
        await withTimeout(
          video.play().catch(() => undefined),
          5000,
          "네이티브 타임라인 export 재생 시작이 지연되고 있습니다."
        );
      }

      if (hardSeek) {
        await waitForVideoFrame(
          video,
          2000,
          "네이티브 타임라인 export 프레임 준비가 지연되고 있습니다."
        );
      }
    }

    lastActiveVideoIds = nextActiveVideoIds;
  };

  const renderTimelineFrame = async (time: number, forceSeek = false) => {
    clearExportFrame();
    await syncActiveVideosForTime(time, forceSeek);
    const expectedVisualContent = hasExpectedVisualContentAtTime(time);
    let fullyRendered = renderCompositeFrame(exportCtx, {
      time,
      tracks,
      getClipAtTime: getClipAtTimeForExport,
      getMaskAtTimeForTrack: getMaskAtTimeForExport,
      videoElements: exportVideoCache,
      imageCache: exportImageCache,
      maskImageCache: exportMaskImgCache,
      maskTempCanvas: exportMaskTmpCanvas,
      projectSize: project.canvasSize as Size,
      renderRect: { x: 0, y: 0, width: outputCanvas.width, height: outputCanvas.height },
      isPlaying: true,
      preSeekVerified: true,
    });

    if (!fullyRendered && expectedVisualContent) {
      await syncActiveVideosForTime(time, true);
      clearExportFrame();
      fullyRendered = renderCompositeFrame(exportCtx, {
        time,
        tracks,
        getClipAtTime: getClipAtTimeForExport,
        getMaskAtTimeForTrack: getMaskAtTimeForExport,
        videoElements: exportVideoCache,
        imageCache: exportImageCache,
        maskImageCache: exportMaskImgCache,
        maskTempCanvas: exportMaskTmpCanvas,
        projectSize: project.canvasSize as Size,
        renderRect: { x: 0, y: 0, width: outputCanvas.width, height: outputCanvas.height },
        isPlaying: true,
        preSeekVerified: true,
      });
    }

    if (fullyRendered) {
      committedFrameCtx.clearRect(0, 0, committedFrameCanvas.width, committedFrameCanvas.height);
      committedFrameCtx.drawImage(outputCanvas, 0, 0);
      hasCommittedFrame = true;
      return;
    }

    if (expectedVisualContent && hasCommittedFrame) {
      exportCtx.clearRect(0, 0, outputCanvas.width, outputCanvas.height);
      exportCtx.drawImage(committedFrameCanvas, 0, 0);
    }
  };

  try {
    setExportProgress({
      stage: "Preparing export",
      percent: 3,
      detail: "네이티브 타임라인 인코더 준비 중 · 첫 프레임 동기화",
    });
    await renderTimelineFrame(config.exportStart, true);

    recorder = new MediaRecorder(combinedStream, {
      mimeType,
      ...getNativeRecorderBitrate({
        compression: config.compression,
        includeAudio: false,
      }),
    });

    const recordingPromise = new Promise<Blob>((resolve, reject) => {
      let settled = false;
      const resolveRecording = () => {
        if (settled) return;
        settled = true;
        const blob = new Blob(chunks, { type: mimeType });
        if (blob.size <= 0) {
          reject(new Error("네이티브 타임라인 recorder 결과가 비어 있습니다."));
          return;
        }
        resolve(blob);
      };

      const failRecording = (error: unknown) => {
        if (settled) return;
        settled = true;
        reject(error);
      };

      recorder!.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunks.push(event.data);
        }
      };
      recorder!.onerror = () => {
        failRecording(new Error("네이티브 타임라인 recorder가 실패했습니다."));
      };
      recorder!.onstop = () => {
        resolveRecording();
      };

      const stopRecording = () => {
        if (stopped) return;
        stopped = true;
        if (rafId !== null) {
          window.cancelAnimationFrame(rafId);
          rafId = null;
        }
        if (progressTimer !== null) {
          window.clearInterval(progressTimer);
          progressTimer = null;
        }
        for (const video of exportVideoCache.values()) {
          video.pause();
        }
        if (recorder && recorder.state !== "inactive") {
          recorder.stop();
        }
      };

      const updateProgress = () => {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
        const elapsedRatio = Math.max(
          0,
          Math.min(1, ((Date.now() - startedAt) / 1000) / Math.max(expectedWallDuration, 0.001))
        );
        const overallPercent = Math.min(98, 70 + elapsedRatio * 28);
        const phasePercent = Math.round(elapsedRatio * 100);
        setExportProgress({
          stage: `Encoding ${config.format.toUpperCase()}`,
          percent: overallPercent,
          detail: `브라우저 네이티브 타임라인 인코딩 ${phasePercent}% · ${elapsedSeconds}s`,
          phasePercent,
          elapsedSeconds,
        });
      };

      let renderInFlight = false;
      const tick = async () => {
        if (stopped || renderInFlight) {
          return;
        }
        renderInFlight = true;
        try {
          const elapsedSeconds = (Date.now() - startedAt) / 1000;
          const isFinalFrame = elapsedSeconds >= config.duration - frameDuration * 0.5;
          const timelineTime = isFinalFrame
            ? maxFrameTime
            : Math.min(maxFrameTime, config.exportStart + elapsedSeconds);
          await renderTimelineFrame(timelineTime);
          updateProgress();
          if (isFinalFrame) {
            stopRecording();
            return;
          }
          rafId = window.requestAnimationFrame(() => {
            void tick();
          });
        } catch (error) {
          failRecording(error);
          stopRecording();
        } finally {
          renderInFlight = false;
        }
      };

      progressTimer = window.setInterval(updateProgress, 500);
      recorder!.start(1000);
      logNativeRecorderStep("timeline-recorder:start", {
        frameRate: config.frameRate,
        totalFrames,
        mimeType,
        canvasSize: project.canvasSize,
      });
      rafId = window.requestAnimationFrame(() => {
        void tick();
      });
    });

    const recordedBlob = await recordingPromise;
    console.info("[VideoExport] native timeline recorder finished", {
      elapsedSeconds: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
      outputBytes: recordedBlob.size,
      totalFrames,
    });
    return {
      videoBlob: recordedBlob,
      outputMimeType: mimeType,
    };
  } finally {
    await cleanup();
  }
}

export async function finalizeNativeRecorderExport(params: {
  nativeVideo: NativeRecordedVideoExport;
  config: ResolvedVideoExportConfig;
  plan: DirectVideoExportPlan | null;
  clips: Clip[];
  tracks: VideoTrack[];
  ffmpeg?: import("@ffmpeg/ffmpeg").FFmpeg | null;
  filePrefix: string;
  outputFileName: string;
  wavFileName: string;
  cleanupFileNames: string[];
  cleanupMountPoints: string[];
  audioBufferCache: Map<string, AudioBuffer | null>;
  sourceBlobCache: Map<string, Blob>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<CompletedVideoExport> {
  const {
    nativeVideo,
    config,
    plan,
    clips,
    tracks,
    ffmpeg,
    filePrefix,
    outputFileName,
    wavFileName,
    cleanupFileNames,
    cleanupMountPoints,
    audioBufferCache,
    sourceBlobCache,
    setExportProgress,
  } = params;
  if (!config.includeAudio || (plan ? !plan.includeAudio : false)) {
    const outputBytes = toUint8Array(await nativeVideo.videoBlob.arrayBuffer());
    return {
      outputBytes,
      hasAudioInput: false,
      format: config.format,
      compression: config.compression,
      duration: config.duration,
      hasCustomRange: config.hasCustomRange,
      outputMimeType: nativeVideo.outputMimeType,
    };
  }

  setExportProgress({
    stage: "Rendering audio",
    percent: 85,
    detail: "네이티브 비디오와 합칠 오디오 렌더링 중...",
  });
  const nativeVideoDuration = await resolveBlobMediaDuration(nativeVideo.videoBlob);
  const targetDuration = Number.isFinite(nativeVideoDuration) && nativeVideoDuration != null
    ? Math.max(0.001, nativeVideoDuration)
    : config.duration;
  const mixedAudio = await (
    plan?.kind === "sequence"
      ? renderDirectPlanAudioBuffer({
          plan,
          projectDuration: targetDuration,
          frameRate: config.frameRate,
          recordedSegmentTimelineDurations: nativeVideo.recordedSegmentTimelineDurations,
          sourceBufferCache: audioBufferCache,
          sourceBlobCache,
        })
      : renderTimelineAudioBuffer({
          clips,
          tracks,
          timelineStart: config.exportStart,
          projectDuration: targetDuration,
          sourceBufferCache: audioBufferCache,
          sourceBlobCache,
        })
  );

  if (!mixedAudio) {
    const outputBytes = toUint8Array(await nativeVideo.videoBlob.arrayBuffer());
    return {
      outputBytes,
      hasAudioInput: false,
      format: config.format,
      compression: config.compression,
      duration: config.duration,
      hasCustomRange: config.hasCustomRange,
      outputMimeType: nativeVideo.outputMimeType,
    };
  }
  const fittedAudio = fitAudioBufferToDuration(mixedAudio, targetDuration);

  setExportProgress({
    stage: "Muxing audio",
    percent: 92,
    detail: "네이티브 비디오와 오디오를 결합하는 중...",
  });

  if (!ffmpeg) {
    throw new Error("오디오 결합용 ffmpeg 세션이 준비되지 않았습니다.");
  }

  const nativeVideoFileName = `${filePrefix}-native-video.mp4`;
  const mountedVideo = await mountBlobToFfmpegFile(ffmpeg, nativeVideoFileName, nativeVideo.videoBlob);
  cleanupMountPoints.push(mountedVideo.mountPoint);
  cleanupFileNames.push(outputFileName, wavFileName);
  await writeBlobToFfmpegFile(ffmpeg, wavFileName, audioBufferToWavBlob(fittedAudio));

  const exitCode = await ffmpeg.exec([
    "-fflags",
    "+genpts",
    "-i",
    mountedVideo.filePath,
    "-i",
    wavFileName,
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-c:v",
    "copy",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-af",
    "aresample=async=0:first_pts=0",
    "-shortest",
    "-avoid_negative_ts",
    "make_zero",
    "-muxpreload",
    "0",
    "-muxdelay",
    "0",
    "-movflags",
    "+faststart",
    outputFileName,
  ]);

  if (exitCode !== 0) {
    throw new Error(`네이티브 비디오와 오디오 결합에 실패했습니다. (ffmpeg exit ${exitCode})`);
  }

  const outputBytes = await readBinaryOutputFile(ffmpeg, outputFileName);
  return {
    outputBytes,
    hasAudioInput: true,
    format: config.format,
    compression: config.compression,
    duration: config.duration,
    hasCustomRange: config.hasCustomRange,
    outputMimeType: config.outputMimeType,
  };
}
