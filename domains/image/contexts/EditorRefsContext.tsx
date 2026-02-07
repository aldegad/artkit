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
  // Canvas refs (shared across components)
  canvasRef: RefObject<HTMLCanvasElement | null>;
  containerRef: RefObject<HTMLDivElement | null>;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;

  // Image ref
  imageRef: RefObject<HTMLImageElement | null>;

  // File input
  fileInputRef: RefObject<HTMLInputElement | null>;

  // Note: The following refs are managed by specialized hooks:
  // - layerCanvasesRef: managed by useLayerManagement
  // - floatingLayerRef, dragStartOriginRef: managed by useSelectionTool
  // - historyRef, historyIndexRef: managed by useHistory
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
  // Canvas refs (shared across components)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const editCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Image ref
  const imageRef = useRef<HTMLImageElement | null>(null);

  // File input
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const value: EditorRefsContextValue = {
    canvasRef,
    containerRef,
    editCanvasRef,
    imageRef,
    fileInputRef,
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
