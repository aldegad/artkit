"use client";

import { useEffect, useCallback, useState } from "react";
import { EditorProvider, useEditor } from "../../contexts/EditorContext";
import { LayoutProvider } from "../../contexts/LayoutContext";
import { SplitView } from "../../components/layout";
import ThemeToggle from "../../components/ThemeToggle";
import Tooltip from "../../components/Tooltip";
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
import SpriteSheetImportModal from "../../components/SpriteSheetImportModal";
import { SpriteFrame } from "../../types";

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
    zoom,
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
  } = useEditor();

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

  // Image upload handler
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        setImageSrc(src);
        setCurrentPoints([]); // 새 이미지 로드 시 그리던 영역 초기화
        // 프레임 데이터는 유지하고 폴리곤(points)만 초기화 (캔버스에 안 그려짐)
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
    // 프레임이 있으면 저장 가능 (imageSrc가 없어도 개별 프레임 imageData로 저장)
    const hasValidFrames = frames.length > 0 && frames.some((f) => f.imageData);
    if (!hasValidFrames) {
      alert("저장할 프레임이 없습니다.");
      return;
    }

    const name = projectName.trim() || `Project ${new Date().toLocaleString()}`;
    // imageSrc가 없으면 첫 프레임의 imageData 사용
    const saveImageSrc = imageSrc || frames.find((f) => f.imageData)?.imageData || "";

    // 기존 프로젝트가 있으면 덮어쓰기
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

        alert(`"${name}" 저장됨`);
      } catch (error) {
        console.error("Save failed:", error);
        alert("저장 실패: " + (error as Error).message);
      }
    } else {
      // 새 프로젝트로 저장
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

        alert(`"${name}" 저장됨 (${formatBytes(JSON.stringify(newProject).length)})`);
      } catch (error) {
        console.error("Save failed:", error);
        alert("저장 실패: " + (error as Error).message);
      }
    }
  }, [
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
      alert("저장할 프레임이 없습니다.");
      return;
    }

    const inputName = prompt("프로젝트 이름을 입력하세요:", projectName || "");
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

      alert(`"${name}" 저장됨 (${formatBytes(JSON.stringify(newProject).length)})`);
    } catch (error) {
      console.error("Save failed:", error);
      alert("저장 실패: " + (error as Error).message);
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
      if (!confirm("정말 삭제하시겠습니까?")) return;

      try {
        await deleteProjectFromDB(projectId);
        setSavedProjects((prev) => prev.filter((p) => p.id !== projectId));

        // Update storage info
        const info = await getStorageInfo();
        setStorageInfo(info);
      } catch (error) {
        console.error("Delete failed:", error);
        alert("삭제 실패: " + (error as Error).message);
      }
    },
    [setSavedProjects],
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

      const overwrite = window.confirm(
        "기존 프로젝트를 모두 삭제하고 가져오시겠습니까?\n\n[확인] 기존 삭제 후 가져오기\n[취소] 기존 유지하며 추가 (중복 ID는 건너뜀)",
      );

      try {
        const result = await importProjectsFromJSON(file, overwrite);

        // Refresh project list
        const projects = await getAllProjects();
        setSavedProjects(projects);

        // Update storage info
        const info = await getStorageInfo();
        setStorageInfo(info);

        alert(`가져오기 완료!\n- 추가됨: ${result.imported}개\n- 건너뜀: ${result.skipped}개`);
      } catch (error) {
        console.error("Import failed:", error);
        alert("가져오기 실패: " + (error as Error).message);
      }

      // Reset input
      e.target.value = "";
    },
    [setSavedProjects],
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
      <div className="flex items-center gap-2 px-4 py-2 bg-surface-primary border-b border-border-default flex-shrink-0 shadow-sm">
        <input
          type="file"
          accept="image/*"
          onChange={handleImageUpload}
          className="text-sm file:mr-2 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-accent-primary file:text-white hover:file:bg-accent-primary-hover file:cursor-pointer file:transition-colors cursor-pointer"
        />

        <Tooltip
          content={
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">시트 가져오기</span>
              <span className="text-text-tertiary text-[10px]">
                스프라이트 시트에서 프레임 자동 추출
              </span>
            </div>
          }
        >
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
            시트 가져오기
          </button>
        </Tooltip>

        <div className="h-6 w-px bg-border-default" />

        {/* Tool mode buttons */}
        <div className="flex gap-1 bg-surface-secondary rounded-lg p-1">
          <Tooltip
            content={
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">펜</span>
                <span className="text-text-tertiary text-[10px]">
                  클릭으로 폴리곤 점 추가 | 3점 이상 완성 가능
                </span>
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
              펜
            </button>
          </Tooltip>
          <Tooltip
            content={
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">선택</span>
                <span className="text-text-tertiary text-[10px]">
                  프레임/점 선택 및 이동 | Delete로 삭제
                </span>
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
              선택
            </button>
          </Tooltip>
          <Tooltip
            content={
              <div className="flex flex-col gap-0.5">
                <span className="font-medium">손</span>
                <span className="text-text-tertiary text-[10px]">
                  드래그로 캔버스 이동 | Space 임시 전환
                </span>
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
              손
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
              Undo
            </button>
            <button
              onClick={cancelCurrentPolygon}
              className="px-3 py-1.5 bg-accent-danger hover:bg-accent-danger-hover text-white rounded-lg text-sm transition-colors"
            >
              취소
            </button>
            {currentPoints.length >= 3 && (
              <button
                onClick={completeFrame}
                className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm transition-colors"
              >
                완성
              </button>
            )}
            <span className="text-text-secondary text-sm">점: {currentPoints.length}개</span>
          </>
        )}

        {toolMode === "select" && selectedFrameId !== null && (
          <span className="text-accent-primary text-sm">
            프레임 {frames.findIndex((f) => f.id === selectedFrameId) + 1} 선택됨
            {selectedPointIndex !== null && ` (점 ${selectedPointIndex + 1})`}
          </span>
        )}

        <div className="flex-1" />

        {/* Project management buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              if (frames.length > 0 || imageSrc) {
                if (window.confirm("현재 작업이 삭제됩니다. 새 프로젝트를 시작하시겠습니까?")) {
                  newProject();
                }
              } else {
                newProject();
              }
            }}
            className="px-3 py-1.5 bg-interactive-default hover:bg-interactive-hover rounded-lg text-xs transition-colors"
            title="새 프로젝트 시작"
          >
            새로만들기
          </button>
          <div className="h-4 w-px bg-border-default" />
          <input
            type="text"
            placeholder="프로젝트명"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-28 px-2 py-1.5 bg-surface-secondary border border-border-default rounded-lg text-xs focus:outline-none focus:border-accent-primary focus:ring-1 focus:ring-accent-primary/20 transition-colors"
          />
          <button
            onClick={saveProject}
            disabled={frames.length === 0 || !frames.some((f) => f.imageData)}
            className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:cursor-not-allowed text-white rounded-lg text-xs transition-colors"
            title={currentProjectId ? "현재 프로젝트에 덮어쓰기" : "새 프로젝트로 저장"}
          >
            저장
          </button>
          <button
            onClick={saveProjectAs}
            disabled={frames.length === 0 || !frames.some((f) => f.imageData)}
            className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:cursor-not-allowed text-text-primary border border-border-default rounded-lg text-xs transition-colors"
            title="새 이름으로 저장"
          >
            다른이름
          </button>
          <button
            onClick={() => setIsProjectListOpen(true)}
            className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-text-primary border border-border-default rounded-lg text-xs relative transition-colors"
            title="저장된 프로젝트 목록"
          >
            불러오기
            {savedProjects.length > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-danger rounded-full text-[10px] flex items-center justify-center text-white">
                {savedProjects.length}
              </span>
            )}
          </button>
        </div>

        <div className="h-6 w-px bg-border-default" />

        <span className="text-text-tertiary text-xs">
          {toolMode === "pen"
            ? "클릭: 점 추가 | 첫점: 완성"
            : toolMode === "select"
              ? "클릭: 선택 | 드래그: 이동"
              : "드래그: 화면 이동"}{" "}
          | Space/Alt: 화면이동 | 휠: 줌 ({Math.round(zoom * 100)}%)
        </span>

        <div className="h-6 w-px bg-border-default" />

        <ThemeToggle />
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
                <h2 className="text-lg font-semibold text-text-primary">저장된 프로젝트</h2>
                {storageInfo.quota > 0 && (
                  <div className="text-xs text-text-tertiary flex items-center gap-2 mt-1">
                    <span>
                      저장소: {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.quota)}
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
                  title="모든 프로젝트를 JSON 파일로 내보내기"
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
                  내보내기
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
                  가져오기
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
                  저장된 프로젝트가 없습니다
                </div>
              ) : (
                <div className="space-y-2">
                  {savedProjects.map((project) => (
                    <div
                      key={project.id}
                      className="flex items-center gap-3 p-3 bg-surface-secondary rounded-lg hover:bg-interactive-hover group transition-colors"
                    >
                      {/* Thumbnail */}
                      <div className="w-16 h-16 bg-surface-tertiary rounded-lg flex-shrink-0 overflow-hidden">
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
                          {project.frames.length}프레임 · {project.fps}fps
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
                          로드
                        </button>
                        <button
                          onClick={() => deleteProject(project.id)}
                          className="px-2 py-1.5 bg-accent-danger hover:bg-accent-danger-hover text-white rounded-lg text-sm transition-colors"
                        >
                          삭제
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
