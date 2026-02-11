"use client";

import { useEffect, useCallback, useState, useRef, useMemo } from "react";
import {
  EditorProvider,
  useEditorImage,
  useEditorFramesMeta,
  useEditorTools,
  useEditorBrush,
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
  SpriteToolOptionsBar,
  useFrameBackgroundRemoval,
  useFrameInterpolation,
  useSpriteKeyboardShortcuts,
  FrameBackgroundRemovalModals,
  FrameInterpolationModals,
  SpriteExportModal,
  useSpriteExport,
} from "@/domains/sprite";
import type { SavedSpriteProject, SpriteTrack } from "@/domains/sprite";
import { useSpriteTrackStore, useSpriteViewportStore } from "@/domains/sprite/stores";
import { migrateFramesToTracks } from "@/domains/sprite/utils/migration";
import type { RifeInterpolationQuality } from "@/shared/utils/rifeInterpolation";
import type { BackgroundRemovalQuality } from "@/shared/ai/backgroundRemoval";
import SpriteMenuBar from "@/domains/sprite/components/SpriteMenuBar";
import VideoImportModal from "@/domains/sprite/components/VideoImportModal";
import SpriteProjectListModal from "@/domains/sprite/components/SpriteProjectListModal";
import type { SpriteSaveLoadProgress } from "@/shared/lib/firebase/firebaseSpriteStorage";
import { useLanguage, useAuth } from "@/shared/contexts";
import {
  HeaderContent,
  SaveToast,
  LoadingOverlay,
  PanLockFloatingButton,
  confirmDialog,
  showErrorToast,
  showInfoToast,
} from "@/shared/components";
import { SyncDialog } from "@/shared/components/app/auth";
import {
  getSpriteStorageProvider,
  hasLocalProjects,
  checkCloudProjects,
  uploadLocalProjectsToCloud,
  clearLocalProjects,
  clearCloudProjects,
} from "@/domains/sprite/services/projectStorage";
import {
  downloadCompositedFramesAsZip,
  downloadCompositedSpriteSheet,
  downloadOptimizedSpriteZip,
  type SpriteExportFrameSize,
} from "@/domains/sprite/utils/export";

const MAX_RESAMPLE_DIMENSION = 16384;
const RESAMPLE_SIZE_PATTERN = /^(\d+)\s*[x×]\s*(\d+)$/;
const RESAMPLE_PERCENT_PATTERN = /^(\d+(?:\.\d+)?)\s*%$/;

function clampResampleDimension(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(MAX_RESAMPLE_DIMENSION, Math.round(value)));
}

function parseResampleInput(
  input: string,
  sourceSize: SpriteExportFrameSize,
): SpriteExportFrameSize {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) {
    throw new Error("형식을 입력하세요. 예: 512x512 또는 50%");
  }

  const percentMatch = trimmed.match(RESAMPLE_PERCENT_PATTERN);
  if (percentMatch) {
    const percent = Number.parseFloat(percentMatch[1]);
    if (!Number.isFinite(percent) || percent <= 0) {
      throw new Error("퍼센트는 0보다 큰 숫자여야 합니다.");
    }
    return {
      width: clampResampleDimension((sourceSize.width * percent) / 100),
      height: clampResampleDimension((sourceSize.height * percent) / 100),
    };
  }

  const sizeMatch = trimmed.match(RESAMPLE_SIZE_PATTERN);
  if (sizeMatch) {
    const width = Number.parseInt(sizeMatch[1], 10);
    const height = Number.parseInt(sizeMatch[2], 10);
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      throw new Error("가로/세로 값은 1 이상의 숫자여야 합니다.");
    }
    if (width > MAX_RESAMPLE_DIMENSION || height > MAX_RESAMPLE_DIMENSION) {
      throw new Error(`최대 해상도는 ${MAX_RESAMPLE_DIMENSION}x${MAX_RESAMPLE_DIMENSION} 입니다.`);
    }
    return { width, height };
  }

  const widthOnly = Number.parseInt(trimmed, 10);
  if (Number.isFinite(widthOnly) && widthOnly > 0) {
    const ratio = sourceSize.height / sourceSize.width;
    const width = clampResampleDimension(widthOnly);
    return {
      width,
      height: clampResampleDimension(width * ratio),
    };
  }

  throw new Error("형식은 512x512 또는 50% 입니다.");
}

function loadImageFromSource(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to load image."));
    image.src = src;
  });
}

