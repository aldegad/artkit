"use client";

import { useState, useCallback, useRef, SetStateAction } from "react";
import { CropArea, Point } from "../../types";
import { useEditorState, useEditorRefs } from "../../contexts";

// ============================================
// Types
// ============================================

interface FloatingLayer {
  imageData: ImageData;
  x: number;
  y: number;
  originX: number;
  originY: number;
}

interface UseSelectionToolOptions {
  // Display dimensions helper
  getDisplayDimensions: () => { width: number; height: number };
  // History (from useHistory)
  saveToHistory: () => void;
}

interface UseSelectionToolReturn {
  // State
  selection: CropArea | null;
  setSelection: React.Dispatch<React.SetStateAction<CropArea | null>>;
  selectionFeather: number;
  setSelectionFeather: React.Dispatch<React.SetStateAction<number>>;
  isMovingSelection: boolean;
  setIsMovingSelection: React.Dispatch<React.SetStateAction<boolean>>;
  isDuplicating: boolean;
  setIsDuplicating: React.Dispatch<React.SetStateAction<boolean>>;
  isAltPressed: boolean;
  setIsAltPressed: React.Dispatch<React.SetStateAction<boolean>>;

  // Refs
  floatingLayerRef: React.MutableRefObject<FloatingLayer | null>;
  clipboardRef: React.MutableRefObject<ImageData | null>;
  dragStartOriginRef: React.MutableRefObject<Point | null>;

  // Operations
  startSelection: (x: number, y: number) => void;
  updateSelection: (x: number, y: number, startX: number, startY: number) => void;
  clearSelection: () => void;
  commitFloatingLayer: () => void;
  createFloatingLayer: (isDuplicate: boolean) => void;
  moveFloatingLayer: (newX: number, newY: number) => void;
  copyToClipboard: () => void;
  pasteFromClipboard: () => FloatingLayer | null;
  selectAll: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useSelectionTool(options: UseSelectionToolOptions): UseSelectionToolReturn {
  // Get state from EditorStateContext
  const {
    state: { rotation, canvasSize, selection },
    setSelection: setContextSelection,
  } = useEditorState();

  // Get refs from EditorRefsContext
  const { editCanvasRef, imageRef } = useEditorRefs();

  // Props from other hooks (still required as options)
  const { getDisplayDimensions, saveToHistory } = options;

  // Local selection state wrapper that syncs with context
  const setSelection = useCallback((newSelection: SetStateAction<CropArea | null>) => {
    const value = typeof newSelection === 'function'
      ? newSelection(selection)
      : newSelection;
    setContextSelection(value);
  }, [selection, setContextSelection]);
  const [isMovingSelection, setIsMovingSelection] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isAltPressed, setIsAltPressed] = useState(false);
  const [selectionFeather, setSelectionFeather] = useState(0);

  // Refs
  const floatingLayerRef = useRef<FloatingLayer | null>(null);
  const clipboardRef = useRef<ImageData | null>(null);
  const dragStartOriginRef = useRef<Point | null>(null);

  // Start a new selection
  const startSelection = useCallback((x: number, y: number) => {
    setSelection({ x: Math.round(x), y: Math.round(y), width: 0, height: 0 });
    floatingLayerRef.current = null;
  }, []);

