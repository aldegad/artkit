"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  useRef,
} from "react";
import {
  LayoutState,
  SplitNode,
  PanelNode,
  FloatingWindow,
  DropTarget,
  ResizeState,
  findNode,
  updateNodeSizes,
  addPanelToLayout,
  removePanelFromLayout,
  generateId,
  isSplitNode,
} from "../../../types/layout";

// ============================================
// Default Layout for Image Editor
// ============================================

const EDITOR_DEFAULT_LAYOUT: SplitNode = {
  type: "split",
  id: "root",
  direction: "horizontal",
  children: [
    { type: "panel", id: "canvas-panel", panelId: "canvas", minSize: 300 } as PanelNode,
    { type: "panel", id: "layers-panel", panelId: "layers", minSize: 200 } as PanelNode,
  ],
  sizes: [75, 25],
};

// ============================================
// Context Interface
// ============================================

interface EditorLayoutContextValue {
  layoutState: LayoutState;
  updateSizes: (splitId: string, newSizes: number[]) => void;
  addPanel: (targetPanelId: string, panelId: string, position: "left" | "right" | "top" | "bottom") => void;
  removePanel: (panelId: string) => void;
  openFloatingWindow: (panelId: string, position?: { x: number; y: number }) => void;
  closeFloatingWindow: (windowId: string) => void;
  updateFloatingWindowPosition: (windowId: string, position: { x: number; y: number }) => void;
  updateFloatingWindowSize: (windowId: string, size: { width: number; height: number }) => void;
  minimizeFloatingWindow: (windowId: string) => void;
  dockWindow: (windowId: string, targetPanelId: string, position: "left" | "right" | "top" | "bottom") => void;
  undockPanel: (panelNodeId: string) => void;
  startDragging: (windowId: string) => void;
  updateDropTarget: (target: DropTarget | null) => void;
  endDragging: () => void;
  startResize: (state: ResizeState) => void;
  updateResize: (delta: number) => void;
  endResize: () => void;
  resizeState: ResizeState | null;
  getNode: (nodeId: string) => SplitNode | PanelNode | null;
  isPanelOpen: (panelId: string) => boolean;
}

// ============================================
// Context
// ============================================

const EditorLayoutContext = createContext<EditorLayoutContextValue | null>(null);

const STORAGE_KEY = "image-editor-layout";

// ============================================
// Provider
// ============================================

interface EditorLayoutProviderProps {
  children: ReactNode;
}

