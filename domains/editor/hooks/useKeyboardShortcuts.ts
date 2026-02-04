"use client";

import { useEffect, RefObject } from "react";
import { CropArea } from "../types";
import { useEditorState, useEditorRefs } from "../contexts";

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

interface UseKeyboardShortcutsOptions {
  // Brush state (from useBrushTool)
  setIsAltPressed: (pressed: boolean) => void;
  setBrushSize: (fn: (size: number) => number) => void;

  // History (from useHistory)
  undo: () => void;
  redo: () => void;
  saveToHistory: () => void;

  // Selection state (from useSelectionTool)
  selection: CropArea | null;
  setSelection: (selection: CropArea | null) => void;
  clipboardRef: RefObject<ImageData | null>;
  floatingLayerRef: RefObject<FloatingLayer | null>;

  // Dimensions helper
  getDisplayDimensions: () => { width: number; height: number };

  // Whether shortcuts are enabled
  enabled?: boolean;
}

// ============================================
// Hook Implementation
// ============================================

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  // Get state and setters from EditorStateContext
  const {
    state: { rotation, canvasSize, isProjectListOpen },
    setToolMode,
    setIsSpacePressed,
    setZoom,
    setPan,
    setIsProjectListOpen,
  } = useEditorState();

  // Get refs from EditorRefsContext
  const { canvasRef, imageRef, editCanvasRef } = useEditorRefs();

  // Props from other hooks (still required as options)
  const {
    setIsAltPressed,
    setBrushSize,
    undo,
    redo,
    selection,
    setSelection,
    clipboardRef,
    floatingLayerRef,
    getDisplayDimensions,
    saveToHistory,
    enabled = true,
  } = options;

  // Note: setIsProjectListOpen comes from context now, not from options

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if focus is on input elements
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA"
      ) {
        return;
      }

      // Space for temporary hand tool
      if (e.code === "Space" && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      // Track Alt for marquee tool cursor
      if (e.altKey) setIsAltPressed(true);

      // Tool shortcuts (single keys without modifiers)
      if (!e.metaKey && !e.ctrlKey) {
        switch (e.key) {
          case "c":
            setToolMode("crop");
            break;
          case "h":
            setToolMode("hand");
            break;
          case "z":
            setToolMode("zoom");
            break;
          case "b":
            setToolMode("brush");
            break;
          case "e":
            setToolMode("eraser");
            break;
          case "g":
            setToolMode("fill");
            break;
          case "i":
            setToolMode("eyedropper");
            break;
          case "s":
            setToolMode("stamp");
            break;
          case "m":
            setToolMode("marquee");
            break;
          case "v":
            setToolMode("move");
            break;
        }
      }

      // Brush size shortcuts
      if (e.key === "[" || (e.key === "-" && !e.metaKey && !e.ctrlKey)) {
        setBrushSize((s) => Math.max(1, s - (e.shiftKey ? 10 : 1)));
      }
      if (e.key === "]" || (e.key === "=" && !e.metaKey && !e.ctrlKey)) {
        setBrushSize((s) => Math.min(200, s + (e.shiftKey ? 10 : 1)));
      }

      // Zoom shortcuts (with Cmd/Ctrl)
      if ((e.key === "=" || e.key === "+") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom((z) => Math.min(10, z * 1.25));
      }
      if (e.key === "-" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom((z) => Math.max(0.1, z * 0.8));
      }
      if (e.key === "0" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setZoom(() => 1);
        setPan({ x: 0, y: 0 });
      }

      // Undo (Cmd+Z)
      if (e.key === "z" && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault();
        undo();
      }

      // Redo (Cmd+Shift+Z or Cmd+Y)
      if (
        (e.key === "z" && (e.metaKey || e.ctrlKey) && e.shiftKey) ||
        (e.key === "y" && (e.metaKey || e.ctrlKey))
      ) {
        e.preventDefault();
        redo();
      }

      // Copy (Cmd+C)
      if (e.key === "c" && (e.metaKey || e.ctrlKey) && selection) {
        e.preventDefault();
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext("2d");
        const img = imageRef.current;
        const editCanvas = editCanvasRef.current;
        if (!canvas || !ctx || !img) return;

        const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

        // Create composite canvas
        const compositeCanvas = document.createElement("canvas");
        compositeCanvas.width = displayWidth;
        compositeCanvas.height = displayHeight;
        const compositeCtx = compositeCanvas.getContext("2d");
        if (!compositeCtx) return;

        // Draw rotated original
        compositeCtx.translate(displayWidth / 2, displayHeight / 2);
        compositeCtx.rotate((rotation * Math.PI) / 180);
        compositeCtx.drawImage(img, -canvasSize.width / 2, -canvasSize.height / 2);
        compositeCtx.setTransform(1, 0, 0, 1, 0, 0);

        // Draw edits
        if (editCanvas) {
          compositeCtx.drawImage(editCanvas, 0, 0);
        }

        // Copy selection to clipboard
        const imageData = compositeCtx.getImageData(
          Math.round(selection.x),
          Math.round(selection.y),
          Math.round(selection.width),
          Math.round(selection.height)
        );
        (clipboardRef as { current: ImageData | null }).current = imageData;
      }

      // Paste (Cmd+V)
      if (e.key === "v" && (e.metaKey || e.ctrlKey) && clipboardRef.current) {
        e.preventDefault();
        const editCanvas = editCanvasRef.current;
        const ctx = editCanvas?.getContext("2d");
        if (!editCanvas || !ctx) return;

        const clipData = clipboardRef.current;
        const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

        saveToHistory();

        // Create temp canvas to draw clipboard data
        const tempCanvas = document.createElement("canvas");
        tempCanvas.width = clipData.width;
        tempCanvas.height = clipData.height;
        const tempCtx = tempCanvas.getContext("2d");
        if (!tempCtx) return;
        tempCtx.putImageData(clipData, 0, 0);

        // Paste at center or at current selection position
        const pasteX = selection ? selection.x : (displayWidth - clipData.width) / 2;
        const pasteY = selection ? selection.y : (displayHeight - clipData.height) / 2;

        ctx.drawImage(tempCanvas, pasteX, pasteY);

        // Create floating layer for move operation
        (floatingLayerRef as { current: FloatingLayer | null }).current = {
          imageData: clipData,
          x: pasteX,
          y: pasteY,
          originX: pasteX,
          originY: pasteY,
        };

        // Update selection to new position
        setSelection({
          x: pasteX,
          y: pasteY,
          width: clipData.width,
          height: clipData.height,
        });
      }

      // Escape to clear selection or close modal
      if (e.key === "Escape") {
        if (isProjectListOpen) {
          setIsProjectListOpen(false);
        } else {
          setSelection(null);
          (floatingLayerRef as { current: FloatingLayer | null }).current = null;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
      if (!e.altKey) setIsAltPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [
    enabled,
    setToolMode,
    setIsSpacePressed,
    setIsAltPressed,
    setBrushSize,
    setZoom,
    setPan,
    undo,
    redo,
    selection,
    setSelection,
    clipboardRef,
    floatingLayerRef,
    canvasRef,
    imageRef,
    editCanvasRef,
    getDisplayDimensions,
    rotation,
    canvasSize,
    saveToHistory,
    isProjectListOpen,
    setIsProjectListOpen,
  ]);
}
