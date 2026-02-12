// ============================================
// Selection (Marquee) Handler
// ============================================

import { useCallback } from "react";
import { Point } from "../../types";
import type { MouseEventContext, HandlerResult, SelectionHandlerOptions, FloatingLayer } from "./types";
import { createRectFromDrag } from "@/shared/utils/rectTransform";
import { applyFeatherToImageData } from "../../utils/selectionFeather";

export interface UseSelectionHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext, dragStart: Point) => void;
  handleMouseUp: () => void;
}

export function useSelectionHandler(options: SelectionHandlerOptions): UseSelectionHandlerReturn {
  const {
    editCanvasRef,
    activeLayerPosition,
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
      const { imagePos, activeMode, inBounds, e, displayDimensions } = ctx;
      const { width: displayWidth, height: displayHeight } = displayDimensions;

      if (activeMode !== "marquee") return { handled: false };

      if (selection) {
        // Check if clicking inside selection
        if (
          imagePos.x >= selection.x &&
          imagePos.x <= selection.x + selection.width &&
          imagePos.y >= selection.y &&
          imagePos.y <= selection.y + selection.height
        ) {
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
            compositeCtx.drawImage(editCanvas, layerPosX, layerPosY);

            // Copy selection to floating layer
            let imageData = compositeCtx.getImageData(
              Math.round(selection.x),
              Math.round(selection.y),
              Math.round(selection.width),
              Math.round(selection.height)
            );
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

      // Click outside selection or no selection - create new selection
      if (inBounds) {
        setSelection(null);
        (floatingLayerRef as { current: FloatingLayer | null }).current = null;
        setIsDuplicating(false);
        const roundedPos = { x: Math.round(imagePos.x), y: Math.round(imagePos.y) };
        setSelection({ x: roundedPos.x, y: roundedPos.y, width: 0, height: 0 });

        return {
          handled: true,
          dragType: "create",
          dragStart: roundedPos,
        };
      }

      return { handled: false };
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
    ]
  );

  const handleMouseMove = useCallback(
    (ctx: MouseEventContext, dragStart: Point) => {
      const { imagePos, displayDimensions, e } = ctx;
      const { width: displayWidth, height: displayHeight } = displayDimensions;

      if (!selection) return;

      const clampedPos = {
        x: Math.max(0, Math.min(Math.round(imagePos.x), displayWidth)),
        y: Math.max(0, Math.min(Math.round(imagePos.y), displayHeight)),
      };

      const nextSelection = createRectFromDrag(dragStart, clampedPos, {
        keepAspect: e.shiftKey,
        targetAspect: 1,
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
    [selection, setSelection]
  );

  const handleMouseUp = useCallback(() => {
    if (selection && (selection.width < 5 || selection.height < 5)) {
      setSelection(null);
    }
  }, [selection, setSelection]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
