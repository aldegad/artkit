"use client";

import { SavedImageProject } from "../types";
import { Scrollbar } from "../../../shared/components";
import { formatBytes } from "../../../utils/storage";

// ============================================
// Types
// ============================================

interface StorageInfo {
  used: number;
  quota: number;
  percentage: number;
}

interface ProjectListModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: SavedImageProject[];
  currentProjectId: string | null;
  onLoadProject: (project: SavedImageProject) => void;
  onDeleteProject: (projectId: string) => void;
  storageInfo: StorageInfo;
  translations: {
    savedProjects: string;
    noSavedProjects: string;
    delete: string;
  };
}

// ============================================
// Icons
// ============================================

const DeleteIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

// ============================================
// Component
// ============================================

export default function ProjectListModal({
  isOpen,
  onClose,
  projects,
  currentProjectId,
  onLoadProject,
  onDeleteProject,
  storageInfo,
  translations: t,
}: ProjectListModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-surface-primary border border-border-default rounded-lg shadow-xl w-[480px] max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
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
                      storageInfo.percentage > 80 ? "bg-accent-danger" : "bg-accent-primary"
                    }`}
                    style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
                  />
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            ×
          </button>
        </div>

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
                  onClick={() => onLoadProject(project)}
                >
                  {/* Thumbnail */}
                  <div className="w-12 h-12 bg-surface-tertiary rounded overflow-hidden shrink-0">
                    <img
                      src={project.imageSrc}
                      alt={project.name}
                      className="w-full h-full object-contain"
                    />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{project.name}</div>
                    <div className="text-xs text-text-tertiary">
                      {(project.canvasSize || project.imageSize)?.width ?? 0} × {(project.canvasSize || project.imageSize)?.height ?? 0}
                      {project.rotation !== 0 && ` • ${project.rotation}°`}
                    </div>
                    <div className="text-xs text-text-quaternary">
                      {new Date(project.savedAt).toLocaleString()}
                    </div>
                  </div>

                  {/* Delete button */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteProject(project.id);
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
      </div>
    </div>
  );
}
