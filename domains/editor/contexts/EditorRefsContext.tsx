"use client";

import {
  createContext,
  useContext,
  useRef,
  ReactNode,
  RefObject,
} from "react";

// ============================================
// Refs Type
// ============================================

export interface EditorRefsContextValue {
  // Canvas refs
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;

  // Image ref
  imageRef: RefObject<HTMLImageElement | null>;

  // Layer canvases
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;

  // File input
  fileInputRef: RefObject<HTMLInputElement | null>;

  // Floating layer (for selection move/duplicate)
  floatingLayerRef: RefObject<{
    imageData: ImageData;
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>;

  // Drag origin for selection
  dragStartOriginRef: RefObject<{ x: number; y: number } | null>;

  // History refs
  historyRef: RefObject<ImageData[]>;
  historyIndexRef: RefObject<number>;
}

// ============================================
// Context
// ============================================

const EditorRefsContext = createContext<EditorRefsContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface EditorRefsProviderProps {
  children: ReactNode;
}

export function EditorRefsProvider({ children }: EditorRefsProviderProps) {
  // Canvas refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Image ref
  const imageRef = useRef<HTMLImageElement | null>(null);

  // Layer canvases
  const layerCanvasesRef = useRef<Map<string, HTMLCanvasElement>>(new Map());

  // File input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Floating layer
  const floatingLayerRef = useRef<{
    imageData: ImageData;
    x: number;
    y: number;
    originX: number;
    originY: number;
  } | null>(null);

  // Drag origin
  const dragStartOriginRef = useRef<{ x: number; y: number } | null>(null);

  // History refs
  const historyRef = useRef<ImageData[]>([]);
  const historyIndexRef = useRef<number>(-1);

  const value: EditorRefsContextValue = {
    canvasRef,
    containerRef,
    editCanvasRef,
    imageRef,
    layerCanvasesRef,
    fileInputRef,
    floatingLayerRef,
    dragStartOriginRef,
    historyRef,
    historyIndexRef,
  };

  return (
    <EditorRefsContext.Provider value={value}>
      {children}
    </EditorRefsContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useEditorRefs(): EditorRefsContextValue {
  const context = useContext(EditorRefsContext);
  if (!context) {
    throw new Error("useEditorRefs must be used within EditorRefsProvider");
  }
  return context;
}
