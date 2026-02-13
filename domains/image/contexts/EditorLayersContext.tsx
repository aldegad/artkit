"use client";

import {
  createContext,
  useContext,
  ReactNode,
  RefObject,
} from "react";
import { UnifiedLayer } from "../types";

// ============================================
// Context Value Type (mirrors UseLayerManagementReturn)
// ============================================

export interface EditorLayersContextValue {
  // State
  layers: UnifiedLayer[];
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  activeLayerId: string | null;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  // Multi-select state
  selectedLayerIds: string[];
  setSelectedLayerIds: React.Dispatch<React.SetStateAction<string[]>>;
  // Drag state for layer panel reordering
  draggedLayerId: string | null;
  setDraggedLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  dragOverLayerId: string | null;
  setDragOverLayerId: React.Dispatch<React.SetStateAction<string | null>>;

  // Refs
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;

  // Actions
  addPaintLayer: () => void;
  addFilterLayer: () => void;
  addImageLayer: (imageSrc: string, name?: string) => void;
  deleteLayer: (layerId: string) => void;
  selectLayer: (layerId: string) => void;
  toggleLayerVisibility: (layerId: string) => void;
  updateLayer: (layerId: string, updates: Partial<UnifiedLayer>) => void;
  updateLayerOpacity: (layerId: string, opacity: number) => void;
  updateLayerPosition: (layerId: string, position: { x: number; y: number }) => void;
  updateMultipleLayerPositions: (updates: Array<{ layerId: string; position: { x: number; y: number } }>) => void;
  renameLayer: (layerId: string, name: string) => void;
  toggleLayerLock: (layerId: string) => void;
  moveLayer: (layerId: string, direction: "up" | "down") => void;
  reorderLayers: (fromId: string, toId: string) => void;
  mergeLayerDown: (layerId: string) => void;
  duplicateLayer: (layerId: string) => void;
  rotateAllLayerCanvases: (degrees: number) => void;

  // Multi-select actions
  selectLayerWithModifier: (layerId: string, shiftKey: boolean) => void;
  clearLayerSelection: () => void;

  // Alignment actions
  alignLayers: (
    alignment: "left" | "center" | "right" | "top" | "middle" | "bottom",
    bounds?: { x: number; y: number; width: number; height: number }
  ) => void;
  distributeLayers: (
    direction: "horizontal" | "vertical",
    bounds?: { x: number; y: number; width: number; height: number }
  ) => void;

  // Initialization
  initLayers: (width: number, height: number, existingLayers?: UnifiedLayer[]) => Promise<void>;

  // Legacy alias
  addLayer: () => void;
}

// ============================================
// Context
// ============================================

const EditorLayersContext = createContext<EditorLayersContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface EditorLayersProviderProps {
  children: ReactNode;
  value: EditorLayersContextValue;
}

export function EditorLayersProvider({ children, value }: EditorLayersProviderProps) {
  return (
    <EditorLayersContext.Provider value={value}>
      {children}
    </EditorLayersContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useEditorLayers(): EditorLayersContextValue {
  const context = useContext(EditorLayersContext);
  if (!context) {
    throw new Error("useEditorLayers must be used within EditorLayersProvider");
  }
  return context;
}
