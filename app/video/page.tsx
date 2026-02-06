"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLanguage, HeaderSlot } from "../../shared/contexts";
import { downloadBlob, downloadJson } from "../../shared/utils";
import {
  createRectFromDrag,
  getRectHandleAtPosition,
  resizeRectByHandle,
  type RectHandle,
} from "../../domains/editor/utils/rectTransform";
import {
  VideoStateProvider,
  VideoRefsProvider,
  TimelineProvider,
  MaskProvider,
  useVideoState,
  useVideoRefs,
  useTimeline,
  useMask,
  PreviewCanvas,
  PreviewControls,
  Timeline,
  AssetDropZone,
  MaskControls,
  VideoMenuBar,
  VideoToolbar,
  clearVideoAutosave,
  saveMediaBlob,
  SUPPORTED_VIDEO_FORMATS,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
  TIMELINE,
  type Clip,
  type SavedVideoProject,
  type TimelineViewState,
  type VideoTrack,
} from "../../domains/video";
import Tooltip from "../../shared/components/Tooltip";
import {
  StopIcon,
  StepBackwardIcon,
  PlayIcon,
  StepForwardIcon,
  TrackMutedIcon,
  TrackUnmutedIcon,
} from "../../shared/components/icons";

interface VideoProjectFile extends Partial<SavedVideoProject> {
  tracks?: VideoTrack[];
  clips?: Clip[];
  timelineView?: TimelineViewState;
  currentTime?: number;
  toolMode?: string;
}

interface VideoCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

function sanitizeFileName(name: string): string {
  return name.trim().replace(/[^a-zA-Z0-9-_ ]+/g, "").replace(/\s+/g, "-") || "untitled-project";
}

function calculateProjectDuration(clips: Clip[]): number {
  const maxEnd = clips.reduce((max, clip) => Math.max(max, clip.startTime + clip.duration), 0);
  return Math.max(maxEnd, 10);
}

function cloneClip(clip: Clip): Clip {
  return {
    ...clip,
    position: { ...clip.position },
    sourceSize: { ...clip.sourceSize },
  };
}

