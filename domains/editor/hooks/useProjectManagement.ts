"use client";

import { useState, useCallback, useEffect, useRef, RefObject } from "react";
import { UnifiedLayer, SavedImageProject, Point } from "../types";
import {
  loadEditorAutosaveData,
  saveEditorAutosaveData,
  clearEditorAutosaveData,
  EDITOR_AUTOSAVE_DEBOUNCE_MS,
} from "../utils";
import {
  saveImageProject,
  getAllImageProjects,
  deleteImageProject,
  getStorageInfo,
} from "../../../utils/storage";

// ============================================
// Types
// ============================================

interface UseProjectManagementOptions {
  // State getters/setters
  canvasSize: { width: number; height: number };
  setCanvasSize: (size: { width: number; height: number }) => void;
  rotation: number;
  setRotation: (rotation: number) => void;
  zoom: number;
  setZoom: (zoom: number | ((z: number) => number)) => void;
  pan: Point;
  setPan: (pan: Point) => void;
  layers: UnifiedLayer[];
  setLayers: (layers: UnifiedLayer[]) => void;
  activeLayerId: string | null;
  setActiveLayerId: (id: string | null) => void;
  brushSize: number;
  setBrushSize: (size: number | ((s: number) => number)) => void;
  brushColor: string;
  setBrushColor: (color: string) => void;
  brushHardness: number;
  setBrushHardness: (hardness: number) => void;

  // Refs
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  imageRef: RefObject<HTMLImageElement | null>;
  historyRef: RefObject<ImageData[]>;
  historyIndexRef: RefObject<number>;

  // Functions
  initEditCanvas: (width: number, height: number, existingLayers?: UnifiedLayer[]) => void;
  setCropArea: (area: { x: number; y: number; width: number; height: number } | null) => void;
  setSelection: (selection: { x: number; y: number; width: number; height: number } | null) => void;
  setStampSource: (source: { x: number; y: number } | null) => void;

  // Translations
  translations: {
    saved: string;
    saveFailed: string;
    deleteConfirm: string;
    deleteFailed: string;
    unsavedChangesConfirm: string;
  };
}

interface UseProjectManagementReturn {
  // State
  projectName: string;
  setProjectName: (name: string) => void;
  currentProjectId: string | null;
  setCurrentProjectId: (id: string | null) => void;
  savedProjects: SavedImageProject[];
  isProjectListOpen: boolean;
  setIsProjectListOpen: (open: boolean) => void;
  storageInfo: { used: number; quota: number; percentage: number };

  // Handlers
  handleSaveProject: () => Promise<void>;
  handleLoadProject: (project: SavedImageProject) => Promise<void>;
  handleDeleteProject: (id: string) => Promise<void>;
  handleNewCanvas: () => void;
}

// ============================================
// Hook Implementation
// ============================================

