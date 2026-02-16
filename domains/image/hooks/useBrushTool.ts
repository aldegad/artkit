"use client";

import { useState, useCallback, useRef, RefObject } from "react";
import { Point } from "../types";
import { BrushPreset } from "../types/brush";
import { useEditorState, useEditorRefs } from "../contexts";
import {
  DEFAULT_BRUSH_PRESETS,
  calculateDrawingParameters,
  loadCustomPresets,
  saveCustomPresets,
  loadActivePresetId,
  saveActivePresetId,
} from "../constants/brushPresets";
import {
  imageToCanvas,
  ViewContext,
  getDisplayDimensions as getRotatedDisplayDimensions,
} from "../utils/coordinateSystem";
import {
  drawDab,
  eraseDabLinear,
  eraseLineLinear,
  parseHexColor,
  resetEraseAlphaCarry,
  resetPaintAlphaCarry,
} from "@/shared/utils/brushEngine";
import {
  getLayerAlphaMaskContext,
  drawLayerWithOptionalAlphaMask,
} from "@/shared/utils/layerAlphaMask";

// ============================================
// Types
// ============================================

interface UseBrushToolReturn {
  // Brush State
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  brushColor: string;
  setBrushColor: React.Dispatch<React.SetStateAction<string>>;
  brushHardness: number;
  setBrushHardness: React.Dispatch<React.SetStateAction<number>>;
  brushOpacity: number;
  setBrushOpacity: React.Dispatch<React.SetStateAction<number>>;
  stampSource: Point | null;
  setStampSource: React.Dispatch<React.SetStateAction<Point | null>>;

  // Preset State
  activePreset: BrushPreset;
  setActivePreset: (preset: BrushPreset) => void;
  presets: BrushPreset[];
  addCustomPreset: (preset: Omit<BrushPreset, "id" | "isBuiltIn">) => void;
  deletePreset: (presetId: string) => void;
  pressureEnabled: boolean;
  setPressureEnabled: React.Dispatch<React.SetStateAction<boolean>>;

  // Actions
  drawOnEditCanvas: (x: number, y: number, isStart?: boolean, pressure?: number) => void;
  pickColor: (
    x: number,
    y: number,
    canvasRef: RefObject<HTMLCanvasElement | null>,
    zoom: number,
    pan: Point
  ) => void;
  resetLastDrawPoint: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useBrushTool(): UseBrushToolReturn {
  const {
    state: { canvasSize, rotation, toolMode },
  } = useEditorState();

  const { editCanvasRef } = useEditorRefs();

  const getDisplayDimensions = useCallback(() => {
    return getRotatedDisplayDimensions(canvasSize, rotation);
  }, [rotation, canvasSize]);

  // ============================================
  // Preset State
  // ============================================

  const [presets, setPresets] = useState<BrushPreset[]>(() => {
    const custom = loadCustomPresets();
    return [...DEFAULT_BRUSH_PRESETS, ...custom];
  });

  const [activePreset, setActivePresetState] = useState<BrushPreset>(() => {
    const savedId = loadActivePresetId();
    const all = [...DEFAULT_BRUSH_PRESETS, ...loadCustomPresets()];
    return all.find((p) => p.id === savedId) || DEFAULT_BRUSH_PRESETS[0];
  });

  const [pressureEnabled, setPressureEnabled] = useState(true);

  // ============================================
  // Basic Brush State
  // ============================================

  const [brushSize, setBrushSize] = useState(() => activePreset.defaultSize);
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushHardness, setBrushHardness] = useState(() => activePreset.defaultHardness);
  const [brushOpacity, setBrushOpacity] = useState(100);
  const [stampSource, setStampSource] = useState<Point | null>(null);

  const lastDrawPoint = useRef<Point | null>(null);
  const stampOffset = useRef<Point | null>(null);
  const brushMaskScratchRef = useRef<{
    canvas: HTMLCanvasElement | null;
    ctx: CanvasRenderingContext2D | null;
    width: number;
    height: number;
  }>({
    canvas: null,
    ctx: null,
    width: 0,
    height: 0,
  });

  // ============================================
  // Preset Management
  // ============================================

  const setActivePreset = useCallback((preset: BrushPreset) => {
    setActivePresetState(preset);
    setBrushSize(preset.defaultSize);
    setBrushHardness(preset.defaultHardness);
    saveActivePresetId(preset.id);
  }, []);

  const addCustomPreset = useCallback((preset: Omit<BrushPreset, "id" | "isBuiltIn">) => {
    const newPreset: BrushPreset = {
      ...preset,
      id: `custom-${Date.now()}`,
      isBuiltIn: false,
    };
    setPresets((prev) => {
      const updated = [...prev, newPreset];
      saveCustomPresets(updated);
      return updated;
    });
  }, []);

