"use client";

import { SavedVideoProject } from "../types";
import { useEffect, useMemo, useState } from "react";
import { Modal, Scrollbar, Select } from "../../../shared/components";
import { formatBytes } from "@/shared/utils/storage";
import { DeleteIcon } from "@/shared/components/icons";
import { type SaveLoadProgress } from "@/shared/lib/firebase/firebaseVideoStorage";
import {
  ALL_PROJECT_GROUPS_OPTION,
  DEFAULT_PROJECT_GROUP,
  collectProjectGroupNames,
  normalizeProjectGroupName,
} from "@/shared/utils/projectGroups";

// ============================================
// Types
// ============================================

interface StorageInfo {
  used: number;
  quota: number;
  percentage: number;
}

interface VideoProjectListModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: SavedVideoProject[];
  currentProjectId: string | null;
  onLoadProject: (project: SavedVideoProject) => void;
  onDeleteProject: (projectId: string) => void;
  storageInfo: StorageInfo;
  isLoading?: boolean;
  loadProgress?: SaveLoadProgress | null;
  translations: {
    savedProjects: string;
    noSavedProjects: string;
    project?: string;
    allProjects?: string;
    defaultProject?: string;
    delete: string;
    loading?: string;
  };
}

// ============================================
// Helpers
// ============================================

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

// ============================================
// Component
// ============================================

export default function VideoProjectListModal({
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
}: VideoProjectListModalProps) {
  const [selectedProjectGroup, setSelectedProjectGroup] = useState(ALL_PROJECT_GROUPS_OPTION);
  const projectGroups = useMemo(() => collectProjectGroupNames(projects), [projects]);
  const projectGroupOptions = useMemo(() => [
    { value: ALL_PROJECT_GROUPS_OPTION, label: t.allProjects || "All projects" },
    ...projectGroups.map((group) => ({
      value: group,
      label: group === DEFAULT_PROJECT_GROUP ? (t.defaultProject || DEFAULT_PROJECT_GROUP) : group,
    })),
  ], [projectGroups, t.allProjects, t.defaultProject]);
  const filteredProjects = useMemo(() => {
    if (selectedProjectGroup === ALL_PROJECT_GROUPS_OPTION) return projects;
    return projects.filter(
      (project) => normalizeProjectGroupName(project.projectGroup) === selectedProjectGroup
    );
  }, [projects, selectedProjectGroup]);

  useEffect(() => {
    if (!isOpen) {
      setSelectedProjectGroup(ALL_PROJECT_GROUPS_OPTION);
      return;
    }
    if (
      selectedProjectGroup !== ALL_PROJECT_GROUPS_OPTION
      && !projectGroups.includes(selectedProjectGroup)
    ) {
      setSelectedProjectGroup(ALL_PROJECT_GROUPS_OPTION);
    }
  }, [isOpen, projectGroups, selectedProjectGroup]);

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
      width="480px"
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
                  ? `${t.loading || "Loading"} (${loadProgress.current}/${loadProgress.total}): ${loadProgress.clipName}`
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

        <div className="px-4 py-3 border-b border-border-default flex items-center gap-2">
          <span className="text-xs text-text-secondary shrink-0">{t.project || "Project"}</span>
          <Select
            value={selectedProjectGroup}
            onChange={setSelectedProjectGroup}
            options={projectGroupOptions}
            size="sm"
            disabled={isLoading}
            className="min-w-[180px]"
          />
        </div>

        {/* Project list */}
        <Scrollbar className="flex-1 p-4" overflow={{ x: "hidden", y: "scroll" }}>
          {filteredProjects.length === 0 ? (
            <div className="text-center text-text-tertiary py-8">
              {t.noSavedProjects}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredProjects.map((project) => (
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
                    <div className="font-medium text-sm truncate">
                      {project.name}
                    </div>
                    <div className="text-xs text-text-tertiary">
                      {project.project.canvasSize.width} ×{" "}
                      {project.project.canvasSize.height}
                      {project.project.duration > 0 &&
                        ` • ${formatDuration(project.project.duration)}`}
                      {project.project.tracks.length > 0 &&
                        ` • ${project.project.tracks.length} tracks`}
                      {` • ${t.project || "Project"}: ${
                        normalizeProjectGroupName(project.projectGroup) === DEFAULT_PROJECT_GROUP
                          ? (t.defaultProject || DEFAULT_PROJECT_GROUP)
                          : normalizeProjectGroupName(project.projectGroup)
                      }`}
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