export function useProjectManagement(
  options: UseProjectManagementOptions
): UseProjectManagementReturn {
  const {
    canvasSize,
    setCanvasSize,
    rotation,
    setRotation,
    zoom,
    setZoom,
    pan,
    setPan,
    layers,
    setLayers,
    activeLayerId,
    setActiveLayerId,
    brushSize,
    setBrushSize,
    brushColor,
    setBrushColor,
    brushHardness,
    setBrushHardness,
    layerCanvasesRef,
    editCanvasRef,
    imageRef,
    historyRef,
    historyIndexRef,
    initEditCanvas,
    setCropArea,
    setSelection,
    setStampSource,
    translations: t,
  } = options;

  // Project state
  const [projectName, setProjectName] = useState("Untitled");
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [savedProjects, setSavedProjects] = useState<SavedImageProject[]>([]);
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [storageInfo, setStorageInfo] = useState<{
    used: number;
    quota: number;
    percentage: number;
  }>({ used: 0, quota: 0, percentage: 0 });

  // Autosave refs
  const isInitializedRef = useRef(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load autosave data on mount
  useEffect(() => {
    const loadAutosave = async () => {
      try {
        const data = await loadEditorAutosaveData();
        if (data && data.layers && data.layers.length > 0 && data.canvasSize && layers.length === 0) {
          setCanvasSize(data.canvasSize);
          setRotation(data.rotation);
          setZoom(data.zoom);
          setPan(data.pan);
          setProjectName(data.projectName);
          setActiveLayerId(data.activeLayerId);
          setBrushSize(data.brushSize);
          setBrushColor(data.brushColor);
          setBrushHardness(data.brushHardness);

          const { width, height } = data.canvasSize;
          initEditCanvas(width, height, data.layers);
        } else if (data) {
          clearEditorAutosaveData();
        }
      } catch (error) {
        console.error("Failed to load autosave:", error);
      }
      isInitializedRef.current = true;
    };
    loadAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Auto-save on state change (debounced)
  useEffect(() => {
    if (!isInitializedRef.current) return;
    if (layers.length === 0) return;

    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    autosaveTimeoutRef.current = setTimeout(() => {
      const savedLayers: UnifiedLayer[] = layers.map((layer) => {
        if (layer.type === "paint") {
          const canvas = layerCanvasesRef.current?.get(layer.id);
          return {
            ...layer,
            paintData: canvas ? canvas.toDataURL("image/png") : layer.paintData || "",
          };
        }
        return { ...layer };
      });

      saveEditorAutosaveData({
        canvasSize,
        rotation,
        zoom,
        pan,
        projectName,
        layers: savedLayers,
        activeLayerId,
        brushSize,
        brushColor,
        brushHardness,
      });
    }, EDITOR_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    layers,
    canvasSize,
    rotation,
    zoom,
    pan,
    projectName,
    activeLayerId,
    brushSize,
    brushColor,
    brushHardness,
    layerCanvasesRef,
  ]);

  // Save current project
  const handleSaveProject = useCallback(async () => {
    if (layers.length === 0) return;

    const savedLayers: UnifiedLayer[] = layers.map((layer) => {
      if (layer.type === "paint") {
        const canvas = layerCanvasesRef.current?.get(layer.id);
        return {
          ...layer,
          paintData: canvas ? canvas.toDataURL("image/png") : layer.paintData || "",
        };
      }
      return { ...layer };
    });

    const editCanvas = editCanvasRef.current;
    const editLayerData = editCanvas ? editCanvas.toDataURL("image/png") : "";

    const project: SavedImageProject = {
      id: currentProjectId || crypto.randomUUID(),
      name: projectName,
      editLayerData,
      unifiedLayers: savedLayers,
      activeLayerId: activeLayerId || undefined,
      canvasSize,
      rotation,
      savedAt: Date.now(),
    };

    try {
      await saveImageProject(project);
      setCurrentProjectId(project.id);

      const projects = await getAllImageProjects();
      setSavedProjects(projects);
      const info = await getStorageInfo();
      setStorageInfo(info);

      alert(`${t.saved}!`);
    } catch (error) {
      console.error("Failed to save project:", error);
      alert(`${t.saveFailed}: ${(error as Error).message}`);
    }
  }, [projectName, canvasSize, rotation, currentProjectId, layers, activeLayerId, layerCanvasesRef, editCanvasRef, t]);

  // Cmd+S keyboard shortcut for save
  useEffect(() => {
    const handleSave = (e: KeyboardEvent) => {
      if (e.key === "s" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (layers.length > 0) {
          handleSaveProject();
        }
      }
    };

    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [layers.length, handleSaveProject]);

  // Load a saved project
  const handleLoadProject = useCallback(
    async (project: SavedImageProject) => {
      setProjectName(project.name);
      setCurrentProjectId(project.id);
      setRotation(project.rotation);
      const size = project.canvasSize || (project as any).imageSize || { width: 0, height: 0 };
      setCanvasSize(size);
      setCropArea(null);
      setSelection(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setStampSource(null);

      const { width, height } =
        project.rotation % 180 === 0
          ? size
          : { width: size.height, height: size.width };

      if (project.unifiedLayers && project.unifiedLayers.length > 0) {
        initEditCanvas(width, height, project.unifiedLayers);
        if (project.activeLayerId) {
          setActiveLayerId(project.activeLayerId);
          const activeLayer = project.unifiedLayers.find((l) => l.id === project.activeLayerId);
          if (activeLayer?.type === "paint" && layerCanvasesRef.current) {
            (editCanvasRef as { current: HTMLCanvasElement | null }).current =
              layerCanvasesRef.current.get(project.activeLayerId) || null;
          }
        }
      } else if ((project as any).layers && (project as any).layers.length > 0) {
        const legacyLayers = (project as any).layers;
        const convertedLayers: UnifiedLayer[] = legacyLayers.map(
          (layer: any, index: number) => ({
            ...layer,
            type: "paint" as const,
            locked: false,
            zIndex: legacyLayers.length - 1 - index,
            paintData: layer.data,
          })
        );
        initEditCanvas(width, height, convertedLayers);
        if (project.activeLayerId) {
          setActiveLayerId(project.activeLayerId);
          if (layerCanvasesRef.current) {
            (editCanvasRef as { current: HTMLCanvasElement | null }).current =
              layerCanvasesRef.current.get(project.activeLayerId) || null;
          }
        }
      } else {
        initEditCanvas(width, height);

        if (project.editLayerData && editCanvasRef.current) {
          const editImg = new Image();
          editImg.onload = () => {
            const ctx = editCanvasRef.current?.getContext("2d");
            if (ctx) {
              ctx.drawImage(editImg, 0, 0);
            }
          };
          editImg.src = project.editLayerData;
        }
      }

      setIsProjectListOpen(false);
    },
    [
      initEditCanvas,
      setCanvasSize,
      setRotation,
      setZoom,
      setPan,
      setCropArea,
      setSelection,
      setStampSource,
      setActiveLayerId,
      layerCanvasesRef,
      editCanvasRef,
    ]
  );

  // Delete a project
  const handleDeleteProject = useCallback(
    async (id: string) => {
      if (!confirm(t.deleteConfirm)) return;

      try {
        await deleteImageProject(id);
        const projects = await getAllImageProjects();
        setSavedProjects(projects);
        const info = await getStorageInfo();
        setStorageInfo(info);

        if (currentProjectId === id) {
          setCurrentProjectId(null);
        }
      } catch (error) {
        console.error("Failed to delete project:", error);
        alert(`${t.deleteFailed}: ${(error as Error).message}`);
      }
    },
    [currentProjectId, t]
  );

  // New canvas
  const handleNewCanvas = useCallback(() => {
    if (layers.length > 0 && !confirm(t.unsavedChangesConfirm)) return;

    clearEditorAutosaveData();

    setCanvasSize({ width: 0, height: 0 });
    setProjectName("Untitled");
    setCurrentProjectId(null);
    setRotation(0);
    setCropArea(null);
    setSelection(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setStampSource(null);

    setLayers([]);
    setActiveLayerId(null);
    layerCanvasesRef.current?.clear();

    (editCanvasRef as { current: HTMLCanvasElement | null }).current = null;
    (imageRef as { current: HTMLImageElement | null }).current = null;
    if (historyRef.current) historyRef.current = [];
    if (historyIndexRef.current !== undefined) (historyIndexRef as { current: number }).current = -1;
  }, [
    layers.length,
    t,
    setCanvasSize,
    setRotation,
    setZoom,
    setPan,
    setCropArea,
    setSelection,
    setStampSource,
    setLayers,
    setActiveLayerId,
    layerCanvasesRef,
    editCanvasRef,
    imageRef,
    historyRef,
    historyIndexRef,
  ]);

  return {
    projectName,
    setProjectName,
    currentProjectId,
    setCurrentProjectId,
    savedProjects,
    isProjectListOpen,
    setIsProjectListOpen,
    storageInfo,
    handleSaveProject,
    handleLoadProject,
    handleDeleteProject,
    handleNewCanvas,
  };
}
