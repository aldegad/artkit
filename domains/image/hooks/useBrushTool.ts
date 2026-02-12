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
import { imageToCanvas, ViewContext } from "../utils/coordinateSystem";
import {
  drawDab,
  drawLine,
  eraseDabLinear,
  eraseLineLinear,
  resetEraseAlphaCarry,
} from "@/shared/utils/brushEngine";

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
    const width = rotation % 180 === 0 ? canvasSize.width : canvasSize.height;
    const height = rotation % 180 === 0 ? canvasSize.height : canvasSize.width;
    return { width, height };
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

  const drawOnEditCanvas = useCallback(
    (x: number, y: number, isStart: boolean = false, pressure: number = 1) => {
      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      if (!editCanvas || !ctx) return;

      // Clamp to active layer canvas bounds (layer-local coordinates)
      x = Math.max(0, Math.min(x, editCanvas.width));
      y = Math.max(0, Math.min(y, editCanvas.height));

      // Calculate pressure-adjusted parameters
      const params = calculateDrawingParameters(pressure, activePreset, brushSize, pressureEnabled);

      // Shared dab params for brush/eraser
      const dabParams = (cx: number, cy: number, isEraser: boolean) => ({
        x: cx,
        y: cy,
        radius: params.size / 2,
        hardness: brushHardness / 100,
        color: brushColor,
        alpha: (brushOpacity / 100) * params.opacity * params.flow,
        isEraser,
      });

      const lineSpacing = Math.max(1, params.size * (activePreset.spacing / 100));

      if (toolMode === "brush") {
        ctx.globalCompositeOperation = "source-over";

        if (isStart || !lastDrawPoint.current) {
          drawDab(ctx, dabParams(x, y, false));
        } else {
          drawLine(ctx, {
            from: lastDrawPoint.current,
            to: { x, y },
            spacing: lineSpacing,
            dab: dabParams(0, 0, false),
          });
        }
      } else if (toolMode === "eraser") {
        if (isStart || !lastDrawPoint.current) {
          resetEraseAlphaCarry(ctx);
          eraseDabLinear(ctx, {
            x,
            y,
            radius: params.size / 2,
            hardness: brushHardness / 100,
            alpha: (brushOpacity / 100) * params.opacity * params.flow,
          });
        } else {
          eraseLineLinear(ctx, {
            from: lastDrawPoint.current,
            to: { x, y },
            spacing: lineSpacing,
            dab: {
              radius: params.size / 2,
              hardness: brushHardness / 100,
              alpha: (brushOpacity / 100) * params.opacity * params.flow,
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

        // Snapshot once per call so sampling stays stable while we paint.
        const sourceCanvas = document.createElement("canvas");
        sourceCanvas.width = editCanvas.width;
        sourceCanvas.height = editCanvas.height;
        const sourceCtx = sourceCanvas.getContext("2d");
        if (!sourceCtx) return;
        sourceCtx.drawImage(editCanvas, 0, 0);

        const drawStampDab = (destX: number, destY: number) => {
          const sourceX = destX - currentOffset.x;
          const sourceY = destY - currentOffset.y;
          const halfBrush = params.size / 2;

          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.globalAlpha = (brushOpacity / 100) * params.opacity * params.flow;
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

      const displaySize = getDisplayDimensions();
      const viewContext: ViewContext = {
        canvasSize: { width: canvas.width, height: canvas.height },
        displaySize,
        zoom,
        pan,
      };

      // Convert image position to screen position using utility
      const screenPos = imageToCanvas({ x, y }, viewContext);

      const pixel = ctx.getImageData(screenPos.x, screenPos.y, 1, 1).data;
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
