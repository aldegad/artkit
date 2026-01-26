import { SpriteFrame } from "../types";

// ============================================
// Single Frame Export
// ============================================

/**
 * Download a single frame as PNG
 */
export function downloadFrameAsPng(frame: SpriteFrame, filename: string): void {
  if (!frame.imageData) return;

  const link = document.createElement("a");
  link.download = `${filename}.png`;
  link.href = frame.imageData;
  link.click();
}

// ============================================
// Multiple Frames Export (ZIP)
// ============================================

/**
 * Download all frames as a ZIP file
 * Uses JSZip library dynamically loaded from CDN
 */
export async function downloadFramesAsZip(
  frames: SpriteFrame[],
  projectName: string,
): Promise<void> {
  const validFrames = frames.filter((f) => f.imageData);
  if (validFrames.length === 0) return;

  // Dynamically import JSZip
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  validFrames.forEach((frame, index) => {
    if (!frame.imageData) return;

    // Remove data URL prefix to get raw base64
    const base64Data = frame.imageData.split(",")[1];
    const paddedIndex = String(index + 1).padStart(3, "0");
    zip.file(`${projectName}-${paddedIndex}.png`, base64Data, { base64: true });
  });

  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${projectName}-sprites.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================
// Sprite Sheet Export
// ============================================

interface SpriteSheetOptions {
  columns?: number; // Number of columns (auto-calculated if not provided)
  padding?: number; // Padding between frames
  backgroundColor?: string; // Background color (transparent by default)
}

/**
 * Generate a sprite sheet from all frames
 */
export function generateSpriteSheet(
  frames: SpriteFrame[],
  options: SpriteSheetOptions = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const validFrames = frames.filter((f) => f.imageData);
    if (validFrames.length === 0) {
      resolve(null);
      return;
    }

    const { padding = 0, backgroundColor } = options;

    // Load all images first
    const imagePromises = validFrames.map((frame) => {
      return new Promise<HTMLImageElement>((resolveImg) => {
        const img = new Image();
        img.onload = () => resolveImg(img);
        img.onerror = () => resolveImg(img);
        img.src = frame.imageData!;
      });
    });

    Promise.all(imagePromises).then((images) => {
      // Calculate max frame dimensions
      let maxWidth = 0;
      let maxHeight = 0;
      images.forEach((img) => {
        if (img.width > maxWidth) maxWidth = img.width;
        if (img.height > maxHeight) maxHeight = img.height;
      });

      // Calculate grid dimensions
      const columns = options.columns || Math.ceil(Math.sqrt(validFrames.length));
      const rows = Math.ceil(validFrames.length / columns);

      // Create canvas
      const canvas = document.createElement("canvas");
      const cellWidth = maxWidth + padding * 2;
      const cellHeight = maxHeight + padding * 2;
      canvas.width = columns * cellWidth;
      canvas.height = rows * cellHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(null);
        return;
      }

      // Fill background if specified
      if (backgroundColor) {
        ctx.fillStyle = backgroundColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      // Draw each frame
      images.forEach((img, index) => {
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = col * cellWidth + padding + (maxWidth - img.width) / 2;
        const y = row * cellHeight + padding + (maxHeight - img.height) / 2;
        ctx.drawImage(img, x, y);
      });

      resolve(canvas.toDataURL("image/png"));
    });
  });
}

/**
 * Download sprite sheet as PNG
 */
export async function downloadSpriteSheet(
  frames: SpriteFrame[],
  projectName: string,
  options: SpriteSheetOptions = {},
): Promise<void> {
  const dataUrl = await generateSpriteSheet(frames, options);
  if (!dataUrl) return;

  const link = document.createElement("a");
  link.download = `${projectName}-spritesheet.png`;
  link.href = dataUrl;
  link.click();
}

// ============================================
// Project Metadata Export (JSON without images)
// ============================================

interface ProjectMetadata {
  name: string;
  fps: number;
  frameCount: number;
  frames: Array<{
    id: number;
    name: string;
    width: number;
    height: number;
    offset: { x: number; y: number };
  }>;
}

/**
 * Export project metadata as JSON (for game integration)
 */
export function exportProjectMetadata(
  frames: SpriteFrame[],
  projectName: string,
  fps: number,
): ProjectMetadata {
  const validFrames = frames.filter((f) => f.imageData);

  return {
    name: projectName,
    fps,
    frameCount: validFrames.length,
    frames: validFrames.map((frame, index) => {
      // Calculate frame dimensions from imageData
      let width = 0;
      let height = 0;

      if (frame.imageData) {
        // Parse dimensions from base64 if needed
        // This is a rough estimate - actual dimensions come from the image
        const img = new Image();
        img.src = frame.imageData;
        width = img.width || 0;
        height = img.height || 0;
      }

      return {
        id: frame.id,
        name: frame.name || `frame-${index + 1}`,
        width,
        height,
        offset: frame.offset,
      };
    }),
  };
}

/**
 * Download project metadata as JSON
 */
export function downloadProjectMetadata(
  frames: SpriteFrame[],
  projectName: string,
  fps: number,
): void {
  const metadata = exportProjectMetadata(frames, projectName, fps);
  const json = JSON.stringify(metadata, null, 2);
  const blob = new Blob([json], { type: "application/json" });

  const link = document.createElement("a");
  link.download = `${projectName}-metadata.json`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================
// Full Project Export (with images as separate files)
// ============================================

export interface ExportedProject {
  metadata: ProjectMetadata;
  images: Record<string, string>; // filename -> base64
}

/**
 * Export full project as ZIP with images and metadata
 */
export async function downloadFullProject(
  frames: SpriteFrame[],
  projectName: string,
  fps: number,
): Promise<void> {
  const validFrames = frames.filter((f) => f.imageData);
  if (validFrames.length === 0) return;

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  // Add frames folder
  const framesFolder = zip.folder("frames");

  // Add each frame
  validFrames.forEach((frame, index) => {
    if (!frame.imageData) return;
    const base64Data = frame.imageData.split(",")[1];
    const paddedIndex = String(index + 1).padStart(3, "0");
    framesFolder?.file(`${paddedIndex}.png`, base64Data, { base64: true });
  });

  // Add metadata
  const metadata = exportProjectMetadata(frames, projectName, fps);
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  // Generate and download
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${projectName}.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}
