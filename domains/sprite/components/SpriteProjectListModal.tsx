"use client";

import { Modal, Scrollbar } from "@/shared/components";
import { formatBytes } from "@/shared/utils/storage";
import { DeleteIcon } from "@/shared/components/icons";
import type { SpriteSaveLoadProgress } from "@/shared/lib/firebase/firebaseSpriteStorage";
import type { SavedSpriteProject } from "../types";

// ============================================
// Types
// ============================================

interface StorageInfo {
  used: number;
  quota: number;
  percentage: number;
}

interface SpriteProjectListModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: SavedSpriteProject[];
  currentProjectId: string | null;
  onLoadProject: (project: SavedSpriteProject) => void;
  onDeleteProject: (projectId: string) => void;
  storageInfo: StorageInfo;
  isLoading?: boolean;
  loadProgress?: SpriteSaveLoadProgress | null;
  translations: {
    savedProjects: string;
    noSavedProjects: string;
    storage: string;
    load: string;
    delete: string;
    frames: string;
    loading?: string;
  };
}

// ============================================
// Component
// ============================================

export default function SpriteProjectListModal({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onLoadProject,
  onDeleteProject,
  storageInfo,
  isLoading,
  loadProgress,
  translations: t,
}: SpriteProjectListModalProps) {
  const titleContent = (
    <div className="flex items-center gap-3">
      <h2 className="font-semibold">{t.savedProjects}</h2>
      {storageInfo.quota > 0 && (
        <div className="flex items-center gap-2 text-xs text-text-tertiary">
          <span>
            {formatBytes(storageInfo.used)} / {formatBytes(storageInfo.quota)}
          </span>
          <div className="w-16 h-1.5 bg-surface-tertiary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                storageInfo.percentage > 80
                  ? "bg-accent-danger"
                  : "bg-accent-primary"
              }`}
              style={{
                width: `${Math.min(storageInfo.percentage, 100)}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={titleContent}
      width="500px"
      maxHeight="80vh"
      contentClassName="flex-1 flex flex-col min-h-0"
    >
      {/* Loading overlay */}
      {isLoading && (
        <div className="px-4 py-2 border-b border-border-default bg-surface-secondary">
          <div className="flex items-center gap-2 text-sm text-text-secondary">
            <div className="w-4 h-4 border-2 border-accent-primary border-t-transparent rounded-full animate-spin" />
            <span>
              {loadProgress
                ? `${t.loading || "Loading"} (${loadProgress.current}/${loadProgress.total}): ${loadProgress.itemName}`
                : t.loading || "Loading..."}
            </span>
          </div>
          {loadProgress && loadProgress.total > 0 && (
            <div className="mt-1 w-full h-1 bg-surface-tertiary rounded-full overflow-hidden">
              <div
                className="h-full bg-accent-primary rounded-full transition-all"
                style={{
                  width: `${(loadProgress.current / loadProgress.total) * 100}%`,
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Project list */}
      <Scrollbar className="flex-1 p-4" overflow={{ x: "hidden", y: "scroll" }}>
        {projects.length === 0 ? (
          <div className="text-center text-text-tertiary py-8">
            {t.noSavedProjects}
          </div>
        ) : (
          <div className="space-y-2">
            {projects.map((project) => (
              <div
                key={project.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  currentProjectId === project.id
                    ? "border-accent-primary bg-accent-primary/10"
                    : "border-border-default hover:bg-surface-secondary"
                }`}
                onClick={() => !isLoading && onLoadProject(project)}
              >
                {/* Thumbnail */}
                <div className="w-14 h-14 bg-surface-tertiary rounded-lg shrink-0 overflow-hidden">
                  {(project.thumbnailUrl || project.tracks[0]?.frames[0]?.imageData) && (
                    <img
                      src={project.thumbnailUrl || project.tracks[0]?.frames[0]?.imageData}
                      alt={project.name}
                      className="w-full h-full object-contain"
                    />
                  )}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm truncate">
                    {project.name}
                  </div>
                  <div className="text-xs text-text-tertiary">
                    {project.tracks.length} tracks ·{" "}
                    {project.tracks.reduce((sum, tr) => sum + tr.frames.length, 0)} {t.frames} ·{" "}
                    {project.fps}fps
                  </div>
                  <div className="text-xs text-text-quaternary">
                    {new Date(project.savedAt).toLocaleString()}
                  </div>
                </div>

                {/* Delete button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!isLoading) onDeleteProject(project.id);
                  }}
                  className="p-2 hover:bg-accent-danger/20 rounded transition-colors text-text-tertiary hover:text-accent-danger"
                  title={t.delete}
                >
                  <DeleteIcon />
                </button>
              </div>
            ))}
          </div>
        )}
      </Scrollbar>
    </Modal>
  );
}
