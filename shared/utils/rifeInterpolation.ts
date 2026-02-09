/**
 * RIFE frame interpolation utility using onnxruntime-web.
 * Runs fully in the browser with WebGPU and WASM fallback.
 */

import * as ort from "onnxruntime-web";

const DEFAULT_RIFE_MODEL_URL =
  "https://huggingface.co/yuvraj108c/rife-onnx/resolve/main/rife49_ensemble_True_scale_1_sim.onnx";

const ORT_WARNING_PATTERN = /onnxruntime|VerifyEachNodeIsAssignedToAnEp/i;
const HQ_MAX_DEPTH = 12;
const HQ_MIN_INTERVAL = 1 / 4096;

export type RifeInterpolationQuality = "fast" | "high";

interface InterpolateFramesOptions {
  fromImageData: string;
  toImageData: string;
  steps: number;
  quality?: RifeInterpolationQuality;
  modelUrl?: string;
  onProgress?: (progress: number, status: string) => void;
}

interface OrtTensorLike {
  type: string;
  data: Float32Array | Iterable<number>;
  dims: Array<number | string | bigint>;
}

interface OrtSessionLike {
  outputNames: string[];
  run: (feeds: Record<string, unknown>) => Promise<Record<string, OrtTensorLike>>;
}

interface FrameTensorNode {
  t: number;
  tensor: unknown;
}

let cachedSession: OrtSessionLike | null = null;
let sessionPromise: Promise<OrtSessionLike> | null = null;
let cachedModelUrl: string | null = null;
let ortConfigured = false;

function clampByte(value: number): number {
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
}

async function withOrtWarningsSuppressed<T>(task: () => Promise<T>): Promise<T> {
  const originalError = console.error;
  const originalWarn = console.warn;

  console.error = (...args: unknown[]) => {
    const message = args.join(" ");
    if (!ORT_WARNING_PATTERN.test(message)) {
      originalError.apply(console, args);
    }
  };

  console.warn = (...args: unknown[]) => {
    const message = args.join(" ");
    if (!ORT_WARNING_PATTERN.test(message)) {
      originalWarn.apply(console, args);
    }
  };

  try {
    return await task();
  } finally {
    console.error = originalError;
    console.warn = originalWarn;
  }
}

function configureOrt(): void {
  if (ortConfigured) return;
  ortConfigured = true;

  if (typeof window === "undefined") return;

  ort.env.wasm.simd = true;

  const supportsThreads = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  if (supportsThreads) {
    const cpuCount = typeof navigator !== "undefined" ? navigator.hardwareConcurrency || 1 : 1;
    ort.env.wasm.numThreads = Math.max(1, Math.min(4, cpuCount));
  } else {
    ort.env.wasm.numThreads = 1;
  }
}

async function createSession(modelUrl: string): Promise<OrtSessionLike> {
  configureOrt();

  try {
    return await withOrtWarningsSuppressed(() =>
      ort.InferenceSession.create(modelUrl, {
        executionProviders: ["webgpu", "wasm"],
        graphOptimizationLevel: "all",
      }),
    );
  } catch (error) {
    console.warn("[RIFE] WebGPU session creation failed, retrying with WASM only.", error);
    return withOrtWarningsSuppressed(() =>
      ort.InferenceSession.create(modelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      }),
    );
  }
}

async function getSession(modelUrl: string): Promise<OrtSessionLike> {
  if (cachedSession && cachedModelUrl === modelUrl) {
    return cachedSession;
  }

  if (!sessionPromise || cachedModelUrl !== modelUrl) {
    cachedModelUrl = modelUrl;
    sessionPromise = createSession(modelUrl)
      .then((session) => {
        cachedSession = session;
        return session;
      })
      .catch((error) => {
        cachedSession = null;
        sessionPromise = null;
        throw error;
      });
  }

  return sessionPromise;
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const image = new Image();
  if (!src.startsWith("data:")) {
    image.crossOrigin = "anonymous";
  }

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });

  return image;
}

async function decodeImage(src: string): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const image = await loadImage(src);
  const width = image.naturalWidth || image.width;
  const height = image.naturalHeight || image.height;

  if (width <= 0 || height <= 0) {
    throw new Error("Invalid image dimensions.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas context.");

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return {
    width,
    height,
    data: ctx.getImageData(0, 0, width, height).data,
  };
}

