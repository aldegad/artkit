/**
 * Background Removal Utility using Transformers.js
 * Runs AI model in browser - no server needed, fully compatible with static builds
 */

import { env, AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";

// Configure for browser-only usage (static build compatible)
env.allowLocalModels = false;
env.useBrowserCache = true;

// Suppress ONNX Runtime warnings by filtering console output during model loading.
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const ORT_WARNING_PATTERN = /onnxruntime|VerifyEachNodeIsAssignedToAnEp/i;

function suppressOrtWarnings() {
  console.error = (...args: unknown[]) => {
    const message = args.join(" ");
    if (!ORT_WARNING_PATTERN.test(message)) {
      originalConsoleError.apply(console, args);
    }
  };

  console.warn = (...args: unknown[]) => {
    const message = args.join(" ");
    if (!ORT_WARNING_PATTERN.test(message)) {
      originalConsoleWarn.apply(console, args);
    }
  };
}

function restoreConsole() {
  console.error = originalConsoleError;
  console.warn = originalConsoleWarn;
}

// Model singleton for caching
let model: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null;
let processor: Awaited<ReturnType<typeof AutoProcessor.from_pretrained>> | null = null;
let isLoading = false;
let loadingPromise: Promise<void> | null = null;

const MODEL_ID = "briaai/RMBG-1.4";
const EPSILON = 1e-6;
const MAX_MORPH_RADIUS = 4;
const MAX_FEATHER_RADIUS = 8;
const PREFERRED_OUTPUT_KEYS = ["output", "logits", "pred_alpha", "alpha", "mask", "masks"];

interface TensorLike {
  data?:
    | Float32Array
    | Float64Array
    | Uint8Array
    | Uint16Array
    | Uint32Array
    | Int8Array
    | Int16Array
    | Int32Array
    | Iterable<number>;
  dims?: Array<number | string | bigint>;
  shape?: Array<number | string | bigint>;
}

interface ModelLoadAttempt {
  device: "webgpu" | "wasm";
  dtype?: "fp32";
  label: string;
}

export type BackgroundRemovalQuality = "fast" | "balanced" | "high";

export interface BackgroundRemovalOptions {
  quality?: BackgroundRemovalQuality;
  threshold?: number;
  softness?: number;
  featherRadius?: number;
  closeRadius?: number;
  openRadius?: number;
}

interface MaskPlane {
  width: number;
  height: number;
  data: Float32Array;
}

interface RefinementConfig {
  threshold: number;
  softness: number;
  featherRadius: number;
  closeRadius: number;
  openRadius: number;
}

const QUALITY_PRESETS: Record<BackgroundRemovalQuality, RefinementConfig> = {
  fast: {
    threshold: 0.5,
    softness: 0.03,
    featherRadius: 0,
    closeRadius: 0,
    openRadius: 0,
  },
  balanced: {
    threshold: 0.5,
    softness: 0.08,
    featherRadius: 1,
    closeRadius: 1,
    openRadius: 0,
  },
  high: {
    threshold: 0.48,
    softness: 0.12,
    featherRadius: 2,
    closeRadius: 1,
    openRadius: 1,
  },
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function clampUnit(value: number): number {
  return clamp(value, 0, 1);
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.floor(clamp(value as number, min, max));
}

function resolveRefinementConfig(options: BackgroundRemovalOptions | undefined): RefinementConfig {
  const preset = QUALITY_PRESETS[options?.quality ?? "balanced"];

  return {
    threshold: clamp(options?.threshold ?? preset.threshold, 0, 1),
    softness: clamp(options?.softness ?? preset.softness, 0, 1),
    featherRadius: normalizeInteger(options?.featherRadius, 0, MAX_FEATHER_RADIUS, preset.featherRadius),
    closeRadius: normalizeInteger(options?.closeRadius, 0, MAX_MORPH_RADIUS, preset.closeRadius),
    openRadius: normalizeInteger(options?.openRadius, 0, MAX_MORPH_RADIUS, preset.openRadius),
  };
}

function getModelLoadAttempts(canUseWebGPU: boolean): ModelLoadAttempt[] {
  if (canUseWebGPU) {
    return [
      { device: "webgpu", dtype: "fp32", label: "webgpu/fp32" },
      { device: "webgpu", label: "webgpu/default" },
      { device: "wasm", dtype: "fp32", label: "wasm/fp32" },
      { device: "wasm", label: "wasm/default" },
    ];
  }

  return [
    { device: "wasm", dtype: "fp32", label: "wasm/fp32" },
    { device: "wasm", label: "wasm/default" },
  ];
}

async function tryLoadModel(
  attempt: ModelLoadAttempt,
  onProgress?: (progress: number, status: string) => void
): Promise<Awaited<ReturnType<typeof AutoModel.from_pretrained>>> {
  const options: {
    device: "webgpu" | "wasm";
    dtype?: "fp32";
    progress_callback?: (progress: { status: string; progress?: number }) => void;
  } = {
    device: attempt.device,
    progress_callback: (progress: { status: string; progress?: number }) => {
      if (progress.progress !== undefined) {
        onProgress?.(progress.progress * 0.5, progress.status);
      }
    },
  };

  if (attempt.dtype) {
    options.dtype = attempt.dtype;
  }

  return AutoModel.from_pretrained(MODEL_ID, options);
}

/**
 * Load the background removal model (cached after first load)
 */
async function loadModel(
  onProgress?: (progress: number, status: string) => void
): Promise<void> {
  if (model && processor) return;

  if (isLoading && loadingPromise) {
    await loadingPromise;
    return;
  }

  isLoading = true;
  loadingPromise = (async () => {
    try {
      onProgress?.(0, "Loading model...");
      suppressOrtWarnings();

      let canUseWebGPU = false;
      if (typeof navigator !== "undefined" && "gpu" in navigator) {
        try {
          const adapter = await (navigator as Navigator & {
            gpu: { requestAdapter: () => Promise<unknown> };
          }).gpu.requestAdapter();
          canUseWebGPU = adapter !== null;
        } catch {
          canUseWebGPU = false;
        }
      }

      const attempts = getModelLoadAttempts(canUseWebGPU);
      let lastError: unknown = null;
      let loadedModel: Awaited<ReturnType<typeof AutoModel.from_pretrained>> | null = null;

      for (const attempt of attempts) {
        try {
          loadedModel = await tryLoadModel(attempt, onProgress);
          break;
        } catch (error) {
          lastError = error;
          console.warn(`[Background Removal] Model load attempt failed: ${attempt.label}`, error);
        }
      }

      if (!loadedModel) {
        throw lastError || new Error("Failed to load background removal model.");
      }

      const loadedProcessor = await AutoProcessor.from_pretrained(MODEL_ID, {
        progress_callback: (progress: { status: string; progress?: number }) => {
          if (progress.progress !== undefined) {
            onProgress?.(50 + progress.progress * 0.5, progress.status);
          }
        },
      });

      model = loadedModel;
      processor = loadedProcessor;
      onProgress?.(100, "Model ready");
    } finally {
      restoreConsole();
      isLoading = false;
      loadingPromise = null;
    }
  })();

  await loadingPromise;
}

function getTensorDims(tensor: TensorLike): number[] {
  const raw = (tensor.dims || tensor.shape || []).map((dim) => Number(dim));
  return raw.filter((dim) => Number.isFinite(dim) && dim > 0);
}

function getTensorData(tensor: TensorLike): Float32Array {
  const raw = tensor.data;
  if (!raw) {
    throw new Error("Tensor data is missing.");
  }

  if (raw instanceof Float32Array) {
    return raw;
  }

  if (
    raw instanceof Float64Array
    || raw instanceof Uint8Array
    || raw instanceof Uint16Array
    || raw instanceof Uint32Array
    || raw instanceof Int8Array
    || raw instanceof Int16Array
    || raw instanceof Int32Array
  ) {
    return Float32Array.from(raw as Iterable<number>);
  }

  return Float32Array.from(raw as Iterable<number>);
}

function isTensorLike(value: unknown): value is TensorLike {
  if (!value || typeof value !== "object") return false;
  return "data" in value || "dims" in value || "shape" in value;
}

function isMaskCandidateTensor(value: unknown): value is TensorLike {
  if (!isTensorLike(value)) return false;

  const dims = getTensorDims(value);
  if (dims.length < 2 || dims.length > 4) return false;

  try {
    const data = getTensorData(value);
    return data.length > 0;
  } catch {
    return false;
  }
}

function scoreMaskCandidate(tensor: TensorLike): number {
  const dims = getTensorDims(tensor);
  const lengthScore = Math.min(4, Math.max(0, dims.length));
  const last = dims[dims.length - 1] || 1;
  const secondLast = dims[dims.length - 2] || 1;
  const areaScore = Math.log10(Math.max(1, last * secondLast));
  return lengthScore * 10 + areaScore;
}

function pickMaskTensor(modelOutput: Record<string, unknown>): { key: string; tensor: TensorLike } {
  for (const key of PREFERRED_OUTPUT_KEYS) {
    const value = modelOutput[key];
    if (isMaskCandidateTensor(value)) {
      return { key, tensor: value };
    }
  }

  const fallbackCandidates = Object.entries(modelOutput)
    .filter((entry): entry is [string, TensorLike] => isMaskCandidateTensor(entry[1]))
    .sort((a, b) => scoreMaskCandidate(b[1]) - scoreMaskCandidate(a[1]));

  if (fallbackCandidates.length > 0) {
    return {
      key: fallbackCandidates[0][0],
      tensor: fallbackCandidates[0][1],
    };
  }

  throw new Error("Background mask output tensor not found.");
}

function extractPlanar(
  source: Float32Array,
  width: number,
  height: number,
  planeOffset: number,
): Float32Array {
  const planeSize = width * height;
  const out = new Float32Array(planeSize);
  const end = Math.min(source.length, planeOffset + planeSize);

  for (let i = planeOffset, j = 0; i < end && j < planeSize; i++, j++) {
    out[j] = source[i];
  }

  return out;
}

function extractInterleaved(
  source: Float32Array,
  width: number,
  height: number,
  channels: number,
  channelOffset: number,
): Float32Array {
  const planeSize = width * height;
  const out = new Float32Array(planeSize);

  for (let i = 0; i < planeSize; i++) {
    const offset = i * channels + channelOffset;
    if (offset < source.length) {
      out[i] = source[offset];
    }
  }

  return out;
}

function extractMaskPlane(tensor: TensorLike): MaskPlane {
  let dims = getTensorDims(tensor);
  let data = getTensorData(tensor);

  // If model returns batched tensor, use first batch deterministically.
  if (dims.length === 4 && dims[0] > 1) {
    const batchStride = dims[1] * dims[2] * dims[3];
    data = data.subarray(0, Math.min(data.length, batchStride));
    dims = dims.slice(1);
  }

  // Remove leading singleton dims without changing memory layout.
  while (dims.length > 2 && dims[0] === 1) {
    dims = dims.slice(1);
  }

  if (dims.length === 2) {
    const height = dims[0];
    const width = dims[1];
    return { width, height, data: extractPlanar(data, width, height, 0) };
  }

  if (dims.length === 3) {
    const [a, b, c] = dims;

    // [C, H, W]
    if (a <= 4 && b > 4 && c > 4) {
      return {
        width: c,
        height: b,
        data: extractPlanar(data, c, b, 0),
      };
    }

    // [H, W, C]
    if (c <= 4 && a > 4 && b > 4) {
      return {
        width: b,
        height: a,
        data: extractInterleaved(data, b, a, c, 0),
      };
    }

    // [1, H, W]
    if (a === 1 && b > 1 && c > 1) {
      return {
        width: c,
        height: b,
        data: extractPlanar(data, c, b, 0),
      };
    }

    // [H, W, 1]
    if (c === 1 && a > 1 && b > 1) {
      return {
        width: b,
        height: a,
        data: extractInterleaved(data, b, a, 1, 0),
      };
    }

    // Fallback: assume trailing dims are H/W and take first plane.
    const width = c;
    const height = b;
    return {
      width,
      height,
      data: extractPlanar(data, width, height, 0),
    };
  }

  // Conservative fallback for unexpected shapes.
  if (dims.length >= 2) {
    const width = dims[dims.length - 1];
    const height = dims[dims.length - 2];
    return {
      width,
      height,
      data: extractPlanar(data, width, height, 0),
    };
  }

  throw new Error("Invalid mask tensor shape.");
}

function normalizeMask(mask: Float32Array): { data: Float32Array; min: number; max: number } {
  const normalized = new Float32Array(mask.length);
  if (mask.length === 0) {
    return { data: normalized, min: 0, max: 0 };
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < mask.length; i++) {
    const value = mask[i];
    if (value < min) min = value;
    if (value > max) max = value;
  }

  const range = max - min;

  if (!Number.isFinite(range) || range <= EPSILON) {
    for (let i = 0; i < mask.length; i++) {
      normalized[i] = clampUnit(mask[i]);
    }
    return { data: normalized, min, max };
  }

  for (let i = 0; i < mask.length; i++) {
    normalized[i] = clampUnit((mask[i] - min) / range);
  }

  return { data: normalized, min, max };
}

function applySoftThreshold(mask: Float32Array, threshold: number, softness: number): Float32Array {
  const out = new Float32Array(mask.length);

  if (softness <= EPSILON) {
    for (let i = 0; i < mask.length; i++) {
      out[i] = mask[i] >= threshold ? 1 : 0;
    }
    return out;
  }

  const lower = clamp(threshold - softness * 0.5, 0, 1);
  const upper = clamp(threshold + softness * 0.5, 0, 1);
  const width = Math.max(EPSILON, upper - lower);

  for (let i = 0; i < mask.length; i++) {
    const value = mask[i];
    if (value <= lower) {
      out[i] = 0;
      continue;
    }
    if (value >= upper) {
      out[i] = 1;
      continue;
    }
    out[i] = clampUnit((value - lower) / width);
  }

  return out;
}

function dilate(mask: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return new Float32Array(mask);

  const out = new Float32Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let maxValue = 0;

      for (let ky = -radius; ky <= radius; ky++) {
        const yy = y + ky;
        if (yy < 0 || yy >= height) continue;

        for (let kx = -radius; kx <= radius; kx++) {
          const xx = x + kx;
          if (xx < 0 || xx >= width) continue;
          const candidate = mask[yy * width + xx];
          if (candidate > maxValue) maxValue = candidate;
        }
      }

      out[y * width + x] = maxValue;
    }
  }

  return out;
}

