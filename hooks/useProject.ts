import { useCallback, useEffect } from "react";
import { Point, Size, SpriteFrame, SavedProject, TimelineMode } from "../types";

const STORAGE_KEY = "sprite-editor-projects";

interface UseProjectOptions {
  // Current state
  imageSrc: string | null;
  imageSize: Size;
  frames: SpriteFrame[];
  nextFrameId: number;
  fps: number;
  zoom: number;
  pan: Point;
  scale: number;
  canvasHeight: number;
  isCanvasCollapsed: boolean;
  isPreviewWindowOpen: boolean;
  currentFrameIndex: number;
  timelineMode: TimelineMode;
  projectName: string;
  savedProjects: SavedProject[];
  currentProjectId: string | null;

  // Setters
  setImageSrc: (src: string | null) => void;
  setImageSize: (size: Size) => void;
  setFrames: React.Dispatch<React.SetStateAction<SpriteFrame[]>>;
  setNextFrameId: React.Dispatch<React.SetStateAction<number>>;
  setFps: (fps: number) => void;
  setZoom: React.Dispatch<React.SetStateAction<number>>;
  setPan: React.Dispatch<React.SetStateAction<Point>>;
  setScale: (scale: number) => void;
  setCanvasHeight: React.Dispatch<React.SetStateAction<number>>;
  setIsCanvasCollapsed: (collapsed: boolean) => void;
  setIsPreviewWindowOpen: (open: boolean) => void;
  setCurrentFrameIndex: React.Dispatch<React.SetStateAction<number>>;
  setTimelineMode: (mode: TimelineMode) => void;
  setProjectName: (name: string) => void;
  setSavedProjects: React.Dispatch<React.SetStateAction<SavedProject[]>>;
  setCurrentProjectId: (id: string | null) => void;
  setCurrentPoints: React.Dispatch<React.SetStateAction<Point[]>>;
  setSelectedFrameId: (id: number | null) => void;
  setSelectedPointIndex: (index: number | null) => void;
  setIsProjectListOpen: (open: boolean) => void;
  imageRef: React.RefObject<HTMLImageElement | null>;
}

interface UseProjectReturn {
  // State
  projectName: string;
  savedProjects: SavedProject[];
  currentProjectId: string | null;
  canSave: boolean;
  isExistingProject: boolean;

  // Actions
  saveProject: () => void;
  saveProjectAs: () => void;
  loadProject: (project: SavedProject) => void;
  deleteProject: (projectId: string) => void;
  setProjectName: (name: string) => void;
  newProject: () => void;
}

/**
 * 프로젝트 저장/로드 관리 훅
 */
