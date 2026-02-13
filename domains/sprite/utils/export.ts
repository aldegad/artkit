import { SpriteFrame, SpriteTrack } from "../types";
import { compositeAllFrames, compositeFrame, type CompositedFrame } from "./compositor";

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
  const validFrames = frames.filter((f) => f.imageData && !f.disabled);
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
  link.download = `${projectName}-${validFrames.length}f.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================
// Sprite Sheet Export
// ============================================

export type SpriteSheetFormat = "png" | "webp";

export interface SpriteExportFrameSize {
  width: number;
  height: number;
}

interface SpriteSheetOptions {
  columns?: number; // Number of columns (auto-calculated if not provided)
  padding?: number; // Padding between frames
  backgroundColor?: string; // Background color (transparent by default)
  format?: SpriteSheetFormat; // Export format (default: png)
  quality?: number; // WebP quality 0-1 (default: 0.95)
  frameSize?: SpriteExportFrameSize; // Per-frame output size override
  appendFrameCount?: boolean; // Append frame count to file name (default: true)
}

interface CompositedFramesZipOptions {
  frameSize?: SpriteExportFrameSize; // Per-frame output size override
  appendFrameCount?: boolean; // Append frame count to file name (default: true)
}

function normalizeFrameSize(
  frameSize: SpriteExportFrameSize | undefined,
): SpriteExportFrameSize | null {
  if (!frameSize) return null;
  const width = Math.max(1, Math.floor(frameSize.width));
  const height = Math.max(1, Math.floor(frameSize.height));
  if (!Number.isFinite(width) || !Number.isFinite(height)) return null;
  return { width, height };
}

function resizeCanvas(
  source: HTMLCanvasElement,
  width: number,
  height: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(source, 0, 0, width, height);
  return canvas;
}

/**
 * Generate a sprite sheet from all frames
 */
export function generateSpriteSheet(
  frames: SpriteFrame[],
  options: SpriteSheetOptions = {},
): Promise<string | null> {
  return new Promise((resolve) => {
    const validFrames = frames.filter((f) => f.imageData && !f.disabled);
    if (validFrames.length === 0) {
      resolve(null);
      return;
    }

    const { padding = 0, backgroundColor, format = "png", quality = 0.95 } = options;
    const frameSize = normalizeFrameSize(options.frameSize);

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
      // Calculate frame dimensions
      let maxWidth = frameSize?.width ?? 0;
      let maxHeight = frameSize?.height ?? 0;
      if (!frameSize) {
        images.forEach((img) => {
          if (img.width > maxWidth) maxWidth = img.width;
          if (img.height > maxHeight) maxHeight = img.height;
        });
      }

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
        const x = col * cellWidth + padding;
        const y = row * cellHeight + padding;
        if (frameSize) {
          ctx.drawImage(img, x, y, frameSize.width, frameSize.height);
        } else {
          ctx.drawImage(
            img,
            x + (maxWidth - img.width) / 2,
            y + (maxHeight - img.height) / 2,
          );
        }
      });

      const mimeType = format === "webp" ? "image/webp" : "image/png";
      resolve(
        format === "webp"
          ? canvas.toDataURL(mimeType, quality)
          : canvas.toDataURL(mimeType),
      );
    });
  });
}

/**
 * Download sprite sheet as PNG or WebP
 */
export async function downloadSpriteSheet(
  frames: SpriteFrame[],
  projectName: string,
  options: SpriteSheetOptions = {},
): Promise<void> {
  const dataUrl = await generateSpriteSheet(frames, options);
  if (!dataUrl) return;

  const validCount = frames.filter((f) => f.imageData && !f.disabled).length;
  const ext = options.format === "webp" ? "webp" : "png";
  const appendFrameCount = options.appendFrameCount ?? true;
  const frameSuffix = appendFrameCount ? `-${validCount}f` : "";
  const link = document.createElement("a");
  link.download = `${projectName}${frameSuffix}.${ext}`;
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
  const validFrames = frames.filter((f) => f.imageData && !f.disabled);

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
  const validFrames = frames.filter((f) => f.imageData && !f.disabled);
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

// ============================================
// Multi-track Composited Export
// ============================================

/**
 * Generate a sprite sheet from composited multi-track frames
 */
export async function generateCompositedSpriteSheet(
  tracks: SpriteTrack[],
  options: SpriteSheetOptions = {},
): Promise<string | null> {
  const compositedFrames = await compositeAllFrames(tracks);
  if (compositedFrames.length === 0) return null;

  const { padding = 0, backgroundColor, format = "png", quality = 0.95 } = options;
  const frameSize = normalizeFrameSize(options.frameSize);

  const maxWidth = frameSize?.width ?? Math.max(...compositedFrames.map((f) => f.width));
  const maxHeight = frameSize?.height ?? Math.max(...compositedFrames.map((f) => f.height));

  const columns = options.columns || Math.ceil(Math.sqrt(compositedFrames.length));
  const rows = Math.ceil(compositedFrames.length / columns);

  const cellWidth = maxWidth + padding * 2;
  const cellHeight = maxHeight + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = columns * cellWidth;
  canvas.height = rows * cellHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  if (backgroundColor) {
    ctx.fillStyle = backgroundColor;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  compositedFrames.forEach((frame, index) => {
    const col = index % columns;
    const row = Math.floor(index / columns);
    const x = col * cellWidth + padding;
    const y = row * cellHeight + padding;

    if (frameSize) {
      ctx.drawImage(frame.canvas, x, y, frameSize.width, frameSize.height);
    } else {
      ctx.drawImage(
        frame.canvas,
        x + (maxWidth - frame.width) / 2,
        y + (maxHeight - frame.height) / 2,
      );
    }
  });

  const mimeType = format === "webp" ? "image/webp" : "image/png";
  return format === "webp"
    ? canvas.toDataURL(mimeType, quality)
    : canvas.toDataURL(mimeType);
}

/**
 * Download composited sprite sheet as PNG or WebP
 */
export async function downloadCompositedSpriteSheet(
  tracks: SpriteTrack[],
  projectName: string,
  options: SpriteSheetOptions = {},
): Promise<void> {
  const dataUrl = await generateCompositedSpriteSheet(tracks, options);
  if (!dataUrl) return;

  const maxFrameCount = Math.max(...tracks.filter((t) => t.visible).map((t) => t.frames.filter((f) => !f.disabled).length), 0);
  const ext = options.format === "webp" ? "webp" : "png";
  const appendFrameCount = options.appendFrameCount ?? true;
  const frameSuffix = appendFrameCount ? `-${maxFrameCount}f` : "";
  const link = document.createElement("a");
  link.download = `${projectName}${frameSuffix}.${ext}`;
  link.href = dataUrl;
  link.click();
}

/**
 * Download composited frames as ZIP
 */
export async function downloadCompositedFramesAsZip(
  tracks: SpriteTrack[],
  projectName: string,
  options: CompositedFramesZipOptions = {},
): Promise<void> {
  const compositedFrames = await compositeAllFrames(tracks);
  if (compositedFrames.length === 0) return;
  const frameSize = normalizeFrameSize(options.frameSize);

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  compositedFrames.forEach((cf, index) => {
    const sourceCanvas = frameSize
      ? resizeCanvas(cf.canvas, frameSize.width, frameSize.height)
      : cf.canvas;
    const base64Data = sourceCanvas.toDataURL("image/png").split(",")[1];
    const paddedIndex = String(index + 1).padStart(3, "0");
    zip.file(`${projectName}-${paddedIndex}.png`, base64Data, { base64: true });
  });

  const appendFrameCount = options.appendFrameCount ?? true;
  const frameSuffix = appendFrameCount ? `-${compositedFrames.length}f` : "";
  const blob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `${projectName}${frameSuffix}.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ============================================
