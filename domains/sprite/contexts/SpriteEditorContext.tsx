"use client";

import { createContext, useContext, useRef, useEffect, ReactNode, useCallback, useMemo } from "react";
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

  // Track store actions (selector-based to avoid provider-wide re-renders)
  const setImageSrc = useSpriteTrackStore((s) => s.setImageSrc);
  const setImageSize = useSpriteTrackStore((s) => s.setImageSize);
  const restoreTracks = useSpriteTrackStore((s) => s.restoreTracks);
  const setFps = useSpriteTrackStore((s) => s.setFps);
  const setCurrentFrameIndex = useSpriteTrackStore((s) => s.setCurrentFrameIndex);
  const setIsPlaying = useSpriteTrackStore((s) => s.setIsPlaying);

  // Viewport store actions (selector-based)
  const setZoom = useSpriteViewportStore((s) => s.setZoom);
  const setPan = useSpriteViewportStore((s) => s.setPan);
  const setScale = useSpriteViewportStore((s) => s.setScale);
  const setAnimPreviewZoom = useSpriteViewportStore((s) => s.setAnimPreviewZoom);
  const setAnimPreviewPan = useSpriteViewportStore((s) => s.setAnimPreviewPan);
  const setFrameEditZoom = useSpriteViewportStore((s) => s.setFrameEditZoom);
  const setFrameEditPan = useSpriteViewportStore((s) => s.setFrameEditPan);

  // UI store actions (selector-based)
  const setProjectName = useSpriteUIStore((s) => s.setProjectName);
  const setCurrentProjectId = useSpriteUIStore((s) => s.setCurrentProjectId);
  const setCanvasSize = useSpriteUIStore((s) => s.setCanvasSize);
  const setIsAutosaveLoading = useSpriteUIStore((s) => s.setIsAutosaveLoading);

  // Autosave: Load saved data on mount
  useEffect(() => {
    const loadData = async () => {
      const data = await loadAutosaveData();
      if (data) {
        // Restore image
        if (data.imageSrc) setImageSrc(data.imageSrc);
        if (data.imageSize) setImageSize(data.imageSize);

        // Restore tracks
        if (data.tracks && data.tracks.length > 0) {
          restoreTracks(data.tracks, data.nextFrameId ?? 1);
        }
        if (data.fps) setFps(data.fps);
        // Playback state is intentionally not restored.
        setCurrentFrameIndex(0);

        // Restore viewport state
        if (data.zoom) setZoom(data.zoom);
        if (data.pan) setPan(data.pan);
        if (data.scale) setScale(data.scale);

        // Restore per-panel viewport state
        if (data.animPreviewZoom) setAnimPreviewZoom(data.animPreviewZoom);
        if (data.animPreviewPan) setAnimPreviewPan(data.animPreviewPan);
        if (data.frameEditZoom) setFrameEditZoom(data.frameEditZoom);
        if (data.frameEditPan) setFrameEditPan(data.frameEditPan);

        // Always start in paused state after restore/load.
        setIsPlaying(false);

        // Restore UI state
        if (data.projectName) setProjectName(data.projectName);
        if (data.currentProjectId !== undefined) {
          setCurrentProjectId(data.currentProjectId);
        }
        if (data.canvasSize) {
          setCanvasSize(data.canvasSize);
        }
      }
      isInitializedRef.current = true;
      setIsAutosaveLoading(false);
    };
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const queueAutosave = useCallback(() => {
    if (!isInitializedRef.current) return;
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }
    autosaveTimeoutRef.current = setTimeout(() => {
      const ts = useSpriteTrackStore.getState();
      const vs = useSpriteViewportStore.getState();
      const us = useSpriteUIStore.getState();

      void saveAutosaveData({
        imageSrc: ts.imageSrc,
        imageSize: ts.imageSize,
        tracks: ts.tracks,
        nextFrameId: ts.nextFrameId,
        fps: ts.fps,
        currentProjectId: us.currentProjectId,
        canvasSize: us.canvasSize ?? undefined,
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
  }, []);

  // Autosave subscriptions (no provider re-renders)
  useEffect(() => {
    const unsubTrack = useSpriteTrackStore.subscribe((state, prev) => {
      if (
        state.imageSrc === prev.imageSrc &&
        state.imageSize === prev.imageSize &&
        state.tracks === prev.tracks &&
        state.nextFrameId === prev.nextFrameId &&
        state.fps === prev.fps
      ) {
        return;
      }
      queueAutosave();
    });

    const unsubViewport = useSpriteViewportStore.subscribe((state, prev) => {
      if (
        state.zoom === prev.zoom &&
        state.pan.x === prev.pan.x &&
        state.pan.y === prev.pan.y &&
        state.scale === prev.scale &&
        state.animPreviewZoom === prev.animPreviewZoom &&
        state.animPreviewPan.x === prev.animPreviewPan.x &&
        state.animPreviewPan.y === prev.animPreviewPan.y &&
        state.frameEditZoom === prev.frameEditZoom &&
        state.frameEditPan.x === prev.frameEditPan.x &&
        state.frameEditPan.y === prev.frameEditPan.y
      ) {
        return;
      }
      queueAutosave();
    });

    const unsubUI = useSpriteUIStore.subscribe((state, prev) => {
      if (
        state.projectName === prev.projectName &&
        state.currentProjectId === prev.currentProjectId &&
        state.canvasSize?.width === prev.canvasSize?.width &&
        state.canvasSize?.height === prev.canvasSize?.height
      ) {
        return;
      }
      queueAutosave();
    });

    return () => {
      unsubTrack();
      unsubViewport();
      unsubUI();
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [queueAutosave]);

  const refsValue: EditorRefsContextValue = useMemo(
    () => ({
      canvasRef,
      canvasContainerRef,
      previewCanvasRef,
      imageRef,
      animationRef,
      lastFrameTimeRef,
      didPanOrDragRef,
    }),
    [],
  );

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
// Selector Hooks (Zustand-backed)
// ============================================

export function useEditorImage() {
  const imageSrc = useSpriteTrackStore((s) => s.imageSrc);
  const setImageSrc = useSpriteTrackStore((s) => s.setImageSrc);
  const imageSize = useSpriteTrackStore((s) => s.imageSize);
  const setImageSize = useSpriteTrackStore((s) => s.setImageSize);
  const { imageRef } = useEditorRefs();
  return { imageSrc, setImageSrc, imageSize, setImageSize, imageRef };
}

export function useEditorFrames() {
  return useEditorFramesMeta();
}

export function useEditorFramesMeta() {
  const activeTrackId = useSpriteTrackStore((s) => s.activeTrackId);
  const tracks = useSpriteTrackStore((s) => s.tracks);
  const updateTrack = useSpriteTrackStore((s) => s.updateTrack);
  const nextFrameId = useSpriteTrackStore((s) => s.nextFrameId);
  const setNextFrameId = useSpriteTrackStore((s) => s.setNextFrameId);
  const selectedFrameId = useSpriteTrackStore((s) => s.selectedFrameId);
  const setSelectedFrameId = useSpriteTrackStore((s) => s.setSelectedFrameId);
  const selectedFrameIds = useSpriteTrackStore((s) => s.selectedFrameIds);
  const setSelectedFrameIds = useSpriteTrackStore((s) => s.setSelectedFrameIds);
  const toggleSelectedFrameId = useSpriteTrackStore((s) => s.toggleSelectedFrameId);
  const selectFrameRange = useSpriteTrackStore((s) => s.selectFrameRange);
  const selectedPointIndex = useSpriteTrackStore((s) => s.selectedPointIndex);
  const setSelectedPointIndex = useSpriteTrackStore((s) => s.setSelectedPointIndex);

  const frames = useMemo(() => {
    const activeTrack = tracks.find((t) => t.id === activeTrackId);
    return activeTrack?.frames ?? [];
  }, [tracks, activeTrackId]);

  const setFrames = useCallback(
    (framesOrFn: SpriteFrame[] | ((prev: SpriteFrame[]) => SpriteFrame[])) => {
      if (!activeTrackId) return;
      const activeTrack = tracks.find((t) => t.id === activeTrackId);
      if (!activeTrack) return;
      const newFrames = typeof framesOrFn === "function" ? framesOrFn(activeTrack.frames) : framesOrFn;
      updateTrack(activeTrackId, { frames: newFrames });
    },
    [activeTrackId, tracks, updateTrack],
  );

  return {
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    selectedFrameId,
    setSelectedFrameId,
    selectedFrameIds,
    setSelectedFrameIds,
    toggleSelectedFrameId,
    selectFrameRange,
    selectedPointIndex,
    setSelectedPointIndex,
  };
}

export function useEditorTools() {
  const toolMode = useSpriteToolStore((s) => s.toolMode);
  const setSpriteToolMode = useSpriteToolStore((s) => s.setSpriteToolMode);
  const frameEditToolMode = useSpriteToolStore((s) => s.frameEditToolMode);
  const setFrameEditToolMode = useSpriteToolStore((s) => s.setFrameEditToolMode);
  const cropArea = useSpriteToolStore((s) => s.cropArea);
  const setCropArea = useSpriteToolStore((s) => s.setCropArea);
  const cropAspectRatio = useSpriteToolStore((s) => s.cropAspectRatio);
  const setCropAspectRatio = useSpriteToolStore((s) => s.setCropAspectRatio);
  const lockCropAspect = useSpriteToolStore((s) => s.lockCropAspect);
  const setLockCropAspect = useSpriteToolStore((s) => s.setLockCropAspect);
  const canvasExpandMode = useSpriteToolStore((s) => s.canvasExpandMode);
  const setCanvasExpandMode = useSpriteToolStore((s) => s.setCanvasExpandMode);
  const magicWandTolerance = useSpriteToolStore((s) => s.magicWandTolerance);
  const setMagicWandTolerance = useSpriteToolStore((s) => s.setMagicWandTolerance);
  const magicWandFeather = useSpriteToolStore((s) => s.magicWandFeather);
  const setMagicWandFeather = useSpriteToolStore((s) => s.setMagicWandFeather);
  const currentPoints = useSpriteTrackStore((s) => s.currentPoints);
  const setCurrentPoints = useSpriteTrackStore((s) => s.setCurrentPoints);
  const isSpacePressed = useSpriteToolStore((s) => s.isSpacePressed);
  const setIsSpacePressed = useSpriteToolStore((s) => s.setIsSpacePressed);
  const isPanLocked = useSpriteToolStore((s) => s.isPanLocked);
  const setIsPanLocked = useSpriteToolStore((s) => s.setIsPanLocked);
  const timelineMode = useSpriteToolStore((s) => s.timelineMode);
  const setTimelineMode = useSpriteToolStore((s) => s.setTimelineMode);
  return {
    toolMode,
    setSpriteToolMode,
    frameEditToolMode,
    setFrameEditToolMode,
    cropArea,
    setCropArea,
    cropAspectRatio,
    setCropAspectRatio,
    lockCropAspect,
    setLockCropAspect,
    canvasExpandMode,
    setCanvasExpandMode,
    magicWandTolerance,
    setMagicWandTolerance,
    magicWandFeather,
    setMagicWandFeather,
    currentPoints,
    setCurrentPoints,
    isSpacePressed,
    setIsSpacePressed,
    isPanLocked,
    setIsPanLocked,
    timelineMode,
    setTimelineMode,
  };
}

export function useEditorViewport() {
  const zoom = useSpriteViewportStore((s) => s.zoom);
  const setZoom = useSpriteViewportStore((s) => s.setZoom);
  const pan = useSpriteViewportStore((s) => s.pan);
  const setPan = useSpriteViewportStore((s) => s.setPan);
  const scale = useSpriteViewportStore((s) => s.scale);
  const setScale = useSpriteViewportStore((s) => s.setScale);
  const canvasHeight = useSpriteViewportStore((s) => s.canvasHeight);
  const setCanvasHeight = useSpriteViewportStore((s) => s.setCanvasHeight);
  const isCanvasCollapsed = useSpriteViewportStore((s) => s.isCanvasCollapsed);
  const setIsCanvasCollapsed = useSpriteViewportStore((s) => s.setIsCanvasCollapsed);
  const getTransformParams = useSpriteViewportStore((s) => s.getTransformParams);

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
  const isPlaying = useSpriteTrackStore((s) => s.isPlaying);
  const setIsPlaying = useSpriteTrackStore((s) => s.setIsPlaying);
  const fps = useSpriteTrackStore((s) => s.fps);
  const setFps = useSpriteTrackStore((s) => s.setFps);
  const { animationRef, lastFrameTimeRef } = useEditorRefs();

  return {
    isPlaying,
    setIsPlaying,
    fps,
    setFps,
    animationRef,
    lastFrameTimeRef,
  };
}

export function useEditorDrag() {
  const isDragging = useSpriteDragStore((s) => s.isDragging);
  const setIsDragging = useSpriteDragStore((s) => s.setIsDragging);
  const dragStart = useSpriteDragStore((s) => s.dragStart);
  const setDragStart = useSpriteDragStore((s) => s.setDragStart);
  const isPanning = useSpriteDragStore((s) => s.isPanning);
  const setIsPanning = useSpriteDragStore((s) => s.setIsPanning);
  const lastPanPoint = useSpriteDragStore((s) => s.lastPanPoint);
  const setLastPanPoint = useSpriteDragStore((s) => s.setLastPanPoint);
  const draggedFrameId = useSpriteDragStore((s) => s.draggedFrameId);
  const setDraggedFrameId = useSpriteDragStore((s) => s.setDraggedFrameId);
  const dragOverIndex = useSpriteDragStore((s) => s.dragOverIndex);
  const setDragOverIndex = useSpriteDragStore((s) => s.setDragOverIndex);
  const draggedTrackId = useSpriteDragStore((s) => s.draggedTrackId);
  const setDraggedTrackId = useSpriteDragStore((s) => s.setDraggedTrackId);
  const dragOverTrackIndex = useSpriteDragStore((s) => s.dragOverTrackIndex);
  const setDragOverTrackIndex = useSpriteDragStore((s) => s.setDragOverTrackIndex);
  const editingOffsetFrameId = useSpriteDragStore((s) => s.editingOffsetFrameId);
  const setEditingOffsetFrameId = useSpriteDragStore((s) => s.setEditingOffsetFrameId);
  const offsetDragStart = useSpriteDragStore((s) => s.offsetDragStart);
  const setOffsetDragStart = useSpriteDragStore((s) => s.setOffsetDragStart);
  const isResizing = useSpriteDragStore((s) => s.isResizing);
  const setIsResizing = useSpriteDragStore((s) => s.setIsResizing);
  const { didPanOrDragRef } = useEditorRefs();

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
    draggedTrackId,
    setDraggedTrackId,
    dragOverTrackIndex,
    setDragOverTrackIndex,
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
  const isPreviewWindowOpen = useSpriteUIStore((s) => s.isPreviewWindowOpen);
  const setIsPreviewWindowOpen = useSpriteUIStore((s) => s.setIsPreviewWindowOpen);
  const isFrameEditOpen = useSpriteUIStore((s) => s.isFrameEditOpen);
  const setIsFrameEditOpen = useSpriteUIStore((s) => s.setIsFrameEditOpen);
  const isProjectListOpen = useSpriteUIStore((s) => s.isProjectListOpen);
  const setIsProjectListOpen = useSpriteUIStore((s) => s.setIsProjectListOpen);
  const isSpriteSheetImportOpen = useSpriteUIStore((s) => s.isSpriteSheetImportOpen);
  const setIsSpriteSheetImportOpen = useSpriteUIStore((s) => s.setIsSpriteSheetImportOpen);
  const isVideoImportOpen = useSpriteUIStore((s) => s.isVideoImportOpen);
  const setIsVideoImportOpen = useSpriteUIStore((s) => s.setIsVideoImportOpen);
  const pendingVideoFile = useSpriteUIStore((s) => s.pendingVideoFile);
  const setPendingVideoFile = useSpriteUIStore((s) => s.setPendingVideoFile);
  const canvasSize = useSpriteUIStore((s) => s.canvasSize);
  const setCanvasSize = useSpriteUIStore((s) => s.setCanvasSize);

  return {
    isPreviewWindowOpen,
    setIsPreviewWindowOpen,
    isFrameEditOpen,
    setIsFrameEditOpen,
    isProjectListOpen,
    setIsProjectListOpen,
    isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen,
    isVideoImportOpen,
    setIsVideoImportOpen,
    pendingVideoFile,
    setPendingVideoFile,
    canvasSize,
    setCanvasSize,
  };
}

export function useEditorBrush() {
  const brushColor = useSpriteToolStore((s) => s.brushColor);
  const setBrushColor = useSpriteToolStore((s) => s.setBrushColor);
  const brushSize = useSpriteToolStore((s) => s.brushSize);
  const setBrushSize = useSpriteToolStore((s) => s.setBrushSize);
  const brushHardness = useSpriteToolStore((s) => s.brushHardness);
  const setBrushHardness = useSpriteToolStore((s) => s.setBrushHardness);
  const activePreset = useSpriteToolStore((s) => s.activePreset);
  const setActivePreset = useSpriteToolStore((s) => s.setActivePreset);
  const presets = useSpriteToolStore((s) => s.presets);
  const pressureEnabled = useSpriteToolStore((s) => s.pressureEnabled);
  const setPressureEnabled = useSpriteToolStore((s) => s.setPressureEnabled);

  return {
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    brushHardness,
    setBrushHardness,
    activePreset,
    setActivePreset,
    presets,
    pressureEnabled,
    setPressureEnabled,
  };
}

export function useEditorHistory() {
  const canUndo = useSpriteTrackStore((s) => s.canUndo);
  const canRedo = useSpriteTrackStore((s) => s.canRedo);
  const undo = useSpriteTrackStore((s) => s.undo);
  const redo = useSpriteTrackStore((s) => s.redo);
  const pushHistory = useSpriteTrackStore((s) => s.pushHistory);
  return {
    canUndo,
    canRedo,
    undo,
    redo,
    pushHistory,
  };
}

export function useEditorTracks() {
  const tracks = useSpriteTrackStore((s) => s.tracks);
  const activeTrackId = useSpriteTrackStore((s) => s.activeTrackId);
  const setActiveTrackId = useSpriteTrackStore((s) => s.setActiveTrackId);
  const addTrack = useSpriteTrackStore((s) => s.addTrack);
  const duplicateTrack = useSpriteTrackStore((s) => s.duplicateTrack);
  const removeTrack = useSpriteTrackStore((s) => s.removeTrack);
  const reverseTrackFrames = useSpriteTrackStore((s) => s.reverseTrackFrames);
  const updateTrack = useSpriteTrackStore((s) => s.updateTrack);
  const reorderTracks = useSpriteTrackStore((s) => s.reorderTracks);
  const addFramesToTrack = useSpriteTrackStore((s) => s.addFramesToTrack);
  const insertEmptyFrameToTrack = useSpriteTrackStore((s) => s.insertEmptyFrameToTrack);
  const removeFrame = useSpriteTrackStore((s) => s.removeFrame);
  const updateFrame = useSpriteTrackStore((s) => s.updateFrame);
  const reorderFrames = useSpriteTrackStore((s) => s.reorderFrames);
  const getActiveTrack = useSpriteTrackStore((s) => s.getActiveTrack);
  const getActiveTrackFrames = useSpriteTrackStore((s) => s.getActiveTrackFrames);
  const getMaxFrameCount = useSpriteTrackStore((s) => s.getMaxFrameCount);
  const restoreTracks = useSpriteTrackStore((s) => s.restoreTracks);
  return {
    tracks,
    activeTrackId,
    setActiveTrackId,
    addTrack,
    duplicateTrack,
    removeTrack,
    reverseTrackFrames,
    updateTrack,
    reorderTracks,
    addFramesToTrack,
    insertEmptyFrameToTrack,
    removeFrame,
    updateFrame,
    reorderFrames,
    getActiveTrack,
    getActiveTrackFrames,
    getMaxFrameCount,
    restoreTracks,
  };
}

export function useEditorProject() {
  const projectName = useSpriteUIStore((s) => s.projectName);
  const setProjectName = useSpriteUIStore((s) => s.setProjectName);
  const savedProjects = useSpriteUIStore((s) => s.savedProjects);
  const setSavedSpriteProjects = useSpriteUIStore((s) => s.setSavedSpriteProjects);
  const currentProjectId = useSpriteUIStore((s) => s.currentProjectId);
  const setCurrentProjectId = useSpriteUIStore((s) => s.setCurrentProjectId);
  const isAutosaveLoading = useSpriteUIStore((s) => s.isAutosaveLoading);
  const resetUI = useSpriteUIStore((s) => s.reset);
  const resetTrack = useSpriteTrackStore((s) => s.reset);
  const resetViewport = useSpriteViewportStore((s) => s.reset);
  const resetTool = useSpriteToolStore((s) => s.reset);
  const resetDrag = useSpriteDragStore((s) => s.reset);
  const refs = useEditorRefs();

  const newProject = useCallback(() => {
    resetTrack();
    resetViewport();
    resetTool();
    resetDrag();
    resetUI();
    refs.imageRef.current = null;
    void clearAutosaveData();
  }, [resetTrack, resetViewport, resetTool, resetDrag, resetUI, refs.imageRef]);

  return {
    projectName,
    setProjectName,
    savedProjects,
    setSavedSpriteProjects,
    currentProjectId,
    setCurrentProjectId,
    newProject,
    isAutosaveLoading,
  };
}

export function useEditorClipboard() {
  const copyFrameToClipboard = useSpriteUIStore((s) => s.copyFrame);
  const copyFramesToClipboard = useSpriteUIStore((s) => s.copyFrames);
  const getClipboardFrame = useSpriteUIStore((s) => s.getClipboardFrame);
  const getClipboardFrames = useSpriteUIStore((s) => s.getClipboardFrames);
  const copyTrackToClipboard = useSpriteUIStore((s) => s.copyTrack);
  const getClipboardTrack = useSpriteUIStore((s) => s.getClipboardTrack);
  const clipboardFrame = useSpriteUIStore((s) => s.clipboardFrame);
  const clipboardTrack = useSpriteUIStore((s) => s.clipboardTrack);
  const pushHistory = useSpriteTrackStore((s) => s.pushHistory);
  const updateTrack = useSpriteTrackStore((s) => s.updateTrack);
  const setNextFrameId = useSpriteTrackStore((s) => s.setNextFrameId);
  const setCurrentFrameIndex = useSpriteTrackStore((s) => s.setCurrentFrameIndex);
  const setSelectedFrameId = useSpriteTrackStore((s) => s.setSelectedFrameId);
  const setSelectedFrameIds = useSpriteTrackStore((s) => s.setSelectedFrameIds);
  const addTrack = useSpriteTrackStore((s) => s.addTrack);

  const copyFrame = useCallback(() => {
    const state = useSpriteTrackStore.getState();
    const frames = state.getActiveTrackFrames();
    if (frames.length === 0) return;
    let framesToCopy: SpriteFrame[] = [];

    if (state.selectedFrameIds.length > 0) {
      const selectedIdSet = new Set(state.selectedFrameIds);
      framesToCopy = frames.filter((frame) => selectedIdSet.has(frame.id));
    }

    if (framesToCopy.length === 0) {
      const frameToCopy = frames[state.currentFrameIndex];
      if (frameToCopy) {
        framesToCopy = [frameToCopy];
      }
    }

    if (framesToCopy.length === 0) return;
    if (framesToCopy.length === 1) {
      copyFrameToClipboard(framesToCopy[0]);
      return;
    }
    copyFramesToClipboard(framesToCopy);
  }, [copyFrameToClipboard, copyFramesToClipboard]);

  const pasteFrame = useCallback(() => {
    const copiedFrames = getClipboardFrames();
    if (copiedFrames.length === 0) {
      const singleFrame = getClipboardFrame();
      if (!singleFrame) return;
      copiedFrames.push(singleFrame);
    }
    const state = useSpriteTrackStore.getState();
    const { activeTrackId, tracks } = state;
    if (!activeTrackId) return;
    const activeTrack = tracks.find((t) => t.id === activeTrackId);
    if (!activeTrack) return;

    const selectedFrameIndex = state.selectedFrameId !== null
      ? activeTrack.frames.findIndex((frame) => frame.id === state.selectedFrameId)
      : -1;

    const boundedCurrentFrameIndex = Math.max(0, Math.min(state.currentFrameIndex, activeTrack.frames.length - 1));
    const anchorIndex = selectedFrameIndex >= 0 ? selectedFrameIndex : boundedCurrentFrameIndex;
    const insertIndex = activeTrack.frames.length > 0
      ? Math.min(anchorIndex + 1, activeTrack.frames.length)
      : 0;

    const insertedFrames = copiedFrames.map((copiedFrame, idx) => ({
      ...deepCopyFrame(copiedFrame),
      id: state.nextFrameId + idx,
    }));
    if (insertedFrames.length === 0) return;
    const insertedFrameIds = insertedFrames.map((frame) => frame.id);

    pushHistory();
    const newFrames = [...activeTrack.frames];
    newFrames.splice(insertIndex, 0, ...insertedFrames);
    updateTrack(activeTrackId, { frames: newFrames });
    setNextFrameId((prev: number) => prev + insertedFrames.length);
    setCurrentFrameIndex(insertIndex);
    setSelectedFrameIds(insertedFrameIds);
    setSelectedFrameId(insertedFrameIds[0] ?? null);
  }, [
    getClipboardFrames,
    getClipboardFrame,
    pushHistory,
    updateTrack,
    setNextFrameId,
    setCurrentFrameIndex,
    setSelectedFrameIds,
    setSelectedFrameId,
  ]);

  const copyTrack = useCallback(() => {
    const activeTrack = useSpriteTrackStore.getState().getActiveTrack();
    if (activeTrack) {
      copyTrackToClipboard(activeTrack);
    }
  }, [copyTrackToClipboard]);

  const pasteTrack = useCallback(() => {
    const clipboard = getClipboardTrack();
    if (!clipboard) return;
    pushHistory();
    addTrack(clipboard.name + " (Copy)", clipboard.frames);
  }, [getClipboardTrack, pushHistory, addTrack]);

  return {
    copyFrame,
    pasteFrame,
    clipboardFrame,
    copyTrack,
    pasteTrack,
    clipboardTrack,
  };
}
