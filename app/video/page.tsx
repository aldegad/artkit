"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLanguage, useAuth } from "../../shared/contexts";
import { HeaderContent, SaveToast, LoadingOverlay, Select } from "../../shared/components";
import { ZoomInIcon, ZoomOutIcon, LockAspectIcon, UnlockAspectIcon, SquareExpandIcon, SquareFitIcon, CanvasExpandIcon } from "../../shared/components/icons";
import { downloadBlob } from "../../shared/utils";
import {
  VideoStateProvider,
  VideoRefsProvider,
  TimelineProvider,
  MaskProvider,
  VideoLayoutProvider,
  useVideoState,
  useVideoRefs,
  useTimeline,
  useMask,
  useVideoLayout,
  useVideoSave,
  VideoMenuBar,
  VideoToolbar,
  VideoExportModal,
  VideoSplitContainer,
  VideoFloatingWindows,
  VideoProjectListModal,
  registerVideoPanelComponent,
  clearVideoPanelComponents,
  VideoPreviewPanelContent,
  VideoTimelinePanelContent,
  clearVideoAutosave,
  saveMediaBlob,
  loadMediaBlob,
  SUPPORTED_VIDEO_FORMATS,
  SUPPORTED_IMAGE_FORMATS,
  SUPPORTED_AUDIO_FORMATS,
  TIMELINE,
  type Clip,
  type SavedVideoProject,
  type TimelineViewState,
  type VideoToolMode,
  type VideoTrack,
} from "../../domains/video";
import { useVideoKeyboardShortcuts } from "../../domains/video/hooks";
import {
  getVideoStorageProvider,
  type VideoStorageInfo,
} from "../../services/videoProjectStorage";
import { type SaveLoadProgress } from "../../lib/firebase/firebaseVideoStorage";
import { LayoutNode, isSplitNode, isPanelNode } from "../../types/layout";
import { ASPECT_RATIOS, ASPECT_RATIO_VALUES, type AspectRatio } from "../../domains/editor/types";

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

function findPanelNodeIdByPanelId(node: LayoutNode, panelId: string): string | null {
  if (isPanelNode(node) && node.panelId === panelId) {
    return node.id;
  }

  if (isSplitNode(node)) {
    for (const child of node.children) {
      const found = findPanelNodeIdByPanelId(child, panelId);
      if (found) return found;
    }
  }

  return null;
}

function VideoDockableArea() {
  const { layoutState } = useVideoLayout();

  return (
    <>
      <VideoSplitContainer node={layoutState.root} />
      <VideoFloatingWindows />
    </>
  );
}

