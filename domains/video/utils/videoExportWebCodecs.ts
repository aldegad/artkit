"use client";

import {
  MP4BoxBuffer,
  createFile,
  type ISOFile,
  type Movie,
  type Sample,
  type Track,
  type VisualSampleEntry,
} from "mp4box";
import type { Clip, VideoTrack } from "../types";
import {
  audioBufferToWavBlob,
  renderTimelineAudioBuffer,
  resolveVideoExportCompression,
  type DirectVideoExportPlan,
} from "./videoExportHelpers";
import {
  readBinaryOutputFile,
  unmountFfmpegMountPoint,
  writeBlobToFfmpegFile,
} from "./videoExportIO";
import type {
  CompletedVideoExport,
  ExportProgressState,
  ResolvedVideoExportConfig,
  VideoExportCompression,
} from "./videoExportTypes";

const HEADER_CHUNK_SIZE = 4 * 1024 * 1024;
const HEADER_PROBE_LIMIT = 64 * 1024 * 1024;
const SAMPLE_CHUNK_SIZE = 8 * 1024 * 1024;
const MICROS_PER_SECOND = 1_000_000;

interface WebCodecsSupport {
  supported: boolean;
  reason: string;
}

interface ParsedVideoTrack {
  file: ISOFile<unknown, unknown>;
  movie: Movie;
  track: Track;
}

interface MetadataBoxScanResult {
  foundMoov: boolean;
  foundFtyp: boolean;
  scannedTypes: string[];
}

interface EncodedVideoPayload {
  videoBlob: Blob;
  mimeType: string;
}

interface PreparedWebCodecsSource {
  blob: Blob;
  parsed: ParsedVideoTrack;
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0B";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)}${units[unitIndex]}`;
}

function logWebCodecsStep(step: string, extra?: Record<string, unknown>) {
  console.info("[VideoExport] webcodecs step", {
    step,
    ...(extra ?? {}),
  });
}

function toMicros(seconds: number): number {
  return Math.max(0, Math.round(seconds * MICROS_PER_SECOND));
}

function cloneUint8Array(data: BufferSource): Uint8Array {
  const view =
    data instanceof Uint8Array
      ? data
      : data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  return new Uint8Array(view);
}

function buildAvcDescriptionBytes(sampleEntry: VisualSampleEntry): Uint8Array {
  const avcC = sampleEntry.avcC;
  if (!avcC) {
    throw new Error("WebCodecs용 AVC 설정을 찾을 수 없습니다.");
  }

  const spsList = [...(avcC.SPS ?? [])];
  const ppsList = [...(avcC.PPS ?? [])];
  const totalLength =
    7 +
    spsList.reduce((sum, nalu) => sum + 2 + nalu.data.length, 0) +
    1 +
    ppsList.reduce((sum, nalu) => sum + 2 + nalu.data.length, 0);
  const bytes = new Uint8Array(totalLength);
  let offset = 0;

  bytes[offset++] = avcC.configurationVersion;
  bytes[offset++] = avcC.AVCProfileIndication;
  bytes[offset++] = avcC.profile_compatibility;
  bytes[offset++] = avcC.AVCLevelIndication;
  bytes[offset++] = 0xfc | (avcC.lengthSizeMinusOne & 0x03);
  bytes[offset++] = 0xe0 | (spsList.length & 0x1f);

  for (const sps of spsList) {
    bytes[offset++] = (sps.data.length >>> 8) & 0xff;
    bytes[offset++] = sps.data.length & 0xff;
    bytes.set(sps.data, offset);
    offset += sps.data.length;
  }

  bytes[offset++] = ppsList.length & 0xff;
  for (const pps of ppsList) {
    bytes[offset++] = (pps.data.length >>> 8) & 0xff;
    bytes[offset++] = pps.data.length & 0xff;
    bytes.set(pps.data, offset);
    offset += pps.data.length;
  }

  return bytes;
}

function createSyntheticQuickTimeFtypBuffer(): MP4BoxBuffer {
  const bytes = new Uint8Array(20);
  const view = new DataView(bytes.buffer);
  view.setUint32(0, bytes.byteLength);
  bytes.set([0x66, 0x74, 0x79, 0x70], 4); // ftyp
  bytes.set([0x71, 0x74, 0x20, 0x20], 8); // qt  
  view.setUint32(12, 0);
  bytes.set([0x71, 0x74, 0x20, 0x20], 16);
  return MP4BoxBuffer.fromArrayBuffer(bytes.buffer, 0);
}

