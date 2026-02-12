"use client";

import { useState, useCallback, useRef, useMemo } from "react";
import { Point, UnifiedLayer, AspectRatio, ASPECT_RATIO_VALUES, Guide, SnapSource, DEFAULT_SNAP_CONFIG, CropArea } from "../types";
import { collectSnapSources, snapBounds, rectToBoundingBox, boundingBoxToRect, getActiveSnapSources } from "../utils/snapSystem";
import { getRectHandleAtPosition, resizeRectByHandle, type RectHandle } from "@/shared/utils/rectTransform";
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
  // Rotation in degrees around current bounds center
  rotation: number;
  // Original image data for single layer (backward compatibility)
  originalImageData: ImageData | null;
  // Per-layer data for multi-layer transform
  perLayerData: Map<string, PerLayerTransformData> | null;
  // Whether transform started from a selection region
  isSelectionBased: boolean;
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
  | "rotate"
  | "move"
  | null;

interface UseTransformToolOptions {
  layerCanvasesRef: React.RefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  layers: UnifiedLayer[];
  activeLayerId: string | null;
  saveToHistory: () => void;
  // Selection for selection-based transform
  selection?: CropArea | null;
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
const HANDLE_HIT_AREA = HANDLE_SIZE_CONST.HIT_AREA;
const ROTATE_HANDLE_OFFSET = 24;
const ROTATION_SNAP_STEP = 15;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

function normalizeDegrees(degrees: number): number {
  const normalized = degrees % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function getBoundsCenter(bounds: NonNullable<TransformState["bounds"]>): Point {
  return {
    x: bounds.x + bounds.width / 2,
    y: bounds.y + bounds.height / 2,
  };
}

function worldToLocalPoint(
  point: Point,
  bounds: NonNullable<TransformState["bounds"]>,
  rotationRadians: number
): Point {
  const center = getBoundsCenter(bounds);
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  return {
    x: dx * cos + dy * sin,
    y: -dx * sin + dy * cos,
  };
}

function localToWorldPoint(
  point: Point,
  bounds: NonNullable<TransformState["bounds"]>,
  rotationRadians: number
): Point {
  const center = getBoundsCenter(bounds);
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  return {
    x: center.x + point.x * cos - point.y * sin,
    y: center.y + point.x * sin + point.y * cos,
  };
}

function rotatePoint(point: Point, center: Point, rotationRadians: number): Point {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(rotationRadians);
  const sin = Math.sin(rotationRadians);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
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
    selection,
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
    rotation: 0,
    originalImageData: null,
    perLayerData: null,
    isSelectionBased: false,
  });

  const [activeHandle, setActiveHandle] = useState<TransformHandle>(null);
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("free");
  const [activeSnapSources, setActiveSnapSources] = useState<SnapSource[]>([]);

  // Drag state refs for real-time updates (using refs avoids stale closure issues during fast drag)
  const isDraggingRef = useRef(false);
  const dragStartRef = useRef<Point>({ x: 0, y: 0 });
  const originalBoundsOnDragRef = useRef<TransformState["bounds"]>(null);
  const activeHandleRef = useRef<TransformHandle>(null);
  const dragStartAngleRef = useRef<number>(0);
  const rotationOnDragStartRef = useRef<number>(0);

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
      const rotationRadians = toRadians(transformState.rotation);
      const localPoint = worldToLocalPoint(pos, transformState.bounds, rotationRadians);
      const localRect = {
        x: -transformState.bounds.width / 2,
        y: -transformState.bounds.height / 2,
        width: transformState.bounds.width,
        height: transformState.bounds.height,
      };
      const rotateHandleY = localRect.y - ROTATE_HANDLE_OFFSET;
      const distanceToRotateHandle = Math.hypot(localPoint.x, localPoint.y - rotateHandleY);
      if (distanceToRotateHandle <= HANDLE_HIT_AREA) {
        return "rotate";
      }