// Layered Track Frames Export (Composable ZIP)
// ============================================

export interface LayeredTrackFramesExportOptions {
  fps: number;
  frameSize?: SpriteExportFrameSize;
  format?: SpriteSheetFormat;
  quality?: number;
  includeGuide?: boolean;
}

export interface LayeredTrackFramesExportProgress {
  stage: string;
  percent: number;
  detail?: string;
}

interface LayeredTrackFramesMetadata {
  meta: {
    format: "artkit-layered-frames";
    version: "1.0";
    fps: number;
    frameCount: number;
    canvasSize: { w: number; h: number };
    imageFormat: SpriteSheetFormat;
    layerOrder: "bottom-to-top";
  };
  layers: Array<{
    order: number;
    id: string;
    name: string;
    folder: string;
    opacity: number;
    loop: boolean;
    sourceFrameCount: number;
    canvasSize: { w: number; h: number };
  }>;
  frames: Array<{
    index: number;
    timelineIndex: number;
    file: string;
  }>;
}

function clampLayeredQuality(quality: number | undefined): number {
  if (!Number.isFinite(quality)) return 0.9;
  return Math.max(0.1, Math.min(1, quality as number));
}

function sanitizeLayerEntryName(value: string, fallback: string): string {
  const normalized = value
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || fallback;
}

