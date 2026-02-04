"use client";

import { useState, useCallback, useEffect } from "react";
import { CropArea, AspectRatio, ASPECT_RATIO_VALUES } from "../../types";

// ============================================
// Types
// ============================================

interface UseCropToolOptions {
  getDisplayDimensions: () => { width: number; height: number };
}

interface UseCropToolReturn {
  // State
  cropArea: CropArea | null;
  setCropArea: React.Dispatch<React.SetStateAction<CropArea | null>>;
  aspectRatio: AspectRatio;
  setAspectRatio: React.Dispatch<React.SetStateAction<AspectRatio>>;

  // Operations
  selectAllCrop: () => void;
  clearCrop: () => void;
  getAspectRatioValue: (ratio: AspectRatio) => number | null;

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
  validateCrop: () => boolean;
}

// ============================================
// Hook Implementation
// ============================================

export function useCropTool(options: UseCropToolOptions): UseCropToolReturn {
  const { getDisplayDimensions } = options;

  // State
  const [cropArea, setCropArea] = useState<CropArea | null>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");

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

  // Get crop handle at position
  const getCropHandleAtPosition = useCallback(
    (
      imagePos: { x: number; y: number },
      handleSize: number = 8
    ): { type: "handle" | "inside" | null; handle?: string } => {
      if (!cropArea) return { type: null };

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

      // Check handles
      for (const h of handles) {
        if (Math.abs(imagePos.x - h.x) <= handleSize && Math.abs(imagePos.y - h.y) <= handleSize) {
          return { type: "handle", handle: h.name };
        }
      }

      // Check if inside crop area
      if (
        imagePos.x >= cropArea.x &&
        imagePos.x <= cropArea.x + cropArea.width &&
        imagePos.y >= cropArea.y &&
        imagePos.y <= cropArea.y + cropArea.height
      ) {
        return { type: "inside" };
      }

      return { type: null };
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

      const newArea = { ...cropArea };

      if (handle.includes("e")) {
        newArea.width = Math.max(20, cropArea.width + dx);
      }
      if (handle.includes("w")) {
        newArea.x = cropArea.x + dx;
        newArea.width = Math.max(20, cropArea.width - dx);
      }
      if (handle.includes("s")) {
        newArea.height = Math.max(20, cropArea.height + dy);
      }
      if (handle.includes("n")) {
        newArea.y = cropArea.y + dy;
        newArea.height = Math.max(20, cropArea.height - dy);
      }

      // Apply aspect ratio constraint if needed
      const ratioValue = getAspectRatioValue(aspectRatio);
      if (ratioValue) {
        // Maintain aspect ratio based on which dimension changed more
        if (Math.abs(dx) > Math.abs(dy)) {
          newArea.height = newArea.width / ratioValue;
        } else {
          newArea.width = newArea.height * ratioValue;
        }
      }

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

      const clampedX = Math.max(0, Math.min(x, displayWidth));
      const clampedY = Math.max(0, Math.min(y, displayHeight));

      let newWidth = Math.abs(clampedX - startX);
      let newHeight = Math.abs(clampedY - startY);

      if (ratioValue) {
        // Maintain aspect ratio
        if (newWidth / ratioValue <= newHeight) {
          newHeight = newWidth / ratioValue;
        } else {
          newWidth = newHeight * ratioValue;
        }
      }

      const newCrop = {
        x: clampedX < startX ? startX - newWidth : startX,
        y: clampedY < startY ? startY - newHeight : startY,
        width: newWidth,
        height: newHeight,
      };

      setCropArea(newCrop);
    },
    [getDisplayDimensions, aspectRatio, getAspectRatioValue]
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

    // Operations
    selectAllCrop,
    clearCrop,
    getAspectRatioValue,

    // Crop handle detection
    getCropHandleAtPosition,

    // Crop area manipulation
    moveCrop,
    resizeCrop,
    startCrop,
    updateCrop,
    validateCrop,
  };
}
