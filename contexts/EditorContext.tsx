"use client";

import {
  createContext,
  useContext,
  useState,
  useRef,
  useCallback,
  useEffect,
  ReactNode,
} from "react";
import { Point, Size, SpriteFrame, ToolMode, TimelineMode, SavedProject } from "../types";

// ============================================
// Autosave Constants
// ============================================

const AUTOSAVE_KEY = "sprite-editor-autosave";
const AUTOSAVE_DEBOUNCE_MS = 1000;

interface AutosaveData {
  imageSrc: string | null;
  imageSize: Size;
  frames: SpriteFrame[];
  nextFrameId: number;
  fps: number;
  currentFrameIndex: number;
  zoom: number;
  pan: Point;
  scale: number;
  projectName: string;
  savedAt: number;
}

// ============================================
// Context Interface
// ============================================

interface EditorContextValue {
  // Image
  imageSrc: string | null;
  setImageSrc: (src: string | null) => void;
  imageSize: Size;
  setImageSize: (size: Size) => void;

  // Frames
  frames: SpriteFrame[];
  setFrames: React.Dispatch<React.SetStateAction<SpriteFrame[]>>;
  nextFrameId: number;
  setNextFrameId: React.Dispatch<React.SetStateAction<number>>;
  currentFrameIndex: number;
  setCurrentFrameIndex: React.Dispatch<React.SetStateAction<number>>;
  selectedFrameId: number | null;
  setSelectedFrameId: (id: number | null) => void;
  selectedPointIndex: number | null;
  setSelectedPointIndex: (index: number | null) => void;

  // Tools
  toolMode: ToolMode;
  setToolMode: (mode: ToolMode) => void;
  currentPoints: Point[];
  setCurrentPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  isSpacePressed: boolean;
  setIsSpacePressed: (pressed: boolean) => void;

  // Viewport
  zoom: number;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  pan: Point;
  setPan: React.Dispatch<React.SetStateAction<Point>>;
  scale: number;
  setScale: (scale: number) => void;
  canvasHeight: number;
  setCanvasHeight: React.Dispatch<React.SetStateAction<number>>;
  isCanvasCollapsed: boolean;
  setIsCanvasCollapsed: (collapsed: boolean) => void;

  // Animation
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  fps: number;
  setFps: (fps: number) => void;

  // Timeline
  timelineMode: TimelineMode;
  setTimelineMode: (mode: TimelineMode) => void;

  // Drag States
  isDragging: boolean;
  setIsDragging: (dragging: boolean) => void;
  dragStart: Point;
  setDragStart: (start: Point) => void;
  isPanning: boolean;
  setIsPanning: (panning: boolean) => void;
  lastPanPoint: Point;
  setLastPanPoint: (point: Point) => void;
  draggedFrameId: number | null;
  setDraggedFrameId: (id: number | null) => void;
  dragOverIndex: number | null;
  setDragOverIndex: (index: number | null) => void;
  editingOffsetFrameId: number | null;
  setEditingOffsetFrameId: (id: number | null) => void;
  offsetDragStart: Point;
  setOffsetDragStart: (start: Point) => void;
  isResizing: boolean;
  setIsResizing: (resizing: boolean) => void;

  // Windows
  isPreviewWindowOpen: boolean;
  setIsPreviewWindowOpen: (open: boolean) => void;
  isFrameEditOpen: boolean;
  setIsFrameEditOpen: (open: boolean) => void;
  isProjectListOpen: boolean;
  setIsProjectListOpen: (open: boolean) => void;
  isSpriteSheetImportOpen: boolean;
  setIsSpriteSheetImportOpen: (open: boolean) => void;

  // Brush Tool
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushSize: number;
  setBrushSize: (size: number) => void;

  // Background Removal
  isBackgroundRemovalMode: boolean;
  setIsBackgroundRemovalMode: (mode: boolean) => void;
  eraserTolerance: number;
  setEraserTolerance: (tolerance: number) => void;
  eraserMode: "connected" | "all";
  setEraserMode: (mode: "connected" | "all") => void;

  // History (Undo/Redo)
  canUndo: boolean;
  canRedo: boolean;
  undo: () => void;
  redo: () => void;
  pushHistory: () => void;

  // Project
  projectName: string;
  setProjectName: (name: string) => void;
  savedProjects: SavedProject[];
  setSavedProjects: React.Dispatch<React.SetStateAction<SavedProject[]>>;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  newProject: () => void;

