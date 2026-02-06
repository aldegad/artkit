"use client";

import { useCallback, useRef } from "react";
import { useLanguage, HeaderSlot } from "../../shared/contexts";
import {
  VideoStateProvider,
  VideoRefsProvider,
  TimelineProvider,
  MaskProvider,
  useVideoState,
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
} from "../../domains/video";
import Tooltip from "../../shared/components/Tooltip";

function VideoEditorContent() {
  const { t } = useLanguage();
  const {
    project,
    projectName,
    toolMode,
    setToolMode,
    selectedClipIds,
    selectClips,
    deselectAll,
    togglePlay,
    stop,
    stepForward,
    stepBackward,
    playback,
    clipboardRef,
    hasClipboard,
    setHasClipboard,
  } = useVideoState();
  const { clips, removeClip, addClips } = useTimeline();
  const { isEditingMask, startMaskEdit } = useMask();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasContent = clips.length > 0;

  // Menu handlers
  const handleNew = useCallback(async () => {
    if (window.confirm(t.newProjectConfirm)) {
      await clearVideoAutosave();
      window.location.reload();
    }
  }, [t]);

  const handleOpen = useCallback(() => {
    // TODO: implement project open
    console.log("Open project");
  }, []);

  const handleSave = useCallback(() => {
    // TODO: implement project save
    console.log("Save project");
  }, []);

  const handleSaveAs = useCallback(() => {
    // TODO: implement save as
    console.log("Save as");
  }, []);

  const handleImportMedia = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleExport = useCallback(() => {
    // TODO: implement video export
    console.log("Export video");
  }, []);

  // Edit menu handlers
  const handleUndo = useCallback(() => {
    // TODO: implement undo
    console.log("Undo");
  }, []);

  const handleRedo = useCallback(() => {
    // TODO: implement redo
    console.log("Redo");
  }, []);

  const handleCopy = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    const selectedClips = clips.filter((c) => selectedClipIds.includes(c.id));
    if (selectedClips.length === 0) return;

    clipboardRef.current = {
      clips: selectedClips.map((c) => ({ ...c })),
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
      clips: selectedClips.map((c) => ({ ...c })),
      mode: "cut",
      sourceTime: playback.currentTime,
    };
    setHasClipboard(true);

    selectedClipIds.forEach((id) => removeClip(id));
    deselectAll();
  }, [selectedClipIds, clips, playback.currentTime, clipboardRef, setHasClipboard, removeClip, deselectAll]);

  const handlePaste = useCallback(() => {
    const clipboard = clipboardRef.current;
    if (!clipboard || clipboard.clips.length === 0) return;

    const currentTime = playback.currentTime;
    const earliestStart = Math.min(...clipboard.clips.map((c) => c.startTime));
    const timeOffset = currentTime - earliestStart;

    const newClips = clipboard.clips.map((clipData) => ({
      ...clipData,
      id: crypto.randomUUID(),
      startTime: Math.max(0, clipData.startTime + timeOffset),
    }));

    addClips(newClips);
    selectClips(newClips.map((c) => c.id));

    if (clipboard.mode === "cut") {
      clipboardRef.current = null;
      setHasClipboard(false);
    }
  }, [playback.currentTime, clipboardRef, setHasClipboard, addClips, selectClips]);

  const handleDelete = useCallback(() => {
    if (selectedClipIds.length === 0) return;
    selectedClipIds.forEach((id) => removeClip(id));
    deselectAll();
  }, [selectedClipIds, removeClip, deselectAll]);

  // View menu handlers
  const handleZoomIn = useCallback(() => {
    // TODO: implement zoom in
    console.log("Zoom in");
  }, []);

  const handleZoomOut = useCallback(() => {
    // TODO: implement zoom out
    console.log("Zoom out");
  }, []);

  const handleFitToScreen = useCallback(() => {
    // TODO: implement fit to screen
    console.log("Fit to screen");
  }, []);

  const handleToggleTimeline = useCallback(() => {
    // TODO: implement timeline toggle
    console.log("Toggle timeline");
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
    if (e.target instanceof HTMLInputElement) return;

    const isCmd = e.metaKey || e.ctrlKey;

    switch (e.key.toLowerCase()) {
      case " ":
        e.preventDefault();
        togglePlay();
        break;
      case "v":
        if (isCmd) {
          e.preventDefault();
          handlePaste();
        } else {
          setToolMode("select");
        }
        break;
      case "c":
        if (isCmd) {
          e.preventDefault();
          handleCopy();
        } else {
          setToolMode("razor");
        }
        break;
      case "x":
        if (isCmd) {
          e.preventDefault();
          handleCut();
        }
        break;
      case "t":
        if (!isCmd) setToolMode("trim");
        break;
      case "m":
        if (!isCmd) handleToolModeChange("mask");
        break;
      case "arrowleft":
        stepBackward();
        break;
      case "arrowright":
        stepForward();
        break;
      case "delete":
      case "backspace":
        e.preventDefault();
        handleDelete();
        break;
    }
  }, [togglePlay, setToolMode, handleToolModeChange, stepBackward, stepForward, handleCopy, handleCut, handlePaste, handleDelete]);

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
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={false}
          canRedo={false}
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
          showTimeline={true}
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
        <div className="h-64 border-t border-border shrink-0">
          <Timeline className="h-full" />
        </div>
      </div>

      {/* Hidden file input for import */}
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*,image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          // TODO: handle file import
          console.log("Files selected:", e.target.files);
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