function VideoEditorContent() {
  const { t } = useLanguage();
  const { user } = useAuth();
  const storageProvider = useMemo(() => getVideoStorageProvider(user), [user]);
  const {
    project,
    projectName,
    setProject,
    setProjectName,
    toolMode,
    setToolMode,
    selectedClipIds,
    selectedMaskIds,
    selectClips,
    selectMasksForTimeline,
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
    cropArea,
    setCropArea,
    canvasExpandMode,
    setCanvasExpandMode,
    cropAspectRatio,
    setCropAspectRatio,
    lockCropAspect,
    setLockCropAspect,
  } = useVideoState();
  const { previewCanvasRef, previewViewportRef, videoElementsRef, audioElementsRef } = useVideoRefs();
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
    isAutosaveInitialized,
  } = useTimeline();
  const { startMaskEdit, isEditingMask, endMaskEdit, activeMaskId, deleteMask, duplicateMask, deselectMask, restoreMasks, masks: masksMap, saveMaskData, updateMaskTime } = useMask();
  const {
    layoutState,
    isPanelOpen,
    addPanel,
    removePanel,
    openFloatingWindow,
    closeFloatingWindow,
  } = useVideoLayout();

  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const exportAudioContextRef = useRef<AudioContext | null>(null);
  const exportAudioDestinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);
  const exportSourceNodesRef = useRef<Map<HTMLMediaElement, MediaElementAudioSourceNode>>(new Map());
  const exportGainNodesRef = useRef<Map<HTMLMediaElement, GainNode>>(new Map());

  const [isExporting, setIsExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  const audioHistorySavedRef = useRef(false);
  const visualHistorySavedRef = useRef(false);

  // Save system state
  const [savedProjects, setSavedProjects] = useState<SavedVideoProject[]>([]);
  const [storageInfo, setStorageInfo] = useState<VideoStorageInfo>({ used: 0, quota: 0, percentage: 0 });
  const [isProjectListOpen, setIsProjectListOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  const [loadProgress, setLoadProgress] = useState<SaveLoadProgress | null>(null);
  const [saveCount, setSaveCount] = useState(0);

  const masksArray = useMemo(() => Array.from(masksMap.values()), [masksMap]);
  const projectRef = useRef(project);
  projectRef.current = project;

  const { saveProject, saveAsProject, isSaving, saveProgress } = useVideoSave({
    storageProvider,
    project,
    projectName,
    currentProjectId,
    tracks,
    clips,
    masks: masksArray,
    viewState,
    currentTime: playback.currentTime,
    toolMode,
    selectedClipIds,
    selectedMaskIds,
    previewCanvasRef,
    setCurrentProjectId,
    setSavedProjects,
    setStorageInfo,
  });

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
    registerVideoPanelComponent("preview", () => <VideoPreviewPanelContent />);
    registerVideoPanelComponent("timeline", () => <VideoTimelinePanelContent />);

    return () => {
      clearVideoPanelComponents();
    };
  }, []);

  // Restore masks from autosave into MaskContext after autosave finishes loading
  // postRestorationRef prevents auto-start mask edit from firing during initial load
  const masksRestoredRef = useRef(false);
  const postRestorationRef = useRef(false);
  useEffect(() => {
    if (!isAutosaveInitialized || masksRestoredRef.current) return;
    masksRestoredRef.current = true;
    if (project.masks && project.masks.length > 0) {
      restoreMasks(project.masks);
    }
    // Allow auto-start mask edit only after masks are restored and rendered
    const timer = setTimeout(() => {
      postRestorationRef.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [isAutosaveInitialized, project.masks, restoreMasks]);

  // Sync MaskContext masks → project.masks (MaskContext is the single source of truth)
  useEffect(() => {
    if (!masksRestoredRef.current) return;
    setProject({
      ...projectRef.current,
      masks: masksArray,
    });
  }, [masksArray, setProject]);

  // Auto-switch to mask tool when entering mask edit mode (e.g., double-click mask clip)
  useEffect(() => {
    if (isEditingMask && toolMode !== "mask") {
      setToolMode("mask");
    }
  }, [isEditingMask, toolMode, setToolMode]);

  // Load saved projects when storage provider changes
  useEffect(() => {
    storageProvider.getAllProjects().then(setSavedProjects).catch(console.error);
    storageProvider.getStorageInfo().then(setStorageInfo).catch(console.error);
  }, [storageProvider]);

  const hasContent = clips.length > 0;
  const selectedClip = selectedClipIds.length > 0
    ? clips.find((clip) => clip.id === selectedClipIds[0]) || null
    : null;
  const selectedAudioClip = selectedClip && selectedClip.type !== "image" ? selectedClip : null;
  const selectedVisualClip = selectedClip && selectedClip.type !== "audio" ? selectedClip : null;
  const isTimelineVisible = isPanelOpen("timeline");

  // buildSavedProject is now inside useVideoSave hook

  const importMediaFiles = useCallback(
    async (files: File[]) => {
      if (files.length === 0) return;

      saveToHistory();

      let targetVideoTrackId = tracks.find((track) => track.type === "video")?.id || null;
      let targetAudioTrackId = tracks.find((track) => track.type === "audio")?.id || null;
      const hasExistingVisualClip = clips.some((clip) => clip.type !== "audio");
      let insertTime = playback.currentTime;
      let visualImportedCount = 0;

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

          const isFirstVisual = !hasExistingVisualClip && visualImportedCount === 0;
          if (isFirstVisual) {
            setProject({
              ...project,
              canvasSize: metadata.size,
            });
          }

          const clipId = addVideoClip(targetVideoTrackId, url, metadata.duration, metadata.size, Math.max(0, insertTime), isFirstVisual ? metadata.size : undefined);
          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += metadata.duration;
          visualImportedCount += 1;
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

        const isFirstVisualImg = !hasExistingVisualClip && visualImportedCount === 0;
        if (isFirstVisualImg) {
          setProject({
            ...project,
            canvasSize: size,
          });
        }

        const clipId = addImageClip(targetVideoTrackId, url, size, Math.max(0, insertTime), 5, isFirstVisualImg ? size : undefined);
        try {
          await saveMediaBlob(clipId, file);
        } catch (error) {
          console.error("Failed to save media blob:", error);
        }

        insertTime += 5;
        visualImportedCount += 1;
      }
    },
    [
      saveToHistory,
      tracks,
      addTrack,
      playback.currentTime,
      clips.length,
      project,
      setProject,
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
    setIsProjectListOpen(true);
  }, []);

  const handleSave = useCallback(async () => {
    try {
      await saveProject();
      setSaveCount((c) => c + 1);
    } catch (error) {
      console.error("Failed to save project:", error);
      alert(`Save failed: ${(error as Error).message}`);
    }
  }, [saveProject]);

  const handleSaveAs = useCallback(async () => {
    const suggestedName = projectName || "Untitled Project";
    const nextName = window.prompt("Project name", suggestedName);
    if (!nextName) return;

    setProjectName(nextName);
    try {
      await saveAsProject(nextName);
      setSaveCount((c) => c + 1);
    } catch (error) {
      console.error("Failed to save project:", error);
      alert(`Save failed: ${(error as Error).message}`);
    }
  }, [projectName, setProjectName, saveAsProject]);

  const handleLoadProject = useCallback(async (projectMeta: SavedVideoProject) => {
    setIsLoadingProject(true);
    setLoadProgress(null);
    try {
      const loaded = await storageProvider.getProject(projectMeta.id, setLoadProgress);
      if (!loaded) {
        alert("Failed to load project");
        return;
      }

      const loadedProject = loaded.project;
      const normalizedClips = loadedProject.clips.map((clip) => normalizeLoadedClip(clip));

      // Restore media blobs from IndexedDB and create new blob URLs
      const restoredClips: Clip[] = [];
      for (const clip of normalizedClips) {
        const blob = await loadMediaBlob(clip.id);
        if (blob) {
          const newUrl = URL.createObjectURL(blob);
          restoredClips.push({ ...clip, sourceUrl: newUrl });
        } else if (!clip.sourceUrl.startsWith("blob:")) {
          // Non-blob URL (e.g., remote URL), keep as is
          restoredClips.push(clip);
        }
        // Skip clips with invalid blob URLs (no stored blob)
      }

      const loadedDuration = calculateProjectDuration(restoredClips);

      setProjectName(loaded.name);
      setProject({
        ...loadedProject,
        name: loaded.name,
        tracks: loadedProject.tracks,
        clips: restoredClips,
        duration: loadedDuration,
      });
      restoreTracks(loadedProject.tracks);
      restoreClips(restoredClips);
      restoreMasks(loadedProject.masks || []);

      if (loaded.timelineView) {
        setViewState(loaded.timelineView);
      }
      if (typeof loaded.currentTime === "number") {
        seek(loaded.currentTime);
      } else {
        seek(0);
      }

      setCurrentProjectId(loaded.id);
      selectClips([]);
      clearHistory();
      setIsProjectListOpen(false);
    } catch (error) {
      console.error("Failed to load project:", error);
      alert(`Load failed: ${(error as Error).message}`);
    } finally {
      setIsLoadingProject(false);
      setLoadProgress(null);
    }
  }, [storageProvider, setProjectName, setProject, restoreTracks, restoreClips, restoreMasks, setViewState, seek, selectClips, clearHistory]);

  const handleDeleteProject = useCallback(async (id: string) => {
    if (!window.confirm(t.deleteConfirm || "Delete this project?")) return;
    try {
      await storageProvider.deleteProject(id);
      const projects = await storageProvider.getAllProjects();
      setSavedProjects(projects);
      if (currentProjectId === id) setCurrentProjectId(null);
    } catch (error) {
      console.error("Failed to delete project:", error);
    }
  }, [storageProvider, currentProjectId, t]);

  const handleImportMedia = useCallback(() => {
    mediaFileInputRef.current?.click();
  }, []);

  const handleExport = useCallback(async (exportFileName?: string, includeAudio?: boolean) => {
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

    if ((includeAudio ?? true) && typeof AudioContext !== "undefined" && mediaElements.length > 0) {
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
      downloadBlob(blob, `${sanitizeFileName(exportFileName || projectName)}.webm`);

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
      setShowExportModal(false);
    }
  }, [isExporting, previewCanvasRef, videoElementsRef, audioElementsRef, project.duration, project.frameRate, playback.currentTime, playback.isPlaying, stop, seek, play, projectName, t.exportFailed]);

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
    // Delete selected mask if one is active (editing mode)
    if (activeMaskId && isEditingMask) {
      endMaskEdit();
      deleteMask(activeMaskId);
      return;
    }

    const hasClips = selectedClipIds.length > 0;
    const hasMasks = selectedMaskIds.length > 0;

    // Also handle active mask (non-editing) if nothing else selected
    if (!hasClips && !hasMasks) {
      if (activeMaskId) {
        deleteMask(activeMaskId);
      }
      return;
    }

    saveToHistory();
    selectedClipIds.forEach((id) => removeClip(id));
    selectedMaskIds.forEach((id) => deleteMask(id));
    deselectAll();
  }, [selectedClipIds, selectedMaskIds, saveToHistory, removeClip, deselectAll, activeMaskId, isEditingMask, deleteMask, endMaskEdit]);

  const handleDuplicate = useCallback(() => {
    const hasClips = selectedClipIds.length > 0;
    const hasMasks = selectedMaskIds.length > 0;
    if (!hasClips && !hasMasks) return;

    saveToHistory();

    const duplicatedClipIds: string[] = [];
    const duplicatedMaskIds: string[] = [];

    // Duplicate clips
    if (hasClips) {
      const selectedClips = clips.filter((clip) => selectedClipIds.includes(clip.id));
      const duplicated = selectedClips.map((clip) => ({
        ...cloneClip(clip),
        id: crypto.randomUUID(),
        startTime: clip.startTime + 0.25,
        name: `${clip.name} (Copy)`,
      }));
      addClips(duplicated);
      duplicatedClipIds.push(...duplicated.map((c) => c.id));
    }

    // Duplicate masks
    for (const mid of selectedMaskIds) {
      const newId = duplicateMask(mid);
      if (newId) {
        const source = masksMap.get(mid);
        if (source) {
          updateMaskTime(newId, source.startTime + 0.25, source.duration);
        }
        duplicatedMaskIds.push(newId);
      }
    }

    if (duplicatedClipIds.length > 0) selectClips(duplicatedClipIds);
    if (duplicatedMaskIds.length > 0) selectMasksForTimeline(duplicatedMaskIds);
  }, [selectedClipIds, selectedMaskIds, clips, saveToHistory, addClips, selectClips, selectMasksForTimeline, duplicateMask, masksMap, updateMaskTime]);

  const beginAudioAdjustment = useCallback(() => {
    if (audioHistorySavedRef.current) return;
    saveToHistory();
    audioHistorySavedRef.current = true;
  }, [saveToHistory]);

  const endAudioAdjustment = useCallback(() => {
    audioHistorySavedRef.current = false;
  }, []);

  const beginVisualAdjustment = useCallback(() => {
    if (visualHistorySavedRef.current) return;
    saveToHistory();
    visualHistorySavedRef.current = true;
  }, [saveToHistory]);

  const endVisualAdjustment = useCallback(() => {
    visualHistorySavedRef.current = false;
  }, []);

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

  const handleSelectedVisualScaleChange = useCallback((scalePercent: number) => {
    if (!selectedVisualClip) return;
    updateClip(selectedVisualClip.id, {
      scale: Math.max(0.05, Math.min(8, scalePercent / 100)),
    });
  }, [selectedVisualClip, updateClip]);

  const handleSelectedVisualRotationChange = useCallback((rotationDeg: number) => {
    if (!selectedVisualClip) return;
    updateClip(selectedVisualClip.id, {
      rotation: Math.max(-360, Math.min(360, rotationDeg)),
    });
  }, [selectedVisualClip, updateClip]);

  const handleSelectAllCrop = useCallback(() => {
    setCropArea({
      x: 0,
      y: 0,
      width: project.canvasSize.width,
      height: project.canvasSize.height,
    });
  }, [setCropArea, project.canvasSize.width, project.canvasSize.height]);

  const handleClearCrop = useCallback(() => {
    setCropArea(null);
    setCanvasExpandMode(false);
  }, [setCropArea, setCanvasExpandMode]);

  const getAspectRatioValue = useCallback((ratio: AspectRatio): number | null => {
    return ASPECT_RATIO_VALUES[ratio] ?? null;
  }, []);

  const handleCropWidthChange = useCallback((newWidth: number) => {
    if (!cropArea) return;
    if (lockCropAspect && cropArea.width > 0) {
      const ratio = cropArea.height / cropArea.width;
      setCropArea({ ...cropArea, width: newWidth, height: Math.round(newWidth * ratio) });
    } else {
      setCropArea({ ...cropArea, width: newWidth });
    }
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleCropHeightChange = useCallback((newHeight: number) => {
    if (!cropArea) return;
    if (lockCropAspect && cropArea.height > 0) {
      const ratio = cropArea.width / cropArea.height;
      setCropArea({ ...cropArea, height: newHeight, width: Math.round(newHeight * ratio) });
    } else {
      setCropArea({ ...cropArea, height: newHeight });
    }
  }, [cropArea, lockCropAspect, setCropArea]);

  const handleExpandToSquare = useCallback(() => {
    if (!cropArea) return;
    const maxSide = Math.max(cropArea.width, cropArea.height);
    setCropArea({ ...cropArea, width: maxSide, height: maxSide });
  }, [cropArea, setCropArea]);

  const handleFitToSquare = useCallback(() => {
    if (!cropArea) return;
    const minSide = Math.min(cropArea.width, cropArea.height);
    setCropArea({ ...cropArea, width: minSide, height: minSide });
  }, [cropArea, setCropArea]);

  const handleApplyCrop = useCallback(() => {
    if (!cropArea) return;

    const width = Math.max(1, Math.round(cropArea.width));
    const height = Math.max(1, Math.round(cropArea.height));
    if (width < 2 || height < 2) return;

    const offsetX = Math.round(cropArea.x);
    const offsetY = Math.round(cropArea.y);

    saveToHistory();

    for (const clip of clips) {
      if (clip.type === "audio") continue;
      updateClip(clip.id, {
        position: {
          x: clip.position.x - offsetX,
          y: clip.position.y - offsetY,
        },
      });
    }

    setProject({
      ...project,
      canvasSize: { width, height },
    });

    setCropArea(null);
    setCanvasExpandMode(false);
  }, [cropArea, clips, saveToHistory, updateClip, setProject, project, setCropArea, setCanvasExpandMode]);

  // View menu handlers
  const handleZoomIn = useCallback(() => {
    setZoom(viewState.zoom * 1.25);
  }, [setZoom, viewState.zoom]);

  const handleZoomOut = useCallback(() => {
    setZoom(viewState.zoom / 1.25);
  }, [setZoom, viewState.zoom]);

  const handleFitToScreen = useCallback(() => {
    const timelineRoot = document.querySelector("[data-video-timeline-root]") as HTMLDivElement | null;
    const width = timelineRoot?.clientWidth;
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

  // Preview zoom (synced from PreviewCanvas viewport)
  const [previewZoom, setPreviewZoom] = useState(1);
  useEffect(() => {
    const api = previewViewportRef.current;
    if (!api) return;
    return api.onZoomChange((z) => setPreviewZoom(z));
  }, [previewViewportRef]);

  const handlePreviewZoomIn = useCallback(() => {
    previewViewportRef.current?.zoomIn();
  }, [previewViewportRef]);

  const handlePreviewZoomOut = useCallback(() => {
    previewViewportRef.current?.zoomOut();
  }, [previewViewportRef]);

  const handlePreviewFit = useCallback(() => {
    previewViewportRef.current?.fitToContainer();
  }, [previewViewportRef]);

  // Canvas size adjustment
  const [canvasSizeInput, setCanvasSizeInput] = useState({ w: "", h: "" });
  const [isEditingCanvasSize, setIsEditingCanvasSize] = useState(false);

  const handleCanvasSizeSubmit = useCallback(() => {
    const w = parseInt(canvasSizeInput.w, 10);
    const h = parseInt(canvasSizeInput.h, 10);
    if (w > 0 && h > 0 && w <= 7680 && h <= 7680) {
      setProject({ ...project, canvasSize: { width: w, height: h } });
    }
    setIsEditingCanvasSize(false);
  }, [canvasSizeInput, setProject, project]);

  const handleToggleTimeline = useCallback(() => {
    const timelineWindow = layoutState.floatingWindows.find((window) => window.panelId === "timeline");
    if (timelineWindow) {
      closeFloatingWindow(timelineWindow.id);
      return;
    }

    const timelinePanelNodeId = findPanelNodeIdByPanelId(layoutState.root, "timeline");
    if (timelinePanelNodeId) {
      removePanel(timelinePanelNodeId);
      return;
    }

    const previewPanelNodeId = findPanelNodeIdByPanelId(layoutState.root, "preview");
    if (previewPanelNodeId) {
      addPanel(previewPanelNodeId, "timeline", "bottom");
      return;
    }

    openFloatingWindow("timeline", { x: 140, y: 140 });
  }, [layoutState, closeFloatingWindow, removePanel, addPanel, openFloatingWindow]);

  // Handle mask tool toggle
  const handleToolModeChange = useCallback((mode: typeof toolMode) => {
    if (mode === "mask" && selectedClipIds.length > 0) {
      const selectedClip = clips.find((c) => c.id === selectedClipIds[0]);
      if (selectedClip && selectedClip.type !== "audio") {
        startMaskEdit(selectedClip.trackId, project.canvasSize, playback.currentTime);
      }
    }
    if (mode !== "mask" && isEditingMask) {
      endMaskEdit();
    }
    if (mode === "crop" && !cropArea) {
      setCropArea({
        x: 0,
        y: 0,
        width: project.canvasSize.width,
        height: project.canvasSize.height,
      });
    }
    setToolMode(mode);
  }, [selectedClipIds, clips, startMaskEdit, setToolMode, cropArea, setCropArea, project.canvasSize, playback.currentTime, isEditingMask, endMaskEdit]);

  // Auto-start mask edit when clip is selected while already in mask mode
  // Skip during initial restoration to prevent creating new masks before masks are loaded
  useEffect(() => {
    if (!postRestorationRef.current) return;
    if (toolMode !== "mask") return;
    if (selectedClipIds.length === 0) return;
    if (isEditingMask) return; // already editing

    const selectedClip = clips.find((c) => c.id === selectedClipIds[0]);
    if (selectedClip && selectedClip.type !== "audio") {
      startMaskEdit(selectedClip.trackId, project.canvasSize, playback.currentTime);
    }
  }, [toolMode, selectedClipIds, clips, isEditingMask, startMaskEdit, project.canvasSize, playback.currentTime]);


  // Keyboard shortcuts
  useVideoKeyboardShortcuts({
    togglePlay,
    stepForward,
    stepBackward,
    onToolModeChange: handleToolModeChange,
    toolMode,
    handleUndo,
    handleRedo,
    handleSave,
    handleOpen,
    handleCopy,
    handleCut,
    handlePaste,
    handleDelete,
    handleDuplicate,
    handleZoomIn,
    handleZoomOut,
    handleFitToScreen,
    handleApplyCrop,
    activeMaskId,
    deselectMask,
    isEditingMask,
    endMaskEdit,
  });

  const menuTranslations = {
    file: t.file,
    edit: t.edit,
    view: t.view,
    new: t.new,
    load: t.load,
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
    trim: t.trim,
    trimDesc: t.trimDesc,
    razor: t.razor,
    razorDesc: t.razorDesc,
    crop: t.crop,
    cropDesc: t.cropToolTip || "Crop and expand canvas",
    mask: t.mask,
    maskDesc: t.maskDesc,
  };

  const supportedToolModes: VideoToolMode[] = ["select", "trim", "razor", "crop", "mask"];

  return (
    <div
      className="h-full bg-background text-text-primary flex flex-col overflow-hidden relative"
    >
      {/* Loading overlay during autosave restore */}
      <LoadingOverlay isLoading={!isAutosaveInitialized} message={t.loading || "Loading..."} />

      {/* Save toast notification (for non-cloud saves without progress indicator) */}
      {!saveProgress && (
        <SaveToast
          isSaving={isSaving}
          saveCount={saveCount}
          savingLabel={t.saving || "Saving…"}
          savedLabel={t.saved || "Saved"}
        />
      )}

      {/* Header Slot - Menu Bar + Project Info */}
      <HeaderContent
        title={t.videoEditor}
        menuBar={
          <VideoMenuBar
            onNew={handleNew}
            onLoad={handleOpen}
            onSave={handleSave}
            onSaveAs={handleSaveAs}
            onImportMedia={handleImportMedia}
            onExport={() => setShowExportModal(true)}
            canSave={hasContent}
            isSaving={isSaving}
            isLoading={isExporting}
            onUndo={handleUndo}
            onRedo={handleRedo}
            canUndo={canUndo}
            canRedo={canRedo}
            onCut={handleCut}
            onCopy={handleCopy}
            onPaste={handlePaste}
            onDelete={handleDelete}
            hasSelection={selectedClipIds.length > 0 || selectedMaskIds.length > 0}
            hasClipboard={hasClipboard}
            onZoomIn={handleZoomIn}
            onZoomOut={handleZoomOut}
            onFitToScreen={handleFitToScreen}
            onToggleTimeline={handleToggleTimeline}
            showTimeline={isTimelineVisible}
            translations={menuTranslations}
          />
        }
        projectName={{
          value: projectName,
          onChange: setProjectName,
          placeholder: t.projectName,
        }}
        info={
          <span className="text-xs text-text-tertiary whitespace-nowrap ml-1">
            ({project.canvasSize.width}x{project.canvasSize.height})
          </span>
        }
      />

      {/* Toolbar */}
      <div className="flex items-center gap-4 px-3 py-1.5 bg-surface-secondary border-b border-border-default overflow-x-auto">
        <VideoToolbar
          toolMode={toolMode}
          onToolModeChange={handleToolModeChange}
          onDelete={handleDelete}
          hasSelection={selectedClipIds.length > 0 || selectedMaskIds.length > 0 || !!activeMaskId}
          translations={toolbarTranslations}
        />

        {toolMode === "crop" && (
          <div className="flex items-center gap-2">
            {/* Aspect ratio selector */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">Ratio:</span>
              <Select
                value={cropAspectRatio}
                onChange={(value) => setCropAspectRatio(value as AspectRatio)}
                options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
                size="sm"
              />
            </div>

            {/* Width/Height input */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">W:</span>
              <input
                type="number"
                value={cropArea?.width ? Math.round(cropArea.width) : ""}
                onChange={(e) => handleCropWidthChange(Math.max(10, parseInt(e.target.value) || 10))}
                placeholder="---"
                className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
                min={10}
              />
              <span className="text-xs text-text-tertiary">x</span>
              <span className="text-xs text-text-secondary">H:</span>
              <input
                type="number"
                value={cropArea?.height ? Math.round(cropArea.height) : ""}
                onChange={(e) => handleCropHeightChange(Math.max(10, parseInt(e.target.value) || 10))}
                placeholder="---"
                className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
                min={10}
              />
              {/* Lock aspect ratio button */}
              <button
                onClick={() => setLockCropAspect(!lockCropAspect)}
                className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                  lockCropAspect
                    ? "bg-accent-primary text-white"
                    : "hover:bg-interactive-hover text-text-secondary"
                }`}
                title={lockCropAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
              >
                {lockCropAspect ? <LockAspectIcon /> : <UnlockAspectIcon />}
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-border-default" />

            {/* Square buttons */}
            <div className="flex items-center gap-1">
              <button
                onClick={handleExpandToSquare}
                className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
                title="Expand to square (longer side)"
              >
                <SquareExpandIcon />
                <span>Expand</span>
              </button>
              <button
                onClick={handleFitToSquare}
                className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
                title="Fit to square (shorter side)"
              >
                <SquareFitIcon />
                <span>Fit</span>
              </button>
            </div>

            {/* Divider */}
            <div className="w-px h-4 bg-border-default" />

            {/* Canvas expand mode toggle */}
            <button
              onClick={() => setCanvasExpandMode(!canvasExpandMode)}
              className={`px-1.5 py-0.5 text-xs rounded transition-colors flex items-center gap-0.5 ${
                canvasExpandMode
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
              title={canvasExpandMode ? "Canvas expand mode ON" : "Canvas expand mode OFF"}
            >
              <CanvasExpandIcon />
              <span>Canvas</span>
            </button>

            {/* Divider */}
            <div className="w-px h-4 bg-border-default" />

            {/* All, Apply, Clear buttons */}
            <button
              onClick={handleSelectAllCrop}
              className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
            >
              All
            </button>
            {cropArea && (
              <>
                <button
                  onClick={handleApplyCrop}
                  className="px-1.5 py-0.5 text-xs bg-accent-primary text-white hover:bg-accent-primary/90 rounded transition-colors font-medium"
                  title="Apply crop/resize to canvas"
                >
                  Apply
                </button>
                <button
                  onClick={handleClearCrop}
                  className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
                >
                  Clear
                </button>
              </>
            )}
          </div>
        )}

        {selectedVisualClip && toolMode !== "crop" && (
          <>
            <div className="h-4 w-px bg-border-default mx-1" />
            <div className="flex items-center gap-2 min-w-[250px]">
              <span className="text-xs text-text-secondary">Scale</span>
              <input
                type="range"
                min={5}
                max={400}
                value={Math.round((selectedVisualClip.scale || 1) * 100)}
                onMouseDown={beginVisualAdjustment}
                onTouchStart={beginVisualAdjustment}
                onMouseUp={endVisualAdjustment}
                onTouchEnd={endVisualAdjustment}
                onChange={(e) => handleSelectedVisualScaleChange(Number(e.target.value))}
                className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
              />
              <span className="text-xs text-text-secondary w-10 text-right">
                {Math.round((selectedVisualClip.scale || 1) * 100)}%
              </span>
            </div>
            <div className="flex items-center gap-1 min-w-[132px]">
              <span className="text-xs text-text-secondary">Rotate</span>
              <input
                type="number"
                value={Math.round(selectedVisualClip.rotation || 0)}
                onFocus={beginVisualAdjustment}
                onBlur={endVisualAdjustment}
                onChange={(e) => handleSelectedVisualRotationChange(Number(e.target.value))}
                className="w-16 px-2 py-1 rounded bg-surface-tertiary border border-border-default text-xs text-text-primary focus:outline-none focus:border-accent-primary"
              />
              <span className="text-xs text-text-tertiary">deg</span>
            </div>
          </>
        )}

        {selectedAudioClip && (
          <>
            <div className="h-4 w-px bg-border-default mx-1" />
            <div className="flex items-center gap-2 min-w-[220px]">
              <button
                onClick={handleToggleSelectedClipMute}
                className="p-1.5 rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
                title={(selectedAudioClip.audioMuted ?? false) ? "Unmute clip audio" : "Mute clip audio"}
              >
                <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                  {(selectedAudioClip.audioMuted ?? false) ? (
                    <path d="M2 6h3l3-3v10l-3-3H2V6zm9.5-1L14 11.5l-1 1L10.5 6l1-1zm-1 6L13 8.5l1 1-2.5 2.5-1-1z" />
                  ) : (
                    <path d="M2 6h3l3-3v10l-3-3H2V6zm8.5 2a3.5 3.5 0 00-1.2-2.6l.9-.9A4.8 4.8 0 0111.8 8a4.8 4.8 0 01-1.6 3.5l-.9-.9A3.5 3.5 0 0010.5 8zm2.1 0c0-1.8-.7-3.4-1.9-4.6l.9-.9A7.1 7.1 0 0114.3 8a7.1 7.1 0 01-2.7 5.5l-.9-.9A5.8 5.8 0 0012.6 8z" />
                  )}
                </svg>
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

        {/* Spacer */}
        <div className="flex-1 min-w-0" />

        {/* Canvas size */}
        <div className="flex items-center gap-1 shrink-0">
          {isEditingCanvasSize ? (
            <form
              className="flex items-center gap-0.5"
              onSubmit={(e) => { e.preventDefault(); handleCanvasSizeSubmit(); }}
            >
              <input
                type="number"
                defaultValue={project.canvasSize.width}
                onChange={(e) => setCanvasSizeInput((p) => ({ ...p, w: e.target.value }))}
                onFocus={(e) => e.target.select()}
                autoFocus
                className="w-14 px-1 py-0.5 rounded bg-surface-tertiary border border-border-default text-xs text-text-primary text-center focus:outline-none focus:border-accent-primary"
                min={1}
                max={7680}
              />
              <span className="text-xs text-text-quaternary">x</span>
              <input
                type="number"
                defaultValue={project.canvasSize.height}
                onChange={(e) => setCanvasSizeInput((p) => ({ ...p, h: e.target.value }))}
                onFocus={(e) => e.target.select()}
                className="w-14 px-1 py-0.5 rounded bg-surface-tertiary border border-border-default text-xs text-text-primary text-center focus:outline-none focus:border-accent-primary"
                min={1}
                max={7680}
              />
              <button type="submit" className="px-1.5 py-0.5 text-[10px] rounded bg-accent-primary text-white hover:bg-accent-hover transition-colors">
                OK
              </button>
              <button type="button" onClick={() => setIsEditingCanvasSize(false)} className="px-1.5 py-0.5 text-[10px] rounded bg-surface-tertiary text-text-secondary hover:bg-interactive-hover transition-colors">
                Cancel
              </button>
            </form>
          ) : (
            <button
              onClick={() => {
                setCanvasSizeInput({ w: String(project.canvasSize.width), h: String(project.canvasSize.height) });
                setIsEditingCanvasSize(true);
              }}
              className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
              title="Change canvas size"
            >
              {project.canvasSize.width}x{project.canvasSize.height}
            </button>
          )}
        </div>

        <div className="h-4 w-px bg-border-default" />

        {/* Preview zoom controls */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={handlePreviewZoomOut}
            className="p-1 hover:bg-interactive-hover rounded transition-colors text-text-secondary hover:text-text-primary"
            title="Zoom out preview"
          >
            <ZoomOutIcon className="w-4 h-4" />
          </button>
          <button
            onClick={handlePreviewFit}
            className="px-1 py-0.5 text-xs text-text-secondary hover:text-text-primary hover:bg-interactive-hover rounded transition-colors min-w-[40px] text-center"
            title="Fit to screen"
          >
            {Math.round(previewZoom * 100)}%
          </button>
          <button
            onClick={handlePreviewZoomIn}
            className="p-1 hover:bg-interactive-hover rounded transition-colors text-text-secondary hover:text-text-primary"
            title="Zoom in preview"
          >
            <ZoomInIcon className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Main Content (shared docking/split system) */}
      <div className="flex-1 h-full w-full min-h-0 flex overflow-hidden relative">
        <VideoDockableArea />
      </div>

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

      {/* Save progress indicator */}
      {isSaving && saveProgress && (
        <div className="fixed bottom-4 right-4 z-50 bg-surface-primary border border-border-default rounded-lg shadow-lg p-3 min-w-[200px]">
          <div className="flex items-center gap-2 text-sm text-text-secondary mb-1">
            <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span>Saving ({saveProgress.current}/{saveProgress.total})</span>
          </div>
          <div className="text-xs text-text-tertiary truncate">{saveProgress.clipName}</div>
          <div className="mt-1 w-full h-1 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className="h-full bg-accent-primary rounded-full transition-all"
              style={{ width: `${(saveProgress.current / saveProgress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Video Project List Modal */}
      <VideoProjectListModal
        isOpen={isProjectListOpen}
        onClose={() => setIsProjectListOpen(false)}
        projects={savedProjects}
        currentProjectId={currentProjectId}
        onLoadProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
        storageInfo={storageInfo}
        isLoading={isLoadingProject}
        loadProgress={loadProgress}
        translations={{
          savedProjects: t.savedProjects || "Saved Projects",
          noSavedProjects: t.noSavedProjects || "No saved projects",
          delete: t.delete,
          loading: t.loading || "Loading",
        }}
      />

      {/* Export modal */}
      <VideoExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={handleExport}
        defaultFileName={sanitizeFileName(projectName)}
        isExporting={isExporting}
        translations={{
          export: t.exportVideo,
          cancel: t.cancel,
          fileName: t.projectName,
          includeAudio: t.includeAudio,
        }}
      />
    </div>
  );
}

function VideoEditorWithMask() {
  return (
    <MaskProvider>
      <VideoLayoutProvider>
        <VideoEditorContent />
      </VideoLayoutProvider>
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
