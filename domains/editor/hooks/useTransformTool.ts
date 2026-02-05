"use client";

import { useState, useCallback, useRef } from "react";
import { Point, UnifiedLayer, AspectRatio, ASPECT_RATIO_VALUES } from "../types";

// ============================================
// Types
// ============================================

export interface TransformState {
  isActive: boolean;
  layerId: string | null;
  // Layer position offset (for converting between screen and canvas coords)
  layerPosition: { x: number; y: number } | null;
  // Original bounds before transform (in screen coordinates)
  originalBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  // Current transform values (in screen coordinates)
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
  aspectRatio: AspectRatio;
  setAspectRatio: React.Dispatch<React.SetStateAction<AspectRatio>>;
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

// Handle size for interaction detection
const HANDLE_SIZE = 10;

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
    layerPosition: null,
    originalBounds: null,
    bounds: null,
    originalImageData: null,
  });

  const [activeHandle, setActiveHandle] = useState<TransformHandle>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");

  // Drag state refs for real-time updates (using refs avoids stale closure issues during fast drag)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const originalBoundsOnDragRef = useRef<TransformState["bounds"]>(null);
  const activeHandleRef = useRef<TransformHandle>(null);

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

    // Include layer position offset
    const layerPosX = layer.position?.x || 0;
    const layerPosY = layer.position?.y || 0;

    const bounds = {
      x: minX + layerPosX,
      y: minY + layerPosY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };

    // Extract the content as ImageData (use canvas-local coordinates, not screen)
    const contentImageData = ctx.getImageData(
      minX,
      minY,
      bounds.width,
      bounds.height
    );

    saveToHistory();

    setTransformState({
      isActive: true,
      layerId: activeLayerId,
      layerPosition: { x: layerPosX, y: layerPosY },
      originalBounds: { ...bounds },
      bounds: { ...bounds },
      originalImageData: contentImageData,
    });
  }, [activeLayerId, layerCanvasesRef, layers, saveToHistory]);

  // Cancel transform
  const cancelTransform = useCallback(() => {
    // Reset drag state refs
    isDraggingRef.current = false;
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
    setActiveHandle(null);

    if (!transformState.isActive || !transformState.layerId || !transformState.originalImageData) {
      setTransformState({
        isActive: false,
        layerId: null,
        layerPosition: null,
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
        // Convert screen coords to canvas coords
        const layerPosX = transformState.layerPosition?.x || 0;
        const layerPosY = transformState.layerPosition?.y || 0;

        // Clear the current area
        ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        // Restore original (use canvas-local coordinates)
        ctx.putImageData(
          transformState.originalImageData,
          transformState.originalBounds.x - layerPosX,
          transformState.originalBounds.y - layerPosY
        );
      }
    }

    setTransformState({
      isActive: false,
      layerId: null,
      layerPosition: null,
      originalBounds: null,
      bounds: null,
      originalImageData: null,
    });
  }, [transformState, layerCanvasesRef]);

  // Apply transform
  const applyTransform = useCallback(() => {
    // Reset drag state refs
    isDraggingRef.current = false;
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
    setActiveHandle(null);

    if (!transformState.isActive || !transformState.layerId || !transformState.bounds || !transformState.originalImageData) {
      setTransformState({
        isActive: false,
        layerId: null,
        layerPosition: null,
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

    const { bounds, originalImageData, originalBounds, layerPosition } = transformState;
    if (!originalBounds) return;

    // Convert screen coords to canvas coords
    const layerPosX = layerPosition?.x || 0;
    const layerPosY = layerPosition?.y || 0;

    // Calculate the original canvas-local position (where content was before transform)
    const origCanvasX = originalBounds.x - layerPosX;
    const origCanvasY = originalBounds.y - layerPosY;

    // Calculate the new canvas-local position
    const canvasX = bounds.x - layerPosX;
    const canvasY = bounds.y - layerPosY;

    // Calculate required canvas size to fit the transformed content
    const requiredWidth = Math.max(layerCanvas.width, canvasX + bounds.width, bounds.width);
    const requiredHeight = Math.max(layerCanvas.height, canvasY + bounds.height, bounds.height);

    // Calculate offset if content starts at negative coordinates
    const offsetX = canvasX < 0 ? -canvasX : 0;
    const offsetY = canvasY < 0 ? -canvasY : 0;

    // Expand canvas if needed
    if (requiredWidth + offsetX > layerCanvas.width || requiredHeight + offsetY > layerCanvas.height || offsetX > 0 || offsetY > 0) {
      const newWidth = Math.max(layerCanvas.width, requiredWidth + offsetX);
      const newHeight = Math.max(layerCanvas.height, requiredHeight + offsetY);

      // Save current content
      const oldData = ctx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);

      // Resize canvas
      layerCanvas.width = newWidth;
      layerCanvas.height = newHeight;

      // Restore old content at offset position
      ctx.putImageData(oldData, offsetX, offsetY);
    }

    // Clear only the original content area (not the entire canvas)
    ctx.clearRect(origCanvasX + offsetX, origCanvasY + offsetY, originalBounds.width, originalBounds.height);

    // Create temp canvas with original image data
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = originalImageData.width;
    tempCanvas.height = originalImageData.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;
    tempCtx.putImageData(originalImageData, 0, 0);

    // Draw scaled image to the new bounds (use canvas-local coordinates with offset)
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      tempCanvas,
      canvasX + offsetX,
      canvasY + offsetY,
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
      layerPosition: null,
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
        activeHandleRef.current = handle; // Use ref for synchronous access during drag
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
      // Use ref for activeHandle to avoid stale closure during fast drag events
      const currentHandle = activeHandleRef.current;
      if (!isDraggingRef.current || !currentHandle || !originalBoundsOnDragRef.current) return;

      const dx = imagePos.x - dragStartRef.current.x;
      const dy = imagePos.y - dragStartRef.current.y;
      const orig = originalBoundsOnDragRef.current;

      let newBounds = { ...orig };

      if (currentHandle === "move") {
        // Move the bounds
        newBounds.x = orig.x + dx;
        newBounds.y = orig.y + dy;
      } else {
        // Resize based on handle
        const fromCenter = modifiers.alt;
        const originalAspect = orig.width / orig.height;

        // Determine if we should keep aspect ratio
        // - Shift key always forces aspect ratio
        // - aspectRatio !== "free" also forces it
        const keepAspect = modifiers.shift || aspectRatio !== "free";

        // Calculate the target aspect ratio
        let targetAspect = originalAspect;
        if (aspectRatio === "fixed" || modifiers.shift) {
          targetAspect = originalAspect;
        } else if (aspectRatio !== "free") {
          const ratioValue = ASPECT_RATIO_VALUES[aspectRatio];
          if (ratioValue !== null) {
            targetAspect = ratioValue;
          }
        }

        switch (currentHandle) {
          case "se":
            newBounds.width = Math.max(10, orig.width + dx);
            newBounds.height = Math.max(10, orig.height + dy);
            if (keepAspect) {
              // Use the larger dimension change
              const scaleX = newBounds.width / orig.width;
              const scaleY = newBounds.height / orig.height;
              if (Math.abs(scaleX - 1) > Math.abs(scaleY - 1)) {
                newBounds.height = newBounds.width / targetAspect;
              } else {
                newBounds.width = newBounds.height * targetAspect;
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
                newBounds.height = newBounds.width / targetAspect;
                newBounds.y = orig.y + orig.height - newBounds.height;
              } else {
                newBounds.width = newBounds.height * targetAspect;
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
                newBounds.height = newBounds.width / targetAspect;
                newBounds.y = orig.y + orig.height - newBounds.height;
              } else {
                newBounds.width = newBounds.height * targetAspect;
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
                newBounds.height = newBounds.width / targetAspect;
              } else {
                newBounds.width = newBounds.height * targetAspect;
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
              newBounds.width = newBounds.height * targetAspect;
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
              newBounds.width = newBounds.height * targetAspect;
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
              newBounds.height = newBounds.width / targetAspect;
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
              newBounds.height = newBounds.width / targetAspect;
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
      // Note: Canvas preview is now rendered directly in useCanvasRendering
      // to avoid coordinate mismatch between layerCanvas and transform bounds
    },
    [aspectRatio]
  );

  // Handle mouse up for transform
  const handleTransformMouseUp = useCallback((_modifiers?: { shift: boolean; alt: boolean }) => {
    isDraggingRef.current = false;
    setActiveHandle(null);
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
  }, []);

  return {
    transformState,
    activeHandle,
    aspectRatio,
    setAspectRatio,
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
