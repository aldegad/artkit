"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  ReactNode,
  useRef,
  RefObject,
} from "react";
import {
  LayoutState,
  SplitNode,
  PanelNode,
  FloatingWindow,
  DropTarget,
  ResizeState,
  SnapInfo,
  findNode,
  updateNodeSizes,
  addPanelToLayout,
  removePanelFromLayout,
  generateId,
  isSplitNode,
} from "@/shared/types/layout";
import { LayoutConfiguration, LayoutContextValue } from "./types";
import { LayoutConfigProvider } from "./LayoutConfigContext";

// ============================================
// Layout Context Factory
// ============================================

interface CreateLayoutContextResult {
  Provider: React.FC<{ children: ReactNode }>;
  useLayoutContext: () => LayoutContextValue;
}

export function createLayoutContext(config: LayoutConfiguration): CreateLayoutContextResult {
  const {
    storageKey,
    defaultLayout,
    defaultFloatingWindowSize = { width: 300, height: 400 },
    containerClassName = "flex-1 h-full w-full min-h-0",
  } = config;

  // Create a React context for this layout instance
  const LayoutInstanceContext = createContext<LayoutContextValue | null>(null);

  function useLayoutContext(): LayoutContextValue {
    const context = useContext(LayoutInstanceContext);
    if (!context) {
      throw new Error("useLayoutContext must be used within its Provider");
    }
    return context;
  }

  function Provider({ children }: { children: ReactNode }) {
    const [layoutState, setLayoutState] = useState<LayoutState>({
      root: defaultLayout,
      floatingWindows: [],
      activePanelId: null,
      isDragging: false,
      draggedWindowId: null,
      dropTarget: null,
    });

    const [resizeState, setResizeState] = useState<ResizeState | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const panelRefsRef = useRef<Map<string, RefObject<HTMLDivElement | null>>>(new Map());

    // Load layout from localStorage on mount
    useEffect(() => {
      const stored = localStorage.getItem(storageKey);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setLayoutState((prev) => ({
            ...prev,
            root: parsed.root || defaultLayout,
            floatingWindows: parsed.floatingWindows || [],
          }));
        } catch (e) {
          console.error("Failed to load layout:", e);
        }
      }
    }, []);

    // Save layout to localStorage when it changes
    useEffect(() => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          root: layoutState.root,
          floatingWindows: layoutState.floatingWindows,
        })
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
      []
    );

    const removePanel = useCallback((panelNodeId: string) => {
      setLayoutState((prev) => ({
        ...prev,
        root: removePanelFromLayout(prev.root, panelNodeId),
      }));
    }, []);

    // Floating Window Operations
    const openFloatingWindow = useCallback(
      (panelId: string, position?: { x: number; y: number }) => {
        setLayoutState((prev) => {
          if (prev.floatingWindows.some((w) => w.panelId === panelId)) {
            return prev;
          }

          const newWindow: FloatingWindow = {
            id: generateId(),
            panelId,
            position: position || { x: 100 + Math.random() * 100, y: 100 + Math.random() * 100 },
            size: defaultFloatingWindowSize,
            isMinimized: false,
          };

          return {
            ...prev,
            floatingWindows: [...prev.floatingWindows, newWindow],
          };
        });
      },
      [defaultFloatingWindowSize]
    );

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
            w.id === windowId ? { ...w, position } : w
          ),
        }));
      },
      []
    );

    const updateFloatingWindowSize = useCallback(
      (windowId: string, size: { width: number; height: number }) => {
        setLayoutState((prev) => ({
          ...prev,
          floatingWindows: prev.floatingWindows.map((w) =>
            w.id === windowId ? { ...w, size } : w
          ),
        }));
      },
      []
    );

    const minimizeFloatingWindow = useCallback((windowId: string) => {
      setLayoutState((prev) => ({
        ...prev,
        floatingWindows: prev.floatingWindows.map((w) =>
          w.id === windowId ? { ...w, isMinimized: !w.isMinimized } : w
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
            position
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
      []
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
          size: defaultFloatingWindowSize,
          isMinimized: false,
        };

        const newRoot = removePanelFromLayout(prev.root, panelNodeId);

        return {
          ...prev,
          root: newRoot,
          floatingWindows: [...prev.floatingWindows, newWindow],
        };
      });
    }, [defaultFloatingWindowSize]);

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
      // Store original sizes and container size at drag start for absolute delta calculation
      const node = findNode(layoutState.root, state.splitId);
      // Use actualContainerSize from ResizeHandle if provided (more accurate),
      // otherwise fall back to containerRef
      const containerSize = state.actualContainerSize ||
        (state.direction === "horizontal"
          ? containerRef.current?.clientWidth || 1000
          : containerRef.current?.clientHeight || 600);

      if (node && isSplitNode(node)) {
        const splitNode = node as SplitNode;
        setResizeState({
          ...state,
          originalSizes: [...splitNode.sizes],
          originalContainerSize: containerSize,
        });
      } else {
        setResizeState({
          ...state,
          originalContainerSize: containerSize,
        });
      }
    }, [layoutState.root]);

    // Legacy incremental delta update (kept for backward compatibility)
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
      [resizeState, layoutState.root, updateSizes]
    );

    // Absolute delta update (uses total delta from drag start, more stable)
    const updateResizeAbsolute = useCallback(
      (totalDelta: number) => {
        if (!resizeState || !resizeState.originalSizes || !resizeState.originalContainerSize) return;

        const { splitId, handleIndex, originalSizes, originalContainerSize } = resizeState;
        const total = originalSizes.reduce((a, b) => a + b, 0);

        // Use the container size from drag start (stable throughout drag)
        const deltaRatio = (totalDelta / originalContainerSize) * total;

        const minRatio = (10 / total) * 100;
        // Use original sizes, not current sizes
        let newSizeA = originalSizes[handleIndex] + deltaRatio;
        let newSizeB = originalSizes[handleIndex + 1] - deltaRatio;

        if (newSizeA < minRatio) {
          newSizeA = minRatio;
          newSizeB = originalSizes[handleIndex] + originalSizes[handleIndex + 1] - minRatio;
        }
        if (newSizeB < minRatio) {
          newSizeB = minRatio;
          newSizeA = originalSizes[handleIndex] + originalSizes[handleIndex + 1] - minRatio;
        }

        const sizes = [...originalSizes];
        sizes[handleIndex] = newSizeA;
        sizes[handleIndex + 1] = newSizeB;

        updateSizes(splitId, sizes);
      },
      [resizeState, updateSizes]
    );

    const endResize = useCallback(() => {
      setResizeState(null);
    }, []);

    // Utilities
    const getNode = useCallback(
      (nodeId: string) => {
        return findNode(layoutState.root, nodeId) as SplitNode | PanelNode | null;
      },
      [layoutState.root]
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
            checkNode(child as SplitNode | PanelNode)
          );
        };

        return checkNode(layoutState.root);
      },
      [layoutState]
    );

    // Panel Ref Registry
    const registerPanelRef = useCallback(
      (panelId: string, ref: RefObject<HTMLDivElement | null>) => {
        panelRefsRef.current.set(panelId, ref);
      },
      []
    );

    const unregisterPanelRef = useCallback((panelId: string) => {
      panelRefsRef.current.delete(panelId);
    }, []);

    const getPanelRect = useCallback((panelId: string): DOMRect | null => {
      const ref = panelRefsRef.current.get(panelId);
      if (ref?.current) {
        return ref.current.getBoundingClientRect();
      }
      return null;
    }, []);

    const getAllPanelRects = useCallback((): Map<string, DOMRect> => {
      const rects = new Map<string, DOMRect>();
      panelRefsRef.current.forEach((ref, panelId) => {
        if (ref.current) {
          rects.set(panelId, ref.current.getBoundingClientRect());
        }
      });
      return rects;
    }, []);

    // Snap Info Updates
    const updateFloatingWindowSnap = useCallback(
      (windowId: string, snapInfo: SnapInfo | undefined) => {
        setLayoutState((prev) => ({
          ...prev,
          floatingWindows: prev.floatingWindows.map((w) =>
            w.id === windowId ? { ...w, snappedTo: snapInfo } : w
          ),
        }));
      },
      []
    );

    const updateFloatingWindowMinimizedPosition = useCallback(
      (windowId: string, position: { x: number; y: number } | undefined) => {
        setLayoutState((prev) => ({
          ...prev,
          floatingWindows: prev.floatingWindows.map((w) =>
            w.id === windowId ? { ...w, minimizedPosition: position } : w
          ),
        }));
      },
      []
    );

    const resetLayout = useCallback(() => {
      setLayoutState((prev) => ({
        ...prev,
        root: defaultLayout,
        floatingWindows: [],
      }));
    }, []);

    const value: LayoutContextValue = {
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
      updateResizeAbsolute,
      endResize,
      resizeState,
      getNode,
      isPanelOpen,
      registerPanelRef,
      unregisterPanelRef,
      getPanelRect,
      getAllPanelRects,
      updateFloatingWindowSnap,
      updateFloatingWindowMinimizedPosition,
      resetLayout,
    };

    return (
      <LayoutInstanceContext.Provider value={value}>
        <LayoutConfigProvider config={config} layoutContext={value}>
          <div ref={containerRef} className={containerClassName}>
            {children}
          </div>
        </LayoutConfigProvider>
      </LayoutInstanceContext.Provider>
    );
  }

  return { Provider, useLayoutContext };
}