function resizeRgba(
  sourceData: Uint8ClampedArray,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
): Uint8ClampedArray {
  if (sourceWidth === targetWidth && sourceHeight === targetHeight) {
    return new Uint8ClampedArray(sourceData);
  }

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = sourceWidth;
  sourceCanvas.height = sourceHeight;
  const sourceCtx = sourceCanvas.getContext("2d");
  if (!sourceCtx) {
    throw new Error("Could not create source canvas context.");
  }

  const sourceDataForCanvas = new Uint8ClampedArray(sourceData.length);
  sourceDataForCanvas.set(sourceData);
  sourceCtx.putImageData(new ImageData(sourceDataForCanvas, sourceWidth, sourceHeight), 0, 0);

  const targetCanvas = document.createElement("canvas");
  targetCanvas.width = targetWidth;
  targetCanvas.height = targetHeight;
  const targetCtx = targetCanvas.getContext("2d");
  if (!targetCtx) {
    throw new Error("Could not create target canvas context.");
  }

  targetCtx.clearRect(0, 0, targetWidth, targetHeight);
  targetCtx.drawImage(sourceCanvas, 0, 0, targetWidth, targetHeight);

  return targetCtx.getImageData(0, 0, targetWidth, targetHeight).data;
}

function rgbaToCHW(rgba: Uint8ClampedArray, width: number, height: number): Float32Array {
  const planeSize = width * height;
  const tensorData = new Float32Array(planeSize * 3);

  for (let i = 0; i < planeSize; i++) {
    const rgbaOffset = i * 4;
    tensorData[i] = rgba[rgbaOffset] / 255;
    tensorData[i + planeSize] = rgba[rgbaOffset + 1] / 255;
    tensorData[i + planeSize * 2] = rgba[rgbaOffset + 2] / 255;
  }

  return tensorData;
}

function extractAlpha(rgba: Uint8ClampedArray, width: number, height: number): Uint8ClampedArray {
  const planeSize = width * height;
  const alpha = new Uint8ClampedArray(planeSize);

  for (let i = 0; i < planeSize; i++) {
    alpha[i] = rgba[i * 4 + 3];
  }

  return alpha;
}

function getTensorFloatData(tensor: OrtTensorLike): Float32Array {
  if (tensor.type !== "float32") {
    throw new Error(`Unexpected tensor type: ${tensor.type}`);
  }

  const data = tensor.data;
  if (data instanceof Float32Array) {
    return data;
  }

  return Float32Array.from(data as Iterable<number>);
}

function rgbTensorToDataUrl(
  rgbData: Float32Array,
  width: number,
  height: number,
  alphaFrom: Uint8ClampedArray,
  alphaTo: Uint8ClampedArray,
  timestep: number,
): string {
  const planeSize = width * height;
  const outRgba = new Uint8ClampedArray(planeSize * 4);

  for (let i = 0; i < planeSize; i++) {
    const r = rgbData[i];
    const g = rgbData[i + planeSize];
    const b = rgbData[i + planeSize * 2];
    const a = alphaFrom[i] + (alphaTo[i] - alphaFrom[i]) * timestep;

    const rgbaOffset = i * 4;
    outRgba[rgbaOffset] = clampByte(r * 255);
    outRgba[rgbaOffset + 1] = clampByte(g * 255);
    outRgba[rgbaOffset + 2] = clampByte(b * 255);
    outRgba[rgbaOffset + 3] = clampByte(a);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Could not create output canvas context.");
  }

  const outputData = new Uint8ClampedArray(outRgba.length);
  outputData.set(outRgba);
  ctx.putImageData(new ImageData(outputData, width, height), 0, 0);
  return canvas.toDataURL("image/png");
}

async function runRifePass(
  session: OrtSessionLike,
  outputName: string,
  fromTensor: unknown,
  toTensor: unknown,
  timestep: number,
  width: number,
  height: number,
): Promise<Float32Array> {
  const timestepTensor = new ort.Tensor("float32", new Float32Array([timestep]), [1]);
  const outputMap = await session.run({
    img0: fromTensor,
    img1: toTensor,
    timestep: timestepTensor,
  });

  const outputTensor = outputMap[outputName];
  if (!outputTensor) {
    throw new Error("RIFE model output tensor missing.");
  }

  const dims = outputTensor.dims.map((dim: number | string | bigint) => Number(dim));
  if (dims.length !== 4 || dims[1] !== 3) {
    throw new Error(`Unexpected RIFE output shape: [${dims.join(", ")}]`);
  }

  const outHeight = dims[2];
  const outWidth = dims[3];
  if (outHeight !== height || outWidth !== width) {
    throw new Error("RIFE output size does not match input size.");
  }

  return getTensorFloatData(outputTensor);
}

async function generateFast(
  session: OrtSessionLike,
  outputName: string,
  fromTensor: unknown,
  toTensor: unknown,
  width: number,
  height: number,
  steps: number,
  onProgress?: (progress: number, status: string) => void,
): Promise<Array<{ t: number; rgb: Float32Array }>> {
  const results: Array<{ t: number; rgb: Float32Array }> = [];

  for (let i = 0; i < steps; i++) {
    const t = (i + 1) / (steps + 1);
    const progress = Math.round(10 + ((i + 1) / steps) * 90);
    onProgress?.(progress, `Fast interpolation (${i + 1}/${steps})`);

    const rgb = await runRifePass(session, outputName, fromTensor, toTensor, t, width, height);
    results.push({ t, rgb });
  }

  return results;
}

