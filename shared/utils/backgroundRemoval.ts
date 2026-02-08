/**
 * Background Removal Utility using Transformers.js
 * Runs AI model in browser - no server needed, fully compatible with static builds
 */

import { env, AutoModel, AutoProcessor, RawImage } from "@huggingface/transformers";

// Configure for browser-only usage (static build compatible)
env.allowLocalModels = false;
env.useBrowserCache = true;

// Suppress ONNX Runtime warnings by filtering console output during model loading
// These warnings are just performance hints about node assignment, not actual errors
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;

function suppressOrtWarnings() {
  const ortWarningPattern = /onnxruntime|VerifyEachNodeIsAssignedToAnEp/i;

  console.error = (...args: unknown[]) => {
    const message = args.join(" ");
    if (!ortWarningPattern.test(message)) {
      originalConsoleError.apply(console, args);
    }
  };

  console.warn = (...args: unknown[]) => {
    const message = args.join(" ");
    if (!ortWarningPattern.test(message)) {
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
      console.log("[Background Removal] Starting model load...");

      // Suppress ONNX Runtime warnings during model loading
      suppressOrtWarnings();

      // Check WebGPU availability first
      let useWebGPU = false;
      if (typeof navigator !== "undefined" && "gpu" in navigator) {
        try {
          const adapter = await (navigator as Navigator & { gpu: { requestAdapter: () => Promise<unknown> } }).gpu.requestAdapter();
          useWebGPU = adapter !== null;
          console.log("[Background Removal] WebGPU available:", useWebGPU);
        } catch {
          console.log("[Background Removal] WebGPU check failed, using WASM");
        }
      }

      const device = useWebGPU ? "webgpu" : "wasm";
      console.log("[Background Removal] Using device:", device);

      // Load model
      console.log("[Background Removal] Loading model...");
      const loadedModel = await AutoModel.from_pretrained(MODEL_ID, {
        device,
        dtype: device === "webgpu" ? "fp32" : undefined,
        progress_callback: (progress: { status: string; progress?: number }) => {
          if (progress.progress !== undefined) {
            onProgress?.(progress.progress * 0.5, progress.status);
          }
        },
      });
      console.log("[Background Removal] Model loaded successfully");

      // Load processor
      console.log("[Background Removal] Loading processor...");
      const loadedProcessor = await AutoProcessor.from_pretrained(MODEL_ID, {
        progress_callback: (progress: { status: string; progress?: number }) => {
          if (progress.progress !== undefined) {
            onProgress?.(50 + progress.progress * 0.5, progress.status);
          }
        },
      });
      console.log("[Background Removal] Processor loaded successfully");

      model = loadedModel;
      processor = loadedProcessor;
      onProgress?.(100, "Model ready");
      console.log("[Background Removal] Ready!");
    } catch (error) {
      console.error("[Background Removal] Load failed:", error);
      throw error;
    } finally {
      // Restore console after model loading
      restoreConsole();
      isLoading = false;
      loadingPromise = null;
    }
  })();

  await loadingPromise;
}

/**
 * Remove background from an image
 * @param imageSource - Image URL, Blob, or HTMLImageElement
 * @param onProgress - Progress callback (0-100)
 * @returns Canvas with transparent background
 */