export function EditorLayoutProvider({ children }: EditorLayoutProviderProps) {
  const [layoutState, setLayoutState] = useState<LayoutState>({
    root: EDITOR_DEFAULT_LAYOUT,
    floatingWindows: [],
    activePanelId: null,
    isDragging: false,
    draggedWindowId: null,
    dropTarget: null,
  });

  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Load layout from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setLayoutState((prev) => ({
          ...prev,
          root: parsed.root || EDITOR_DEFAULT_LAYOUT,
          floatingWindows: parsed.floatingWindows || [],
        }));
      } catch (e) {
        console.error("Failed to load editor layout:", e);
      }
    }
  }, []);

  // Save layout to localStorage when it changes
  useEffect(() => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        root: layoutState.root,
        floatingWindows: layoutState.floatingWindows,
      }),
    );
  }, [layoutState.root, layoutState.floatingWindows]);

  // Layout Operations
  const updateSizes = useCallback((splitId: string, newSizes: number[]) => {
    setLayoutState((prev) => ({
      ...prev,
      root: updateNodeSizes(prev.root, splitId, newSizes),
    }));
  }, []);

  const addPanel = useCallback(
    (targetPanelId: string, panelId: string, position: "left" | "right" | "top" | "bottom") => {
      setLayoutState((prev) => ({
        ...prev,
        root: addPanelToLayout(prev.root, targetPanelId, generateId(), panelId, position),
      }));
    },
    [],
  );

  const removePanel = useCallback((panelNodeId: string) => {
    setLayoutState((prev) => ({
      ...prev,
      root: removePanelFromLayout(prev.root, panelNodeId),
    }));
  }, []);

  // Floating Window Operations
  const openFloatingWindow = useCallback((panelId: string, position?: { x: number; y: number }) => {
    setLayoutState((prev) => {
      if (prev.floatingWindows.some((w) => w.panelId === panelId)) {
        return prev;
      }

      const newWindow: FloatingWindow = {
        id: generateId(),
        panelId,
        position: position || { x: 100 + Math.random() * 100, y: 100 + Math.random() * 100 },
        size: { width: 300, height: 400 },
        isMinimized: false,
      };

      return {
        ...prev,
        floatingWindows: [...prev.floatingWindows, newWindow],
      };
    });
  }, []);

  const closeFloatingWindow = useCallback((windowId: string) => {
    setLayoutState((prev) => ({
      ...prev,
      floatingWindows: prev.floatingWindows.filter((w) => w.id !== windowId),
    }));
  }, []);

  const updateFloatingWindowPosition = useCallback(
    (windowId: string, position: { x: number; y: number }) => {
      setLayoutState((prev) => ({
        ...prev,
        floatingWindows: prev.floatingWindows.map((w) =>
          w.id === windowId ? { ...w, position } : w,
        ),
      }));
    },
    [],
  );

  const updateFloatingWindowSize = useCallback(
    (windowId: string, size: { width: number; height: number }) => {
      setLayoutState((prev) => ({
        ...prev,
        floatingWindows: prev.floatingWindows.map((w) => (w.id === windowId ? { ...w, size } : w)),
      }));
    },
    [],
  );

  const minimizeFloatingWindow = useCallback((windowId: string) => {
    setLayoutState((prev) => ({
      ...prev,
      floatingWindows: prev.floatingWindows.map((w) =>
        w.id === windowId ? { ...w, isMinimized: !w.isMinimized } : w,
      ),
    }));
  }, []);

  // Docking Operations
  const dockWindow = useCallback(
    (windowId: string, targetPanelId: string, position: "left" | "right" | "top" | "bottom") => {
      setLayoutState((prev) => {
        const window = prev.floatingWindows.find((w) => w.id === windowId);
        if (!window) return prev;

        const newFloatingWindows = prev.floatingWindows.filter((w) => w.id !== windowId);
        const newRoot = addPanelToLayout(
          prev.root,
          targetPanelId,
          generateId(),
          window.panelId,
          position,
        );

        return {
          ...prev,
          root: newRoot,
          floatingWindows: newFloatingWindows,
          isDragging: false,
          draggedWindowId: null,
          dropTarget: null,
        };
      });
    },
    [],
  );

  const undockPanel = useCallback((panelNodeId: string) => {
    setLayoutState((prev) => {
      const node = findNode(prev.root, panelNodeId);
      if (!node || isSplitNode(node)) return prev;

      const panelNode = node as PanelNode;
      const newWindow: FloatingWindow = {
        id: generateId(),
        panelId: panelNode.panelId,
        position: { x: 200, y: 150 },
        size: { width: 300, height: 400 },
        isMinimized: false,
      };

      const newRoot = removePanelFromLayout(prev.root, panelNodeId);

      return {
        ...prev,
        root: newRoot,
        floatingWindows: [...prev.floatingWindows, newWindow],
      };
    });
  }, []);

  // Drag Operations
  const startDragging = useCallback((windowId: string) => {
    setLayoutState((prev) => ({
      ...prev,
      isDragging: true,
      draggedWindowId: windowId,
    }));
  }, []);

  const updateDropTarget = useCallback((target: DropTarget | null) => {
    setLayoutState((prev) => ({
      ...prev,
      dropTarget: target,
    }));
  }, []);

  const endDragging = useCallback(() => {
    setLayoutState((prev) => ({
      ...prev,
      isDragging: false,
      draggedWindowId: null,
      dropTarget: null,
    }));
  }, []);

  // Resize Operations
  const startResize = useCallback((state: ResizeState) => {
    setResizeState(state);
  }, []);

  const updateResize = useCallback(
    (delta: number) => {
      if (!resizeState) return;

      const { splitId, handleIndex, direction } = resizeState;
      const node = findNode(layoutState.root, splitId);
      if (!node || !isSplitNode(node)) return;

      const splitNode = node as SplitNode;
      const sizes = [...splitNode.sizes];
      const total = sizes.reduce((a, b) => a + b, 0);

      const containerSize =
        direction === "horizontal"
          ? containerRef.current?.clientWidth || 1000
          : containerRef.current?.clientHeight || 600;

      const deltaRatio = (delta / containerSize) * total;

      const minRatio = (10 / total) * 100;
      let newSizeA = sizes[handleIndex] + deltaRatio;
      let newSizeB = sizes[handleIndex + 1] - deltaRatio;

      if (newSizeA < minRatio) {
        newSizeA = minRatio;
        newSizeB = sizes[handleIndex] + sizes[handleIndex + 1] - minRatio;
      }
      if (newSizeB < minRatio) {
        newSizeB = minRatio;
        newSizeA = sizes[handleIndex] + sizes[handleIndex + 1] - minRatio;
      }

      sizes[handleIndex] = newSizeA;
      sizes[handleIndex + 1] = newSizeB;

      updateSizes(splitId, sizes);
    },
    [resizeState, layoutState.root, updateSizes],
  );

  const endResize = useCallback(() => {
    setResizeState(null);
  }, []);

  // Utilities
  const getNode = useCallback(
    (nodeId: string) => {
      return findNode(layoutState.root, nodeId) as SplitNode | PanelNode | null;
    },
    [layoutState.root],
  );

  const isPanelOpen = useCallback(
    (panelId: string) => {
      if (layoutState.floatingWindows.some((w) => w.panelId === panelId)) {
        return true;
      }

      const checkNode = (node: SplitNode | PanelNode): boolean => {
        if (!isSplitNode(node)) {
          return (node as PanelNode).panelId === panelId;
        }
        return (node as SplitNode).children.some((child) =>
          checkNode(child as SplitNode | PanelNode),
        );
      };

      return checkNode(layoutState.root);
    },
    [layoutState],
  );

  const value: EditorLayoutContextValue = {
    layoutState,
    updateSizes,
    addPanel,
    removePanel,
    openFloatingWindow,
    closeFloatingWindow,
    updateFloatingWindowPosition,
    updateFloatingWindowSize,
    minimizeFloatingWindow,
    dockWindow,
    undockPanel,
    startDragging,
    updateDropTarget,
    endDragging,
    startResize,
    updateResize,
    endResize,
    resizeState,
    getNode,
    isPanelOpen,
  };

  return (
    <EditorLayoutContext.Provider value={value}>
      <div ref={containerRef} className="flex-1 h-full w-full min-h-0">
        {children}
      </div>
    </EditorLayoutContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useEditorLayout() {
  const context = useContext(EditorLayoutContext);
  if (!context) {
    throw new Error("useEditorLayout must be used within an EditorLayoutProvider");
  }
  return context;
}
