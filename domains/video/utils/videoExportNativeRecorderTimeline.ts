import { renderCompositeFrame } from "./compositeRenderer";
import type { Size } from "@/shared/types";
import { getSourceTime, type Clip, type MaskData, type VideoClip, type VideoProject, type VideoTrack } from "../types";
import { VIDEO_EXPORT_EPSILON } from "./videoExportHelpers";
import { seekExportVideoFrame } from "./videoExportIO";
import {
  buildClipIndex,
  buildMaskIndex,
  findActiveMaskAtTime,
  findExportClipAtTime,
  preloadExportImages,
  preloadExportVideos,
  preloadMaskImages,
} from "./videoExportRenderAssets";
import type { ExportProgressState, ResolvedVideoExportConfig } from "./videoExportTypes";
import {
  createNativeRecorderProgressUpdater,
  getNativeRecorderBitrate,
  logNativeRecorderStep,
  setPitchPreservation,
  stopTracks,
  type NativeRecordedVideoExport,
  waitForVideoFrame,
  withTimeout,
} from "./videoExportNativeRecorderShared";

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
  const canvasVideoTrack = canvasStream.getVideoTracks()[0] as
    | (MediaStreamTrack & { requestFrame?: () => void })
    | undefined;
  const combinedStream: MediaStream = new MediaStream();
  for (const track of canvasStream.getVideoTracks()) {
    combinedStream.addTrack(track);
  }

  let recorder: MediaRecorder | null = null;
  let rafId: number | null = null;
  let progressTimer: number | null = null;
  let stopped = false;
  // Timeline clock starts when recording starts; preload/first-frame seek
  // time must not shift the rendered timeline or trigger early finalize.
  let recordingStartedAt = startedAt;
  let lastActiveVideoIds = new Set<string>();
  const chunks: Blob[] = [];
  const maxFrameTime = Math.max(config.exportStart, config.exportEnd - 0.5 / config.frameRate);
  const expectedWallDuration = Math.max(0.1, config.duration);
  const updateProgress = createNativeRecorderProgressUpdater({
    config,
    setExportProgress,
    startedAt,
    expectedWallDuration,
    detailPrefix: "브라우저 네이티브 타임라인 인코딩",
  });

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

      const tick = async () => {
        if (stopped) {
          return;
        }
        try {
          const elapsedSeconds = (Date.now() - recordingStartedAt) / 1000;
          const isFinalFrame = elapsedSeconds >= config.duration - frameDuration * 0.5;
          const timelineTime = isFinalFrame
            ? maxFrameTime
            : Math.min(maxFrameTime, config.exportStart + elapsedSeconds);
          await renderTimelineFrame(timelineTime);
          updateProgress(elapsedSeconds / Math.max(expectedWallDuration, 0.001));
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
        }
      };

      progressTimer = window.setInterval(() => {
        const elapsedSeconds = (Date.now() - recordingStartedAt) / 1000;
        updateProgress(elapsedSeconds / Math.max(expectedWallDuration, 0.001));
      }, 500);

      recordingStartedAt = Date.now();
      recorder!.start(1000);
      // Force the already-rendered first frame onto the capture track so the
      // encoder's first sample carries content at t≈0 instead of a black
      // lead-in until the first rAF render lands.
      if (hasCommittedFrame) {
        exportCtx.drawImage(committedFrameCanvas, 0, 0);
      }
      try {
        canvasVideoTrack?.requestFrame?.();
      } catch {}
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
