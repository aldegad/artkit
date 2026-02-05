"use client";

import { useState, useCallback, useRef } from "react";
import { Point, UnifiedLayer } from "../types";

// ============================================
// Types
// ============================================

export interface TransformState {
  isActive: boolean;
  layerId: string | null;
  // Original bounds before transform
  originalBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  // Current transform values
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  // Original image data for non-destructive transform
  originalImageData: ImageData | null;
}

export type TransformHandle =
  | "nw"
  | "n"
  | "ne"
  | "e"
  | "se"
  | "s"
  | "sw"
  | "w"
  | "move"
  | null;

interface UseTransformToolOptions {
  layerCanvasesRef: React.RefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  saveToHistory: () => void;
}

interface UseTransformToolReturn {
  // State
  transformState: TransformState;
  activeHandle: TransformHandle;
  // Actions
  startTransform: () => void;
  cancelTransform: () => void;
  applyTransform: () => void;
  // Mouse handlers
  handleTransformMouseDown: (imagePos: Point, modifiers: { shift: boolean; alt: boolean }) => TransformHandle;
  handleTransformMouseMove: (imagePos: Point, modifiers: { shift: boolean; alt: boolean }) => void;
  handleTransformMouseUp: () => void;
  // Utility
  getHandleAtPosition: (pos: Point) => TransformHandle;
  isTransformActive: () => boolean;
}

// ============================================
// Helper Functions
// ============================================

const HANDLE_SIZE = 8;

function isInHandle(pos: Point, handle: Point, size: number = HANDLE_SIZE): boolean {
  return Math.abs(pos.x - handle.x) <= size && Math.abs(pos.y - handle.y) <= size;
}

// ============================================
// Hook Implementation
// ============================================