  // Update selection during drag
  const updateSelection = useCallback(
    (x: number, y: number, startX: number, startY: number) => {
      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();
      const clampedX = Math.max(0, Math.min(x, displayWidth));
      const clampedY = Math.max(0, Math.min(y, displayHeight));

      const newSelection = {
        x: Math.min(startX, clampedX),
        y: Math.min(startY, clampedY),
        width: Math.abs(clampedX - startX),
        height: Math.abs(clampedY - startY),
      };
      setSelection(newSelection);
    },
    [getDisplayDimensions]
  );

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelection(null);
    floatingLayerRef.current = null;
    setIsMovingSelection(false);
    setIsDuplicating(false);
  }, []);

  // Create a floating layer from current selection (for move or duplicate)
  const createFloatingLayer = useCallback(
    (isDuplicate: boolean) => {
      if (!selection) return;

      const editCanvas = editCanvasRef.current;
      const ctx = editCanvas?.getContext("2d");
      const img = imageRef.current;
      if (!editCanvas || !ctx || !img) return;

      const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

      // Create composite canvas to get the selected area
      const compositeCanvas = document.createElement("canvas");
      compositeCanvas.width = displayWidth;
      compositeCanvas.height = displayHeight;
      const compositeCtx = compositeCanvas.getContext("2d");
      if (!compositeCtx) return;

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

      floatingLayerRef.current = {
        imageData,
        x: selection.x,
        y: selection.y,
        originX: selection.x,
        originY: selection.y,
      };

      // If not duplicating (cutting), clear the original area
      if (!isDuplicate) {
        saveToHistory();
        ctx.clearRect(
          Math.round(selection.x),
          Math.round(selection.y),
          Math.round(selection.width),
          Math.round(selection.height)
        );
      }

      setIsMovingSelection(true);
      setIsDuplicating(isDuplicate);
      dragStartOriginRef.current = { x: selection.x, y: selection.y };
    },
    [selection, editCanvasRef, imageRef, getDisplayDimensions, rotation, canvasSize, saveToHistory]
  );

  // Move the floating layer
  const moveFloatingLayer = useCallback((newX: number, newY: number) => {
    if (floatingLayerRef.current) {
      floatingLayerRef.current.x = newX;
      floatingLayerRef.current.y = newY;
    }
  }, []);

  // Commit floating layer to edit canvas
  const commitFloatingLayer = useCallback(() => {
    if (!floatingLayerRef.current) return;

    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    if (!editCanvas || !ctx) return;

    const { imageData, x, y } = floatingLayerRef.current;

    // Create temp canvas to draw image data
    const tempCanvas = document.createElement("canvas");
    tempCanvas.width = imageData.width;
    tempCanvas.height = imageData.height;
    const tempCtx = tempCanvas.getContext("2d");
    if (!tempCtx) return;
    tempCtx.putImageData(imageData, 0, 0);

    // Draw to edit canvas at new position
    if (!isDuplicating) {
      saveToHistory();
    }
    ctx.drawImage(tempCanvas, Math.round(x), Math.round(y));

    // Update selection to new position
    setSelection({
      x: Math.round(x),
      y: Math.round(y),
      width: imageData.width,
      height: imageData.height,
    });

    floatingLayerRef.current = null;
    setIsMovingSelection(false);
    setIsDuplicating(false);
    dragStartOriginRef.current = null;
  }, [editCanvasRef, isDuplicating, saveToHistory]);

  // Copy selection to clipboard
  const copyToClipboard = useCallback(() => {
    if (!selection) return;

    const editCanvas = editCanvasRef.current;
    const ctx = editCanvas?.getContext("2d");
    const img = imageRef.current;
    if (!editCanvas || !ctx || !img) return;

    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Create composite canvas
    const compositeCanvas = document.createElement("canvas");
    compositeCanvas.width = displayWidth;
    compositeCanvas.height = displayHeight;
    const compositeCtx = compositeCanvas.getContext("2d");
    if (!compositeCtx) return;

    compositeCtx.translate(displayWidth / 2, displayHeight / 2);
    compositeCtx.rotate((rotation * Math.PI) / 180);
    compositeCtx.drawImage(img, -canvasSize.width / 2, -canvasSize.height / 2);
    compositeCtx.setTransform(1, 0, 0, 1, 0, 0);
    compositeCtx.drawImage(editCanvas, 0, 0);

    // Copy to clipboard
    const imageData = compositeCtx.getImageData(
      Math.round(selection.x),
      Math.round(selection.y),
      Math.round(selection.width),
      Math.round(selection.height)
    );
    clipboardRef.current = imageData;
  }, [selection, editCanvasRef, imageRef, getDisplayDimensions, rotation, canvasSize]);

  // Paste from clipboard
  const pasteFromClipboard = useCallback((): FloatingLayer | null => {
    if (!clipboardRef.current) return null;

    const clipData = clipboardRef.current;
    const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

    // Center the pasted content
    const x = Math.round((displayWidth - clipData.width) / 2);
    const y = Math.round((displayHeight - clipData.height) / 2);

    floatingLayerRef.current = {
      imageData: clipData,
      x,
      y,
      originX: x,
      originY: y,
    };

    setSelection({
      x,
      y,
      width: clipData.width,
      height: clipData.height,
    });

    setIsMovingSelection(true);
    setIsDuplicating(true); // Paste acts like duplicate (doesn't clear origin)
    dragStartOriginRef.current = { x, y };

    return floatingLayerRef.current;
  }, [getDisplayDimensions]);

  // Select entire canvas
  const selectAll = useCallback(() => {
    const { width, height } = getDisplayDimensions();
    setSelection({ x: 0, y: 0, width, height });
  }, [getDisplayDimensions]);

  return {
    // State
    selection,
    setSelection,
    selectionFeather,
    setSelectionFeather,
    isMovingSelection,
    setIsMovingSelection,
    isDuplicating,
    setIsDuplicating,
    isAltPressed,
    setIsAltPressed,

    // Refs
    floatingLayerRef,
    clipboardRef,
    dragStartOriginRef,

    // Operations
    startSelection,
    updateSelection,
    clearSelection,
    commitFloatingLayer,
    createFloatingLayer,
    moveFloatingLayer,
    copyToClipboard,
    pasteFromClipboard,
    selectAll,
  };
}
