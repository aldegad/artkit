"use client";

import { useState, useEffect, useCallback, RefObject } from "react";
import type { User } from "firebase/auth";
import { SavedImageProject, UnifiedLayer, CropArea, Guide } from "../types";
import {
  StorageProvider,
  StorageInfo,
  hasLocalProjects,
  checkCloudProjects,
  uploadLocalProjectsToCloud,
  clearLocalProjects,
  clearCloudProjects,
} from "../services/projectStorage";
import { loadEditorAutosaveData, clearEditorAutosaveData } from "../utils/autosave";
import { confirmDialog, showErrorToast } from "@/shared/components";

interface UseImageProjectIOOptions {
  user: User | null;
  storageProvider: StorageProvider;
  layers: UnifiedLayer[];
  currentProjectId: string | null;

  setProjectName: (name: string) => void;
  setCurrentProjectId: (id: string | null) => void;
  setRotation: (rotation: number) => void;
  setCanvasSize: (size: { width: number; height: number }) => void;
  setCropArea: (area: CropArea | null) => void;
  setSelection: (selection: CropArea | null) => void;
  setZoom: (zoom: number) => void;
  setPan: (pan: { x: number; y: number }) => void;
  setStampSource: (source: { x: number; y: number } | null) => void;
  setLayers: React.Dispatch<React.SetStateAction<UnifiedLayer[]>>;
  setActiveLayerId: React.Dispatch<React.SetStateAction<string | null>>;
  setSavedProjects: (projects: SavedImageProject[]) => void;
  setStorageInfo: (info: StorageInfo) => void;
  setIsProjectListOpen: (open: boolean) => void;
  setGuides: React.Dispatch<React.SetStateAction<Guide[]>>;

  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  setBrushColor: React.Dispatch<React.SetStateAction<string>>;
  setBrushHardness: React.Dispatch<React.SetStateAction<number>>;
  setShowRulers: (show: boolean) => void;
  setShowGuides: (show: boolean) => void;
  setLockGuides: (lock: boolean) => void;
  setSnapToGuides: (snap: boolean) => void;

  initLayers: (width: number, height: number, existingLayers?: UnifiedLayer[]) => Promise<void>;
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  editCanvasRef: RefObject<HTMLCanvasElement | null>;
  imageRef: RefObject<HTMLImageElement | null>;
  clearHistory: () => void;

  translations: {
    deleteConfirm: string;
    deleteFailed: string;
    unsavedChangesConfirm: string;
    loadFailed?: string;
  };
}

interface UseImageProjectIOReturn {
  isLoading: boolean;
  isAutosaveLoading: boolean;
  isInitialized: boolean;
  showSyncDialog: boolean;
  localProjectCount: number;
  cloudProjectCount: number;
  handleLoadProject: (projectMeta: SavedImageProject) => Promise<void>;
  handleDeleteProject: (id: string) => Promise<void>;
  handleNewCanvas: () => void;
  handleKeepCloud: () => Promise<void>;
  handleKeepLocal: () => Promise<void>;
  handleCancelSync: () => void;
}

