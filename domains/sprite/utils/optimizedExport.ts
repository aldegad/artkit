import { SpriteTrack } from "../types";
import { compositeFrame } from "./compositor";
import { clampExportQuality } from "./exportQuality";

export type OptimizedTargetFramework = "canvas" | "phaser" | "pixi" | "custom";
export type OptimizedImageFormat = "png" | "webp";
const OPTIMIZED_THRESHOLD_MIN = 0;
const OPTIMIZED_THRESHOLD_MAX = 20;
const OPTIMIZED_TILE_SIZE_MIN = 8;
const OPTIMIZED_TILE_SIZE_MAX = 128;
const OPTIMIZED_TILE_SIZE_DEFAULT = 32;

interface SpriteExportFrameSize {
  width: number;
  height: number;
}

export interface OptimizedExportOptions {
  threshold: number;
  target: OptimizedTargetFramework;
  includeGuide: boolean;
  fps: number;
  frameSize?: SpriteExportFrameSize;
  imageFormat?: OptimizedImageFormat;
  imageQuality?: number;
  tileSize?: number;
}

export interface OptimizedExportProgress {
  stage: string;
  percent: number;
  detail?: string;
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

interface OptimizedSpriteMetadata {
  meta: {
    format: "artkit-optimized-sprite";
    version: "1.0";
    fps: number;
    sourceSize: { w: number; h: number };
    frameCount: number;
    target: string;
  };
  base: {
    file: string;
    size: { w: number; h: number };
  };
  delta: {
    file: string;
    tileSize: number;
    atlas: {
      columns: number;
      rows: number;
      patchCount: number;
    };
  } | null;
  frames: Array<{
    index: number;
    patches: Array<{
      atlasIndex: number;
      x: number;
      y: number;
      w: number;
      h: number;
    }>;
  }>;
}

/**
 * Collect candidate timeline indices that are potentially renderable.
 * Uses the same disabled-frame filtering semantics as compositeAllFrames.
 */
function getCandidateFrameIndices(tracks: SpriteTrack[]): number[] {
  const maxFrames = Math.max(0, ...tracks.map((t) => t.frames.length));
  if (maxFrames === 0) return [];

  const visibleTracks = tracks.filter((t) => t.visible && t.frames.length > 0);
  const indices: number[] = [];

  for (let i = 0; i < maxFrames; i++) {
    const allDisabled = visibleTracks.every((t) => {
      const idx = i < t.frames.length ? i : t.loop ? i % t.frames.length : -1;
      return idx === -1 || t.frames[idx]?.disabled;
    });
    if (!allDisabled) {
      indices.push(i);
    }
  }

  return indices;
}

function clampOptimizedThreshold(value: number): number {
  if (!Number.isFinite(value)) return OPTIMIZED_THRESHOLD_MIN;
  return Math.max(
    OPTIMIZED_THRESHOLD_MIN,
    Math.min(OPTIMIZED_THRESHOLD_MAX, Math.floor(value)),
  );
}

function clampOptimizedTileSize(value: number | undefined): number {
  if (!Number.isFinite(value)) return OPTIMIZED_TILE_SIZE_DEFAULT;
  const rounded = Math.round(value as number);
  return Math.max(OPTIMIZED_TILE_SIZE_MIN, Math.min(OPTIMIZED_TILE_SIZE_MAX, rounded));
}

function normalizeOptimizedImageFormat(value: OptimizedImageFormat | undefined): OptimizedImageFormat {
  return value === "webp" ? "webp" : "png";
}

function clampOptimizedImageQuality(value: number | undefined): number {
  return clampExportQuality(value);
}

function getOptimizedImageMimeType(format: OptimizedImageFormat): string {
  return format === "webp" ? "image/webp" : "image/png";
}

function encodeCanvasBase64(
  canvas: HTMLCanvasElement,
  format: OptimizedImageFormat,
  quality: number,
): string {
  const mimeType = getOptimizedImageMimeType(format);
  const dataUrl = format === "webp"
    ? canvas.toDataURL(mimeType, quality)
    : canvas.toDataURL(mimeType);
  return dataUrl.split(",")[1];
}

interface TileDeltaPatch {
  atlasIndex: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface TileDeltaFrame {
  index: number;
  patches: TileDeltaPatch[];
}

function collectChangedTileRects(
  framePixels: Uint8ClampedArray,
  referencePixels: Uint8ClampedArray,
  staticMask: Uint8Array,
  width: number,
  height: number,
  tileSize: number,
  threshold: number,
): Array<{ x: number; y: number; w: number; h: number }> {
  const changedTiles: Array<{ x: number; y: number; w: number; h: number }> = [];

  for (let y = 0; y < height; y += tileSize) {
    for (let x = 0; x < width; x += tileSize) {
      const w = Math.min(tileSize, width - x);
      const h = Math.min(tileSize, height - y);
      let changed = false;

      for (let ty = 0; ty < h && !changed; ty++) {
        const py = y + ty;
        const rowOffset = py * width;
        for (let tx = 0; tx < w; tx++) {
          const px = x + tx;
          const pixelIndex = rowOffset + px;
          const rgba = pixelIndex * 4;

          const frameR = framePixels[rgba];
          const frameG = framePixels[rgba + 1];
          const frameB = framePixels[rgba + 2];
          const frameA = framePixels[rgba + 3];

          const isStatic = staticMask[pixelIndex] === 1;
          const baseR = isStatic ? referencePixels[rgba] : 0;
          const baseG = isStatic ? referencePixels[rgba + 1] : 0;
          const baseB = isStatic ? referencePixels[rgba + 2] : 0;
          const baseA = isStatic ? referencePixels[rgba + 3] : 0;

          const diff =
            Math.abs(frameR - baseR) +
            Math.abs(frameG - baseG) +
            Math.abs(frameB - baseB) +
            Math.abs(frameA - baseA);

          if (diff > threshold) {
            changed = true;
            break;
          }
        }
      }

      if (changed) {
        changedTiles.push({ x, y, w, h });
      }
    }
  }

  return changedTiles;
}

async function collectTileDeltaFrames(
  tracks: SpriteTrack[],
  frameIndices: number[],
  outputSize: SpriteExportFrameSize,
  referencePixels: Uint8ClampedArray,
  staticMask: Uint8Array,
  tileSize: number,
  threshold: number,
  report: (stage: string, percent: number, detail?: string) => void,
): Promise<{ frames: TileDeltaFrame[]; patchCount: number }> {
  const frames: TileDeltaFrame[] = [];
  let patchCount = 0;
  const total = Math.max(1, frameIndices.length);

  for (let i = 0; i < frameIndices.length; i++) {
    const timelineFrameIndex = frameIndices[i];
    const composited = await compositeFrame(
      tracks,
      timelineFrameIndex,
      outputSize,
      { includeDataUrl: false },
    );
    if (!composited) {
      frames.push({ index: i, patches: [] });
      continue;
    }

    const ctx = composited.canvas.getContext("2d");
    if (!ctx) {
      frames.push({ index: i, patches: [] });
      continue;
    }

    const framePixels = ctx.getImageData(0, 0, outputSize.width, outputSize.height).data;
    const tileRects = collectChangedTileRects(
      framePixels,
      referencePixels,
      staticMask,
      outputSize.width,
      outputSize.height,
      tileSize,
      threshold,
    );

    const patches: TileDeltaPatch[] = tileRects.map((rect) => ({
      atlasIndex: patchCount++,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
    }));
    frames.push({ index: i, patches });

    if (i % 4 === 0 || i === frameIndices.length - 1) {
      const ratio = (i + 1) / total;
      report(
        "Analyzing tiles",
        55 + ratio * 15,
        `${i + 1}/${total} (${patchCount} patches)`,
      );
    }
  }

  return { frames, patchCount };
}

async function generateTileDeltaAtlas(
  tracks: SpriteTrack[],
  frameIndices: number[],
  outputSize: SpriteExportFrameSize,
  tileSize: number,
  frames: TileDeltaFrame[],
  patchCount: number,
  report: (stage: string, percent: number, detail?: string) => void,
): Promise<{ canvas: HTMLCanvasElement; columns: number; rows: number } | null> {
  if (patchCount <= 0) return null;

  const columns = Math.max(1, Math.ceil(Math.sqrt(patchCount)));
  const rows = Math.max(1, Math.ceil(patchCount / columns));
  const canvas = document.createElement("canvas");
  canvas.width = columns * tileSize;
  canvas.height = rows * tileSize;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  const total = Math.max(1, frameIndices.length);
  for (let i = 0; i < frameIndices.length; i++) {
    const frameMeta = frames[i];
    if (!frameMeta || frameMeta.patches.length === 0) {
      continue;
    }

    const timelineFrameIndex = frameIndices[i];
    const composited = await compositeFrame(
      tracks,
      timelineFrameIndex,
      outputSize,
      { includeDataUrl: false },
    );
    if (!composited) continue;

    for (const patch of frameMeta.patches) {
      const atlasCol = patch.atlasIndex % columns;
      const atlasRow = Math.floor(patch.atlasIndex / columns);
      const destX = atlasCol * tileSize;
      const destY = atlasRow * tileSize;

      ctx.drawImage(
        composited.canvas,
        patch.x,
        patch.y,
        patch.w,
        patch.h,
        destX,
        destY,
        patch.w,
        patch.h,
      );
    }

    if (i % 4 === 0 || i === frameIndices.length - 1) {
      const ratio = (i + 1) / total;
      report(
        "Generating tile atlas",
        72 + ratio * 10,
        `${i + 1}/${total}`,
      );
    }
  }

  return { canvas, columns, rows };
}

async function resolveOptimizedOutputSize(
  tracks: SpriteTrack[],
  frameIndices: number[],
  frameSize: SpriteExportFrameSize | undefined,
  report: (stage: string, percent: number, detail?: string) => void,
): Promise<{ outputSize: SpriteExportFrameSize; frameIndices: number[] } | null> {
  const normalized = normalizeFrameSize(frameSize);
  if (normalized) {
    return { outputSize: normalized, frameIndices };
  }

  let maxWidth = 0;
  let maxHeight = 0;
  const renderableFrameIndices: number[] = [];
  const total = Math.max(1, frameIndices.length);

  for (let i = 0; i < frameIndices.length; i++) {
    const timelineFrameIndex = frameIndices[i];
    const composited = await compositeFrame(
      tracks,
      timelineFrameIndex,
      undefined,
      { includeDataUrl: false },
    );
    if (!composited) continue;
    renderableFrameIndices.push(timelineFrameIndex);
    if (composited.width > maxWidth) maxWidth = composited.width;
    if (composited.height > maxHeight) maxHeight = composited.height;

    if (i % 8 === 0 || i === frameIndices.length - 1) {
      const ratio = (i + 1) / total;
      report(
        "Resolving canvas size",
        5 + ratio * 10,
        `${i + 1}/${total}`,
      );
    }
  }

  if (renderableFrameIndices.length === 0 || maxWidth === 0 || maxHeight === 0) {
    return null;
  }

  return {
    outputSize: { width: maxWidth, height: maxHeight },
    frameIndices: renderableFrameIndices,
  };
}

async function analyzeStaticRegionsStreaming(
  tracks: SpriteTrack[],
  frameIndices: number[],
  outputSize: SpriteExportFrameSize,
  threshold: number,
  report: (stage: string, percent: number, detail?: string) => void,
): Promise<{
  staticMask: Uint8Array;
  width: number;
  height: number;
  referencePixels: Uint8ClampedArray;
  frameIndices: number[];
} | null> {
  const width = outputSize.width;
  const height = outputSize.height;
  const totalPixels = width * height;
  const staticMask = new Uint8Array(totalPixels);
  staticMask.fill(1);
  const resolvedFrameIndices: number[] = [];
  let referencePixels: Uint8ClampedArray | null = null;
  const total = Math.max(1, frameIndices.length);

  for (let i = 0; i < frameIndices.length; i++) {
    const timelineFrameIndex = frameIndices[i];
    const composited = await compositeFrame(
      tracks,
      timelineFrameIndex,
      outputSize,
      { includeDataUrl: false },
    );
    if (!composited) continue;

    const ctx = composited.canvas.getContext("2d");
    if (!ctx) continue;

    const pixels = ctx.getImageData(0, 0, width, height).data;
    resolvedFrameIndices.push(timelineFrameIndex);

    if (!referencePixels) {
      referencePixels = new Uint8ClampedArray(pixels);
    } else {
      for (let px = 0, idx = 0; px < totalPixels; px++, idx += 4) {
        if (staticMask[px] === 0) continue;
        const diff =
          Math.abs(pixels[idx] - referencePixels[idx]) +
          Math.abs(pixels[idx + 1] - referencePixels[idx + 1]) +
          Math.abs(pixels[idx + 2] - referencePixels[idx + 2]) +
          Math.abs(pixels[idx + 3] - referencePixels[idx + 3]);
        if (diff > threshold) {
          staticMask[px] = 0;
        }
      }
    }

    if (i % 4 === 0 || i === frameIndices.length - 1) {
      const ratio = (i + 1) / total;
      report(
        "Analyzing frames",
        20 + ratio * 35,
        `${i + 1}/${total}`,
      );
    }
  }

  if (!referencePixels || resolvedFrameIndices.length === 0) {
    return null;
  }

  return {
    staticMask,
    width,
    height,
    referencePixels,
    frameIndices: resolvedFrameIndices,
  };
}

/**
 * Generate base image: keep only static pixels, make dynamic pixels transparent.
 */
function generateBaseImage(
  referencePixels: Uint8ClampedArray,
  width: number,
  height: number,
  staticMask: Uint8Array,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const imageData = ctx.createImageData(width, height);
  const data = imageData.data;

  for (let px = 0, idx = 0; px < staticMask.length; px++, idx += 4) {
    if (staticMask[px] === 0) continue;
    data[idx] = referencePixels[idx];
    data[idx + 1] = referencePixels[idx + 1];
    data[idx + 2] = referencePixels[idx + 2];
    data[idx + 3] = referencePixels[idx + 3];
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * Generate a usage guide markdown for the optimized sprite sheet.
 */
function generateGuideMarkdown(
  metadata: OptimizedSpriteMetadata,
  target: OptimizedTargetFramework,
): string {
  const { meta, delta, base } = metadata;
  const src = meta.sourceSize;
  const baseFile = base.file;
  const deltaFile = delta?.file ?? "delta-spritesheet.(png|webp)";

  const canvasExample = !delta
    ? `const img = new Image();
img.src = '${baseFile}';
img.onload = () => ctx.drawImage(img, 0, 0);`
    : `const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const baseImg = new Image();
const deltaImg = new Image();

async function load() {
  const meta = await fetch('metadata.json').then((r) => r.json());
  baseImg.src = meta.base.file;
  deltaImg.src = meta.delta.file;
  await Promise.all([
    new Promise((resolve) => { baseImg.onload = resolve; }),
    new Promise((resolve) => { deltaImg.onload = resolve; }),
  ]);
  return meta;
}

function drawFrame(meta, frameIndex) {
  ctx.clearRect(0, 0, ${src.w}, ${src.h});
  ctx.drawImage(baseImg, 0, 0);

  const frame = meta.frames[frameIndex];
  if (!frame || !meta.delta) return;

  const tileSize = meta.delta.tileSize;
  const atlasColumns = meta.delta.atlas.columns;
  for (const patch of frame.patches) {
    const atlasCol = patch.atlasIndex % atlasColumns;
    const atlasRow = Math.floor(patch.atlasIndex / atlasColumns);

    ctx.drawImage(
      deltaImg,
      atlasCol * tileSize,
      atlasRow * tileSize,
      patch.w,
      patch.h,
      patch.x,
      patch.y,
      patch.w,
      patch.h,
    );
  }
}

load().then((meta) => {
  let frameIndex = 0;
  setInterval(() => {
    drawFrame(meta, frameIndex);
    frameIndex = (frameIndex + 1) % meta.meta.frameCount;
  }, 1000 / meta.meta.fps);
});`;

  const genericEngineNote = delta
    ? `For ${target === "phaser" ? "Phaser 3" : target === "pixi" ? "PixiJS" : "custom engines"}, keep one static base layer (${baseFile}) and blit per-frame patches from ${deltaFile} using metadata.json.`
    : "No delta patches are needed because all frames are identical.";

  const deltaInfo = delta
    ? `- **${delta.file}**: Tile atlas for changed pixels only
- Tile size: ${delta.tileSize}px
- Atlas: ${delta.atlas.columns} x ${delta.atlas.rows} tiles (${delta.atlas.patchCount} patches)`
    : "- No delta atlas (all frames identical)";

  return `# Optimized Sprite Sheet Guide

## Files
- **${base.file}**: Static base layer (${src.w}x${src.h})
${deltaInfo}
- **metadata.json**: Patch layout and animation config

## How It Works
1. Draw \`${base.file}\`
2. For each frame, draw only that frame's changed tile patches from \`${deltaFile}\`
3. Repeat at configured FPS

## Animation Config
- **Frame count**: ${meta.frameCount}
- **FPS**: ${meta.fps}
- **Source size**: ${src.w} x ${src.h}

## Runtime Note
${genericEngineNote}

## Canvas Example

\`\`\`javascript
${canvasExample}
\`\`\`

## Metadata Schema

\`\`\`json
{
  "meta": {
    "format": "artkit-optimized-sprite",
    "version": "1.0",
    "fps": <number>,
    "sourceSize": { "w": <number>, "h": <number> },
    "frameCount": <number>,
    "target": "<framework>"
  },
  "base": {
    "file": "${base.file}",
    "size": { "w": <number>, "h": <number> }
  },
  "delta": {
    "file": "${deltaFile}",
    "tileSize": <number>,
    "atlas": {
      "columns": <number>,
      "rows": <number>,
      "patchCount": <number>
    }
  } | null,
  "frames": [
    {
      "index": 0,
      "patches": [
        { "atlasIndex": 0, "x": <number>, "y": <number>, "w": <number>, "h": <number> }
      ]
    }
  ]
}
\`\`\`

---
*Generated by Artkit Sprite Editor*
`;
}

/**
 * Export optimized sprite sheet as ZIP:
 * base.{png|webp} + delta-spritesheet.{png|webp} + metadata.json (+ GUIDE.md)
 */
export async function downloadOptimizedSpriteZip(
  tracks: SpriteTrack[],
  projectName: string,
  options: OptimizedExportOptions,
  onProgress?: (progress: OptimizedExportProgress) => void,
): Promise<void> {
  const { target, includeGuide, fps, frameSize } = options;
  const threshold = clampOptimizedThreshold(options.threshold);
  const imageFormat = normalizeOptimizedImageFormat(options.imageFormat);
  const imageQuality = clampOptimizedImageQuality(options.imageQuality);
  const imageExt = imageFormat === "webp" ? "webp" : "png";
  const baseFile = `base.${imageExt}`;
  const deltaFile = `delta-spritesheet.${imageExt}`;

  const report = (stage: string, percent: number, detail?: string) => {
    onProgress?.({ stage, percent, detail });
  };

  const candidateFrameIndices = getCandidateFrameIndices(tracks);
  if (candidateFrameIndices.length === 0) return;

  report("Preparing frames", 5, `${candidateFrameIndices.length} candidates`);
  const resolved = await resolveOptimizedOutputSize(
    tracks,
    candidateFrameIndices,
    frameSize,
    report,
  );
  if (!resolved) return;

  const { outputSize } = resolved;
  const analyzed = await analyzeStaticRegionsStreaming(
    tracks,
    resolved.frameIndices,
    outputSize,
    threshold,
    report,
  );
  if (!analyzed) return;

  const { staticMask, referencePixels, frameIndices } = analyzed;
  const tileSize = clampOptimizedTileSize(options.tileSize);

  // 1. Generate base image
  report("Generating images", 55);
  const baseCanvas = generateBaseImage(
    referencePixels,
    outputSize.width,
    outputSize.height,
    staticMask,
  );
  report("Generating images", 60, "Base image ready");

  // 2. Collect frame tile patches
  const tileDelta = await collectTileDeltaFrames(
    tracks,
    frameIndices,
    outputSize,
    referencePixels,
    staticMask,
    tileSize,
    threshold,
    report,
  );

  // 3. Build tile atlas (if there are any changed patches)
  let deltaCanvas: HTMLCanvasElement | null = null;
  let deltaColumns = 0;
  let deltaRows = 0;
  if (tileDelta.patchCount > 0) {
    const atlas = await generateTileDeltaAtlas(
      tracks,
      frameIndices,
      outputSize,
      tileSize,
      tileDelta.frames,
      tileDelta.patchCount,
      report,
    );
    if (atlas) {
      deltaCanvas = atlas.canvas;
      deltaColumns = atlas.columns;
      deltaRows = atlas.rows;
      report("Generating images", 84, "Tile atlas ready");
    }
  }

  // 4. Build metadata
  report("Building metadata", 86);
  const metadata: OptimizedSpriteMetadata = {
    meta: {
      format: "artkit-optimized-sprite",
      version: "1.0",
      fps,
      sourceSize: { w: outputSize.width, h: outputSize.height },
      frameCount: frameIndices.length,
      target,
    },
    base: {
      file: baseFile,
      size: { w: outputSize.width, h: outputSize.height },
    },
    delta: deltaCanvas
      ? {
          file: deltaFile,
          tileSize,
          atlas: {
            columns: deltaColumns,
            rows: deltaRows,
            patchCount: tileDelta.patchCount,
          },
        }
      : null,
    frames: tileDelta.frames,
  };

  // 5. Build ZIP
  report("Packaging ZIP", 80);
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();

  const baseData = encodeCanvasBase64(baseCanvas, imageFormat, imageQuality);
  zip.file(baseFile, baseData, { base64: true });

  if (deltaCanvas) {
    const deltaData = encodeCanvasBase64(deltaCanvas, imageFormat, imageQuality);
    zip.file(deltaFile, deltaData, { base64: true });
  }

  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  if (includeGuide) {
    const guide = generateGuideMarkdown(metadata, target);
    zip.file("GUIDE.md", guide);
  }

  report("Packaging ZIP", 90, "Compressing...");
  const blob = await zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    compressionOptions: { level: 9 },
  });

  const link = document.createElement("a");
  link.download = `${projectName}-optimized.zip`;
  link.href = URL.createObjectURL(blob);
  link.click();
  URL.revokeObjectURL(link.href);

  report("Done", 100);
}
