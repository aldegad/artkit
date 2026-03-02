"use client";

import { useEffect, RefObject } from "react";
import { CropArea, EditorToolMode, SelectionMask } from "../types";
import { useEditorState, useEditorRefs } from "../contexts";
import { shouldIgnoreKeyEvent } from "@/shared/utils/keyboard";
import { applyFeatherToImageData } from "../utils/selectionFeather";
import { drawIntoLayerAlphaMask, drawLayerWithOptionalAlphaMask } from "@/shared/utils/layerAlphaMask";
import { applySelectionMaskToImageData } from "../utils/selectionRegion";
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
  selectionMask: SelectionMask | null;
  selectionFeather: number;
  setSelection: (selection: CropArea | null) => void;
  setSelectionMask: (mask: SelectionMask | null) => void;
  clearSelectionPixels?: () => void;
  clipboardRef: RefObject<ImageData | null>;
  floatingLayerRef: RefObject<FloatingLayer | null>;
  activeLayerId?: string | null;
  activeLayerPosition?: { x: number; y: number } | null;

  // Transform state (from useTransformTool)
  isTransformActive?: boolean;
  cancelTransform?: () => void;

  // Dimensions helper
  getDisplayDimensions: () => { width: number; height: number };
  loadImageFile?: (file: File) => void;
  addImageLayer?: (
    imageSrc: string,
    name?: string,
    options?: { preserveActiveLayerId?: string | null }
  ) => void;

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
    selectionMask,
    selectionFeather,
    setSelection,
    setSelectionMask,
    clearSelectionPixels,
    clipboardRef,
    floatingLayerRef,
    activeLayerId,
    activeLayerPosition,
    isTransformActive = false,
    cancelTransform,
    getDisplayDimensions,
    loadImageFile,
    addImageLayer,
    saveToHistory,
    onToolModeChange,
    enabled = true,
  } = options;

  // Use custom handler if provided, otherwise use context's setToolMode
  const handleToolModeChange = onToolModeChange || setToolMode;

  // Note: setIsProjectListOpen comes from context now, not from options

  useEffect(() => {
    if (!enabled) return;

    const isInteractiveTarget = (target: EventTarget | null): boolean => {
      const element = target as HTMLElement | null;
      if (!element) return false;
      return (
        element.tagName === "INPUT" ||
        element.tagName === "SELECT" ||
        element.tagName === "TEXTAREA" ||
        element.isContentEditable
      );
    };

    const pasteFromInternalClipboard = () => {
      if (!clipboardRef.current) return;

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
      drawIntoLayerAlphaMask(editCanvas, tempCanvas, localPasteX, localPasteY);
      (floatingLayerRef as { current: FloatingLayer | null }).current = null;

      // Update selection to new position
      setSelection({
        x: pasteX,
        y: pasteY,
        width: clipData.width,
        height: clipData.height,
      });
      setSelectionMask(null);
    };

    const writeImageDataToSystemClipboard = async (imageData: ImageData): Promise<void> => {
      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = imageData.width;
      tempCanvas.height = imageData.height;
      const tempCtx = tempCanvas.getContext("2d");
      if (!tempCtx) return;
      tempCtx.putImageData(imageData, 0, 0);

      const blob = await new Promise<Blob | null>((resolve) => {
        tempCanvas.toBlob((result) => resolve(result), "image/png");
      });
      if (!blob) return;

      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            [blob.type || "image/png"]: blob,
          }),
        ]);
      } catch {
        // Ignore clipboard write failures (permission/browser constraints).
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      const isIgnoredByInputFocus = shouldIgnoreKeyEvent(e);
      const target = e.target as HTMLElement | null;
      const isNumericInputTarget = (
        target instanceof HTMLInputElement
        && (target.type === "number" || target.type === "range")
      );

      // Space for temporary hand tool
      if (e.code === SPECIAL_SHORTCUTS.temporaryHand && !e.repeat && (!isIgnoredByInputFocus || isNumericInputTarget)) {
        e.preventDefault();
        setIsSpacePressed(true);
      }

      if (isIgnoredByInputFocus) return;

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
        drawLayerWithOptionalAlphaMask(compositeCtx, editCanvas, layerPosX, layerPosY);

        // Copy selection to clipboard
        const selectionWidth = Math.max(1, Math.round(selection.width));
        const selectionHeight = Math.max(1, Math.round(selection.height));
        let imageData = compositeCtx.getImageData(
          Math.round(selection.x),
          Math.round(selection.y),
          selectionWidth,
          selectionHeight
        );
        imageData = applySelectionMaskToImageData(imageData, selection, selectionMask);
        imageData = applyFeatherToImageData(imageData, selectionFeather);
        (clipboardRef as { current: ImageData | null }).current = imageData;
        void writeImageDataToSystemClipboard(imageData);
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

    const handlePaste = (e: ClipboardEvent) => {
      if (isInteractiveTarget(e.target)) return;

      const clipboardData = e.clipboardData;
      if (!clipboardData) return;

      const imageItem = Array.from(clipboardData.items).find((item) => item.type.startsWith("image/"));
      if (imageItem) {
        const imageFile = imageItem.getAsFile();
        if (!imageFile) return;

        e.preventDefault();
        if (loadImageFile) {
          loadImageFile(imageFile);
          return;
        }
        if (!addImageLayer) return;

        const reader = new FileReader();
        reader.onload = () => {
          if (typeof reader.result === "string") {
            addImageLayer(reader.result, undefined, {
              preserveActiveLayerId: activeLayerId || null,
            });
          }
        };
        reader.readAsDataURL(imageFile);
        return;
      }

      if (clipboardRef.current) {
        e.preventDefault();
        pasteFromInternalClipboard();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === SPECIAL_SHORTCUTS.temporaryHand) {
        setIsSpacePressed(false);
      }
      if (!e.altKey) setIsAltPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("paste", handlePaste);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("paste", handlePaste);
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
    selectionMask,
    selectionFeather,
    setSelection,
    setSelectionMask,
    clearSelectionPixels,
    clipboardRef,
    floatingLayerRef,
    activeLayerId,
    isTransformActive,
    cancelTransform,
    editCanvasRef,
    getDisplayDimensions,
    loadImageFile,
    addImageLayer,
    saveToHistory,
    activeLayerPosition,
    isProjectListOpen,
    setIsProjectListOpen,
  ]);
}
