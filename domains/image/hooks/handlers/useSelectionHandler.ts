// ============================================
// Selection (Marquee) Handler
// ============================================

import { useCallback } from "react";
import { CropArea, Point, MarqueeSubTool } from "../../types";
import type { MouseEventContext, HandlerResult, SelectionHandlerOptions, FloatingLayer } from "./types";
import { createRectFromDrag } from "@/shared/utils/rectTransform";
import { applyFeatherToImageData } from "../../utils/selectionFeather";
import { drawLayerWithOptionalAlphaMask } from "@/shared/utils/layerAlphaMask";
import {
  applySelectionMaskToImageData,
  createSelectionMaskFromPath,
  isPointInsideSelection,
} from "../../utils/selectionRegion";

export interface UseSelectionHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext, dragStart: Point) => void;
  handleMouseUp: () => void;
}

const MARQUEE_ASPECT_RATIO: Record<MarqueeSubTool, number | null> = {
  lasso: null,
  freeRect: null,
  ratio1x1: 1,
  ratio4x3: 4 / 3,
  ratio16x9: 16 / 9,
};

function clampPointToDisplay(point: Point, width: number, height: number): Point {
  return {
    x: Math.max(0, Math.min(Math.round(point.x), width)),
    y: Math.max(0, Math.min(Math.round(point.y), height)),
  };
}

function getLassoBounds(path: Point[]): CropArea | null {
  if (path.length < 2) return null;

  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const point of path) {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }

  return {
    x: Math.round(minX),
    y: Math.round(minY),
    width: Math.max(0, Math.round(maxX - minX)),
    height: Math.max(0, Math.round(maxY - minY)),
  };
}

