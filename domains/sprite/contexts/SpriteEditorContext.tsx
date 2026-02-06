"use client";

import { createContext, useContext, useRef, useEffect, ReactNode, useCallback } from "react";
import { SpriteFrame } from "../types";
import { AUTOSAVE_DEBOUNCE_MS, loadAutosaveData, saveAutosaveData, clearAutosaveData } from "../utils/autosave";
import { ensureV2Format } from "../utils/migration";
import { deepCopyFrame } from "../utils/frameUtils";
import {
  useSpriteFrameStore,
  useSpriteTrackStore,
  useSpriteViewportStore,
  useSpriteToolStore,
  useSpriteDragStore,
  useSpriteUIStore,
} from "../stores";

// ============================================
// Context Interface (Refs Only)
// ============================================

interface EditorRefsContextValue {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  canvasContainerRef: React.RefObject<HTMLDivElement | null>;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
  imageRef: React.RefObject<HTMLImageElement | null>;
  animationRef: React.RefObject<number | null>;
  lastFrameTimeRef: React.RefObject<number>;
  didPanOrDragRef: React.RefObject<boolean>;
}

// ============================================
// Context Creation
// ============================================

const EditorRefsContext = createContext<EditorRefsContextValue | null>(null);

// ============================================
// Provider Component
// ============================================

interface EditorProviderProps {
  children: ReactNode;
}