  // Clipboard
  copyFrame: () => void;
  pasteFrame: () => void;
  clipboardFrame: SpriteFrame | null;

  // Refs
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  animationRef: React.RefObject<number | null>;
  lastFrameTimeRef: React.RefObject<number>;
  didPanOrDragRef: React.RefObject<boolean>;

  // Computed
  getTransformParams: () => { scale: number; zoom: number; pan: Point };
}

// ============================================
// Context Creation
// ============================================

const EditorContext = createContext<EditorContextValue | null>(null);

// ============================================
// Provider Component
// ============================================

interface EditorProviderProps {
  children: ReactNode;
}

export function EditorProvider({ children }: EditorProviderProps) {
  // Image State
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState<Size>({ width: 0, height: 0 });

  // Frame State
  const [frames, setFrames] = useState<SpriteFrame[]>([]);
  const [nextFrameId, setNextFrameId] = useState(1);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null);
  const [selectedPointIndex, setSelectedPointIndex] = useState<number | null>(null);

  // Tool State
  const [toolMode, setToolMode] = useState<ToolMode>("pen");
  const [currentPoints, setCurrentPoints] = useState<Point[]>([]);
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  // Viewport State
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState<Point>({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [canvasHeight, setCanvasHeight] = useState(400);
  const [isCanvasCollapsed, setIsCanvasCollapsed] = useState(false);

  // Animation State
  const [isPlaying, setIsPlaying] = useState(false);
  const [fps, setFps] = useState(12);

  // Timeline State
  const [timelineMode, setTimelineMode] = useState<TimelineMode>("reorder");

  // Drag State
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<Point>({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [lastPanPoint, setLastPanPoint] = useState<Point>({ x: 0, y: 0 });
  const [draggedFrameId, setDraggedFrameId] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const [editingOffsetFrameId, setEditingOffsetFrameId] = useState<number | null>(null);
  const [offsetDragStart, setOffsetDragStart] = useState<Point>({ x: 0, y: 0 });
  const [isResizing, setIsResizing] = useState(false);

  // Window State
  const [isPreviewWindowOpen, setIsPreviewWindowOpen] = useState(false);
  const [isFrameEditOpen, setIsFrameEditOpen] = useState(false);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [isSpriteSheetImportOpen, setIsSpriteSheetImportOpen] = useState(false);

  // Brush Tool State
  const [brushColor, setBrushColor] = useState("#000000");
  const [brushSize, setBrushSize] = useState(1);

  // Background Removal State
  const [isBackgroundRemovalMode, setIsBackgroundRemovalMode] = useState(false);
  const [eraserTolerance, setEraserTolerance] = useState(32);
  const [eraserMode, setEraserMode] = useState<"connected" | "all">("connected");

  // History State (Undo/Redo)
  const historyRef = useRef<SpriteFrame[][]>([]);
  const historyIndexRef = useRef(-1);
  const [historyVersion, setHistoryVersion] = useState(0); // for re-render trigger

  // Project State
  const [projectName, setProjectName] = useState("");
  const [savedProjects, setSavedProjects] = useState<SavedProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);

  // Clipboard State
  const [clipboardFrame, setClipboardFrame] = useState<SpriteFrame | null>(null);

  // Refs
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const canvasContainerRef = useRef<HTMLDivElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const animationRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const didPanOrDragRef = useRef(false);
  const isInitializedRef = useRef(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Autosave: Load saved data on mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const saved = localStorage.getItem(AUTOSAVE_KEY);
      if (saved) {
        const data: AutosaveData = JSON.parse(saved);

        // Restore state
        if (data.imageSrc) setImageSrc(data.imageSrc);
        if (data.imageSize) setImageSize(data.imageSize);
        if (data.frames && data.frames.length > 0) setFrames(data.frames);
        if (data.nextFrameId) setNextFrameId(data.nextFrameId);
        if (data.fps) setFps(data.fps);
        if (data.currentFrameIndex !== undefined) setCurrentFrameIndex(data.currentFrameIndex);
        if (data.zoom) setZoom(data.zoom);
        if (data.pan) setPan(data.pan);
        if (data.scale) setScale(data.scale);
        if (data.projectName) setProjectName(data.projectName);

        console.log("[Autosave] Loaded saved data from", new Date(data.savedAt).toLocaleString());
      }
    } catch (error) {
      console.error("[Autosave] Failed to load saved data:", error);
    }

    isInitializedRef.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: Save data when key states change (debounced)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!isInitializedRef.current) return;

    // Clear previous timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Debounce the save
    autosaveTimeoutRef.current = setTimeout(() => {
      try {
        const data: AutosaveData = {
          imageSrc,
          imageSize,
          frames,
          nextFrameId,
          fps,
          currentFrameIndex,
          zoom,
          pan,
          scale,
          projectName,
          savedAt: Date.now(),
        };

        localStorage.setItem(AUTOSAVE_KEY, JSON.stringify(data));
        console.log("[Autosave] Saved at", new Date().toLocaleTimeString());
      } catch (error) {
        console.error("[Autosave] Failed to save:", error);
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    imageSrc,
    imageSize,
    frames,
    nextFrameId,
    fps,
    currentFrameIndex,
    zoom,
    pan,
    scale,
    projectName,
  ]);

  // Computed
  const getTransformParams = useCallback(
    () => ({
      scale,
      zoom,
      pan,
    }),
    [scale, zoom, pan],
  );

  // History functions (historyVersion triggers re-render for canUndo/canRedo)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _historyVersion = historyVersion; // Keep for dependency tracking

  // Track if there are unsaved changes after pushHistory was called
  const hasUnsavedChangesRef = useRef(false);

  const canUndo = historyIndexRef.current >= 0 && historyRef.current.length > 0;
  const canRedo = historyIndexRef.current < historyRef.current.length - 1;

  const pushHistory = useCallback(() => {
    // Remove any future history if we're not at the end
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    }
    // Deep copy frames and add to history (this saves the state BEFORE the change)
    const framesCopy = frames.map((f) => ({
      ...f,
      points: [...f.points],
      offset: { ...f.offset },
    }));
    historyRef.current.push(framesCopy);
    historyIndexRef.current = historyRef.current.length - 1;
    // Mark that a change is about to happen
    hasUnsavedChangesRef.current = true;
    // Limit history to 50 items
    if (historyRef.current.length > 50) {
      historyRef.current.shift();
      historyIndexRef.current--;
    }
    setHistoryVersion((v) => v + 1);
  }, [frames]);

  const undo = useCallback(() => {
    if (historyRef.current.length > 0 && historyIndexRef.current >= 0) {
      // If there are unsaved changes (state after pushHistory), save current state for redo
      if (
        hasUnsavedChangesRef.current &&
        historyIndexRef.current === historyRef.current.length - 1
      ) {
        const currentFramesCopy = frames.map((f) => ({
          ...f,
          points: [...f.points],
          offset: { ...f.offset },
        }));
        historyRef.current.push(currentFramesCopy);
        hasUnsavedChangesRef.current = false;
      }

      // Restore previous state
      const prevFrames = historyRef.current[historyIndexRef.current];
      historyIndexRef.current--;
      setFrames(prevFrames.map((f) => ({ ...f, points: [...f.points], offset: { ...f.offset } })));
      setHistoryVersion((v) => v + 1);
    }
  }, [frames, setFrames]);

  const redo = useCallback(() => {
    if (historyIndexRef.current < historyRef.current.length - 1) {
      historyIndexRef.current++;
      const nextFrames = historyRef.current[historyIndexRef.current];
      setFrames(nextFrames.map((f) => ({ ...f, points: [...f.points], offset: { ...f.offset } })));
      setHistoryVersion((v) => v + 1);
    }
  }, [setFrames]);

  // New Project - reset all state to initial values
  const newProject = useCallback(() => {
    // Reset image
    setImageSrc(null);
    setImageSize({ width: 0, height: 0 });
    imageRef.current = null;

    // Reset frames
    setFrames([]);
    setNextFrameId(1);
    setCurrentFrameIndex(0);
    setSelectedFrameId(null);
    setSelectedPointIndex(null);
    setCurrentPoints([]);

    // Reset viewport
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setScale(1);

    // Reset tool
    setToolMode("pen");

    // Reset animation
    setIsPlaying(false);
    setFps(12);

    // Reset project
    setProjectName("");
    setCurrentProjectId(null);

    // Clear history
    historyRef.current = [];
    historyIndexRef.current = -1;
    setHistoryVersion((v) => v + 1);

    // Clear autosave
    if (typeof window !== "undefined") {
      localStorage.removeItem(AUTOSAVE_KEY);
      console.log("[NewProject] Cleared autosave and reset state");
    }
  }, []);

  // Copy current frame to clipboard
  const copyFrame = useCallback(() => {
    if (frames.length === 0) return;

    // Copy the current frame (by index)
    const frameToCopy = frames[currentFrameIndex];
    if (!frameToCopy) return;

    // Deep copy the frame
    const copiedFrame: SpriteFrame = {
      ...frameToCopy,
      points: frameToCopy.points.map((p) => ({ ...p })),
      offset: { ...frameToCopy.offset },
    };

    setClipboardFrame(copiedFrame);
    console.log("[Clipboard] Frame copied:", copiedFrame.id);
  }, [frames, currentFrameIndex]);

  // Paste frame from clipboard
  const pasteFrame = useCallback(() => {
    if (!clipboardFrame) return;

    // Create a new frame with a new ID
    const newFrame: SpriteFrame = {
      ...clipboardFrame,
      id: nextFrameId,
      points: clipboardFrame.points.map((p) => ({ ...p })),
      offset: { ...clipboardFrame.offset },
    };

    // Push history before making changes
    pushHistory();

    // Insert the new frame after the current frame
    const insertIndex = currentFrameIndex + 1;
    setFrames((prev) => {
      const newFrames = [...prev];
      newFrames.splice(insertIndex, 0, newFrame);
      return newFrames;
    });

    // Update frame ID counter and select the new frame
    setNextFrameId((prev) => prev + 1);
    setCurrentFrameIndex(insertIndex);

    console.log("[Clipboard] Frame pasted as new frame:", newFrame.id);
  }, [
    clipboardFrame,
    nextFrameId,
    currentFrameIndex,
    pushHistory,
    setFrames,
    setNextFrameId,
    setCurrentFrameIndex,
  ]);

  const value: EditorContextValue = {
    // Image
    imageSrc,
    setImageSrc,
    imageSize,
    setImageSize,

    // Frames
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    currentFrameIndex,
    setCurrentFrameIndex,
    selectedFrameId,
    setSelectedFrameId,
    selectedPointIndex,
    setSelectedPointIndex,

    // Tools
    toolMode,
    setToolMode,
    currentPoints,
    setCurrentPoints,
    isSpacePressed,
    setIsSpacePressed,

    // Viewport
    zoom,
    setZoom,
    pan,
    setPan,
    scale,
    setScale,
    canvasHeight,
    setCanvasHeight,
    isCanvasCollapsed,
    setIsCanvasCollapsed,

    // Animation
    isPlaying,
    setIsPlaying,
    fps,
    setFps,

    // Timeline
    timelineMode,
    setTimelineMode,

    // Drag States
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    isPanning,
    setIsPanning,
    lastPanPoint,
    setLastPanPoint,
    draggedFrameId,
    setDraggedFrameId,
    dragOverIndex,
    setDragOverIndex,
    editingOffsetFrameId,
    setEditingOffsetFrameId,
    offsetDragStart,
    setOffsetDragStart,
    isResizing,
    setIsResizing,

    // Windows
    isPreviewWindowOpen,
    setIsPreviewWindowOpen,
    isFrameEditOpen,
    setIsFrameEditOpen,
    isProjectListOpen,
    setIsProjectListOpen,
    isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen,

    // Brush Tool
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,

    // Background Removal
    isBackgroundRemovalMode,
    setIsBackgroundRemovalMode,
    eraserTolerance,
    setEraserTolerance,
    eraserMode,
    setEraserMode,

    // History (Undo/Redo)
    canUndo,
    canRedo,
    undo,
    redo,
    pushHistory,

    // Project
    projectName,
    setProjectName,
    savedProjects,
    setSavedProjects,
    currentProjectId,
    setCurrentProjectId,
    newProject,

    // Clipboard
    copyFrame,
    pasteFrame,
    clipboardFrame,

    // Refs
    canvasRef,
    canvasContainerRef,
    previewCanvasRef,
    imageRef,
    animationRef,
    lastFrameTimeRef,
    didPanOrDragRef,

    // Computed
    getTransformParams,
  };

  return <EditorContext.Provider value={value}>{children}</EditorContext.Provider>;
}

// ============================================
// Hook
// ============================================

export function useEditor(): EditorContextValue {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
}

// ============================================
// Selector Hooks (for performance)
// ============================================

export function useEditorImage() {
  const { imageSrc, setImageSrc, imageSize, setImageSize, imageRef } = useEditor();
  return { imageSrc, setImageSrc, imageSize, setImageSize, imageRef };
}

export function useEditorFrames() {
  const {
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    currentFrameIndex,
    setCurrentFrameIndex,
    selectedFrameId,
    setSelectedFrameId,
    selectedPointIndex,
    setSelectedPointIndex,
  } = useEditor();
  return {
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    currentFrameIndex,
    setCurrentFrameIndex,
    selectedFrameId,
    setSelectedFrameId,
    selectedPointIndex,
    setSelectedPointIndex,
  };
}

export function useEditorTools() {
  const {
    toolMode,
    setToolMode,
    currentPoints,
    setCurrentPoints,
    isSpacePressed,
    setIsSpacePressed,
  } = useEditor();
  return {
    toolMode,
    setToolMode,
    currentPoints,
    setCurrentPoints,
    isSpacePressed,
    setIsSpacePressed,
  };
}

export function useEditorViewport() {
  const {
    zoom,
    setZoom,
    pan,
    setPan,
    scale,
    setScale,
    canvasHeight,
    setCanvasHeight,
    isCanvasCollapsed,
    setIsCanvasCollapsed,
    getTransformParams,
  } = useEditor();
  return {
    zoom,
    setZoom,
    pan,
    setPan,
    scale,
    setScale,
    canvasHeight,
    setCanvasHeight,
    isCanvasCollapsed,
    setIsCanvasCollapsed,
    getTransformParams,
  };
}

export function useEditorAnimation() {
  const { isPlaying, setIsPlaying, fps, setFps, animationRef, lastFrameTimeRef } = useEditor();
  return { isPlaying, setIsPlaying, fps, setFps, animationRef, lastFrameTimeRef };
}

export function useEditorDrag() {
  const {
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    isPanning,
    setIsPanning,
    lastPanPoint,
    setLastPanPoint,
    draggedFrameId,
    setDraggedFrameId,
    dragOverIndex,
    setDragOverIndex,
    editingOffsetFrameId,
    setEditingOffsetFrameId,
    offsetDragStart,
    setOffsetDragStart,
    isResizing,
    setIsResizing,
    didPanOrDragRef,
  } = useEditor();
  return {
    isDragging,
    setIsDragging,
    dragStart,
    setDragStart,
    isPanning,
    setIsPanning,
    lastPanPoint,
    setLastPanPoint,
    draggedFrameId,
    setDraggedFrameId,
    dragOverIndex,
    setDragOverIndex,
    editingOffsetFrameId,
    setEditingOffsetFrameId,
    offsetDragStart,
    setOffsetDragStart,
    isResizing,
    setIsResizing,
    didPanOrDragRef,
  };
}

export function useEditorWindows() {
  const {
    isPreviewWindowOpen,
    setIsPreviewWindowOpen,
    isFrameEditOpen,
    setIsFrameEditOpen,
    isProjectListOpen,
    setIsProjectListOpen,
    isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen,
  } = useEditor();
  return {
    isPreviewWindowOpen,
    setIsPreviewWindowOpen,
    isFrameEditOpen,
    setIsFrameEditOpen,
    isProjectListOpen,
    setIsProjectListOpen,
    isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen,
  };
}

export function useEditorBrush() {
  const { brushColor, setBrushColor, brushSize, setBrushSize } = useEditor();
  return { brushColor, setBrushColor, brushSize, setBrushSize };
}

export function useEditorBackgroundRemoval() {
  const {
    isBackgroundRemovalMode,
    setIsBackgroundRemovalMode,
    eraserTolerance,
    setEraserTolerance,
    eraserMode,
    setEraserMode,
  } = useEditor();
  return {
    isBackgroundRemovalMode,
    setIsBackgroundRemovalMode,
    eraserTolerance,
    setEraserTolerance,
    eraserMode,
    setEraserMode,
  };
}

export function useEditorHistory() {
  const { canUndo, canRedo, undo, redo, pushHistory } = useEditor();
  return { canUndo, canRedo, undo, redo, pushHistory };
}

export function useEditorProject() {
  const {
    projectName,
    setProjectName,
    savedProjects,
    setSavedProjects,
    currentProjectId,
    setCurrentProjectId,
    newProject,
  } = useEditor();
  return {
    projectName,
    setProjectName,
    savedProjects,
    setSavedProjects,
    currentProjectId,
    setCurrentProjectId,
    newProject,
  };
}

export function useEditorClipboard() {
  const { copyFrame, pasteFrame, clipboardFrame } = useEditor();
  return { copyFrame, pasteFrame, clipboardFrame };
}

export function useEditorRefs() {
  const { canvasRef, canvasContainerRef, previewCanvasRef, imageRef } = useEditor();
  return { canvasRef, canvasContainerRef, previewCanvasRef, imageRef };
}