export function useImageProjectIO(options: UseImageProjectIOOptions): UseImageProjectIOReturn {
  const {
    user,
    storageProvider,
    layers,
    currentProjectId,
    setProjectName,
    setCurrentProjectId,
    setRotation,
    setCanvasSize,
    setCropArea,
    setSelection,
    setZoom,
    setPan,
    setStampSource,
    setLayers,
    setActiveLayerId,
    setSavedProjects,
    setStorageInfo,
    setIsProjectListOpen,
    setGuides,
    setBrushSize,
    setBrushColor,
    setBrushHardness,
    setShowRulers,
    setShowGuides,
    setLockGuides,
    setSnapToGuides,
    initLayers,
    layerCanvasesRef,
    editCanvasRef,
    imageRef,
    clearHistory,
    translations: t,
  } = options;

  const [isLoading, setIsLoading] = useState(false);
  const [isAutosaveLoading, setIsAutosaveLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);

  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [cloudProjectCount, setCloudProjectCount] = useState(0);

  const refreshProjects = useCallback(async () => {
    const projects = await storageProvider.getAllProjects();
    setSavedProjects(projects);
    const info = await storageProvider.getStorageInfo();
    setStorageInfo(info);
  }, [storageProvider, setSavedProjects, setStorageInfo]);

  // Load saved projects when storage provider changes (login/logout)
  useEffect(() => {
    const loadProjects = async () => {
      try {
        await refreshProjects();
      } catch (error) {
        console.error("Failed to load projects:", error);
      }
    };
    void loadProjects();
  }, [refreshProjects]);

  // Check for sync conflicts when user logs in
  useEffect(() => {
    const checkSyncConflicts = async () => {
      if (!user) return;

      try {
        const hasLocal = await hasLocalProjects();
        const hasCloud = await checkCloudProjects(user.uid);

        if (hasLocal && hasCloud) {
          const localProjects = await (await import("@/shared/utils/storage")).getAllImageProjects();
          const cloudProjects = await (await import("@/shared/lib/firebase/firebaseImageStorage")).getAllImageProjectsFromFirebase(user.uid);

          setLocalProjectCount(localProjects.length);
          setCloudProjectCount(cloudProjects.length);
          setShowSyncDialog(true);
        } else if (hasLocal && !hasCloud) {
          await uploadLocalProjectsToCloud(user);
          await refreshProjects();
        }
      } catch (error) {
        console.error("Failed to check sync conflicts:", error);
      }
    };

    void checkSyncConflicts();
  }, [user, refreshProjects]);

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
          await initLayers(width, height, data.layers);

          if (data.guides && data.guides.length > 0) {
            setGuides(data.guides);
          }

          if (data.showRulers !== undefined) setShowRulers(data.showRulers);
          if (data.showGuides !== undefined) setShowGuides(data.showGuides);
          if (data.lockGuides !== undefined) setLockGuides(data.lockGuides);
          if (data.snapToGuides !== undefined) setSnapToGuides(data.snapToGuides);

          if (data.currentProjectId !== undefined) {
            setCurrentProjectId(data.currentProjectId);
          }
        } else if (data) {
          clearEditorAutosaveData();
        }
      } catch (error) {
        console.error("Failed to load autosave:", error);
      }
      setIsInitialized(true);
      setIsAutosaveLoading(false);
    };

    void loadAutosave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleLoadProject = useCallback(async (projectMeta: SavedImageProject) => {
    setIsLoading(true);
    try {
      const project = await storageProvider.getProject(projectMeta.id);
      if (!project) {
        showErrorToast(t.loadFailed || "Failed to load project");
        return;
      }

      setProjectName(project.name);
      setCurrentProjectId(project.id);
      setRotation(project.rotation);
      setCanvasSize(project.canvasSize);
      setCropArea(null);
      setSelection(null);
      setZoom(1);
      setPan({ x: 0, y: 0 });
      setStampSource(null);

      const { width, height } =
        project.rotation % 180 === 0
          ? project.canvasSize
          : { width: project.canvasSize.height, height: project.canvasSize.width };

      await initLayers(width, height, project.unifiedLayers);
      if (project.activeLayerId) {
        setActiveLayerId(project.activeLayerId);
        const activeLayer = project.unifiedLayers.find((layer) => layer.id === project.activeLayerId);
        if (activeLayer?.type === "paint") {
          editCanvasRef.current = layerCanvasesRef.current?.get(project.activeLayerId) || null;
        }
      }

      setGuides(project.guides || []);
      setIsProjectListOpen(false);
    } finally {
      setIsLoading(false);
    }
  }, [
    storageProvider,
    t.loadFailed,
    setProjectName,
    setCurrentProjectId,
    setRotation,
    setCanvasSize,
    setCropArea,
    setSelection,
    setZoom,
    setPan,
    setStampSource,
    initLayers,
    setActiveLayerId,
    editCanvasRef,
    layerCanvasesRef,
    setGuides,
    setIsProjectListOpen,
  ]);

  const handleDeleteProject = useCallback(async (id: string) => {
    const shouldDelete = await confirmDialog(t.deleteConfirm);
    if (!shouldDelete) return;

    setIsLoading(true);
    try {
      await storageProvider.deleteProject(id);
      await refreshProjects();

      if (currentProjectId === id) {
        setCurrentProjectId(null);
      }
    } catch (error) {
      console.error("Failed to delete project:", error);
      showErrorToast(`${t.deleteFailed}: ${(error as Error).message}`);
    } finally {
      setIsLoading(false);
    }
  }, [t.deleteConfirm, t.deleteFailed, storageProvider, refreshProjects, currentProjectId, setCurrentProjectId]);

  const handleNewCanvas = useCallback(async () => {
    if (layers.length > 0) {
      const shouldReset = await confirmDialog(t.unsavedChangesConfirm);
      if (!shouldReset) return;
    }

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

    imageRef.current = null;
    editCanvasRef.current = null;
    clearHistory();
  }, [
    layers.length,
    t.unsavedChangesConfirm,
    setCanvasSize,
    setProjectName,
    setCurrentProjectId,
    setRotation,
    setCropArea,
    setSelection,
    setZoom,
    setPan,
    setStampSource,
    setLayers,
    setActiveLayerId,
    layerCanvasesRef,
    imageRef,
    editCanvasRef,
    clearHistory,
  ]);

  const handleKeepCloud = useCallback(async () => {
    await clearLocalProjects();
    setShowSyncDialog(false);
  }, []);

  const handleKeepLocal = useCallback(async () => {
    if (user) {
      await clearCloudProjects(user);
      await uploadLocalProjectsToCloud(user);
      await refreshProjects();
    }
    setShowSyncDialog(false);
  }, [user, refreshProjects]);

  const handleCancelSync = useCallback(() => {
    setShowSyncDialog(false);
  }, []);

  return {
    isLoading,
    isAutosaveLoading,
    isInitialized,
    showSyncDialog,
    localProjectCount,
    cloudProjectCount,
    handleLoadProject,
    handleDeleteProject,
    handleNewCanvas,
    handleKeepCloud,
    handleKeepLocal,
    handleCancelSync,
  };
}
