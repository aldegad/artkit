export type VideoExportFormat = "mp4" | "mov";
export type VideoExportCompression = "high" | "balanced" | "small";
export type VideoExportStrategy = "direct-single-video" | "frame-sequence";
export type DirectVideoExportSubStrategy = "copy" | "reencode";
export type DirectVideoExportEngine = "ffmpeg" | "native-recorder";

export interface VideoExportOptions {
  format?: VideoExportFormat;
  includeAudio?: boolean;
  compression?: VideoExportCompression;
  backgroundColor?: string;
}

export interface ExportProgressState {
  stage: string;
  percent: number;
  detail?: string;
  phasePercent?: number;
  elapsedSeconds?: number;
  isIndeterminate?: boolean;
  isStalled?: boolean;
  strategy?: VideoExportStrategy;
  strategyReason?: string;
  strategyEngine?: DirectVideoExportEngine;
  ffmpegLogSummary?: string;
}

export interface VideoExportCompressionSettings {
  crf: number;
  preset: "ultrafast" | "veryfast" | "medium" | "slow";
}

export interface ResolvedVideoExportConfig {
  format: VideoExportFormat;
  includeAudio: boolean;
  compression: VideoExportCompression;
  backgroundColor: string;
  compressionSettings: VideoExportCompressionSettings;
  exportStart: number;
  exportEnd: number;
  duration: number;
  frameRate: number;
  hasCustomRange: boolean;
  outputMimeType: string;
}

export interface CompletedVideoExport {
  outputBytes: Uint8Array;
  hasAudioInput: boolean;
  format: VideoExportFormat;
  compression: VideoExportCompression;
  duration: number;
  hasCustomRange: boolean;
  outputMimeType: string;
}

export interface VideoExportStrategyEligibility {
  directSingleVideo: boolean;
  directCopy: boolean;
}

export interface VideoExportStrategyDecision {
  strategy: VideoExportStrategy;
  subStrategy?: DirectVideoExportSubStrategy;
  engine?: DirectVideoExportEngine;
  reason: string;
  eligibility: VideoExportStrategyEligibility;
}