  const deletePreset = useCallback(
    (presetId: string) => {
      setPresets((prev) => {
        const preset = prev.find((p) => p.id === presetId);
        if (preset?.isBuiltIn) return prev; // Cannot delete built-in

        const updated = prev.filter((p) => p.id !== presetId);
        saveCustomPresets(updated);

        // If deleted preset was active, switch to first preset
        if (activePreset.id === presetId) {
          setActivePreset(DEFAULT_BRUSH_PRESETS[0]);
        }

        return updated;
      });
    },
    [activePreset.id, setActivePreset]
  );

  // ============================================
  // Drawing Logic
  // ============================================

  const resetLastDrawPoint = useCallback(() => {
    lastDrawPoint.current = null;
    stampOffset.current = null;
  }, []);

  const ensureBrushMaskScratch = useCallback((width: number, height: number): CanvasRenderingContext2D | null => {
    if (typeof document === "undefined") return null;
    const scratch = brushMaskScratchRef.current;
    if (
      !scratch.canvas
      || !scratch.ctx
      || scratch.width !== width
      || scratch.height !== height
    ) {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      scratch.canvas = canvas;
      scratch.ctx = ctx;
      scratch.width = width;
      scratch.height = height;
    }
    return scratch.ctx;
  }, []);

  const normalizeDabAlpha = useCallback(
    (baseAlpha: number, spacing: number, referenceSpacing: number): number => {
      const alpha = Math.max(0, Math.min(1, baseAlpha));
      if (alpha <= 0) return 0;
      if (alpha >= 1) return 1;

      const clampedSpacing = Math.max(0.2, spacing);
      const clampedReferenceSpacing = Math.max(0.2, referenceSpacing);
      // Keep stroke density stable: when spacing is reduced (more dabs), scale
      // each dab down so one pass does not overfill instantly.
      const coverage = Math.max(0.02, Math.min(1, clampedSpacing / clampedReferenceSpacing));
      return 1 - Math.pow(1 - alpha, coverage);
    },
    []
  );

  const stampBrushDab = useCallback((ctx: CanvasRenderingContext2D, options: {
    x: number;
    y: number;
    radius: number;
    hardness01: number;
    color: string;
    alpha: number;
  }): void => {
    const alpha = Math.max(0, Math.min(1, options.alpha));
    if (alpha <= 0 || options.radius <= 0) return;
    const canvasWidth = ctx.canvas.width;
    const canvasHeight = ctx.canvas.height;
    const pad = 2;
    const left = Math.floor(options.x - options.radius - pad);
    const top = Math.floor(options.y - options.radius - pad);
    const right = Math.ceil(options.x + options.radius + pad);
    const bottom = Math.ceil(options.y + options.radius + pad);

    const clampedLeft = Math.max(0, Math.min(canvasWidth, left));
    const clampedTop = Math.max(0, Math.min(canvasHeight, top));
    const clampedRight = Math.max(0, Math.min(canvasWidth, right));
    const clampedBottom = Math.max(0, Math.min(canvasHeight, bottom));
    const width = clampedRight - clampedLeft;
    const height = clampedBottom - clampedTop;
    if (width <= 0 || height <= 0) return;

    const maskCtx = ensureBrushMaskScratch(width, height);
    if (!maskCtx) return;

    const localX = options.x - clampedLeft;
    const localY = options.y - clampedTop;
    const innerStop = Math.max(0, Math.min(0.999, options.hardness01));
    maskCtx.clearRect(0, 0, width, height);
    const gradient = maskCtx.createRadialGradient(localX, localY, 0, localX, localY, options.radius);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    if (innerStop > 0) {
      gradient.addColorStop(innerStop, "rgba(255,255,255,1)");
    }
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    maskCtx.fillStyle = gradient;
    maskCtx.beginPath();
    maskCtx.arc(localX, localY, options.radius, 0, Math.PI * 2);
    maskCtx.fill();

    const targetImage = ctx.getImageData(clampedLeft, clampedTop, width, height);
    const maskImage = maskCtx.getImageData(0, 0, width, height);
    const target = targetImage.data;
    const mask = maskImage.data;
    const [r, g, b] = parseHexColor(options.color);

    for (let i = 0; i < target.length; i += 4) {
      const srcA = (mask[i + 3] / 255) * alpha;
      if (srcA <= 0) continue;

      const dstA = target[i + 3] / 255;
      // Standard source-over alpha accumulation:
      // repeated passes over the same area gradually increase opacity.
      const outA = dstA + srcA * (1 - dstA);
      const outAlpha = Math.round(outA * 255);
      if (outAlpha <= 0) continue;

      target[i] = r;
      target[i + 1] = g;
      target[i + 2] = b;
      target[i + 3] = outAlpha;
    }

    ctx.putImageData(targetImage, clampedLeft, clampedTop);
  }, [ensureBrushMaskScratch]);