function erode(mask: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return new Float32Array(mask);

  const out = new Float32Array(mask.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let minValue = 1;

      for (let ky = -radius; ky <= radius; ky++) {
        const yy = y + ky;
        if (yy < 0 || yy >= height) continue;

        for (let kx = -radius; kx <= radius; kx++) {
          const xx = x + kx;
          if (xx < 0 || xx >= width) continue;
          const candidate = mask[yy * width + xx];
          if (candidate < minValue) minValue = candidate;
        }
      }

      out[y * width + x] = minValue;
    }
  }

  return out;
}

function blurMask(mask: Float32Array, width: number, height: number, radius: number): Float32Array {
  if (radius <= 0) return new Float32Array(mask);

  const temp = new Float32Array(mask.length);
  const out = new Float32Array(mask.length);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let kx = -radius; kx <= radius; kx++) {
        const xx = x + kx;
        if (xx < 0 || xx >= width) continue;
        sum += mask[y * width + xx];
        count += 1;
      }

      temp[y * width + x] = count > 0 ? sum / count : 0;
    }
  }

  // Vertical pass
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      let count = 0;

      for (let ky = -radius; ky <= radius; ky++) {
        const yy = y + ky;
        if (yy < 0 || yy >= height) continue;
        sum += temp[yy * width + x];
        count += 1;
      }

      out[y * width + x] = count > 0 ? sum / count : 0;
    }
  }

  return out;
}

