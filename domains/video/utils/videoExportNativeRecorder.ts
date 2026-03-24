import type { Clip, VideoTrack } from "../types";
import {
  audioBufferToWavBlob,
  renderTimelineAudioBuffer,
  resolveVideoExportCompression,
  type DirectVideoExportPlan,
} from "./videoExportHelpers";
import {
  loadExportVideoElement,
  mountBlobToFfmpegFile,
  readBinaryOutputFile,
  resolveClipSourceBlob,
  seekExportVideoFrame,
  writeBlobToFfmpegFile,
} from "./videoExportIO";
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

export function getNativeRecorderSupport(
  config: ResolvedVideoExportConfig,
  plan: DirectVideoExportPlan
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
  if (typeof document.createElement("video").requestVideoFrameCallback !== "function") {
    return { supported: false, reason: "이 브라우저는 requestVideoFrameCallback을 지원하지 않습니다." };
  }
  const mimeType = resolveNativeRecorderMimeType();
  if (!mimeType) {
    return { supported: false, reason: "이 브라우저는 MP4 MediaRecorder 인코딩을 지원하지 않습니다." };
  }
  return {
    supported: true,
    mimeType,
    reason: plan.kind === "sequence"
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
        activeSegmentIndex = segmentIndex;
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
        await withTimeout(
          video.play(),
          5000,
          "네이티브 export 세그먼트 재생 시작이 지연되고 있습니다."
        );

        await new Promise<void>((resolve, reject) => {
          const segmentEnd = segment.sourceStart + segment.sourceDuration;
          const timeoutId = window.setTimeout(() => {
            reject(new Error(`네이티브 export 세그먼트 ${segmentIndex + 1}가 지연되고 있습니다.`));
          }, Math.ceil(segment.timelineDuration * 1000) + 3000);

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
    };
  } finally {
    await cleanup();
  }
}

export async function finalizeNativeRecorderExport(params: {
  nativeVideo: NativeRecordedVideoExport;
  config: ResolvedVideoExportConfig;
  plan: DirectVideoExportPlan;
  clips: Clip[];
  tracks: VideoTrack[];
  ffmpeg: import("@ffmpeg/ffmpeg").FFmpeg;
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
  if (!config.includeAudio || !plan.includeAudio) {
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
  const mixedAudio = await renderTimelineAudioBuffer({
    clips,
    tracks,
    timelineStart: config.exportStart,
    projectDuration: config.duration,
    sourceBufferCache: audioBufferCache,
    sourceBlobCache,
  });

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

  setExportProgress({
    stage: "Muxing audio",
    percent: 92,
    detail: "네이티브 비디오와 오디오를 결합하는 중...",
  });

  const nativeVideoFileName = `${filePrefix}-native-video.mp4`;
  const mountedVideo = await mountBlobToFfmpegFile(ffmpeg, nativeVideoFileName, nativeVideo.videoBlob);
  cleanupMountPoints.push(mountedVideo.mountPoint);
  cleanupFileNames.push(outputFileName, wavFileName);
  await writeBlobToFfmpegFile(ffmpeg, wavFileName, audioBufferToWavBlob(mixedAudio));

  const exitCode = await ffmpeg.exec([
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
    "-shortest",
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
