"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { UnifiedLayer, Guide, Point, SavedImageProject } from "../types";
import {
  saveEditorAutosaveData,
  EDITOR_AUTOSAVE_DEBOUNCE_MS,
} from "../utils/autosave";
import { StorageProvider, StorageInfo } from "../../../services/projectStorage";

// ============================================
// Types
// ============================================

export interface UseEditorSaveOptions {
  // Storage provider
  storageProvider: StorageProvider;

  // Editor state
  layers: UnifiedLayer[];
  layerCanvasesRef: React.RefObject<Map<string, HTMLCanvasElement>>;
  canvasSize: { width: number; height: number };
  rotation: number;
  zoom: number;
  pan: Point;
  projectName: string;
  currentProjectId: string | null;
  activeLayerId: string | null;
  guides: Guide[];

  // Brush settings
  brushSize: number;
  brushColor: string;
  brushHardness: number;

  // UI state
  showRulers: boolean;
  showGuides: boolean;
  lockGuides: boolean;
  snapToGuides: boolean;

  // Callbacks
  setCurrentProjectId: (id: string | null) => void;
  setSavedProjects: (projects: SavedImageProject[]) => void;
  setStorageInfo: (info: StorageInfo) => void;

  // Configuration
  enabled?: boolean;
  isInitialized?: boolean;
}

export interface UseEditorSaveReturn {
  saveProject: () => Promise<void>;
  saveAsProject: () => Promise<void>;
  isSaving: boolean;
}

// ============================================
// Hook Implementation
// ============================================

export function useEditorSave(options: UseEditorSaveOptions): UseEditorSaveReturn {
  const {
    storageProvider,
    layers,
    layerCanvasesRef,
    canvasSize,
    rotation,
    zoom,
    pan,
    projectName,
    currentProjectId,
    activeLayerId,
    guides,
    brushSize,
    brushColor,
    brushHardness,
    showRulers,
    showGuides,
    lockGuides,
    snapToGuides,
    setCurrentProjectId,
    setSavedProjects,
    setStorageInfo,
    enabled = true,
    isInitialized = true,
  } = options;

  const [isSaving, setIsSaving] = useState(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Extract layers with paint data (shared by autosave and project save)
  const extractLayersWithPaintData = useCallback((): UnifiedLayer[] => {
    return layers.map((layer) => {
      if (layer.type === "paint") {
        const canvas = layerCanvasesRef.current?.get(layer.id);
        return {
          ...layer,
          paintData: canvas ? canvas.toDataURL("image/png") : layer.paintData || "",
        };
      }
      return { ...layer };
    });
  }, [layers, layerCanvasesRef]);

  // Generate thumbnail from first visible layer
  const generateThumbnail = useCallback((): string | undefined => {
    const firstVisibleLayer = layers.find((l) => l.visible);
    const canvas = firstVisibleLayer
      ? layerCanvasesRef.current?.get(firstVisibleLayer.id)
      : null;
    return canvas ? canvas.toDataURL("image/png") : undefined;
  }, [layers, layerCanvasesRef]);

  // Prepare project data for saving
  const prepareProjectData = useCallback(
    (forceNewId: boolean): SavedImageProject | null => {
      if (layers.length === 0) return null;

      const savedLayers = extractLayersWithPaintData();

      return {
        id: forceNewId ? crypto.randomUUID() : (currentProjectId || crypto.randomUUID()),
        name: projectName,
        unifiedLayers: savedLayers,
        activeLayerId: activeLayerId || undefined,
        canvasSize,
        rotation,
        savedAt: Date.now(),
        thumbnailUrl: generateThumbnail(),
        guides: guides.length > 0 ? guides : undefined,
        // View state
        zoom,
        pan,
        // Brush settings
        brushSize,
        brushColor,
        brushHardness,
        // UI state
        showRulers,
        showGuides,
        lockGuides,
        snapToGuides,
      };
    },
    [
      layers,
      extractLayersWithPaintData,
      currentProjectId,
      projectName,
      activeLayerId,
      canvasSize,
      rotation,
      generateThumbnail,
      guides,
      zoom,
      pan,
      brushSize,
      brushColor,
      brushHardness,
      showRulers,
      showGuides,
      lockGuides,
      snapToGuides,
    ]
  );

  // Refresh project list after save
  const refreshProjectList = useCallback(async () => {
    const projects = await storageProvider.getAllProjects();
    setSavedProjects(projects);
    const info = await storageProvider.getStorageInfo();
    setStorageInfo(info);
  }, [storageProvider, setSavedProjects, setStorageInfo]);

  // Save project (overwrites existing or creates new)
  const saveProject = useCallback(async () => {
    const project = prepareProjectData(false);
    if (!project) return;

    setIsSaving(true);
    try {
      await storageProvider.saveProject(project);
      setCurrentProjectId(project.id);
      await refreshProjectList();
    } catch (error) {
      console.error("Failed to save project:", error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [prepareProjectData, storageProvider, setCurrentProjectId, refreshProjectList]);

  // Save as new project (always creates new)
  const saveAsProject = useCallback(async () => {
    const project = prepareProjectData(true);
    if (!project) return;

    setIsSaving(true);
    try {
      await storageProvider.saveProject(project);
      setCurrentProjectId(project.id);
      await refreshProjectList();
    } catch (error) {
      console.error("Failed to save project:", error);
      throw error;
    } finally {
      setIsSaving(false);
    }
  }, [prepareProjectData, storageProvider, setCurrentProjectId, refreshProjectList]);

  // Autosave effect
  useEffect(() => {
    if (!isInitialized || !enabled) return;
    if (layers.length === 0) return;

    // Clear existing timeout
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
    }

    // Debounced autosave
    autosaveTimeoutRef.current = setTimeout(() => {
      const savedLayers = extractLayersWithPaintData();

      saveEditorAutosaveData({
        // Project identity - KEY FIX for load→refresh→save bug
        currentProjectId,
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
        guides: guides.length > 0 ? guides : undefined,
        // UI state
        showRulers,
        showGuides,
        lockGuides,
        snapToGuides,
      });
    }, EDITOR_AUTOSAVE_DEBOUNCE_MS);

    return () => {
      if (autosaveTimeoutRef.current) {
        clearTimeout(autosaveTimeoutRef.current);
      }
    };
  }, [
    isInitialized,
    enabled,
    layers,
    extractLayersWithPaintData,
    currentProjectId,
    canvasSize,
    rotation,
    zoom,
    pan,
    projectName,
    activeLayerId,
    brushSize,
    brushColor,
    brushHardness,
    guides,
    showRulers,
    showGuides,
    lockGuides,
    snapToGuides,
  ]);

  return {
    saveProject,
    saveAsProject,
    isSaving,
  };
}