function getTrackFrameIndexForTimeline(track: SpriteTrack, timelineIndex: number): number | null {
  if (track.frames.length === 0) return null;
  if (timelineIndex < track.frames.length) return timelineIndex;
  if (track.loop) return timelineIndex % track.frames.length;
  return null;
}

function getRenderableTimelineFrameIndices(tracks: SpriteTrack[]): number[] {
  const maxFrames = Math.max(0, ...tracks.map((track) => track.frames.length));
  if (maxFrames === 0) return [];

  const indices: number[] = [];
  for (let timelineIndex = 0; timelineIndex < maxFrames; timelineIndex++) {
    const hasRenderableLayer = tracks.some((track) => {
      const frameIndex = getTrackFrameIndexForTimeline(track, timelineIndex);
      if (frameIndex === null) return false;
      const frame = track.frames[frameIndex];
      return Boolean(frame?.imageData) && !frame?.disabled;
    });
    if (hasRenderableLayer) {
      indices.push(timelineIndex);
    }
  }

  return indices;
}

function createImageLoader() {
  const cache = new Map<string, Promise<HTMLImageElement>>();

  return (source: string): Promise<HTMLImageElement> => {
    const cached = cache.get(source);
    if (cached) return cached;

    const promise = new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => {
        cache.delete(source);
        reject(new Error("Failed to load image."));
      };
      image.src = source;
    });

    cache.set(source, promise);
    return promise;
  };
}

async function resolveLayeredOutputSize(
  tracks: SpriteTrack[],
  frameSize: SpriteExportFrameSize | undefined,
): Promise<SpriteExportFrameSize | null> {
  const normalized = normalizeFrameSize(frameSize);
  if (normalized) return normalized;

  const loadImage = createImageLoader();
  let maxRight = 0;
  let maxBottom = 0;

  for (const track of tracks) {
    for (const frame of track.frames) {
      if (!frame.imageData) continue;
      try {
        const image = await loadImage(frame.imageData);
        const right = (frame.offset?.x ?? 0) + image.width;
        const bottom = (frame.offset?.y ?? 0) + image.height;
        if (right > maxRight) maxRight = right;
        if (bottom > maxBottom) maxBottom = bottom;
      } catch {
        // ignore invalid image and continue
      }
    }
  }

  if (maxRight <= 0 || maxBottom <= 0) return null;
  return {
    width: Math.max(1, Math.floor(maxRight)),
    height: Math.max(1, Math.floor(maxBottom)),
  };
}

function generateLayeredFramesGuide(metadata: LayeredTrackFramesMetadata): string {
  const layers = metadata.layers
    .map((layer) => `- ${String(layer.order + 1).padStart(2, "0")}: \`${layer.name}\` -> \`${layer.folder}/\``)
    .join("\n");

  return `# Layered Frames Export Guide

This package exports each timeline frame per layer so you can composite at runtime.

## Layer Order (Bottom -> Top)
${layers}

## Playback
- FPS: ${metadata.meta.fps}
- Frame count: ${metadata.meta.frameCount}
- Canvas size: ${metadata.meta.canvasSize.w} x ${metadata.meta.canvasSize.h}
- Image format: ${metadata.meta.imageFormat.toUpperCase()}

## Render Rule
For each frame index:
1. Clear the render target.
2. Draw layer images in the order listed above (bottom to top).
3. Advance to the next frame at the configured FPS.

## Metadata
Use \`metadata.json\` to read exact layer ordering, frame mapping, and source timeline indices.

---
Generated by Artkit Sprite Editor
`;
}

/**
 * Export composable layered frames ZIP.
 * Structure:
 * - layers/01-<bottom-layer-name>/0001.(png|webp)
 * - layers/02-<next-layer-name>/0001.(png|webp)
 * - metadata.json
 * - GUIDE.md (optional)
 */
