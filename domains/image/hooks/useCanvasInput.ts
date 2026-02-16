"use client";

import { useCallback, useRef, RefObject } from "react";
import { Point } from "../types";
import {
  screenToCanvas,
  canvasToImage,
  isInImageBounds,
  ViewContext,
} from "../utils/coordinateSystem";

// ============================================
// Types
// ============================================

export type InputType = "mouse" | "touch" | "pen";

export interface InputModifiers {
  alt: boolean;
  shift: boolean;
  ctrl: boolean;
  meta: boolean;
}

export interface CanvasInputEvent {
  /** Event type */
  type: "start" | "move" | "end";
  /** Position in screen coordinates */
  screenPosition: Point;
  /** Position in image coordinates (after zoom/pan transform) */
  imagePosition: Point;
  /** Whether the position is within image bounds */
  inBounds: boolean;
  /** Input device type */
  inputType: InputType;
  /** Pressure for pen/touch (0-1, 1 for mouse) */
  pressure: number;
  /** Pen tilt angles (degrees, 0 for mouse/touch) */
  tilt: { x: number; y: number };
  /** Keyboard modifiers */
  modifiers: InputModifiers;
  /** Original event for advanced use cases */
  originalEvent: PointerEvent | MouseEvent | React.MouseEvent;
}

export interface UseCanvasInputOptions {
  /** Canvas ref for coordinate calculation */
  canvasRef: RefObject<HTMLCanvasElement | null>;
  /** Current zoom level */
  zoom: number;
  /** Current pan offset */
  pan: Point;
  /** Function to get display dimensions */
  getDisplayDimensions: () => { width: number; height: number };
}

export interface UseCanvasInputReturn {
  /** Get mouse position from event */
  getMousePos: (e: React.MouseEvent | PointerEvent) => Point;
  /** Convert screen coordinates to image coordinates */
  screenToImage: (screenX: number, screenY: number) => Point;
  /** Create normalized input event from mouse event */
  createInputEvent: (
    e: React.MouseEvent | PointerEvent,
    type: "start" | "move" | "end"
  ) => CanvasInputEvent;
  /** Event handlers to attach to canvas */
  handlers: {
    onPointerDown: (e: React.PointerEvent) => CanvasInputEvent;
    onPointerMove: (e: React.PointerEvent) => CanvasInputEvent;
    onPointerUp: (e: React.PointerEvent) => CanvasInputEvent;
    onPointerLeave: (e: React.PointerEvent) => CanvasInputEvent;
  };
}

// ============================================
// Hook Implementation
// ============================================

export function useCanvasInput(options: UseCanvasInputOptions): UseCanvasInputReturn {
  const { canvasRef, zoom, pan, getDisplayDimensions } = options;

  // Refs for zoom and pan to avoid stale closures in event handlers
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  zoomRef.current = zoom;
  panRef.current = pan;

  // Get mouse position relative to canvas (with high-DPI scaling)
  const getMousePos = useCallback(
    (e: React.MouseEvent | PointerEvent): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return screenToCanvas(
        { x: e.clientX, y: e.clientY },
        rect,
        { width: rect.width, height: rect.height }
      );
    },
    [canvasRef]
  );

  // Convert screen coordinates to image coordinates
  const screenToImageFn = useCallback(
    (screenX: number, screenY: number): Point => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();

      const displaySize = getDisplayDimensions();
      const viewContext: ViewContext = {
        canvasSize: { width: rect.width, height: rect.height },
        displaySize,
        zoom: zoomRef.current,
        pan: panRef.current,
      };

      return canvasToImage({ x: screenX, y: screenY }, viewContext);
    },
    [canvasRef, getDisplayDimensions]
  );

  // Create normalized input event
  const createInputEvent = useCallback(
    (
      e: React.MouseEvent | PointerEvent | React.PointerEvent,
      type: "start" | "move" | "end"
    ): CanvasInputEvent => {
      const screenPosition = getMousePos(e as React.MouseEvent);
      const imagePosition = screenToImageFn(screenPosition.x, screenPosition.y);
      const displaySize = getDisplayDimensions();

      // Check bounds using utility
      const inBounds = isInImageBounds(imagePosition, displaySize);

      // Determine input type
      let inputType: InputType = "mouse";
      let pressure = 1;
      let tilt = { x: 0, y: 0 };

      if ("pointerType" in e) {
        const pointerEvent = e as PointerEvent;
        inputType = pointerEvent.pointerType as InputType;
        pressure = pointerEvent.pressure || 1;
        tilt = {
          x: pointerEvent.tiltX || 0,
          y: pointerEvent.tiltY || 0,
        };
      }

      return {
        type,
        screenPosition,
        imagePosition,
        inBounds,
        inputType,
        pressure,
        tilt,
        modifiers: {
          alt: e.altKey,
          shift: e.shiftKey,
          ctrl: e.ctrlKey,
          meta: e.metaKey,
        },
        originalEvent: e as PointerEvent | MouseEvent,
      };
    },
    [getMousePos, screenToImageFn, getDisplayDimensions]
  );

  // Event handlers
  const handlers = {
    onPointerDown: useCallback(
      (e: React.PointerEvent): CanvasInputEvent => {
        return createInputEvent(e, "start");
      },
      [createInputEvent]
    ),
    onPointerMove: useCallback(
      (e: React.PointerEvent): CanvasInputEvent => {
        return createInputEvent(e, "move");
      },
      [createInputEvent]
    ),
    onPointerUp: useCallback(
      (e: React.PointerEvent): CanvasInputEvent => {
        return createInputEvent(e, "end");
      },
      [createInputEvent]
    ),
    onPointerLeave: useCallback(
      (e: React.PointerEvent): CanvasInputEvent => {
        return createInputEvent(e, "end");
      },
      [createInputEvent]
    ),
  };

  return {
    getMousePos,
    screenToImage: screenToImageFn,
    createInputEvent,
    handlers,
  };
}
