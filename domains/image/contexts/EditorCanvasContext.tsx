"use client";

import { createContext, useContext, ReactNode, RefObject } from "react";
import { UnifiedLayer, GuideOrientation } from "../types";

// ============================================
// Context Value Type
// ============================================

export interface EditorCanvasContextValue {
  // Refs
  containerRef: RefObject<HTMLDivElement | null>;
  canvasRefCallback: (canvas: HTMLCanvasElement | null) => void;

  // State (for conditional rendering)
  layers: UnifiedLayer[];

  // Event Handlers
  handleDrop: (e: React.DragEvent) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleMouseDown: (e: React.PointerEvent) => void;
  handleMouseMove: (e: React.PointerEvent) => void;
  handleMouseUp: (e: React.PointerEvent) => void;
  handleMouseLeave: (e: React.PointerEvent) => void;

  // Utilities
  getCursor: () => string;
  loadImageFile: (file: File) => void;
  loadImageFiles: (files: File[]) => void;

  // Guides
  displaySize: { width: number; height: number };
  onGuideCreate?: (orientation: GuideOrientation, position: number) => void;
  onGuideDragStateChange?: (dragState: { orientation: GuideOrientation; position: number } | null) => void;
}

// ============================================
// Context
// ============================================

const EditorCanvasContext = createContext<EditorCanvasContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface EditorCanvasProviderProps {
  children: ReactNode;
  value: EditorCanvasContextValue;
}

export function EditorCanvasProvider({ children, value }: EditorCanvasProviderProps) {
  return (
    <EditorCanvasContext.Provider value={value}>
      {children}
    </EditorCanvasContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useEditorCanvas(): EditorCanvasContextValue {
  const context = useContext(EditorCanvasContext);
  if (!context) {
    throw new Error("useEditorCanvas must be used within EditorCanvasProvider");
  }
  return context;
}
