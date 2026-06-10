// ============================================
// Selection (Marquee) Handler
// ============================================

import { useCallback } from "react";
import { CropArea, Point, MarqueeSubTool, SelectionMask } from "../../types";
import type { MouseEventContext, HandlerResult, SelectionHandlerOptions, FloatingLayer } from "./types";
import { createRectFromDrag } from "@/shared/utils/rectTransform";
import { applyFeatherToImageData } from "../../utils/selectionFeather";
import { drawLayerWithOptionalAlphaMask } from "@/shared/utils/layerAlphaMask";
import {
  computeMagicWandSelectionFromAlphaMask,
  toMagicWandBoundsMask,
} from "@/shared/utils/magicWand";
import {
  applySelectionMaskToImageData,
  createSelectionMaskFromRect,
  createSelectionMaskFromPath,
  isPointInsideSelection,
  offsetSelectionMask,
  combineSelectionMasks,
} from "../../utils/selectionRegion";

export interface UseSelectionHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext, dragStart: Point) => void;
  handleMouseUp: () => void;
}

const MARQUEE_ASPECT_RATIO: Record<MarqueeSubTool, number | null> = {
  lasso: null,
  object: null,
  freeRect: null,
  ratio1x1: 1,
  ratio4x3: 4 / 3,
  ratio16x9: 16 / 9,
};
const OBJECT_SELECTION_ALPHA_THRESHOLD = 16;

function clampPointToDisplay(point: Point, width: number, height: number): Point {
  return {
    x: Math.max(0, Math.min(Math.round(point.x), width)),
    y: Math.max(0, Math.min(Math.round(point.y), height)),
  };
}

