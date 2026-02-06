"use client";

import { useEffect, useCallback, useState, useRef } from "react";
import {
  EditorProvider,
  useEditor,
  LayoutProvider,
  SplitView,
  SpriteSheetImportModal,
  SpriteFrame,
  useFrameBackgroundRemoval,
  FrameBackgroundRemovalModals,
} from "../../domains/sprite";
import SpriteMenuBar from "../../domains/sprite/components/SpriteMenuBar";
import VideoImportModal from "../../domains/sprite/components/VideoImportModal";
import { LayersPanelContent } from "../../components/panels";
import { useLanguage, HeaderSlot } from "../../shared/contexts";
import { Tooltip, Scrollbar } from "../../shared/components";
import {
  BrushIcon,
  CursorIcon,
  HandIcon,
  BackgroundRemovalIcon,
  ExportIcon,
  UndoIcon,
  RedoIcon,
  MinusIcon,
  PlusIcon,
} from "../../shared/components/icons";
import {
  saveProject as saveProjectToDB,
  getAllProjects,
  deleteProject as deleteProjectFromDB,
  migrateFromLocalStorage,
  getStorageInfo,
  formatBytes,
  exportAllProjectsToJSON,
  importProjectsFromJSON,
} from "../../utils/storage";

// ============================================
// Main Editor Component
// ============================================

