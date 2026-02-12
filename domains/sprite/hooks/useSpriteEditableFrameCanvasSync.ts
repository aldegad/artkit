"use client";

import { useEffect, type MutableRefObject } from "react";
import type { SpriteFrame } from "../types";

interface UseSpriteEditableFrameCanvasSyncOptions {
  editableFrame: SpriteFrame | null;
  activeTrackId: string | null;
  editFrameCanvasRef: MutableRefObject<HTMLCanvasElement | null>;
  editFrameCtxRef: MutableRefObject<CanvasRenderingContext2D | null>;
  currentEditTrackIdRef: MutableRefObject<string | null>;
  currentEditFrameIdRef: MutableRefObject<number | null>;
  isEditFrameDirtyRef: MutableRefObject<boolean>;
  clearMagicWandSelection: () => void;
  invalidateAiSelectionCache: () => void;
  resetDabBufferCanvas: () => void;
  commitFrameEdits: () => void;
  requestRender: () => void;
}

export function useSpriteEditableFrameCanvasSync({
  editableFrame,
  activeTrackId,
  editFrameCanvasRef,
  editFrameCtxRef,
  currentEditTrackIdRef,
  currentEditFrameIdRef,
  isEditFrameDirtyRef,
  clearMagicWandSelection,
  invalidateAiSelectionCache,
  resetDabBufferCanvas,
  commitFrameEdits,
  requestRender,
}: UseSpriteEditableFrameCanvasSyncOptions): void {
  useEffect(() => {
    invalidateAiSelectionCache();

    const nextFrameId = editableFrame?.id ?? null;
    const nextTrackId = editableFrame ? activeTrackId : null;

    if (
      currentEditFrameIdRef.current !== null
      && (currentEditFrameIdRef.current !== nextFrameId || currentEditTrackIdRef.current !== nextTrackId)
    ) {
      commitFrameEdits();
    }

    if (!editableFrame?.imageData) {
      editFrameCanvasRef.current = null;
      editFrameCtxRef.current = null;
      currentEditTrackIdRef.current = null;
      currentEditFrameIdRef.current = null;
      isEditFrameDirtyRef.current = false;
      clearMagicWandSelection();
      requestRender();
      return;
    }

    clearMagicWandSelection();
    resetDabBufferCanvas();

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      const offscreen = document.createElement("canvas");
      offscreen.width = img.width;
      offscreen.height = img.height;
      const offscreenCtx = offscreen.getContext("2d");
      if (!offscreenCtx) return;

      offscreenCtx.clearRect(0, 0, offscreen.width, offscreen.height);
      offscreenCtx.drawImage(img, 0, 0);

      editFrameCanvasRef.current = offscreen;
      editFrameCtxRef.current = offscreenCtx;
      currentEditTrackIdRef.current = activeTrackId;
      currentEditFrameIdRef.current = editableFrame.id;
      isEditFrameDirtyRef.current = false;
      requestRender();
    };
    img.src = editableFrame.imageData;

    return () => {
      cancelled = true;
    };
  }, [
    editableFrame?.id,
    editableFrame?.imageData,
    activeTrackId,
    clearMagicWandSelection,
    commitFrameEdits,
    currentEditFrameIdRef,
    currentEditTrackIdRef,
    editFrameCanvasRef,
    editFrameCtxRef,
    invalidateAiSelectionCache,
    isEditFrameDirtyRef,
    requestRender,
    resetDabBufferCanvas,
  ]);
}