function normalizeLoadedClip(clip: Clip): Clip {
  if (clip.type === "video") {
    return {
      ...clip,
      hasAudio: clip.hasAudio ?? true,
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  if (clip.type === "audio") {
    return {
      ...clip,
      sourceSize: clip.sourceSize || { width: 0, height: 0 },
      audioMuted: clip.audioMuted ?? false,
      audioVolume: typeof clip.audioVolume === "number" ? clip.audioVolume : 100,
    };
  }

  return clip;
}

function VideoEditorContent() {
  const { t } = useLanguage();
  const {
    project,
    projectName,
    setProject,
    setProjectName,
    toolMode,
    setToolMode,
    selectedClipIds,
    selectClips,
    deselectAll,
    togglePlay,
    play,
    stop,
    seek,
    stepForward,
    stepBackward,
    playback,
    clipboardRef,
    hasClipboard,
    setHasClipboard,
  } = useVideoState();
  const { previewCanvasRef, videoElementsRef, audioElementsRef } = useVideoRefs();
  const {
    tracks,
    clips,
    viewState,
    setZoom,
    setScrollX,
    setViewState,
    addTrack,
    addVideoClip,
    addAudioClip,
    addImageClip,
    removeClip,
    addClips,
    updateClip,
    restoreTracks,
    restoreClips,
    saveToHistory,
    undo,
    redo,
    clearHistory,
    canUndo,
    canRedo,
  } = useTimeline();
  const { isEditingMask, startMaskEdit } = useMask();

  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const timelineAreaRef = useRef<HTMLDivElement>(null);
  const cropOverlayRef = useRef<HTMLDivElement>(null);
  const cropDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const cropDragTypeRef = useRef<"none" | "create" | "move" | "resize">("none");
  const cropResizeHandleRef = useRef<RectHandle | null>(null);
  const cropOriginalAreaRef = useRef<VideoCropArea | null>(null);
  const timelineResizeStateRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const exportAudioContextRef = useRef<AudioContext | null>(null);
  const exportAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const exportSourceNodesRef = useRef<Map<HTMLMediaElement, MediaElementAudioSourceNode>>(new Map());
  const exportGainNodesRef = useRef<Map<HTMLMediaElement, GainNode>>(new Map());

  const [isTimelineVisible, setIsTimelineVisible] = useState(true);
  const [timelineHeight, setTimelineHeight] = useState(260);
  const [isResizingTimeline, setIsResizingTimeline] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [includeAudioOnExport, setIncludeAudioOnExport] = useState(true);
  const [isCanvasModalOpen, setIsCanvasModalOpen] = useState(false);
  const [canvasWidthInput, setCanvasWidthInput] = useState("");
  const [canvasHeightInput, setCanvasHeightInput] = useState("");
  const [canvasResizeMode, setCanvasResizeMode] = useState<"resize" | "crop">("resize");
  const [cropArea, setCropArea] = useState<VideoCropArea | null>(null);
  const [cropOverlaySize, setCropOverlaySize] = useState({ width: 0, height: 0 });
  const [cropExpandMode, setCropExpandMode] = useState(false);
  const audioHistorySavedRef = useRef(false);
  const transformHistorySavedRef = useRef(false);

  useEffect(() => {
    return () => {
      if (exportAudioContextRef.current) {
        exportAudioContextRef.current.close().catch(() => {});
      }
      exportAudioContextRef.current = null;
      exportAudioDestinationRef.current = null;
      exportSourceNodesRef.current.clear();
      exportGainNodesRef.current.clear();
    };
  }, []);

  useEffect(() => {
    if (!isResizingTimeline) return;

    const handleMouseMove = (event: MouseEvent) => {
      const resizeState = timelineResizeStateRef.current;
      if (!resizeState) return;

      const delta = resizeState.startY - event.clientY;
      const nextHeight = Math.max(160, Math.min(520, resizeState.startHeight + delta));
      setTimelineHeight(nextHeight);
    };

    const handleMouseUp = () => {
      setIsResizingTimeline(false);
      timelineResizeStateRef.current = null;
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingTimeline]);

  useEffect(() => {
    const element = cropOverlayRef.current;
    if (!element) return;

    const updateSize = () => {
      const rect = element.getBoundingClientRect();
      setCropOverlaySize({ width: rect.width, height: rect.height });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, [isTimelineVisible, clips.length]);

  useEffect(() => {
    if (toolMode !== "crop") return;
    setCropArea((prev) =>
      prev || {
        x: 0,
        y: 0,
        width: project.canvasSize.width,
        height: project.canvasSize.height,
      }
    );
  }, [toolMode, project.canvasSize.width, project.canvasSize.height]);

  const hasContent = clips.length > 0;
  const selectedClip = selectedClipIds.length > 0
    ? clips.find((clip) => clip.id === selectedClipIds[0]) || null
    : null;
  const selectedVisualClip = selectedClip && selectedClip.type !== "audio" ? selectedClip : null;
  const selectedAudioClip = selectedClip && selectedClip.type !== "image" ? selectedClip : null;

  const buildSavedProject = useCallback(
    (nameOverride?: string): SavedVideoProject => {
      const resolvedName = nameOverride || projectName;
      const duration = calculateProjectDuration(clips);

      return {
        id: project.id,
        name: resolvedName,
        project: {
          ...project,
          name: resolvedName,
          tracks: tracks.map((track) => ({ ...track })),
          clips: clips.map(cloneClip),
          duration,
        },
        timelineView: { ...viewState },
        currentTime: playback.currentTime,
        savedAt: Date.now(),
      };
    },
    [project, projectName, tracks, clips, viewState, playback.currentTime]
  );

  const importMediaFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      saveToHistory();

      let targetVideoTrackId = tracks.find((track) => track.type === "video")?.id || null;
      let targetAudioTrackId = tracks.find((track) => track.type === "audio")?.id || null;
      let insertTime = playback.currentTime;

      for (const file of files) {
        const isVideo =
          file.type.startsWith("video/") ||
          SUPPORTED_VIDEO_FORMATS.some((format) => file.type === format);
        const isImage =
          file.type.startsWith("image/") ||
          SUPPORTED_IMAGE_FORMATS.some((format) => file.type === format);
        const isAudio =
          file.type.startsWith("audio/") ||
          SUPPORTED_AUDIO_FORMATS.some((format) => file.type === format);

        if (!isVideo && !isImage && !isAudio) {
          continue;
        }

        if (isVideo) {
          if (!targetVideoTrackId) {
            targetVideoTrackId = addTrack("Video 1", "video");
          }

          const url = URL.createObjectURL(file);
          const video = document.createElement("video");
          video.src = url;

          const metadata = await new Promise<{ duration: number; size: { width: number; height: number } } | null>((resolve) => {
            video.onloadedmetadata = () => {
              resolve({
                duration: Math.max(video.duration || 0, 0.1),
                size: { width: video.videoWidth || project.canvasSize.width, height: video.videoHeight || project.canvasSize.height },
              });
            };
            video.onerror = () => resolve(null);
          });

          if (!metadata) {
            URL.revokeObjectURL(url);
            continue;
          }

          const clipId = addVideoClip(targetVideoTrackId, url, metadata.duration, metadata.size, Math.max(0, insertTime));
          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += metadata.duration;
          continue;
        }

        if (isAudio) {
          const url = URL.createObjectURL(file);
          const audio = document.createElement("audio");
          audio.src = url;

          const metadata = await new Promise<{ duration: number } | null>((resolve) => {
            audio.onloadedmetadata = () => {
              resolve({
                duration: Math.max(audio.duration || 0, 0.1),
              });
            };
            audio.onerror = () => resolve(null);
          });

          if (!metadata) {
            URL.revokeObjectURL(url);
            continue;
          }

          if (!targetAudioTrackId) {
            targetAudioTrackId = addTrack("Audio 1", "audio");
          }

          const clipId = addAudioClip(
            targetAudioTrackId,
            url,
            metadata.duration,
            Math.max(0, insertTime),
            { ...project.canvasSize }
          );

          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += metadata.duration;
          continue;
        }

        if (!targetVideoTrackId) {
          targetVideoTrackId = addTrack("Video 1", "video");
        }

        const url = URL.createObjectURL(file);
        const image = new Image();
        image.src = url;

        const size = await new Promise<{ width: number; height: number } | null>((resolve) => {
          image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => resolve(null);
        });

        if (!size) {
          URL.revokeObjectURL(url);
          continue;
        }

        const clipId = addImageClip(targetVideoTrackId, url, size, Math.max(0, insertTime), 5);
        try {
          await saveMediaBlob(clipId, file);
        } catch (error) {
          console.error("Failed to save media blob:", error);
        }

        insertTime += 5;
      }
    },
    [
      saveToHistory,
      tracks,
      addTrack,
      playback.currentTime,
      project,
      addVideoClip,
      addAudioClip,
      addImageClip,
    ]
  );

  // Menu handlers
  const handleNew = useCallback(async () => {
    if (window.confirm(t.newProjectConfirm)) {
      await clearVideoAutosave();
      window.location.reload();
    }
  }, [t]);

  const handleOpen = useCallback(() => {
    projectFileInputRef.current?.click();
  }, []);

  const handleSave = useCallback(() => {
    const savedProject = buildSavedProject();
    const fileName = `${sanitizeFileName(projectName)}.video-project.json`;
    downloadJson(savedProject, fileName);
  }, [buildSavedProject, projectName]);

  const handleSaveAs = useCallback(() => {
    const suggestedName = projectName || "Untitled Project";
    const nextName = window.prompt("Project name", suggestedName);
    if (!nextName) return;

    setProjectName(nextName);
    const savedProject = buildSavedProject(nextName);
    const fileName = `${sanitizeFileName(nextName)}.video-project.json`;
    downloadJson(savedProject, fileName);
  }, [buildSavedProject, projectName, setProjectName]);

  const handleImportMedia = useCallback(() => {
    mediaFileInputRef.current?.click();
  }, []);

  const handleExport = useCallback(async () => {
    if (isExporting) return;

    const canvas = previewCanvasRef.current;
    if (!canvas) {
      alert(`${t.exportFailed}: preview canvas unavailable`);
      return;
    }

    const duration = Math.max(project.duration, 0.1);
    const frameRate = Math.max(1, project.frameRate || 30);

    if (typeof canvas.captureStream !== "function" || typeof MediaRecorder === "undefined") {
      alert(`${t.exportFailed}: browser does not support video recording`);
      return;
    }

    const mimeTypeCandidates = [
      "video/webm;codecs=vp9",
      "video/webm;codecs=vp8",
      "video/webm",
    ];
    const selectedMimeType = mimeTypeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));

    const canvasStream = canvas.captureStream(frameRate);
    const recordingStream = new MediaStream();
    canvasStream.getVideoTracks().forEach((track) => recordingStream.addTrack(track));

    let syncAudioFrameId: number | null = null;
    const mediaElements: HTMLMediaElement[] = [
      ...Array.from(videoElementsRef.current.values()),
      ...Array.from(audioElementsRef.current.values()),
    ];

    if (includeAudioOnExport && typeof AudioContext !== "undefined" && mediaElements.length > 0) {
      let audioContext = exportAudioContextRef.current;
      if (!audioContext || audioContext.state === "closed") {
        audioContext = new AudioContext();
        exportAudioContextRef.current = audioContext;
        exportAudioDestinationRef.current = audioContext.createMediaStreamDestination();
      }

      const destination = exportAudioDestinationRef.current;
      if (audioContext.state === "suspended") {
        await audioContext.resume().catch(() => {});
      }

      if (destination) {
        for (const mediaElement of mediaElements) {
          if (exportSourceNodesRef.current.has(mediaElement)) continue;

          try {
            const sourceNode = audioContext.createMediaElementSource(mediaElement);
            const gainNode = audioContext.createGain();
            sourceNode.connect(gainNode);
            gainNode.connect(destination);
            exportSourceNodesRef.current.set(mediaElement, sourceNode);
            exportGainNodesRef.current.set(mediaElement, gainNode);
          } catch {
            // Source node can fail for unsupported media elements.
          }
        }

        const syncGains = () => {
          for (const [mediaElement, gainNode] of exportGainNodesRef.current.entries()) {
            const volume = typeof mediaElement.volume === "number" ? mediaElement.volume : 1;
            gainNode.gain.value = mediaElement.muted ? 0 : Math.max(0, Math.min(1, volume));
          }
        };

        syncGains();
        const audioTrack = destination.stream.getAudioTracks()[0];
        if (audioTrack) {
          recordingStream.addTrack(audioTrack);
        }

        const syncLoop = () => {
          syncGains();
          syncAudioFrameId = window.requestAnimationFrame(syncLoop);
        };
        syncAudioFrameId = window.requestAnimationFrame(syncLoop);
      }
    }

    const chunks: BlobPart[] = [];

    try {
      setIsExporting(true);

      const recorder = selectedMimeType
        ? new MediaRecorder(recordingStream, { mimeType: selectedMimeType })
        : new MediaRecorder(recordingStream);

      const blobPromise = new Promise<Blob>((resolve, reject) => {
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            chunks.push(event.data);
          }
        };
        recorder.onerror = () => reject(new Error("MediaRecorder error"));
        recorder.onstop = () => {
          resolve(new Blob(chunks, { type: selectedMimeType || "video/webm" }));
        };
      });

      const previousTime = playback.currentTime;
      const wasPlaying = playback.isPlaying;

      stop();
      seek(0);

      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });

      recorder.start(100);
      play();

      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), duration * 1000 + 150);
      });

      stop();
      recorder.stop();

      const blob = await blobPromise;
      downloadBlob(blob, `${sanitizeFileName(projectName)}.webm`);

      seek(previousTime);
      if (wasPlaying) {
        play();
      }
    } catch (error) {
      console.error("Video export failed:", error);
      alert(`${t.exportFailed}: ${(error as Error).message}`);
    } finally {
      if (syncAudioFrameId !== null) {
        window.cancelAnimationFrame(syncAudioFrameId);
      }
      for (const gainNode of exportGainNodesRef.current.values()) {
        gainNode.gain.value = 0;
      }
      canvasStream.getTracks().forEach((track) => track.stop());
      setIsExporting(false);
    }
  }, [isExporting, includeAudioOnExport, previewCanvasRef, videoElementsRef, audioElementsRef, project.duration, project.frameRate, playback.currentTime, playback.isPlaying, stop, seek, play, projectName, t.exportFailed]);

  const openExportModal = useCallback(() => {
    if (isExporting) return;
    setIsExportModalOpen(true);
  }, [isExporting]);

  const closeExportModal = useCallback(() => {
    if (isExporting) return;
    setIsExportModalOpen(false);
  }, [isExporting]);

  const handleConfirmExport = useCallback(async () => {
    await handleExport();
    setIsExportModalOpen(false);
  }, [handleExport]);

  const openCanvasModal = useCallback(() => {
    setCanvasWidthInput(String(project.canvasSize.width));
    setCanvasHeightInput(String(project.canvasSize.height));
    setCanvasResizeMode("resize");
    setIsCanvasModalOpen(true);
  }, [project.canvasSize.width, project.canvasSize.height]);

  const closeCanvasModal = useCallback(() => {
    if (isExporting) return;
    setIsCanvasModalOpen(false);
  }, [isExporting]);

  const applyCanvasSize = useCallback(() => {
    const width = Math.max(1, Math.round(Number(canvasWidthInput)));
    const height = Math.max(1, Math.round(Number(canvasHeightInput)));
    if (!Number.isFinite(width) || !Number.isFinite(height)) return;

    const currentWidth = project.canvasSize.width;
    const currentHeight = project.canvasSize.height;

    if (canvasResizeMode === "crop") {
      const offsetX = (width - currentWidth) / 2;
      const offsetY = (height - currentHeight) / 2;
      const updatedClips = clips.map((clip) => {
        if (clip.type === "audio") return clip;
        return {
          ...clip,
          position: {
            x: clip.position.x + offsetX,
            y: clip.position.y + offsetY,
          },
        };
      });

      saveToHistory();
      restoreClips(updatedClips);
    }

    setProject({
      ...project,
      canvasSize: { width, height },
    });
    setIsCanvasModalOpen(false);
  }, [
    canvasWidthInput,
    canvasHeightInput,
    canvasResizeMode,
    project,
    clips,
    saveToHistory,
    restoreClips,
    setProject,
  ]);

  const getCropPreviewMetrics = useCallback(() => {
    const width = cropOverlaySize.width;
    const height = cropOverlaySize.height;
    if (width <= 0 || height <= 0) return null;

    const projectWidth = project.canvasSize.width;
    const projectHeight = project.canvasSize.height;
    if (projectWidth <= 0 || projectHeight <= 0) return null;

    const availableWidth = Math.max(20, width - 40);
    const availableHeight = Math.max(20, height - 40);
    const scale = Math.min(availableWidth / projectWidth, availableHeight / projectHeight);
    const previewWidth = projectWidth * scale;
    const previewHeight = projectHeight * scale;
    const offsetX = (width - previewWidth) / 2;
    const offsetY = (height - previewHeight) / 2;

    return { scale, offsetX, offsetY, previewWidth, previewHeight };
  }, [cropOverlaySize.width, cropOverlaySize.height, project.canvasSize.width, project.canvasSize.height]);

  const screenPointToCanvasPoint = useCallback((clientX: number, clientY: number) => {
    const overlay = cropOverlayRef.current;
    const metrics = getCropPreviewMetrics();
    if (!overlay || !metrics) return null;

    const rect = overlay.getBoundingClientRect();
    const localX = clientX - rect.left;
    const localY = clientY - rect.top;

    return {
      x: (localX - metrics.offsetX) / metrics.scale,
      y: (localY - metrics.offsetY) / metrics.scale,
    };
  }, [getCropPreviewMetrics]);

  const clampCropArea = useCallback((area: VideoCropArea): VideoCropArea => {
    if (cropExpandMode) return area;

    const canvasWidth = project.canvasSize.width;
    const canvasHeight = project.canvasSize.height;

    const x = Math.max(0, Math.min(area.x, canvasWidth - 1));
    const y = Math.max(0, Math.min(area.y, canvasHeight - 1));
    const maxWidth = Math.max(1, canvasWidth - x);
    const maxHeight = Math.max(1, canvasHeight - y);

    return {
      x,
      y,
      width: Math.max(1, Math.min(area.width, maxWidth)),
      height: Math.max(1, Math.min(area.height, maxHeight)),
    };
  }, [cropExpandMode, project.canvasSize.width, project.canvasSize.height]);

  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;

    const newWidth = Math.max(1, Math.round(cropArea.width));
    const newHeight = Math.max(1, Math.round(cropArea.height));
    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    saveToHistory();

    const updatedClips = clips.map((clip) => {
      if (clip.type === "audio") return clip;
      return {
        ...clip,
        position: {
          x: clip.position.x - offsetX,
          y: clip.position.y - offsetY,
        },
      };
    });

    restoreClips(updatedClips);
    setProject({
      ...project,
      canvasSize: { width: newWidth, height: newHeight },
    });

    setCropArea(null);
    setToolMode("select");
  }, [cropArea, saveToHistory, clips, restoreClips, setProject, project, setToolMode]);

  const handleCancelCrop = useCallback(() => {
    setCropArea(null);
    setToolMode("select");
  }, [setToolMode]);

  const handleCropOverlayPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== "crop") return;

    const point = screenPointToCanvasPoint(event.clientX, event.clientY);
    if (!point) return;

    if (cropArea) {
      const hit = getRectHandleAtPosition(point, cropArea, {
        handleSize: 8,
        includeMove: true,
      });

      if (hit === "move") {
        cropDragTypeRef.current = "move";
        cropDragStartRef.current = point;
        cropOriginalAreaRef.current = { ...cropArea };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }

      if (hit) {
        cropDragTypeRef.current = "resize";
        cropResizeHandleRef.current = hit;
        cropDragStartRef.current = point;
        cropOriginalAreaRef.current = { ...cropArea };
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        return;
      }
    }

    // Start creating a new crop area.
    cropDragTypeRef.current = "create";
    cropDragStartRef.current = point;
    cropResizeHandleRef.current = null;
    cropOriginalAreaRef.current = null;
    setCropArea({ x: point.x, y: point.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }, [toolMode, screenPointToCanvasPoint, cropArea]);

  const handleCropOverlayPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (toolMode !== "crop") return;
    const dragType = cropDragTypeRef.current;
    if (dragType === "none") return;

    const point = screenPointToCanvasPoint(event.clientX, event.clientY);
    if (!point) return;

    const start = cropDragStartRef.current;
    const original = cropOriginalAreaRef.current;
    if (!start) return;

    if (dragType === "create") {
      const bounds = cropExpandMode
        ? undefined
        : {
            minX: 0,
            minY: 0,
            maxX: project.canvasSize.width,
            maxY: project.canvasSize.height,
          };

      const area = createRectFromDrag(
        { x: start.x, y: start.y },
        { x: point.x, y: point.y },
        { bounds, round: false }
      );
      setCropArea(clampCropArea(area));
      return;
    }

    if (!original) return;

    if (dragType === "move") {
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      setCropArea((prev) => {
        const next = prev
          ? { ...prev, x: original.x + dx, y: original.y + dy }
          : { ...original, x: original.x + dx, y: original.y + dy };
        return clampCropArea(next);
      });
      return;
    }

    if (dragType === "resize" && cropResizeHandleRef.current) {
      const dx = point.x - start.x;
      const dy = point.y - start.y;
      const resized = resizeRectByHandle(
        original,
        cropResizeHandleRef.current,
        { dx, dy },
        {
          minWidth: 1,
          minHeight: 1,
          keepAspect: false,
        }
      );
      setCropArea(clampCropArea(resized));
    }
  }, [
    toolMode,
    screenPointToCanvasPoint,
    cropExpandMode,
    project.canvasSize.width,
    project.canvasSize.height,
    clampCropArea,
  ]);

  const handleCropOverlayPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    cropDragTypeRef.current = "none";
    cropDragStartRef.current = null;
    cropResizeHandleRef.current = null;
    cropOriginalAreaRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
  }, []);

  // Edit menu handlers
  const handleUndo = useCallback(() => {
    undo();
    deselectAll();
  }, [undo, deselectAll]);

  const handleRedo = useCallback(() => {
    redo();
    deselectAll();
  }, [redo, deselectAll]);

  const handleCopy = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    const selectedClips = clips.filter((c) => selectedClipIds.includes(c.id));
    if (selectedClips.length === 0) return;

    clipboardRef.current = {
      clips: selectedClips.map(cloneClip),
      mode: "copy",
      sourceTime: playback.currentTime,
    };
    setHasClipboard(true);
  }, [selectedClipIds, clips, playback.currentTime, clipboardRef, setHasClipboard]);

  const handleCut = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    const selectedClips = clips.filter((c) => selectedClipIds.includes(c.id));
    if (selectedClips.length === 0) return;

    clipboardRef.current = {
      clips: selectedClips.map(cloneClip),
      mode: "cut",
      sourceTime: playback.currentTime,
    };
    setHasClipboard(true);

    saveToHistory();
    selectedClipIds.forEach((id) => removeClip(id));
    deselectAll();
  }, [selectedClipIds, clips, playback.currentTime, clipboardRef, setHasClipboard, saveToHistory, removeClip, deselectAll]);

  const handlePaste = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard || clipboard.clips.length === 0) return;

    saveToHistory();

    const currentTime = playback.currentTime;
    const earliestStart = Math.min(...clipboard.clips.map((c) => c.startTime));
    const timeOffset = currentTime - earliestStart;

    const newClips = clipboard.clips.map((clipData) => ({
      ...cloneClip(clipData),
      id: crypto.randomUUID(),
      startTime: Math.max(0, clipData.startTime + timeOffset),
    }));

    addClips(newClips);
    selectClips(newClips.map((c) => c.id));

    if (clipboard.mode === "cut") {
      clipboardRef.current = null;
      setHasClipboard(false);
    }
  }, [playback.currentTime, clipboardRef, setHasClipboard, saveToHistory, addClips, selectClips]);

  const handleDelete = useCallback(() => {
    if (selectedClipIds.length === 0) return;

    saveToHistory();
    selectedClipIds.forEach((id) => removeClip(id));
    deselectAll();
  }, [selectedClipIds, saveToHistory, removeClip, deselectAll]);

  const handleDuplicate = useCallback(() => {
    if (selectedClipIds.length === 0) return;

    const selectedClips = clips.filter((clip) => selectedClipIds.includes(clip.id));
    if (selectedClips.length === 0) return;

    saveToHistory();

    const duplicated = selectedClips.map((clip) => ({
      ...cloneClip(clip),
      id: crypto.randomUUID(),
      startTime: clip.startTime + 0.25,
      name: `${clip.name} (Copy)`,
    }));

    addClips(duplicated);
    selectClips(duplicated.map((clip) => clip.id));
  }, [selectedClipIds, clips, saveToHistory, addClips, selectClips]);

  const beginAudioAdjustment = useCallback(() => {
    if (audioHistorySavedRef.current) return;
    saveToHistory();
    audioHistorySavedRef.current = true;
  }, [saveToHistory]);

  const endAudioAdjustment = useCallback(() => {
    audioHistorySavedRef.current = false;
  }, []);

  const beginTransformAdjustment = useCallback(() => {
    if (transformHistorySavedRef.current) return;
    saveToHistory();
    transformHistorySavedRef.current = true;
  }, [saveToHistory]);

  const endTransformAdjustment = useCallback(() => {
    transformHistorySavedRef.current = false;
  }, []);

  const handleSelectedVisualScaleChange = useCallback((scalePercent: number) => {
    if (!selectedVisualClip) return;
    updateClip(selectedVisualClip.id, {
      scale: Math.max(0.05, Math.min(10, scalePercent / 100)),
    });
  }, [selectedVisualClip, updateClip]);

  const handleSelectedVisualRotationChange = useCallback((rotation: number) => {
    if (!selectedVisualClip) return;
    updateClip(selectedVisualClip.id, {
      rotation: Math.max(-180, Math.min(180, rotation)),
    });
  }, [selectedVisualClip, updateClip]);

  const handleToggleSelectedClipMute = useCallback(() => {
    if (!selectedAudioClip) return;
    saveToHistory();
    updateClip(selectedAudioClip.id, {
      audioMuted: !(selectedAudioClip.audioMuted ?? false),
    });
  }, [selectedAudioClip, saveToHistory, updateClip]);

  const handleSelectedClipVolumeChange = useCallback(
    (volume: number) => {
      if (!selectedAudioClip) return;
      updateClip(selectedAudioClip.id, {
        audioVolume: Math.max(0, Math.min(100, volume)),
      });
    },
    [selectedAudioClip, updateClip]
  );

  // View menu handlers
  const handleZoomIn = useCallback(() => {
    setZoom(viewState.zoom * 1.25);
  }, [setZoom, viewState.zoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(viewState.zoom / 1.25);
  }, [setZoom, viewState.zoom]);

  const handleFitToScreen = useCallback(() => {
    const width = timelineAreaRef.current?.clientWidth;
    if (!width) {
      setZoom(TIMELINE.DEFAULT_ZOOM);
      setScrollX(0);
      return;
    }

    const availableWidth = Math.max(100, width - 160);
    const duration = Math.max(project.duration, 1);
    setZoom(availableWidth / duration);
    setScrollX(0);
  }, [project.duration, setZoom, setScrollX]);

  const handleToggleTimeline = useCallback(() => {
    setIsTimelineVisible((prev) => !prev);
  }, []);

  // Handle mask tool toggle
  const handleToolModeChange = useCallback((mode: typeof toolMode) => {
    if (toolMode === "crop" && mode !== "crop") {
      setCropArea(null);
    }
    if (mode === "mask" && selectedClipIds.length > 0) {
      const selectedClip = clips.find((c) => c.id === selectedClipIds[0]);
      if (selectedClip) {
        startMaskEdit(selectedClip.id, selectedClip.sourceSize);
      }
    }
    setToolMode(mode);
  }, [toolMode, selectedClipIds, clips, startMaskEdit, setToolMode]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (
      target.tagName === "INPUT" ||
      target.tagName === "SELECT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable
    ) {
      return;
    }

    const isCmd = e.metaKey || e.ctrlKey;
    const key = e.key.toLowerCase();

    if (toolMode === "crop") {
      if (key === "enter") {
        e.preventDefault();
        handleApplyCrop();
        return;
      }
      if (key === "escape") {
        e.preventDefault();
        handleCancelCrop();
        return;
      }
    }

    if (isCmd) {
      if (key === "z" && e.shiftKey) {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (key === "z") {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (key === "y") {
        e.preventDefault();
        handleRedo();
        return;
      }
      if (key === "s") {
        e.preventDefault();
        handleSave();
        return;
      }
      if (key === "o") {
        e.preventDefault();
        handleOpen();
        return;
      }
      if (key === "=") {
        e.preventDefault();
        handleZoomIn();
        return;
      }
      if (key === "-") {
        e.preventDefault();
        handleZoomOut();
        return;
      }
      if (key === "0") {
        e.preventDefault();
        handleFitToScreen();
        return;
      }
      if (key === "c") {
        e.preventDefault();
        handleCopy();
        return;
      }
      if (key === "x") {
        e.preventDefault();
        handleCut();
        return;
      }
      if (key === "v") {
        e.preventDefault();
        handlePaste();
        return;
      }
    }

    switch (key) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "v":
        setToolMode("select");
        break;
      case "c":
        setToolMode("razor");
        break;
      case "t":
        setToolMode("trim");
        break;
      case "r":
        handleToolModeChange("crop");
        break;
      case "m":
        handleToolModeChange("mask");
        break;
      case "arrowleft":
        stepBackward();
        break;
      case "arrowright":
        stepForward();
        break;
      case "d":
        if (e.shiftKey) {
          e.preventDefault();
          handleDuplicate();
        }
        break;
      case "delete":
      case "backspace":
        e.preventDefault();
        handleDelete();
        break;
      default:
        break;
    }
  }, [
    togglePlay,
    setToolMode,
    handleToolModeChange,
    stepBackward,
    stepForward,
    handleUndo,
    handleRedo,
    handleSave,
    handleOpen,
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleDuplicate,
    toolMode,
    handleApplyCrop,
    handleCancelCrop,
  ]);

  const menuTranslations = {
    file: t.file,
    edit: t.edit,
    view: t.view,
    newProject: t.newProject,
    openProject: t.openProject,
    save: t.save,
    saveAs: t.saveAs,
    importMedia: t.importMedia,
    exportVideo: t.exportVideo,
    undo: t.undo,
    redo: t.redo,
    cut: t.cut,
    copy: t.copy,
    paste: t.paste,
    delete: t.delete,
    zoomIn: t.zoomIn,
    zoomOut: t.zoomOut,
    fitToScreen: t.fitToScreen,
    timeline: t.timeline,
  };

  const toolbarTranslations = {
    select: t.select,
    selectDesc: t.selectDesc,
    crop: t.crop,
    cropDesc: t.cropToolTip,
    trim: t.trim,
    trimDesc: t.trimDesc,
    razor: t.razor,
    razorDesc: t.razorDesc,
    mask: t.mask,
    maskDesc: t.maskDesc,
  };

  const cropPreviewMetrics = getCropPreviewMetrics();
  const cropScreenArea =
    cropArea && cropPreviewMetrics
      ? {
          x: cropPreviewMetrics.offsetX + cropArea.x * cropPreviewMetrics.scale,
          y: cropPreviewMetrics.offsetY + cropArea.y * cropPreviewMetrics.scale,
          width: cropArea.width * cropPreviewMetrics.scale,
          height: cropArea.height * cropPreviewMetrics.scale,
        }
      : null;

  return (
    <div
      className="h-full bg-background text-text-primary flex flex-col overflow-hidden relative"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header Slot - Menu Bar + Project Info */}
      <HeaderSlot>
        <VideoMenuBar
          onNew={handleNew}
          onOpen={handleOpen}
          onSave={handleSave}
          onSaveAs={handleSaveAs}
          onImportMedia={handleImportMedia}
          onExport={openExportModal}
          canSave={hasContent}
          isLoading={isExporting}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={canUndo}
          canRedo={canRedo}
          onCut={handleCut}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDelete={handleDelete}
          hasSelection={selectedClipIds.length > 0}
          hasClipboard={hasClipboard}
          onZoomIn={handleZoomIn}
          onZoomOut={handleZoomOut}
          onFitToScreen={handleFitToScreen}
          onToggleTimeline={handleToggleTimeline}
          showTimeline={isTimelineVisible}
          translations={menuTranslations}
        />
        <div className="h-4 w-px bg-border-default mx-2" />
        <span className="text-sm text-text-secondary truncate max-w-[200px]">
          {projectName}
        </span>
        <span className="text-xs text-text-tertiary whitespace-nowrap ml-1">
          ({project.canvasSize.width}x{project.canvasSize.height})
        </span>
        <button
          onClick={openCanvasModal}
          className="ml-2 px-2 py-0.5 text-xs rounded bg-surface-tertiary text-text-secondary hover:text-text-primary hover:bg-surface-tertiary/80 transition-colors"
          title="Canvas size and crop settings"
        >
          Canvas
        </button>
      </HeaderSlot>

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-surface-secondary border-b border-border">
        <VideoToolbar
          toolMode={toolMode}
          onToolModeChange={handleToolModeChange}
          translations={toolbarTranslations}
        />

        {/* Playback controls in toolbar */}
        <div className="flex items-center gap-1">
          <Tooltip content={t.stop} shortcut="Home">
            <button
              onClick={stop}
              className="p-1.5 rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              <StopIcon />
            </button>
          </Tooltip>

          <Tooltip content={t.previousFrame} shortcut="←">
            <button
              onClick={stepBackward}
              className="p-1.5 rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              <StepBackwardIcon />
            </button>
          </Tooltip>

          <Tooltip content={t.play} shortcut="Space">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              <PlayIcon />
            </button>
          </Tooltip>

          <Tooltip content={t.nextFrame} shortcut="→">
            <button
              onClick={stepForward}
              className="p-1.5 rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              <StepForwardIcon />
            </button>
          </Tooltip>
        </div>

        {toolMode === "crop" && (
          <>
            <div className="h-4 w-px bg-border-default mx-1" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCropExpandMode((prev) => !prev)}
                className={`px-2 py-1 text-xs rounded transition-colors ${
                  cropExpandMode
                    ? "bg-accent/20 text-accent hover:bg-accent/30"
                    : "bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary/80"
                }`}
                title="Allow crop area outside canvas"
              >
                Expand
              </button>
              <span className="text-xs text-text-secondary min-w-[96px] text-right">
                {cropArea ? `${Math.round(cropArea.width)} x ${Math.round(cropArea.height)}` : "No crop"}
              </span>
              <button
                onClick={handleCancelCrop}
                className="px-2 py-1 text-xs rounded bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary/80"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCrop}
                disabled={!cropArea}
                className="px-2 py-1 text-xs rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-60"
              >
                Apply
              </button>
            </div>
          </>
        )}

        {selectedVisualClip && toolMode !== "crop" && (
          <>
            <div className="h-4 w-px bg-border-default mx-1" />
            <div className="flex items-center gap-2 min-w-[300px]">
              <span className="text-xs text-text-secondary w-8">Scale</span>
              <input
                type="range"
                min={10}
                max={400}
                value={Math.round((selectedVisualClip.scale ?? 1) * 100)}
                onMouseDown={beginTransformAdjustment}
                onTouchStart={beginTransformAdjustment}
                onMouseUp={endTransformAdjustment}
                onTouchEnd={endTransformAdjustment}
                onChange={(e) => handleSelectedVisualScaleChange(Number(e.target.value))}
                className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-text-secondary w-10 text-right">
                {Math.round((selectedVisualClip.scale ?? 1) * 100)}%
              </span>

              <span className="text-xs text-text-secondary w-7">Rot</span>
              <input
                type="range"
                min={-180}
                max={180}
                value={Math.round(selectedVisualClip.rotation ?? 0)}
                onMouseDown={beginTransformAdjustment}
                onTouchStart={beginTransformAdjustment}
                onMouseUp={endTransformAdjustment}
                onTouchEnd={endTransformAdjustment}
                onChange={(e) => handleSelectedVisualRotationChange(Number(e.target.value))}
                className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-text-secondary w-10 text-right">
                {Math.round(selectedVisualClip.rotation ?? 0)}deg
              </span>
            </div>
          </>
        )}

        {selectedAudioClip && toolMode !== "crop" && (
          <>
            <div className="h-4 w-px bg-border-default mx-1" />
            <div className="flex items-center gap-2 min-w-[220px]">
              <button
                onClick={handleToggleSelectedClipMute}
                className="p-1.5 rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
                title={(selectedAudioClip.audioMuted ?? false) ? "Unmute clip audio" : "Mute clip audio"}
              >
                {(selectedAudioClip.audioMuted ?? false) ? (
                  <TrackMutedIcon className="w-4 h-4" />
                ) : (
                  <TrackUnmutedIcon className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={selectedAudioClip.audioVolume ?? 100}
                onMouseDown={beginAudioAdjustment}
                onTouchStart={beginAudioAdjustment}
                onMouseUp={endAudioAdjustment}
                onTouchEnd={endAudioAdjustment}
                onChange={(e) => handleSelectedClipVolumeChange(Number(e.target.value))}
                className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-text-secondary w-10 text-right">
                {selectedAudioClip.audioVolume ?? 100}%
              </span>
            </div>
          </>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Preview Area */}
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 flex flex-col bg-surface-primary relative">
            {!hasContent ? (
              <div className="flex-1 flex items-center justify-center p-8">
                <AssetDropZone className="max-w-md w-full" />
              </div>
            ) : (
              <div className="flex-1 relative">
                <PreviewCanvas />

                {toolMode === "crop" && (
                  <div
                    ref={cropOverlayRef}
                    className="absolute inset-0 z-20 cursor-crosshair"
                    onPointerDown={handleCropOverlayPointerDown}
                    onPointerMove={handleCropOverlayPointerMove}
                    onPointerUp={handleCropOverlayPointerUp}
                    onPointerCancel={handleCropOverlayPointerUp}
                  >
                    {cropScreenArea && (
                      <>
                        <div
                          className="absolute bg-black/55 pointer-events-none"
                          style={{
                            left: 0,
                            top: 0,
                            width: "100%",
                            height: Math.max(0, cropScreenArea.y),
                          }}
                        />
                        <div
                          className="absolute bg-black/55 pointer-events-none"
                          style={{
                            left: 0,
                            top: cropScreenArea.y,
                            width: Math.max(0, cropScreenArea.x),
                            height: Math.max(0, cropScreenArea.height),
                          }}
                        />
                        <div
                          className="absolute bg-black/55 pointer-events-none"
                          style={{
                            left: cropScreenArea.x + cropScreenArea.width,
                            top: cropScreenArea.y,
                            right: 0,
                            height: Math.max(0, cropScreenArea.height),
                          }}
                        />
                        <div
                          className="absolute bg-black/55 pointer-events-none"
                          style={{
                            left: 0,
                            top: cropScreenArea.y + cropScreenArea.height,
                            width: "100%",
                            bottom: 0,
                          }}
                        />

                        <div
                          className="absolute border border-white/90 pointer-events-none"
                          style={{
                            left: cropScreenArea.x,
                            top: cropScreenArea.y,
                            width: cropScreenArea.width,
                            height: cropScreenArea.height,
                          }}
                        >
                          <div className="absolute left-1/3 top-0 bottom-0 w-px bg-white/35" />
                          <div className="absolute left-2/3 top-0 bottom-0 w-px bg-white/35" />
                          <div className="absolute top-1/3 left-0 right-0 h-px bg-white/35" />
                          <div className="absolute top-2/3 left-0 right-0 h-px bg-white/35" />
                        </div>

                        {[
                          { x: cropScreenArea.x, y: cropScreenArea.y },
                          { x: cropScreenArea.x + cropScreenArea.width / 2, y: cropScreenArea.y },
                          { x: cropScreenArea.x + cropScreenArea.width, y: cropScreenArea.y },
                          { x: cropScreenArea.x + cropScreenArea.width, y: cropScreenArea.y + cropScreenArea.height / 2 },
                          { x: cropScreenArea.x + cropScreenArea.width, y: cropScreenArea.y + cropScreenArea.height },
                          { x: cropScreenArea.x + cropScreenArea.width / 2, y: cropScreenArea.y + cropScreenArea.height },
                          { x: cropScreenArea.x, y: cropScreenArea.y + cropScreenArea.height },
                          { x: cropScreenArea.x, y: cropScreenArea.y + cropScreenArea.height / 2 },
                        ].map((handle, index) => (
                          <div
                            key={`crop-handle-${index}`}
                            className="absolute w-2.5 h-2.5 bg-white border border-black/60 rounded-sm pointer-events-none"
                            style={{
                              left: handle.x - 5,
                              top: handle.y - 5,
                            }}
                          />
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Mask Controls Panel (floating) */}
                {isEditingMask && (
                  <div className="absolute top-4 right-4 z-10">
                    <MaskControls />
                  </div>
                )}
              </div>
            )}

            {/* Preview Controls */}
            {hasContent && <PreviewControls />}
          </div>
        </div>

        {/* Timeline Area */}
        {isTimelineVisible && (
          <>
            <div
              className={`h-2 shrink-0 border-t border-border bg-surface-secondary cursor-row-resize ${
                isResizingTimeline ? "bg-accent/40" : "hover:bg-accent/20"
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                timelineResizeStateRef.current = {
                  startY: e.clientY,
                  startHeight: timelineHeight,
                };
                setIsResizingTimeline(true);
              }}
              title="Drag to resize timeline panel"
            />
            <div
              ref={timelineAreaRef}
              className="border-t border-border shrink-0"
              style={{ height: timelineHeight }}
            >
              <Timeline className="h-full" />
            </div>
          </>
        )}
      </div>

      {isExportModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface-primary shadow-xl">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-text-primary">Export Video</h3>
              <p className="text-xs text-text-secondary mt-1">Export current timeline to WebM.</p>
            </div>

            <div className="px-4 py-3 space-y-3">
              <label className="flex items-center gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={includeAudioOnExport}
                  onChange={(e) => setIncludeAudioOnExport(e.target.checked)}
                  disabled={isExporting}
                  className="h-4 w-4 rounded border-border"
                />
                Include audio
              </label>
            </div>

            <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={closeExportModal}
                disabled={isExporting}
                className="px-3 py-1.5 text-sm rounded bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary/80 disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmExport}
                disabled={isExporting}
                className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent-hover disabled:opacity-60"
              >
                {isExporting ? "Exporting..." : "Export"}
              </button>
            </div>
          </div>
        </div>
      )}

      {isCanvasModalOpen && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 p-4">
          <div className="w-full max-w-sm rounded-lg border border-border bg-surface-primary shadow-xl">
            <div className="px-4 py-3 border-b border-border">
              <h3 className="text-sm font-medium text-text-primary">Canvas Settings</h3>
              <p className="text-xs text-text-secondary mt-1">
                Resize canvas or center-crop relative to current composition.
              </p>
            </div>

            <div className="px-4 py-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <label className="text-xs text-text-secondary">
                  Width
                  <input
                    type="number"
                    min={1}
                    value={canvasWidthInput}
                    onChange={(e) => setCanvasWidthInput(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-surface-tertiary px-2 py-1 text-sm text-text-primary"
                  />
                </label>
                <label className="text-xs text-text-secondary">
                  Height
                  <input
                    type="number"
                    min={1}
                    value={canvasHeightInput}
                    onChange={(e) => setCanvasHeightInput(e.target.value)}
                    className="mt-1 w-full rounded border border-border bg-surface-tertiary px-2 py-1 text-sm text-text-primary"
                  />
                </label>
              </div>

              <div className="space-y-1">
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="canvas-mode"
                    checked={canvasResizeMode === "resize"}
                    onChange={() => setCanvasResizeMode("resize")}
                    className="h-4 w-4"
                  />
                  Resize only (keep clip coordinates)
                </label>
                <label className="flex items-center gap-2 text-sm text-text-primary">
                  <input
                    type="radio"
                    name="canvas-mode"
                    checked={canvasResizeMode === "crop"}
                    onChange={() => setCanvasResizeMode("crop")}
                    className="h-4 w-4"
                  />
                  Center crop/expand (shift clips with canvas center)
                </label>
              </div>
            </div>

            <div className="px-4 py-3 border-t border-border flex items-center justify-end gap-2">
              <button
                onClick={closeCanvasModal}
                className="px-3 py-1.5 text-sm rounded bg-surface-tertiary text-text-secondary hover:bg-surface-tertiary/80"
              >
                Cancel
              </button>
              <button
                onClick={applyCanvasSize}
                className="px-3 py-1.5 text-sm rounded bg-accent text-white hover:bg-accent-hover"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hidden file input for media import */}
      <input
        ref={mediaFileInputRef}
        type="file"
        accept={[...SUPPORTED_VIDEO_FORMATS, ...SUPPORTED_IMAGE_FORMATS, ...SUPPORTED_AUDIO_FORMATS].join(",")}
        multiple
        className="hidden"
        onChange={async (e) => {
          const files = e.target.files ? Array.from(e.target.files) : [];
          if (files.length > 0) {
            try {
              await importMediaFiles(files);
            } catch (error) {
              console.error("Media import failed:", error);
              alert(`${t.importFailed}: ${(error as Error).message}`);
            }
          }
          e.target.value = "";
        }}
      />

      {/* Hidden file input for project open */}
      <input
        ref={projectFileInputRef}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;

          try {
            const text = await file.text();
            const parsed = JSON.parse(text) as VideoProjectFile;

            const loadedTracks = Array.isArray(parsed.project?.tracks)
              ? parsed.project!.tracks
              : Array.isArray(parsed.tracks)
              ? parsed.tracks
              : null;
            const loadedClips = Array.isArray(parsed.project?.clips)
              ? parsed.project!.clips
              : Array.isArray(parsed.clips)
              ? parsed.clips
              : null;

            if (!loadedTracks || !loadedClips) {
              throw new Error("Invalid video project file");
            }

            const loadedName = parsed.name || parsed.project?.name || "Untitled Project";
            const loadedProject = parsed.project || project;
            const normalizedClips = loadedClips.map((clip) => normalizeLoadedClip(clip));
            const loadedDuration = calculateProjectDuration(normalizedClips);

            setProjectName(loadedName);
            setProject({
              ...loadedProject,
              name: loadedName,
              tracks: loadedTracks,
              clips: normalizedClips,
              duration: loadedDuration,
            });
            restoreTracks(loadedTracks);
            restoreClips(normalizedClips);

            if (parsed.timelineView) {
              setViewState(parsed.timelineView);
            }
            if (typeof parsed.currentTime === "number") {
              seek(parsed.currentTime);
            } else {
              seek(0);
            }

            if (parsed.toolMode === "select" || parsed.toolMode === "crop" || parsed.toolMode === "trim" || parsed.toolMode === "razor" || parsed.toolMode === "mask" || parsed.toolMode === "move" || parsed.toolMode === "pan") {
              setToolMode(parsed.toolMode);
            }

            selectClips([]);
            clearHistory();
          } catch (error) {
            console.error("Failed to open project:", error);
            alert(`${t.importFailed}: ${(error as Error).message}`);
          } finally {
            e.target.value = "";
          }
        }}
      />
    </div>
  );
}

function VideoEditorWithMask() {
  return (
    <MaskProvider>
      <VideoEditorContent />
    </MaskProvider>
  );
}

function VideoEditorWithTimeline() {
  return (
    <TimelineProvider>
      <VideoEditorWithMask />
    </TimelineProvider>
  );
}

export default function VideoEditorPage() {
  return (
    <VideoStateProvider>
      <VideoRefsProvider>
        <VideoEditorWithTimeline />
      </VideoRefsProvider>
    </VideoStateProvider>
  );
}
