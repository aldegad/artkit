"use client";

import { createContext, useContext, useRef, useEffect, ReactNode, useCallback } from "react";
import { SpriteFrame } from "../types";
import { AUTOSAVE_DEBOUNCE_MS, loadAutosaveData, saveAutosaveData, clearAutosaveData } from "../utils/autosave";
import { deepCopyFrame } from "../utils/frameUtils";
import {
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
  const trackStore = useSpriteTrackStore();
  const viewportStore = useSpriteViewportStore();
  const uiStore = useSpriteUIStore();

  // Autosave: Load saved data on mount
  useEffect(() => {
    const loadData = async () => {
      const data = await loadAutosaveData();
      if (data) {
        // Restore image
        if (data.imageSrc) trackStore.setImageSrc(data.imageSrc);
        if (data.imageSize) trackStore.setImageSize(data.imageSize);

        // Restore tracks
        if (data.tracks && data.tracks.length > 0) {
          trackStore.restoreTracks(data.tracks, data.nextFrameId ?? 1);
        }
        if (data.fps) trackStore.setFps(data.fps);
        if (data.currentFrameIndex !== undefined) trackStore.setCurrentFrameIndex(data.currentFrameIndex);

        // Restore viewport state
        if (data.zoom) viewportStore.setZoom(data.zoom);
        if (data.pan) viewportStore.setPan(data.pan);
        if (data.scale) viewportStore.setScale(data.scale);

        // Restore per-panel viewport state
        if (data.animPreviewZoom) viewportStore.setAnimPreviewZoom(data.animPreviewZoom);
        if (data.animPreviewPan) viewportStore.setAnimPreviewPan(data.animPreviewPan);
        if (data.frameEditZoom) viewportStore.setFrameEditZoom(data.frameEditZoom);
        if (data.frameEditPan) viewportStore.setFrameEditPan(data.frameEditPan);

        // Restore animation state
        if (data.isPlaying !== undefined) trackStore.setIsPlaying(data.isPlaying);

        // Restore UI state
        if (data.projectName) uiStore.setProjectName(data.projectName);
      }
      isInitializedRef.current = true;
      uiStore.setIsAutosaveLoading(false);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Autosave: Save data when key states change (debounced)
  useEffect(() => {
    if (!isInitializedRef.current) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      // Read panel viewport from getState() to avoid subscribing to rapid changes
      const vpSnap = useSpriteViewportStore.getState();
      void saveAutosaveData({
        imageSrc: trackStore.imageSrc,
        imageSize: trackStore.imageSize,
        tracks: trackStore.tracks,
        nextFrameId: trackStore.nextFrameId,
        fps: trackStore.fps,
        currentFrameIndex: trackStore.currentFrameIndex,
        isPlaying: trackStore.isPlaying,
        zoom: viewportStore.zoom,
        pan: viewportStore.pan,
        scale: viewportStore.scale,
        projectName: uiStore.projectName,
        animPreviewZoom: vpSnap.animPreviewZoom,
        animPreviewPan: vpSnap.animPreviewPan,
        frameEditZoom: vpSnap.frameEditZoom,
        frameEditPan: vpSnap.frameEditPan,
      });
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    trackStore.imageSrc,
    trackStore.imageSize,
    trackStore.tracks,
    trackStore.nextFrameId,
    trackStore.fps,
    trackStore.currentFrameIndex,
    trackStore.isPlaying,
    viewportStore.zoom,
    viewportStore.pan,
    viewportStore.scale,
    uiStore.projectName,
  ]);

  // Separate subscribe for panel viewport changes (avoids re-rendering EditorProvider)
  useEffect(() => {
    const panelAutosaveRef = { timeout: null as NodeJS.Timeout | null };
    const unsub = useSpriteViewportStore.subscribe(
      (state, prev) => {
        if (!isInitializedRef.current) return;
        if (
          state.animPreviewZoom === prev.animPreviewZoom &&
          state.animPreviewPan === prev.animPreviewPan &&
          state.frameEditZoom === prev.frameEditZoom &&
          state.frameEditPan === prev.frameEditPan
        ) return;
        if (panelAutosaveRef.timeout) clearTimeout(panelAutosaveRef.timeout);
        panelAutosaveRef.timeout = setTimeout(() => {
          const ts = useSpriteTrackStore.getState();
          const vs = useSpriteViewportStore.getState();
          const us = useSpriteUIStore.getState();
          void saveAutosaveData({
            imageSrc: ts.imageSrc,
            imageSize: ts.imageSize,
            tracks: ts.tracks,
            nextFrameId: ts.nextFrameId,
            fps: ts.fps,
            currentFrameIndex: ts.currentFrameIndex,
            isPlaying: ts.isPlaying,
            zoom: vs.zoom,
            pan: vs.pan,
            scale: vs.scale,
            projectName: us.projectName,
            animPreviewZoom: vs.animPreviewZoom,
            animPreviewPan: vs.animPreviewPan,
            frameEditZoom: vs.frameEditZoom,
            frameEditPan: vs.frameEditPan,
          });
        }, AUTOSAVE_DEBOUNCE_MS);
      },
    );
    return () => {
      unsub();
      if (panelAutosaveRef.timeout) clearTimeout(panelAutosaveRef.timeout);
    };
  }, []);

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
// Legacy useEditor Hook (Facade over all stores)
// ============================================

export function useEditor() {
  const refs = useEditorRefs();
  const trackStore = useSpriteTrackStore();
  const viewportStore = useSpriteViewportStore();
  const toolStore = useSpriteToolStore();
  const dragStore = useSpriteDragStore();
  const uiStore = useSpriteUIStore();

  // Shim: frames = active track frames
  const frames = trackStore.getActiveTrackFrames();

  // Shim: setFrames operates on active track
  const setFrames = useCallback(
    (framesOrFn: SpriteFrame[] | ((prev: SpriteFrame[]) => SpriteFrame[])) => {
      const { activeTrackId } = useSpriteTrackStore.getState();
      if (!activeTrackId) return;
      const activeTrack = useSpriteTrackStore.getState().tracks.find((t) => t.id === activeTrackId);
      if (!activeTrack) return;
      const newFrames = typeof framesOrFn === "function" ? framesOrFn(activeTrack.frames) : framesOrFn;
      trackStore.updateTrack(activeTrackId, { frames: newFrames });
    },
    [trackStore],
  );

  // New project function
  const newProject = useCallback(() => {
    trackStore.reset();
    viewportStore.reset();
    toolStore.reset();
    dragStore.reset();
    uiStore.reset();
    refs.imageRef.current = null;
    void clearAutosaveData();
  }, [trackStore, viewportStore, toolStore, dragStore, uiStore, refs.imageRef]);

  // Copy/Paste operate on active track frames
  const copyFrame = useCallback(() => {
    if (frames.length === 0) return;
    const frameToCopy = frames[trackStore.currentFrameIndex];
    if (frameToCopy) {
      uiStore.copyFrame(frameToCopy);
    }
  }, [frames, trackStore.currentFrameIndex, uiStore]);

  const pasteFrame = useCallback(() => {
    const clipboardFrame = uiStore.getClipboardFrame();
    if (!clipboardFrame) return;
    const { activeTrackId } = useSpriteTrackStore.getState();
    if (!activeTrackId) return;
    const activeTrack = useSpriteTrackStore.getState().tracks.find((t) => t.id === activeTrackId);
    if (!activeTrack) return;

    const newFrame: SpriteFrame = {
      ...deepCopyFrame(clipboardFrame),
      id: trackStore.nextFrameId,
    };

    trackStore.pushHistory();
    const insertIndex = trackStore.currentFrameIndex + 1;
    const newFrames = [...activeTrack.frames];
    newFrames.splice(insertIndex, 0, newFrame);
    trackStore.updateTrack(activeTrackId, { frames: newFrames });
    trackStore.setNextFrameId((prev: number) => prev + 1);
    trackStore.setCurrentFrameIndex(insertIndex);
  }, [uiStore, trackStore]);

  return {
    // Image
    imageSrc: trackStore.imageSrc,
    setImageSrc: trackStore.setImageSrc,
    imageSize: trackStore.imageSize,
    setImageSize: trackStore.setImageSize,

    // Frames (shim over active track)
    frames,
    setFrames,
    nextFrameId: trackStore.nextFrameId,
    setNextFrameId: trackStore.setNextFrameId,
    currentFrameIndex: trackStore.currentFrameIndex,
    setCurrentFrameIndex: trackStore.setCurrentFrameIndex,
    selectedFrameId: trackStore.selectedFrameId,
    setSelectedFrameId: trackStore.setSelectedFrameId,
    selectedFrameIds: trackStore.selectedFrameIds,
    setSelectedFrameIds: trackStore.setSelectedFrameIds,
    toggleSelectedFrameId: trackStore.toggleSelectedFrameId,
    selectFrameRange: trackStore.selectFrameRange,
    selectedPointIndex: trackStore.selectedPointIndex,
    setSelectedPointIndex: trackStore.setSelectedPointIndex,

    // Tools
    toolMode: toolStore.toolMode,
    setSpriteToolMode: toolStore.setSpriteToolMode,
    currentPoints: trackStore.currentPoints,
    setCurrentPoints: trackStore.setCurrentPoints,
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
    isPlaying: trackStore.isPlaying,
    setIsPlaying: trackStore.setIsPlaying,
    fps: trackStore.fps,
    setFps: trackStore.setFps,

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
    draggedTrackId: dragStore.draggedTrackId,
    setDraggedTrackId: dragStore.setDraggedTrackId,
    dragOverTrackIndex: dragStore.dragOverTrackIndex,
    setDragOverTrackIndex: dragStore.setDragOverTrackIndex,
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
    canUndo: trackStore.canUndo,
    canRedo: trackStore.canRedo,
    undo: trackStore.undo,
    redo: trackStore.redo,
    pushHistory: trackStore.pushHistory,

    // Project
    projectName: uiStore.projectName,
    setProjectName: uiStore.setProjectName,
    savedProjects: uiStore.savedProjects,
    setSavedSpriteProjects: uiStore.setSavedSpriteProjects,
    currentProjectId: uiStore.currentProjectId,
    setCurrentProjectId: uiStore.setCurrentProjectId,
    newProject,

    // Clipboard (frame)
    copyFrame,
    pasteFrame,
    clipboardFrame: uiStore.clipboardFrame,

    // Clipboard (track)
    copyTrack: uiStore.copyTrack,
    getClipboardTrack: uiStore.getClipboardTrack,
    clipboardTrack: uiStore.clipboardTrack,

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

    // Loading
    isAutosaveLoading: uiStore.isAutosaveLoading,

    // Computed
    getTransformParams: viewportStore.getTransformParams,
  };
}

// ============================================
// Selector Hooks (Zustand-backed)
// ============================================

export function useEditorImage() {
  const { imageSrc, setImageSrc, imageSize, setImageSize } = useSpriteTrackStore();
  const { imageRef } = useEditorRefs();
  return { imageSrc, setImageSrc, imageSize, setImageSize, imageRef };
}

export function useEditorFrames() {
  const store = useSpriteTrackStore();
  const frames = store.getActiveTrackFrames();

  const setFrames = useCallback(
    (framesOrFn: SpriteFrame[] | ((prev: SpriteFrame[]) => SpriteFrame[])) => {
      const { activeTrackId, tracks } = useSpriteTrackStore.getState();
      if (!activeTrackId) return;
      const activeTrack = tracks.find((t) => t.id === activeTrackId);
      if (!activeTrack) return;
      const newFrames = typeof framesOrFn === "function" ? framesOrFn(activeTrack.frames) : framesOrFn;
      store.updateTrack(activeTrackId, { frames: newFrames });
    },
    [store],
  );

  return {
    frames,
    setFrames,
    nextFrameId: store.nextFrameId,
    setNextFrameId: store.setNextFrameId,
    currentFrameIndex: store.currentFrameIndex,
    setCurrentFrameIndex: store.setCurrentFrameIndex,
    selectedFrameId: store.selectedFrameId,
    setSelectedFrameId: store.setSelectedFrameId,
    selectedFrameIds: store.selectedFrameIds,
    setSelectedFrameIds: store.setSelectedFrameIds,
    toggleSelectedFrameId: store.toggleSelectedFrameId,
    selectFrameRange: store.selectFrameRange,
    selectedPointIndex: store.selectedPointIndex,
    setSelectedPointIndex: store.setSelectedPointIndex,
  };
}

export function useEditorTools() {
  const trackStore = useSpriteTrackStore();
  const toolStore = useSpriteToolStore();
  return {
    toolMode: toolStore.toolMode,
    setSpriteToolMode: toolStore.setSpriteToolMode,
    currentPoints: trackStore.currentPoints,
    setCurrentPoints: trackStore.setCurrentPoints,
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
  const trackStore = useSpriteTrackStore();
  const { animationRef, lastFrameTimeRef } = useEditorRefs();
  return {
    isPlaying: trackStore.isPlaying,
    setIsPlaying: trackStore.setIsPlaying,
    fps: trackStore.fps,
    setFps: trackStore.setFps,
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
    draggedTrackId: store.draggedTrackId,
    setDraggedTrackId: store.setDraggedTrackId,
    dragOverTrackIndex: store.dragOverTrackIndex,
    setDragOverTrackIndex: store.setDragOverTrackIndex,
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
  const store = useSpriteTrackStore();
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
  const trackStore = useSpriteTrackStore();
  const viewportStore = useSpriteViewportStore();
  const toolStore = useSpriteToolStore();
  const dragStore = useSpriteDragStore();
  const refs = useEditorRefs();

  const newProject = useCallback(() => {
    trackStore.reset();
    viewportStore.reset();
    toolStore.reset();
    dragStore.reset();
    uiStore.reset();
    refs.imageRef.current = null;
    void clearAutosaveData();
  }, [trackStore, viewportStore, toolStore, dragStore, uiStore, refs.imageRef]);

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
  const trackStore = useSpriteTrackStore();

  const frames = trackStore.getActiveTrackFrames();

  const copyFrame = useCallback(() => {
    if (frames.length === 0) return;
    const frameToCopy = frames[trackStore.currentFrameIndex];
    if (frameToCopy) {
      uiStore.copyFrame(frameToCopy);
    }
  }, [frames, trackStore.currentFrameIndex, uiStore]);

  const pasteFrame = useCallback(() => {
    const clipboardFrame = uiStore.getClipboardFrame();
    if (!clipboardFrame) return;
    const { activeTrackId, tracks } = useSpriteTrackStore.getState();
    if (!activeTrackId) return;
    const activeTrack = tracks.find((t) => t.id === activeTrackId);
    if (!activeTrack) return;

    const newFrame: SpriteFrame = {
      ...deepCopyFrame(clipboardFrame),
      id: trackStore.nextFrameId,
    };

    trackStore.pushHistory();
    const insertIndex = trackStore.currentFrameIndex + 1;
    const newFrames = [...activeTrack.frames];
    newFrames.splice(insertIndex, 0, newFrame);
    trackStore.updateTrack(activeTrackId, { frames: newFrames });
    trackStore.setNextFrameId((prev: number) => prev + 1);
    trackStore.setCurrentFrameIndex(insertIndex);
  }, [uiStore, trackStore]);

  const copyTrack = useCallback(() => {
    const activeTrack = trackStore.getActiveTrack();
    if (activeTrack) {
      uiStore.copyTrack(activeTrack);
    }
  }, [trackStore, uiStore]);

  const pasteTrack = useCallback(() => {
    const clipboard = uiStore.getClipboardTrack();
    if (!clipboard) return;
    trackStore.pushHistory();
    trackStore.addTrack(clipboard.name + " (Copy)", clipboard.frames);
  }, [uiStore, trackStore]);

  return {
    copyFrame,
    pasteFrame,
    clipboardFrame: uiStore.clipboardFrame,
    copyTrack,
    pasteTrack,
    clipboardTrack: uiStore.clipboardTrack,
  };
}

// Keep for backwards compatibility - now just returns refs from context
export { useEditorRefs as useEditorRefsHook };
