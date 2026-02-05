"use client";

import {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
} from "react";
import { EditorToolMode, OutputFormat, SavedImageProject, Point } from "../types";

// ============================================
// State Types
// ============================================

export interface EditorState {
  // Canvas & Display
  canvasSize: { width: number; height: number };
  rotation: number;
  zoom: number;
  pan: Point;
  isSpacePressed: boolean;
  isPanLocked: boolean; // Mobile pan mode toggle

  // Tool & Settings
  toolMode: EditorToolMode;
  outputFormat: OutputFormat;
  quality: number;

  // Project Management
  projectName: string;
  currentProjectId: string | null;
  savedProjects: SavedImageProject[];
  isProjectListOpen: boolean;
  storageInfo: { used: number; quota: number; percentage: number };

  // UI
  showBgRemovalConfirm: boolean;
}

// ============================================
// Context Value Type
// ============================================

export interface EditorStateContextValue {
  state: EditorState;

  // Canvas & Display setters
  setCanvasSize: (size: { width: number; height: number }) => void;
  setRotation: (rotation: number) => void;
  setZoom: (zoom: number | ((z: number) => number)) => void;
  setPan: (pan: Point | ((p: Point) => Point)) => void;
  setIsSpacePressed: (pressed: boolean) => void;
  setIsPanLocked: (locked: boolean) => void;

  // Tool & Settings setters
  setToolMode: (mode: EditorToolMode) => void;
  setOutputFormat: (format: OutputFormat) => void;
  setQuality: (quality: number) => void;

  // Project Management setters
  setProjectName: (name: string) => void;
  setCurrentProjectId: (id: string | null) => void;
  setSavedProjects: (projects: SavedImageProject[]) => void;
  setIsProjectListOpen: (open: boolean) => void;
  setStorageInfo: (info: { used: number; quota: number; percentage: number }) => void;

  // UI setters
  setShowBgRemovalConfirm: (show: boolean) => void;

  // Batch update for complex operations
  updateState: (updates: Partial<EditorState>) => void;
}

// ============================================
// Initial State
// ============================================

const initialState: EditorState = {
  // Canvas & Display
  canvasSize: { width: 0, height: 0 },
  rotation: 0,
  zoom: 1,
  pan: { x: 0, y: 0 },
  isSpacePressed: false,
  isPanLocked: false,

  // Tool & Settings
  toolMode: "brush",
  outputFormat: "png",
  quality: 0.9,

  // Project Management
  projectName: "Untitled",
  currentProjectId: null,
  savedProjects: [],
  isProjectListOpen: false,
  storageInfo: { used: 0, quota: 0, percentage: 0 },

  // UI
  showBgRemovalConfirm: false,
};

// ============================================
// Context
// ============================================

const EditorStateContext = createContext<EditorStateContextValue | null>(null);

// ============================================
// Provider
// ============================================

interface EditorStateProviderProps {
  children: ReactNode;
}

export function EditorStateProvider({ children }: EditorStateProviderProps) {
  const [state, setState] = useState<EditorState>(initialState);

  // Canvas & Display setters
  const setCanvasSize = useCallback(
    (size: { width: number; height: number }) => {
      setState((prev) => ({ ...prev, canvasSize: size }));
    },
    []
  );

  const setRotation = useCallback((rotation: number) => {
    setState((prev) => ({ ...prev, rotation }));
  }, []);

  const setZoom = useCallback((zoom: number | ((z: number) => number)) => {
    setState((prev) => ({
      ...prev,
      zoom: typeof zoom === "function" ? zoom(prev.zoom) : zoom,
    }));
  }, []);

  const setPan = useCallback((pan: Point | ((p: Point) => Point)) => {
    setState((prev) => ({
      ...prev,
      pan: typeof pan === "function" ? pan(prev.pan) : pan,
    }));
  }, []);

  const setIsSpacePressed = useCallback((pressed: boolean) => {
    setState((prev) => ({ ...prev, isSpacePressed: pressed }));
  }, []);

  const setIsPanLocked = useCallback((locked: boolean) => {
    setState((prev) => ({ ...prev, isPanLocked: locked }));
  }, []);

  // Tool & Settings setters
  const setToolMode = useCallback((mode: EditorToolMode) => {
    setState((prev) => ({ ...prev, toolMode: mode }));
  }, []);

  const setOutputFormat = useCallback((format: OutputFormat) => {
    setState((prev) => ({ ...prev, outputFormat: format }));
  }, []);

  const setQuality = useCallback((quality: number) => {
    setState((prev) => ({ ...prev, quality }));
  }, []);

  // Project Management setters
  const setProjectName = useCallback((name: string) => {
    setState((prev) => ({ ...prev, projectName: name }));
  }, []);

  const setCurrentProjectId = useCallback((id: string | null) => {
    setState((prev) => ({ ...prev, currentProjectId: id }));
  }, []);

  const setSavedProjects = useCallback((projects: SavedImageProject[]) => {
    setState((prev) => ({ ...prev, savedProjects: projects }));
  }, []);

  const setIsProjectListOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, isProjectListOpen: open }));
  }, []);

  const setStorageInfo = useCallback(
    (info: { used: number; quota: number; percentage: number }) => {
      setState((prev) => ({ ...prev, storageInfo: info }));
    },
    []
  );

  // UI setters
  const setShowBgRemovalConfirm = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showBgRemovalConfirm: show }));
  }, []);

  // Batch update for complex operations (e.g., loading project)
  const updateState = useCallback((updates: Partial<EditorState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const value: EditorStateContextValue = {
    state,
    setCanvasSize,
    setRotation,
    setZoom,
    setPan,
    setIsSpacePressed,
    setIsPanLocked,
    setToolMode,
    setOutputFormat,
    setQuality,
    setProjectName,
    setCurrentProjectId,
    setSavedProjects,
    setIsProjectListOpen,
    setStorageInfo,
    setShowBgRemovalConfirm,
    updateState,
  };

  return (
    <EditorStateContext.Provider value={value}>
      {children}
    </EditorStateContext.Provider>
  );
}

// ============================================
// Hook
// ============================================

export function useEditorState(): EditorStateContextValue {
  const context = useContext(EditorStateContext);
  if (!context) {
    throw new Error("useEditorState must be used within EditorStateProvider");
  }
  return context;
}