async function readBlobChunk(blob: Blob, start: number, end: number): Promise<MP4BoxBuffer> {
  const arrayBuffer = await blob.slice(start, end).arrayBuffer();
  return MP4BoxBuffer.fromArrayBuffer(arrayBuffer, start);
}

async function readTopLevelBoxHeader(blob: Blob, offset: number): Promise<{
  size: number;
  type: string;
}> {
  const headerBuffer = await blob.slice(offset, Math.min(blob.size, offset + 16)).arrayBuffer();
  if (headerBuffer.byteLength < 8) {
    throw new Error("ISO BMFF box header가 불완전합니다.");
  }
  const view = new DataView(headerBuffer);
  const smallSize = view.getUint32(0);
  const type = String.fromCharCode(
    view.getUint8(4),
    view.getUint8(5),
    view.getUint8(6),
    view.getUint8(7)
  );

  if (smallSize === 1) {
    if (headerBuffer.byteLength < 16) {
      throw new Error("64-bit ISO BMFF box header를 읽지 못했습니다.");
    }
    const largeSize = Number(view.getBigUint64(8));
    return {
      size: largeSize,
      type,
    };
  }

  return {
    size: smallSize === 0 ? blob.size - offset : smallSize,
    type,
  };
}

async function appendMetadataBoxes(
  blob: Blob,
  file: ISOFile<unknown, unknown>
): Promise<MetadataBoxScanResult> {
  let offset = 0;
  let foundMoov = false;
  let foundFtyp = false;
  const scannedTypes: string[] = [];

  while (offset < blob.size) {
    const header = await readTopLevelBoxHeader(blob, offset);
    if (!Number.isFinite(header.size) || header.size <= 0) {
      throw new Error(`잘못된 ISO BMFF box 크기입니다. (${header.type})`);
    }
    if (scannedTypes.length < 12) {
      scannedTypes.push(header.type);
    }

    if (header.type === "ftyp" || header.type === "moov") {
      const boxBuffer = await readBlobChunk(blob, offset, offset + header.size);
      file.appendBuffer(boxBuffer, false);
      if (header.type === "ftyp") {
        foundFtyp = true;
      }
      if (header.type === "moov") {
        foundMoov = true;
        break;
      }
    }

    offset += header.size;
  }

  if (foundMoov && !foundFtyp) {
    file.appendBuffer(createSyntheticQuickTimeFtypBuffer(), false);
  }

  return {
    foundMoov,
    foundFtyp,
    scannedTypes,
  };
}

async function parseMp4VideoTrack(
  blob: Blob,
  maxHeaderBytes: number = Number.POSITIVE_INFINITY
): Promise<ParsedVideoTrack> {
  const file = createFile(true);
  let parsedMovie: Movie | null = null;
  let parseError: Error | null = null;
  file.onReady = (movie) => {
    parsedMovie = movie;
  };
  file.onError = (_module, message) => {
    parseError = new Error(message);
  };

  let metadataScanResult: MetadataBoxScanResult | null = null;
  try {
    metadataScanResult = await appendMetadataBoxes(blob, file);
  } catch {
    metadataScanResult = null;
  }

  let offset = 0;
  if (!metadataScanResult?.foundMoov) {
    while (offset < blob.size && !parsedMovie && !parseError && offset < maxHeaderBytes) {
      const nextEnd = Math.min(blob.size, offset + HEADER_CHUNK_SIZE);
      const buffer = await readBlobChunk(blob, offset, nextEnd);
      const nextOffset = file.appendBuffer(buffer, nextEnd >= blob.size);
      offset =
        typeof nextOffset === "number" && Number.isFinite(nextOffset) && nextOffset > offset
          ? nextOffset
          : nextEnd;
    }
  }

  if (!parsedMovie) {
    file.flush();
  }

  if (parseError) {
    throw parseError;
  }
  if (!parsedMovie) {
    if (metadataScanResult) {
      logWebCodecsStep("metadata:parse-failed", {
        foundMoov: metadataScanResult.foundMoov,
        foundFtyp: metadataScanResult.foundFtyp,
        scannedTypes: metadataScanResult.scannedTypes.join(","),
      });
    }
    throw new Error("MP4 메타데이터를 빠르게 읽지 못했습니다.");
  }

  const movie = parsedMovie as Movie;
  const videoTrack = movie.videoTracks[0] ?? movie.tracks.find((track: Track) => track.type === "video");
  if (!videoTrack) {
    throw new Error("비디오 트랙을 찾을 수 없습니다.");
  }

  return {
    file,
    movie,
    track: videoTrack,
  };
}

