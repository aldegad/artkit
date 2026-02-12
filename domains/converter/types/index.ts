// ============================================
// Image Converter Domain Types
// ============================================

export type OutputFormat = "webp" | "jpeg" | "png";

export interface ImageFile {
  id: string;
  file: File;
  originalUrl: string;
  originalSize: number;
  width: number;
  height: number;
  convertedWidth?: number;
  convertedHeight?: number;
  convertedUrl?: string;
  convertedSize?: number;
  convertedBlob?: Blob;
}

// Utility function
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}
