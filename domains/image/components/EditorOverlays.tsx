"use client";

import { ChangeEventHandler, RefObject } from "react";
import { SyncDialog } from "@/shared/components/app/auth";
import { CropArea, OutputFormat, SavedImageProject } from "../types";
import type {
  BackgroundRemovalModel,
  BackgroundRemovalQuality,
} from "@/shared/ai/backgroundRemoval";
import { BackgroundRemovalModals } from "./BackgroundRemovalModals";
import { EditorStatusBar } from "./toolbars/EditorStatusBar";
import { ExportModal } from "./ExportModal";
import { ImageResampleModal } from "./ImageResampleModal";
import ProjectListModal from "./ProjectListModal";
import { TransformDiscardConfirmModal } from "./TransformDiscardConfirmModal";
import { SaveProjectModal, type SaveProjectModalTranslations, type SaveProjectModalValue } from "@/shared/components";

export interface EditorOverlaysProps {
  // Export modal
  showExportModal: boolean;
  setShowExportModal: (show: boolean) => void;
  handleExportFromModal: (
    fileName: string,
    format: OutputFormat,
    quality: number,
    backgroundColor: string | null,
    mode: "single" | "layers"
  ) => void;
  exportMode: "single" | "layers";
  projectName: string;
  exportTranslations: {
    export: string;
    cancel: string;
    fileName: string;
    format: string;
    quality: string;
    backgroundColor: string;
    transparent: string;
  };

  // Background removal
  showBgRemovalConfirm: boolean;
  setShowBgRemovalConfirm: (show: boolean) => void;
  handleRemoveBackground: () => void;
  hasSelection: boolean;
  bgRemovalQuality: BackgroundRemovalQuality;
  setBgRemovalQuality: (quality: BackgroundRemovalQuality) => void;
  bgRemovalModel: BackgroundRemovalModel;
  setBgRemovalModel: (model: BackgroundRemovalModel) => void;
  isRemovingBackground: boolean;
  bgRemovalProgress: number;
  bgRemovalStatus: string;
  backgroundRemovalTranslations: {
    removeBackground: string;
    cancel: string;
    confirm: string;
  };

  // Resample
  showResampleModal: boolean;
  closeResampleModal: () => void;
  applyResample: () => void;
  resampleWidth: number;
  resampleHeight: number;
  setResampleWidth: (width: number) => void;
  setResampleHeight: (height: number) => void;
  resampleKeepAspect: boolean;
  toggleResampleKeepAspect: () => void;
  isResampling: boolean;
  resampleTranslations: {
    title: string;
    width: string;
    height: string;
    keepAspect: string;
    cancel: string;
    apply: string;
    applying: string;
  };

  // Transform discard
  showTransformDiscardConfirm: boolean;
  handleTransformDiscardCancel: () => void;
  handleTransformDiscardConfirm: () => void;
  handleTransformApplyAndSwitch: () => void;
  transformDiscardTranslations: {
    title: string;
    message: string;
    discard: string;
    apply: string;
    cancel: string;
  };

  // Status bar
  showStatusBar: boolean;
  canvasSize: { width: number; height: number };
  rotation: number;
  zoom: number;
  cropArea: CropArea | null;
  selection: CropArea | null;

  // Hidden file input
  fileInputRef: RefObject<HTMLInputElement | null>;
  handleFileSelect: ChangeEventHandler<HTMLInputElement>;

  // Save modal
  isSaveModalOpen: boolean;
  saveModalInitialName: string;
  saveModalInitialProjectGroup: string;
  saveModalProjectGroups: string[];
  closeSaveModal: () => void;
  submitSaveModal: (value: SaveProjectModalValue) => void;
  isSavingProject: boolean;
  saveModalTranslations: SaveProjectModalTranslations;

  // Project list
  isProjectListOpen: boolean;
  setIsProjectListOpen: (open: boolean) => void;
  savedProjects: SavedImageProject[];
  currentProjectId: string | null;
  handleLoadProject: (projectMeta: SavedImageProject) => Promise<void>;
  handleDeleteProject: (id: string) => Promise<void>;
  storageInfo: { used: number; quota: number; percentage: number };
  isLoading: boolean;
  projectListTranslations: {
    savedProjects: string;
    noSavedProjects: string;
    delete: string;
    loading: string;
    project?: string;
    allProjects?: string;
    defaultProject?: string;
  };

  // Sync dialog
  showSyncDialog: boolean;
  localProjectCount: number;
  cloudProjectCount: number;
  handleKeepCloud: () => Promise<void>;
  handleKeepLocal: () => Promise<void>;
  handleCancelSync: () => void;
}