async function resampleImageDataByScale(
  imageData: string,
  scaleX: number,
  scaleY: number,
): Promise<{ dataUrl: string; width: number; height: number }> {
  const image = await loadImageFromSource(imageData);
  const width = clampResampleDimension(image.width * scaleX);
  const height = clampResampleDimension(image.height * scaleY);

  if (width === image.width && height === image.height) {
    return { dataUrl: imageData, width, height };
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Failed to get 2d context for resampling.");
  }

  const isDownscale = width < image.width || height < image.height;
  ctx.imageSmoothingEnabled = isDownscale;
  ctx.imageSmoothingQuality = isDownscale ? "high" : "low";
  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(image, 0, 0, width, height);

  return {
    dataUrl: canvas.toDataURL("image/png"),
    width,
    height,
  };
}

async function estimateCanvasSizeFromTracks(
  tracks: SpriteTrack[],
): Promise<SpriteExportFrameSize | null> {
  const frames = tracks.flatMap((track) => track.frames).filter((frame) => Boolean(frame.imageData));
  if (frames.length === 0) return null;

  const sizeCache = new Map<string, Promise<{ width: number; height: number } | null>>();
  const getImageSize = (dataUrl: string) => {
    const cached = sizeCache.get(dataUrl);
    if (cached) return cached;

    const promise = loadImageFromSource(dataUrl)
      .then((image) => ({ width: image.width, height: image.height }))
      .catch(() => null);
    sizeCache.set(dataUrl, promise);
    return promise;
  };

  let maxRight = 0;
  let maxBottom = 0;

  await Promise.all(
    frames.map(async (frame) => {
      if (!frame.imageData) return;
      const size = await getImageSize(frame.imageData);
      if (!size) return;
      const ox = frame.offset?.x ?? 0;
      const oy = frame.offset?.y ?? 0;
      maxRight = Math.max(maxRight, ox + size.width);
      maxBottom = Math.max(maxBottom, oy + size.height);
    }),
  );

  if (maxRight <= 0 || maxBottom <= 0) return null;
  return {
    width: clampResampleDimension(maxRight),
    height: clampResampleDimension(maxBottom),
  };
}

// ============================================
// Main Editor Component
// ============================================

