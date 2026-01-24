"use client";

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from "react";
import { Point, Size, DockPosition, DockedPanel, FloatingWindow, DockingState } from "../types";

// ============================================
// Constants
// ============================================

const DOCK_DETECTION_THRESHOLD = 50; // 화면 가장자리에서 도킹 감지 시작하는 픽셀
const DEFAULT_DOCK_SIZE = 300; // 도킹 시 기본 패널 크기
const STORAGE_KEY = "sprite-editor-docking-state";

// ============================================
// Context Interface
// ============================================

interface DockingContextValue {
  // State
  dockingState: DockingState;
  activeDragWindow: string | null;
  activeDropZone: DockPosition | null;

  // Docked Panels
  getDockedPanels: (position: DockPosition) => DockedPanel[];
  dockWindow: (windowId: string, position: DockPosition, title: string, size?: number) => void;
  undockWindow: (windowId: string) => FloatingWindow | null;
  resizeDockedPanel: (windowId: string, newSize: number) => void;
  closeDockedPanel: (windowId: string) => void;

  // Floating Windows
  getFloatingWindows: () => FloatingWindow[];
  createFloatingWindow: (id: string, title: string, position: Point, size: Size) => void;
  updateFloatingWindowPosition: (id: string, position: Point) => void;
  updateFloatingWindowSize: (id: string, size: Size) => void;
  toggleFloatingWindowMinimize: (id: string) => void;
  closeFloatingWindow: (id: string) => void;

  // Drag & Drop
  startDragging: (windowId: string) => void;
  updateDragPosition: (
    mouseX: number,
    mouseY: number,
    viewportWidth: number,
    viewportHeight: number,
  ) => void;
  endDragging: (finalPosition: Point) => DockPosition | null;

  // Utilities
  isWindowDocked: (windowId: string) => boolean;
  getWindowDockPosition: (windowId: string) => DockPosition | null;
  detectDockZone: (
    mouseX: number,
    mouseY: number,
    viewportWidth: number,
    viewportHeight: number,
  ) => DockPosition | null;
}

// ============================================
// Context Creation
// ============================================

const DockingContext = createContext<DockingContextValue | null>(null);

// ============================================
// Provider Component
// ============================================

interface DockingProviderProps {
  children: ReactNode;
}

