"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Point, UnifiedLayer, AspectRatio, ASPECT_RATIO_VALUES, Guide, SnapSource, DEFAULT_SNAP_CONFIG } from "../types";
import { collectSnapSources, snapBounds, rectToBoundingBox, boundingBoxToRect, getActiveSnapSources } from "../utils/snapSystem";
import { HANDLE_SIZE as HANDLE_SIZE_CONST } from "../constants";

// ============================================
// Types
// ============================================

// Per-layer data for multi-layer transform
export interface PerLayerTransformData {
  originalImageData: ImageData;
  originalBounds: { x: number; y: number; width: number; height: number };
  layerPosition: { x: number; y: number };
  // Content offset within layer canvas (for proper content extraction)
  contentOffset: { x: number; y: number };
}

export interface TransformState {
  isActive: boolean;
  // Single layer ID (for backward compatibility) or null if multi-layer
  layerId: string | null;
  // Multiple layer IDs for multi-layer transform
  layerIds: string[];
  // Layer position offset (for single layer mode)
  layerPosition: { x: number; y: number } | null;
  // Combined bounds of all selected layers (in image coordinates)
  originalBounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  // Current transform values (in image coordinates)
  bounds: {
    x: number;
    y: number;
    width: number;
    height: number;
  } | null;
  // Original image data for single layer (backward compatibility)
  originalImageData: ImageData | null;
  // Per-layer data for multi-layer transform
  perLayerData: Map<string, PerLayerTransformData> | null;
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
  // Snap options
  guides?: Guide[];
  canvasSize?: { width: number; height: number };
  snapEnabled?: boolean;
  // Multi-layer support
  selectedLayerIds?: string[];
}