export async function removeBackground(
  imageSource: string | Blob | HTMLImageElement,
  onProgress?: (progress: number, status: string) => void
): Promise<HTMLCanvasElement> {
  console.log("[Background Removal] removeBackground called");

  // Load model if not loaded
  await loadModel((progress, status) => {
    onProgress?.(progress * 0.5, status);
  });

  if (!model || !processor) {
    throw new Error("Failed to load model");
  }

  console.log("[Background Removal] Model check passed, processing image...");
  onProgress?.(50, "Processing image...");

  // Load image
  let image: RawImage;
  if (typeof imageSource === "string") {
    console.log("[Background Removal] Loading image from URL...");
    image = await RawImage.fromURL(imageSource);
  } else if (imageSource instanceof Blob) {
    console.log("[Background Removal] Loading image from Blob...");
    const url = URL.createObjectURL(imageSource);
    try {
      image = await RawImage.fromURL(url);
    } finally {
      URL.revokeObjectURL(url);
    }
  } else {
    // HTMLImageElement
    console.log("[Background Removal] Loading image from HTMLImageElement...");
    image = await RawImage.fromURL(imageSource.src);
  }
  console.log("[Background Removal] Image loaded:", image.width, "x", image.height);

  onProgress?.(60, "Running AI model...");

  // Process image
  console.log("[Background Removal] Running processor...");
  const { pixel_values } = await processor(image);
  console.log("[Background Removal] Processor done, running model...");

  // Run model
  const modelOutput = await model({ input: pixel_values });
  console.log("[Background Removal] Model inference done");
  console.log("[Background Removal] Model output keys:", Object.keys(modelOutput));

  onProgress?.(80, "Applying mask...");

  // Post-process mask - RMBG-1.4 output format
  // The model may return output in different formats
  let maskTensor;
  if (modelOutput.output) {
    console.log("[Background Removal] Using 'output' key");
    maskTensor = modelOutput.output;
  } else if (modelOutput.logits) {
    console.log("[Background Removal] Using 'logits' key");
    maskTensor = modelOutput.logits;
  } else {
    // Try first available key
    const keys = Object.keys(modelOutput);
    console.log("[Background Removal] Trying first key:", keys[0]);
    maskTensor = modelOutput[keys[0]];
  }

  console.log("[Background Removal] Mask tensor shape:", maskTensor?.dims || maskTensor?.shape);

  // Squeeze tensor to remove batch dimensions [1, 1, H, W] -> [H, W]
  // RawImage.fromTensor expects 3D tensor [C, H, W] or 2D [H, W]
  let squeezedTensor = maskTensor;
  while (squeezedTensor.dims && squeezedTensor.dims.length > 3) {
    squeezedTensor = squeezedTensor.squeeze(0);
    console.log("[Background Removal] Squeezed to:", squeezedTensor.dims);
  }

  console.log("[Background Removal] Processing mask...");
  const maskData = await RawImage.fromTensor(squeezedTensor.mul(255).to("uint8")).resize(
    image.width,
    image.height
  );
  console.log("[Background Removal] Mask created:", maskData.width, "x", maskData.height);

  console.log("[Background Removal] Creating output canvas...");

  // Create output canvas
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d")!;

  // Draw original image using the source
  // We need to reload the original image to preserve quality
  const originalImg = new Image();
  // Only set crossOrigin for non-data URLs
  if (typeof imageSource === "string" && !imageSource.startsWith("data:")) {
    originalImg.crossOrigin = "anonymous";
  }

  console.log("[Background Removal] Loading original image for canvas...");
  await new Promise<void>((resolve, reject) => {
    originalImg.onload = () => {
      console.log("[Background Removal] Original image loaded");
      resolve();
    };
    originalImg.onerror = (e) => {
      console.error("[Background Removal] Failed to load original image:", e);
      reject(e);
    };
    if (typeof imageSource === "string") {
      originalImg.src = imageSource;
    } else if (imageSource instanceof Blob) {
      originalImg.src = URL.createObjectURL(imageSource);
    } else {
      originalImg.src = imageSource.src;
    }
  });

  console.log("[Background Removal] Drawing original to canvas...");
  // Draw original image to canvas
  ctx.drawImage(originalImg, 0, 0, image.width, image.height);

  // Clean up blob URL if created
  if (imageSource instanceof Blob) {
    URL.revokeObjectURL(originalImg.src);
  }

  console.log("[Background Removal] Applying mask to pixels...");
  // Get image data and apply mask
  const outputData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const totalPixels = image.width * image.height;

  // Apply mask as alpha channel
  // maskData is grayscale, so we use the first channel
  for (let i = 0; i < totalPixels; i++) {
    const maskValue = maskData.data[i * maskData.channels]; // Get first channel of mask
    outputData.data[i * 4 + 3] = maskValue; // Set alpha
  }

  ctx.putImageData(outputData, 0, 0);

  onProgress?.(100, "Done!");

  return canvas;
}

/**
 * Remove background from a canvas element
 * @param sourceCanvas - Source canvas
 * @param onProgress - Progress callback
 * @returns Canvas with transparent background
 */
export async function removeBackgroundFromCanvas(
  sourceCanvas: HTMLCanvasElement,
  onProgress?: (progress: number, status: string) => void
): Promise<HTMLCanvasElement> {
  // Convert canvas to blob
  const blob = await new Promise<Blob>((resolve, reject) => {
    sourceCanvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error("Failed to convert canvas to blob"));
    }, "image/png");
  });

  return removeBackground(blob, onProgress);
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
