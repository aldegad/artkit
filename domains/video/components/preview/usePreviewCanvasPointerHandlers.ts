"use client";

import { useCallback } from "react";
import { safeReleasePointerCapture } from "@/shared/utils";

interface UsePreviewCanvasPointerHandlersParams {
  isPanningRef: React.MutableRefObject<boolean>;
  previewContainerRef: React.RefObject<HTMLDivElement | null>;
  isEditingMask: boolean;
  isInpaintMode: boolean;
  isPanLocked: boolean;
  isSpacePanning: boolean;
  toolMode: string;
  activeTrackId: string | null;
  startPanDragFromPointer: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  zoomAtClientPoint: (clientX: number, clientY: number, zoomOut?: boolean) => void;
  updatePanDrag: (point: { x: number; y: number }) => void;
  preventAndCapturePointer: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handleInpaintPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleInpaintPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleMaskPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleMaskPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleMaskPointerUp: () => void;
  handleCropPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleCropPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleCropPointerUp: () => void;
  handleClipPointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
  handleClipPointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  handleClipPointerUp: () => void;
  transformTool: {
    handlePointerDown: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
    handlePointerMove: (e: React.PointerEvent<HTMLCanvasElement>) => boolean;
    handlePointerUp: () => void;
  };
  stopPanDrag: () => void;
  stopInpaintStroke: () => void;
  scheduleRender: () => void;
  setBrushCursor: React.Dispatch<React.SetStateAction<{ x: number; y: number } | null>>;
}

export function usePreviewCanvasPointerHandlers(params: UsePreviewCanvasPointerHandlersParams) {
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.focus();

    if (e.button === 1) return params.startPanDragFromPointer(e);
    if (params.isPanLocked && e.pointerType === "touch" && e.button === 0) return params.startPanDragFromPointer(e);
    if (params.toolMode === "zoom" && e.button === 0) {
      e.preventDefault();
      return params.zoomAtClientPoint(e.clientX, e.clientY, e.altKey);
    }
    if ((params.toolMode === "hand" || params.isSpacePanning) && e.button === 0) return params.startPanDragFromPointer(e);
    if (params.handleInpaintPointerDown(e)) return params.preventAndCapturePointer(e);

    if (params.isEditingMask && params.activeTrackId) {
      if (params.handleMaskPointerDown(e)) params.preventAndCapturePointer(e);
      return;
    }
    if (params.handleCropPointerDown(e)) return params.preventAndCapturePointer(e);
    if (params.toolMode === "transform") {
      if (params.transformTool.handlePointerDown(e)) params.preventAndCapturePointer(e);
      return;
    }
    if (params.handleClipPointerDown(e)) params.preventAndCapturePointer(e);
  }, [params]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    if (params.isPanningRef.current) {
      params.updatePanDrag({ x: e.clientX, y: e.clientY });
      return;
    }

    if (params.isEditingMask || params.isInpaintMode) {
      const container = params.previewContainerRef.current;
      if (container) {
        const rect = container.getBoundingClientRect();
        params.setBrushCursor({ x: e.clientX - rect.left, y: e.clientY - rect.top });
      }
    }

    if (params.handleInpaintPointerMove(e) || params.handleMaskPointerMove(e)) return;
    if (params.toolMode === "transform") {
      if (params.transformTool.handlePointerMove(e)) params.scheduleRender();
      return;
    }
    if (params.handleCropPointerMove(e)) return;
    params.handleClipPointerMove(e);
  }, [params]);

  const handlePointerUp = useCallback((e?: React.PointerEvent<HTMLCanvasElement>) => {
    params.stopPanDrag();
    params.stopInpaintStroke();
    params.handleMaskPointerUp();
    if (e) safeReleasePointerCapture(e.currentTarget, e.pointerId);
    params.transformTool.handlePointerUp();
    params.handleClipPointerUp();
    params.handleCropPointerUp();
  }, [params]);

  return { handlePointerDown, handlePointerMove, handlePointerUp };
}