interface UseTransformToolReturn {
  // State
  transformState: TransformState;
  activeHandle: TransformHandle;
  aspectRatio: AspectRatio;
  setAspectRatio: React.Dispatch<React.SetStateAction<AspectRatio>>;
  activeSnapSources: SnapSource[];
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

// Handle size for interaction detection (from shared constants)
const HANDLE_SIZE = HANDLE_SIZE_CONST.HIT_AREA;

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
    // Snap options
    guides = [],
    canvasSize,
    snapEnabled = false,
    // Multi-layer support
    selectedLayerIds,
  } = options;

  // Transform state
  const [transformState, setTransformState] = useState<TransformState>({
    isActive: false,
    layerId: null,
    layerIds: [],
    layerPosition: null,
    originalBounds: null,
    bounds: null,
    originalImageData: null,
    perLayerData: null,
  });

  const [activeHandle, setActiveHandle] = useState<TransformHandle>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [activeSnapSources, setActiveSnapSources] = useState<SnapSource[]>([]);

  // Drag state refs for real-time updates (using refs avoids stale closure issues during fast drag)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const originalBoundsOnDragRef = useRef<TransformState["bounds"]>(null);
  const activeHandleRef = useRef<TransformHandle>(null);

  // Compute snap sources
  const snapSources = useMemo(() => {
    if (!snapEnabled) return [];
    return collectSnapSources({
      guides,
      canvasSize,
      includeCanvasEdges: true,
      includeLayerEdges: false, // Disabled for now to keep it simple
    });
  }, [guides, canvasSize, snapEnabled]);

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

  // Helper function to find content bounds in a canvas
  const findContentBounds = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let minX = canvas.width;
    let minY = canvas.height;
    let maxX = 0;
    let maxY = 0;
    let hasContent = false;

    for (let y = 0; y < canvas.height; y++) {
      for (let x = 0; x < canvas.width; x++) {
        const alpha = imageData.data[(y * canvas.width + x) * 4 + 3];
        if (alpha > 0) {
          hasContent = true;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
    }

    if (!hasContent) return null;

    return { minX, minY, maxX, maxY, width: maxX - minX + 1, height: maxY - minY + 1 };
  }, []);

  // Start transform mode
  const startTransform = useCallback(() => {
    // Determine target layers: selectedLayerIds or just activeLayerId
    const targetLayerIds = (selectedLayerIds && selectedLayerIds.length > 0)
      ? selectedLayerIds
      : (activeLayerId ? [activeLayerId] : []);

    if (targetLayerIds.length === 0) return;

    // Filter to transformable layers (not locked, visible, has content)
    const transformableLayers: string[] = [];
    const perLayerData = new Map<string, PerLayerTransformData>();

    // Combined bounds (in image coordinates)
    let combinedMinX = Infinity;
    let combinedMinY = Infinity;
    let combinedMaxX = -Infinity;
    let combinedMaxY = -Infinity;

    for (const layerId of targetLayerIds) {
      const layerCanvas = layerCanvasesRef.current.get(layerId);
      if (!layerCanvas) continue;

      const layer = layers.find((l) => l.id === layerId);
      if (!layer || layer.locked) continue;

      const contentBounds = findContentBounds(layerCanvas);
      if (!contentBounds) continue; // No content

      const ctx = layerCanvas.getContext("2d");
      if (!ctx) continue;

      const layerPosX = layer.position?.x || 0;
      const layerPosY = layer.position?.y || 0;

      // Convert content bounds to image coordinates
      const imageBounds = {
        x: contentBounds.minX + layerPosX,
        y: contentBounds.minY + layerPosY,
        width: contentBounds.width,
        height: contentBounds.height,
      };

      // Update combined bounds
      combinedMinX = Math.min(combinedMinX, imageBounds.x);
      combinedMinY = Math.min(combinedMinY, imageBounds.y);
      combinedMaxX = Math.max(combinedMaxX, imageBounds.x + imageBounds.width);
      combinedMaxY = Math.max(combinedMaxY, imageBounds.y + imageBounds.height);

      // Extract content image data for this layer
      const contentImageData = ctx.getImageData(
        contentBounds.minX,
        contentBounds.minY,
        contentBounds.width,
        contentBounds.height
      );

      // Store per-layer data
      perLayerData.set(layerId, {
        originalImageData: contentImageData,
        originalBounds: imageBounds,
        layerPosition: { x: layerPosX, y: layerPosY },
        contentOffset: { x: contentBounds.minX, y: contentBounds.minY },
      });

      transformableLayers.push(layerId);
    }

    if (transformableLayers.length === 0) return;

    const combinedBounds = {
      x: combinedMinX,
      y: combinedMinY,
      width: combinedMaxX - combinedMinX,
      height: combinedMaxY - combinedMinY,
    };

    saveToHistory();

    // For single layer, maintain backward compatibility
    const isSingleLayer = transformableLayers.length === 1;
    const singleLayerId = isSingleLayer ? transformableLayers[0] : null;
    const singleLayerData = singleLayerId ? perLayerData.get(singleLayerId) : null;

    setTransformState({
      isActive: true,
      layerId: singleLayerId,
      layerIds: transformableLayers,
      layerPosition: singleLayerData?.layerPosition || null,
      originalBounds: { ...combinedBounds },
      bounds: { ...combinedBounds },
      originalImageData: singleLayerData?.originalImageData || null,
      perLayerData: perLayerData,
    });
  }, [activeLayerId, selectedLayerIds, layerCanvasesRef, layers, saveToHistory, findContentBounds]);

  // Cancel transform
  const cancelTransform = useCallback(() => {
    // Reset drag state refs
    isDraggingRef.current = false;
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
    setActiveHandle(null);

    if (!transformState.isActive) {
      setTransformState({
        isActive: false,
        layerId: null,
        layerIds: [],
        layerPosition: null,
        originalBounds: null,
        bounds: null,
        originalImageData: null,
        perLayerData: null,
      });
      return;
    }

    // Multi-layer restore: use perLayerData
    if (transformState.perLayerData && transformState.perLayerData.size > 0) {
      transformState.perLayerData.forEach((data, layerId) => {
        const layerCanvas = layerCanvasesRef.current.get(layerId);
        if (!layerCanvas) return;

        const ctx = layerCanvas.getContext("2d");
        if (!ctx) return;

        // Clear the canvas and restore original content
        ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        ctx.putImageData(
          data.originalImageData,
          data.contentOffset.x,
          data.contentOffset.y
        );
      });
    }
    // Backward compatibility: single layer with originalImageData
    else if (transformState.layerId && transformState.originalImageData && transformState.originalBounds) {
      const layerCanvas = layerCanvasesRef.current.get(transformState.layerId);
      if (layerCanvas) {
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          const layerPosX = transformState.layerPosition?.x || 0;
          const layerPosY = transformState.layerPosition?.y || 0;

          ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
          ctx.putImageData(
            transformState.originalImageData,
            transformState.originalBounds.x - layerPosX,
            transformState.originalBounds.y - layerPosY
          );
        }
      }
    }

    setTransformState({
      isActive: false,
      layerId: null,
      layerIds: [],
      layerPosition: null,
      originalBounds: null,
      bounds: null,
      originalImageData: null,
      perLayerData: null,
    });
  }, [transformState, layerCanvasesRef]);

  // Apply transform to a single layer
  const applyTransformToLayer = useCallback((
    layerId: string,
    data: PerLayerTransformData,
    scaleX: number,
    scaleY: number,
    offsetX: number,
    offsetY: number
  ) => {
    const layerCanvas = layerCanvasesRef.current.get(layerId);
    if (!layerCanvas) return;

    const ctx = layerCanvas.getContext("2d");
    if (!ctx) return;

    const { originalImageData, originalBounds, layerPosition, contentOffset } = data;

    // Calculate new bounds for this layer based on scale
    const newWidth = Math.round(originalBounds.width * scaleX);
    const newHeight = Math.round(originalBounds.height * scaleY);

    // Calculate new position (relative offset from combined bounds origin)
    const relativeX = originalBounds.x - (transformState.originalBounds?.x || 0);
    const relativeY = originalBounds.y - (transformState.originalBounds?.y || 0);
    const newX = (transformState.bounds?.x || 0) + relativeX * scaleX;
    const newY = (transformState.bounds?.y || 0) + relativeY * scaleY;

    // Convert to canvas-local coordinates
    const canvasX = newX - layerPosition.x;
    const canvasY = newY - layerPosition.y;

    // Calculate required canvas size
    const requiredWidth = Math.max(layerCanvas.width, canvasX + newWidth);
    const requiredHeight = Math.max(layerCanvas.height, canvasY + newHeight);

    // Handle negative coordinates
    const localOffsetX = canvasX < 0 ? -canvasX : 0;
    const localOffsetY = canvasY < 0 ? -canvasY : 0;

    // Expand canvas if needed
    if (requiredWidth + localOffsetX > layerCanvas.width || requiredHeight + localOffsetY > layerCanvas.height || localOffsetX > 0 || localOffsetY > 0) {
      const newCanvasWidth = Math.max(layerCanvas.width, requiredWidth + localOffsetX);
      const newCanvasHeight = Math.max(layerCanvas.height, requiredHeight + localOffsetY);

      const oldData = ctx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
      layerCanvas.width = newCanvasWidth;
      layerCanvas.height = newCanvasHeight;
      ctx.putImageData(oldData, localOffsetX, localOffsetY);
    }

    // Clear original content area
    ctx.clearRect(
      contentOffset.x + localOffsetX,
      contentOffset.y + localOffsetY,
      originalBounds.width,
      originalBounds.height
    );

    // Create temp canvas with original image data
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = originalImageData.width;
    tempCanvas.height = originalImageData.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;
    tempCtx.putImageData(originalImageData, 0, 0);

    // Draw scaled image
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      tempCanvas,
      canvasX + localOffsetX,
      canvasY + localOffsetY,
      newWidth,
      newHeight
    );
  }, [transformState.originalBounds, transformState.bounds, layerCanvasesRef]);

  // Apply transform
  const applyTransform = useCallback(() => {
    // Reset drag state refs
    isDraggingRef.current = false;
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
    setActiveHandle(null);

    if (!transformState.isActive || !transformState.bounds || !transformState.originalBounds) {
      setTransformState({
        isActive: false,
        layerId: null,
        layerIds: [],
        layerPosition: null,
        originalBounds: null,
        bounds: null,
        originalImageData: null,
        perLayerData: null,
      });
      return;
    }

    const { bounds, originalBounds } = transformState;

    // Calculate scale factors
    const scaleX = bounds.width / originalBounds.width;
    const scaleY = bounds.height / originalBounds.height;
    const offsetX = bounds.x - originalBounds.x;
    const offsetY = bounds.y - originalBounds.y;

    // Multi-layer transform: apply to each layer
    if (transformState.perLayerData && transformState.perLayerData.size > 0) {
      transformState.perLayerData.forEach((data, layerId) => {
        applyTransformToLayer(layerId, data, scaleX, scaleY, offsetX, offsetY);
      });
    }
    // Backward compatibility: single layer
    else if (transformState.layerId && transformState.originalImageData) {
      const layerCanvas = layerCanvasesRef.current.get(transformState.layerId);
      if (layerCanvas) {
        const ctx = layerCanvas.getContext("2d");
        if (ctx) {
          const layerPosX = transformState.layerPosition?.x || 0;
          const layerPosY = transformState.layerPosition?.y || 0;

          const origCanvasX = originalBounds.x - layerPosX;
          const origCanvasY = originalBounds.y - layerPosY;
          const canvasX = bounds.x - layerPosX;
          const canvasY = bounds.y - layerPosY;

          // Clear original area
          ctx.clearRect(origCanvasX, origCanvasY, originalBounds.width, originalBounds.height);

          // Create temp canvas
          const tempCanvas = document.createElement("canvas");
          tempCanvas.width = transformState.originalImageData.width;
          tempCanvas.height = transformState.originalImageData.height;
          const tempCtx = tempCanvas.getContext("2d");
          if (tempCtx) {
            tempCtx.putImageData(transformState.originalImageData, 0, 0);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(tempCanvas, canvasX, canvasY, bounds.width, bounds.height);
          }
        }
      }
    }

    setTransformState({
      isActive: false,
      layerId: null,
      layerIds: [],
      layerPosition: null,
      originalBounds: null,
      bounds: null,
      originalImageData: null,
      perLayerData: null,
    });
  }, [transformState, layerCanvasesRef, applyTransformToLayer]);

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

        // Apply snapping when moving
        if (snapEnabled && snapSources.length > 0) {
          const boundingBox = rectToBoundingBox(newBounds);
          const { bounds: snappedBounds, snappedEdges } = snapBounds(
            boundingBox,
            snapSources,
            DEFAULT_SNAP_CONFIG.tolerance,
            ["left", "right", "top", "bottom"]
          );
          newBounds = boundingBoxToRect(snappedBounds);
          setActiveSnapSources(getActiveSnapSources(snappedEdges));
        } else {
          setActiveSnapSources([]);
        }
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
    [aspectRatio, snapEnabled, snapSources]
  );

  // Handle mouse up for transform
  const handleTransformMouseUp = useCallback((_modifiers?: { shift: boolean; alt: boolean }) => {
    isDraggingRef.current = false;
    setActiveHandle(null);
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
    setActiveSnapSources([]); // Clear snap indicators on mouse up
  }, []);

  return {
    transformState,
    activeHandle,
    aspectRatio,
    setAspectRatio,
    activeSnapSources,
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
