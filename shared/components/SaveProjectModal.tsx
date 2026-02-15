"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";
import { Select } from "./Select";
import {
  DEFAULT_PROJECT_GROUP,
  NEW_PROJECT_GROUP_OPTION,
  normalizeProjectGroupName,
} from "@/shared/utils/projectGroups";

export interface SaveProjectModalValue {
  name: string;
  projectGroup: string;
}

export interface SaveProjectModalTranslations {
  title: string;
  name: string;
  project: string;
  defaultProject: string;
  newProject: string;
  newProjectName: string;
  cancel: string;
  save: string;
}

export interface SaveProjectModalProps {
  isOpen: boolean;
  initialName: string;
  initialProjectGroup?: string;
  existingProjectGroups: string[];
  isSaving?: boolean;
  onClose: () => void;
  onSave: (value: SaveProjectModalValue) => void;
  translations: SaveProjectModalTranslations;
}

export function SaveProjectModal({
  isOpen,
  initialName,
  initialProjectGroup,
  existingProjectGroups,
  isSaving = false,
  onClose,
  onSave,
  translations: t,
}: SaveProjectModalProps) {
  const normalizedInitialGroup = normalizeProjectGroupName(initialProjectGroup);
  const [name, setName] = useState(initialName);
  const [selectedProjectGroup, setSelectedProjectGroup] = useState(normalizedInitialGroup);
  const [newProjectGroup, setNewProjectGroup] = useState("");

  const projectOptions = useMemo(() => {
    const groups = new Set<string>([DEFAULT_PROJECT_GROUP, normalizedInitialGroup]);
    for (const group of existingProjectGroups) {
      groups.add(normalizeProjectGroupName(group));
    }

    const nonDefault = Array.from(groups)
      .filter((group) => group !== DEFAULT_PROJECT_GROUP)
      .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));

    return [
      { value: DEFAULT_PROJECT_GROUP, label: t.defaultProject },
      ...nonDefault.map((group) => ({ value: group, label: group })),
      { value: NEW_PROJECT_GROUP_OPTION, label: t.newProject },
    ];
  }, [existingProjectGroups, normalizedInitialGroup, t.defaultProject, t.newProject]);

  useEffect(() => {
    if (!isOpen) return;
    setName(initialName);
    setSelectedProjectGroup(normalizedInitialGroup);
    setNewProjectGroup("");
  }, [isOpen, initialName, normalizedInitialGroup]);

  const isNewProjectGroup = selectedProjectGroup === NEW_PROJECT_GROUP_OPTION;
  const canSave = name.trim().length > 0
    && (!isNewProjectGroup || newProjectGroup.trim().length > 0)
    && !isSaving;

  const handleSubmit = useCallback(() => {
    if (!canSave) return;

    const resolvedProjectGroup = normalizeProjectGroupName(
      isNewProjectGroup ? newProjectGroup : selectedProjectGroup
    );
    onSave({
      name: name.trim(),
      projectGroup: resolvedProjectGroup,
    });
  }, [canSave, isNewProjectGroup, name, newProjectGroup, onSave, selectedProjectGroup]);

  const footer = (
    <div className="flex justify-end gap-2">
      <button
        type="button"
        onClick={onClose}
        disabled={isSaving}
        className="px-3 py-1.5 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors disabled:opacity-50"
      >
        {t.cancel}
      </button>
      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSave}
        className="px-3 py-1.5 text-sm rounded bg-accent-primary hover:bg-accent-hover text-white transition-colors disabled:opacity-50"
      >
        {isSaving ? `${t.save}...` : t.save}
      </button>
    </div>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.title}
      width="420px"
      contentClassName="flex flex-col gap-3 p-4"
      footer={footer}
      closeOnBackdropClick={!isSaving}
      closeOnEscape={!isSaving}
    >
      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t.name}</label>
        <input
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          disabled={isSaving}
          className="w-full px-2 py-1.5 bg-surface-secondary border border-border-default rounded text-sm focus:outline-none focus:border-accent-primary disabled:opacity-50"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-text-secondary">{t.project}</label>
        <Select
          value={selectedProjectGroup}
          onChange={(value) => setSelectedProjectGroup(value)}
          options={projectOptions}
          size="sm"
          disabled={isSaving}
        />
      </div>

      {isNewProjectGroup && (
        <div className="flex flex-col gap-1">
          <label className="text-xs text-text-secondary">{t.newProjectName}</label>
          <input
            type="text"
            value={newProjectGroup}
            onChange={(event) => setNewProjectGroup(event.target.value)}
            disabled={isSaving}
            className="w-full px-2 py-1.5 bg-surface-secondary border border-border-default rounded text-sm focus:outline-none focus:border-accent-primary disabled:opacity-50"
          />
        </div>
      )}
    </Modal>
  );
}
