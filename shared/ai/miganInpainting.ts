import * as ort from "onnxruntime-web";
import type { InferenceSession, Tensor } from "onnxruntime-common";

const ORT_WEB_VERSION = "1.22.0";
const ORT_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_WEB_VERSION}/dist/`;

export const DEFAULT_MIGAN_MODEL_URL = "https://huggingface.co/andraniksargsyan/migan/resolve/main/migan_pipeline_v2.onnx";

interface MiGanSessionLoadOptions {
  modelUrl?: string;
  onProgress?: (progress: number, status: string) => void;
}

export interface MiGanFrameInpaintOptions {
  rgba: Uint8ClampedArray;
  holeMask: Uint8Array;
  width: number;
  height: number;
  modelUrl?: string;
  onProgress?: (progress: number, status: string) => void;
}

let ortConfigured = false;
let loadedSessionKey: string | null = null;
let sessionPromise: Promise<InferenceSession> | null = null;

function configureOrtEnv(): void {
  if (ortConfigured) return;

  ort.env.wasm.wasmPaths = ORT_WASM_BASE_URL;
  ort.env.wasm.simd = true;
  // Suppress non-fatal EP assignment warnings from ORT in browser consoles.
  ort.env.logLevel = "error";
  const canUseThreadedWasm = typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  ort.env.wasm.proxy = canUseThreadedWasm;

  if (canUseThreadedWasm && typeof navigator !== "undefined" && Number.isFinite(navigator.hardwareConcurrency)) {
    const threads = Math.max(1, Math.min(4, navigator.hardwareConcurrency || 1));
    ort.env.wasm.numThreads = threads;
  } else {
    ort.env.wasm.numThreads = 1;
  }

  ortConfigured = true;
}

async function canUseWebGpu(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;

  try {
    const adapter = await (navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<unknown | null> };
    }).gpu?.requestAdapter();

    return Boolean(adapter);
  } catch {
    return false;
  }
}

async function createSession(modelUrl: string): Promise<InferenceSession> {
  configureOrtEnv();

  const webGpuAvailable = await canUseWebGpu();
  const preferredProviders: InferenceSession.SessionOptions["executionProviders"] = webGpuAvailable
    ? ["webgpu", "wasm"]
    : ["wasm"];

  try {
    return await ort.InferenceSession.create(modelUrl, {
      executionProviders: preferredProviders,
      graphOptimizationLevel: "all",
      logSeverityLevel: 3,
    });
  } catch {
    return ort.InferenceSession.create(modelUrl, {
      executionProviders: ["wasm"],
      graphOptimizationLevel: "all",
      logSeverityLevel: 3,
    });
  }
}

async function getSession(options?: MiGanSessionLoadOptions): Promise<InferenceSession> {
  const modelUrl = options?.modelUrl ?? DEFAULT_MIGAN_MODEL_URL;

  if (!sessionPromise || loadedSessionKey !== modelUrl) {
    loadedSessionKey = modelUrl;
    sessionPromise = (async () => {
      options?.onProgress?.(5, "Loading MI-GAN model...");
      const session = await createSession(modelUrl);
      options?.onProgress?.(100, "MI-GAN model ready");
      return session;
    })();
  }

  return sessionPromise;
}

function rgbaToRgbChw(rgba: Uint8ClampedArray, width: number, height: number): Uint8Array {
  const pixelCount = width * height;
  const planeSize = pixelCount;
  const chw = new Uint8Array(planeSize * 3);

  for (let i = 0; i < pixelCount; i += 1) {
    const rgbaOffset = i * 4;
    chw[i] = rgba[rgbaOffset];
    chw[i + planeSize] = rgba[rgbaOffset + 1];
    chw[i + planeSize * 2] = rgba[rgbaOffset + 2];
  }

  return chw;
}

function buildKnownMaskChw(holeMask: Uint8Array, width: number, height: number): Uint8Array {
  const pixelCount = width * height;
  const knownMask = new Uint8Array(pixelCount);

  for (let i = 0; i < pixelCount; i += 1) {
    // MI-GAN pipeline mask convention:
    // 255 = known(keep), 0 = hole(fill)
    knownMask[i] = holeMask[i] > 127 ? 0 : 255;
  }

  return knownMask;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function normalizeToByteArray(data: Tensor["data"]): Uint8Array {
  if (data instanceof Uint8Array) {
    return data;
  }

  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;

  for (let i = 0; i < data.length; i += 1) {
    const v = Number(data[i]);
    if (v < min) min = v;
    if (v > max) max = v;
  }

  const output = new Uint8Array(data.length);

  const looksLikeZeroToOne = min >= -0.001 && max <= 1.001;
  const looksLikeMinusOneToOne = min >= -1.001 && max <= 1.001;

  for (let i = 0; i < data.length; i += 1) {
    const v = Number(data[i]);
    if (looksLikeZeroToOne) {
      output[i] = clampByte(v * 255);
    } else if (looksLikeMinusOneToOne) {
      output[i] = clampByte((v + 1) * 127.5);
    } else {
      output[i] = clampByte(v);
    }
  }

  return output;
}

function tensorToRgbChw(tensor: Tensor, width: number, height: number): Uint8Array {
  const dims = tensor.dims.map((dim) => Number(dim));
  const data = normalizeToByteArray(tensor.data);
  const planeSize = width * height;

  // Expected: [1, 3, H, W] or [3, H, W]
  if (dims.length === 4 && dims[0] === 1 && dims[1] === 3) {
    return data;
  }
  if (dims.length === 3 && dims[0] === 3) {
    return data;
  }

  // Fallback for HWC outputs
  if (
    (dims.length === 4 && dims[0] === 1 && dims[3] === 3)
    || (dims.length === 3 && dims[2] === 3)
  ) {
    const rgbChw = new Uint8Array(planeSize * 3);
    const hwc = data;

    for (let i = 0; i < planeSize; i += 1) {
      const offset = i * 3;
      rgbChw[i] = hwc[offset];
      rgbChw[i + planeSize] = hwc[offset + 1];
      rgbChw[i + planeSize * 2] = hwc[offset + 2];
    }

    return rgbChw;
  }

  throw new Error(`Unsupported MI-GAN output tensor shape: [${dims.join(", ")}]`);
}

function rgbChwToRgba(rgbChw: Uint8Array, width: number, height: number): Uint8ClampedArray {
  const pixelCount = width * height;
  const planeSize = pixelCount;
  const rgba = new Uint8ClampedArray(pixelCount * 4);

  for (let i = 0; i < pixelCount; i += 1) {
    const offset = i * 4;
    rgba[offset] = rgbChw[i];
    rgba[offset + 1] = rgbChw[i + planeSize];
    rgba[offset + 2] = rgbChw[i + planeSize * 2];
    rgba[offset + 3] = 255;
  }

  return rgba;
}

export async function warmupMiGanModel(options?: MiGanSessionLoadOptions): Promise<void> {
  await getSession(options);
}

export async function inpaintFrameWithMiGan(options: MiGanFrameInpaintOptions): Promise<Uint8ClampedArray> {
  const {
    rgba,
    holeMask,
    width,
    height,
    modelUrl,
    onProgress,
  } = options;

  const pixelCount = width * height;
  if (rgba.length !== pixelCount * 4) {
    throw new Error("Invalid RGBA frame length for MI-GAN input.");
  }
  if (holeMask.length !== pixelCount) {
    throw new Error("Invalid hole mask length for MI-GAN input.");
  }

  const session = await getSession({ modelUrl, onProgress });

  onProgress?.(10, "Preparing MI-GAN tensors...");
  const imageTensor = new ort.Tensor("uint8", rgbaToRgbChw(rgba, width, height), [
    1,
    3,
    height,
    width,
  ]);
  const maskTensor = new ort.Tensor("uint8", buildKnownMaskChw(holeMask, width, height), [
    1,
    1,
    height,
    width,
  ]);

  onProgress?.(20, "Running MI-GAN...");
  const feeds: Record<string, Tensor> = {
    [session.inputNames[0]]: imageTensor,
    [session.inputNames[1]]: maskTensor,
  };
  const results = await session.run(feeds);
  const outputTensor = results[session.outputNames[0]];

  if (!outputTensor) {
    throw new Error("MI-GAN inference returned no output tensor.");
  }

  onProgress?.(95, "Finalizing frame...");
  const rgbChw = tensorToRgbChw(outputTensor, width, height);
  onProgress?.(100, "Frame complete");
  return rgbChwToRgba(rgbChw, width, height);
}
