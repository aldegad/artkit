import { resolveClipSourceBlob, loadExportVideoElement, seekExportVideoFrame } from "./videoExportIO";
import type { ResolvedVideoExportConfig, ExportProgressState } from "./videoExportTypes";
import type { DirectVideoExportPlan } from "./videoExportHelpers";
import {
  createNativeRecorderProgressUpdater,
  getNativeRecorderBitrate,
  logNativeRecorderStep,
  pauseRecorderForBoundary,
  resumeRecorderForBoundary,
  setPitchPreservation,
  stopTracks,
  type NativeRecordedVideoExport,
  withTimeout,
} from "./videoExportNativeRecorderShared";

interface NativeOverlayImage {
  image: HTMLImageElement;
}

interface CanvasStreamTrackWithRequestFrame extends MediaStreamTrack {
  requestFrame?: () => void;
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
  const canvasVideoTrack = canvasStream.getVideoTracks()[0] as CanvasStreamTrackWithRequestFrame | undefined;
  let combinedStream: MediaStream | null = null;
  const chunks: Blob[] = [];
  const recordedSegmentTimelineDurations: number[] = [];
  let recorder: MediaRecorder | null = null;
  let progressTimer: number | null = null;
  const expectedWallDuration = singlePlan
    ? Math.max(0.1, singlePlan.sourceDuration / Math.max(singlePlan.clip.playbackSpeed, 0.01))
    : Math.max(0.1, sequencePlan!.segments.reduce((sum, segment) => sum + Math.max(segment.timelineDuration, 0), 0));
  const startedAt = Date.now();
  const updateProgress = createNativeRecorderProgressUpdater({
    config,
    setExportProgress,
    startedAt,
    expectedWallDuration,
    detailPrefix: "브라우저 네이티브 인코딩",
  });

  const requestOutputFrame = () => {
    try {
      canvasVideoTrack?.requestFrame?.();
    } catch {}
  };

  const flushOutputFrame = async () => {
    await new Promise<void>((resolve) => {
      window.requestAnimationFrame(() => {
        window.setTimeout(resolve, 0);
      });
    });
  };

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
            nextImage.onerror = () =>
              reject(new Error("네이티브 export 오버레이 이미지를 불러오지 못했습니다."));
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
    video.defaultPlaybackRate = 1;
    video.playbackRate = 1;
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
      video.defaultPlaybackRate = singlePlan.clip.playbackSpeed;
      video.playbackRate = singlePlan.clip.playbackSpeed;
    }

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
    let settleRecording: ((value: Blob | PromiseLike<Blob>) => void) | null = null;
    let rejectRecording: ((reason?: unknown) => void) | null = null;
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

    let stopRequested = false;

    const stopRecordingNow = () => {
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

    const finalizeAndStopRecording = async () => {
      if (stopped || stopRequested) return;
      stopRequested = true;
      await flushOutputFrame();
      stopRecordingNow();
    };

    progressTimer = window.setInterval(() => {
      const progressRatio = singlePlan
        ? Math.max(
            0,
            Math.min(
              1,
              (video.currentTime - singlePlan.sourceStart) /
                Math.max(singlePlan.sourceDuration, 0.001)
            )
          )
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
      updateProgress(progressRatio);
    }, 500);

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
    // Re-paint the first frame and force the capture track to emit it so the
    // encoder's first sample carries content at t≈0. Without this, no canvas
    // frame reaches the recorder until playback's first video frame callback
    // fires, and players render that lead-in gap as black.
    if (singlePlan) {
      drawSingleFrame(0);
    } else {
      drawSequenceFrame(0);
    }
    requestOutputFrame();
    await flushOutputFrame();

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

        const segmentSeeked = await withTimeout(
          seekExportVideoFrame(video, segment.sourceStart, 5000),
          7000,
          "네이티브 export 세그먼트 seek가 지연되고 있습니다."
        );
        if (!segmentSeeked) {
          throw new Error(`네이티브 export 세그먼트 ${segmentIndex + 1} 시작 지점으로 이동할 수 없습니다.`);
        }

        video.defaultPlaybackRate = segment.clip.playbackSpeed;
        video.playbackRate = segment.clip.playbackSpeed;
        drawSequenceFrame(segmentIndex);
        if (segmentIndex > 0 && recorder && typeof recorder.resume === "function") {
          logNativeRecorderStep("sequence-segment:resume-recorder", {
            segmentIndex: segmentIndex + 1,
          });
          await resumeRecorderForBoundary(recorder);
        }
        requestOutputFrame();
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
              if (stopped || stopRequested) {
                window.clearTimeout(timeoutId);
                resolve();
                return;
              }
              drawSequenceFrame(segmentIndex);
              const progressRatio = Math.max(
                0,
                Math.min(
                  1,
                  (
                    completedTimelineDuration +
                    Math.max(
                      0,
                      (video.currentTime - segment.sourceStart) /
                        Math.max(segment.clip.playbackSpeed, 0.001)
                    )
                  ) / Math.max(expectedWallDuration, 0.001)
                )
              );
              updateProgress(progressRatio);
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
      await finalizeAndStopRecording();
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
          if (stopped || stopRequested) return;
          const timelineTime = Math.max(
            0,
            (video.currentTime - singlePlan.sourceStart) /
              Math.max(singlePlan.clip.playbackSpeed, 0.001)
          );
          drawSingleFrame(timelineTime);
          const progressRatio = Math.max(
            0,
            Math.min(
              1,
              (video.currentTime - singlePlan.sourceStart) /
                Math.max(singlePlan.sourceDuration, 0.001)
            )
          );
          updateProgress(progressRatio);
          if (video.currentTime >= sourceEnd - (1 / Math.max(config.frameRate, 1))) {
            void finalizeAndStopRecording();
            return;
          }
          scheduleFrameDraw();
        });
      };

      scheduleFrameDraw();
      video.addEventListener("ended", () => {
        logNativeRecorderStep("video:ended", { currentTime: video.currentTime });
        void finalizeAndStopRecording();
      }, { once: true });
      video.addEventListener("pause", () => {
        if (stopped || stopRequested) return;
        if (video.currentTime >= sourceEnd - (1 / Math.max(config.frameRate, 1))) {
          logNativeRecorderStep("video:pause-at-end", { currentTime: video.currentTime });
          void finalizeAndStopRecording();
        }
      });
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
        if (stopped || stopRequested) return;
        logNativeRecorderStep("safety-timeout", { currentTime: video.currentTime });
        void finalizeAndStopRecording();
      }, Math.ceil(expectedWallDuration * 1000) + 3000);
    } else {
      logNativeRecorderStep("play:done", {
        currentTime: video.currentTime,
        playbackRate: video.playbackRate,
        paused: video.paused,
        segments: sequencePlan?.segments.length ?? 0,
      });
      void playSequenceSegments().catch((error) => {
        failRecording(error);
        stopRecordingNow();
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
