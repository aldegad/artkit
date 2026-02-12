"use client";

import { useEffect, RefObject } from "react";
import { CropArea, EditorToolMode } from "../types";
import { useEditorState, useEditorRefs } from "../contexts";
import { shouldIgnoreKeyEvent } from "@/shared/utils/keyboard";
import { applyFeatherToImageData } from "../utils/selectionFeather";
import {
  BRUSH_SIZE_SHORTCUTS,
  ZOOM_SHORTCUTS,
  HISTORY_SHORTCUTS,
  CLIPBOARD_SHORTCUTS,
  SPECIAL_SHORTCUTS,
  matchesToolShortcut,
  matchesAnyCodes,
  hasCmdOrCtrl,
  matchesShortcut,
  VIEWPORT,
} from "../constants";

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
  selectionFeather: number;
  setSelection: (selection: CropArea | null) => void;
  clearSelectionPixels?: () => void;
  clipboardRef: RefObject<ImageData | null>;
  floatingLayerRef: RefObject<FloatingLayer | null>;
  activeLayerPosition?: { x: number; y: number } | null;

  // Transform state (from useTransformTool)
  isTransformActive?: boolean;
  cancelTransform?: () => void;

  // Dimensions helper
  getDisplayDimensions: () => { width: number; height: number };

  // Tool mode change handler (optional, uses context setToolMode if not provided)
  onToolModeChange?: (mode: EditorToolMode) => void;

  // Whether shortcuts are enabled
  enabled?: boolean;
}

// ============================================
// Hook Implementation
// ============================================

