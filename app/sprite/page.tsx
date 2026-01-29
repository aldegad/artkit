"use client";

import { useEffect, useCallback, useState } from "react";
import {
  EditorProvider,
  useEditor,
  LayoutProvider,
  SplitView,
  CompositionLayerPanel,
  SpriteSheetImportModal,
  SpriteFrame,
} from "../../domains/sprite";
import { useLanguage } from "../../shared/contexts";
import { Tooltip } from "../../shared/components";
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
    setToolMode,
    currentPoints,
    setCurrentPoints,
    frames,
    nextFrameId,
    setFrames,
    setNextFrameId,
    selectedFrameId,
    selectedPointIndex,
    setIsSpacePressed,
    projectName,
    setProjectName,
    savedProjects,
    setSavedProjects,
    currentProjectId,
    setCurrentProjectId,
    isProjectListOpen,
    setIsProjectListOpen,
    isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen,
    undo,
    redo,
    canUndo,
    canRedo,
    pushHistory,
    newProject,
    copyFrame,
    pasteFrame,
    compositionLayers,
    addCompositionLayer,
  } = useEditor();

  // Layers panel open state
  const [isLayersPanelOpen, setIsLayersPanelOpen] = useState(false);

  const { t } = useLanguage();
  const [storageInfo, setStorageInfo] = useState({ used: 0, quota: 0, percentage: 0 });

  // Load saved projects from IndexedDB
  useEffect(() => {
    const loadProjects = async () => {
      try {
        // Migrate from localStorage if needed (one-time)
        await migrateFromLocalStorage();

        // Load all projects from IndexedDB
        const projects = await getAllProjects();
        setSavedProjects(projects);

        // Get storage info
        const info = await getStorageInfo();
        setStorageInfo(info);
      } catch (e) {
        console.error("Failed to load saved projects:", e);
      }
    };

    loadProjects();
  }, [setSavedProjects]);

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
        setSavedProjects((prev) =>
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
        setSavedProjects((prev) => [newProject, ...prev]);
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
    setSavedProjects,
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
      setSavedProjects((prev) => [newProject, ...prev]);
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
    setSavedProjects,
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
        setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));

        // Update storage info
        const info = await getStorageInfo();
        setStorageInfo(info);
      } catch (error) {
        console.error("Delete failed:", error);
        alert(`${t.deleteFailed}: ${(error as Error).message}`);
      }
    },
    [setSavedProjects, t],
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
        setSavedProjects(projects);

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
    [setSavedProjects, t],
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
        if (e.key === "p") setToolMode("pen");
        if (e.key === "v") setToolMode("select");
        if (e.key === "h") setToolMode("hand");
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

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      {/* Top Toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-primary border-b border-border-default shrink-0 shadow-sm h-12">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-accent-primary file:text-white hover:file:bg-accent-primary-hover file:cursor-pointer file:transition-colors cursor-pointer"
        />

        <Tooltip content={t.importSheet}>
          <button
            onClick={() => setIsSpriteSheetImportOpen(true)}
            className="px-3 py-1.5 bg-accent-success hover:bg-accent-success/80 text-white rounded-lg text-sm flex items-center gap-1.5 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM14 5a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1V5zM4 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1H5a1 1 0 01-1-1v-4zM14 15a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z"
              />
            </svg>
            {t.importSheet}
          </button>
        </Tooltip>

        <div className="h-6 w-px bg-border-default" />

        {/* Tool mode buttons */}
        <div className="flex gap-1 bg-surface-secondary rounded-lg p-1">
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
              onClick={() => setToolMode("pen")}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-colors ${
                toolMode === "pen"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover text-text-primary"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                />
              </svg>
              {t.pen}
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
              onClick={() => setToolMode("select")}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-colors ${
                toolMode === "select"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover text-text-primary"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
                />
              </svg>
              {t.select}
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
              onClick={() => setToolMode("hand")}
              className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1 transition-colors ${
                toolMode === "hand"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover text-text-primary"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
                />
              </svg>
              {t.hand}
            </button>
          </Tooltip>
        </div>

        <div className="h-6 w-px bg-border-default" />

        {toolMode === "pen" && currentPoints.length > 0 && (
          <>
            <button
              onClick={undoLastPoint}
              className="px-3 py-1.5 bg-accent-warning hover:bg-accent-warning-hover text-white rounded-lg text-sm transition-colors"
            >
              {t.undo}
            </button>
            <button
              onClick={cancelCurrentPolygon}
              className="px-3 py-1.5 bg-accent-danger hover:bg-accent-danger-hover text-white rounded-lg text-sm transition-colors"
            >
              {t.cancel}
            </button>
            {currentPoints.length >= 3 && (
              <button
                onClick={completeFrame}
                className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm transition-colors"
              >
                {t.complete}
              </button>
            )}
            <span className="text-text-secondary text-sm">
              {t.points}: {currentPoints.length}
            </span>
          </>
        )}

        {toolMode === "select" && selectedFrameId !== null && (
          <span className="text-accent-primary text-sm">
            {t.frame} {frames.findIndex((f) => f.id === selectedFrameId) + 1} {t.selected}
            {selectedPointIndex !== null && ` (${t.point} ${selectedPointIndex + 1})`}
          </span>
        )}

        <div className="flex-1" />

        {/* Project management buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (frames.length > 0 || imageSrc) {
                if (window.confirm(t.newProjectConfirm)) {
                  newProject();
                }
              } else {
                newProject();
              }
            }}
            className="px-3 py-1.5 bg-interactive-default hover:bg-interactive-hover rounded-lg text-xs transition-colors"
            title={t.newProject}
          >
            {t.new}
          </button>
          <div className="h-4 w-px bg-border-default" />
          <input
            type="text"
            placeholder={t.projectName}
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-28 px-2 py-1.5 bg-surface-secondary border border-border-default rounded-lg text-xs focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/20 transition-colors"
          />
          <button
            onClick={saveProject}
            disabled={frames.length === 0 || !frames.some((f) => f.imageData)}
            className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:cursor-not-allowed text-white rounded-lg text-xs transition-colors"
          >
            {t.save}
          </button>
          <button
            onClick={saveProjectAs}
            disabled={frames.length === 0 || !frames.some((f) => f.imageData)}
            className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:cursor-not-allowed text-text-primary border border-border-default rounded-lg text-xs transition-colors"
          >
            {t.saveAs}
          </button>
          <button
            onClick={() => setIsProjectListOpen(true)}
            className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-text-primary border border-border-default rounded-lg text-xs relative transition-colors"
            title={t.savedProjects}
          >
            {t.load}
            {savedProjects.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-danger rounded-full text-[10px] flex items-center justify-center text-white">
                {savedProjects.length}
              </span>
            )}
          </button>
        </div>

        <div className="h-6 w-px bg-border-default" />

        {/* Layers Panel Button */}
        <Tooltip content={t.layers}>
          <button
            onClick={() => setIsLayersPanelOpen(!isLayersPanelOpen)}
            className={`px-3 py-1.5 rounded-lg text-xs flex items-center gap-1.5 transition-colors ${
              isLayersPanelOpen
                ? "bg-accent-primary text-white"
                : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary border border-border-default"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
              />
            </svg>
            {t.layers}
            {compositionLayers.length > 0 && (
              <span className="bg-accent-success text-white text-[10px] px-1.5 rounded-full">
                {compositionLayers.length}
              </span>
            )}
          </button>
        </Tooltip>

        </div>

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
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                    />
                  </svg>
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
            <CompositionLayerPanel />
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