function applyEdgeRefinement(mask: Float32Array, width: number, height: number, config: RefinementConfig): Float32Array {
  let refined = applySoftThreshold(mask, config.threshold, config.softness);

  if (config.closeRadius > 0) {
    refined = erode(dilate(refined, width, height, config.closeRadius), width, height, config.closeRadius);
  }

  if (config.openRadius > 0) {
    refined = dilate(erode(refined, width, height, config.openRadius), width, height, config.openRadius);
  }

  if (config.featherRadius > 0) {
    refined = blurMask(refined, width, height, config.featherRadius);
  }

  for (let i = 0; i < refined.length; i++) {
    refined[i] = clampUnit(refined[i]);
  }

  return refined;
}

function buildMaskCanvas(mask: Float32Array, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to create mask canvas context.");
  }

  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const value = clampByte(mask[i] * 255);
    const offset = i * 4;
    pixels[offset] = value;
    pixels[offset + 1] = value;
    pixels[offset + 2] = value;
    pixels[offset + 3] = 255;
  }

  ctx.putImageData(new ImageData(pixels, width, height), 0, 0);
  return canvas;
}

async function loadOriginalImage(imageSource: string | Blob | HTMLImageElement): Promise<{ image: HTMLImageElement; revoke?: () => void }> {
  const image = new Image();
  let blobUrl: string | null = null;

  if (typeof imageSource === "string") {
    if (!imageSource.startsWith("data:") && !imageSource.startsWith("blob:")) {
      image.crossOrigin = "anonymous";
    }
  }

  const src = (() => {
    if (typeof imageSource === "string") return imageSource;
    if (imageSource instanceof Blob) {
      blobUrl = URL.createObjectURL(imageSource);
      return blobUrl;
    }
    return imageSource.src;
  })();

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = (event) => reject(event);
    image.src = src;
  });

  return {
    image,
    revoke: blobUrl ? () => URL.revokeObjectURL(blobUrl!) : undefined,
  };
}

