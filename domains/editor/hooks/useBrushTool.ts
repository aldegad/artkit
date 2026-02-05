"use client";

import { useState, useCallback, useRef, RefObject } from "react";
import { Point } from "../types";
import { useEditorState, useEditorRefs } from "../contexts";

// ============================================
// Types
// ============================================

// No options needed - everything comes from context

interface UseBrushToolReturn {
  // State
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  brushColor: string;
  setBrushColor: React.Dispatch<React.SetStateAction<string>>;
  brushHardness: number;
  setBrushHardness: React.Dispatch<React.SetStateAction<number>>;
  stampSource: Point | null;
  setStampSource: React.Dispatch<React.SetStateAction<Point | null>>;

  // Actions
  drawOnEditCanvas: (x: number, y: number, isStart?: boolean) => void;
  pickColor: (x: number, y: number, canvasRef: RefObject<HTMLCanvasElement | null>, zoom: number, pan: Point) => void;
  resetLastDrawPoint: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useBrushTool(): UseBrushToolReturn {
  // Get state from EditorStateContext
  const {
    state: { canvasSize, rotation, toolMode },
  } = useEditorState();

  // Get refs from EditorRefsContext
  const { editCanvasRef, imageRef } = useEditorRefs();

  // Calculate display dimensions (rotated canvas size)
  const getDisplayDimensions = useCallback(() => {
    const width = rotation % 180 === 0 ? canvasSize.width : canvasSize.height;
    const height = rotation % 180 === 0 ? canvasSize.height : canvasSize.width;
    return { width, height };
  }, [rotation, canvasSize]);

  // State
  const [brushSize, setBrushSize] = useState(10);
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushHardness, setBrushHardness] = useState(100);
  const [stampSource, setStampSource] = useState<Point | null>(null);

  // Ref for tracking last draw point for smooth lines
  const lastDrawPoint = useRef<Point | null>(null);

  // Reset last draw point
  const resetLastDrawPoint = useCallback(() => {
    lastDrawPoint.current = null;
  }, []);

  // Draw on edit canvas
  const drawOnEditCanvas = useCallback(
    (x: number, y: number, isStart: boolean = false) => {
      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      if (!editCanvas || !ctx) return;

      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

      // Clamp to image bounds
      x = Math.max(0, Math.min(x, displayWidth));
      y = Math.max(0, Math.min(y, displayHeight));

      // Helper function to draw a soft brush dab
      const drawSoftDab = (cx: number, cy: number, isEraser: boolean = false) => {
        const radius = brushSize / 2;
        const hardnessRatio = brushHardness / 100;

        if (hardnessRatio >= 0.99) {
          // Hard brush - simple fill
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          if (isEraser) {
            ctx.fill();
          } else {
            ctx.fillStyle = brushColor;
            ctx.fill();
          }
        } else {
          // Soft brush - use radial gradient
          const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);

          // Parse brush color to RGB
          const hex = brushColor.replace("#", "");
          const r = parseInt(hex.substring(0, 2), 16);
          const g = parseInt(hex.substring(2, 4), 16);
          const b = parseInt(hex.substring(4, 6), 16);

          // Hardness determines where the falloff starts
          const innerStop = hardnessRatio * 0.9;

          if (isEraser) {
            gradient.addColorStop(0, "rgba(0,0,0,1)");
            gradient.addColorStop(Math.max(0.01, innerStop), "rgba(0,0,0,1)");
            gradient.addColorStop(1, "rgba(0,0,0,0)");
          } else {
            gradient.addColorStop(0, `rgba(${r},${g},${b},1)`);
            gradient.addColorStop(Math.max(0.01, innerStop), `rgba(${r},${g},${b},1)`);
            gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
          }

          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.fill();
        }
      };

      // Helper function to interpolate dabs along a line for smooth strokes
      const drawSoftLine = (
        x1: number,
        y1: number,
        x2: number,
        y2: number,
        isEraser: boolean = false,
      ) => {
        const dist = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
        const spacing = Math.max(1, brushSize * 0.15);
        const steps = Math.ceil(dist / spacing);

        for (let i = 0; i <= steps; i++) {
          const t = steps === 0 ? 0 : i / steps;
          const cx = x1 + (x2 - x1) * t;
          const cy = y1 + (y2 - y1) * t;
          drawSoftDab(cx, cy, isEraser);
        }
      };

      if (toolMode === "brush") {
        ctx.globalCompositeOperation = "source-over";

        if (isStart || !lastDrawPoint.current) {
          drawSoftDab(x, y, false);
        } else {
          drawSoftLine(lastDrawPoint.current.x, lastDrawPoint.current.y, x, y, false);
        }
      } else if (toolMode === "eraser") {
        ctx.globalCompositeOperation = "destination-out";

        if (isStart || !lastDrawPoint.current) {
          drawSoftDab(x, y, true);
        } else {
          drawSoftLine(lastDrawPoint.current.x, lastDrawPoint.current.y, x, y, true);
        }
        ctx.globalCompositeOperation = "source-over";
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
        const halfBrush = brushSize / 2;

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
          brushSize,
          brushSize,
          x - halfBrush,
          y - halfBrush,
          brushSize,
          brushSize,
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
      stampSource,
      rotation,
      canvasSize,
      getDisplayDimensions,
    ],
  );

  // Pick color from canvas
  const pickColor = useCallback(
    (x: number, y: number, canvasRef: RefObject<HTMLCanvasElement | null>, zoom: number, pan: Point) => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;

      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
      const scaledWidth = displayWidth * zoom;
      const scaledHeight = displayHeight * zoom;
      const offsetX = (canvas.width - scaledWidth) / 2 + pan.x;
      const offsetY = (canvas.height - scaledHeight) / 2 + pan.y;

      // Convert to screen position
      const screenX = offsetX + x * zoom;
      const screenY = offsetY + y * zoom;

      const pixel = ctx.getImageData(screenX, screenY, 1, 1).data;
      const hex =
        "#" + [pixel[0], pixel[1], pixel[2]].map((c) => c.toString(16).padStart(2, "0")).join("");
      setBrushColor(hex);
    },
    [getDisplayDimensions],
  );

  return {
    // State
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    brushHardness,
    setBrushHardness,
    stampSource,
    setStampSource,

    // Actions
    drawOnEditCanvas,
    pickColor,
    resetLastDrawPoint,
  };
}