function SpriteEditorMain() {
  const { user } = useAuth();
  const { imageSrc, setImageSrc, imageSize, setImageSize, imageRef } = useEditorImage();
  const {
    frames,
    setFrames,
    nextFrameId,
    setNextFrameId,
    selectedFrameId,
    setSelectedFrameId,
    selectedFrameIds,
    setSelectedFrameIds,
    selectedPointIndex,
  } = useEditorFramesMeta();
  const {
    toolMode,
    setSpriteToolMode,
    setCurrentPoints,
    setIsSpacePressed,
    cropArea,
    setCropArea,
    cropAspectRatio,
    setCropAspectRatio,
    lockCropAspect,
    setLockCropAspect,
    canvasExpandMode,
    setCanvasExpandMode,
    magicWandTolerance,
    setMagicWandTolerance,
    magicWandFeather,
    setMagicWandFeather,
    magicWandSelectionMode,
    setMagicWandSelectionMode,
    isPanLocked,
    setIsPanLocked,
  } = useEditorTools();
  const {
    brushColor,
    setBrushColor,
    brushSize,
    setBrushSize,
    brushHardness,
    setBrushHardness,
    activePreset,
    setActivePreset,
    presets,
    pressureEnabled,
    setPressureEnabled,
  } = useEditorBrush();
  const { setScale, setZoom, setPan } = useEditorViewport();
  const { fps } = useEditorAnimation();
  const animPreviewZoom = useSpriteViewportStore((s) => s.animPreviewZoom);
  const animPreviewVpApi = useSpriteViewportStore((s) => s._animPreviewVpApi);
  const { undo, redo, canUndo, canRedo, pushHistory } = useEditorHistory();
  const { projectName, setProjectName, savedProjects, setSavedSpriteProjects, currentProjectId, setCurrentProjectId, newProject, isAutosaveLoading } = useEditorProject();
  const {
    isProjectListOpen,
    setIsProjectListOpen,
    isSpriteSheetImportOpen,
    setIsSpriteSheetImportOpen,
    isVideoImportOpen,
    setIsVideoImportOpen,
    pendingVideoFile,
    setPendingVideoFile,
    canvasSize,
    setCanvasSize,
  } = useEditorWindows();
  const { tracks, addTrack, restoreTracks } = useEditorTracks();
  const { copyFrame, pasteFrame } = useEditorClipboard();
  const { resetLayout, panelHeadersVisible, togglePanelHeaders } = useLayout();

  // Export
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [detectedSourceFrameSize, setDetectedSourceFrameSize] = useState<SpriteExportFrameSize | null>(null);
  const { isExporting, exportProgress, exportMp4, startProgress, endProgress } = useSpriteExport();

  // Panel visibility states
  const [isPreviewOpen, setIsPreviewOpen] = useState(true);

  // Save feedback state
  const [isSaving, setIsSaving] = useState(false);
  const [isResampling, setIsResampling] = useState(false);
  const [saveCount, setSaveCount] = useState(0);
  const [saveProgress, setSaveProgress] = useState<SpriteSaveLoadProgress | null>(null);
  const [isProjectLoading, setIsProjectLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState<SpriteSaveLoadProgress | null>(null);

  // Video import modal state is now in the UI store (pendingVideoFile, isVideoImportOpen)

  // Background removal state
  const [showBgRemovalConfirm, setShowBgRemovalConfirm] = useState(false);
  const [bgRemovalQuality, setBgRemovalQuality] = useState<BackgroundRemovalQuality>("balanced");
  const [showFrameInterpolationConfirm, setShowFrameInterpolationConfirm] = useState(false);
  const [interpolationSteps, setInterpolationSteps] = useState(1);
  const [interpolationQuality, setInterpolationQuality] = useState<RifeInterpolationQuality>("fast");

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
    quality: bgRemovalQuality,
    translations: {
      backgroundRemovalFailed: t.backgroundRemovalFailed,
      selectFrameForBgRemoval: t.selectFrameForBgRemoval,
      frameImageNotFound: t.frameImageNotFound,
      processingFrameProgress: t.processingFrameProgress,
    },
  });

  const {
    isInterpolating,
    interpolationProgress,
    interpolationStatus,
    interpolationPairCount,
    handleInterpolateFrames,
  } = useFrameInterpolation({
    frames,
    nextFrameId,
    selectedFrameIds,
    setFrames,
    setNextFrameId,
    setSelectedFrameId,
    setSelectedFrameIds,
    pushHistory,
    translations: {
      frameInterpolation: t.frameInterpolation,
      interpolationFailed: t.interpolationFailed,
      selectFramesForInterpolation: t.selectFramesForInterpolation,
      frameImageNotFound: t.frameImageNotFound,
      interpolationProgress: t.interpolationProgress,
    },
  });
  const [storageInfo, setStorageInfo] = useState({ used: 0, quota: 0, percentage: 0 });
  const [showSyncDialog, setShowSyncDialog] = useState(false);
  const [localProjectCount, setLocalProjectCount] = useState(0);
  const [cloudProjectCount, setCloudProjectCount] = useState(0);
  const saveInFlightRef = useRef(false);
  const currentProjectIdRef = useRef<string | null>(currentProjectId);

  useEffect(() => {
    currentProjectIdRef.current = currentProjectId;
  }, [currentProjectId]);

  // Load saved projects when storage provider changes (login/logout)
  useEffect(() => {
    const loadProjects = async () => {
      try {
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

  // Helper: get all frames across all tracks
  const allFrames = tracks.flatMap((t) => t.frames);
  const firstFrameImage = allFrames.find((f) => f.imageData)?.imageData;
  const hasRenderableFrames = tracks.length > 0 && allFrames.some((f) => f.imageData);

  useEffect(() => {
    if (imageSize.width > 0 && imageSize.height > 0) {
      setDetectedSourceFrameSize({
        width: Math.floor(imageSize.width),
        height: Math.floor(imageSize.height),
      });
      return;
    }

    if (!firstFrameImage) {
      setDetectedSourceFrameSize(null);
      return;
    }

    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      if (img.width <= 0 || img.height <= 0) {
        setDetectedSourceFrameSize(null);
        return;
      }
      setDetectedSourceFrameSize({
        width: Math.floor(img.width),
        height: Math.floor(img.height),
      });
    };
    img.onerror = () => {
      if (!cancelled) setDetectedSourceFrameSize(null);
    };
    img.src = firstFrameImage;

    return () => {
      cancelled = true;
    };
  }, [imageSize.width, imageSize.height, firstFrameImage]);

  const cropBaseSize = useMemo(() => {
    if (canvasSize) return canvasSize;
    if (detectedSourceFrameSize) return detectedSourceFrameSize;
    if (imageSize.width > 0 && imageSize.height > 0) {
      return {
        width: Math.floor(imageSize.width),
        height: Math.floor(imageSize.height),
      };
    }
    return null;
  }, [canvasSize, detectedSourceFrameSize, imageSize.width, imageSize.height]);

  const handleSelectAllCrop = useCallback(() => {
    if (!cropBaseSize) return;
    setCropArea({
      x: 0,
      y: 0,
      width: cropBaseSize.width,
      height: cropBaseSize.height,
    });
  }, [cropBaseSize, setCropArea]);

  const handleClearCrop = useCallback(() => {
    setCropArea(null);
    setCanvasExpandMode(false);
  }, [setCropArea, setCanvasExpandMode]);

  const handleCropWidthChange = useCallback((newWidth: number) => {
    if (!cropArea) return;
    const width = Math.max(10, Math.round(newWidth));
    if (lockCropAspect && cropArea.width > 0) {
      const ratio = cropArea.height / cropArea.width;
      setCropArea({
        ...cropArea,
        width,
        height: Math.max(10, Math.round(width * ratio)),
      });
      return;
    }
    setCropArea({ ...cropArea, width });
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleCropHeightChange = useCallback((newHeight: number) => {
    if (!cropArea) return;
    const height = Math.max(10, Math.round(newHeight));
    if (lockCropAspect && cropArea.height > 0) {
      const ratio = cropArea.width / cropArea.height;
      setCropArea({
        ...cropArea,
        height,
        width: Math.max(10, Math.round(height * ratio)),
      });
      return;
    }
    setCropArea({ ...cropArea, height });
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleExpandToSquare = useCallback(() => {
    if (!cropArea) return;
    const maxSide = Math.max(cropArea.width, cropArea.height);
    setCropArea({
      ...cropArea,
      width: Math.round(maxSide),
      height: Math.round(maxSide),
    });
  }, [cropArea, setCropArea]);

  const handleFitToSquare = useCallback(() => {
    if (!cropArea) return;
    const minSide = Math.min(cropArea.width, cropArea.height);
    setCropArea({
      ...cropArea,
      width: Math.round(minSide),
      height: Math.round(minSide),
    });
  }, [cropArea, setCropArea]);

  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;
    const width = Math.max(1, Math.round(cropArea.width));
    const height = Math.max(1, Math.round(cropArea.height));
    if (width < 2 || height < 2) return;

    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    pushHistory();
    useSpriteTrackStore.setState((state) => ({
      tracks: state.tracks.map((track) => ({
        ...track,
        frames: track.frames.map((frame) => ({
          ...frame,
          offset: {
            x: (frame.offset?.x ?? 0) - offsetX,
            y: (frame.offset?.y ?? 0) - offsetY,
          },
        })),
      })),
      isPlaying: false,
    }));

    setCanvasSize({ width, height });
    setCropArea(null);
    setCanvasExpandMode(false);
  }, [cropArea, pushHistory, setCropArea, setCanvasExpandMode, setCanvasSize]);

  useEffect(() => {
    if (toolMode !== "crop") return;
    if (cropArea) return;
    if (!cropBaseSize) return;

    setCropArea({
      x: 0,
      y: 0,
      width: cropBaseSize.width,
      height: cropBaseSize.height,
    });
  }, [toolMode, cropArea, cropBaseSize, setCropArea]);

  const handleResampleAllResolution = useCallback(async () => {
    if (isResampling) return;

    const sourceTracks = useSpriteTrackStore.getState().tracks;
    const hasImageFrames = sourceTracks.some((track) =>
      track.frames.some((frame) => Boolean(frame.imageData)),
    );
    if (!hasImageFrames) {
      showInfoToast(t.noFramesToSave || "No frames to resample.");
      return;
    }

    const estimatedCanvasSize = await estimateCanvasSizeFromTracks(sourceTracks);
    const currentCanvasSize = canvasSize
      ? {
          width: clampResampleDimension(canvasSize.width),
          height: clampResampleDimension(canvasSize.height),
        }
      : estimatedCanvasSize ?? (
        imageSize.width > 0 && imageSize.height > 0
          ? {
              width: clampResampleDimension(imageSize.width),
              height: clampResampleDimension(imageSize.height),
            }
          : null
      );

    if (!currentCanvasSize) {
      showInfoToast("리샘플 기준 해상도를 찾지 못했습니다.");
      return;
    }

    const defaultInput = `${currentCanvasSize.width}x${currentCanvasSize.height}`;
    const input = window.prompt(
      "전체 해상도 리샘플: 새 크기를 입력하세요 (예: 512x512 또는 50%)",
      defaultInput,
    );
    if (input === null) return;

    setIsResampling(true);
    try {
      const nextCanvasSize = parseResampleInput(input, currentCanvasSize);
      if (
        nextCanvasSize.width === currentCanvasSize.width
        && nextCanvasSize.height === currentCanvasSize.height
      ) {
        return;
      }

      const currentAspect = currentCanvasSize.width / currentCanvasSize.height;
      const nextAspect = nextCanvasSize.width / nextCanvasSize.height;
      if (Math.abs(currentAspect - nextAspect) > 0.0001) {
        const keepGoing = await confirmDialog({
          title: "비율 확인",
          message: "비율이 달라 프레임이 왜곡될 수 있습니다. 계속 진행할까요?",
          confirmLabel: "계속",
          cancelLabel: "취소",
        });
        if (!keepGoing) return;
      }

      const scaleX = nextCanvasSize.width / currentCanvasSize.width;
      const scaleY = nextCanvasSize.height / currentCanvasSize.height;

      const frameResampleCache = new Map<string, Promise<string>>();
      const resampleFrameImage = (frameImageData: string): Promise<string> => {
        const cached = frameResampleCache.get(frameImageData);
        if (cached) return cached;

        const promise = resampleImageDataByScale(frameImageData, scaleX, scaleY)
          .then((result) => result.dataUrl)
          .catch((error) => {
            console.error("Failed to resample frame image:", error);
            return frameImageData;
          });
        frameResampleCache.set(frameImageData, promise);
        return promise;
      };

      const resampledTracks: SpriteTrack[] = await Promise.all(
        sourceTracks.map(async (track) => ({
          ...track,
          frames: await Promise.all(
            track.frames.map(async (frame) => {
              const nextImageData = frame.imageData
                ? await resampleFrameImage(frame.imageData)
                : frame.imageData;

              return {
                ...frame,
                imageData: nextImageData,
                points: frame.points.map((point) => ({
                  x: Math.round(point.x * scaleX),
                  y: Math.round(point.y * scaleY),
                })),
                offset: {
                  x: Math.round((frame.offset?.x ?? 0) * scaleX),
                  y: Math.round((frame.offset?.y ?? 0) * scaleY),
                },
              };
            }),
          ),
        })),
      );

      let nextImageSrc = imageSrc;
      let nextImageSize = { ...imageSize };

      if (imageSrc) {
        try {
          const resampledSource = await resampleImageDataByScale(imageSrc, scaleX, scaleY);
          nextImageSrc = resampledSource.dataUrl;
          nextImageSize = {
            width: resampledSource.width,
            height: resampledSource.height,
          };
        } catch (error) {
          console.error("Failed to resample source image:", error);
        }
      } else if (imageSize.width > 0 && imageSize.height > 0) {
        nextImageSize = {
          width: clampResampleDimension(imageSize.width * scaleX),
          height: clampResampleDimension(imageSize.height * scaleY),
        };
      }

      pushHistory();
      useSpriteTrackStore.setState((state) => ({
        tracks: resampledTracks,
        imageSrc: nextImageSrc,
        imageSize: nextImageSize,
        currentPoints: state.currentPoints.map((point) => ({
          x: Math.round(point.x * scaleX),
          y: Math.round(point.y * scaleY),
        })),
        isPlaying: false,
      }));

      if (nextImageSrc) {
        const img = new Image();
        img.onload = () => {
          imageRef.current = img;
        };
        img.src = nextImageSrc;
      } else {
        imageRef.current = null;
      }

      setCanvasSize(nextCanvasSize);
      setCropArea(null);
      setCanvasExpandMode(false);
    } catch (error) {
      console.error("Failed to resample sprite project:", error);
      showErrorToast((error as Error).message || "전체 해상도 리샘플에 실패했습니다.");
    } finally {
      setIsResampling(false);
    }
  }, [
    canvasSize,
    imageRef,
    imageSize,
    imageSrc,
    isResampling,
    pushHistory,
    setCanvasExpandMode,
    setCropArea,
    setCanvasSize,
    t.noFramesToSave,
  ]);

  // Unified export handler
  const handleExport = useCallback(async (settings: import("@/domains/sprite/components/SpriteExportModal").SpriteExportSettings) => {
    if (!hasRenderableFrames) return;
    const name = settings.fileName.trim() || projectName.trim() || "sprite-project";
    const resolvedFrameSize = settings.frameSize ?? undefined;
    try {
      switch (settings.exportType) {
        case "zip":
          await downloadCompositedFramesAsZip(tracks, name, {
            frameSize: resolvedFrameSize,
          });
          break;
        case "sprite-png":
          await downloadCompositedSpriteSheet(tracks, name, {
            frameSize: resolvedFrameSize,
            padding: settings.padding,
            backgroundColor: settings.bgTransparent ? undefined : settings.backgroundColor,
          });
          break;
        case "sprite-webp":
          await downloadCompositedSpriteSheet(tracks, name, {
            format: "webp",
            frameSize: resolvedFrameSize,
            padding: settings.padding,
            backgroundColor: settings.bgTransparent ? undefined : settings.backgroundColor,
            quality: settings.webpQuality,
          });
          break;
        case "mp4":
          await exportMp4(tracks, name, {
            fps: settings.mp4Fps,
            compression: settings.mp4Compression,
            backgroundColor: settings.mp4BackgroundColor,
            loopCount: settings.mp4LoopCount,
            frameSize: resolvedFrameSize,
          });
          break;
        case "optimized-zip":
          try {
            startProgress("Preparing...", 0);
            await downloadOptimizedSpriteZip(tracks, name, {
              threshold: settings.optimizedThreshold,
              target: settings.optimizedTarget,
              includeGuide: settings.optimizedIncludeGuide,
              imageFormat: settings.optimizedImageFormat,
              imageQuality: settings.optimizedWebpQuality,
              tileSize: settings.optimizedTileSize,
              fps,
              frameSize: resolvedFrameSize,
            }, (p) => {
              startProgress(p.stage, p.percent, p.detail);
            });
          } finally {
            endProgress();
          }
          break;
      }
      setIsExportModalOpen(false);
    } catch (error) {
      console.error("Export failed:", error);
      showErrorToast(`${t.exportFailed}: ${(error as Error).message}`);
    }
  }, [hasRenderableFrames, tracks, projectName, fps, t.exportFailed, exportMp4, startProgress, endProgress]);

  // Save project (overwrite if existing, create new if not)
  const saveProject = useCallback(async () => {
    if (tracks.length === 0 || !allFrames.some((f) => f.imageData)) {
      return;
    }
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;

    const name = projectName.trim() || `Project ${new Date().toLocaleString()}`;
    const saveImageSrc = imageSrc || firstFrameImage || "";
    const existingProjectId = currentProjectIdRef.current;
    const resolvedProjectId = existingProjectId || crypto.randomUUID();
    currentProjectIdRef.current = resolvedProjectId;
    const projectToSave: SavedSpriteProject = {
      id: resolvedProjectId,
      name,
      imageSrc: saveImageSrc,
      imageSize: imageSize,
      canvasSize: canvasSize ?? undefined,
      exportFrameSize: canvasSize ?? undefined,
      tracks,
      nextFrameId,
      fps,
      savedAt: Date.now(),
    };

    setIsSaving(true);
    setSaveProgress(null);
    try {
      await storageProvider.saveProject(projectToSave, setSaveProgress);
      setSavedSpriteProjects((prev: SavedSpriteProject[]) =>
        existingProjectId
          ? prev.map((p) => (p.id === resolvedProjectId ? projectToSave : p))
          : [projectToSave, ...prev],
      );
      setCurrentProjectId(resolvedProjectId);
      currentProjectIdRef.current = resolvedProjectId;

      const info = await storageProvider.getStorageInfo();
      setStorageInfo(info);
      setSaveCount((c) => c + 1);
    } catch (error) {
      console.error("Save failed:", error);
      showErrorToast(`${t.saveFailed}: ${(error as Error).message}`);
    } finally {
      saveInFlightRef.current = false;
      setIsSaving(false);
      setSaveProgress(null);
    }
  }, [
    t,
    imageSrc,
    imageSize,
    tracks,
    allFrames,
    firstFrameImage,
    projectName,
    canvasSize,
    nextFrameId,
    fps,
    storageProvider,
    setSavedSpriteProjects,
    setCurrentProjectId,
  ]);

  // Save project as new (always create new project)
  const saveProjectAs = useCallback(async () => {
    if (tracks.length === 0 || !allFrames.some((f) => f.imageData)) {
      return;
    }
    if (saveInFlightRef.current) return;
    saveInFlightRef.current = true;

    const inputName = prompt(t.enterProjectName, projectName || "");
    if (inputName === null) {
      saveInFlightRef.current = false;
      return;
    }

    const name = inputName.trim() || `Project ${new Date().toLocaleString()}`;
    const newId = crypto.randomUUID();
    const saveImageSrc = imageSrc || firstFrameImage || "";

    const newProj = {
      id: newId,
      name,
      imageSrc: saveImageSrc,
      imageSize: imageSize,
      canvasSize: canvasSize ?? undefined,
      exportFrameSize: canvasSize ?? undefined,
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
      currentProjectIdRef.current = newId;
      setProjectName(name);

      const info = await storageProvider.getStorageInfo();
      setStorageInfo(info);
      setSaveCount((c) => c + 1);
    } catch (error) {
      console.error("Save failed:", error);
      showErrorToast(`${t.saveFailed}: ${(error as Error).message}`);
    } finally {
      saveInFlightRef.current = false;
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
    canvasSize,
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
        setCanvasSize(project.canvasSize ?? project.exportFrameSize ?? null);

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
        showErrorToast((error as Error).message);
      } finally {
        setIsProjectLoading(false);
        setLoadProgress(null);
      }
    },
    [
      storageProvider,
      setImageSrc,
      setImageSize,
      setCanvasSize,
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
      const shouldDelete = await confirmDialog(t.deleteConfirm);
      if (!shouldDelete) return;

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
        showErrorToast(`${t.deleteFailed}: ${(error as Error).message}`);
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
    toolMode,
    applyCrop: handleApplyCrop,
    clearCrop: handleClearCrop,
  });

  useEffect(() => {
    if (toolMode === "pen") {
      setSpriteToolMode("select");
    }
  }, [toolMode, setSpriteToolMode]);

  // Handle new project with confirmation
  const handleNew = useCallback(async () => {
    if (frames.length > 0 || imageSrc) {
      const shouldCreate = await confirmDialog({
        title: t.new || "New Project",
        message: t.newProjectConfirm,
        confirmLabel: t.new || "New",
        cancelLabel: t.cancel || "Cancel",
      });
      if (!shouldCreate) return;
    }
    setCanvasSize(null);
    newProject();
  }, [frames.length, imageSrc, t.cancel, t.new, t.newProjectConfirm, newProject, setCanvasSize]);

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
        progress={saveProgress ? {
          current: saveProgress.current,
          total: Math.max(1, saveProgress.total),
          detail: saveProgress.itemName,
        } : null}
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
            onExport={() => setIsExportModalOpen(true)}
            onResampleAllResolution={() => void handleResampleAllResolution()}
            onImportImage={() => imageInputRef.current?.click()}
            onImportSheet={() => setIsSpriteSheetImportOpen(true)}
            onImportVideo={() => setIsVideoImportOpen(true)}
            onTogglePreview={() => setIsPreviewOpen(!isPreviewOpen)}
            onResetLayout={resetLayout}
            isPreviewOpen={isPreviewOpen}
            panelHeadersVisible={panelHeadersVisible}
            onTogglePanelHeaders={togglePanelHeaders}
            canSave={hasRenderableFrames && !isSaving && !isResampling}
            canExport={hasRenderableFrames && !isResampling}
            canResample={hasRenderableFrames && !isResampling}
            isLoading={isSaving || isResampling}
            onUndo={undo}
            onRedo={redo}
            canUndo={canUndo}
            canRedo={canRedo}
            translations={{
              file: t.file,
              edit: t.edit,
              view: t.view,
              window: t.window,
              new: t.new,
              load: t.load,
              save: t.save,
              saveAs: t.saveAs,
              export: t.export,
              resampleAllResolution: t.resampleAllResolution,
              importImage: t.importImage,
              importSheet: t.importSheet,
              importVideo: t.importVideo,
              undo: t.undo,
              redo: t.redo,
              preview: t.animation,
              resetLayout: t.resetLayout,
              panelHeaders: t.panelHeaders,
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
        magicWandSelectionMode={magicWandSelectionMode}
        setSpriteToolMode={setSpriteToolMode}
        isRemovingBackground={isRemovingBackground}
        isInterpolating={isInterpolating}
        hasFramesWithImage={frames.some((f) => Boolean(f.imageData))}
        hasInterpolatableSelection={interpolationPairCount > 0}
        canUndo={canUndo}
        canRedo={canRedo}
        onUndo={undo}
        onRedo={redo}
        onRequestAISelection={() => {
          setSpriteToolMode("magicwand");
          setMagicWandSelectionMode("ai");
        }}
        onRequestBackgroundRemoval={() => setShowBgRemovalConfirm(true)}
        onRequestFrameInterpolation={() => setShowFrameInterpolationConfirm(true)}
        zoom={animPreviewZoom || 1}
        setZoom={(z) => {
          if (!animPreviewVpApi) return;
          const next = typeof z === "function" ? z(animPreviewVpApi.getZoom()) : z;
          animPreviewVpApi.setZoom(next);
        }}
        onFitToScreen={() => {
          if (!animPreviewVpApi) return;
          animPreviewVpApi.fitToContainer();
        }}
      />

      <SpriteToolOptionsBar
        toolMode={toolMode}
        brushColor={brushColor}
        setBrushColor={setBrushColor}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        brushHardness={brushHardness}
        setBrushHardness={setBrushHardness}
        magicWandTolerance={magicWandTolerance}
        setMagicWandTolerance={setMagicWandTolerance}
        magicWandFeather={magicWandFeather}
        setMagicWandFeather={setMagicWandFeather}
        activePreset={activePreset}
        setActivePreset={setActivePreset}
        presets={presets}
        pressureEnabled={pressureEnabled}
        setPressureEnabled={setPressureEnabled}
        cropAspectRatio={cropAspectRatio}
        setCropAspectRatio={setCropAspectRatio}
        cropArea={cropArea}
        lockCropAspect={lockCropAspect}
        setLockCropAspect={setLockCropAspect}
        canvasExpandMode={canvasExpandMode}
        setCanvasExpandMode={setCanvasExpandMode}
        onSelectAllCrop={handleSelectAllCrop}
        onClearCrop={handleClearCrop}
        onCropWidthChange={handleCropWidthChange}
        onCropHeightChange={handleCropHeightChange}
        onExpandToSquare={handleExpandToSquare}
        onFitToSquare={handleFitToSquare}
        onApplyCrop={handleApplyCrop}
        selectedFrameId={selectedFrameId}
        selectedPointIndex={selectedPointIndex}
        frames={frames}
        labels={{
          size: t.size,
          hardness: t.hardness,
          tolerance: t.tolerance,
          feather: t.feather,
          colorPickerTip: t.colorPickerTip,
          brush: t.brush,
          eraser: t.eraser,
          magicWand: t.magicWand,
          eyedropper: t.eyedropper,
          zoomInOut: t.zoomInOut,
          frame: t.frame,
          selected: t.selected,
          point: t.point,
          presets: t.presets,
          pressure: t.pressure,
          builtIn: t.builtIn,
          zoomToolTip: t.zoomToolTip,
          cropToolTip: t.cropToolTip,
          magicWandToolTip: t.magicWandToolTip,
        }}
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

      {/* Export Modal */}
      <SpriteExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExport}
        defaultFileName={projectName.trim() || "sprite-project"}
        currentFps={fps}
        defaultFrameSize={canvasSize}
        sourceFrameSize={detectedSourceFrameSize}
        isExporting={isExporting}
        exportProgress={exportProgress}
        translations={{
          export: t.export,
          cancel: t.cancel,
          exportType: t.exportType,
          exportTypeZip: t.exportTypeZip,
          exportTypeSpriteSheetPng: t.exportTypeSpriteSheetPng,
          exportTypeSpriteSheetWebp: t.exportTypeSpriteSheetWebp,
          exportTypeMp4: t.exportTypeMp4,
          exportFileName: t.exportFileName,
          exportCanvasSize: t.exportCanvasSize,
          exportUseSourceSize: t.exportUseSourceSize,
          exportWidth: t.exportWidth,
          exportHeight: t.exportHeight,
          exportKeepAspectRatio: t.exportKeepAspectRatio,
          exportCanvasSizeLimit: t.exportCanvasSizeLimit,
          exportPadding: t.exportPadding,
          backgroundColor: t.backgroundColor,
          exportBgTransparent: t.exportBgTransparent,
          quality: t.quality,
          compression: t.compression,
          compressionHighQuality: t.compressionHighQuality,
          compressionBalanced: t.compressionBalanced,
          compressionSmallFile: t.compressionSmallFile,
          exportLoopCount: t.exportLoopCount,
          exporting: t.exporting,
          exportTypeOptimizedZip: t.exportTypeOptimizedZip,
          exportOptimizedTarget: t.exportOptimizedTarget,
          exportOptimizedThreshold: t.exportOptimizedThreshold,
          exportOptimizedThresholdHint: t.exportOptimizedThresholdHint,
          exportOptimizedIncludeGuide: t.exportOptimizedIncludeGuide,
          exportOptimizedImageFormat: t.exportOptimizedImageFormat,
          exportOptimizedFormatPng: t.exportOptimizedFormatPng,
          exportOptimizedFormatWebp: t.exportOptimizedFormatWebp,
          exportOptimizedTileSize: t.exportOptimizedTileSize,
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
        quality={bgRemovalQuality}
        onQualityChange={setBgRemovalQuality}
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

      <FrameInterpolationModals
        showConfirm={showFrameInterpolationConfirm}
        onCloseConfirm={() => setShowFrameInterpolationConfirm(false)}
        onConfirm={async () => {
          setShowFrameInterpolationConfirm(false);
          await handleInterpolateFrames({
            steps: interpolationSteps,
            quality: interpolationQuality,
          });
        }}
        isInterpolating={isInterpolating}
        progress={interpolationProgress}
        status={interpolationStatus}
        selectedFrameCount={selectedFrameIds.length}
        interpolationPairCount={interpolationPairCount}
        steps={interpolationSteps}
        quality={interpolationQuality}
        onStepsChange={setInterpolationSteps}
        onQualityChange={setInterpolationQuality}
        translations={{
          frameInterpolation: t.frameInterpolation,
          interpolationDescription: t.frameInterpolationDescription,
          interpolationSteps: t.interpolationSteps,
          interpolationQuality: t.interpolationQuality,
          qualityFast: t.interpolationQualityFast,
          qualityHigh: t.interpolationQualityHigh,
          qualityFastHint: t.interpolationQualityFastHint,
          qualityHighHint: t.interpolationQualityHighHint,
          estimatedFrames: t.interpolationEstimatedFrames,
          firstRunDownload: t.interpolationFirstRunDownload,
          cancel: t.cancel,
          generate: t.confirm,
        }}
      />

      <PanLockFloatingButton
        isPanLocked={isPanLocked}
        onTogglePanLock={() => setIsPanLocked(!isPanLocked)}
        storageKey="artkit.sprite.pan-toggle-position-v1"
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