function SpriteEditorMain() {
  const {
    imageSrc,
    setImageSrc,
    setImageSize,
    imageRef,
    setScale,
    setZoom,
    setPan,
    toolMode,
    setSpriteToolMode,
    currentPoints,
    setCurrentPoints,
    frames,
    nextFrameId,
    setFrames,
    setNextFrameId,
    selectedFrameId,
    selectedPointIndex,
    currentFrameIndex,
    zoom,
    setIsSpacePressed,
    projectName,
    setProjectName,
    savedProjects,
    setSavedSpriteProjects,
    currentProjectId,
    setCurrentProjectId,
    isProjectListOpen,
    setIsProjectListOpen,
    isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen,
    isVideoImportOpen,
    setIsVideoImportOpen,
    pendingVideoFile,
    setPendingVideoFile,
    undo,
    redo,
    canUndo,
    canRedo,
    pushHistory,
    newProject,
    copyFrame,
    pasteFrame,
    addCompositionLayer,
  } = useEditor();

  // Panel visibility states
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(false);
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);
  const [isFrameEditOpen, setIsFrameEditOpen] = useState(true);

  // Video import modal state is now in the UI store (pendingVideoFile, isVideoImportOpen)

  // Background removal state
  const [showBgRemovalConfirm, setShowBgRemovalConfirm] = useState(false);

  // File input ref for menu-triggered image import
  const imageInputRef = useRef<HTMLInputElement>(null);

  const { t } = useLanguage();

  // Background removal hook
  const {
    isRemovingBackground,
    bgRemovalProgress,
    bgRemovalStatus,
    handleRemoveBackground,
  } = useFrameBackgroundRemoval({
    frames,
    currentFrameIndex,
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

  // Load saved projects from IndexedDB
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // Migrate from localStorage if needed (one-time)
        await migrateFromLocalStorage();

        // Load all projects from IndexedDB
        const projects = await getAllProjects();
        setSavedSpriteProjects(projects);

        // Get storage info
        const info = await getStorageInfo();
        setStorageInfo(info);
      } catch (e) {
        console.error("Failed to load saved projects:", e);
      }
    };

    loadProjects();
  }, [setSavedSpriteProjects]);

  // Image upload handler - adds image as a composition layer
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        const fileName = file.name.replace(/\.[^/.]+$/, ""); // Remove extension

        // Add as composition layer
        addCompositionLayer(src, fileName);

        // Also set as main image if no main image exists (for sprite extraction)
        if (!imageSrc) {
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
        }

        // Open layers panel to show the new layer
        setIsLayersPanelOpen(true);
      };
      reader.readAsDataURL(file);

      // Reset input so same file can be selected again
      e.target.value = "";
    },
    [setImageSrc, setImageSize, imageRef, setScale, setZoom, setPan, setCurrentPoints, setFrames, addCompositionLayer, imageSrc],
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

  // Import sprite sheet frames
  const handleSpriteSheetImport = useCallback(
    (importedFrames: Omit<SpriteFrame, "id">[]) => {
      if (importedFrames.length === 0) return;

      // Save history before adding frames
      pushHistory();

      // Add frames with new IDs
      const newFrames = importedFrames.map((frame, idx) => ({
        ...frame,
        id: nextFrameId + idx,
      }));

      setFrames((prev) => [...prev, ...newFrames]);
      setNextFrameId((prev) => prev + importedFrames.length);
    },
    [nextFrameId, setFrames, setNextFrameId, pushHistory],
  );

  // Import video frames
  const handleVideoImport = useCallback(
    (importedFrames: Omit<SpriteFrame, "id">[]) => {
      if (importedFrames.length === 0) return;

      // Save history before adding frames
      pushHistory();

      // Add frames with new IDs
      const newFrames = importedFrames.map((frame, idx) => ({
        ...frame,
        id: nextFrameId + idx,
      }));

      setFrames((prev) => [...prev, ...newFrames]);
      setNextFrameId((prev) => prev + importedFrames.length);
      setIsVideoImportOpen(false);
      setPendingVideoFile(null);
    },
    [nextFrameId, setFrames, setNextFrameId, pushHistory, setIsVideoImportOpen, setPendingVideoFile],
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

  // Save project to IndexedDB (overwrite if existing, create new if not)
  const saveProject = useCallback(async () => {
    const hasValidFrames = frames.length > 0 && frames.some((f) => f.imageData);
    if (!hasValidFrames) {
      alert(t.noFramesToSave);
      return;
    }

    const name = projectName.trim() || `Project ${new Date().toLocaleString()}`;
    const saveImageSrc = imageSrc || frames.find((f) => f.imageData)?.imageData || "";

    if (currentProjectId) {
      const updatedProject = {
        id: currentProjectId,
        name,
        imageSrc: saveImageSrc,
        imageSize: { width: imageRef.current?.width || 0, height: imageRef.current?.height || 0 },
        frames,
        nextFrameId,
        fps: 12,
        savedAt: Date.now(),
      };

      try {
        await saveProjectToDB(updatedProject);
        setSavedSpriteProjects((prev) =>
          prev.map((p) => (p.id === currentProjectId ? updatedProject : p)),
        );

        const info = await getStorageInfo();
        setStorageInfo(info);

        alert(`"${name}" ${t.saved}`);
      } catch (error) {
        console.error("Save failed:", error);
        alert(`${t.saveFailed}: ${(error as Error).message}`);
      }
    } else {
      const newId = Date.now().toString();
      const newProject = {
        id: newId,
        name,
        imageSrc: saveImageSrc,
        imageSize: { width: imageRef.current?.width || 0, height: imageRef.current?.height || 0 },
        frames,
        nextFrameId,
        fps: 12,
        savedAt: Date.now(),
      };

      try {
        await saveProjectToDB(newProject);
        setSavedSpriteProjects((prev) => [newProject, ...prev]);
        setCurrentProjectId(newId);

        const info = await getStorageInfo();
        setStorageInfo(info);

        alert(`"${name}" ${t.saved}`);
      } catch (error) {
        console.error("Save failed:", error);
        alert(`${t.saveFailed}: ${(error as Error).message}`);
      }
    }
  }, [
    t,
    imageSrc,
    frames,
    projectName,
    nextFrameId,
    currentProjectId,
    setSavedSpriteProjects,
    setCurrentProjectId,
    imageRef,
  ]);

  // Save project as new (always create new project)
  const saveProjectAs = useCallback(async () => {
    // 프레임이 있으면 저장 가능 (imageSrc가 없어도 개별 프레임 imageData로 저장)
    const hasValidFrames = frames.length > 0 && frames.some((f) => f.imageData);
    if (!hasValidFrames) {
      alert(t.noFramesToSave);
      return;
    }

    const inputName = prompt(t.enterProjectName, projectName || "");
    if (inputName === null) return; // 취소됨

    const name = inputName.trim() || `Project ${new Date().toLocaleString()}`;
    const newId = Date.now().toString();
    // imageSrc가 없으면 첫 프레임의 imageData 사용
    const saveImageSrc = imageSrc || frames.find((f) => f.imageData)?.imageData || "";

    const newProject = {
      id: newId,
      name,
      imageSrc: saveImageSrc,
      imageSize: { width: imageRef.current?.width || 0, height: imageRef.current?.height || 0 },
      frames,
      nextFrameId,
      fps: 12,
      savedAt: Date.now(),
    };

    try {
      await saveProjectToDB(newProject);
      setSavedSpriteProjects((prev) => [newProject, ...prev]);
      setCurrentProjectId(newId);
      setProjectName(name);

      const info = await getStorageInfo();
      setStorageInfo(info);

      alert(`"${name}" ${t.saved} (${formatBytes(JSON.stringify(newProject).length)})`);
    } catch (error) {
      console.error("Save failed:", error);
      alert(`${t.saveFailed}: ${(error as Error).message}`);
    }
  }, [
    imageSrc,
    frames,
    projectName,
    nextFrameId,
    setSavedSpriteProjects,
    setCurrentProjectId,
    setProjectName,
    imageRef,
    t,
  ]);

  // Load project
  const loadProject = useCallback(
    (project: (typeof savedProjects)[0]) => {
      setImageSrc(project.imageSrc);
      setImageSize(project.imageSize);
      setFrames(project.frames);
      setNextFrameId(project.nextFrameId);
      setProjectName(project.name);
      setCurrentProjectId(project.id); // 현재 프로젝트 ID 설정
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
    },
    [
      setImageSrc,
      setImageSize,
      setFrames,
      setNextFrameId,
      setProjectName,
      setCurrentProjectId,
      setCurrentPoints,
      imageRef,
      setScale,
      setIsProjectListOpen,
    ],
  );

  // Delete project from IndexedDB
  const deleteProject = useCallback(
    async (projectId: string) => {
      if (!confirm(t.deleteConfirm)) return;

      try {
        await deleteProjectFromDB(projectId);
        setSavedSpriteProjects((prev) => prev.filter((p) => p.id !== projectId));

        // Update storage info
        const info = await getStorageInfo();
        setStorageInfo(info);
      } catch (error) {
        console.error("Delete failed:", error);
        alert(`${t.deleteFailed}: ${(error as Error).message}`);
      }
    },
    [setSavedSpriteProjects, t],
  );

  // Export all projects to JSON file
  const handleExportDB = useCallback(async () => {
    try {
      await exportAllProjectsToJSON();
    } catch (error) {
      alert((error as Error).message);
    }
  }, []);

  // Import projects from JSON file
  const handleImportDB = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const overwrite = window.confirm(t.importOverwriteConfirm);

      try {
        const result = await importProjectsFromJSON(file, overwrite);

        // Refresh project list
        const projects = await getAllProjects();
        setSavedSpriteProjects(projects);

        // Update storage info
        const info = await getStorageInfo();
        setStorageInfo(info);

        alert(`${t.importComplete}\n- ${t.added}: ${result.imported}\n- ${t.skipped}: ${result.skipped}`);
      } catch (error) {
        console.error("Import failed:", error);
        alert(`${t.importFailed}: ${(error as Error).message}`);
      }

      // Reset input
      e.target.value = "";
    },
    [setSavedSpriteProjects, t],
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
  }, [setIsSpacePressed, undo, redo, canUndo, canRedo, copyFrame, pasteFrame]);

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
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Hidden file input for menu-triggered image import */}
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        onChange={handleImageUpload}
        className="hidden"
      />

      {/* Header Slot */}
      <HeaderSlot>
        <h1 className="text-sm font-semibold whitespace-nowrap">{t.spriteEditor}</h1>
        <div className="h-4 w-px bg-border-default" />
        <input
          type="text"
          placeholder={t.projectName}
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
          className="w-20 md:w-28 px-2 py-0.5 bg-surface-secondary border border-border-default rounded text-xs focus:outline-none focus:border-accent-primary"
        />
        <SpriteMenuBar
          onNew={handleNew}
          onLoad={() => setIsProjectListOpen(true)}
          onSave={saveProject}
          onSaveAs={saveProjectAs}
          onImportImage={() => imageInputRef.current?.click()}
          onImportSheet={() => setIsSpriteSheetImportOpen(true)}
          onImportVideo={() => setIsVideoImportOpen(true)}
          onToggleLayers={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
          onTogglePreview={() => setIsPreviewOpen(!isPreviewOpen)}
          onToggleFrameEdit={() => setIsFrameEditOpen(!isFrameEditOpen)}
          isLayersOpen={isLayersPanelOpen}
          isPreviewOpen={isPreviewOpen}
          isFrameEditOpen={isFrameEditOpen}
          canSave={frames.length > 0 && frames.some((f) => f.imageData)}
          translations={{
            file: t.file,
            window: t.window,
            new: t.new,
            load: t.load,
            save: t.save,
            saveAs: t.saveAs,
            importImage: t.importImage,
            importSheet: t.importSheet,
            importVideo: t.importVideo,
            layers: t.layers,
            preview: t.animation,
            frameEdit: t.frameWindow,
          }}
        />
      </HeaderSlot>

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

          {/* Zoom controls */}
          <div className="flex items-center gap-1">
            <button
              onClick={() => setZoom((z) => Math.max(0.1, z * 0.8))}
              className="p-1 hover:bg-interactive-hover rounded transition-colors"
            >
              <MinusIcon className="w-4 h-4" />
            </button>
            <span className="text-xs w-10 text-center">{Math.round(zoom * 100)}%</span>
            <button
              onClick={() => setZoom((z) => Math.min(10, z * 1.25))}
              className="p-1 hover:bg-interactive-hover rounded transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
            </button>
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
              <div className="flex items-center gap-2">
                {/* Export/Import buttons */}
                <button
                  onClick={handleExportDB}
                  disabled={savedProjects.length === 0}
                  className="px-2 py-1 bg-surface-secondary hover:bg-surface-tertiary disabled:opacity-50 disabled:cursor-not-allowed text-text-secondary border border-border-default rounded text-xs transition-colors flex items-center gap-1"
                  title={t.export}
                >
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                  {t.export}
                </button>
                <label className="px-2 py-1 bg-surface-secondary hover:bg-surface-tertiary text-text-secondary border border-border-default rounded text-xs transition-colors flex items-center gap-1 cursor-pointer">
                  <ExportIcon className="w-3.5 h-3.5" />
                  {t.import}
                  <input type="file" accept=".json" onChange={handleImportDB} className="hidden" />
                </label>
                <div className="h-4 w-px bg-border-default" />
                <button
                  onClick={() => setIsProjectListOpen(false)}
                  className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
                >
                  ×
                </button>
              </div>
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
                        {project.frames[0]?.imageData && (
                          <img
                            src={project.frames[0].imageData}
                            alt=""
                            className="w-full h-full object-contain"
                          />
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate text-text-primary">{project.name}</div>
                        <div className="text-xs text-text-secondary">
                          {project.frames.length} {t.frames} · {project.fps}fps
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
        onConfirmAllFrames={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground("all");
        }}
        isRemoving={isRemovingBackground}
        progress={bgRemovalProgress}
        status={bgRemovalStatus}
        hasFrames={frames.filter((f) => f.imageData).length > 0}
        translations={{
          removeBackground: t.removeBackground,
          cancel: t.cancel,
          removingBackgroundDesc: t.removingBackgroundDesc,
          frameBackgroundRemoval: t.frameBackgroundRemoval,
          firstRunDownload: t.firstRunDownload,
          currentFrame: t.removeBackgroundCurrentFrame,
          allFrames: t.removeBackgroundAllFrames,
        }}
      />

      {/* Layers Panel (Floating) */}
      {isLayersPanelOpen && (
        <div className="fixed right-4 top-20 w-72 h-[500px] bg-surface-primary border border-border-default rounded-xl shadow-xl z-40 flex flex-col overflow-hidden">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border-default bg-surface-secondary">
            <h3 className="text-sm font-medium text-text-primary">{t.layers}</h3>
            <button
              onClick={() => setIsLayersPanelOpen(false)}
              className="w-6 h-6 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              ×
            </button>
          </div>
          {/* Panel Content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <LayersPanelContent />
          </div>
        </div>
      )}
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