function resolveWebCodecsBitrate(params: {
  compression: VideoExportCompression;
  width: number;
  height: number;
  frameRate: number;
}): number {
  const compressionSettings = resolveVideoExportCompression(params.compression);
  const pixelFactor = Math.max(1, (params.width * params.height) / (1920 * 1080));
  const baseBitrate =
    compressionSettings.crf <= 14
      ? 18_000_000
      : compressionSettings.crf >= 24
        ? 7_000_000
        : 12_000_000;
  return Math.round(baseBitrate * Math.min(2.5, Math.max(1, pixelFactor * 0.8)));
}

async function resolveEncoderConfig(params: {
  codec: string;
  width: number;
  height: number;
  bitrate: number;
  frameRate: number;
}): Promise<VideoEncoderConfig> {
  const candidates = [params.codec, "avc1.64001f", "avc1.4d401f", "avc1.42E01E"];
  for (const codec of candidates) {
    const config: VideoEncoderConfig = {
      codec,
      width: params.width,
      height: params.height,
      bitrate: params.bitrate,
      framerate: params.frameRate,
      hardwareAcceleration: "prefer-hardware",
      latencyMode: "quality",
      avc: {
        format: "annexb",
      },
    };
    if (typeof VideoEncoder.isConfigSupported !== "function") {
      return config;
    }
    const support = await VideoEncoder.isConfigSupported(config);
    if (support.supported) {
      return support.config ?? config;
    }
  }
  throw new Error("이 브라우저는 현재 비디오 설정으로 WebCodecs H.264 인코딩을 지원하지 않습니다.");
}

async function resolveDecoderConfig(params: {
  codec: string;
  sampleEntry: VisualSampleEntry;
}): Promise<VideoDecoderConfig> {
  const config: VideoDecoderConfig = {
    codec: params.codec,
    optimizeForLatency: false,
    description: buildAvcDescriptionBytes(params.sampleEntry),
  };
  if (typeof VideoDecoder.isConfigSupported !== "function") {
    return config;
  }
  const support = await VideoDecoder.isConfigSupported(config);
  if (!support.supported) {
    const fallbackConfig: VideoDecoderConfig = {
      codec: params.codec,
      description: buildAvcDescriptionBytes(params.sampleEntry),
    };
    const fallback = await VideoDecoder.isConfigSupported(fallbackConfig);
    if (!fallback.supported) {
      throw new Error("이 브라우저는 현재 소스 코덱의 WebCodecs 디코딩을 지원하지 않습니다.");
    }
    return fallback.config ?? fallbackConfig;
  }
  return support.config ?? config;
}

export async function getWebCodecsDirectExportSupport(params: {
  config: ResolvedVideoExportConfig;
  sourceBlob: Blob;
  sourceExtension: string;
}): Promise<WebCodecsSupport> {
  const { config, sourceBlob, sourceExtension } = params;
  if (typeof window === "undefined") {
    return { supported: false, reason: "브라우저 환경이 아니어서 WebCodecs를 사용할 수 없습니다." };
  }
  if (config.format !== "mp4") {
    return { supported: false, reason: "WebCodecs 직접 경로는 현재 MP4 출력에서만 사용합니다." };
  }
  if (sourceExtension !== "mp4" && sourceExtension !== "mov") {
    return { supported: false, reason: "WebCodecs 직접 경로는 현재 MP4/MOV 입력에서만 사용합니다." };
  }
  if (
    typeof VideoEncoder === "undefined" ||
    typeof VideoDecoder === "undefined" ||
    typeof VideoFrame === "undefined" ||
    typeof EncodedVideoChunk === "undefined"
  ) {
    return { supported: false, reason: "이 브라우저는 필요한 WebCodecs API를 지원하지 않습니다." };
  }
  if (typeof document.createElement("canvas").getContext !== "function") {
    return { supported: false, reason: "이 브라우저는 WebCodecs용 캔버스를 준비할 수 없습니다." };
  }
  try {
    await parseMp4VideoTrack(sourceBlob, HEADER_PROBE_LIMIT);
  } catch (error) {
    return {
      supported: false,
      reason: `소스 메타데이터를 직접 읽지 못해 WebCodecs를 사용할 수 없습니다: ${(error as Error).message}`,
    };
  }

  return {
    supported: true,
    reason: "브라우저 WebCodecs로 비실시간 직접 재인코딩할 수 있습니다.",
  };
}

