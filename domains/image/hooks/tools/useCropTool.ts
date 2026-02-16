"use client";

import { useState, useCallback, useEffect } from "react";
import { CropArea, AspectRatio, ASPECT_RATIO_VALUES } from "../../types";
import { HANDLE_SIZE, INTERACTION } from "../../constants";
import { useEditorState } from "../../contexts";
import {
  createRectFromDrag,
  getRectHandleAtPosition,
  resizeRectByHandle,
  type RectHandle,
} from "@/shared/utils/rectTransform";
import { getDisplayDimensions as getRotatedDisplayDimensions } from "../../utils/coordinateSystem";

// ============================================
// Types
// ============================================

// No options needed - everything comes from context

interface UseCropToolReturn {
  // State
  cropArea: CropArea | null;
  setCropArea: React.Dispatch<React.SetStateAction<CropArea | null>>;
  aspectRatio: AspectRatio;
  setAspectRatio: React.Dispatch<React.SetStateAction<AspectRatio>>;
  canvasExpandMode: boolean;
  setCanvasExpandMode: React.Dispatch<React.SetStateAction<boolean>>;
  lockAspect: boolean;
  setLockAspect: React.Dispatch<React.SetStateAction<boolean>>;

  // Operations
  selectAllCrop: () => void;
  clearCrop: () => void;
  getAspectRatioValue: (ratio: AspectRatio) => number | null;
  setCropSize: (width: number, height: number) => void;
  expandToSquare: () => void;
  fitToSquare: () => void;

  // Crop handle detection
  getCropHandleAtPosition: (
    imagePos: { x: number; y: number },
    handleSize?: number
  ) => { type: "handle" | "inside" | null; handle?: string };

  // Crop area manipulation
  moveCrop: (dx: number, dy: number) => void;
  resizeCrop: (handle: string, dx: number, dy: number) => void;
  startCrop: (x: number, y: number) => void;
  updateCrop: (x: number, y: number, startX: number, startY: number) => void;
  updateCropExpand: (x: number, y: number, startX: number, startY: number) => void;
  validateCrop: () => boolean;
}

// ============================================
// Hook Implementation
// ============================================