/**
 * Remove background from an image
 * @param imageSource - Image URL, Blob, or HTMLImageElement
 * @param onProgress - Progress callback (0-100)
 * @param options - Quality and refinement options
 * @returns Canvas with transparent background
 */
export async function removeBackground(
  imageSource: string | Blob | HTMLImageElement,
  onProgress?: (progress: number, status: string) => void,
  options?: BackgroundRemovalOptions,
): Promise<HTMLCanvasElement> {
  await loadModel((progress, status) => {
    onProgress?.(progress * 0.5, status);
  });

  if (!model || !processor) {
    throw new Error("Failed to load model");
  }

  onProgress?.(50, "Processing image...");

  let image: RawImage;
  if (typeof imageSource === "string") {
    image = await RawImage.fromURL(imageSource);
  } else if (imageSource instanceof Blob) {
    const url = URL.createObjectURL(imageSource);
    try {
      image = await RawImage.fromURL(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    image = await RawImage.fromURL(imageSource.src);
  }

  onProgress?.(60, "Running AI model...");

  const processed = await processor(image) as { pixel_values: unknown };
  const modelOutput = await model({ input: processed.pixel_values }) as Record<string, unknown>;
  const selectedMask = pickMaskTensor(modelOutput);

  onProgress?.(72, "Normalizing mask...");

  const maskPlane = extractMaskPlane(selectedMask.tensor);
  const normalized = normalizeMask(maskPlane.data);
  const refinement = resolveRefinementConfig(options);
  const refinedMask = applyEdgeRefinement(normalized.data, maskPlane.width, maskPlane.height, refinement);

  onProgress?.(84, "Applying mask...");

  const rawMaskCanvas = buildMaskCanvas(refinedMask, maskPlane.width, maskPlane.height);
  const resizedMaskCanvas = document.createElement("canvas");
  resizedMaskCanvas.width = image.width;
  resizedMaskCanvas.height = image.height;

  const resizedMaskCtx = resizedMaskCanvas.getContext("2d");
  if (!resizedMaskCtx) {
    throw new Error("Failed to create resized mask context.");
  }

  resizedMaskCtx.imageSmoothingEnabled = true;
  resizedMaskCtx.drawImage(rawMaskCanvas, 0, 0, image.width, image.height);
  const resizedMaskPixels = resizedMaskCtx.getImageData(0, 0, image.width, image.height).data;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = image.width;
  outputCanvas.height = image.height;

  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) {
    throw new Error("Failed to create output canvas context.");
  }

  const original = await loadOriginalImage(imageSource);
  try {
    outputCtx.drawImage(original.image, 0, 0, image.width, image.height);
  } finally {
    original.revoke?.();
  }

  const outputData = outputCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
  const totalPixels = image.width * image.height;

  for (let i = 0; i < totalPixels; i++) {
    outputData.data[i * 4 + 3] = resizedMaskPixels[i * 4];
  }

  outputCtx.putImageData(outputData, 0, 0);

  onProgress?.(100, "Done");

  return outputCanvas;
}

/**
 * Remove background from a canvas element
 * @param sourceCanvas - Source canvas
 * @param onProgress - Progress callback
 * @param options - Quality and refinement options
 * @returns Canvas with transparent background
 */
export async function removeBackgroundFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  onProgress?: (progress: number, status: string) => void,
  options?: BackgroundRemovalOptions,
): Promise<HTMLCanvasElement> {
  const blob = await new Promise<Blob>((resolve, reject) => {
    sourceCanvas.toBlob((value) => {
      if (value) resolve(value);
      else reject(new Error("Failed to convert canvas to blob"));
    }, "image/png");
  });

  return removeBackground(blob, onProgress, options);
}

/**
 * Check if model is loaded
 */
export function isModelLoaded(): boolean {
  return model !== null && processor !== null;
}

/**
 * Preload the model (optional, for faster first use)
 */
export async function preloadModel(
  onProgress?: (progress: number, status: string) => void
): Promise<void> {
  await loadModel(onProgress);
}
