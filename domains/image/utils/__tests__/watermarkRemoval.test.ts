import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

// ---------------------------------------------------------------------------
// Mock MI-GAN: returns the original RGBA with hole pixels replaced by a solid
// colour (green: 0,255,0,255) so we can easily verify the composite.
// ---------------------------------------------------------------------------
vi.mock("@/shared/ai/miganInpainting", () => ({
  inpaintFrameWithMiGan: vi.fn(
    async ({
      rgba,
      holeMask,
      width,
      height,
    }: {
      rgba: Uint8ClampedArray;
      holeMask: Uint8Array;
      width: number;
      height: number;
      onProgress?: (p: number, s: string) => void;
    }) => {
      const result = new Uint8ClampedArray(rgba);
      for (let i = 0; i < width * height; i++) {
        if (holeMask[i] > 0) {
          const off = i * 4;
          result[off] = 0; // R
          result[off + 1] = 255; // G
          result[off + 2] = 0; // B
          result[off + 3] = 255; // A
        }
      }
      return result;
    }
  ),
}));

// ---------------------------------------------------------------------------
// Minimal Canvas/ImageData polyfill for Node.js
// ---------------------------------------------------------------------------
class FakeImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
  constructor(data: Uint8ClampedArray, width: number, height?: number) {
    this.data = data;
    this.width = width;
    this.height = height ?? data.length / (4 * width);
  }
}
(globalThis as Record<string, unknown>).ImageData = FakeImageData;

class FakeContext2D {
  _canvas: FakeCanvas;
  _imageData: Uint8ClampedArray;
  globalCompositeOperation = "source-over";
  fillStyle = "white";
  strokeStyle = "white";
  lineWidth = 1;
  lineCap = "round";
  lineJoin = "round";
  globalAlpha = 1;

  constructor(canvas: FakeCanvas) {
    this._canvas = canvas;
    this._imageData = new Uint8ClampedArray(canvas.width * canvas.height * 4);
  }

  getImageData(
    _x: number,
    _y: number,
    w: number,
    h: number
  ): FakeImageData {
    return new FakeImageData(
      new Uint8ClampedArray(this._imageData.buffer.slice(0)),
      w,
      h
    );
  }

  putImageData(imageData: FakeImageData): void {
    this._imageData.set(imageData.data);
  }

  clearRect(): void {
    this._imageData.fill(0);
  }

  drawImage(source: FakeCanvas): void {
    if (source._ctx) {
      this._imageData.set(source._ctx._imageData);
    }
  }

  // Stubs for methods the code calls but that aren't used for the test logic
  save() {}
  restore() {}
  beginPath() {}
  arc() {}
  fill() {}
  moveTo() {}
  lineTo() {}
  stroke() {}
  fillRect() {}
}

class FakeCanvas {
  width: number;
  height: number;
  _ctx: FakeContext2D | null = null;

  constructor(width = 0, height = 0) {
    this.width = width;
    this.height = height;
  }

  getContext(_type: string): FakeContext2D {
    if (!this._ctx) {
      this._ctx = new FakeContext2D(this);
    }
    return this._ctx;
  }
}