export function useCropTool(): UseCropToolReturn {
  // Get state from EditorStateContext
  const {
    state: { rotation, canvasSize },
  } = useEditorState();

  // Calculate display dimensions (rotated canvas size)
  const getDisplayDimensions = useCallback(() => {
    return getRotatedDisplayDimensions(canvasSize, rotation);
  }, [rotation, canvasSize]);

  // State
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [canvasExpandMode, setCanvasExpandMode] = useState<boolean>(false);
  const [lockAspect, setLockAspect] = useState<boolean>(false);

  // Get aspect ratio numeric value
  const getAspectRatioValue = useCallback((ratio: AspectRatio): number | null => {
    return ASPECT_RATIO_VALUES[ratio];
  }, []);

  // Select all (entire canvas) with aspect ratio consideration
  const selectAllCrop = useCallback(() => {
    const { width, height } = getDisplayDimensions();
    const ratioValue = getAspectRatioValue(aspectRatio);

    if (ratioValue) {
      let newWidth = width;
      let newHeight = width / ratioValue;

      if (newHeight > height) {
        newHeight = height;
        newWidth = height * ratioValue;
      }

      const x = Math.round((width - newWidth) / 2);
      const y = Math.round((height - newHeight) / 2);

      setCropArea({ x, y, width: Math.round(newWidth), height: Math.round(newHeight) });
    } else {
      setCropArea({ x: 0, y: 0, width, height });
    }
  }, [getDisplayDimensions, aspectRatio, getAspectRatioValue]);

  // Clear crop selection
  const clearCrop = useCallback(() => {
    setCropArea(null);
  }, []);

  // Set crop size directly (for W/H input fields)
  const setCropSize = useCallback(
    (width: number, height: number) => {
      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

      if (!cropArea) {
        // Create new crop area centered on canvas
        const x = canvasExpandMode ? (displayWidth - width) / 2 : Math.max(0, (displayWidth - width) / 2);
        const y = canvasExpandMode ? (displayHeight - height) / 2 : Math.max(0, (displayHeight - height) / 2);
        setCropArea({
          x: Math.round(x),
          y: Math.round(y),
          width: Math.round(width),
          height: Math.round(height),
        });
      } else {
        // Update existing crop area, keep center position
        const centerX = cropArea.x + cropArea.width / 2;
        const centerY = cropArea.y + cropArea.height / 2;
        let newX = centerX - width / 2;
        let newY = centerY - height / 2;

        // Only clamp if not in expand mode
        if (!canvasExpandMode) {
          newX = Math.max(0, Math.min(newX, displayWidth - width));
          newY = Math.max(0, Math.min(newY, displayHeight - height));
        }

        setCropArea({
          x: Math.round(newX),
          y: Math.round(newY),
          width: Math.round(width),
          height: Math.round(height),
        });
      }
    },
    [cropArea, getDisplayDimensions, canvasExpandMode]
  );

  // Expand to square (based on longer side)
  const expandToSquare = useCallback(() => {
    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
    const maxSide = Math.max(displayWidth, displayHeight);

    // Center the square crop area (may extend beyond canvas)
    const x = (displayWidth - maxSide) / 2;
    const y = (displayHeight - maxSide) / 2;

    setCropArea({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(maxSide),
      height: Math.round(maxSide),
    });

    // Enable expand mode if square extends beyond canvas
    if (x < 0 || y < 0) {
      setCanvasExpandMode(true);
    }
  }, [getDisplayDimensions]);

  // Fit to square (based on shorter side - crop mode)
  const fitToSquare = useCallback(() => {
    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
    const minSide = Math.min(displayWidth, displayHeight);

    // Center the square crop area within canvas
    const x = (displayWidth - minSide) / 2;
    const y = (displayHeight - minSide) / 2;

    setCropArea({
      x: Math.round(x),
      y: Math.round(y),
      width: Math.round(minSide),
      height: Math.round(minSide),
    });
  }, [getDisplayDimensions]);

  // Get crop handle at position
  const getCropHandleAtPosition = useCallback(
    (
      imagePos: { x: number; y: number },
      handleSize: number = HANDLE_SIZE.HIT_AREA
    ): { type: "handle" | "inside" | null; handle?: string } => {
      if (!cropArea) return { type: null };
      const hit = getRectHandleAtPosition(imagePos, cropArea, {
        handleSize,
        includeMove: true,
      });
      if (!hit) return { type: null };
      if (hit === "move") {
        return { type: "inside" };
      }
      return { type: "handle", handle: hit };
    },
    [cropArea]
  );

  // Move crop area
  const moveCrop = useCallback(
    (dx: number, dy: number) => {
      if (!cropArea) return;
      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

      const newX = Math.max(0, Math.min(cropArea.x + dx, displayWidth - cropArea.width));
      const newY = Math.max(0, Math.min(cropArea.y + dy, displayHeight - cropArea.height));
      setCropArea({ ...cropArea, x: newX, y: newY });
    },
    [cropArea, getDisplayDimensions]
  );

  // Resize crop area by handle
  const resizeCrop = useCallback(
    (handle: string, dx: number, dy: number) => {
      if (!cropArea) return;
      const ratioValue = getAspectRatioValue(aspectRatio);
      const newArea = resizeRectByHandle(
        cropArea,
        handle as RectHandle,
        { dx, dy },
        {
          minWidth: INTERACTION.MIN_RESIZE_SIZE,
          minHeight: INTERACTION.MIN_RESIZE_SIZE,
          keepAspect: Boolean(ratioValue),
          targetAspect: ratioValue ?? undefined,
          fromCenter: false,
        }
      );
      setCropArea(newArea);
    },
    [cropArea, aspectRatio, getAspectRatioValue]
  );

  // Start new crop
  const startCrop = useCallback((x: number, y: number) => {
    setCropArea({ x: Math.round(x), y: Math.round(y), width: 0, height: 0 });
  }, []);

  // Update crop during drag
  const updateCrop = useCallback(
    (x: number, y: number, startX: number, startY: number) => {
      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
      const ratioValue = getAspectRatioValue(aspectRatio);

      const clampedPos = {
        x: Math.max(0, Math.min(x, displayWidth)),
        y: Math.max(0, Math.min(y, displayHeight)),
      };

      const newCrop = createRectFromDrag(
        { x: startX, y: startY },
        clampedPos,
        {
          keepAspect: Boolean(ratioValue),
          targetAspect: ratioValue ?? undefined,
          round: false,
          bounds: {
            minX: 0,
            minY: 0,
            maxX: displayWidth,
            maxY: displayHeight,
          },
        }
      );
      setCropArea(newCrop);
    },
    [getDisplayDimensions, aspectRatio, getAspectRatioValue]
  );

  // Update crop during drag (expand mode - no bounds clamping)
  const updateCropExpand = useCallback(
    (x: number, y: number, startX: number, startY: number) => {
      const ratioValue = getAspectRatioValue(aspectRatio);

      const newCrop = createRectFromDrag(
        { x: startX, y: startY },
        { x, y },
        {
          keepAspect: Boolean(ratioValue),
          targetAspect: ratioValue ?? undefined,
          round: false,
        }
      );
      setCropArea(newCrop);
    },
    [aspectRatio, getAspectRatioValue]
  );

  // Validate crop area (returns false if too small)
  const validateCrop = useCallback((): boolean => {
    if (cropArea && (cropArea.width < 10 || cropArea.height < 10)) {
      setCropArea(null);
      return false;
    }
    return true;
  }, [cropArea]);

  // Effect to adjust crop area when aspect ratio changes
  useEffect(() => {
    if (!cropArea) return;
    const ratioValue = getAspectRatioValue(aspectRatio);
    if (!ratioValue) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Keep the center, adjust dimensions to match ratio
    const centerX = cropArea.x + cropArea.width / 2;
    const centerY = cropArea.y + cropArea.height / 2;

    let newWidth = cropArea.width;
    let newHeight = cropArea.width / ratioValue;

    if (newHeight > displayHeight) {
      newHeight = displayHeight;
      newWidth = newHeight * ratioValue;
    }
    if (newWidth > displayWidth) {
      newWidth = displayWidth;
      newHeight = newWidth / ratioValue;
    }

    let newX = centerX - newWidth / 2;
    let newY = centerY - newHeight / 2;

    // Clamp to bounds
    newX = Math.max(0, Math.min(newX, displayWidth - newWidth));
    newY = Math.max(0, Math.min(newY, displayHeight - newHeight));

    setCropArea({
      x: Math.round(newX),
      y: Math.round(newY),
      width: Math.round(newWidth),
      height: Math.round(newHeight),
    });
  }, [aspectRatio]);

  return {
    // State
    cropArea,
    setCropArea,
    aspectRatio,
    setAspectRatio,
    canvasExpandMode,
    setCanvasExpandMode,
    lockAspect,
    setLockAspect,

    // Operations
    selectAllCrop,
    clearCrop,
    getAspectRatioValue,
    setCropSize,
    expandToSquare,
    fitToSquare,

    // Crop handle detection
    getCropHandleAtPosition,

    // Crop area manipulation
    moveCrop,
    resizeCrop,
    startCrop,
    updateCrop,
    updateCropExpand,
    validateCrop,
  };
}