export function useSelectionHandler(options: SelectionHandlerOptions): UseSelectionHandlerReturn {
  const {
    editCanvasRef,
    activeLayerPosition,
    marqueeSubTool,
    lassoPath,
    setLassoPath,
    selectionMask,
    setSelectionMask,
    selection,
    selectionFeather,
    setSelection,
    setIsMovingSelection,
    setIsDuplicating,
    floatingLayerRef,
    dragStartOriginRef,
    saveToHistory,
  } = options;

  const handleMouseDown = useCallback(
    (ctx: MouseEventContext): HandlerResult => {
      const { imagePos, activeMode, e, displayDimensions } = ctx;
      const { width: displayWidth, height: displayHeight } = displayDimensions;

      if (activeMode !== "marquee") return { handled: false };

      if (selection) {
        // Check if clicking inside selection
        if (isPointInsideSelection(imagePos, selection, selectionMask)) {
          // Alt+click to duplicate and move
          if (e.altKey) {
            const editCanvas = editCanvasRef.current;
            const ctx2d = editCanvas?.getContext("2d");
            if (!editCanvas || !ctx2d) return { handled: false };

            // Create composite canvas to get the selected area
            const compositeCanvas = document.createElement("canvas");
            compositeCanvas.width = displayWidth;
            compositeCanvas.height = displayHeight;
            const compositeCtx = compositeCanvas.getContext("2d");
            if (!compositeCtx) return { handled: false };

            const layerPosX = activeLayerPosition?.x || 0;
            const layerPosY = activeLayerPosition?.y || 0;
            drawLayerWithOptionalAlphaMask(compositeCtx, editCanvas, layerPosX, layerPosY);

            // Copy selection to floating layer
            let imageData = compositeCtx.getImageData(
              Math.round(selection.x),
              Math.round(selection.y),
              Math.round(selection.width),
              Math.round(selection.height)
            );
            imageData = applySelectionMaskToImageData(imageData, selection, selectionMask);
            imageData = applyFeatherToImageData(imageData, selectionFeather);
            (floatingLayerRef as { current: FloatingLayer | null }).current = {
              imageData,
              x: selection.x,
              y: selection.y,
              originX: selection.x,
              originY: selection.y,
            };

            saveToHistory();
            setIsMovingSelection(true);
            setIsDuplicating(true);
            (dragStartOriginRef as { current: Point | null }).current = { x: imagePos.x, y: imagePos.y };

            return {
              handled: true,
              dragType: "move",
              dragStart: imagePos,
            };
          }

          // Regular click inside selection - move existing floating layer
          if (floatingLayerRef.current) {
            setIsMovingSelection(true);
            setIsDuplicating(false);
            (dragStartOriginRef as { current: Point | null }).current = { x: imagePos.x, y: imagePos.y };

            return {
              handled: true,
              dragType: "move",
              dragStart: imagePos,
            };
          }
        }
      }

      // Click outside selection (or outside image bounds) starts a new selection.
      // Start point is clamped so dragging from canvas-outside to inside can select edge-to-edge.
      setSelection(null);
      (floatingLayerRef as { current: FloatingLayer | null }).current = null;
      setSelectionMask(null);
      setIsMovingSelection(false);
      setIsDuplicating(false);
      const clampedStart = clampPointToDisplay(imagePos, displayWidth, displayHeight);
      if (marqueeSubTool === "lasso") {
        setLassoPath([clampedStart]);
      } else {
        setLassoPath(null);
        setSelection({ x: clampedStart.x, y: clampedStart.y, width: 0, height: 0 });
      }

      return {
        handled: true,
        dragType: "create",
        dragStart: clampedStart,
      };
    },
    [
      selection,
      selectionFeather,
      setSelection,
      editCanvasRef,
      activeLayerPosition,
      floatingLayerRef,
      dragStartOriginRef,
      saveToHistory,
      setIsMovingSelection,
      setIsDuplicating,
      marqueeSubTool,
      setLassoPath,
      selectionMask,
      setSelectionMask,
    ]
  );

  const handleMouseMove = useCallback(
    (ctx: MouseEventContext, dragStart: Point) => {
      const { imagePos, displayDimensions, e } = ctx;
      const { width: displayWidth, height: displayHeight } = displayDimensions;
      const clampedPos = clampPointToDisplay(imagePos, displayWidth, displayHeight);

      if (marqueeSubTool === "lasso") {
        const basePath = lassoPath && lassoPath.length > 0
          ? lassoPath
          : [clampPointToDisplay(dragStart, displayWidth, displayHeight)];
        const lastPoint = basePath[basePath.length - 1];
        const hasMoved = !lastPoint || lastPoint.x !== clampedPos.x || lastPoint.y !== clampedPos.y;

        if (!hasMoved) return;

        const nextPath = [...basePath, clampedPos];
        setLassoPath(nextPath);

        const nextBounds = getLassoBounds(nextPath);
        if (nextBounds) {
          setSelection(nextBounds);
        }
        return;
      }

      if (!selection) return;
      const fixedAspect = MARQUEE_ASPECT_RATIO[marqueeSubTool];
      const keepAspect = fixedAspect !== null || e.shiftKey;
      const targetAspect = fixedAspect ?? 1;

      const nextSelection = createRectFromDrag(dragStart, clampedPos, {
        keepAspect,
        targetAspect,
        round: true,
        fromCenter: e.altKey || e.metaKey,
        bounds: {
          minX: 0,
          minY: 0,
          maxX: displayWidth,
          maxY: displayHeight,
        },
      });
      setSelection(nextSelection);
    },
    [marqueeSubTool, lassoPath, selection, setLassoPath, setSelection]
  );

  const handleMouseUp = useCallback(() => {
    if (marqueeSubTool === "lasso" && lassoPath) {
      const lassoMask = createSelectionMaskFromPath(lassoPath);
      const nextBounds = lassoMask
        ? {
            x: lassoMask.x,
            y: lassoMask.y,
            width: lassoMask.width,
            height: lassoMask.height,
          }
        : null;
      setLassoPath(null);
      if (!nextBounds || nextBounds.width < 5 || nextBounds.height < 5) {
        setSelectionMask(null);
        setSelection(null);
        return;
      }
      setSelectionMask(lassoMask);
      setSelection(nextBounds);
      return;
    }

    if (selection && (selection.width < 5 || selection.height < 5)) {
      setSelectionMask(null);
      setSelection(null);
    }
  }, [marqueeSubTool, lassoPath, selection, setLassoPath, setSelection, setSelectionMask]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
