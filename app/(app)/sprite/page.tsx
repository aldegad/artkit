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
  SpriteTopToolbar,
  useFrameBackgroundRemoval,
  useSpriteKeyboardShortcuts,
  FrameBackgroundRemovalModals,
} from "@/domains/sprite";
import type { SavedSpriteProject } from "@/domains/sprite";
import { useSpriteTrackStore } from "@/domains/sprite/stores";
import { migrateFramesToTracks } from "@/domains/sprite/utils/migration";
import SpriteMenuBar from "@/domains/sprite/components/SpriteMenuBar";
import VideoImportModal from "@/domains/sprite/components/VideoImportModal";
import SpriteProjectListModal from "@/domains/sprite/components/SpriteProjectListModal";
import type { SpriteSaveLoadProgress } from "@/shared/lib/firebase/firebaseSpriteStorage";
import { useLanguage, useAuth } from "@/shared/contexts";
import { HeaderContent, SaveToast, LoadingOverlay } from "@/shared/components";
import { SyncDialog } from "@/shared/components/app/auth";
import {
  migrateFromLocalStorage,
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
  const [saveProgress, setSaveProgress] = useState<SpriteSaveLoadProgress | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<SpriteSaveLoadProgress | null>(null);

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
    setSaveProgress(null);
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
        await storageProvider.saveProject(updatedProject, setSaveProgress);
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
        setSaveProgress(null);
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
        await storageProvider.saveProject(newProj, setSaveProgress);
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
        setSaveProgress(null);
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
    setSaveProgress(null);
    try {
      await storageProvider.saveProject(newProj, setSaveProgress);
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
      setSaveProgress(null);
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
      } finally {
        setIsProjectLoading(false);
        setLoadProgress(null);
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

      setIsProjectLoading(true);
      setLoadProgress(null);
      try {
        await storageProvider.deleteProject(projectId);
        setSavedSpriteProjects((prev) => prev.filter((p) => p.id !== projectId));

        // Update storage info
        const info = await storageProvider.getStorageInfo();
        setStorageInfo(info);
      } catch (error) {
        console.error("Delete failed:", error);
        alert(`${t.deleteFailed}: ${(error as Error).message}`);
      } finally {
        setIsProjectLoading(false);
        setLoadProgress(null);
      }
    },
    [storageProvider, setSavedSpriteProjects, t],
  );

  useSpriteKeyboardShortcuts({
    setIsSpacePressed,
    setSpriteToolMode,
    canUndo,
    canRedo,
    undo,
    redo,
    copyFrame,
    pasteFrame,
    saveProject,
    saveProjectAs,
  });

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
      <LoadingOverlay
        isLoading={isAutosaveLoading || isProjectLoading}
        message={
          isProjectLoading
            ? `${t.loading || "Loading..."} ${loadProgress ? `${loadProgress.current}/${Math.max(1, loadProgress.total)} - ${loadProgress.itemName}` : ""}`
            : (t.loading || "Loading...")
        }
      />

      {/* Save toast notification */}
      <SaveToast
        isSaving={isSaving}
        saveCount={saveCount}
        savingLabel={
          saveProgress
            ? `${t.saving || "Saving…"} ${saveProgress.current}/${Math.max(1, saveProgress.total)} - ${saveProgress.itemName}`
            : (t.saving || "Saving…")
        }
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

      <SpriteTopToolbar
        toolMode={toolMode}
        setSpriteToolMode={setSpriteToolMode}
        currentPoints={currentPoints}
        selectedFrameId={selectedFrameId}
        selectedPointIndex={selectedPointIndex}
        frames={frames}
        isRemovingBackground={isRemovingBackground}
        hasFramesWithImage={frames.some((f) => Boolean(f.imageData))}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onUndoLastPoint={undoLastPoint}
        onCancelCurrentPolygon={cancelCurrentPolygon}
        onCompleteFrame={completeFrame}
        onRequestBackgroundRemoval={() => setShowBgRemovalConfirm(true)}
      />

      {/* Main Content - Split View */}
      <div className="flex-1 min-h-0 relative">
        <SplitView />
      </div>

      {/* Project List Modal */}
      <SpriteProjectListModal
        isOpen={isProjectListOpen}
        onClose={() => setIsProjectListOpen(false)}
        projects={savedProjects}
        currentProjectId={currentProjectId}
        onLoadProject={loadProject}
        onDeleteProject={deleteProject}
        storageInfo={storageInfo}
        isLoading={isProjectLoading}
        loadProgress={loadProgress}
        translations={{
          savedProjects: t.savedProjects || "저장된 프로젝트",
          noSavedProjects: t.noSavedProjects || "저장된 프로젝트가 없습니다",
          storage: t.storage || "저장소",
          load: t.load || "불러오기",
          delete: t.delete,
          frames: t.frames || "프레임",
          loading: t.loading,
        }}
      />

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