export async function downloadLayeredTrackFramesZip(
  tracks: SpriteTrack[],
  projectName: string,
  options: LayeredTrackFramesExportOptions,
  onProgress?: (progress: LayeredTrackFramesExportProgress) => void,
): Promise<void> {
  const format: SpriteSheetFormat = options.format === "webp" ? "webp" : "png";
  const ext = format === "webp" ? "webp" : "png";
  const quality = clampLayeredQuality(options.quality);
  const includeGuide = options.includeGuide ?? true;

  const visibleTracks = tracks.filter((track) => track.visible && track.frames.length > 0);
  if (visibleTracks.length === 0) return;

  const frameIndices = getRenderableTimelineFrameIndices(visibleTracks);
  if (frameIndices.length === 0) return;

  const orderedLayers = visibleTracks.slice().reverse(); // bottom -> top
  const outputSize = await resolveLayeredOutputSize(orderedLayers, options.frameSize);
  if (!outputSize) return;

  const report = (stage: string, percent: number, detail?: string) => {
    onProgress?.({ stage, percent, detail });
  };

  report("Preparing layers", 5, `${orderedLayers.length} layers, ${frameIndices.length} frames`);

  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  const loadImage = createImageLoader();
  const mimeType = format === "webp" ? "image/webp" : "image/png";

  const canvas = document.createElement("canvas");
  canvas.width = outputSize.width;
  canvas.height = outputSize.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const totalRenderSteps = Math.max(1, orderedLayers.length * frameIndices.length);
  let renderedSteps = 0;
  const layerFolderNames: string[] = [];

  for (let layerIndex = 0; layerIndex < orderedLayers.length; layerIndex++) {
    const track = orderedLayers[layerIndex];
    const fallbackName = `layer-${String(layerIndex + 1).padStart(2, "0")}`;
    const sanitizedName = sanitizeLayerEntryName(track.name || fallbackName, fallbackName);
    const layerFolder = `${String(layerIndex + 1).padStart(2, "0")}-${sanitizedName}`;
    layerFolderNames.push(layerFolder);

    for (let exportFrameIndex = 0; exportFrameIndex < frameIndices.length; exportFrameIndex++) {
      const timelineIndex = frameIndices[exportFrameIndex];
      ctx.clearRect(0, 0, outputSize.width, outputSize.height);

      const frameIndex = getTrackFrameIndexForTimeline(track, timelineIndex);
      if (frameIndex !== null) {
        const frame = track.frames[frameIndex];
        if (frame?.imageData && !frame.disabled) {
          try {
            const image = await loadImage(frame.imageData);
            ctx.globalAlpha = Math.max(0, Math.min(1, track.opacity / 100));
            ctx.drawImage(image, frame.offset?.x ?? 0, frame.offset?.y ?? 0);
          } finally {
            ctx.globalAlpha = 1;
          }
        }
      }

      const dataUrl = format === "webp"
        ? canvas.toDataURL(mimeType, quality)
        : canvas.toDataURL(mimeType);
      const base64Data = dataUrl.split(",")[1];
      const frameFile = `${String(exportFrameIndex + 1).padStart(4, "0")}.${ext}`;
      zip.file(`layers/${layerFolder}/${frameFile}`, base64Data, { base64: true });

      renderedSteps += 1;
      if (
        renderedSteps === 1
        || renderedSteps === totalRenderSteps
        || renderedSteps % Math.max(1, Math.floor(totalRenderSteps / 20)) === 0
      ) {
        const ratio = renderedSteps / totalRenderSteps;
        report("Rendering layer frames", 10 + ratio * 70, `${renderedSteps}/${totalRenderSteps}`);
      }
    }
  }

  const metadata: LayeredTrackFramesMetadata = {
    meta: {
      format: "artkit-layered-frames",
      version: "1.0",
      fps: Math.max(1, Math.round(options.fps || 12)),
      frameCount: frameIndices.length,
      canvasSize: { w: outputSize.width, h: outputSize.height },
      imageFormat: format,
      layerOrder: "bottom-to-top",
    },
    layers: orderedLayers.map((track, index) => ({
      order: index,
      id: track.id,
      name: track.name,
      folder: `layers/${layerFolderNames[index]}`,
      opacity: Math.max(0, Math.min(1, track.opacity / 100)),
      loop: track.loop,
      sourceFrameCount: track.frames.length,
      canvasSize: {
        w: Math.max(1, Math.round(track.canvasSize?.width ?? outputSize.width)),
        h: Math.max(1, Math.round(track.canvasSize?.height ?? outputSize.height)),
      },
    })),
    frames: frameIndices.map((timelineIndex, exportIndex) => ({
      index: exportIndex,
      timelineIndex,
      file: `${String(exportIndex + 1).padStart(4, "0")}.${ext}`,
    })),
  };

  report("Writing metadata", 84);
  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  if (includeGuide) {
    zip.file("GUIDE.md", generateLayeredFramesGuide(metadata));
  }

  report("Packaging ZIP", 92, "Compressing...");
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const link = document.createElement("a");
  link.download = `${projectName}-layered.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);

  report("Done", 100);
}

// ============================================
// Optimized Sprite Export (Static/Dynamic Split)
// ============================================


export { downloadOptimizedSpriteZip } from "./optimizedExport";
export type {
  OptimizedTargetFramework,
  OptimizedImageFormat,
  OptimizedExportOptions,
  OptimizedExportProgress,
} from "./optimizedExport";