export function useTransformTool(options: UseTransformToolOptions): UseTransformToolReturn {
  const {
    layerCanvasesRef,
    editCanvasRef,
    layers,
    activeLayerId,
    saveToHistory,
  } = options;

  // Transform state
  const [transformState, setTransformState] = useState<TransformState>({
    isActive: false,
    layerId: null,
    originalBounds: null,
    bounds: null,
    originalImageData: null,
  });

  const [activeHandle, setActiveHandle] = useState<TransformHandle>(null);

  // Drag state refs for real-time updates
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const originalBoundsOnDragRef = useRef<TransformState["bounds"]>(null);

  // Check if transform is active
  const isTransformActive = useCallback(() => {
    return transformState.isActive && transformState.bounds !== null;
  }, [transformState.isActive, transformState.bounds]);

  // Get handle at position
  const getHandleAtPosition = useCallback(
    (pos: Point): TransformHandle => {
      if (!transformState.bounds) return null;

      const { x, y, width, height } = transformState.bounds;

      const handles: { pos: Point; name: TransformHandle }[] = [
        { pos: { x, y }, name: "nw" },
        { pos: { x: x + width / 2, y }, name: "n" },
        { pos: { x: x + width, y }, name: "ne" },
        { pos: { x: x + width, y: y + height / 2 }, name: "e" },
        { pos: { x: x + width, y: y + height }, name: "se" },
        { pos: { x: x + width / 2, y: y + height }, name: "s" },
        { pos: { x, y: y + height }, name: "sw" },
        { pos: { x, y: y + height / 2 }, name: "w" },
      ];

      for (const handle of handles) {
        if (isInHandle(pos, handle.pos)) {
          return handle.name;
        }
      }

      // Check if inside bounds (for move)
      if (
        pos.x >= x &&
        pos.x <= x + width &&
        pos.y >= y &&
        pos.y <= y + height
      ) {
        return "move";
      }

      return null;
    },
    [transformState.bounds]
  );

  // Start transform mode
  const startTransform = useCallback(() => {
    if (!activeLayerId) return;

    const layerCanvas = layerCanvasesRef.current.get(activeLayerId);
    if (!layerCanvas) return;

    const layer = layers.find((l) => l.id === activeLayerId);
    if (!layer || layer.locked) return;

    // Get the actual content bounds (non-transparent area)
    const ctx = layerCanvas.getContext("2d");
    if (!ctx) return;

    const imageData = ctx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);

    // Find content bounds
    let minX = layerCanvas.width;
    let minY = layerCanvas.height;
    let maxX = 0;
    let maxY = 0;
    let hasContent = false;

    for (let y = 0; y < layerCanvas.height; y++) {
      for (let x = 0; x < layerCanvas.width; x++) {
        const alpha = imageData.data[(y * layerCanvas.width + x) * 4 + 3];
        if (alpha > 0) {
          hasContent = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (!hasContent) {
      // No content to transform
      return;
    }

    const bounds = {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };

    // Extract the content as ImageData
    const contentImageData = ctx.getImageData(
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );

    saveToHistory();

    setTransformState({
      isActive: true,
      layerId: activeLayerId,
      originalBounds: { ...bounds },
      bounds: { ...bounds },
      originalImageData: contentImageData,
    });
  }, [activeLayerId, layerCanvasesRef, layers, saveToHistory]);

  // Cancel transform
  const cancelTransform = useCallback(() => {
    if (!transformState.isActive || !transformState.layerId || !transformState.originalImageData) {
      setTransformState({
        isActive: false,
        layerId: null,
        originalBounds: null,
        bounds: null,
        originalImageData: null,
      });
      return;
    }

    // Restore original state
    const layerCanvas = layerCanvasesRef.current.get(transformState.layerId);
    if (layerCanvas && transformState.originalBounds) {
      const ctx = layerCanvas.getContext("2d");
      if (ctx) {
        // Clear the current area
        ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        // Restore original
        ctx.putImageData(
          transformState.originalImageData,
          transformState.originalBounds.x,
          transformState.originalBounds.y
        );
      }
    }

    setTransformState({
      isActive: false,
      layerId: null,
      originalBounds: null,
      bounds: null,
      originalImageData: null,
    });
  }, [transformState, layerCanvasesRef]);

  // Apply transform
  const applyTransform = useCallback(() => {
    if (!transformState.isActive || !transformState.layerId || !transformState.bounds || !transformState.originalImageData) {
      setTransformState({
        isActive: false,
        layerId: null,
        originalBounds: null,
        bounds: null,
        originalImageData: null,
      });
      return;
    }

    const layerCanvas = layerCanvasesRef.current.get(transformState.layerId);
    if (!layerCanvas) return;

    const ctx = layerCanvas.getContext("2d");
    if (!ctx) return;

    const { bounds, originalImageData, originalBounds } = transformState;
    if (!originalBounds) return;

    // Clear the canvas
    ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);

    // Create temp canvas with original image data
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = originalImageData.width;
    tempCanvas.height = originalImageData.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;
    tempCtx.putImageData(originalImageData, 0, 0);

    // Draw scaled image to the new bounds
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      tempCanvas,
      bounds.x,
      bounds.y,
      bounds.width,
      bounds.height
    );

    // Update editCanvasRef if this is the active layer
    if (editCanvasRef.current === layerCanvas) {
      // Already the same reference
    }

    setTransformState({
      isActive: false,
      layerId: null,
      originalBounds: null,
      bounds: null,
      originalImageData: null,
    });
  }, [transformState, layerCanvasesRef, editCanvasRef]);

  // Handle mouse down for transform
  const handleTransformMouseDown = useCallback(
    (imagePos: Point, modifiers: { shift: boolean; alt: boolean }): TransformHandle => {
      const handle = getHandleAtPosition(imagePos);

      if (handle) {
        setActiveHandle(handle);
        isDraggingRef.current = true;
        dragStartRef.current = imagePos;
        originalBoundsOnDragRef.current = transformState.bounds ? { ...transformState.bounds } : null;
        return handle;
      }

      return null;
    },
    [getHandleAtPosition, transformState.bounds]
  );

  // Handle mouse move for transform
  const handleTransformMouseMove = useCallback(
    (imagePos: Point, modifiers: { shift: boolean; alt: boolean }) => {
      if (!isDraggingRef.current || !activeHandle || !originalBoundsOnDragRef.current) return;

      const dx = imagePos.x - dragStartRef.current.x;
      const dy = imagePos.y - dragStartRef.current.y;
      const orig = originalBoundsOnDragRef.current;

      let newBounds = { ...orig };

      if (activeHandle === "move") {
        // Move the bounds
        newBounds.x = orig.x + dx;
        newBounds.y = orig.y + dy;
      } else {
        // Resize based on handle
        const keepAspect = modifiers.shift;
        const fromCenter = modifiers.alt;
        const aspectRatio = orig.width / orig.height;

        switch (activeHandle) {
          case "se":
            newBounds.width = Math.max(10, orig.width + dx);
            newBounds.height = Math.max(10, orig.height + dy);
            if (keepAspect) {
              // Use the larger dimension change
              const scaleX = newBounds.width / orig.width;
              const scaleY = newBounds.height / orig.height;
              if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
                newBounds.height = newBounds.width / aspectRatio;
              } else {
                newBounds.width = newBounds.height * aspectRatio;
              }
            }
            if (fromCenter) {
              const widthChange = newBounds.width - orig.width;
              const heightChange = newBounds.height - orig.height;
              newBounds.x = orig.x - widthChange / 2;
              newBounds.y = orig.y - heightChange / 2;
              newBounds.width = orig.width + widthChange;
              newBounds.height = orig.height + heightChange;
            }
            break;

          case "nw":
            newBounds.x = orig.x + dx;
            newBounds.y = orig.y + dy;
            newBounds.width = Math.max(10, orig.width - dx);
            newBounds.height = Math.max(10, orig.height - dy);
            if (keepAspect) {
              const scaleX = newBounds.width / orig.width;
              const scaleY = newBounds.height / orig.height;
              if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
                newBounds.height = newBounds.width / aspectRatio;
                newBounds.y = orig.y + orig.height - newBounds.height;
              } else {
                newBounds.width = newBounds.height * aspectRatio;
                newBounds.x = orig.x + orig.width - newBounds.width;
              }
            }
            if (fromCenter) {
              const widthChange = newBounds.width - orig.width;
              const heightChange = newBounds.height - orig.height;
              newBounds.x = orig.x - widthChange / 2;
              newBounds.y = orig.y - heightChange / 2;
              newBounds.width = orig.width + widthChange;
              newBounds.height = orig.height + heightChange;
            }
            break;

          case "ne":
            newBounds.y = orig.y + dy;
            newBounds.width = Math.max(10, orig.width + dx);
            newBounds.height = Math.max(10, orig.height - dy);
            if (keepAspect) {
              const scaleX = newBounds.width / orig.width;
              const scaleY = newBounds.height / orig.height;
              if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
                newBounds.height = newBounds.width / aspectRatio;
                newBounds.y = orig.y + orig.height - newBounds.height;
              } else {
                newBounds.width = newBounds.height * aspectRatio;
              }
            }
            if (fromCenter) {
              const widthChange = newBounds.width - orig.width;
              const heightChange = newBounds.height - orig.height;
              newBounds.x = orig.x - widthChange / 2;
              newBounds.y = orig.y - heightChange / 2;
              newBounds.width = orig.width + widthChange;
              newBounds.height = orig.height + heightChange;
            }
            break;

          case "sw":
            newBounds.x = orig.x + dx;
            newBounds.width = Math.max(10, orig.width - dx);
            newBounds.height = Math.max(10, orig.height + dy);
            if (keepAspect) {
              const scaleX = newBounds.width / orig.width;
              const scaleY = newBounds.height / orig.height;
              if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
                newBounds.height = newBounds.width / aspectRatio;
              } else {
                newBounds.width = newBounds.height * aspectRatio;
                newBounds.x = orig.x + orig.width - newBounds.width;
              }
            }
            if (fromCenter) {
              const widthChange = newBounds.width - orig.width;
              const heightChange = newBounds.height - orig.height;
              newBounds.x = orig.x - widthChange / 2;
              newBounds.y = orig.y - heightChange / 2;
              newBounds.width = orig.width + widthChange;
              newBounds.height = orig.height + heightChange;
            }
            break;

          case "n":
            newBounds.y = orig.y + dy;
            newBounds.height = Math.max(10, orig.height - dy);
            if (keepAspect) {
              newBounds.width = newBounds.height * aspectRatio;
              newBounds.x = orig.x + (orig.width - newBounds.width) / 2;
            }
            if (fromCenter) {
              const heightChange = newBounds.height - orig.height;
              newBounds.y = orig.y - heightChange / 2;
              newBounds.height = orig.height + heightChange;
            }
            break;

          case "s":
            newBounds.height = Math.max(10, orig.height + dy);
            if (keepAspect) {
              newBounds.width = newBounds.height * aspectRatio;
              newBounds.x = orig.x + (orig.width - newBounds.width) / 2;
            }
            if (fromCenter) {
              const heightChange = newBounds.height - orig.height;
              newBounds.y = orig.y - heightChange / 2;
              newBounds.height = orig.height + heightChange;
            }
            break;

          case "e":
            newBounds.width = Math.max(10, orig.width + dx);
            if (keepAspect) {
              newBounds.height = newBounds.width / aspectRatio;
              newBounds.y = orig.y + (orig.height - newBounds.height) / 2;
            }
            if (fromCenter) {
              const widthChange = newBounds.width - orig.width;
              newBounds.x = orig.x - widthChange / 2;
              newBounds.width = orig.width + widthChange;
            }
            break;

          case "w":
            newBounds.x = orig.x + dx;
            newBounds.width = Math.max(10, orig.width - dx);
            if (keepAspect) {
              newBounds.height = newBounds.width / aspectRatio;
              newBounds.y = orig.y + (orig.height - newBounds.height) / 2;
            }
            if (fromCenter) {
              const widthChange = newBounds.width - orig.width;
              newBounds.x = orig.x - widthChange / 2;
              newBounds.width = orig.width + widthChange;
            }
            break;
        }
      }

      setTransformState((prev) => ({
        ...prev,
        bounds: newBounds,
      }));

      // Update the canvas preview in real-time
      if (transformState.layerId && transformState.originalImageData) {
        const layerCanvas = layerCanvasesRef.current.get(transformState.layerId);
        if (layerCanvas) {
          const ctx = layerCanvas.getContext("2d");
          if (ctx) {
            ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);

            // Create temp canvas with original image data
            const tempCanvas = document.createElement("canvas");
            tempCanvas.width = transformState.originalImageData.width;
            tempCanvas.height = transformState.originalImageData.height;
            const tempCtx = tempCanvas.getContext("2d");
            if (tempCtx) {
              tempCtx.putImageData(transformState.originalImageData, 0, 0);

              // Draw scaled image
              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              ctx.drawImage(
                tempCanvas,
                newBounds.x,
                newBounds.y,
                newBounds.width,
                newBounds.height
              );
            }
          }
        }
      }
    },
    [activeHandle, transformState.layerId, transformState.originalImageData, layerCanvasesRef]
  );

  // Handle mouse up for transform
  const handleTransformMouseUp = useCallback((_modifiers?: { shift: boolean; alt: boolean }) => {
    isDraggingRef.current = false;
    setActiveHandle(null);
    originalBoundsOnDragRef.current = null;
  }, []);

  return {
    transformState,
    activeHandle,
    startTransform,
    cancelTransform,
    applyTransform,
    handleTransformMouseDown,
    handleTransformMouseMove,
    handleTransformMouseUp,
    getHandleAtPosition,
    isTransformActive,
  };
}
