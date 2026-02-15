"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SpriteSaveLoadProgress } from "@/shared/lib/firebase/firebaseSpriteStorage";
import { confirmDialog, showErrorToast } from "@/shared/components";
import { useSpriteTrackStore } from "../stores";
import { migrateFramesToTracks } from "../utils/migration";
import type { SavedSpriteProject, Size, SpriteFrame, SpriteTrack } from "../types";
import type { SpriteStorageInfo, SpriteStorageProvider } from "../services/projectStorage";
import { normalizeProjectGroupName } from "@/shared/utils/projectGroups";

interface SpriteProjectActionTranslations {
  enterProjectName: string;
  saveFailed: string;
  deleteConfirm: string;
  deleteFailed: string;
  newLabel: string;
  newProjectConfirm: string;
  cancelLabel: string;
}

interface UseSpriteProjectFileActionsOptions {
  storageProvider: SpriteStorageProvider;
  projectName: string;
  projectGroup: string;
  currentProjectId: string | null;
  imageSrc: string | null;
  firstFrameImage: string | undefined;
  imageSize: Size;
  canvasSize: Size | null;
  tracks: SpriteTrack[];
  allFrames: SpriteFrame[];
  nextFrameId: number;
  fps: number;
  framesCount: number;
  setSavedSpriteProjects: React.Dispatch<React.SetStateAction<SavedSpriteProject[]>>;
  setCurrentProjectId: (id: string | null) => void;
  setProjectName: (name: string) => void;
  setProjectGroup: (group: string) => void;
  setImageSrc: (src: string) => void;
  setImageSize: (size: Size) => void;
  setCanvasSize: (size: Size | null) => void;
  restoreTracks: (tracks: SpriteTrack[], nextFrameId: number) => void;
  setCurrentPoints: (points: Array<{ x: number; y: number }>) => void;
  imageRef: React.RefObject<HTMLImageElement | null>;
  setScale: (scale: number) => void;
  setIsProjectListOpen: (open: boolean) => void;
  newProject: () => void;
  requestSaveDetails: (request: {
    mode: "save" | "saveAs";
    name: string;
    projectGroup?: string;
  }) => Promise<{ name: string; projectGroup: string } | null>;
  t: SpriteProjectActionTranslations;
}

interface UseSpriteProjectFileActionsResult {
  isSaving: boolean;
  saveCount: number;
  saveProgress: SpriteSaveLoadProgress | null;
  isProjectLoading: boolean;
  loadProgress: SpriteSaveLoadProgress | null;
  storageInfo: SpriteStorageInfo;
  refreshProjects: () => Promise<void>;
  saveProject: () => Promise<void>;
  saveProjectAs: () => Promise<void>;
  loadProject: (projectMeta: SavedSpriteProject) => Promise<void>;
  deleteProject: (projectId: string) => Promise<void>;
  handleNewProject: () => Promise<void>;
}

