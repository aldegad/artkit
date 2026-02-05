// ============================================
// Crop Handler
// ============================================

import { useCallback, useRef } from "react";
import { CropArea, Point } from "../../types";
import type { MouseEventContext, HandlerResult, CropHandlerOptions } from "./types";
import { isInHandle } from "./types";

export interface UseCropHandlerReturn {
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext, dragStart: Point, dragType: string, resizeHandle: string | null) => void;
  handleMouseUp: () => void;
}

export function useCropHandler(options: CropHandlerOptions): UseCropHandlerReturn {
  const { cropArea, setCropArea, aspectRatio, getAspectRatioValue, canvasExpandMode, updateCropExpand } = options;

  // Store original crop area at drag start for center-based resize
  const originalCropAreaRef = useRef<CropArea | null>(null);

  const handleMouseDown = useCallback(
    (ctx: MouseEventContext): HandlerResult => {
      const { imagePos, activeMode, inBounds } = ctx;

      if (activeMode !== "crop") return { handled: false };

      if (cropArea) {
        const handles = [
          { x: cropArea.x, y: cropArea.y, name: "nw" },
          { x: cropArea.x + cropArea.width / 2, y: cropArea.y, name: "n" },
          { x: cropArea.x + cropArea.width, y: cropArea.y, name: "ne" },
          { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height / 2, name: "e" },
          { x: cropArea.x + cropArea.width, y: cropArea.y + cropArea.height, name: "se" },
          { x: cropArea.x + cropArea.width / 2, y: cropArea.y + cropArea.height, name: "s" },
          { x: cropArea.x, y: cropArea.y + cropArea.height, name: "sw" },
          { x: cropArea.x, y: cropArea.y + cropArea.height / 2, name: "w" },
        ];

        for (const handle of handles) {
          if (isInHandle(imagePos, handle)) {
            originalCropAreaRef.current = { ...cropArea };
            return {
              handled: true,
              dragType: "resize",
              dragStart: imagePos,
            };
          }
        }

        if (
          imagePos.x >= cropArea.x &&
          imagePos.x <= cropArea.x + cropArea.width &&
          imagePos.y >= cropArea.y &&
          imagePos.y <= cropArea.y + cropArea.height
        ) {
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
          let width = Math.round(imagePos.x) - dragStart.x;
          let height = Math.round(imagePos.y) - dragStart.y;

          if (ratioValue) {
            height = Math.round(width / ratioValue);
          }

          const newX = width < 0 ? dragStart.x + width : dragStart.x;
          const newY = height < 0 ? dragStart.y + height : dragStart.y;

          setCropArea({
            x: Math.max(0, newX),
            y: Math.max(0, newY),
            width: Math.min(Math.abs(width), displayWidth - Math.max(0, newX)),
            height: Math.min(Math.abs(height), displayHeight - Math.max(0, newY)),
          });
        }
      } else if (dragType === "move") {
        // Crop move
        const dx = Math.round(imagePos.x) - dragStart.x;
        const dy = Math.round(imagePos.y) - dragStart.y;

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
        const newArea = { ...orig };
        const dx = Math.round(imagePos.x) - dragStart.x;
        const dy = Math.round(imagePos.y) - dragStart.y;
        const fromCenter = e.altKey || e.metaKey;
        const keepAspect = e.shiftKey;
        const originalAspect = orig.width / orig.height;

        // Apply resize based on handle
        if (resizeHandle.includes("e")) {
          newArea.width = Math.max(20, orig.width + dx);
          if (fromCenter) {
            newArea.x = orig.x - dx;
            newArea.width = Math.max(20, orig.width + dx * 2);
          }
        }
        if (resizeHandle.includes("w")) {
          newArea.x = orig.x + dx;
          newArea.width = Math.max(20, orig.width - dx);
          if (fromCenter) {
            newArea.x = orig.x + dx;
            newArea.width = Math.max(20, orig.width - dx * 2);
          }
        }
        if (resizeHandle.includes("s")) {
          newArea.height = Math.max(20, orig.height + dy);
          if (fromCenter) {
            newArea.y = orig.y - dy;
            newArea.height = Math.max(20, orig.height + dy * 2);
          }
        }
        if (resizeHandle.includes("n")) {
          newArea.y = orig.y + dy;
          newArea.height = Math.max(20, orig.height - dy);
          if (fromCenter) {
            newArea.y = orig.y + dy;
            newArea.height = Math.max(20, orig.height - dy * 2);
          }
        }

        // Apply aspect ratio constraint
        const effectiveRatio = ratioValue || (keepAspect ? originalAspect : null);
        if (effectiveRatio) {
          if (resizeHandle.includes("e") || resizeHandle.includes("w")) {
            const newHeight = newArea.width / effectiveRatio;
            if (fromCenter) {
              const heightChange = newHeight - orig.height;
              newArea.y = orig.y - heightChange / 2;
            }
            newArea.height = Math.round(newHeight);
          } else if (resizeHandle.includes("s") || resizeHandle.includes("n")) {
            const newWidth = newArea.height * effectiveRatio;
            if (fromCenter) {
              const widthChange = newWidth - orig.width;
              newArea.x = orig.x - widthChange / 2;
            }
            newArea.width = Math.round(newWidth);
          }
        }

        // Only clamp to bounds if not in canvas expand mode
        if (!canvasExpandMode) {
          newArea.x = Math.max(0, newArea.x);
          newArea.y = Math.max(0, newArea.y);
          newArea.width = Math.min(newArea.width, displayWidth - newArea.x);
          newArea.height = Math.min(newArea.height, displayHeight - newArea.y);
        }

        setCropArea(newArea);
      }
    },
    [cropArea, setCropArea, aspectRatio, getAspectRatioValue, canvasExpandMode, updateCropExpand]
  );

  const handleMouseUp = useCallback(() => {
    originalCropAreaRef.current = null;

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
