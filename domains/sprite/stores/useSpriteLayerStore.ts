import { create } from "zustand";
import { UnifiedLayer } from "../types";
import { generateLayerId } from "../utils/frameUtils";

// ============================================
// Types
// ============================================

interface SpriteLayerStore {
  // State
  compositionLayers: UnifiedLayer[];
  activeLayerId: string | null;

  // Actions
  setCompositionLayers: (layers: UnifiedLayer[] | ((prev: UnifiedLayer[]) => UnifiedLayer[])) => void;
  setActiveLayerId: (id: string | null) => void;

  // Layer CRUD
  addCompositionLayer: (paintData: string, name?: string) => void;
  removeCompositionLayer: (id: string) => void;
  updateCompositionLayer: (id: string, updates: Partial<UnifiedLayer>) => void;
  reorderCompositionLayers: (fromIndex: number, toIndex: number) => void;
  duplicateCompositionLayer: (id: string) => void;

  // Reset
  reset: () => void;
}

// ============================================
// Store
// ============================================

export const useSpriteLayerStore = create<SpriteLayerStore>((set) => ({
  // Initial State
  compositionLayers: [],
  activeLayerId: null,

  // Basic Actions
  setCompositionLayers: (layersOrFn) =>
    set((state) => {
      const newLayers = typeof layersOrFn === "function" ? layersOrFn(state.compositionLayers) : layersOrFn;
      // Auto-select first layer if activeLayerId becomes invalid
      let activeLayerId = state.activeLayerId;
      if (activeLayerId === null && newLayers.length > 0) {
        activeLayerId = newLayers[0].id;
      } else if (activeLayerId !== null && !newLayers.some((l) => l.id === activeLayerId)) {
        activeLayerId = newLayers.length > 0 ? newLayers[0].id : null;
      }
      return { compositionLayers: newLayers, activeLayerId };
    }),

  setActiveLayerId: (id) => set({ activeLayerId: id }),

  // Add Layer
  addCompositionLayer: (paintData, name) => {
    const img = new Image();
    img.onload = () => {
      const newLayerId = generateLayerId();
      set((state) => {
        const newLayer: UnifiedLayer = {
          id: newLayerId,
          name: name || `Layer ${state.compositionLayers.length + 1}`,
          type: "paint",
          paintData,
          visible: true,
          locked: false,
          opacity: 100,
          position: { x: 0, y: 0 },
          scale: 1,
          rotation: 0,
          zIndex: state.compositionLayers.length,
          originalSize: { width: img.width, height: img.height },
        };
        return {
          compositionLayers: [...state.compositionLayers, newLayer],
          activeLayerId: newLayerId,
        };
      });
    };
    img.src = paintData;
  },

  // Remove Layer
  removeCompositionLayer: (id) =>
    set((state) => {
      const newLayers = state.compositionLayers
        .filter((layer) => layer.id !== id)
        .map((layer, index) => ({ ...layer, zIndex: index }));

      // Select another layer if needed
      let activeLayerId = state.activeLayerId;
      if (activeLayerId === id) {
        activeLayerId = newLayers.length > 0 ? newLayers[0].id : null;
      }

      return { compositionLayers: newLayers, activeLayerId };
    }),

  // Update Layer
  updateCompositionLayer: (id, updates) =>
    set((state) => ({
      compositionLayers: state.compositionLayers.map((layer) =>
        layer.id === id ? { ...layer, ...updates } : layer
      ),
    })),

  // Reorder Layers
  reorderCompositionLayers: (fromIndex, toIndex) =>
    set((state) => {
      const newLayers = [...state.compositionLayers];
      const [removed] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, removed);
      return {
        compositionLayers: newLayers.map((layer, index) => ({ ...layer, zIndex: index })),
      };
    }),

  // Duplicate Layer
  duplicateCompositionLayer: (id) =>
    set((state) => {
      const layer = state.compositionLayers.find((l) => l.id === id);
      if (!layer) return state;

      const newLayerId = generateLayerId();
      const pos = layer.position ?? { x: 0, y: 0 };
      const newLayer: UnifiedLayer = {
        ...layer,
        id: newLayerId,
        name: `${layer.name} (copy)`,
        position: { x: pos.x + 20, y: pos.y + 20 },
        zIndex: state.compositionLayers.length,
      };

      return {
        compositionLayers: [...state.compositionLayers, newLayer],
        activeLayerId: newLayerId,
      };
    }),

  // Reset
  reset: () =>
    set({
      compositionLayers: [],
      activeLayerId: null,
    }),
}));