async function prepareWebCodecsSourceBlob(params: {
  sourceBlob: Blob;
}): Promise<PreparedWebCodecsSource> {
  const { sourceBlob } = params;
  const parsed = await parseMp4VideoTrack(sourceBlob, HEADER_PROBE_LIMIT);
  return {
    blob: sourceBlob,
    parsed,
  };
}

async function runWebCodecsVideoEncode(params: {
  plan: DirectVideoExportPlan;
  sourceBlob: Blob;
  sourceExtension: string;
  config: ResolvedVideoExportConfig;
  getFFmpeg: () => Promise<import("@ffmpeg/ffmpeg").FFmpeg>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<EncodedVideoPayload> {
  const { plan, sourceBlob, sourceExtension, config, getFFmpeg, setExportProgress } = params;
  setExportProgress({
    stage: "Preparing export",
    percent: 3,
    detail: `WebCodecs 준비 중 · 메타데이터 읽는 중 (${formatBytes(sourceBlob.size)})`,
  });

  const prepared = await prepareWebCodecsSourceBlob({
    sourceBlob,
  });
  const parsed = prepared.parsed;
  const preparedSourceBlob = prepared.blob;
  const totalFrames = Math.max(1, Math.ceil(config.duration * config.frameRate));
  const bitrate = resolveWebCodecsBitrate({
    compression: config.compression,
    width: plan.cropWidth,
    height: plan.cropHeight,
    frameRate: config.frameRate,
  });
  logWebCodecsStep("track:ready", {
    codec: parsed.track.codec,
    trackId: parsed.track.id,
    duration: parsed.track.duration,
    timescale: parsed.track.timescale,
    progressive: parsed.movie.isProgressive,
  });

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = plan.cropWidth;
  outputCanvas.height = plan.cropHeight;
  const ctx = outputCanvas.getContext("2d", { alpha: false });
  if (!ctx) {
    throw new Error("WebCodecs export 캔버스를 만들 수 없습니다.");
  }

  const encodedChunks: Uint8Array[] = [];
  let encodedBytes = 0;
  let encodedFrameCount = 0;
  let hasRenderedFrame = false;

  const firstSample = parsed.file.getTrackSample(parsed.track.id, 1);
  const sampleEntry = firstSample.description as VisualSampleEntry;
  const decoderConfig = await resolveDecoderConfig({
    codec: parsed.track.codec,
    sampleEntry,
  });
  const encoderConfig = await resolveEncoderConfig({
    codec: parsed.track.codec,
    width: plan.cropWidth,
    height: plan.cropHeight,
    bitrate,
    frameRate: config.frameRate,
  });

  const encoder = new VideoEncoder({
    output: (chunk) => {
      const bytes = new Uint8Array(chunk.byteLength);
      chunk.copyTo(bytes);
      encodedChunks.push(bytes);
      encodedBytes += bytes.byteLength;
    },
    error: (error) => {
      throw error;
    },
  });
  encoder.configure(encoderConfig);

  const sourceStartUs = toMicros(plan.sourceStart);
  const sourceEndUs = toMicros(plan.sourceStart + plan.sourceDuration);
  const sourceStepUs = Math.max(1, Math.round((plan.clip.playbackSpeed / config.frameRate) * MICROS_PER_SECOND));
  const frameIntervalUs = Math.max(1, Math.round(MICROS_PER_SECOND / config.frameRate));
  let nextTargetUs = sourceStartUs;
  let lastRenderedTimestampUs = sourceStartUs;

  const updateEncodeProgress = () => {
    const ratio = encodedFrameCount / totalFrames;
    setExportProgress({
      stage: `Encoding ${config.format.toUpperCase()}`,
      percent: Math.min(84, 8 + ratio * 76),
      detail: `WebCodecs 비디오 인코딩 ${Math.round(ratio * 100)}% · ${encodedFrameCount}/${totalFrames}`,
      phasePercent: Math.round(ratio * 100),
      ffmpegLogSummary: `encoded=${encodedFrameCount} frames · ${Math.round(encodedBytes / 1024 / 1024)}MB`,
    });
  };

  const encodeRenderedFrame = (timestampUs: number) => {
    const frame = new VideoFrame(outputCanvas, { timestamp: timestampUs });
    encoder.encode(frame, {
      keyFrame: encodedFrameCount === 0 || encodedFrameCount % Math.max(config.frameRate * 2, 1) === 0,
    });
    frame.close();
    encodedFrameCount += 1;
    hasRenderedFrame = true;
    lastRenderedTimestampUs = timestampUs;
    if (encodedFrameCount % 15 === 0 || encodedFrameCount >= totalFrames) {
      updateEncodeProgress();
    }
  };

  const decoder = new VideoDecoder({
    output: (frame) => {
      try {
        const sourceTimestampUs = Math.max(0, frame.timestamp);
        if (sourceTimestampUs < sourceStartUs || encodedFrameCount >= totalFrames) {
          return;
        }
        ctx.drawImage(
          frame,
          plan.cropX,
          plan.cropY,
          plan.cropWidth,
          plan.cropHeight,
          0,
          0,
          plan.cropWidth,
          plan.cropHeight
        );
        while (encodedFrameCount < totalFrames && sourceTimestampUs >= nextTargetUs) {
          encodeRenderedFrame(encodedFrameCount * frameIntervalUs);
          nextTargetUs += sourceStepUs;
        }
      } finally {
        frame.close();
      }
    },
    error: (error) => {
      throw error;
    },
  });
  decoder.configure(decoderConfig);

  parsed.file.setExtractionOptions(parsed.track.id, undefined, { nbSamples: 64 });
  let processingQueue = Promise.resolve();
  let sampleDecodeCount = 0;

  parsed.file.onSamples = (trackId, _user, samples) => {
    if (trackId !== parsed.track.id || samples.length === 0) return;
    processingQueue = processingQueue.then(async () => {
      for (const sample of samples) {
        if (!sample.data) continue;
        const sampleTimeUs = Math.round((sample.cts / sample.timescale) * MICROS_PER_SECOND);
        if (sampleTimeUs > sourceEndUs + sourceStepUs || encodedFrameCount >= totalFrames) {
          continue;
        }
        if (sampleTimeUs + Math.round((sample.duration / sample.timescale) * MICROS_PER_SECOND) < sourceStartUs) {
          continue;
        }
        decoder.decode(
          new EncodedVideoChunk({
            type: sample.is_sync ? "key" : "delta",
            timestamp: sampleTimeUs,
            duration: Math.max(1, Math.round((sample.duration / sample.timescale) * MICROS_PER_SECOND)),
            data: cloneUint8Array(sample.data),
          })
        );
        sampleDecodeCount += 1;
      }
      parsed.file.releaseUsedSamples(parsed.track.id, samples[samples.length - 1].number);
    });
  };

  const seekResult = parsed.file.seek(plan.sourceStart, true);
  parsed.file.start();
  let offset = Math.max(seekResult.offset ?? 0, 0);
  logWebCodecsStep("extract:start", {
    seekOffset: offset,
    seekTime: seekResult.time,
    totalFrames,
  });

  while (offset < preparedSourceBlob.size && encodedFrameCount < totalFrames) {
    const nextEnd = Math.min(preparedSourceBlob.size, offset + SAMPLE_CHUNK_SIZE);
    const buffer = await readBlobChunk(preparedSourceBlob, offset, nextEnd);
    const nextOffset = parsed.file.appendBuffer(buffer, nextEnd >= preparedSourceBlob.size);
    await processingQueue;
    if (encodedFrameCount >= totalFrames) {
      break;
    }
    offset =
      typeof nextOffset === "number" && Number.isFinite(nextOffset) && nextOffset > offset
        ? nextOffset
        : nextEnd;
    if (nextEnd >= preparedSourceBlob.size) {
      break;
    }
  }

  parsed.file.flush();
  await processingQueue;
  await decoder.flush();

  if (hasRenderedFrame && encodedFrameCount < totalFrames) {
    while (encodedFrameCount < totalFrames) {
      encodeRenderedFrame(lastRenderedTimestampUs + frameIntervalUs);
      lastRenderedTimestampUs += frameIntervalUs;
    }
  }

  await encoder.flush();
  encoder.close();
  decoder.close();

  logWebCodecsStep("encode:done", {
    decodedSamples: sampleDecodeCount,
    encodedFrames: encodedFrameCount,
    encodedBytes,
  });

  const outputBytes = new Uint8Array(encodedBytes);
  let cursor = 0;
  for (const chunk of encodedChunks) {
    outputBytes.set(chunk, cursor);
    cursor += chunk.byteLength;
  }

  return {
    videoBlob: new Blob([outputBytes], { type: "video/h264" }),
    mimeType: "video/h264",
  };
}

export async function runWebCodecsDirectExport(params: {
  plan: DirectVideoExportPlan;
  sourceBlob: Blob;
  sourceExtension: string;
  config: ResolvedVideoExportConfig;
  clips: Clip[];
  tracks: VideoTrack[];
  audioBufferCache: Map<string, AudioBuffer | null>;
  getFFmpeg: () => Promise<import("@ffmpeg/ffmpeg").FFmpeg>;
  setExportProgress: (value: ExportProgressState) => void;
}): Promise<CompletedVideoExport> {
  const { plan, sourceBlob, config, clips, tracks, audioBufferCache, getFFmpeg, setExportProgress } = params;
  const encodedVideo = await runWebCodecsVideoEncode({
    plan,
    sourceBlob,
    sourceExtension: params.sourceExtension,
    config,
    getFFmpeg,
    setExportProgress,
  });

  setExportProgress({
    stage: "Muxing video",
    percent: 86,
    detail: "WebCodecs 비디오를 MP4로 정리하는 중...",
  });

  const ffmpeg = await getFFmpeg();
  const filePrefix = `webcodecs-export-${Date.now()}-${Math.round(Math.random() * 10000)}`;
  const outputFileName = `${filePrefix}.${config.format}`;
  const videoFileName = `${filePrefix}.h264`;
  const wavFileName = `${filePrefix}.wav`;
  const cleanupFileNames = [outputFileName, videoFileName];
  const cleanupMountPoints: string[] = [];

  try {
    await writeBlobToFfmpegFile(ffmpeg, videoFileName, encodedVideo.videoBlob);

    let hasAudioInput = false;
    if (config.includeAudio && plan.includeAudio) {
      setExportProgress({
        stage: "Rendering audio",
        percent: 90,
        detail: "오디오를 렌더링하는 중...",
      });
      const mixedAudio = await renderTimelineAudioBuffer({
        clips,
        tracks,
        timelineStart: config.exportStart,
        projectDuration: config.duration,
        sourceBufferCache: audioBufferCache,
      });
      if (mixedAudio) {
        hasAudioInput = true;
        cleanupFileNames.push(wavFileName);
        await writeBlobToFfmpegFile(ffmpeg, wavFileName, audioBufferToWavBlob(mixedAudio));
      }
    }

    const args = [
      "-framerate",
      String(config.frameRate),
      "-i",
      videoFileName,
      ...(hasAudioInput ? ["-i", wavFileName] : []),
      "-map",
      "0:v:0",
      ...(hasAudioInput ? ["-map", "1:a:0"] : ["-an"]),
      "-c:v",
      "copy",
      ...(hasAudioInput ? ["-c:a", "aac", "-b:a", "192k", "-shortest"] : []),
      "-movflags",
      "+faststart",
      outputFileName,
    ];

    const exitCode = await ffmpeg.exec(args);
    if (exitCode !== 0) {
      throw new Error(`WebCodecs 출력 정리에 실패했습니다. (ffmpeg exit ${exitCode})`);
    }

    const outputBytes = await readBinaryOutputFile(ffmpeg, outputFileName);
    return {
      outputBytes,
      hasAudioInput,
      format: config.format,
      compression: config.compression,
      duration: config.duration,
      hasCustomRange: config.hasCustomRange,
      outputMimeType: config.outputMimeType,
    };
  } finally {
    await Promise.all(
      cleanupFileNames.map((fileName) => ffmpeg.deleteFile(fileName).catch(() => {}))
    );
    await Promise.all(
      cleanupMountPoints.map((mountPoint) => unmountFfmpegMountPoint(ffmpeg, mountPoint))
    );
  }
}