export function useProject({
  imageSrc,
  imageSize,
  frames,
  nextFrameId,
  fps,
  zoom,
  pan,
  scale,
  canvasHeight,
  isCanvasCollapsed,
  isPreviewWindowOpen,
  currentFrameIndex,
  timelineMode,
  projectName,
  savedProjects,
  currentProjectId,
  setImageSrc,
  setImageSize,
  setFrames,
  setNextFrameId,
  setFps,
  setZoom,
  setPan,
  setScale,
  setCanvasHeight,
  setIsCanvasCollapsed,
  setIsPreviewWindowOpen,
  setCurrentFrameIndex,
  setTimelineMode,
  setProjectName,
  setSavedProjects,
  setCurrentProjectId,
  setCurrentPoints,
  setSelectedFrameId,
  setSelectedPointIndex,
  setIsProjectListOpen,
  imageRef,
}: UseProjectOptions): UseProjectReturn {
  const canSave = imageSrc !== null && frames.length > 0;
  const isExistingProject = currentProjectId !== null;

  // localStorage에서 프로젝트 목록 로드
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        setSavedProjects(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to load saved projects:", e);
      }
    }
  }, [setSavedProjects]);

  /**
   * 프로젝트 저장 (기존 프로젝트가 있으면 덮어쓰기, 없으면 새로 저장)
   */
  const saveProject = useCallback(() => {
    if (!imageSrc || frames.length === 0) {
      alert("저장할 프레임이 없습니다.");
      return;
    }

    const name = projectName.trim() || `Project ${new Date().toLocaleString()}`;

    // 기존 프로젝트가 있으면 덮어쓰기
    if (currentProjectId) {
      const updatedProject: SavedProject = {
        id: currentProjectId,
        name,
        imageSrc,
        imageSize,
        frames,
        nextFrameId,
        fps,
        savedAt: Date.now(),
        viewState: {
          zoom,
          pan,
          scale,
          canvasHeight,
          isCanvasCollapsed,
          isPreviewWindowOpen,
          currentFrameIndex,
          timelineMode,
        },
      };

      const updated = savedProjects.map((p) => (p.id === currentProjectId ? updatedProject : p));
      setSavedProjects(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      alert(`"${name}" 저장됨`);
    } else {
      // 새 프로젝트로 저장
      const newId = Date.now().toString();
      const newProject: SavedProject = {
        id: newId,
        name,
        imageSrc,
        imageSize,
        frames,
        nextFrameId,
        fps,
        savedAt: Date.now(),
        viewState: {
          zoom,
          pan,
          scale,
          canvasHeight,
          isCanvasCollapsed,
          isPreviewWindowOpen,
          currentFrameIndex,
          timelineMode,
        },
      };

      const updated = [...savedProjects, newProject];
      setSavedProjects(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setCurrentProjectId(newId);
      alert(`"${name}" 저장됨`);
    }
  }, [
    imageSrc,
    imageSize,
    frames,
    nextFrameId,
    fps,
    zoom,
    pan,
    scale,
    canvasHeight,
    isCanvasCollapsed,
    isPreviewWindowOpen,
    currentFrameIndex,
    timelineMode,
    projectName,
    savedProjects,
    currentProjectId,
    setSavedProjects,
    setCurrentProjectId,
  ]);

  /**
   * 다른 이름으로 저장 (항상 새 프로젝트로 저장)
   */
  const saveProjectAs = useCallback(() => {
    if (!imageSrc || frames.length === 0) {
      alert("저장할 프레임이 없습니다.");
      return;
    }

    const inputName = prompt("프로젝트 이름을 입력하세요:", projectName || "");
    if (inputName === null) return; // 취소됨

    const name = inputName.trim() || `Project ${new Date().toLocaleString()}`;
    const newId = Date.now().toString();

    const newProject: SavedProject = {
      id: newId,
      name,
      imageSrc,
      imageSize,
      frames,
      nextFrameId,
      fps,
      savedAt: Date.now(),
      viewState: {
        zoom,
        pan,
        scale,
        canvasHeight,
        isCanvasCollapsed,
        isPreviewWindowOpen,
        currentFrameIndex,
        timelineMode,
      },
    };

    const updated = [...savedProjects, newProject];
    setSavedProjects(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    setCurrentProjectId(newId);
    setProjectName(name);
    alert(`"${name}" 저장됨`);
  }, [
    imageSrc,
    imageSize,
    frames,
    nextFrameId,
    fps,
    zoom,
    pan,
    scale,
    canvasHeight,
    isCanvasCollapsed,
    isPreviewWindowOpen,
    currentFrameIndex,
    timelineMode,
    projectName,
    savedProjects,
    setSavedProjects,
    setCurrentProjectId,
    setProjectName,
  ]);

  /**
   * 프로젝트 로드
   */
  const loadProject = useCallback(
    (project: SavedProject) => {
      setImageSrc(project.imageSrc);
      setImageSize(project.imageSize);
      setFrames(project.frames);
      setNextFrameId(project.nextFrameId);
      setFps(project.fps);
      setProjectName(project.name);
      setCurrentProjectId(project.id); // 현재 프로젝트 ID 설정
      setCurrentPoints([]);
      setSelectedFrameId(null);
      setSelectedPointIndex(null);

      // 뷰 상태 복원
      if (project.viewState) {
        setZoom(project.viewState.zoom);
        setPan(project.viewState.pan);
        setScale(project.viewState.scale);
        setCanvasHeight(project.viewState.canvasHeight);
        setIsCanvasCollapsed(project.viewState.isCanvasCollapsed);
        setIsPreviewWindowOpen(project.viewState.isPreviewWindowOpen);
        setCurrentFrameIndex(project.viewState.currentFrameIndex);
        setTimelineMode(project.viewState.timelineMode);
      } else {
        // 이전 버전 호환 (viewState 없는 경우)
        setZoom(1);
        setPan({ x: 0, y: 0 });
      }

      // 이미지 ref 업데이트
      const img = new Image();
      img.onload = () => {
        if (imageRef.current !== undefined) {
          imageRef.current = img;
        }
        // viewState가 없으면 기본 스케일 계산
        if (!project.viewState) {
          const maxWidth = 900;
          const newScale = Math.min(maxWidth / img.width, 1);
          setScale(newScale);
        }
      };
      img.src = project.imageSrc;

      setIsProjectListOpen(false);
    },
    [
      setImageSrc,
      setImageSize,
      setFrames,
      setNextFrameId,
      setFps,
      setProjectName,
      setCurrentProjectId,
      setCurrentPoints,
      setSelectedFrameId,
      setSelectedPointIndex,
      setZoom,
      setPan,
      setScale,
      setCanvasHeight,
      setIsCanvasCollapsed,
      setIsPreviewWindowOpen,
      setCurrentFrameIndex,
      setTimelineMode,
      setIsProjectListOpen,
      imageRef,
    ],
  );

  /**
   * 프로젝트 삭제
   */
  const deleteProject = useCallback(
    (projectId: string) => {
      if (!confirm("정말 삭제하시겠습니까?")) return;

      const updated = savedProjects.filter((p) => p.id !== projectId);
      setSavedProjects(updated);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    },
    [savedProjects, setSavedProjects],
  );

  /**
   * 새 프로젝트
   */
  const newProject = useCallback(() => {
    setImageSrc(null);
    setImageSize({ width: 0, height: 0 });
    setFrames([]);
    setNextFrameId(1);
    setCurrentPoints([]);
    setSelectedFrameId(null);
    setSelectedPointIndex(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setProjectName("");
  }, [
    setImageSrc,
    setImageSize,
    setFrames,
    setNextFrameId,
    setCurrentPoints,
    setSelectedFrameId,
    setSelectedPointIndex,
    setZoom,
    setPan,
    setProjectName,
  ]);

  return {
    // State
    projectName,
    savedProjects,
    currentProjectId,
    canSave,
    isExistingProject,

    // Actions
    saveProject,
    saveProjectAs,
    loadProject,
    deleteProject,
    setProjectName,
    newProject,
  };
}
