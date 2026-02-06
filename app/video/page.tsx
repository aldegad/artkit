"use client";

import { useCallback, useRef, useState } from "react";
import { useLanguage, HeaderSlot } from "../../shared/contexts";
import { downloadBlob, downloadJson } from "../../shared/utils";
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
  TIMELINE,
  type Clip,
  type SavedVideoProject,
  type TimelineViewState,
  type VideoTrack,
} from "../../domains/video";
import Tooltip from "../../shared/components/Tooltip";

interface VideoProjectFile extends Partial<SavedVideoProject> {
  tracks?: VideoTrack[];
  clips?: Clip[];
  timelineView?: TimelineViewState;
  currentTime?: number;
  toolMode?: string;
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
  const { previewCanvasRef } = useVideoRefs();
  const {
    tracks,
    clips,
    viewState,
    setZoom,
    setScrollX,
    setViewState,
    addTrack,
    addVideoClip,
    addImageClip,
    removeClip,
    addClips,
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

  const [isTimelineVisible, setIsTimelineVisible] = useState(true);
  const [isExporting, setIsExporting] = useState(false);

  const hasContent = clips.length > 0;

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

      const targetTrackId = tracks[0]?.id || addTrack("Video 1");
      let insertTime = playback.currentTime;
      let importedCount = 0;

      for (const file of files) {
        const isVideo =
          file.type.startsWith("video/") ||
          SUPPORTED_VIDEO_FORMATS.some((format) => file.type === format);
        const isImage =
          file.type.startsWith("image/") ||
          SUPPORTED_IMAGE_FORMATS.some((format) => file.type === format);

        if (!isVideo && !isImage) {
          continue;
        }

        if (isVideo) {
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

          if (clips.length === 0 && importedCount === 0) {
            setProject({
              ...project,
              canvasSize: metadata.size,
            });
          }

          const clipId = addVideoClip(targetTrackId, url, metadata.duration, metadata.size, Math.max(0, insertTime));
          try {
            await saveMediaBlob(clipId, file);
          } catch (error) {
            console.error("Failed to save media blob:", error);
          }

          insertTime += metadata.duration;
          importedCount += 1;
          continue;
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

        if (clips.length === 0 && importedCount === 0) {
          setProject({
            ...project,
            canvasSize: size,
          });
        }

        const clipId = addImageClip(targetTrackId, url, size, Math.max(0, insertTime), 5);
        try {
          await saveMediaBlob(clipId, file);
        } catch (error) {
          console.error("Failed to save media blob:", error);
        }

        insertTime += 5;
        importedCount += 1;
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

    const stream = canvas.captureStream(frameRate);
    const chunks: BlobPart[] = [];

    try {
      setIsExporting(true);

      const recorder = selectedMimeType
        ? new MediaRecorder(stream, { mimeType: selectedMimeType })
        : new MediaRecorder(stream);

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
      stream.getTracks().forEach((track) => track.stop());
      setIsExporting(false);
    }
  }, [isExporting, previewCanvasRef, project.duration, project.frameRate, playback.currentTime, playback.isPlaying, stop, seek, play, projectName, t.exportFailed]);

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
    if (mode === "mask" && selectedClipIds.length > 0) {
      const selectedClip = clips.find((c) => c.id === selectedClipIds[0]);
      if (selectedClip) {
        startMaskEdit(selectedClip.id, selectedClip.sourceSize);
      }
    }
    setToolMode(mode);
  }, [selectedClipIds, clips, startMaskEdit, setToolMode]);

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
    trim: t.trim,
    trimDesc: t.trimDesc,
    razor: t.razor,
    razorDesc: t.razorDesc,
    mask: t.mask,
    maskDesc: t.maskDesc,
  };

  return (
    <div
      className="h-full bg-background text-text-primary flex flex-col overflow-hidden"
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
          onExport={handleExport}
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
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <rect x="3" y="3" width="10" height="10" />
              </svg>
            </button>
          </Tooltip>

          <Tooltip content={t.previousFrame} shortcut="←">
            <button
              onClick={stepBackward}
              className="p-1.5 rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <rect x="2" y="3" width="2" height="10" />
                <path d="M14 3L6 8L14 13V3Z" />
              </svg>
            </button>
          </Tooltip>

          <Tooltip content={t.play} shortcut="Space">
            <button
              onClick={togglePlay}
              className="p-1.5 rounded bg-accent hover:bg-accent-hover text-white transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M4 2L14 8L4 14V2Z" />
              </svg>
            </button>
          </Tooltip>

          <Tooltip content={t.nextFrame} shortcut="→">
            <button
              onClick={stepForward}
              className="p-1.5 rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor">
                <path d="M2 3L10 8L2 13V3Z" />
                <rect x="12" y="3" width="2" height="10" />
              </svg>
            </button>
          </Tooltip>
        </div>
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
          <div ref={timelineAreaRef} className="h-64 border-t border-border shrink-0">
            <Timeline className="h-full" />
          </div>
        )}
      </div>

      {/* Hidden file input for media import */}
      <input
        ref={mediaFileInputRef}
        type="file"
        accept={[...SUPPORTED_VIDEO_FORMATS, ...SUPPORTED_IMAGE_FORMATS].join(",")}
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
            const loadedDuration = calculateProjectDuration(loadedClips);

            setProjectName(loadedName);
            setProject({
              ...loadedProject,
              name: loadedName,
              tracks: loadedTracks,
              clips: loadedClips,
              duration: loadedDuration,
            });
            restoreTracks(loadedTracks);
            restoreClips(loadedClips);

            if (parsed.timelineView) {
              setViewState(parsed.timelineView);
            }
            if (typeof parsed.currentTime === "number") {
              seek(parsed.currentTime);
            } else {
              seek(0);
            }

            if (parsed.toolMode === "select" || parsed.toolMode === "trim" || parsed.toolMode === "razor" || parsed.toolMode === "mask" || parsed.toolMode === "move" || parsed.toolMode === "pan") {
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