export function useSelectionHandler(options: SelectionHandlerOptions): UseSelectionHandlerReturn {
  const {
    editCanvasRef,
    activeLayerPosition,
    marqueeSubTool,
    selectionCombineMode,
    previousCombineRef,
    lassoPath,
    setLassoPath,
    selectionMask,
    setSelectionMask,
    selection,
    selectionFeather,
    selectionOffset,
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
      if (marqueeSubTool === "object") {
        const editCanvas = editCanvasRef.current;
        const layerPosX = activeLayerPosition?.x || 0;
        const layerPosY = activeLayerPosition?.y || 0;
        const localX = Math.floor(imagePos.x - layerPosX);
        const localY = Math.floor(imagePos.y - layerPosY);

        setLassoPath(null);
        (floatingLayerRef as { current: FloatingLayer | null }).current = null;
        setIsMovingSelection(false);
        setIsDuplicating(false);
        if (selectionCombineMode !== "new" && selection) {
          (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = {
            selection,
            mask: selectionMask,
          };
        } else {
          (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = null;
        }

        if (
          !editCanvas
          || localX < 0
          || localY < 0
          || localX >= editCanvas.width
          || localY >= editCanvas.height
        ) {
          setSelectionMask(null);
          setSelection(null);
          return { handled: true };
        }

        const sampleCanvas = document.createElement("canvas");
        sampleCanvas.width = editCanvas.width;
        sampleCanvas.height = editCanvas.height;
        const sampleCtx = sampleCanvas.getContext("2d");
        if (!sampleCtx) {
          setSelectionMask(null);
          setSelection(null);
          return { handled: true };
        }

        drawLayerWithOptionalAlphaMask(sampleCtx, editCanvas, 0, 0);
        const imageData = sampleCtx.getImageData(0, 0, editCanvas.width, editCanvas.height);
        const seedAlpha = imageData.data[(localY * editCanvas.width + localX) * 4 + 3];
        if (seedAlpha <= OBJECT_SELECTION_ALPHA_THRESHOLD) {
          setSelectionMask(null);
          setSelection(null);
          return { handled: true };
        }

        const objectSelection = computeMagicWandSelectionFromAlphaMask(imageData, localX, localY, {
          alphaThreshold: OBJECT_SELECTION_ALPHA_THRESHOLD,
          connectedOnly: true,
        });
        if (!objectSelection) {
          setSelectionMask(null);
          setSelection(null);
          return { handled: true };
        }

        const objectMask = toMagicWandBoundsMask(objectSelection);
        const baseSelectionMask = {
          x: objectMask.x + layerPosX,
          y: objectMask.y + layerPosY,
          width: objectMask.width,
          height: objectMask.height,
          mask: objectMask.mask,
        };
        const nextSelectionMask = selectionOffset !== 0
          ? offsetSelectionMask(baseSelectionMask, selectionOffset)
          : baseSelectionMask;
        if (!nextSelectionMask) {
          setSelectionMask(null);
          setSelection(null);
          (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = null;
          return { handled: true };
        }
        const nextBounds = {
          x: nextSelectionMask.x,
          y: nextSelectionMask.y,
          width: nextSelectionMask.width,
          height: nextSelectionMask.height,
        };
        const prev = (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current;
        const combined = combineSelectionMasks(
          selectionCombineMode,
          prev ? { selection: prev.selection, mask: prev.mask } : null,
          nextBounds,
          nextSelectionMask
        );
        (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = null;
        setSelection(combined.selection);
        setSelectionMask(combined.selectionMask);
        return { handled: true };
      }

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
      // Lasso keeps the current selection visible while tracing, then commits on mouse up.
      // For add/subtract/intersect, keep current selection in ref and do not clear (combine on mouse up).
      if (selectionCombineMode !== "new" && selection) {
        (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = {
          selection,
          mask: selectionMask,
        };
      } else {
        (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = null;
      }

      if (marqueeSubTool !== "lasso" && (selectionCombineMode === "new" || !selection)) {
        setSelection(null);
        setSelectionMask(null);
      }
      (floatingLayerRef as { current: FloatingLayer | null }).current = null;
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
      selectionOffset,
      selectionCombineMode,
      previousCombineRef,
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
      if (marqueeSubTool === "object") return;

      if (marqueeSubTool === "lasso") {
        const basePath = lassoPath && lassoPath.length > 0
          ? lassoPath
          : [clampPointToDisplay(dragStart, displayWidth, displayHeight)];
        const lastPoint = basePath[basePath.length - 1];
        const hasMoved = !lastPoint || lastPoint.x !== clampedPos.x || lastPoint.y !== clampedPos.y;

        if (!hasMoved) return;

        const nextPath = [...basePath, clampedPos];
        setLassoPath(nextPath);
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
    const prev = (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current;

    if (marqueeSubTool === "lasso" && lassoPath) {
      const rawLassoMask = createSelectionMaskFromPath(lassoPath);
      const lassoMask = rawLassoMask && selectionOffset !== 0
        ? offsetSelectionMask(rawLassoMask, selectionOffset)
        : rawLassoMask;
      const nextBounds = lassoMask
        ? {
            x: lassoMask.x,
            y: lassoMask.y,
            width: lassoMask.width,
            height: lassoMask.height,
          }
        : null;
      setLassoPath(null);
      (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = null;
      if (!nextBounds || nextBounds.width < 5 || nextBounds.height < 5) {
        if (selectionCombineMode === "new") {
          setSelectionMask(null);
          setSelection(null);
        }
        return;
      }
      const combined = combineSelectionMasks(
        selectionCombineMode,
        prev ? { selection: prev.selection, mask: prev.mask } : null,
        nextBounds,
        lassoMask
      );
      setSelectionMask(combined.selectionMask);
      setSelection(combined.selection);
      return;
    }

    if (selection && marqueeSubTool !== "object" && selectionOffset !== 0) {
      const baseMask = createSelectionMaskFromRect(selection);
      const shiftedMask = baseMask
        ? offsetSelectionMask(baseMask, selectionOffset)
        : null;
      (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = null;
      if (!shiftedMask) {
        if (selectionCombineMode === "new") {
          setSelectionMask(null);
          setSelection(null);
        }
        return;
      }
      const nextBounds = {
        x: shiftedMask.x,
        y: shiftedMask.y,
        width: shiftedMask.width,
        height: shiftedMask.height,
      };
      const combined = combineSelectionMasks(
        selectionCombineMode,
        prev ? { selection: prev.selection, mask: prev.mask } : null,
        nextBounds,
        shiftedMask
      );
      setSelectionMask(combined.selectionMask);
      setSelection(combined.selection);
      return;
    }

    if (selection && marqueeSubTool !== "object" && marqueeSubTool !== "lasso" && selectionOffset === 0 && (selection.width >= 5 && selection.height >= 5)) {
      const rectMask = createSelectionMaskFromRect(selection);
      const combined = combineSelectionMasks(
        selectionCombineMode,
        prev ? { selection: prev.selection, mask: prev.mask } : null,
        selection,
        rectMask
      );
      setSelectionMask(combined.selectionMask);
      setSelection(combined.selection);
    }

    (previousCombineRef as { current: { selection: CropArea; mask: SelectionMask | null } | null }).current = null;

    if (marqueeSubTool !== "object" && selection && (selection.width < 5 || selection.height < 5)) {
      if (selectionCombineMode === "new") {
        setSelectionMask(null);
        setSelection(null);
      }
    }
  }, [marqueeSubTool, lassoPath, selection, selectionOffset, selectionCombineMode, previousCombineRef, setLassoPath, setSelection, setSelectionMask]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