      return getRectHandleAtPosition(localPoint, localRect, {
        handleSize: HANDLE_HIT_AREA,
        includeMove: true,
      }) as TransformHandle;
    },
    [transformState.bounds, transformState.rotation]
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

    const hasValidSelection =
      !!selection &&
      selection.width > 0 &&
      selection.height > 0 &&
      targetLayerIds.length === 1;

    if (hasValidSelection) {
      const targetLayerId = targetLayerIds[0];
      const layerCanvas = layerCanvasesRef.current.get(targetLayerId);
      const layer = layers.find((l) => l.id === targetLayerId);
      if (!layerCanvas || !layer || layer.locked) return;

      const ctx = layerCanvas.getContext("2d");
      if (!ctx) return;

      const layerPosX = layer.position?.x || 0;
      const layerPosY = layer.position?.y || 0;

      const localX = Math.floor(selection!.x - layerPosX);
      const localY = Math.floor(selection!.y - layerPosY);
      const localW = Math.ceil(selection!.width);
      const localH = Math.ceil(selection!.height);

      const clampedX = Math.max(0, localX);
      const clampedY = Math.max(0, localY);
      const clampedW = Math.min(localW, layerCanvas.width - clampedX);
      const clampedH = Math.min(localH, layerCanvas.height - clampedY);

      if (clampedW <= 0 || clampedH <= 0) return;

      const contentImageData = ctx.getImageData(clampedX, clampedY, clampedW, clampedH);
      let hasContent = false;
      for (let i = 3; i < contentImageData.data.length; i += 4) {
        if (contentImageData.data[i] > 0) {
          hasContent = true;
          break;
        }
      }
      if (!hasContent) return;

      saveToHistory();
      ctx.clearRect(clampedX, clampedY, clampedW, clampedH);

      const imageBounds = {
        x: clampedX + layerPosX,
        y: clampedY + layerPosY,
        width: clampedW,
        height: clampedH,
      };

      const perLayerData = new Map<string, PerLayerTransformData>();
      perLayerData.set(targetLayerId, {
        originalImageData: contentImageData,
        originalBounds: imageBounds,
        layerPosition: { x: layerPosX, y: layerPosY },
        contentOffset: { x: clampedX, y: clampedY },
      });

      setTransformState({
        isActive: true,
        layerId: targetLayerId,
        layerIds: [targetLayerId],
        layerPosition: { x: layerPosX, y: layerPosY },
        originalBounds: { ...imageBounds },
        bounds: { ...imageBounds },
        rotation: 0,
        originalImageData: contentImageData,
        perLayerData,
        isSelectionBased: true,
      });
      return;
    }

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
      rotation: 0,
      originalImageData: singleLayerData?.originalImageData || null,
      perLayerData: perLayerData,
      isSelectionBased: false,
    });
  }, [activeLayerId, selectedLayerIds, selection, layerCanvasesRef, layers, saveToHistory, findContentBounds]);

  // Cancel transform
  const cancelTransform = useCallback(() => {
    // Reset drag state refs
    isDraggingRef.current = false;
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
    dragStartAngleRef.current = 0;
    rotationOnDragStartRef.current = 0;
    setActiveHandle(null);

    if (!transformState.isActive) {
      setTransformState({
        isActive: false,
        layerId: null,
        layerIds: [],
        layerPosition: null,
        originalBounds: null,
        bounds: null,
        rotation: 0,
        originalImageData: null,
        perLayerData: null,
        isSelectionBased: false,
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

        if (!transformState.isSelectionBased) {
          // For full-content transform, rebuild layer from captured content.
          ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
        }
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

          if (!transformState.isSelectionBased) {
            ctx.clearRect(0, 0, layerCanvas.width, layerCanvas.height);
          }
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
      rotation: 0,
      originalImageData: null,
      perLayerData: null,
      isSelectionBased: false,
    });
  }, [transformState, layerCanvasesRef]);

  // Apply transform to a single layer
  const applyTransformToLayer = useCallback((
    layerId: string,
    data: PerLayerTransformData,
    scaleX: number,
    scaleY: number,
    rotationDegrees: number
  ) => {
    const layerCanvas = layerCanvasesRef.current.get(layerId);
    if (!layerCanvas) return;

    const ctx = layerCanvas.getContext("2d");
    if (!ctx || !transformState.originalBounds || !transformState.bounds) return;

    const { originalImageData, originalBounds, layerPosition, contentOffset } = data;
    const rotationRadians = toRadians(rotationDegrees);
    const targetCenter = getBoundsCenter(transformState.bounds);

    // Calculate new bounds for this layer based on scale
    const newWidth = Math.max(1, Math.round(originalBounds.width * scaleX));
    const newHeight = Math.max(1, Math.round(originalBounds.height * scaleY));

    // Calculate new position (relative offset from combined bounds origin)
    const relativeX = originalBounds.x - transformState.originalBounds.x;
    const relativeY = originalBounds.y - transformState.originalBounds.y;
    const scaledX = transformState.bounds.x + relativeX * scaleX;
    const scaledY = transformState.bounds.y + relativeY * scaleY;
    const scaledCenter = {
      x: scaledX + newWidth / 2,
      y: scaledY + newHeight / 2,
    };
    const rotatedCenter =
      rotationDegrees === 0
        ? scaledCenter
        : rotatePoint(scaledCenter, targetCenter, rotationRadians);

    const absCos = Math.abs(Math.cos(rotationRadians));
    const absSin = Math.abs(Math.sin(rotationRadians));
    const rotatedAabbWidth = absCos * newWidth + absSin * newHeight;
    const rotatedAabbHeight = absSin * newWidth + absCos * newHeight;
    const aabbLeft = rotatedCenter.x - rotatedAabbWidth / 2 - layerPosition.x;
    const aabbTop = rotatedCenter.y - rotatedAabbHeight / 2 - layerPosition.y;
    const aabbRight = aabbLeft + rotatedAabbWidth;
    const aabbBottom = aabbTop + rotatedAabbHeight;
    const localOffsetX = aabbLeft < 0 ? Math.ceil(-aabbLeft) : 0;
    const localOffsetY = aabbTop < 0 ? Math.ceil(-aabbTop) : 0;
    const requiredWidth = Math.max(
      layerCanvas.width + localOffsetX,
      Math.ceil(aabbRight + localOffsetX),
    );
    const requiredHeight = Math.max(
      layerCanvas.height + localOffsetY,
      Math.ceil(aabbBottom + localOffsetY),
    );

    // Expand canvas if needed
    if (requiredWidth !== layerCanvas.width || requiredHeight !== layerCanvas.height) {
      const oldData = ctx.getImageData(0, 0, layerCanvas.width, layerCanvas.height);
      layerCanvas.width = requiredWidth;
      layerCanvas.height = requiredHeight;
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

    // Draw scaled and rotated image around the combined transform center
    const canvasCenterX = rotatedCenter.x - layerPosition.x + localOffsetX;
    const canvasCenterY = rotatedCenter.y - layerPosition.y + localOffsetY;

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.translate(canvasCenterX, canvasCenterY);
    ctx.rotate(rotationRadians);
    ctx.drawImage(
      tempCanvas,
      -newWidth / 2,
      -newHeight / 2,
      newWidth,
      newHeight
    );
    ctx.restore();
  }, [transformState.originalBounds, transformState.bounds, layerCanvasesRef]);

  // Apply transform
  const applyTransform = useCallback(() => {
    // Reset drag state refs
    isDraggingRef.current = false;
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
    dragStartAngleRef.current = 0;
    rotationOnDragStartRef.current = 0;
    setActiveHandle(null);

    if (!transformState.isActive || !transformState.bounds || !transformState.originalBounds) {
      setTransformState({
        isActive: false,
        layerId: null,
        layerIds: [],
        layerPosition: null,
        originalBounds: null,
        bounds: null,
        rotation: 0,
        originalImageData: null,
        perLayerData: null,
        isSelectionBased: false,
      });
      return;
    }

    const { bounds, originalBounds } = transformState;

    // Calculate scale factors
    const scaleX = bounds.width / originalBounds.width;
    const scaleY = bounds.height / originalBounds.height;
    const rotationDegrees = transformState.rotation;

    // Multi-layer transform: apply to each layer
    if (transformState.perLayerData && transformState.perLayerData.size > 0) {
      transformState.perLayerData.forEach((data, layerId) => {
        applyTransformToLayer(layerId, data, scaleX, scaleY, rotationDegrees);
      });
    }
    // Backward compatibility: single layer
    else if (transformState.layerId && transformState.originalImageData && transformState.layerPosition) {
      applyTransformToLayer(
        transformState.layerId,
        {
          originalImageData: transformState.originalImageData,
          originalBounds,
          layerPosition: transformState.layerPosition,
          contentOffset: {
            x: originalBounds.x - transformState.layerPosition.x,
            y: originalBounds.y - transformState.layerPosition.y,
          },
        },
        scaleX,
        scaleY,
        rotationDegrees
      );
    }

    setTransformState({
      isActive: false,
      layerId: null,
      layerIds: [],
      layerPosition: null,
      originalBounds: null,
      bounds: null,
      rotation: 0,
      originalImageData: null,
      perLayerData: null,
      isSelectionBased: false,
    });
  }, [transformState, layerCanvasesRef, applyTransformToLayer]);

  // Handle mouse down for transform
  const handleTransformMouseDown = useCallback(
    (imagePos: Point, _modifiers: { shift: boolean; alt: boolean }): TransformHandle => {
      const handle = getHandleAtPosition(imagePos);

      if (handle) {
        setActiveHandle(handle);
        activeHandleRef.current = handle; // Use ref for synchronous access during drag
        isDraggingRef.current = true;
        dragStartRef.current = imagePos;
        originalBoundsOnDragRef.current = transformState.bounds ? { ...transformState.bounds } : null;
        rotationOnDragStartRef.current = transformState.rotation;

        if (handle === "rotate" && transformState.bounds) {
          const center = getBoundsCenter(transformState.bounds);
          dragStartAngleRef.current = Math.atan2(imagePos.y - center.y, imagePos.x - center.x);
        } else {
          dragStartAngleRef.current = 0;
        }

        setActiveSnapSources([]);
        return handle;
      }

      return null;
    },
    [getHandleAtPosition, transformState.bounds, transformState.rotation]
  );

  // Handle mouse move for transform
  const handleTransformMouseMove = useCallback(
    (imagePos: Point, modifiers: { shift: boolean; alt: boolean }) => {
      // Use ref for activeHandle to avoid stale closure during fast drag events
      const currentHandle = activeHandleRef.current;
      if (!isDraggingRef.current || !currentHandle || !originalBoundsOnDragRef.current) return;

      const orig = originalBoundsOnDragRef.current;

      if (currentHandle === "rotate") {
        const center = getBoundsCenter(orig);
        const currentAngle = Math.atan2(imagePos.y - center.y, imagePos.x - center.x);
        let nextRotation = normalizeDegrees(
          rotationOnDragStartRef.current + toDegrees(currentAngle - dragStartAngleRef.current)
        );

        if (modifiers.shift) {
          nextRotation = Math.round(nextRotation / ROTATION_SNAP_STEP) * ROTATION_SNAP_STEP;
        }

        setTransformState((prev) => ({
          ...prev,
          rotation: normalizeDegrees(nextRotation),
        }));
        setActiveSnapSources([]);
        return;
      }

      const dx = imagePos.x - dragStartRef.current.x;
      const dy = imagePos.y - dragStartRef.current.y;
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
        const rotationRadians = toRadians(transformState.rotation);
        const localStart = worldToLocalPoint(dragStartRef.current, orig, rotationRadians);
        const localCurrent = worldToLocalPoint(imagePos, orig, rotationRadians);
        const localDx = localCurrent.x - localStart.x;
        const localDy = localCurrent.y - localStart.y;

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
        const localRect = {
          x: -orig.width / 2,
          y: -orig.height / 2,
          width: orig.width,
          height: orig.height,
        };
        const resizedLocalRect = resizeRectByHandle(
          localRect,
          currentHandle as RectHandle,
          { dx: localDx, dy: localDy },
          {
            minWidth: 10,
            minHeight: 10,
            keepAspect,
            targetAspect,
            fromCenter,
          }
        );

        const localCenter = {
          x: resizedLocalRect.x + resizedLocalRect.width / 2,
          y: resizedLocalRect.y + resizedLocalRect.height / 2,
        };
        const nextCenter = localToWorldPoint(localCenter, orig, rotationRadians);
        newBounds = {
          x: nextCenter.x - resizedLocalRect.width / 2,
          y: nextCenter.y - resizedLocalRect.height / 2,
          width: resizedLocalRect.width,
          height: resizedLocalRect.height,
        };
      }

      setTransformState((prev) => ({
        ...prev,
        bounds: newBounds,
      }));
      // Note: Canvas preview is now rendered directly in useCanvasRendering
      // to avoid coordinate mismatch between layerCanvas and transform bounds
    },
    [aspectRatio, snapEnabled, snapSources, transformState.rotation]
  );

  // Handle mouse up for transform
  const handleTransformMouseUp = useCallback((_modifiers?: { shift: boolean; alt: boolean }) => {
    isDraggingRef.current = false;
    setActiveHandle(null);
    activeHandleRef.current = null;
    originalBoundsOnDragRef.current = null;
    dragStartAngleRef.current = 0;
    rotationOnDragStartRef.current = 0;
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