async function generateHighQuality(
  session: OrtSessionLike,
  outputName: string,
  fromTensor: unknown,
  toTensor: unknown,
  width: number,
  height: number,
  steps: number,
  onProgress?: (progress: number, status: string) => void,
): Promise<Array<{ t: number; rgb: Float32Array }>> {
  const cache = new Map<string, FrameTensorNode>();

  const leftRoot: FrameTensorNode = { t: 0, tensor: fromTensor };
  const rightRoot: FrameTensorNode = { t: 1, tensor: toTensor };

  const getMidpoint = async (left: FrameTensorNode, right: FrameTensorNode): Promise<FrameTensorNode> => {
    const key = `${left.t.toFixed(8)}:${right.t.toFixed(8)}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const rgb = await runRifePass(session, outputName, left.tensor, right.tensor, 0.5, width, height);
    const tensor = new ort.Tensor("float32", rgb, [1, 3, height, width]);
    const node: FrameTensorNode = {
      t: (left.t + right.t) * 0.5,
      tensor,
    };

    cache.set(key, node);
    return node;
  };

  const interpolateAt = async (
    targetT: number,
    left: FrameTensorNode,
    right: FrameTensorNode,
    depth: number,
  ): Promise<FrameTensorNode> => {
    if (depth >= HQ_MAX_DEPTH || right.t - left.t <= HQ_MIN_INTERVAL) {
      const chooseLeft = Math.abs(targetT - left.t) <= Math.abs(targetT - right.t);
      return chooseLeft ? left : right;
    }

    const mid = await getMidpoint(left, right);
    const epsilon = 1e-8;
    if (Math.abs(targetT - mid.t) <= epsilon) {
      return mid;
    }

    if (targetT < mid.t) {
      return interpolateAt(targetT, left, mid, depth + 1);
    }

    return interpolateAt(targetT, mid, right, depth + 1);
  };

  const results: Array<{ t: number; rgb: Float32Array }> = [];

  for (let i = 0; i < steps; i++) {
    const targetT = (i + 1) / (steps + 1);
    const node = await interpolateAt(targetT, leftRoot, rightRoot, 0);
    const rgb = getTensorFloatData(node.tensor as OrtTensorLike);

    const progress = Math.round(10 + ((i + 1) / steps) * 90);
    onProgress?.(progress, `High-quality interpolation (${i + 1}/${steps})`);

    results.push({ t: targetT, rgb });
  }

  return results;
}

export async function interpolateFramesWithRife({
  fromImageData,
  toImageData,
  steps,
  quality = "fast",
  modelUrl = DEFAULT_RIFE_MODEL_URL,
  onProgress,
}: InterpolateFramesOptions): Promise<string[]> {
  if (typeof window === "undefined") {
    throw new Error("RIFE interpolation can only run in the browser.");
  }

  if (!Number.isInteger(steps) || steps <= 0) {
    return [];
  }

  onProgress?.(0, "Loading model...");
  const session = await getSession(modelUrl);

  const fromDecoded = await decodeImage(fromImageData);
  const toDecoded = await decodeImage(toImageData);

  const width = Math.max(fromDecoded.width, toDecoded.width);
  const height = Math.max(fromDecoded.height, toDecoded.height);

  const fromRgba = resizeRgba(fromDecoded.data, fromDecoded.width, fromDecoded.height, width, height);
  const toRgba = resizeRgba(toDecoded.data, toDecoded.width, toDecoded.height, width, height);

  const fromTensor = new ort.Tensor("float32", rgbaToCHW(fromRgba, width, height), [1, 3, height, width]);
  const toTensor = new ort.Tensor("float32", rgbaToCHW(toRgba, width, height), [1, 3, height, width]);

  const alphaFrom = extractAlpha(fromRgba, width, height);
  const alphaTo = extractAlpha(toRgba, width, height);

  const outputName = session.outputNames[0];
  if (!outputName) {
    throw new Error("RIFE model output name not found.");
  }

  const tensors = quality === "high"
    ? await generateHighQuality(session, outputName, fromTensor, toTensor, width, height, steps, onProgress)
    : await generateFast(session, outputName, fromTensor, toTensor, width, height, steps, onProgress);

  const results = tensors.map(({ t, rgb }) =>
    rgbTensorToDataUrl(rgb, width, height, alphaFrom, alphaTo, t),
  );

  onProgress?.(100, "Done");
  return results;
}

export function isRifeModelLoaded(): boolean {
  return cachedSession !== null;
}

export async function preloadRifeModel(
  modelUrl: string = DEFAULT_RIFE_MODEL_URL,
  onProgress?: (progress: number, status: string) => void,
): Promise<void> {
  onProgress?.(0, "Loading model...");
  await getSession(modelUrl);
  onProgress?.(100, "Model ready");
}

export { DEFAULT_RIFE_MODEL_URL };