// Patch document.createElement for "canvas"
const origCreateElement = globalThis.document?.createElement;
vi.stubGlobal("document", {
  createElement: (tag: string) => {
    if (tag === "canvas") return new FakeCanvas();
    return origCreateElement?.call(document, tag);
  },
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
import { removeWatermark } from "../watermarkRemoval";

describe("removeWatermark", () => {
  const W = 100;
  const H = 100;

  let sourceCanvas: FakeCanvas;
  let maskCanvas: FakeCanvas;

  beforeEach(() => {
    // Source canvas: fill with solid red (R=255, G=0, B=0, A=255)
    sourceCanvas = new FakeCanvas(W, H);
    const srcCtx = sourceCanvas.getContext("2d");
    const srcData = srcCtx._imageData;
    for (let i = 0; i < W * H; i++) {
      const off = i * 4;
      srcData[off] = 255; // R
      srcData[off + 1] = 0; // G
      srcData[off + 2] = 0; // B
      srcData[off + 3] = 255; // A
    }

    // Mask canvas: mark bottom-right 20x20 (watermark area) as white (alpha > 0)
    maskCanvas = new FakeCanvas(W, H);
    const maskCtx = maskCanvas.getContext("2d");
    const maskData = maskCtx._imageData;
    for (let y = 80; y < 100; y++) {
      for (let x = 80; x < 100; x++) {
        const off = (y * W + x) * 4;
        maskData[off] = 255; // R (white)
        maskData[off + 1] = 255; // G
        maskData[off + 2] = 255; // B
        maskData[off + 3] = 255; // A — indicates "hole"
      }
    }
  });

  it("should replace masked pixels with inpainted result", async () => {
    const progressCalls: [number, string][] = [];

    const result = await removeWatermark({
      sourceCanvas: sourceCanvas as unknown as HTMLCanvasElement,
      maskCanvas: maskCanvas as unknown as HTMLCanvasElement,
      onProgress: (p, s) => progressCalls.push([p, s]),
    });

    // Result should be a canvas-like object
    expect(result).toBeDefined();
    expect(result.width).toBe(W);
    expect(result.height).toBe(H);

    // Check composite: the result context holds the final image data
    const ctx = result.getContext("2d") as unknown as FakeContext2D;
    const imgData = ctx.getImageData(0, 0, W, H);

    // Non-masked pixel (top-left 0,0) should stay original red
    const topLeft = 0;
    expect(imgData.data[topLeft * 4]).toBe(255); // R
    expect(imgData.data[topLeft * 4 + 1]).toBe(0); // G
    expect(imgData.data[topLeft * 4 + 2]).toBe(0); // B

    // Masked pixel (bottom-right 90,90) should be inpainted green
    const maskedIdx = 90 * W + 90;
    expect(imgData.data[maskedIdx * 4]).toBe(0); // R → green
    expect(imgData.data[maskedIdx * 4 + 1]).toBe(255); // G → green
    expect(imgData.data[maskedIdx * 4 + 2]).toBe(0); // B → green

    // Progress was called
    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1][0]).toBe(100);
  });

  it("should preserve original alpha in non-masked areas", async () => {
    // Make some source pixels semi-transparent
    const srcCtx = sourceCanvas.getContext("2d");
    const off = 10 * 4; // pixel at (10, 0)
    srcCtx._imageData[off + 3] = 128; // semi-transparent

    const result = await removeWatermark({
      sourceCanvas: sourceCanvas as unknown as HTMLCanvasElement,
      maskCanvas: maskCanvas as unknown as HTMLCanvasElement,
    });

    const ctx = result.getContext("2d") as unknown as FakeContext2D;
    const imgData = ctx.getImageData(0, 0, W, H);

    // Alpha at (10,0) should remain 128 (original, not overwritten)
    expect(imgData.data[off + 3]).toBe(128);
  });

  it("should call inpaintFrameWithMiGan with correct dimensions", async () => {
    const { inpaintFrameWithMiGan } = await import(
      "@/shared/ai/miganInpainting"
    );

    await removeWatermark({
      sourceCanvas: sourceCanvas as unknown as HTMLCanvasElement,
      maskCanvas: maskCanvas as unknown as HTMLCanvasElement,
    });

    expect(inpaintFrameWithMiGan).toHaveBeenCalled();
    const calls = vi.mocked(inpaintFrameWithMiGan).mock.calls;
    const call = calls[calls.length - 1][0];
    expect(call.width).toBe(W);
    expect(call.height).toBe(H);
    expect(call.rgba.length).toBe(W * H * 4);
    expect(call.holeMask.length).toBe(W * H);

    // Verify mask: pixel at (90,90) should be 255 (hole), pixel at (0,0) should be 0
    const holeMaskIdx00 = 0;
    const holeMaskIdx9090 = 90 * W + 90;
    expect(call.holeMask[holeMaskIdx00]).toBe(0);
    expect(call.holeMask[holeMaskIdx9090]).toBe(255);
  });

  it("should load real test image file exists", () => {
    const testImagePath = path.resolve(
      __dirname,
      "../../../../public/test-watermark-soda.jpg"
    );
    expect(fs.existsSync(testImagePath)).toBe(true);
  });
});