  const drawContinuousBrushStroke = useCallback((ctx: CanvasRenderingContext2D, options: {
    from: Point;
    to: Point;
    radius: number;
    hardness01: number;
    color: string;
    alpha: number;
    baseSpacing: number;
  }): void => {
    const dx = options.to.x - options.from.x;
    const dy = options.to.y - options.from.y;
    const distance = Math.hypot(dx, dy);
    const alpha = Math.max(0, Math.min(1, options.alpha));
    const hardness01 = Math.max(0, Math.min(1, options.hardness01));
    const referenceSpacing = Math.max(0.2, options.baseSpacing);
    const maxSpacingBySoftness = Math.max(
      0.2,
      options.radius * (0.03 + hardness01 * 0.07 + alpha * 0.05)
    );
    const spacing = Math.max(0.2, Math.min(referenceSpacing, maxSpacingBySoftness));
    const dabAlpha = normalizeDabAlpha(alpha, spacing, referenceSpacing);
    if (distance <= 0.001) {
      stampBrushDab(ctx, {
        x: options.to.x,
        y: options.to.y,
        radius: options.radius,
        hardness01: options.hardness01,
        color: options.color,
        alpha: dabAlpha,
      });
      return;
    }

    const steps = Math.max(1, Math.ceil(distance / spacing));

    for (let i = 1; i <= steps; i += 1) {
      const t = i / steps;
      stampBrushDab(ctx, {
        x: options.from.x + dx * t,
        y: options.from.y + dy * t,
        radius: options.radius,
        hardness01: options.hardness01,
        color: options.color,
        alpha: dabAlpha,
      });
    }
  }, [stampBrushDab, normalizeDabAlpha]);