export function EditorProvider({ children }: EditorProviderProps) {
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

  // Get store states for autosave
  const frameStore = useSpriteFrameStore();
  const trackStore = useSpriteTrackStore();
  const viewportStore = useSpriteViewportStore();
  const uiStore = useSpriteUIStore();

  // Autosave: Load saved data on mount
  useEffect(() => {
    const loadData = async () => {
      const data = await loadAutosaveData();
      if (data) {
        // Restore frame state (legacy compatibility)
        if (data.imageSrc) frameStore.setImageSrc(data.imageSrc);
        if (data.imageSize) frameStore.setImageSize(data.imageSize);
        if (data.frames && data.frames.length > 0) frameStore.setFrames(data.frames);
        if (data.nextFrameId) frameStore.setNextFrameId(data.nextFrameId);
        if (data.fps) frameStore.setFps(data.fps);
        if (data.currentFrameIndex !== undefined) frameStore.setCurrentFrameIndex(data.currentFrameIndex);

        // Restore track state (V2 with migration)
        const { tracks, nextFrameId } = ensureV2Format(data);
        if (tracks.length > 0) {
          trackStore.restoreTracks(tracks, nextFrameId);
        }
        if (data.fps) trackStore.setFps(data.fps);
        if (data.currentFrameIndex !== undefined) trackStore.setCurrentFrameIndex(data.currentFrameIndex);

        // Restore viewport state
        if (data.zoom) viewportStore.setZoom(data.zoom);
        if (data.pan) viewportStore.setPan(data.pan);
        if (data.scale) viewportStore.setScale(data.scale);

        // Restore UI state
        if (data.projectName) uiStore.setProjectName(data.projectName);
      }
      isInitializedRef.current = true;
    };
    loadData();
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
      void saveAutosaveData({
        imageSrc: frameStore.imageSrc,
        imageSize: frameStore.imageSize,
        frames: frameStore.frames,
        tracks: trackStore.tracks,
        nextFrameId: frameStore.nextFrameId,
        fps: frameStore.fps,
        currentFrameIndex: frameStore.currentFrameIndex,
        zoom: viewportStore.zoom,
        pan: viewportStore.pan,
        scale: viewportStore.scale,
        projectName: uiStore.projectName,
        version: 2,
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    frameStore.imageSrc,
    frameStore.imageSize,
    frameStore.frames,
    frameStore.nextFrameId,
    frameStore.fps,
    frameStore.currentFrameIndex,
    trackStore.tracks,
    viewportStore.zoom,
    viewportStore.pan,
    viewportStore.scale,
    uiStore.projectName,
  ]);

  const refsValue: EditorRefsContextValue = {
    canvasRef,
    canvasContainerRef,
    previewCanvasRef,
    imageRef,
    animationRef,
    lastFrameTimeRef,
    didPanOrDragRef,
  };

  return <EditorRefsContext.Provider value={refsValue}>{children}</EditorRefsContext.Provider>;
}

// ============================================
// Refs Hook
// ============================================

export function useEditorRefs(): EditorRefsContextValue {
  const context = useContext(EditorRefsContext);
  if (!context) {
    throw new Error("useEditorRefs must be used within an EditorProvider");
  }
  return context;
}

// ============================================
// Legacy useEditor Hook (Backwards Compatibility)
// ============================================

export function useEditor() {
  const refs = useEditorRefs();
  const frameStore = useSpriteFrameStore();
  const trackStore = useSpriteTrackStore();
  const viewportStore = useSpriteViewportStore();
  const toolStore = useSpriteToolStore();
  const dragStore = useSpriteDragStore();
  const uiStore = useSpriteUIStore();

  // New project function
  const newProject = useCallback(() => {
    frameStore.reset();
    trackStore.reset();
    viewportStore.reset();
    toolStore.reset();
    dragStore.reset();
    uiStore.reset();
    refs.imageRef.current = null;
    void clearAutosaveData();
  }, [frameStore, trackStore, viewportStore, toolStore, dragStore, uiStore, refs.imageRef]);

  // Copy/Paste functions
  const copyFrame = useCallback(() => {
    if (frameStore.frames.length === 0) return;
    const frameToCopy = frameStore.frames[frameStore.currentFrameIndex];
    if (frameToCopy) {
      uiStore.copyFrame(frameToCopy);
    }
  }, [frameStore.frames, frameStore.currentFrameIndex, uiStore]);

  const pasteFrame = useCallback(() => {
    const clipboardFrame = uiStore.getClipboardFrame();
    if (!clipboardFrame) return;

    const newFrame: SpriteFrame = {
      ...deepCopyFrame(clipboardFrame),
      id: frameStore.nextFrameId,
    };

    frameStore.pushHistory();
    const insertIndex = frameStore.currentFrameIndex + 1;
    frameStore.setFrames((prev) => {
      const newFrames = [...prev];
      newFrames.splice(insertIndex, 0, newFrame);
      return newFrames;
    });
    frameStore.setNextFrameId((prev) => prev + 1);
    frameStore.setCurrentFrameIndex(insertIndex);
  }, [uiStore, frameStore]);

  return {
    // Image
    imageSrc: frameStore.imageSrc,
    setImageSrc: frameStore.setImageSrc,
    imageSize: frameStore.imageSize,
    setImageSize: frameStore.setImageSize,

    // Frames
    frames: frameStore.frames,
    setFrames: frameStore.setFrames,
    nextFrameId: frameStore.nextFrameId,
    setNextFrameId: frameStore.setNextFrameId,
    currentFrameIndex: frameStore.currentFrameIndex,
    setCurrentFrameIndex: frameStore.setCurrentFrameIndex,
    selectedFrameId: frameStore.selectedFrameId,
    setSelectedFrameId: frameStore.setSelectedFrameId,
    selectedPointIndex: frameStore.selectedPointIndex,
    setSelectedPointIndex: frameStore.setSelectedPointIndex,

    // Tools
    toolMode: toolStore.toolMode,
    setSpriteToolMode: toolStore.setSpriteToolMode,
    currentPoints: frameStore.currentPoints,
    setCurrentPoints: frameStore.setCurrentPoints,
    isSpacePressed: toolStore.isSpacePressed,
    setIsSpacePressed: toolStore.setIsSpacePressed,

    // Viewport
    zoom: viewportStore.zoom,
    setZoom: viewportStore.setZoom,
    pan: viewportStore.pan,
    setPan: viewportStore.setPan,
    scale: viewportStore.scale,
    setScale: viewportStore.setScale,
    canvasHeight: viewportStore.canvasHeight,
    setCanvasHeight: viewportStore.setCanvasHeight,
    isCanvasCollapsed: viewportStore.isCanvasCollapsed,
    setIsCanvasCollapsed: viewportStore.setIsCanvasCollapsed,

    // Animation
    isPlaying: frameStore.isPlaying,
    setIsPlaying: frameStore.setIsPlaying,
    fps: frameStore.fps,
    setFps: frameStore.setFps,

    // Timeline
    timelineMode: toolStore.timelineMode,
    setTimelineMode: toolStore.setTimelineMode,

    // Drag States
    isDragging: dragStore.isDragging,
    setIsDragging: dragStore.setIsDragging,
    dragStart: dragStore.dragStart,
    setDragStart: dragStore.setDragStart,
    isPanning: dragStore.isPanning,
    setIsPanning: dragStore.setIsPanning,
    lastPanPoint: dragStore.lastPanPoint,
    setLastPanPoint: dragStore.setLastPanPoint,
    draggedFrameId: dragStore.draggedFrameId,
    setDraggedFrameId: dragStore.setDraggedFrameId,
    dragOverIndex: dragStore.dragOverIndex,
    setDragOverIndex: dragStore.setDragOverIndex,
    editingOffsetFrameId: dragStore.editingOffsetFrameId,
    setEditingOffsetFrameId: dragStore.setEditingOffsetFrameId,
    offsetDragStart: dragStore.offsetDragStart,
    setOffsetDragStart: dragStore.setOffsetDragStart,
    isResizing: dragStore.isResizing,
    setIsResizing: dragStore.setIsResizing,

    // Windows
    isPreviewWindowOpen: uiStore.isPreviewWindowOpen,
    setIsPreviewWindowOpen: uiStore.setIsPreviewWindowOpen,
    isFrameEditOpen: uiStore.isFrameEditOpen,
    setIsFrameEditOpen: uiStore.setIsFrameEditOpen,
    isProjectListOpen: uiStore.isProjectListOpen,
    setIsProjectListOpen: uiStore.setIsProjectListOpen,
    isSpriteSheetImportOpen: uiStore.isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen: uiStore.setIsSpriteSheetImportOpen,
    isVideoImportOpen: uiStore.isVideoImportOpen,
    setIsVideoImportOpen: uiStore.setIsVideoImportOpen,
    pendingVideoFile: uiStore.pendingVideoFile,
    setPendingVideoFile: uiStore.setPendingVideoFile,

    // Brush Tool
    brushColor: toolStore.brushColor,
    setBrushColor: toolStore.setBrushColor,
    brushSize: toolStore.brushSize,
    setBrushSize: toolStore.setBrushSize,

    // History (Undo/Redo)
    canUndo: frameStore.canUndo,
    canRedo: frameStore.canRedo,
    undo: frameStore.undo,
    redo: frameStore.redo,
    pushHistory: frameStore.pushHistory,

    // Project
    projectName: uiStore.projectName,
    setProjectName: uiStore.setProjectName,
    savedProjects: uiStore.savedProjects,
    setSavedSpriteProjects: uiStore.setSavedSpriteProjects,
    currentProjectId: uiStore.currentProjectId,
    setCurrentProjectId: uiStore.setCurrentProjectId,
    newProject,

    // Clipboard
    copyFrame,
    pasteFrame,
    clipboardFrame: uiStore.clipboardFrame,

    // Refs
    ...refs,

    // Tracks (V2 multi-track)
    tracks: trackStore.tracks,
    activeTrackId: trackStore.activeTrackId,
    setActiveTrackId: trackStore.setActiveTrackId,
    addTrack: trackStore.addTrack,
    removeTrack: trackStore.removeTrack,
    updateTrack: trackStore.updateTrack,
    reorderTracks: trackStore.reorderTracks,
    addFramesToTrack: trackStore.addFramesToTrack,
    removeFrameFromTrack: trackStore.removeFrame,
    updateFrameInTrack: trackStore.updateFrame,
    reorderFramesInTrack: trackStore.reorderFrames,
    getActiveTrack: trackStore.getActiveTrack,
    getActiveTrackFrames: trackStore.getActiveTrackFrames,
    getMaxFrameCount: trackStore.getMaxFrameCount,
    restoreTracks: trackStore.restoreTracks,

    // Computed
    getTransformParams: viewportStore.getTransformParams,
  };
}

// ============================================
// Selector Hooks (Zustand-backed)
// ============================================

export function useEditorImage() {
  const { imageSrc, setImageSrc, imageSize, setImageSize } = useSpriteFrameStore();
  const { imageRef } = useEditorRefs();
  return { imageSrc, setImageSrc, imageSize, setImageSize, imageRef };
}

export function useEditorFrames() {
  const store = useSpriteFrameStore();
  return {
    frames: store.frames,
    setFrames: store.setFrames,
    nextFrameId: store.nextFrameId,
    setNextFrameId: store.setNextFrameId,
    currentFrameIndex: store.currentFrameIndex,
    setCurrentFrameIndex: store.setCurrentFrameIndex,
    selectedFrameId: store.selectedFrameId,
    setSelectedFrameId: store.setSelectedFrameId,
    selectedPointIndex: store.selectedPointIndex,
    setSelectedPointIndex: store.setSelectedPointIndex,
  };
}

export function useEditorTools() {
  const frameStore = useSpriteFrameStore();
  const toolStore = useSpriteToolStore();
  return {
    toolMode: toolStore.toolMode,
    setSpriteToolMode: toolStore.setSpriteToolMode,
    currentPoints: frameStore.currentPoints,
    setCurrentPoints: frameStore.setCurrentPoints,
    isSpacePressed: toolStore.isSpacePressed,
    setIsSpacePressed: toolStore.setIsSpacePressed,
  };
}

export function useEditorViewport() {
  const store = useSpriteViewportStore();
  return {
    zoom: store.zoom,
    setZoom: store.setZoom,
    pan: store.pan,
    setPan: store.setPan,
    scale: store.scale,
    setScale: store.setScale,
    canvasHeight: store.canvasHeight,
    setCanvasHeight: store.setCanvasHeight,
    isCanvasCollapsed: store.isCanvasCollapsed,
    setIsCanvasCollapsed: store.setIsCanvasCollapsed,
    getTransformParams: store.getTransformParams,
  };
}

export function useEditorAnimation() {
  const frameStore = useSpriteFrameStore();
  const { animationRef, lastFrameTimeRef } = useEditorRefs();
  return {
    isPlaying: frameStore.isPlaying,
    setIsPlaying: frameStore.setIsPlaying,
    fps: frameStore.fps,
    setFps: frameStore.setFps,
    animationRef,
    lastFrameTimeRef,
  };
}

export function useEditorDrag() {
  const store = useSpriteDragStore();
  const { didPanOrDragRef } = useEditorRefs();
  return {
    isDragging: store.isDragging,
    setIsDragging: store.setIsDragging,
    dragStart: store.dragStart,
    setDragStart: store.setDragStart,
    isPanning: store.isPanning,
    setIsPanning: store.setIsPanning,
    lastPanPoint: store.lastPanPoint,
    setLastPanPoint: store.setLastPanPoint,
    draggedFrameId: store.draggedFrameId,
    setDraggedFrameId: store.setDraggedFrameId,
    dragOverIndex: store.dragOverIndex,
    setDragOverIndex: store.setDragOverIndex,
    editingOffsetFrameId: store.editingOffsetFrameId,
    setEditingOffsetFrameId: store.setEditingOffsetFrameId,
    offsetDragStart: store.offsetDragStart,
    setOffsetDragStart: store.setOffsetDragStart,
    isResizing: store.isResizing,
    setIsResizing: store.setIsResizing,
    didPanOrDragRef,
  };
}

export function useEditorWindows() {
  const store = useSpriteUIStore();
  return {
    isPreviewWindowOpen: store.isPreviewWindowOpen,
    setIsPreviewWindowOpen: store.setIsPreviewWindowOpen,
    isFrameEditOpen: store.isFrameEditOpen,
    setIsFrameEditOpen: store.setIsFrameEditOpen,
    isProjectListOpen: store.isProjectListOpen,
    setIsProjectListOpen: store.setIsProjectListOpen,
    isSpriteSheetImportOpen: store.isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen: store.setIsSpriteSheetImportOpen,
    isVideoImportOpen: store.isVideoImportOpen,
    setIsVideoImportOpen: store.setIsVideoImportOpen,
    pendingVideoFile: store.pendingVideoFile,
    setPendingVideoFile: store.setPendingVideoFile,
  };
}

export function useEditorBrush() {
  const store = useSpriteToolStore();
  return {
    brushColor: store.brushColor,
    setBrushColor: store.setBrushColor,
    brushSize: store.brushSize,
    setBrushSize: store.setBrushSize,
  };
}

export function useEditorHistory() {
  const store = useSpriteFrameStore();
  return {
    canUndo: store.canUndo,
    canRedo: store.canRedo,
    undo: store.undo,
    redo: store.redo,
    pushHistory: store.pushHistory,
  };
}

export function useEditorTracks() {
  const store = useSpriteTrackStore();
  return {
    tracks: store.tracks,
    activeTrackId: store.activeTrackId,
    setActiveTrackId: store.setActiveTrackId,
    addTrack: store.addTrack,
    removeTrack: store.removeTrack,
    updateTrack: store.updateTrack,
    reorderTracks: store.reorderTracks,
    addFramesToTrack: store.addFramesToTrack,
    removeFrame: store.removeFrame,
    updateFrame: store.updateFrame,
    reorderFrames: store.reorderFrames,
    getActiveTrack: store.getActiveTrack,
    getActiveTrackFrames: store.getActiveTrackFrames,
    getMaxFrameCount: store.getMaxFrameCount,
    restoreTracks: store.restoreTracks,
  };
}

export function useEditorProject() {
  const uiStore = useSpriteUIStore();
  const frameStore = useSpriteFrameStore();
  const trackStore = useSpriteTrackStore();
  const viewportStore = useSpriteViewportStore();
  const toolStore = useSpriteToolStore();
  const dragStore = useSpriteDragStore();
  const refs = useEditorRefs();

  const newProject = useCallback(() => {
    frameStore.reset();
    trackStore.reset();
    viewportStore.reset();
    toolStore.reset();
    dragStore.reset();
    uiStore.reset();
    refs.imageRef.current = null;
    void clearAutosaveData();
  }, [frameStore, trackStore, viewportStore, toolStore, dragStore, uiStore, refs.imageRef]);

  return {
    projectName: uiStore.projectName,
    setProjectName: uiStore.setProjectName,
    savedProjects: uiStore.savedProjects,
    setSavedSpriteProjects: uiStore.setSavedSpriteProjects,
    currentProjectId: uiStore.currentProjectId,
    setCurrentProjectId: uiStore.setCurrentProjectId,
    newProject,
  };
}

export function useEditorClipboard() {
  const uiStore = useSpriteUIStore();
  const frameStore = useSpriteFrameStore();

  const copyFrame = useCallback(() => {
    if (frameStore.frames.length === 0) return;
    const frameToCopy = frameStore.frames[frameStore.currentFrameIndex];
    if (frameToCopy) {
      uiStore.copyFrame(frameToCopy);
    }
  }, [frameStore.frames, frameStore.currentFrameIndex, uiStore]);

  const pasteFrame = useCallback(() => {
    const clipboardFrame = uiStore.getClipboardFrame();
    if (!clipboardFrame) return;

    const newFrame: SpriteFrame = {
      ...deepCopyFrame(clipboardFrame),
      id: frameStore.nextFrameId,
    };

    frameStore.pushHistory();
    const insertIndex = frameStore.currentFrameIndex + 1;
    frameStore.setFrames((prev) => {
      const newFrames = [...prev];
      newFrames.splice(insertIndex, 0, newFrame);
      return newFrames;
    });
    frameStore.setNextFrameId((prev) => prev + 1);
    frameStore.setCurrentFrameIndex(insertIndex);
  }, [uiStore, frameStore]);

  return { copyFrame, pasteFrame, clipboardFrame: uiStore.clipboardFrame };
}

// Keep for backwards compatibility - now just returns refs from context
export { useEditorRefs as useEditorRefsHook };
