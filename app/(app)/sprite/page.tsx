"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import {
  EditorProvider,
  useEditorImage,
  useEditorFramesMeta,
  useEditorTools,
  useEditorViewport,
  useEditorAnimation,
  useEditorHistory,
  useEditorProject,
  useEditorWindows,
  useEditorTracks,
  useEditorClipboard,
  useLayout,
  LayoutProvider,
  SplitView,
  SpriteSheetImportModal,
  SpriteFrame,
  useFrameBackgroundRemoval,
  FrameBackgroundRemovalModals,
} from "@/domains/sprite";
import type { SavedSpriteProject } from "@/domains/sprite";
import { useSpriteTrackStore } from "@/domains/sprite/stores";
import { migrateFramesToTracks } from "@/domains/sprite/utils/migration";
import SpriteMenuBar from "@/domains/sprite/components/SpriteMenuBar";
import VideoImportModal from "@/domains/sprite/components/VideoImportModal";
import { useLanguage, useAuth } from "@/shared/contexts";
import { HeaderContent, SaveToast, LoadingOverlay } from "@/shared/components";
import { Tooltip, Scrollbar } from "@/shared/components";
import { SyncDialog } from "@/shared/components/app/auth";
import {
  BrushIcon,
  CursorIcon,
  HandIcon,
  BackgroundRemovalIcon,
  UndoIcon,
  RedoIcon,
} from "@/shared/components/icons";
import {
  migrateFromLocalStorage,
  formatBytes,
} from "@/shared/utils/storage";
import {
  getSpriteStorageProvider,
  hasLocalProjects,
  checkCloudProjects,
  uploadLocalProjectsToCloud,
  clearLocalProjects,
  clearCloudProjects,
} from "@/domains/sprite/services/projectStorage";
import { downloadCompositedFramesAsZip, downloadCompositedSpriteSheet } from "@/domains/sprite/utils/export";

// ============================================
// Main Editor Component
// ============================================

