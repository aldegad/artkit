export type VideoExportFormat = "mp4" | "mov";
export type VideoExportCompression = "high" | "balanced" | "small";

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
}

export interface VideoExportCompressionSettings {
  crf: number;
  preset: "medium" | "slow";
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