export function EditorOverlays({
  showExportModal,
  setShowExportModal,
  handleExportFromModal,
  exportMode,
  projectName,
  exportTranslations,
  showBgRemovalConfirm,
  setShowBgRemovalConfirm,
  handleRemoveBackground,
  hasSelection,
  bgRemovalQuality,
  setBgRemovalQuality,
  bgRemovalModel,
  setBgRemovalModel,
  isRemovingBackground,
  bgRemovalProgress,
  bgRemovalStatus,
  backgroundRemovalTranslations,
  showResampleModal,
  closeResampleModal,
  applyResample,
  resampleWidth,
  resampleHeight,
  setResampleWidth,
  setResampleHeight,
  resampleKeepAspect,
  toggleResampleKeepAspect,
  isResampling,
  resampleTranslations,
  showTransformDiscardConfirm,
  handleTransformDiscardCancel,
  handleTransformDiscardConfirm,
  handleTransformApplyAndSwitch,
  transformDiscardTranslations,
  showStatusBar,
  canvasSize,
  rotation,
  zoom,
  cropArea,
  selection,
  fileInputRef,
  handleFileSelect,
  isSaveModalOpen,
  saveModalInitialName,
  saveModalInitialProjectGroup,
  saveModalProjectGroups,
  closeSaveModal,
  submitSaveModal,
  isSavingProject,
  saveModalTranslations,
  isProjectListOpen,
  setIsProjectListOpen,
  savedProjects,
  currentProjectId,
  handleLoadProject,
  handleDeleteProject,
  storageInfo,
  isLoading,
  projectListTranslations,
  showSyncDialog,
  localProjectCount,
  cloudProjectCount,
  handleKeepCloud,
  handleKeepLocal,
  handleCancelSync,
}: EditorOverlaysProps) {
  return (
    <>
      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        onExport={(fileName, format, quality, backgroundColor) =>
          handleExportFromModal(fileName, format, quality, backgroundColor, exportMode)
        }
        defaultFileName={projectName || "Untitled"}
        mode={exportMode}
        translations={exportTranslations}
      />

      <BackgroundRemovalModals
        showConfirm={showBgRemovalConfirm}
        onCloseConfirm={() => setShowBgRemovalConfirm(false)}
        onConfirm={() => {
          setShowBgRemovalConfirm(false);
          handleRemoveBackground();
        }}
        hasSelection={hasSelection}
        quality={bgRemovalQuality}
        onQualityChange={setBgRemovalQuality}
        model={bgRemovalModel}
        onModelChange={setBgRemovalModel}
        isRemoving={isRemovingBackground}
        progress={bgRemovalProgress}
        status={bgRemovalStatus}
        translations={backgroundRemovalTranslations}
      />

      <ImageResampleModal
        isOpen={showResampleModal}
        isResampling={isResampling}
        width={resampleWidth}
        height={resampleHeight}
        keepAspect={resampleKeepAspect}
        onWidthChange={setResampleWidth}
        onHeightChange={setResampleHeight}
        onToggleKeepAspect={toggleResampleKeepAspect}
        onClose={closeResampleModal}
        onApply={applyResample}
        translations={resampleTranslations}
      />

      <TransformDiscardConfirmModal
        show={showTransformDiscardConfirm}
        onClose={handleTransformDiscardCancel}
        onDiscard={handleTransformDiscardConfirm}
        onApply={handleTransformApplyAndSwitch}
        translations={transformDiscardTranslations}
      />

      {showStatusBar && (
        <EditorStatusBar
          canvasSize={canvasSize}
          rotation={rotation}
          zoom={zoom}
          cropArea={cropArea}
          selection={selection}
        />
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      <SaveProjectModal
        isOpen={isSaveModalOpen}
        initialName={saveModalInitialName}
        initialProjectGroup={saveModalInitialProjectGroup}
        existingProjectGroups={saveModalProjectGroups}
        isSaving={isSavingProject}
        onClose={closeSaveModal}
        onSave={submitSaveModal}
        translations={saveModalTranslations}
      />

      <ProjectListModal
        isOpen={isProjectListOpen}
        onClose={() => setIsProjectListOpen(false)}
        projects={savedProjects}
        currentProjectId={currentProjectId}
        onLoadProject={handleLoadProject}
        onDeleteProject={handleDeleteProject}
        storageInfo={storageInfo}
        isLoading={isLoading}
        translations={projectListTranslations}
      />

      <SyncDialog
        isOpen={showSyncDialog}
        localCount={localProjectCount}
        cloudCount={cloudProjectCount}
        onKeepCloud={handleKeepCloud}
        onKeepLocal={handleKeepLocal}
        onCancel={handleCancelSync}
      />
    </>
  );
}