function SpriteEditorMain() {
  const { user } = useAuth();
  const { imageSrc, setImageSrc, imageSize, setImageSize, imageRef } = useEditorImage();
  const { frames, setFrames, nextFrameId, setNextFrameId, selectedFrameId, selectedFrameIds, selectedPointIndex } = useEditorFramesMeta();
  const { toolMode, setSpriteToolMode, currentPoints, setCurrentPoints, setIsSpacePressed } = useEditorTools();
  const { setScale, setZoom, setPan } = useEditorViewport();
  const { fps } = useEditorAnimation();
  const { undo, redo, canUndo, canRedo, pushHistory } = useEditorHistory();
  const { projectName, setProjectName, savedProjects, setSavedSpriteProjects, currentProjectId, setCurrentProjectId, newProject, isAutosaveLoading } = useEditorProject();
  const { isProjectListOpen, setIsProjectListOpen, isSpriteSheetImportOpen, setIsSpriteSheetImportOpen, isVideoImportOpen, setIsVideoImportOpen, pendingVideoFile, setPendingVideoFile } = useEditorWindows();
  const { tracks, addTrack, restoreTracks } = useEditorTracks();
  const { copyFrame, pasteFrame } = useEditorClipboard();
  const { resetLayout } = useLayout();

  // Panel visibility states
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [isFrameEditOpen, setIsFrameEditOpen] = useState(true);

  // Save feedback state
  const [isSaving, setIsSaving] = useState(false);
  const [saveCount, setSaveCount] = useState(0);

  // Video import modal state is now in the UI store (pendingVideoFile, isVideoImportOpen)

  // Background removal state
  const [showBgRemovalConfirm, setShowBgRemovalConfirm] = useState(false);

  // File input ref for menu-triggered image import
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { t } = useLanguage();
  const storageProvider = useMemo(() => getSpriteStorageProvider(user), [user]);

  // Background removal hook
  const {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  } = useFrameBackgroundRemoval({
    frames,
    getCurrentFrameIndex: () => useSpriteTrackStore.getState().currentFrameIndex,
    selectedFrameIds,
    setFrames,
    pushHistory,
    translations: {
      backgroundRemovalFailed: t.backgroundRemovalFailed,
      selectFrameForBgRemoval: t.selectFrameForBgRemoval,
      frameImageNotFound: t.frameImageNotFound,
      processingFrameProgress: t.processingFrameProgress,
    },
  });
  const [storageInfo, setStorageInfo] = useState({ used: 0, quota: 0, percentage: 0 });
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [cloudProjectCount, setCloudProjectCount] = useState(0);

  // Load saved projects when storage provider changes (login/logout)
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // Migrate from localStorage if needed (one-time)
        await migrateFromLocalStorage();

        const projects = await storageProvider.getAllProjects();
        setSavedSpriteProjects(projects);

        const info = await storageProvider.getStorageInfo();
        setStorageInfo(info);
      } catch (e) {
        console.error("Failed to load saved projects:", e);
      }
    };

    loadProjects();
  }, [storageProvider, setSavedSpriteProjects]);

  // Check local/cloud conflicts when user logs in
  useEffect(() => {
    const checkSyncConflicts = async () => {
      if (!user) return;

      try {
        const hasLocal = await hasLocalProjects();
        const hasCloud = await checkCloudProjects(user.uid);

        if (hasLocal && hasCloud) {
          const localProjects = await (await import("@/shared/utils/storage")).getAllProjects();
          const cloudProjects = await (await import("@/shared/lib/firebase/firebaseSpriteStorage")).getAllSpriteProjectsFromFirebase(user.uid);

          setLocalProjectCount(localProjects.length);
          setCloudProjectCount(cloudProjects.length);
          setShowSyncDialog(true);
        } else if (hasLocal && !hasCloud) {
          await uploadLocalProjectsToCloud(user);
          const projects = await storageProvider.getAllProjects();
          setSavedSpriteProjects(projects);
        }
      } catch (error) {
        console.error("Failed to check sync conflicts:", error);
      }
    };

    checkSyncConflicts();
  }, [user, storageProvider, setSavedSpriteProjects]);

  // Image upload handler - sets as main sprite image
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;

        setImageSrc(src);
        setCurrentPoints([]);
        setFrames((prev) => prev.map((frame) => ({ ...frame, points: [] })));

        const img = new Image();
        img.onload = () => {
          setImageSize({ width: img.width, height: img.height });
          imageRef.current = img;

          const maxWidth = 900;
          const newScale = Math.min(maxWidth / img.width, 1);
          setScale(newScale);
          setZoom(1);
          setPan({ x: 0, y: 0 });
        };
        img.src = src;
      };
      reader.readAsDataURL(file);

      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [setImageSrc, setImageSize, imageRef, setScale, setZoom, setPan, setCurrentPoints, setFrames],
  );

  // Extract frame image helper
  const extractFrameImage = useCallback(
    (points: { x: number; y: number }[]): string | undefined => {
      if (!imageRef.current || points.length < 3) return undefined;

      const img = imageRef.current;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => p.y);
      const bbox = {
        minX: Math.min(...xs),
        minY: Math.min(...ys),
        maxX: Math.max(...xs),
        maxY: Math.max(...ys),
      };
      const width = bbox.maxX - bbox.minX;
      const height = bbox.maxY - bbox.minY;

      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = width;
      tempCanvas.height = height;
      const ctx = tempCanvas.getContext("2d");
      if (!ctx) return undefined;

      ctx.beginPath();
      ctx.moveTo(points[0].x - bbox.minX, points[0].y - bbox.minY);
      points.slice(1).forEach((p) => {
        ctx.lineTo(p.x - bbox.minX, p.y - bbox.minY);
      });
      ctx.closePath();
      ctx.clip();

      ctx.drawImage(img, bbox.minX, bbox.minY, width, height, 0, 0, width, height);

      return tempCanvas.toDataURL("image/png");
    },
    [imageRef],
  );

  // Import sprite sheet frames → new track
  const handleSpriteSheetImport = useCallback(
    (importedFrames: Omit<SpriteFrame, "id">[]) => {
      if (importedFrames.length === 0) return;

      pushHistory();

      const newFrames = importedFrames.map((frame, idx) => ({
        ...frame,
        id: nextFrameId + idx,
      }));

      addTrack("Sheet Import", newFrames as SpriteFrame[]);
      setNextFrameId((prev) => prev + importedFrames.length);
    },
    [nextFrameId, setNextFrameId, pushHistory, addTrack],
  );

  // Import video frames → new track
  const handleVideoImport = useCallback(
    (importedFrames: Omit<SpriteFrame, "id">[]) => {
      if (importedFrames.length === 0) return;

      pushHistory();

      const newFrames = importedFrames.map((frame, idx) => ({
        ...frame,
        id: nextFrameId + idx,
      }));

      addTrack("Video Import", newFrames as SpriteFrame[]);
      setNextFrameId((prev) => prev + importedFrames.length);
      setIsVideoImportOpen(false);
      setPendingVideoFile(null);
    },
    [nextFrameId, setNextFrameId, pushHistory, addTrack, setIsVideoImportOpen, setPendingVideoFile],
  );

  // Undo last point
  const undoLastPoint = useCallback(() => {
    setCurrentPoints((prev) => prev.slice(0, -1));
  }, [setCurrentPoints]);

  // Cancel current polygon
  const cancelCurrentPolygon = useCallback(() => {
    setCurrentPoints([]);
  }, [setCurrentPoints]);

  // Complete frame
  const completeFrame = useCallback(() => {
    if (currentPoints.length < 3) return;

    // Save history before adding new frame
    pushHistory();

    const imageData = extractFrameImage(currentPoints);

    const newFrame = {
      id: nextFrameId,
      points: [...currentPoints],
      name: `Frame ${nextFrameId}`,
      imageData,
      offset: { x: 0, y: 0 },
    };

    setFrames((prev) => [...prev, newFrame]);
    setNextFrameId((prev) => prev + 1);
    setCurrentPoints([]);
  }, [
    currentPoints,
    nextFrameId,
    extractFrameImage,
    setFrames,
    setNextFrameId,
    setCurrentPoints,
    pushHistory,
  ]);

  // Helper: get all frames across all tracks
  const allFrames = tracks.flatMap((t) => t.frames);
  const firstFrameImage = allFrames.find((f) => f.imageData)?.imageData;
  const hasRenderableFrames = tracks.length > 0 && allFrames.some((f) => f.imageData);

  // Export actions (moved from timeline panel to File menu)
  const exportZip = useCallback(async () => {
    if (!hasRenderableFrames) return;
    try {
      await downloadCompositedFramesAsZip(tracks, projectName.trim() || "sprite-project");
    } catch (error) {
      console.error("Export failed:", error);
      alert(`${t.exportFailed}: ${(error as Error).message}`);
    }
  }, [hasRenderableFrames, tracks, projectName, t.exportFailed]);

  const exportSpriteSheet = useCallback(async () => {
    if (!hasRenderableFrames) return;
    try {
      await downloadCompositedSpriteSheet(tracks, projectName.trim() || "sprite-project");
    } catch (error) {
      console.error("Export failed:", error);
      alert(`${t.exportFailed}: ${(error as Error).message}`);
    }
  }, [hasRenderableFrames, tracks, projectName, t.exportFailed]);

  // Save project (overwrite if existing, create new if not)
  const saveProject = useCallback(async () => {
    if (tracks.length === 0 || !allFrames.some((f) => f.imageData)) {
      return;
    }

    const name = projectName.trim() || `Project ${new Date().toLocaleString()}`;
    const saveImageSrc = imageSrc || firstFrameImage || "";

    setIsSaving(true);
    if (currentProjectId) {
      const updatedProject = {
        id: currentProjectId,
        name,
        imageSrc: saveImageSrc,
        imageSize: imageSize,
        tracks,
        nextFrameId,
        fps,
        savedAt: Date.now(),
      };

      try {
        await storageProvider.saveProject(updatedProject);
        setSavedSpriteProjects((prev: SavedSpriteProject[]) =>
          prev.map((p) => (p.id === currentProjectId ? updatedProject : p)),
        );

        const info = await storageProvider.getStorageInfo();
        setStorageInfo(info);
        setSaveCount((c) => c + 1);
      } catch (error) {
        console.error("Save failed:", error);
        alert(`${t.saveFailed}: ${(error as Error).message}`);
      } finally {
        setIsSaving(false);
      }
    } else {
      const newId = Date.now().toString();
      const newProj = {
        id: newId,
        name,
        imageSrc: saveImageSrc,
        imageSize: imageSize,
        tracks,
        nextFrameId,
        fps,
        savedAt: Date.now(),
      };

      try {
        await storageProvider.saveProject(newProj);
        setSavedSpriteProjects((prev: SavedSpriteProject[]) => [newProj, ...prev]);
        setCurrentProjectId(newId);

        const info = await storageProvider.getStorageInfo();
        setStorageInfo(info);
        setSaveCount((c) => c + 1);
      } catch (error) {
        console.error("Save failed:", error);
        alert(`${t.saveFailed}: ${(error as Error).message}`);
      } finally {
        setIsSaving(false);
      }
    }
  }, [
    t,
    imageSrc,
    imageSize,
    tracks,
    allFrames,
    firstFrameImage,
    projectName,
    nextFrameId,
    fps,
    currentProjectId,
    storageProvider,
    setSavedSpriteProjects,
    setCurrentProjectId,
  ]);

  // Save project as new (always create new project)
  const saveProjectAs = useCallback(async () => {
    if (tracks.length === 0 || !allFrames.some((f) => f.imageData)) {
      return;
    }

    const inputName = prompt(t.enterProjectName, projectName || "");
    if (inputName === null) return;

    const name = inputName.trim() || `Project ${new Date().toLocaleString()}`;
    const newId = Date.now().toString();
    const saveImageSrc = imageSrc || firstFrameImage || "";

    const newProj = {
      id: newId,
      name,
      imageSrc: saveImageSrc,
      imageSize: imageSize,
      tracks,
      nextFrameId,
      fps,
      savedAt: Date.now(),
    };

    setIsSaving(true);
    try {
      await storageProvider.saveProject(newProj);
      setSavedSpriteProjects((prev: SavedSpriteProject[]) => [newProj, ...prev]);
      setCurrentProjectId(newId);
      setProjectName(name);

      const info = await storageProvider.getStorageInfo();
      setStorageInfo(info);
      setSaveCount((c) => c + 1);
    } catch (error) {
      console.error("Save failed:", error);
      alert(`${t.saveFailed}: ${(error as Error).message}`);
    } finally {
      setIsSaving(false);
    }
  }, [
    imageSrc,
    imageSize,
    tracks,
    allFrames,
    firstFrameImage,
    projectName,
    nextFrameId,
    fps,
    storageProvider,
    setSavedSpriteProjects,
    setCurrentProjectId,
    setProjectName,
    t,
  ]);

  // Load project by id (supports cloud metadata-only list)
  const loadProject = useCallback(
    async (projectMeta: (typeof savedProjects)[0]) => {
      try {
        const project = await storageProvider.getProject(projectMeta.id);
        if (!project) {
          throw new Error("Project not found");
        }

        setImageSrc(project.imageSrc);
        setImageSize(project.imageSize);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw = project as any;
        const tracks = Array.isArray(project.tracks)
          ? project.tracks
          : migrateFramesToTracks(raw.frames ?? []);
        restoreTracks(tracks, project.nextFrameId);
        setProjectName(project.name);
        setCurrentProjectId(project.id);
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
        alert((error as Error).message);
      }
    },
    [
      storageProvider,
      setImageSrc,
      setImageSize,
      restoreTracks,
      setProjectName,
      setCurrentProjectId,
      setCurrentPoints,
      imageRef,
      setScale,
      setIsProjectListOpen,
    ],
  );

  // Delete project
  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!confirm(t.deleteConfirm)) return;

      try {
        await storageProvider.deleteProject(projectId);
        setSavedSpriteProjects((prev) => prev.filter((p) => p.id !== projectId));

        // Update storage info
        const info = await storageProvider.getStorageInfo();
        setStorageInfo(info);
      } catch (error) {
        console.error("Delete failed:", error);
        alert(`${t.deleteFailed}: ${(error as Error).message}`);
      }
    },
    [storageProvider, setSavedSpriteProjects, t],
  );

  // Spacebar handler for temporary hand mode + Undo/Redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Spacebar - prevent button re-trigger and enable panning
      if (e.code === "Space" && !e.repeat) {
        // Skip if focus is on interactive elements (input, select, textarea, etc.)
        const target = e.target as HTMLElement;
        const isInteractiveElement =
          target.tagName === "INPUT" ||
          target.tagName === "SELECT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable;

        if (isInteractiveElement) {
          return; // Let the element handle the spacebar normally
        }

        e.preventDefault();
        // Blur focused button to prevent spacebar from triggering it
        if (document.activeElement instanceof HTMLButtonElement) {
          document.activeElement.blur();
        }
        setIsSpacePressed(true);
      }

      // Tool shortcuts (skip if modifier keys are pressed)
      if (!e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === "p") setSpriteToolMode("pen");
        if (e.key === "v") setSpriteToolMode("select");
        if (e.key === "h") setSpriteToolMode("hand");
      }

      // Ctrl+Z / Cmd+Z = Undo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        if (canUndo) undo();
      }

      // Ctrl+Shift+Z / Cmd+Shift+Z = Redo
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z" && e.shiftKey) {
        e.preventDefault();
        if (canRedo) redo();
      }

      // Ctrl+Y / Cmd+Y = Redo (alternative)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        if (canRedo) redo();
      }

      // Ctrl+C / Cmd+C = Copy frame
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c" && !e.shiftKey) {
        e.preventDefault();
        copyFrame();
      }

      // Ctrl+V / Cmd+V = Paste frame
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v" && !e.shiftKey) {
        e.preventDefault();
        pasteFrame();
      }

      // Ctrl+S / Cmd+S = Save
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (e.shiftKey) {
          saveProjectAs();
        } else {
          saveProject();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsSpacePressed(false);
      }
    };

    // Use capture phase to intercept before button default behavior
    window.addEventListener("keydown", handleKeyDown, true);
    window.addEventListener("keyup", handleKeyUp, true);

    return () => {
      window.removeEventListener("keydown", handleKeyDown, true);
      window.removeEventListener("keyup", handleKeyUp, true);
    };
  }, [setIsSpacePressed, undo, redo, canUndo, canRedo, copyFrame, pasteFrame, saveProject, saveProjectAs]);

  // Handle new project with confirmation
  const handleNew = useCallback(() => {
    if (frames.length > 0 || imageSrc) {
      if (window.confirm(t.newProjectConfirm)) {
        newProject();
      }
    } else {
      newProject();
    }
  }, [frames.length, imageSrc, t.newProjectConfirm, newProject]);

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden relative">
      {/* Loading overlay during autosave restore */}
      <LoadingOverlay isLoading={isAutosaveLoading} message={t.loading || "Loading..."} />

      {/* Save toast notification */}
      <SaveToast
        isSaving={isSaving}
        saveCount={saveCount}
        savingLabel={t.saving || "Saving…"}
        savedLabel={t.saved || "Saved"}
      />

      {/* Hidden file input for menu-triggered image import */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Header Slot */}
      <HeaderContent
        title={t.spriteEditor}
        menuBar={
          <SpriteMenuBar
            onNew={handleNew}
            onLoad={() => setIsProjectListOpen(true)}
            onSave={saveProject}
            onSaveAs={saveProjectAs}
            onExportZip={exportZip}
            onExportSpriteSheet={exportSpriteSheet}
            onImportImage={() => imageInputRef.current?.click()}
            onImportSheet={() => setIsSpriteSheetImportOpen(true)}
            onImportVideo={() => setIsVideoImportOpen(true)}
            onTogglePreview={() => setIsPreviewOpen(!isPreviewOpen)}
            onToggleFrameEdit={() => setIsFrameEditOpen(!isFrameEditOpen)}
            onResetLayout={resetLayout}
            isPreviewOpen={isPreviewOpen}
            isFrameEditOpen={isFrameEditOpen}
            canSave={hasRenderableFrames && !isSaving}
            canExport={hasRenderableFrames}
            isLoading={isSaving}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            translations={{
              file: t.file,
              edit: t.edit,
              window: t.window,
              new: t.new,
              load: t.load,
              save: t.save,
              saveAs: t.saveAs,
              export: t.export,
              importImage: t.importImage,
              importSheet: t.importSheet,
              importVideo: t.importVideo,
              undo: t.undo,
              redo: t.redo,
              preview: t.animation,
              frameEdit: t.frameWindow,
              resetLayout: t.resetLayout,
            }}
          />
        }
        projectName={{
          value: projectName,
          onChange: setProjectName,
          placeholder: t.projectName,
        }}
      />

      {/* Top Toolbar */}
      {/* Top Toolbar */}
      <Scrollbar
        className="bg-surface-primary border-b border-border-default shrink-0"
        overflow={{ x: "scroll", y: "hidden" }}
      >
        <div className="flex items-center gap-1 px-3.5 py-1 whitespace-nowrap">
          {/* Tool buttons */}
          <div className="flex gap-0.5 bg-surface-secondary rounded p-0.5">
            <Tooltip
              content={
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{t.pen}</span>
                  <span className="text-text-tertiary text-[11px]">{t.penToolTip}</span>
                  <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default text-[10px] text-text-tertiary">
                    <span>{t.clickToAddPoint}</span>
                    <span>{t.firstPointToComplete}</span>
                  </div>
                </div>
              }
              shortcut="P"
            >
              <button
                onClick={() => setSpriteToolMode("pen")}
                className={`p-1.5 rounded transition-colors ${
                  toolMode === "pen"
                    ? "bg-accent-primary text-white"
                    : "hover:bg-interactive-hover"
                }`}
              >
                <BrushIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip
              content={
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{t.select}</span>
                  <span className="text-text-tertiary text-[11px]">{t.selectToolTip}</span>
                  <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default text-[10px] text-text-tertiary">
                    <span>{t.clickToSelect}</span>
                    <span>{t.dragToMove}</span>
                  </div>
                </div>
              }
              shortcut="V"
            >
              <button
                onClick={() => setSpriteToolMode("select")}
                className={`p-1.5 rounded transition-colors ${
                  toolMode === "select"
                    ? "bg-accent-primary text-white"
                    : "hover:bg-interactive-hover"
                }`}
              >
                <CursorIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip
              content={
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{t.hand}</span>
                  <span className="text-text-tertiary text-[11px]">{t.handToolTip}</span>
                  <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default text-[10px] text-text-tertiary">
                    <span>{t.dragToPan}</span>
                    <span>{t.spaceAltToPan}</span>
                    <span>{t.wheelToZoom}</span>
                  </div>
                </div>
              }
              shortcut="H"
            >
              <button
                onClick={() => setSpriteToolMode("hand")}
                className={`p-1.5 rounded transition-colors ${
                  toolMode === "hand"
                    ? "bg-accent-primary text-white"
                    : "hover:bg-interactive-hover"
                }`}
              >
                <HandIcon className="w-4 h-4" />
              </button>
            </Tooltip>

            {/* Divider */}
            <div className="w-px bg-border-default mx-0.5" />

            {/* AI Background Removal */}
            <Tooltip
              content={
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{t.removeBackground}</span>
                  <span className="text-text-tertiary text-[11px]">
                    AI 모델을 사용해 프레임 배경을 제거합니다
                  </span>
                  <span className="text-[10px] text-text-tertiary">
                    첫 실행 시 모델 다운로드 (~30MB)
                  </span>
                </div>
              }
            >
              <button
                onClick={() => setShowBgRemovalConfirm(true)}
                disabled={isRemovingBackground || frames.filter((f) => f.imageData).length === 0}
                className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                  isRemovingBackground
                    ? "bg-accent-primary text-white cursor-wait"
                    : "hover:bg-interactive-hover"
                }`}
              >
                <BackgroundRemovalIcon className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>

          <div className="h-4 w-px bg-border-default mx-1" />

          {/* Undo/Redo */}
          <div className="flex items-center gap-0.5">
            <Tooltip content={`${t.undo} (Ctrl+Z)`}>
              <button
                onClick={undo}
                disabled={!canUndo}
                className="p-1 hover:bg-interactive-hover disabled:opacity-30 rounded transition-colors"
              >
                <UndoIcon className="w-4 h-4" />
              </button>
            </Tooltip>
            <Tooltip content={`${t.redo} (Ctrl+Shift+Z)`}>
              <button
                onClick={redo}
                disabled={!canRedo}
                className="p-1 hover:bg-interactive-hover disabled:opacity-30 rounded transition-colors"
              >
                <RedoIcon className="w-4 h-4" />
              </button>
            </Tooltip>
          </div>

          <div className="h-4 w-px bg-border-default mx-1" />

          {/* Context-specific controls */}
          {toolMode === "pen" && currentPoints.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={undoLastPoint}
                className="px-2 py-1 bg-accent-warning hover:bg-accent-warning-hover text-white rounded text-xs transition-colors"
              >
                {t.undo}
              </button>
              <button
                onClick={cancelCurrentPolygon}
                className="px-2 py-1 bg-accent-danger hover:bg-accent-danger-hover text-white rounded text-xs transition-colors"
              >
                {t.cancel}
              </button>
              {currentPoints.length >= 3 && (
                <button
                  onClick={completeFrame}
                  className="px-2 py-1 bg-accent-primary hover:bg-accent-primary-hover text-white rounded text-xs transition-colors"
                >
                  {t.complete}
                </button>
              )}
              <span className="text-text-secondary text-xs">
                {t.points}: {currentPoints.length}
              </span>
            </div>
          )}

          {toolMode === "select" && selectedFrameId !== null && (
            <span className="text-accent-primary text-xs">
              {t.frame} {frames.findIndex((f) => f.id === selectedFrameId) + 1} {t.selected}
              {selectedPointIndex !== null && ` (${t.point} ${selectedPointIndex + 1})`}
            </span>
          )}

          <div className="flex-1 min-w-0" />
        </div>
      </Scrollbar>

      {/* Main Content - Split View */}
      <div className="flex-1 min-h-0 relative">
        <SplitView />
      </div>

      {/* Project List Modal */}
      {isProjectListOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-primary border border-border-default rounded-xl w-[500px] max-h-[80vh] flex flex-col shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">{t.savedProjects}</h2>
                {storageInfo.quota > 0 && (
                  <div className="text-xs text-text-tertiary flex items-center gap-2 mt-1">
                    <span>
                      {t.storage}: {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.quota)}
                    </span>
                    <div className="w-20 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${storageInfo.percentage > 80 ? "bg-accent-danger" : "bg-accent-primary"}`}
                        style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
              <button
                onClick={() => setIsProjectListOpen(false)}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
              >
                ×
              </button>
            </div>

            {/* Project list */}
            <div className="flex-1 overflow-y-auto p-4">
              {savedProjects.length === 0 ? (
                <div className="text-center text-text-tertiary py-8">
                  {t.noSavedProjects}
                </div>
              ) : (
                <div className="space-y-2">
                  {savedProjects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg hover:bg-interactive-hover group transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="w-16 h-16 bg-surface-tertiary rounded-lg shrink-0 overflow-hidden">
                        {(project.thumbnailUrl || project.tracks[0]?.frames[0]?.imageData) && (
                          <img
                            src={project.thumbnailUrl || project.tracks[0]?.frames[0]?.imageData}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-text-primary">{project.name}</div>
                        <div className="text-xs text-text-secondary">
                          {project.tracks.length} tracks · {project.tracks.reduce((sum, tr) => sum + tr.frames.length, 0)} {t.frames} · {project.fps}fps
                        </div>
                        <div className="text-xs text-text-tertiary">
                          {new Date(project.savedAt).toLocaleString()}
                        </div>
                      </div>

                      {/* Buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => loadProject(project)}
                          className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm transition-colors"
                        >
                          {t.load}
                        </button>
                        <button
                          onClick={() => deleteProject(project.id)}
                          className="px-2 py-1.5 bg-accent-danger hover:bg-accent-danger-hover text-white rounded-lg text-sm transition-colors"
                        >
                          {t.delete}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <SyncDialog
        isOpen={showSyncDialog}
        localCount={localProjectCount}
        cloudCount={cloudProjectCount}
        onKeepCloud={async () => {
          await clearLocalProjects();
          setShowSyncDialog(false);
          const projects = await storageProvider.getAllProjects();
          setSavedSpriteProjects(projects);
        }}
        onKeepLocal={async () => {
          if (user) {
            await clearCloudProjects(user);
            await uploadLocalProjectsToCloud(user);
            const projects = await storageProvider.getAllProjects();
            setSavedSpriteProjects(projects);
          }
          setShowSyncDialog(false);
        }}
        onCancel={() => {
          setShowSyncDialog(false);
        }}
      />

      {/* Sprite Sheet Import Modal */}
      <SpriteSheetImportModal
        isOpen={isSpriteSheetImportOpen}
        onClose={() => setIsSpriteSheetImportOpen(false)}
        onImport={handleSpriteSheetImport}
        startFrameId={nextFrameId}
      />

      {/* Video Import Modal */}
      <VideoImportModal
        isOpen={isVideoImportOpen}
        onClose={() => {
          setIsVideoImportOpen(false);
          setPendingVideoFile(null);
        }}
        onImport={handleVideoImport}
        startFrameId={nextFrameId}
        initialFile={pendingVideoFile}
        translations={{
          videoImport: t.videoImport,
          selectVideo: t.selectVideo,
          videoPreview: t.videoPreview,
          extractionSettings: t.extractionSettings,
          extractFrames: t.extractFrames,
          everyNthFrame: t.everyNthFrame,
          timeInterval: t.timeInterval,
          seconds: t.seconds,
          extracting: t.extracting,
          maxFrames: t.maxFrames,
          extractedFrames: t.extractedFrames,
          noFramesExtracted: t.noFramesExtracted,
          selectAll: t.selectAll,
          deselectAll: t.deselectAll,
          framesSelected: t.framesSelected,
          importSelected: t.importSelected,
          cancel: t.cancel,
        }}
      />

      {/* Background Removal Modals */}
      <FrameBackgroundRemovalModals
        showConfirm={showBgRemovalConfirm}
        onCloseConfirm={() => setShowBgRemovalConfirm(false)}
        onConfirmCurrentFrame={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground("current");
        }}
        onConfirmSelectedFrames={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground("selected");
        }}
        onConfirmAllFrames={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground("all");
        }}
        isRemoving={isRemovingBackground}
        progress={bgRemovalProgress}
        status={bgRemovalStatus}
        hasFrames={frames.filter((f) => f.imageData).length > 0}
        selectedFrameCount={selectedFrameIds.length}
        translations={{
          removeBackground: t.removeBackground,
          cancel: t.cancel,
          removingBackgroundDesc: t.removingBackgroundDesc,
          frameBackgroundRemoval: t.frameBackgroundRemoval,
          firstRunDownload: t.firstRunDownload,
          currentFrame: t.removeBackgroundCurrentFrame,
          selectedFrames: t.removeBackgroundSelectedFrames,
          allFrames: t.removeBackgroundAllFrames,
        }}
      />

    </div>
  );
}

// ============================================
// Main Page Component with Providers
// ============================================

export default function SpriteEditor() {
  return (
    <EditorProvider>
      <LayoutProvider>
        <SpriteEditorMain />
      </LayoutProvider>
    </EditorProvider>
  );
}
