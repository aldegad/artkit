"use client";

import { SavedImageProject } from "../types";
import { Modal, Scrollbar } from "../../../shared/components";
import { formatBytes } from "@/shared/utils/storage";
import { DeleteIcon } from "@/shared/components/icons";

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
                storageInfo.percentage > 80 ? "bg-accent-danger" : "bg-accent-primary"
              }`}
              style={{ width: `${Math.min(storageInfo.percentage, 100)}%` }}
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
      width="480px"
      maxHeight="80vh"
      contentClassName="flex-1 min-h-0"
    >
        <Scrollbar className="h-full p-4" overflow={{ x: "hidden", y: "scroll" }}>
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
                    {project.thumbnailUrl && (
                      <img
                        src={project.thumbnailUrl}
                        alt={project.name}
                        className="w-full h-full object-contain"
                      />
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{project.name}</div>
                    <div className="text-xs text-text-tertiary">
                      {project.canvasSize.width} × {project.canvasSize.height}
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
    </Modal>
  );
}
