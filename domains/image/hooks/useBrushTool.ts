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
import { drawDab, drawLine, eraseDabLinear, eraseLineLinear } from "@/shared/utils/brushEngine";

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

  const { editCanvasRef, imageRef } = useEditorRefs();

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
  }, []);

  const drawOnEditCanvas = useCallback(
    (x: number, y: number, isStart: boolean = false, pressure: number = 1) => {
      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      if (!editCanvas || !ctx) return;

      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

      // Clamp to image bounds
      x = Math.max(0, Math.min(x, displayWidth));
      y = Math.max(0, Math.min(y, displayHeight));

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
        // Clone stamp - copy from source to destination
        const img = imageRef.current;
        if (!img) return;

        const offsetX = x - stampSource.x;
        const offsetY = y - stampSource.y;

        // Create a temporary canvas to get the original image data at source
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = displayWidth;
        tempCanvas.height = displayHeight;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;

        // Draw rotated original image
        tempCtx.translate(displayWidth / 2, displayHeight / 2);
        tempCtx.rotate((rotation * Math.PI) / 180);
        tempCtx.drawImage(img, -canvasSize.width / 2, -canvasSize.height / 2);

        // Get source pixel data
        const sourceX = x - offsetX;
        const sourceY = y - offsetY;
        const halfBrush = params.size / 2;

        // Draw circular stamp
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, halfBrush, 0, Math.PI * 2);
        ctx.clip();

        // Draw from temp canvas (original) to edit canvas
        ctx.drawImage(
          tempCanvas,
          sourceX - halfBrush,
          sourceY - halfBrush,
          params.size,
          params.size,
          x - halfBrush,
          y - halfBrush,
          params.size,
          params.size
        );
        ctx.restore();
      }

      lastDrawPoint.current = { x, y };
    },
    [
      editCanvasRef,
      imageRef,
      toolMode,
      brushSize,
      brushColor,
      brushHardness,
      brushOpacity,
      stampSource,
      rotation,
      canvasSize,
      getDisplayDimensions,
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
