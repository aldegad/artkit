import * as ort from "onnxruntime-web";
import type { InferenceSession } from "onnxruntime-common";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ORT_WEB_VERSION = "1.22.0";
const ORT_WASM_BASE_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_WEB_VERSION}/dist/`;

const DEFAULT_TILE_SIZE = 256;
const TILE_PAD = 10;

export type UpscaleScale = 2 | 4;

export const UPSCALE_MODEL_URL =
  "https://huggingface.co/xiongjie/lightweight-real-ESRGAN-anime/resolve/main/RealESRGAN_x4plus_anime_4B32F.onnx";

export const UPSCALE_MODEL_INFO = {
  label: "Real-ESRGAN Anime",
  downloadHint: "~17MB",
  description: "Anime / illustration optimized (x4, MIT)",
};

// ---------------------------------------------------------------------------
// ORT environment (shared pattern with miganInpainting.ts)
// ---------------------------------------------------------------------------

let ortConfigured = false;

function configureOrtEnv(): void {
  if (ortConfigured) return;

  ort.env.wasm.wasmPaths = ORT_WASM_BASE_URL;
  ort.env.wasm.simd = true;
  ort.env.logLevel = "error";

  const canUseThreadedWasm =
    typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;
  ort.env.wasm.proxy = canUseThreadedWasm;

  if (
    canUseThreadedWasm &&
    typeof navigator !== "undefined" &&
    Number.isFinite(navigator.hardwareConcurrency)
  ) {
    ort.env.wasm.numThreads = Math.max(
      1,
      Math.min(4, navigator.hardwareConcurrency || 1),
    );
  } else {
    ort.env.wasm.numThreads = 1;
  }

  ortConfigured = true;
}

async function canUseWebGpu(): Promise<boolean> {
  if (typeof navigator === "undefined" || !("gpu" in navigator)) return false;
  try {
    const adapter = await (
      navigator as Navigator & {
        gpu?: { requestAdapter: () => Promise<unknown | null> };
      }
    ).gpu?.requestAdapter();
    return Boolean(adapter);
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Session management (singleton cache)
// ---------------------------------------------------------------------------

let loadedSessionKey: string | null = null;
let sessionPromise: Promise<InferenceSession> | null = null;

async function createSession(modelUrl: string): Promise<InferenceSession> {
  configureOrtEnv();

  const webGpuAvailable = await canUseWebGpu();
  const preferred: InferenceSession.SessionOptions["executionProviders"] =
    webGpuAvailable ? ["webgpu", "wasm"] : ["wasm"];

  try {
    return await ort.InferenceSession.create(modelUrl, {
      executionProviders: preferred,
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

async function getSession(
  modelUrl: string,
  onProgress?: (progress: number, status: string) => void,
): Promise<InferenceSession> {
  if (!sessionPromise || loadedSessionKey !== modelUrl) {
    loadedSessionKey = modelUrl;
    sessionPromise = (async () => {
      onProgress?.(5, "Loading upscale model…");
      const session = await createSession(modelUrl);
      onProgress?.(30, "Upscale model ready");
      return session;
    })();
  }
  return sessionPromise;
}

// ---------------------------------------------------------------------------
// Tensor helpers
// ---------------------------------------------------------------------------

/** RGBA canvas pixels → [1, 3, H, W] float32 (0‑1). Alpha is dropped. */
function rgbaToFloat32Chw(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const pixels = width * height;
  const chw = new Float32Array(3 * pixels);
  for (let i = 0; i < pixels; i++) {
    const off = i * 4;
    chw[i] = rgba[off] / 255;
    chw[i + pixels] = rgba[off + 1] / 255;
    chw[i + pixels * 2] = rgba[off + 2] / 255;
  }
  return chw;
}

/** [1, 3, H, W] float32 (0‑1) → RGBA Uint8ClampedArray (alpha = 255). */
function float32ChwToRgba(
  data: Float32Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const pixels = width * height;
  const rgba = new Uint8ClampedArray(pixels * 4);
  for (let i = 0; i < pixels; i++) {
    const off = i * 4;
    rgba[off] = Math.max(0, Math.min(255, Math.round(data[i] * 255)));
    rgba[off + 1] = Math.max(
      0,
      Math.min(255, Math.round(data[i + pixels] * 255)),
    );
    rgba[off + 2] = Math.max(
      0,
      Math.min(255, Math.round(data[i + pixels * 2] * 255)),
    );
    rgba[off + 3] = 255;
  }
  return rgba;
}

// ---------------------------------------------------------------------------
// Alpha channel upscale (bilinear)
// ---------------------------------------------------------------------------

function upscaleAlpha(
  srcAlpha: Uint8ClampedArray,
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(dstW * dstH);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;
  for (let y = 0; y < dstH; y++) {
    const srcY = y * yRatio;
    const y0 = Math.floor(srcY);
    const y1 = Math.min(y0 + 1, srcH - 1);
    const fy = srcY - y0;
    for (let x = 0; x < dstW; x++) {
      const srcX = x * xRatio;
      const x0 = Math.floor(srcX);
      const x1 = Math.min(x0 + 1, srcW - 1);
      const fx = srcX - x0;
      const a =
        srcAlpha[y0 * srcW + x0] * (1 - fx) * (1 - fy) +
        srcAlpha[y0 * srcW + x1] * fx * (1 - fy) +
        srcAlpha[y1 * srcW + x0] * (1 - fx) * fy +
        srcAlpha[y1 * srcW + x1] * fx * fy;
      out[y * dstW + x] = Math.max(0, Math.min(255, Math.round(a)));
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Core: tile‑based upscale
// ---------------------------------------------------------------------------

export interface UpscaleOptions {
  scale: UpscaleScale;
  tileSize?: number;
  onProgress?: (progress: number, status: string) => void;
}

async function upscaleTile(
  session: InferenceSession,
  imageData: ImageData,
): Promise<ImageData> {
  const { width, height, data } = imageData;
  const input = rgbaToFloat32Chw(data, width, height);
  const tensor = new ort.Tensor("float32", input, [1, 3, height, width]);

  const feeds: Record<string, ort.Tensor> = {
    [session.inputNames[0]]: tensor,
  };
  const results = await session.run(feeds);
  const output = results[session.outputNames[0]];

  if (!output) throw new Error("Upscale model returned no output tensor.");

  const outH = Number(output.dims[2]);
  const outW = Number(output.dims[3]);
  const rgba = float32ChwToRgba(output.data as Float32Array, outW, outH);
  // Ensure a plain ArrayBuffer for ImageData compatibility.
  const rgbaBuf = new Uint8ClampedArray(new ArrayBuffer(rgba.length));
  rgbaBuf.set(rgba);
  return new ImageData(rgbaBuf, outW, outH);
}

export async function upscaleCanvas(
  sourceCanvas: HTMLCanvasElement,
  options: UpscaleOptions,
): Promise<HTMLCanvasElement> {
  const { scale, tileSize = DEFAULT_TILE_SIZE, onProgress } = options;
  const modelScale = 4; // model always produces x4

  const srcW = sourceCanvas.width;
  const srcH = sourceCanvas.height;
  if (srcW === 0 || srcH === 0) return sourceCanvas;

  // 1. Load session (0‑30%)
  onProgress?.(0, "Loading upscale model…");
  const session = await getSession(UPSCALE_MODEL_URL, onProgress);

  // 2. Extract source data & alpha
  const srcCtx = sourceCanvas.getContext("2d")!;
  const srcData = srcCtx.getImageData(0, 0, srcW, srcH);

  const hasAlpha = (() => {
    for (let i = 3; i < srcData.data.length; i += 4) {
      if (srcData.data[i] < 255) return true;
    }
    return false;
  })();

  // 3. Prepare output canvas at x4
  const outW4 = srcW * modelScale;
  const outH4 = srcH * modelScale;
  const outCanvas = document.createElement("canvas");
  outCanvas.width = outW4;
  outCanvas.height = outH4;
  const outCtx = outCanvas.getContext("2d")!;

  // 4. Tile-based upscale (30‑90%)
  const cols = Math.ceil(srcW / tileSize);
  const rows = Math.ceil(srcH / tileSize);
  const totalTiles = cols * rows;
  let processed = 0;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const tileX = col * tileSize;
      const tileY = row * tileSize;
      const tileW = Math.min(tileSize, srcW - tileX);
      const tileH = Math.min(tileSize, srcH - tileY);

      // Pad tile for seamless edges
      const padX1 = Math.min(TILE_PAD, tileX);
      const padY1 = Math.min(TILE_PAD, tileY);
      const padX2 = Math.min(TILE_PAD, srcW - tileX - tileW);
      const padY2 = Math.min(TILE_PAD, srcH - tileY - tileH);

      const extractX = tileX - padX1;
      const extractY = tileY - padY1;
      const extractW = tileW + padX1 + padX2;
      const extractH = tileH + padY1 + padY2;

      const tileData = srcCtx.getImageData(
        extractX,
        extractY,
        extractW,
        extractH,
      );

      const upscaled = await upscaleTile(session, tileData);

      // Crop the padded region from the upscaled result
      const cropX = padX1 * modelScale;
      const cropY = padY1 * modelScale;
      const cropW = tileW * modelScale;
      const cropH = tileH * modelScale;

      // Use temporary canvas to crop
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = upscaled.width;
      tmpCanvas.height = upscaled.height;
      const tmpCtx = tmpCanvas.getContext("2d")!;
      tmpCtx.putImageData(upscaled, 0, 0);

      outCtx.drawImage(
        tmpCanvas,
        cropX,
        cropY,
        cropW,
        cropH,
        tileX * modelScale,
        tileY * modelScale,
        cropW,
        cropH,
      );

      processed++;
      onProgress?.(
        30 + (processed / totalTiles) * 60,
        `Upscaling tile ${processed}/${totalTiles}…`,
      );
    }
  }

  // 5. Restore alpha channel if needed
  if (hasAlpha) {
    onProgress?.(92, "Restoring alpha channel…");
    const srcAlpha = new Uint8ClampedArray(srcW * srcH);
    for (let i = 0; i < srcW * srcH; i++) {
      srcAlpha[i] = srcData.data[i * 4 + 3];
    }
    const dstAlpha = upscaleAlpha(srcAlpha, srcW, srcH, outW4, outH4);
    const outData = outCtx.getImageData(0, 0, outW4, outH4);
    for (let i = 0; i < outW4 * outH4; i++) {
      outData.data[i * 4 + 3] = dstAlpha[i];
    }
    outCtx.putImageData(outData, 0, 0);
  }

  // 6. Downscale to x2 if requested
  if (scale === 2) {
    onProgress?.(95, "Downscaling to x2…");
    const halfW = srcW * 2;
    const halfH = srcH * 2;
    const halfCanvas = document.createElement("canvas");
    halfCanvas.width = halfW;
    halfCanvas.height = halfH;
    const halfCtx = halfCanvas.getContext("2d")!;
    halfCtx.imageSmoothingEnabled = true;
    halfCtx.imageSmoothingQuality = "high";
    halfCtx.drawImage(outCanvas, 0, 0, halfW, halfH);
    onProgress?.(100, "Done");
    return halfCanvas;
  }

  onProgress?.(100, "Done");
  return outCanvas;
}

export function getUpscaleErrorMessage(error: unknown): string {
  const msg =
    error instanceof Error ? error.message : String(error ?? "Unknown error");
  const lower = msg.toLowerCase();

  if (lower.includes("out of memory") || lower.includes("allocation failed")) {
    return "메모리 부족 — 더 작은 이미지로 시도하세요.";
  }
  if (lower.includes("404") || lower.includes("failed to fetch")) {
    return "모델 파일 다운로드 실패 (네트워크 오류).";
  }
  return msg;
}
