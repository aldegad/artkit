// ============================================
// Move Handler (Selection + Layer Movement)
// ============================================

import { useCallback, useRef, useState } from "react";
import { Point } from "../../types";
import type { MouseEventContext, HandlerResult, MoveHandlerOptions, FloatingLayer } from "./types";

export interface UseMoveHandlerReturn {
  isMovingLayer: boolean;
  handleMouseDown: (ctx: MouseEventContext) => HandlerResult;
  handleMouseMove: (ctx: MouseEventContext) => void;
  handleMouseUp: () => void;
}

export function useMoveHandler(options: MoveHandlerOptions): UseMoveHandlerReturn {
  const {
    editCanvasRef,
    imageRef,
    rotation,
    canvasSize,
    selection,
    floatingLayerRef,
    dragStartOriginRef,
    setIsMovingSelection,
    setIsDuplicating,
    activeLayerId,
    updateLayerPosition,
    updateMultipleLayerPositions,
    saveToHistory,
    // Multi-layer support
    selectedLayerIds,
    layers,
  } = options;

  const [isMovingLayer, setIsMovingLayer] = useState(false);
  // Changed to Map to support multi-layer movement
  const layerDragStartRef = useRef<Map<string, { layerPos: Point; mousePos: Point }> | null>(null);

  const handleMouseDown = useCallback(
    (ctx: MouseEventContext): HandlerResult => {
      const { imagePos, activeMode, displayDimensions } = ctx;
      const { width: displayWidth, height: displayHeight } = displayDimensions;

      if (activeMode !== "move") return { handled: false };

      // First check if clicking inside a selection
      if (selection) {
        if (
          imagePos.x >= selection.x &&
          imagePos.x <= selection.x + selection.width &&
          imagePos.y >= selection.y &&
          imagePos.y <= selection.y + selection.height
        ) {
          // If we don't have a floating layer yet, create one (cut operation)
          if (!floatingLayerRef.current) {
            const editCanvas = editCanvasRef.current;
            const ctx2d = editCanvas?.getContext("2d");
            const img = imageRef.current;
            if (!editCanvas || !ctx2d || !img) return { handled: false };

            // Create composite canvas to get the selected area
            const compositeCanvas = document.createElement("canvas");
            compositeCanvas.width = displayWidth;
            compositeCanvas.height = displayHeight;
            const compositeCtx = compositeCanvas.getContext("2d");
            if (!compositeCtx) return { handled: false };

            compositeCtx.translate(displayWidth / 2, displayHeight / 2);
            compositeCtx.rotate((rotation * Math.PI) / 180);
            compositeCtx.drawImage(img, -canvasSize.width / 2, -canvasSize.height / 2);
            compositeCtx.setTransform(1, 0, 0, 1, 0, 0);
            compositeCtx.drawImage(editCanvas, 0, 0);

            // Copy selection to floating layer
            const imageData = compositeCtx.getImageData(
              Math.round(selection.x),
              Math.round(selection.y),
              Math.round(selection.width),
              Math.round(selection.height)
            );
            (floatingLayerRef as { current: FloatingLayer | null }).current = {
              imageData,
              x: selection.x,
              y: selection.y,
              originX: selection.x,
              originY: selection.y,
            };

            saveToHistory();

            // Clear the original selection area (cut operation)
            ctx2d.clearRect(
              Math.round(selection.x),
              Math.round(selection.y),
              Math.round(selection.width),
              Math.round(selection.height)
            );
          }

          (dragStartOriginRef as { current: Point | null }).current = { x: imagePos.x, y: imagePos.y };
          setIsMovingSelection(true);
          setIsDuplicating(false);

          return {
            handled: true,
            dragType: "move",
            dragStart: imagePos,
          };
        }
      }

      // No selection - move layer(s)
      // Determine which layers to move: selected layers or just the active layer
      const targetLayerIds = (selectedLayerIds && selectedLayerIds.length > 0)
        ? selectedLayerIds
        : (activeLayerId ? [activeLayerId] : []);

      if (targetLayerIds.length > 0 && (updateLayerPosition || updateMultipleLayerPositions) && layers) {
        // Filter out locked layers
        const movableLayers = targetLayerIds.filter(id => {
          const layer = layers.find(l => l.id === id);
          return layer && !layer.locked;
        });

        if (movableLayers.length === 0) return { handled: false };

        // Store initial positions for all movable layers
        const startPositions = new Map<string, { layerPos: Point; mousePos: Point }>();
        movableLayers.forEach(id => {
          const layer = layers.find(l => l.id === id);
          const pos = layer?.position || { x: 0, y: 0 };
          startPositions.set(id, {
            layerPos: { x: pos.x, y: pos.y },
            mousePos: { ...imagePos },
          });
        });

        layerDragStartRef.current = startPositions;
        saveToHistory();
        setIsMovingLayer(true);

        return {
          handled: true,
          dragType: "move",
        };
      }

      return { handled: false };
    },
    [
      selection,
      floatingLayerRef,
      dragStartOriginRef,
      editCanvasRef,
      imageRef,
      rotation,
      canvasSize,
      saveToHistory,
      setIsMovingSelection,
      setIsDuplicating,
      activeLayerId,
      updateLayerPosition,
      updateMultipleLayerPositions,
      selectedLayerIds,
      layers,
    ]
  );

  const handleMouseMove = useCallback(
    (ctx: MouseEventContext) => {
      const { imagePos, e, displayDimensions } = ctx;
      const { width: displayWidth, height: displayHeight } = displayDimensions;

      // Handle multi-layer movement (no selection)
      if (
        isMovingLayer &&
        layerDragStartRef.current &&
        layerDragStartRef.current.size > 0 &&
        (updateLayerPosition || updateMultipleLayerPositions)
      ) {
        // Use the first layer's mousePos as reference for delta calculation
        const firstEntry = layerDragStartRef.current.entries().next().value;
        if (!firstEntry) return;

        const refMousePos = firstEntry[1].mousePos;

        // Calculate delta from drag start
        let dx = imagePos.x - refMousePos.x;
        let dy = imagePos.y - refMousePos.y;

        // Shift key constrains to horizontal or vertical movement
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) {
            dy = 0;
          } else {
            dx = 0;
          }
        }

        if (updateMultipleLayerPositions) {
          const updates = Array.from(layerDragStartRef.current.entries()).map(([layerId, start]) => ({
            layerId,
            position: {
              x: start.layerPos.x + dx,
              y: start.layerPos.y + dy,
            },
          }));
          updateMultipleLayerPositions(updates);
        } else if (updateLayerPosition) {
          layerDragStartRef.current.forEach((start, layerId) => {
            updateLayerPosition(layerId, {
              x: start.layerPos.x + dx,
              y: start.layerPos.y + dy,
            });
          });
        }
        return;
      }

      // Handle selection movement with floating layer
      if (selection && floatingLayerRef.current) {
        const origin = dragStartOriginRef.current;
        if (!origin) return;

        // Calculate total delta from original start position
        let totalDx = imagePos.x - origin.x;
        let totalDy = imagePos.y - origin.y;

        // Shift key constrains to horizontal or vertical movement
        if (e.shiftKey) {
          if (Math.abs(totalDx) > Math.abs(totalDy)) {
            totalDy = 0;
          } else {
            totalDx = 0;
          }
        }

        // Calculate new position
        const baseX = floatingLayerRef.current.originX;
        const baseY = floatingLayerRef.current.originY;
        const newX = Math.max(0, Math.min(baseX + totalDx, displayWidth - selection.width));
        const newY = Math.max(0, Math.min(baseY + totalDy, displayHeight - selection.height));

        floatingLayerRef.current.x = newX;
        floatingLayerRef.current.y = newY;
      }
    },
    [
      isMovingLayer,
      updateLayerPosition,
      updateMultipleLayerPositions,
      selection,
      floatingLayerRef,
      dragStartOriginRef,
    ]
  );

  const handleMouseUp = useCallback(() => {
    setIsMovingLayer(false);
    layerDragStartRef.current = null;
  }, []);

  return {
    isMovingLayer,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
  };
}