export function useSpriteProjectFileActions(
  options: UseSpriteProjectFileActionsOptions
): UseSpriteProjectFileActionsResult {
  const {
    storageProvider,
    projectName,
    projectGroup,
    currentProjectId,
    imageSrc,
    firstFrameImage,
    imageSize,
    canvasSize,
    tracks,
    allFrames,
    nextFrameId,
    fps,
    framesCount,
    setSavedSpriteProjects,
    setCurrentProjectId,
    setProjectName,
    setProjectGroup,
    setImageSrc,
    setImageSize,
    setCanvasSize,
    restoreTracks,
    setCurrentPoints,
    imageRef,
    setScale,
    setIsProjectListOpen,
    newProject,
    requestSaveDetails,
    t,
  } = options;
  const [isSaving, setIsSaving] = useState(false);
  const [saveCount, setSaveCount] = useState(0);
  const [saveProgress, setSaveProgress] = useState<SpriteSaveLoadProgress | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<SpriteSaveLoadProgress | null>(null);
  const [storageInfo, setStorageInfo] = useState<SpriteStorageInfo>({ used: 0, quota: 0, percentage: 0 });
  const saveInFlightRef = useRef(false);
  const currentProjectIdRef = useRef<string | null>(currentProjectId);

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  const refreshProjects = useCallback(async () => {
    const [projects, info] = await Promise.all([
      storageProvider.getAllProjects(),
      storageProvider.getStorageInfo(),
    ]);
    setSavedSpriteProjects(projects);
    setStorageInfo(info);
  }, [setSavedSpriteProjects, storageProvider]);

  const buildProjectToSave = useCallback((
    projectId: string,
    name: string,
    resolvedProjectGroup: string
  ): SavedSpriteProject => {
    const saveImageSrc = imageSrc || firstFrameImage || "";
    return {
      id: projectId,
      name,
      projectGroup: resolvedProjectGroup,
      imageSrc: saveImageSrc,
      imageSize,
      canvasSize: canvasSize ?? undefined,
      exportFrameSize: canvasSize ?? undefined,
      tracks,
      nextFrameId,
      fps,
      savedAt: Date.now(),
    };
  }, [
    canvasSize,
    firstFrameImage,
    fps,
    imageSize,
    imageSrc,
    nextFrameId,
    tracks,
  ]);

  // Load saved projects when storage provider changes (login/logout)
  useEffect(() => {
    const loadProjects = async () => {
      try {
        await refreshProjects();
      } catch (error) {
        console.error("Failed to load saved projects:", error);
      }
    };
    void loadProjects();
  }, [refreshProjects]);

  // Save project (overwrite if existing, create new if not)
  const saveProject = useCallback(async () => {
    if (tracks.length === 0 || !allFrames.some((frame) => frame.imageData)) {
      return;
    }
    if (saveInFlightRef.current) return;

    const saveDetails = await requestSaveDetails({
      mode: "save",
      name: projectName.trim() || `Project ${new Date().toLocaleString()}`,
      projectGroup,
    });
    if (!saveDetails) return;

    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;

    const name = saveDetails.name.trim() || `Project ${new Date().toLocaleString()}`;
    const resolvedProjectGroup = normalizeProjectGroupName(saveDetails.projectGroup);
    const existingProjectId = currentProjectIdRef.current;
    const resolvedProjectId = existingProjectId || crypto.randomUUID();
    currentProjectIdRef.current = resolvedProjectId;
    const projectToSave = buildProjectToSave(resolvedProjectId, name, resolvedProjectGroup);

    setIsSaving(true);
    setSaveProgress(null);
    try {
      await storageProvider.saveProject(projectToSave, setSaveProgress);
      setSavedSpriteProjects((prev: SavedSpriteProject[]) =>
        existingProjectId
          ? prev.map((project) => (project.id === resolvedProjectId ? projectToSave : project))
          : [projectToSave, ...prev]
      );
      setCurrentProjectId(resolvedProjectId);
      currentProjectIdRef.current = resolvedProjectId;
      setProjectName(name);
      setProjectGroup(resolvedProjectGroup);

      const info = await storageProvider.getStorageInfo();
      setStorageInfo(info);
      setSaveCount((count) => count + 1);
    } catch (error) {
      console.error("Save failed:", error);
      showErrorToast(`${t.saveFailed}: ${(error as Error).message}`);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      setSaveProgress(null);
    }
  }, [
    allFrames,
    buildProjectToSave,
    projectGroup,
    projectName,
    requestSaveDetails,
    setCurrentProjectId,
    setProjectGroup,
    setProjectName,
    setSavedSpriteProjects,
    storageProvider,
    t.saveFailed,
    tracks,
  ]);

  // Save project as new (always create new project)
  const saveProjectAs = useCallback(async () => {
    if (tracks.length === 0 || !allFrames.some((frame) => frame.imageData)) {
      return;
    }
    if (saveInFlightRef.current) return;

    const saveDetails = await requestSaveDetails({
      mode: "saveAs",
      name: projectName || "",
      projectGroup,
    });
    if (!saveDetails) return;

    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;

    const name = saveDetails.name.trim() || `Project ${new Date().toLocaleString()}`;
    const resolvedProjectGroup = normalizeProjectGroupName(saveDetails.projectGroup);
    const newId = crypto.randomUUID();
    const projectToSave = buildProjectToSave(newId, name, resolvedProjectGroup);

    setIsSaving(true);
    setSaveProgress(null);
    try {
      await storageProvider.saveProject(projectToSave, setSaveProgress);
      setSavedSpriteProjects((prev: SavedSpriteProject[]) => [projectToSave, ...prev]);
      setCurrentProjectId(newId);
      currentProjectIdRef.current = newId;
      setProjectName(name);
      setProjectGroup(resolvedProjectGroup);

      const info = await storageProvider.getStorageInfo();
      setStorageInfo(info);
      setSaveCount((count) => count + 1);
    } catch (error) {
      console.error("Save failed:", error);
      showErrorToast(`${t.saveFailed}: ${(error as Error).message}`);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      setSaveProgress(null);
    }
  }, [
    allFrames,
    buildProjectToSave,
    projectGroup,
    projectName,
    requestSaveDetails,
    setCurrentProjectId,
    setProjectGroup,
    setProjectName,
    setSavedSpriteProjects,
    storageProvider,
    t.saveFailed,
    tracks,
  ]);

  // Load project by id (supports cloud metadata-only list)
  const loadProject = useCallback(async (projectMeta: SavedSpriteProject) => {
    const trackStore = useSpriteTrackStore.getState();
    trackStore.setIsPlaying(false);
    trackStore.setCurrentFrameIndex(0);
    setIsProjectLoading(true);
    setLoadProgress(null);
    try {
      const project = await storageProvider.getProject(projectMeta.id, setLoadProgress);
      if (!project) {
        throw new Error("Project not found");
      }

      setImageSrc(project.imageSrc);
      setImageSize(project.imageSize);
      setCanvasSize(project.canvasSize ?? project.exportFrameSize ?? null);

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = project as any;
      const nextTracks = Array.isArray(project.tracks)
        ? project.tracks
        : migrateFramesToTracks(raw.frames ?? []);
      restoreTracks(nextTracks, project.nextFrameId);
      setProjectName(project.name);
      setProjectGroup(normalizeProjectGroupName(project.projectGroup));
      setCurrentProjectId(project.id);
      currentProjectIdRef.current = project.id;
      setCurrentPoints([]);

      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        const maxWidth = 900;
        const newScale = Math.min(maxWidth / img.width, 1);
        setScale(newScale);
      };
      img.src = project.imageSrc;

      setIsProjectListOpen(false);
    } catch (error) {
      console.error("Load failed:", error);
      showErrorToast((error as Error).message);
    } finally {
      setIsProjectLoading(false);
      setLoadProgress(null);
    }
  }, [
    imageRef,
    restoreTracks,
    setCanvasSize,
    setCurrentPoints,
    setCurrentProjectId,
    setImageSize,
    setImageSrc,
    setIsProjectListOpen,
    setProjectGroup,
    setProjectName,
    setScale,
    storageProvider,
  ]);

  // Delete project
  const deleteProject = useCallback(async (projectId: string) => {
    const shouldDelete = await confirmDialog(t.deleteConfirm);
    if (!shouldDelete) return;

    setIsProjectLoading(true);
    setLoadProgress(null);
    try {
      await storageProvider.deleteProject(projectId);
      setSavedSpriteProjects((prev) => prev.filter((project) => project.id !== projectId));

      const info = await storageProvider.getStorageInfo();
      setStorageInfo(info);
    } catch (error) {
      console.error("Delete failed:", error);
      showErrorToast(`${t.deleteFailed}: ${(error as Error).message}`);
    } finally {
      setIsProjectLoading(false);
      setLoadProgress(null);
    }
  }, [setSavedSpriteProjects, storageProvider, t.deleteConfirm, t.deleteFailed]);

  const handleNewProject = useCallback(async () => {
    if (framesCount > 0 || imageSrc) {
      const shouldCreate = await confirmDialog({
        title: t.newLabel || "New Project",
        message: t.newProjectConfirm,
        confirmLabel: t.newLabel || "New",
        cancelLabel: t.cancelLabel || "Cancel",
      });
      if (!shouldCreate) return;
    }
    setCanvasSize(null);
    newProject();
  }, [framesCount, imageSrc, newProject, setCanvasSize, t.cancelLabel, t.newLabel, t.newProjectConfirm]);

  return {
    isSaving,
    saveCount,
    saveProgress,
    isProjectLoading,
    loadProgress,
    storageInfo,
    refreshProjects,
    saveProject,
    saveProjectAs,
    loadProject,
    deleteProject,
    handleNewProject,
  };
}