export function useKeyboardShortcuts(options: UseKeyboardShortcutsOptions): void {
  // Get state and setters from EditorStateContext
  const {
    state: { isProjectListOpen },
    setToolMode,
    setIsSpacePressed,
    setZoom,
    setPan,
    setIsProjectListOpen,
  } = useEditorState();

  // Get refs from EditorRefsContext
  const { editCanvasRef } = useEditorRefs();

  // Props from other hooks (still required as options)
  const {
    setIsAltPressed,
    setBrushSize,
    undo,
    redo,
    selection,
    selectionFeather,
    setSelection,
    clearSelectionPixels,
    clipboardRef,
    floatingLayerRef,
    activeLayerPosition,
    isTransformActive = false,
    cancelTransform,
    getDisplayDimensions,
    saveToHistory,
    onToolModeChange,
    enabled = true,
  } = options;

  // Use custom handler if provided, otherwise use context's setToolMode
  const handleToolModeChange = onToolModeChange || setToolMode;

  // Note: setIsProjectListOpen comes from context now, not from options

  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (shouldIgnoreKeyEvent(e)) return;

      // Space for temporary hand tool
      if (e.code === SPECIAL_SHORTCUTS.temporaryHand && !e.repeat) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      // Track Alt for marquee tool cursor
      if (e.altKey) setIsAltPressed(true);

      // Tool shortcuts (single keys without modifiers)
      const toolMode = matchesToolShortcut(e);
      if (toolMode) {
        handleToolModeChange(toolMode);
      }

      // Brush size shortcuts (without Cmd/Ctrl)
      if (!hasCmdOrCtrl(e)) {
        if (matchesAnyCodes(e, BRUSH_SIZE_SHORTCUTS.decrease)) {
          setBrushSize((s) => Math.max(1, s - (e.shiftKey ? 10 : 1)));
        }
        if (matchesAnyCodes(e, BRUSH_SIZE_SHORTCUTS.increase)) {
          setBrushSize((s) => Math.min(200, s + (e.shiftKey ? 10 : 1)));
        }
      }

      // Zoom shortcuts (with Cmd/Ctrl)
      if (hasCmdOrCtrl(e)) {
        if (matchesAnyCodes(e, ZOOM_SHORTCUTS.zoomIn)) {
          e.preventDefault();
          setZoom((z) => Math.min(VIEWPORT.MAX_ZOOM, z * VIEWPORT.ZOOM_STEP_IN));
        }
        if (matchesAnyCodes(e, ZOOM_SHORTCUTS.zoomOut)) {
          e.preventDefault();
          setZoom((z) => Math.max(VIEWPORT.MIN_ZOOM, z * VIEWPORT.ZOOM_STEP_OUT));
        }
        if (matchesAnyCodes(e, ZOOM_SHORTCUTS.resetZoom)) {
          e.preventDefault();
          setZoom(() => 1);
          setPan({ x: 0, y: 0 });
        }
      }

      // Undo (Cmd+Z) — shared matchesShortcut includes strict shift check
      if (matchesShortcut(e, HISTORY_SHORTCUTS.undo)) {
        e.preventDefault();
        // If transform is active, cancel it instead of undo
        if (isTransformActive && cancelTransform) {
          cancelTransform();
        } else {
          undo();
        }
      }

      // Redo (Cmd+Shift+Z or Cmd+Y)
      if (HISTORY_SHORTCUTS.redo.some((shortcut) => matchesShortcut(e, shortcut))) {
        e.preventDefault();
        redo();
      }

      // Copy (Cmd+C)
      if (matchesShortcut(e, CLIPBOARD_SHORTCUTS.copy) && selection) {
        e.preventDefault();
        const editCanvas = editCanvasRef.current;
        if (!editCanvas) return;

        const { width: displayWidth, height: displayHeight } = getDisplayDimensions();

        // Create composite canvas
        const compositeCanvas = document.createElement("canvas");
        compositeCanvas.width = displayWidth;
        compositeCanvas.height = displayHeight;
        const compositeCtx = compositeCanvas.getContext("2d");
        if (!compositeCtx) return;

        const layerPosX = activeLayerPosition?.x || 0;
        const layerPosY = activeLayerPosition?.y || 0;
        compositeCtx.drawImage(editCanvas, layerPosX, layerPosY);

        // Copy selection to clipboard
        const selectionWidth = Math.max(1, Math.round(selection.width));
        const selectionHeight = Math.max(1, Math.round(selection.height));
        let imageData = compositeCtx.getImageData(
          Math.round(selection.x),
          Math.round(selection.y),
          selectionWidth,
          selectionHeight
        );
        imageData = applyFeatherToImageData(imageData, selectionFeather);
        (clipboardRef as { current: ImageData | null }).current = imageData;
      }

      // Paste (Cmd+V)
      if (matchesShortcut(e, CLIPBOARD_SHORTCUTS.paste) && clipboardRef.current) {
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
        const pasteX = Math.round(selection ? selection.x : (displayWidth - clipData.width) / 2);
        const pasteY = Math.round(selection ? selection.y : (displayHeight - clipData.height) / 2);
        const layerPosX = activeLayerPosition?.x || 0;
        const layerPosY = activeLayerPosition?.y || 0;
        const localPasteX = pasteX - layerPosX;
        const localPasteY = pasteY - layerPosY;

        ctx.drawImage(tempCanvas, localPasteX, localPasteY);
        (floatingLayerRef as { current: FloatingLayer | null }).current = null;

        // Update selection to new position
        setSelection({
          x: pasteX,
          y: pasteY,
          width: clipData.width,
          height: clipData.height,
        });
      }

      // Delete selection content (Delete / Backspace)
      if ((e.code === "Delete" || e.code === "Backspace") && selection) {
        e.preventDefault();
        clearSelectionPixels?.();
      }

      // Escape to clear selection or close modal
      if (e.code === SPECIAL_SHORTCUTS.cancel) {
        if (isProjectListOpen) {
          setIsProjectListOpen(false);
        } else {
          setSelection(null);
          (floatingLayerRef as { current: FloatingLayer | null }).current = null;
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === SPECIAL_SHORTCUTS.temporaryHand) {
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
    handleToolModeChange,
    setIsSpacePressed,
    setIsAltPressed,
    setBrushSize,
    setZoom,
    setPan,
    undo,
    redo,
    selection,
    selectionFeather,
    setSelection,
    clearSelectionPixels,
    clipboardRef,
    floatingLayerRef,
    isTransformActive,
    cancelTransform,
    editCanvasRef,
    getDisplayDimensions,
    saveToHistory,
    activeLayerPosition,
    isProjectListOpen,
    setIsProjectListOpen,
  ]);
}
