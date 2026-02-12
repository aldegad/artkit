// ============================================
// Crop Handler
// ============================================

import { useCallback, useRef } from "react";
import { CropArea, Point } from "../../types";
import type { MouseEventContext, HandlerResult, CropHandlerOptions } from "./types";
import { HANDLE_SIZE, INTERACTION } from "../../constants";
import {
  clampRectToBounds,
  createRectFromDrag,
  getRectHandleAtPosition,
  resizeRectByHandle,
  type RectHandle,
} from "@/shared/utils/rectTransform";

export interface UseCropHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext, dragStart: Point, dragType: string, resizeHandle: string | null) => void;
  handleMouseUp: () => void;
}

export function useCropHandler(options: CropHandlerOptions): UseCropHandlerReturn {
  const { cropArea, setCropArea, aspectRatio, getAspectRatioValue, canvasExpandMode, updateCropExpand } = options;

  // Store original crop area at drag start for center-based resize
  const originalCropAreaRef = useRef<CropArea | null>(null);
  const cropMoveAxisLockRef = useRef<"x" | "y" | null>(null);

  const handleMouseDown = useCallback(
    (ctx: MouseEventContext): HandlerResult => {
      const { imagePos, activeMode, inBounds } = ctx;

      if (activeMode !== "crop") return { handled: false };

      if (cropArea) {
        const hit = getRectHandleAtPosition(imagePos, cropArea, {
          handleSize: HANDLE_SIZE.HIT_AREA,
          includeMove: true,
        });

        if (hit && hit !== "move") {
          originalCropAreaRef.current = { ...cropArea };
          return {
            handled: true,
            dragType: "resize",
            dragStart: imagePos,
          };
        }

        if (hit === "move") {
          cropMoveAxisLockRef.current = null;
          return {
            handled: true,
            dragType: "move",
            dragStart: imagePos,
          };
        }
      }

      // In canvas expand mode, allow creating crop outside bounds
      if (inBounds || canvasExpandMode) {
        const roundedPos = { x: Math.round(imagePos.x), y: Math.round(imagePos.y) };
        setCropArea({ x: roundedPos.x, y: roundedPos.y, width: 0, height: 0 });
        return {
          handled: true,
          dragType: "create",
          dragStart: roundedPos,
        };
      }

      return { handled: false };
    },
    [cropArea, setCropArea, canvasExpandMode]
  );

  const handleMouseMove = useCallback(
    (ctx: MouseEventContext, dragStart: Point, dragType: string, resizeHandle: string | null) => {
      const { imagePos, e, displayDimensions } = ctx;
      const { width: displayWidth, height: displayHeight } = displayDimensions;

      if (!cropArea) return;

      const ratioValue = getAspectRatioValue(aspectRatio);

      // Crop create
      if (dragType === "create") {
        if (canvasExpandMode) {
          updateCropExpand(Math.round(imagePos.x), Math.round(imagePos.y), dragStart.x, dragStart.y);
        } else {
          const clampedPos = {
            x: Math.max(0, Math.min(Math.round(imagePos.x), displayWidth)),
            y: Math.max(0, Math.min(Math.round(imagePos.y), displayHeight)),
          };
          const nextCrop = createRectFromDrag(dragStart, clampedPos, {
            keepAspect: Boolean(ratioValue) || e.shiftKey,
            targetAspect: ratioValue ?? (e.shiftKey ? 1 : undefined),
            round: true,
            bounds: {
              minX: 0,
              minY: 0,
              maxX: displayWidth,
              maxY: displayHeight,
            },
          });
          setCropArea(nextCrop);
        }
      } else if (dragType === "move") {
        // Crop move
        let dx = Math.round(imagePos.x) - dragStart.x;
        let dy = Math.round(imagePos.y) - dragStart.y;

        // Shift key constrains movement to horizontal or vertical axis.
        if (e.shiftKey) {
          if (!cropMoveAxisLockRef.current) {
            cropMoveAxisLockRef.current = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
          }
          if (cropMoveAxisLockRef.current === "x") {
            dy = 0;
          } else {
            dx = 0;
          }
        } else {
          cropMoveAxisLockRef.current = null;
        }

        let newX, newY;
        if (canvasExpandMode) {
          newX = cropArea.x + dx;
          newY = cropArea.y + dy;
        } else {
          newX = Math.max(0, Math.min(cropArea.x + dx, displayWidth - cropArea.width));
          newY = Math.max(0, Math.min(cropArea.y + dy, displayHeight - cropArea.height));
        }
        setCropArea({ ...cropArea, x: newX, y: newY });
      } else if (dragType === "resize" && resizeHandle && originalCropAreaRef.current) {
        // Crop resize with modifier keys support
        const orig = originalCropAreaRef.current;
        const dx = Math.round(imagePos.x) - dragStart.x;
        const dy = Math.round(imagePos.y) - dragStart.y;
        const fromCenter = e.altKey || e.metaKey;
        const keepAspect = e.shiftKey;
        const originalAspect = orig.width / orig.height;

        const effectiveRatio = ratioValue || (keepAspect ? originalAspect : null);
        let newArea = resizeRectByHandle(
          orig,
          resizeHandle as RectHandle,
          { dx, dy },
          {
            minWidth: INTERACTION.MIN_RESIZE_SIZE,
            minHeight: INTERACTION.MIN_RESIZE_SIZE,
            keepAspect: Boolean(effectiveRatio),
            targetAspect: effectiveRatio ?? undefined,
            fromCenter,
          }
        );

        // Only clamp to bounds if not in canvas expand mode
        if (!canvasExpandMode) {
          newArea = clampRectToBounds(newArea, {
            minX: 0,
            minY: 0,
            maxX: displayWidth,
            maxY: displayHeight,
          });
        }

        setCropArea({
          x: Math.round(newArea.x),
          y: Math.round(newArea.y),
          width: Math.round(newArea.width),
          height: Math.round(newArea.height),
        });
      }
    },
    [cropArea, setCropArea, aspectRatio, getAspectRatioValue, canvasExpandMode, updateCropExpand]
  );

  const handleMouseUp = useCallback(() => {
    originalCropAreaRef.current = null;
    cropMoveAxisLockRef.current = null;

    if (cropArea && (cropArea.width < 10 || cropArea.height < 10)) {
      setCropArea(null);
    }
  }, [cropArea, setCropArea]);

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