export function DockingProvider({ children }: DockingProviderProps) {
  const [dockingState, setDockingState] = useState<DockingState>({
    dockedPanels: {},
    floatingWindows: [],
    activeDragWindow: null,
    activeDropZone: null,
  });

  const activeDragWindow = dockingState.activeDragWindow;
  const activeDropZone = dockingState.activeDropZone;

  // localStorage에서 도킹 상태 복원
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setDockingState((prev) => ({
          ...prev,
          dockedPanels: parsed.dockedPanels || {},
          floatingWindows: parsed.floatingWindows || [],
        }));
      } catch (e) {
        console.error("Failed to load docking state:", e);
      }
    }
  }, []);

  // 도킹 상태 저장
  const saveDockingState = useCallback((state: DockingState) => {
    const toSave = {
      dockedPanels: state.dockedPanels,
      floatingWindows: state.floatingWindows,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  }, []);

  // ============================================
  // Docked Panels
  // ============================================

  const getDockedPanels = useCallback(
    (position: DockPosition): DockedPanel[] => {
      return dockingState.dockedPanels[position] || [];
    },
    [dockingState.dockedPanels],
  );

  const dockWindow = useCallback(
    (windowId: string, position: DockPosition, title: string, size = DEFAULT_DOCK_SIZE) => {
      setDockingState((prev) => {
        // 이미 도킹되어 있으면 제거
        const newDockedPanels = { ...prev.dockedPanels };
        for (const pos of ["left", "right", "top", "bottom"] as DockPosition[]) {
          if (newDockedPanels[pos]) {
            newDockedPanels[pos] = newDockedPanels[pos]!.filter((p) => p.id !== windowId);
          }
        }

        // 플로팅에서 제거
        const newFloatingWindows = prev.floatingWindows.filter((w) => w.id !== windowId);

        // 새 위치에 도킹
        const panel: DockedPanel = { id: windowId, title, size };
        newDockedPanels[position] = [...(newDockedPanels[position] || []), panel];

        const newState = {
          ...prev,
          dockedPanels: newDockedPanels,
          floatingWindows: newFloatingWindows,
          activeDragWindow: null,
          activeDropZone: null,
        };
        saveDockingState(newState);
        return newState;
      });
    },
    [saveDockingState],
  );

  const undockWindow = useCallback(
    (windowId: string): FloatingWindow | null => {
      let undockedWindow: FloatingWindow | null = null;

      setDockingState((prev) => {
        // 도킹된 패널 찾기
        let foundPanel: DockedPanel | null = null;
        let foundPosition: DockPosition | null = null;

        for (const pos of ["left", "right", "top", "bottom"] as DockPosition[]) {
          const panels = prev.dockedPanels[pos];
          if (panels) {
            const panel = panels.find((p) => p.id === windowId);
            if (panel) {
              foundPanel = panel;
              foundPosition = pos;
              break;
            }
          }
        }

        if (!foundPanel || !foundPosition) return prev;

        // 도킹에서 제거
        const newDockedPanels = { ...prev.dockedPanels };
        newDockedPanels[foundPosition] = newDockedPanels[foundPosition]!.filter(
          (p) => p.id !== windowId,
        );

        // 플로팅 윈도우로 변환
        const newFloatingWindow: FloatingWindow = {
          id: windowId,
          title: foundPanel.title,
          position: { x: 100, y: 100 },
          size: { width: 400, height: 450 },
          isMinimized: false,
        };
        undockedWindow = newFloatingWindow;

        const newState = {
          ...prev,
          dockedPanels: newDockedPanels,
          floatingWindows: [...prev.floatingWindows, newFloatingWindow],
        };
        saveDockingState(newState);
        return newState;
      });

      return undockedWindow;
    },
    [saveDockingState],
  );

  const resizeDockedPanel = useCallback(
    (windowId: string, newSize: number) => {
      setDockingState((prev) => {
        const newDockedPanels = { ...prev.dockedPanels };

        for (const pos of ["left", "right", "top", "bottom"] as DockPosition[]) {
          if (newDockedPanels[pos]) {
            newDockedPanels[pos] = newDockedPanels[pos]!.map((p) =>
              p.id === windowId ? { ...p, size: newSize } : p,
            );
          }
        }

        const newState = { ...prev, dockedPanels: newDockedPanels };
        saveDockingState(newState);
        return newState;
      });
    },
    [saveDockingState],
  );

  const closeDockedPanel = useCallback(
    (windowId: string) => {
      setDockingState((prev) => {
        const newDockedPanels = { ...prev.dockedPanels };

        for (const pos of ["left", "right", "top", "bottom"] as DockPosition[]) {
          if (newDockedPanels[pos]) {
            newDockedPanels[pos] = newDockedPanels[pos]!.filter((p) => p.id !== windowId);
          }
        }

        const newState = { ...prev, dockedPanels: newDockedPanels };
        saveDockingState(newState);
        return newState;
      });
    },
    [saveDockingState],
  );

  // ============================================
  // Floating Windows
  // ============================================

  const getFloatingWindows = useCallback((): FloatingWindow[] => {
    return dockingState.floatingWindows;
  }, [dockingState.floatingWindows]);

  const createFloatingWindow = useCallback(
    (id: string, title: string, position: Point, size: Size) => {
      setDockingState((prev) => {
        // 이미 존재하면 무시
        if (prev.floatingWindows.some((w) => w.id === id)) return prev;

        const newWindow: FloatingWindow = {
          id,
          title,
          position,
          size,
          isMinimized: false,
        };

        const newState = {
          ...prev,
          floatingWindows: [...prev.floatingWindows, newWindow],
        };
        saveDockingState(newState);
        return newState;
      });
    },
    [saveDockingState],
  );

  const updateFloatingWindowPosition = useCallback(
    (id: string, position: Point) => {
      setDockingState((prev) => {
        const newFloatingWindows = prev.floatingWindows.map((w) =>
          w.id === id ? { ...w, position } : w,
        );
        const newState = { ...prev, floatingWindows: newFloatingWindows };
        saveDockingState(newState);
        return newState;
      });
    },
    [saveDockingState],
  );

  const updateFloatingWindowSize = useCallback((id: string, size: Size) => {
    setDockingState((prev) => {
      const newFloatingWindows = prev.floatingWindows.map((w) =>
        w.id === id ? { ...w, size } : w,
      );
      const newState = { ...prev, floatingWindows: newFloatingWindows };
      return newState;
    });
  }, []);

  const toggleFloatingWindowMinimize = useCallback((id: string) => {
    setDockingState((prev) => {
      const newFloatingWindows = prev.floatingWindows.map((w) =>
        w.id === id ? { ...w, isMinimized: !w.isMinimized } : w,
      );
      return { ...prev, floatingWindows: newFloatingWindows };
    });
  }, []);

  const closeFloatingWindow = useCallback(
    (id: string) => {
      setDockingState((prev) => {
        const newFloatingWindows = prev.floatingWindows.filter((w) => w.id !== id);
        const newState = { ...prev, floatingWindows: newFloatingWindows };
        saveDockingState(newState);
        return newState;
      });
    },
    [saveDockingState],
  );

  // ============================================
  // Drag & Drop
  // ============================================

  const detectDockZone = useCallback(
    (
      mouseX: number,
      mouseY: number,
      viewportWidth: number,
      viewportHeight: number,
    ): DockPosition | null => {
      if (mouseX < DOCK_DETECTION_THRESHOLD) return "left";
      if (mouseX > viewportWidth - DOCK_DETECTION_THRESHOLD) return "right";
      if (mouseY < DOCK_DETECTION_THRESHOLD) return "top";
      if (mouseY > viewportHeight - DOCK_DETECTION_THRESHOLD) return "bottom";
      return null;
    },
    [],
  );

  const startDragging = useCallback((windowId: string) => {
    setDockingState((prev) => ({
      ...prev,
      activeDragWindow: windowId,
      activeDropZone: null,
    }));
  }, []);

  const updateDragPosition = useCallback(
    (mouseX: number, mouseY: number, viewportWidth: number, viewportHeight: number) => {
      const zone = detectDockZone(mouseX, mouseY, viewportWidth, viewportHeight);
      setDockingState((prev) => {
        if (prev.activeDropZone === zone) return prev;
        return { ...prev, activeDropZone: zone };
      });
    },
    [detectDockZone],
  );

  const endDragging = useCallback((_finalPosition: Point): DockPosition | null => {
    let result: DockPosition | null = null;

    setDockingState((prev) => {
      result = prev.activeDropZone;
      return {
        ...prev,
        activeDragWindow: null,
        activeDropZone: null,
      };
    });

    return result;
  }, []);

  // ============================================
  // Utilities
  // ============================================

  const isWindowDocked = useCallback(
    (windowId: string): boolean => {
      for (const pos of ["left", "right", "top", "bottom"] as DockPosition[]) {
        const panels = dockingState.dockedPanels[pos];
        if (panels && panels.some((p) => p.id === windowId)) {
          return true;
        }
      }
      return false;
    },
    [dockingState.dockedPanels],
  );

  const getWindowDockPosition = useCallback(
    (windowId: string): DockPosition | null => {
      for (const pos of ["left", "right", "top", "bottom"] as DockPosition[]) {
        const panels = dockingState.dockedPanels[pos];
        if (panels && panels.some((p) => p.id === windowId)) {
          return pos;
        }
      }
      return null;
    },
    [dockingState.dockedPanels],
  );

  const value: DockingContextValue = {
    // State
    dockingState,
    activeDragWindow,
    activeDropZone,

    // Docked Panels
    getDockedPanels,
    dockWindow,
    undockWindow,
    resizeDockedPanel,
    closeDockedPanel,

    // Floating Windows
    getFloatingWindows,
    createFloatingWindow,
    updateFloatingWindowPosition,
    updateFloatingWindowSize,
    toggleFloatingWindowMinimize,
    closeFloatingWindow,

    // Drag & Drop
    startDragging,
    updateDragPosition,
    endDragging,

    // Utilities
    isWindowDocked,
    getWindowDockPosition,
    detectDockZone,
  };

  return <DockingContext.Provider value={value}>{children}</DockingContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useDocking(): DockingContextValue {
  const context = useContext(DockingContext);
  if (!context) {
    throw new Error("useDocking must be used within a DockingProvider");
  }
  return context;
}