  const drawOnEditCanvas = useCallback(
    (x: number, y: number, isStart: boolean = false, pressure: number = 1) => {
      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      if (!editCanvas || !ctx) return;

      // Calculate pressure-adjusted parameters
      const params = calculateDrawingParameters(pressure, activePreset, brushSize, pressureEnabled);

      // Allow off-canvas centers so soft edges can still affect near-border pixels.
      const edgeMargin = Math.max(1, params.size / 2);
      x = Math.max(-edgeMargin, Math.min(x, editCanvas.width + edgeMargin));
      y = Math.max(-edgeMargin, Math.min(y, editCanvas.height + edgeMargin));

      const strokeAlpha = (brushOpacity / 100) * params.opacity * params.flow;
      const lineSpacing = Math.max(1, params.size * (activePreset.spacing / 100));

      if (toolMode === "brush") {
        ctx.globalCompositeOperation = "source-over";
        const maskCtx = getLayerAlphaMaskContext(editCanvas);
        const radius = params.size / 2;
        const hardness01 = brushHardness / 100;
        const referenceSpacing = Math.max(0.2, lineSpacing);
        const maxSpacingBySoftness = Math.max(
          0.2,
          radius * (0.03 + hardness01 * 0.07 + strokeAlpha * 0.05)
        );
        const initialSpacing = Math.max(0.2, Math.min(referenceSpacing, maxSpacingBySoftness));
        const startDabAlpha = normalizeDabAlpha(strokeAlpha, initialSpacing, referenceSpacing);

        if (isStart || !lastDrawPoint.current) {
          resetPaintAlphaCarry(ctx);
          stampBrushDab(ctx, {
            x,
            y,
            radius,
            hardness01,
            color: brushColor,
            alpha: startDabAlpha,
          });
          if (maskCtx) {
            resetPaintAlphaCarry(maskCtx);
            stampBrushDab(maskCtx, {
              x,
              y,
              radius,
              hardness01,
              color: "#ffffff",
              alpha: 1,
            });
          }
        } else {
          drawContinuousBrushStroke(ctx, {
            from: lastDrawPoint.current,
            to: { x, y },
            radius,
            hardness01,
            color: brushColor,
            alpha: strokeAlpha,
            baseSpacing: lineSpacing,
          });
          if (maskCtx) {
            drawContinuousBrushStroke(maskCtx, {
              from: lastDrawPoint.current,
              to: { x, y },
              radius,
              hardness01,
              color: "#ffffff",
              alpha: 1,
              baseSpacing: lineSpacing,
            });
          }
        }
      } else if (toolMode === "eraser") {
        const maskCtx = getLayerAlphaMaskContext(editCanvas, true);
        if (!maskCtx) return;

        if (isStart || !lastDrawPoint.current) {
          resetEraseAlphaCarry(maskCtx);
          eraseDabLinear(maskCtx, {
            x,
            y,
            radius: params.size / 2,
            hardness: brushHardness / 100,
            alpha: strokeAlpha,
          });
        } else {
          eraseLineLinear(maskCtx, {
            from: lastDrawPoint.current,
            to: { x, y },
            spacing: lineSpacing,
            dab: {
              radius: params.size / 2,
              hardness: brushHardness / 100,
              alpha: strokeAlpha,
            },
          });
        }
      } else if (toolMode === "stamp" && stampSource) {
        // Clone stamp - sample from current layer snapshot and paint to destination.
        if (isStart || !lastDrawPoint.current || !stampOffset.current) {
          stampOffset.current = {
            x: x - stampSource.x,
            y: y - stampSource.y,
          };
        }
        const currentOffset = stampOffset.current ?? { x: 0, y: 0 };
        const maskCtx = getLayerAlphaMaskContext(editCanvas);
        if (isStart && maskCtx) {
          resetPaintAlphaCarry(maskCtx);
        }

        // Snapshot once per call so sampling stays stable while we paint.
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = editCanvas.width;
        sourceCanvas.height = editCanvas.height;
        const sourceCtx = sourceCanvas.getContext("2d");
        if (!sourceCtx) return;
        drawLayerWithOptionalAlphaMask(sourceCtx, editCanvas, 0, 0);

        const drawStampDab = (destX: number, destY: number) => {
          const sourceX = destX - currentOffset.x;
          const sourceY = destY - currentOffset.y;
          const halfBrush = params.size / 2;

          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = strokeAlpha;
          ctx.beginPath();
          ctx.arc(destX, destY, halfBrush, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(
            sourceCanvas,
            sourceX - halfBrush,
            sourceY - halfBrush,
            params.size,
            params.size,
            destX - halfBrush,
            destY - halfBrush,
            params.size,
            params.size
          );
          ctx.restore();

          if (maskCtx) {
            drawDab(maskCtx, {
              x: destX,
              y: destY,
              radius: params.size / 2,
              hardness: brushHardness / 100,
              color: "#ffffff",
              alpha: 1,
              isEraser: false,
            });
          }
        };

        if (isStart || !lastDrawPoint.current) {
          drawStampDab(x, y);
        } else {
          const dx = x - lastDrawPoint.current.x;
          const dy = y - lastDrawPoint.current.y;
          const distance = Math.hypot(dx, dy);

          if (distance <= 0) {
            drawStampDab(x, y);
          } else {
            const steps = Math.max(1, Math.ceil(distance / lineSpacing));
            for (let i = 1; i <= steps; i += 1) {
              const t = i / steps;
              drawStampDab(lastDrawPoint.current.x + dx * t, lastDrawPoint.current.y + dy * t);
            }
          }
        }
      }

      lastDrawPoint.current = { x, y };
    },
    [
      editCanvasRef,
      toolMode,
      brushSize,
      brushColor,
      brushHardness,
      brushOpacity,
      stampSource,
      activePreset,
      pressureEnabled,
      stampBrushDab,
      drawContinuousBrushStroke,
      normalizeDabAlpha,
    ]
  );

  // Pick color from canvas
  const pickColor = useCallback(
    (
      x: number,
      y: number,
      canvasRef: RefObject<HTMLCanvasElement | null>,
      zoom: number,
      pan: Point
    ) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      const rect = canvas.getBoundingClientRect();
      const logicalWidth = rect.width;
      const logicalHeight = rect.height;
      if (logicalWidth <= 0 || logicalHeight <= 0) return;

      const displaySize = getDisplayDimensions();
      const viewContext: ViewContext = {
        canvasSize: { width: logicalWidth, height: logicalHeight },
        displaySize,
        zoom,
        pan,
      };

      // Convert image position to screen position using utility
      const screenPos = imageToCanvas({ x, y }, viewContext);

      const pixelScaleX = canvas.width / logicalWidth;
      const pixelScaleY = canvas.height / logicalHeight;
      const sampleX = Math.max(0, Math.min(canvas.width - 1, Math.round(screenPos.x * pixelScaleX)));
      const sampleY = Math.max(0, Math.min(canvas.height - 1, Math.round(screenPos.y * pixelScaleY)));
      const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
      const hex =
        "#" + [pixel[0], pixel[1], pixel[2]].map((c) => c.toString(16).padStart(2, "0")).join("");
      setBrushColor(hex);
    },
    [getDisplayDimensions]
  );

  return {
    // Basic state
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    brushHardness,
    setBrushHardness,
    brushOpacity,
    setBrushOpacity,
    stampSource,
    setStampSource,

    // Preset state
    activePreset,
    setActivePreset,
    presets,
    addCustomPreset,
    deletePreset,
    pressureEnabled,
    setPressureEnabled,

    // Actions
    drawOnEditCanvas,
    pickColor,
    resetLastDrawPoint,
  };
}
