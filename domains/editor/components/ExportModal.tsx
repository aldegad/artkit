"use client";

import { useMemo } from "react";
import type { UnifiedLayer } from "../../../shared/types";

export type ExportMode = "merged" | "layers";
export type ExportBackground = "transparent" | "color";

interface ExportModalProps {
  isOpen: boolean;
  isExporting: boolean;
  layers: UnifiedLayer[];
  selectedLayerIds: string[];
  mode: ExportMode;
  fileName: string;
  namePattern: string;
  background: ExportBackground;
  backgroundColor: string;
  onClose: () => void;
  onModeChange: (mode: ExportMode) => void;
  onFileNameChange: (name: string) => void;
  onNamePatternChange: (pattern: string) => void;
  onBackgroundChange: (background: ExportBackground) => void;
  onBackgroundColorChange: (color: string) => void;
  onToggleLayer: (layerId: string) => void;
  onSelectAllLayers: () => void;
  onClearLayerSelection: () => void;
  onExport: () => void;
  translations: {
    title: string;
    exportType: string;
    mergeVisibleLayers: string;
    selectedLayersAsZip: string;
    fileNamePng: string;
    zipFileName: string;
    layerFileNamePattern: string;
    placeholdersAvailable: string;
    background: string;
    transparent: string;
    solidColor: string;
    layerSelection: string;
    selectAll: string;
    clear: string;
    noLayersAvailable: string;
    hiddenLabel: string;
    cancel: string;
    export: string;
    exporting: string;
  };
}

export function ExportModal({
  isOpen,
  isExporting,
  layers,
  selectedLayerIds,
  mode,
  fileName,
  namePattern,
  background,
  backgroundColor,
  onClose,
  onModeChange,
  onFileNameChange,
  onNamePatternChange,
  onBackgroundChange,
  onBackgroundColorChange,
  onToggleLayer,
  onSelectAllLayers,
  onClearLayerSelection,
  onExport,
  translations: t,
}: ExportModalProps) {
  const sortedLayers = useMemo(
    () => [...layers].sort((a, b) => b.zIndex - a.zIndex),
    [layers]
  );

  if (!isOpen) return null;

  const canExport =
    fileName.trim().length > 0 &&
    (mode === "merged" || selectedLayerIds.length > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-[560px] max-w-[95vw] max-h-[85vh] overflow-hidden rounded-lg border border-border-default bg-surface-primary shadow-xl flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="font-semibold text-text-primary">{t.title}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            disabled={isExporting}
          >
            ×
          </button>
        </div>

        <div className="p-4 space-y-4 overflow-y-auto">
          <section className="space-y-2">
            <div className="text-sm font-medium text-text-secondary">{t.exportType}</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                onClick={() => onModeChange("merged")}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                  mode === "merged"
                    ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                    : "border-border-default hover:bg-surface-secondary text-text-secondary"
                }`}
                disabled={isExporting}
              >
                {t.mergeVisibleLayers}
              </button>
              <button
                onClick={() => onModeChange("layers")}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors text-left ${
                  mode === "layers"
                    ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                    : "border-border-default hover:bg-surface-secondary text-text-secondary"
                }`}
                disabled={isExporting}
              >
                {t.selectedLayersAsZip}
              </button>
            </div>
          </section>

          <section className="space-y-2">
            <label className="text-sm font-medium text-text-secondary">
              {mode === "merged" ? t.fileNamePng : t.zipFileName}
            </label>
            <input
              type="text"
              value={fileName}
              onChange={(e) => onFileNameChange(e.target.value)}
              placeholder={mode === "merged" ? "edited-image" : "layers-export"}
              className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-border-default focus:outline-none focus:border-accent-primary text-sm"
              disabled={isExporting}
            />
          </section>

          {mode === "layers" && (
            <section className="space-y-2">
              <label className="text-sm font-medium text-text-secondary">
                {t.layerFileNamePattern}
              </label>
              <input
                type="text"
                value={namePattern}
                onChange={(e) => onNamePatternChange(e.target.value)}
                placeholder="{index}-{name}"
                className="w-full px-3 py-2 rounded-lg bg-surface-secondary border border-border-default focus:outline-none focus:border-accent-primary text-sm"
                disabled={isExporting}
              />
              <p className="text-xs text-text-tertiary">
                {t.placeholdersAvailable}: {"{index}"}, {"{name}"}
              </p>
            </section>
          )}

          <section className="space-y-2">
            <div className="text-sm font-medium text-text-secondary">{t.background}</div>
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2">
              <div className="flex gap-2">
                <button
                  onClick={() => onBackgroundChange("transparent")}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                    background === "transparent"
                      ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                      : "border-border-default hover:bg-surface-secondary text-text-secondary"
                  }`}
                  disabled={isExporting}
                >
                  {t.transparent}
                </button>
                <button
                  onClick={() => onBackgroundChange("color")}
                  className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                    background === "color"
                      ? "border-accent-primary bg-accent-primary/10 text-text-primary"
                      : "border-border-default hover:bg-surface-secondary text-text-secondary"
                  }`}
                  disabled={isExporting}
                >
                  {t.solidColor}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={backgroundColor}
                  onChange={(e) => onBackgroundColorChange(e.target.value)}
                  disabled={isExporting || background !== "color"}
                  className="w-10 h-10 rounded border border-border-default bg-transparent disabled:opacity-50"
                />
                <span className="text-xs text-text-tertiary">{backgroundColor}</span>
              </div>
            </div>
          </section>

          {mode === "layers" && (
            <section className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-text-secondary">
                  {t.layerSelection} ({selectedLayerIds.length}/{layers.length})
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={onSelectAllLayers}
                    className="text-xs px-2 py-1 rounded bg-surface-secondary hover:bg-surface-tertiary"
                    disabled={isExporting || layers.length === 0}
                  >
                    {t.selectAll}
                  </button>
                  <button
                    onClick={onClearLayerSelection}
                    className="text-xs px-2 py-1 rounded bg-surface-secondary hover:bg-surface-tertiary"
                    disabled={isExporting || selectedLayerIds.length === 0}
                  >
                    {t.clear}
                  </button>
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto rounded-lg border border-border-default bg-surface-secondary p-2 space-y-1">
                {sortedLayers.length === 0 ? (
                  <div className="text-xs text-text-tertiary px-2 py-1">{t.noLayersAvailable}</div>
                ) : (
                  sortedLayers.map((layer) => {
                    const checked = selectedLayerIds.includes(layer.id);
                    return (
                      <label
                        key={layer.id}
                        className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary cursor-pointer text-sm"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => onToggleLayer(layer.id)}
                          disabled={isExporting}
                        />
                        <span className="flex-1 text-text-primary">{layer.name}</span>
                        {!layer.visible && <span className="text-xs text-text-tertiary">{t.hiddenLabel}</span>}
                      </label>
                    );
                  })
                )}
              </div>
            </section>
          )}
        </div>

        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border-default">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded bg-surface-secondary hover:bg-surface-tertiary text-sm transition-colors"
            disabled={isExporting}
          >
            {t.cancel}
          </button>
          <button
            onClick={onExport}
            className="px-4 py-2 rounded bg-accent-primary hover:bg-accent-hover text-white text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canExport || isExporting}
          >
            {isExporting ? t.exporting : t.export}
          </button>
        </div>
      </div>
    </div>
  );
}
