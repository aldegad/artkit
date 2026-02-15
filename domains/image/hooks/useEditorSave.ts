"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { UnifiedLayer, Guide, Point, SavedImageProject } from "../types";
import {
  saveEditorAutosaveData,
  EDITOR_AUTOSAVE_DEBOUNCE_MS,
} from "../utils/autosave";
import { StorageProvider, StorageInfo } from "@/domains/image/services/projectStorage";
import {
  drawLayerWithOptionalAlphaMask,
  getLayerAlphaMaskDataURL,
} from "@/shared/utils/layerAlphaMask";
import { normalizeProjectGroupName } from "@/shared/utils/projectGroups";

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
  projectGroup: string;
  currentProjectId: string | null;
  activeLayerId: string | null;
  guides: Guide[];

  // Brush settings
  brushSize: number;
  brushColor: string;
  brushHardness: number;
  brushOpacity: number;

  // UI state
  showRulers: boolean;
  showGuides: boolean;
  lockGuides: boolean;
  snapToGuides: boolean;
  isPanLocked: boolean;

  // Callbacks
  setProjectName: (name: string) => void;
  setProjectGroup: (group: string) => void;
  setCurrentProjectId: (id: string | null) => void;
  setSavedProjects: (projects: SavedImageProject[]) => void;
  setStorageInfo: (info: StorageInfo) => void;
  requestSaveDetails: (request: {
    mode: "save" | "saveAs";
    name: string;
    projectGroup?: string;
  }) => Promise<{ name: string; projectGroup: string } | null>;

  // Configuration
  enabled?: boolean;
  isInitialized?: boolean;
}

export interface UseEditorSaveReturn {
  saveProject: () => Promise<boolean>;
  saveAsProject: () => Promise<boolean>;
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
    projectGroup,
    currentProjectId,
    activeLayerId,
    guides,
    brushSize,
    brushColor,
    brushHardness,
    brushOpacity,
    showRulers,
    showGuides,
    lockGuides,
    snapToGuides,
    isPanLocked,
    setProjectName,
    setProjectGroup,
    setCurrentProjectId,
    setSavedProjects,
    setStorageInfo,
    requestSaveDetails,
    enabled = true,
    isInitialized = true,
  } = options;

  const [isSaving, setIsSaving] = useState(false);
  const autosaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const savingRef = useRef(false);
  const currentProjectIdRef = useRef<string | null>(currentProjectId);

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  // Extract layers with paint data (shared by autosave and project save)
  const extractLayersWithPaintData = useCallback((): UnifiedLayer[] => {
    return layers.map((layer) => {
      if (layer.type === "paint") {
        const canvas = layerCanvasesRef.current?.get(layer.id);
        const alphaMaskData = canvas ? getLayerAlphaMaskDataURL(canvas) : layer.alphaMaskData;
        return {
          ...layer,
          paintData: canvas ? canvas.toDataURL("image/png") : layer.paintData || "",
          alphaMaskData,
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
    if (!canvas) return undefined;

    const thumbCanvas = document.createElement("canvas");
    thumbCanvas.width = canvas.width;
    thumbCanvas.height = canvas.height;
    const thumbCtx = thumbCanvas.getContext("2d");
    if (!thumbCtx) return canvas.toDataURL("image/png");
    drawLayerWithOptionalAlphaMask(thumbCtx, canvas, 0, 0);
    return thumbCanvas.toDataURL("image/png");
  }, [layers, layerCanvasesRef]);

  // Prepare project data for saving
  const prepareProjectData = useCallback(
    (projectId: string, name: string, resolvedProjectGroup: string): SavedImageProject | null => {
      if (layers.length === 0) return null;

      const savedLayers = extractLayersWithPaintData();

      return {
        id: projectId,
        name,
        projectGroup: resolvedProjectGroup,
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
        brushOpacity,
        // UI state
        showRulers,
        showGuides,
        lockGuides,
        snapToGuides,
        isPanLocked,
      };
    },
    [
      layers,
      extractLayersWithPaintData,
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
      brushOpacity,
      showRulers,
      showGuides,
      lockGuides,
      snapToGuides,
      isPanLocked,
    ]
  );

  // Refresh project list after save
  const refreshProjectList = useCallback(async () => {
    const projects = await storageProvider.getAllProjects();
    setSavedProjects(projects);
    const info = await storageProvider.getStorageInfo();
    setStorageInfo(info);
  }, [storageProvider, setSavedProjects, setStorageInfo]);

  const runSave = useCallback(async (mode: "save" | "saveAs"): Promise<boolean> => {
    if (savingRef.current) return false;

    const saveDetails = await requestSaveDetails({
      mode,
      name: projectName,
      projectGroup,
    });
    if (!saveDetails) return false;

    if (savingRef.current) return false;
    savingRef.current = true;

    const resolvedName = saveDetails.name.trim() || projectName.trim() || "Untitled";
    const resolvedProjectGroup = normalizeProjectGroupName(saveDetails.projectGroup);
    const projectId = mode === "saveAs"
      ? crypto.randomUUID()
      : (currentProjectIdRef.current || crypto.randomUUID());
    currentProjectIdRef.current = projectId;
    const project = prepareProjectData(projectId, resolvedName, resolvedProjectGroup);
    if (!project) {
      savingRef.current = false;
      return false;
    }

    setIsSaving(true);
    try {
      await storageProvider.saveProject(project);
      currentProjectIdRef.current = projectId;
      setCurrentProjectId(projectId);
      setProjectName(resolvedName);
      setProjectGroup(resolvedProjectGroup);
      await refreshProjectList();
      return true;
    } catch (error) {
      console.error("Failed to save project:", error);
      throw error;
    } finally {
      savingRef.current = false;
      setIsSaving(false);
    }
  }, [
    requestSaveDetails,
    projectName,
    projectGroup,
    prepareProjectData,
    storageProvider,
    setCurrentProjectId,
    setProjectName,
    setProjectGroup,
    refreshProjectList,
  ]);

  const saveProject = useCallback(async () => {
    return runSave("save");
  }, [runSave]);

  const saveAsProject = useCallback(async () => {
    return runSave("saveAs");
  }, [runSave]);

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
        projectGroup,
        layers: savedLayers,
        activeLayerId,
        brushSize,
        brushColor,
        brushHardness,
        brushOpacity,
        guides: guides.length > 0 ? guides : undefined,
        // UI state
        showRulers,
        showGuides,
        lockGuides,
        snapToGuides,
        isPanLocked,
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
    projectGroup,
    activeLayerId,
    brushSize,
    brushColor,
    brushHardness,
    brushOpacity,
    guides,
    showRulers,
    showGuides,
    lockGuides,
    snapToGuides,
    isPanLocked,
  ]);

  return {
    saveProject,
    saveAsProject,
    isSaving,
  };
}
