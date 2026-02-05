"use client";

import { useRef, useCallback } from "react";
import { useEditor } from "../../domains/sprite/contexts/SpriteEditorContext";
import { useLanguage } from "../../shared/contexts";
import { Scrollbar } from "../../shared/components";
import { CompositionLayer } from "../../types";

// ============================================
// Icon Components
// ============================================

const EyeIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
    />
  </svg>
);

const EyeOffIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21"
    />
  </svg>
);

const LockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const UnlockIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z"
    />
  </svg>
);

const TrashIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const DuplicateIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const AddIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const ChevronUpIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const ChevronDownIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
  </svg>
);

// ============================================
// Layer Item Component
// ============================================

interface LayerItemProps {
  layer: CompositionLayer;
  isActive: boolean;
  onSelect: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onUpdateOpacity: (opacity: number) => void;
  onRename: (name: string) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}

function LayerItem({
  layer,
  isActive,
  onSelect,
  onToggleVisibility,
  onToggleLock,
  onDelete,
  onDuplicate,
  onMoveUp,
  onMoveDown,
  onUpdateOpacity,
  onRename,
  canMoveUp,
  canMoveDown,
}: LayerItemProps) {
  const { t } = useLanguage();

  return (
    <div
      className={`border rounded-lg p-2 transition-colors cursor-pointer ${
        isActive
          ? "border-accent-primary bg-accent-primary/10"
          : "border-border-default hover:border-border-hover"
      }`}
      onClick={onSelect}
    >
      {/* Layer preview and name */}
      <div className="flex items-center gap-2">
        {/* Thumbnail */}
        <div className="w-10 h-10 rounded bg-surface-tertiary overflow-hidden flex-shrink-0 checkerboard">
          <img
            src={layer.imageSrc}
            alt={layer.name}
            className="w-full h-full object-contain"
            style={{ opacity: layer.opacity / 100 }}
          />
        </div>

        {/* Name (editable) */}
        <input
          type="text"
          value={layer.name}
          onChange={(e) => onRename(e.target.value)}
          onClick={(e) => e.stopPropagation()}
          className="flex-1 min-w-0 bg-transparent text-sm text-text-primary border-none focus:outline-none focus:ring-1 focus:ring-accent-primary rounded px-1"
        />

        {/* Quick actions */}
        <div className="flex items-center gap-1">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisibility();
            }}
            className={`p-1 rounded transition-colors ${
              layer.visible
                ? "text-text-secondary hover:bg-interactive-hover"
                : "text-text-tertiary hover:bg-interactive-hover"
            }`}
            title={layer.visible ? t.hideLayer : t.showLayer}
          >
            {layer.visible ? <EyeIcon /> : <EyeOffIcon />}
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleLock();
            }}
            className={`p-1 rounded transition-colors ${
              layer.locked
                ? "text-accent-warning hover:bg-interactive-hover"
                : "text-text-tertiary hover:bg-interactive-hover"
            }`}
            title={layer.locked ? t.unlockLayer : t.lockLayer}
          >
            {layer.locked ? <LockIcon /> : <UnlockIcon />}
          </button>
        </div>
      </div>

      {/* Expanded controls when active */}
      {isActive && (
        <div className="mt-2 pt-2 border-t border-border-subtle space-y-2">
          {/* Opacity slider */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-14">{t.opacity}:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={layer.opacity}
              onChange={(e) => onUpdateOpacity(parseInt(e.target.value))}
              onClick={(e) => e.stopPropagation()}
              className="flex-1"
            />
            <span className="text-xs text-text-primary w-8 text-right">{layer.opacity}%</span>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-1">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveUp();
              }}
              disabled={!canMoveUp}
              className="p-1.5 rounded bg-interactive-default hover:bg-interactive-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={t.moveUp}
            >
              <ChevronUpIcon />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onMoveDown();
              }}
              disabled={!canMoveDown}
              className="p-1.5 rounded bg-interactive-default hover:bg-interactive-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={t.moveDown}
            >
              <ChevronDownIcon />
            </button>
            <div className="flex-1" />
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDuplicate();
              }}
              className="p-1.5 rounded bg-interactive-default hover:bg-interactive-hover transition-colors"
              title={t.duplicateLayer}
            >
              <DuplicateIcon />
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              disabled={layer.locked}
              className="p-1.5 rounded bg-accent-danger/20 hover:bg-accent-danger/40 text-accent-danger disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              title={t.deleteLayer}
            >
              <TrashIcon />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export default function LayersPanelContent() {
  const {
    compositionLayers,
    activeLayerId,
    setActiveLayerId,
    addCompositionLayer,
    removeCompositionLayer,
    updateCompositionLayer,
    reorderCompositionLayers,
    duplicateCompositionLayer,
  } = useEditor();
  const { t } = useLanguage();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Handle image upload
  const handleImageUpload = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file || !file.type.startsWith("image/")) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        addCompositionLayer(src, file.name.replace(/\.[^/.]+$/, ""));
      };
      reader.readAsDataURL(file);

      // Reset input
      e.target.value = "";
    },
    [addCompositionLayer]
  );

  // Sort layers by zIndex (highest first for display, since higher zIndex = on top)
  const sortedLayers = [...compositionLayers].sort((a, b) => b.zIndex - a.zIndex);

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Header with add button */}
      <div className="p-3 border-b border-border-default flex items-center justify-between">
        <h3 className="text-sm font-medium text-text-primary">{t.layers}</h3>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="btn btn-primary text-sm flex items-center gap-1"
          >
            <AddIcon />
            {t.addLayer}
          </button>
        </div>
      </div>

      {/* Layers list */}
      <Scrollbar className="flex-1 p-3 space-y-2" overflow={{ x: "hidden", y: "scroll" }}>
        {sortedLayers.length === 0 ? (
          <div className="text-center py-8 text-text-tertiary text-sm">
            <p>{t.noLayersYet}</p>
            <p className="mt-1">{t.clickAddLayerToStart}</p>
          </div>
        ) : (
          sortedLayers.map((layer, displayIndex) => {
            // Find the actual index in the original array for reordering
            const actualIndex = compositionLayers.findIndex((l) => l.id === layer.id);
            return (
              <LayerItem
                key={layer.id}
                layer={layer}
                isActive={activeLayerId === layer.id}
                onSelect={() => setActiveLayerId(layer.id)}
                onToggleVisibility={() =>
                  updateCompositionLayer(layer.id, { visible: !layer.visible })
                }
                onToggleLock={() => updateCompositionLayer(layer.id, { locked: !layer.locked })}
                onDelete={() => removeCompositionLayer(layer.id)}
                onDuplicate={() => duplicateCompositionLayer(layer.id)}
                onMoveUp={() => {
                  // Moving up in display = increasing zIndex
                  if (displayIndex > 0) {
                    const targetIndex = compositionLayers.findIndex(
                      (l) => l.id === sortedLayers[displayIndex - 1].id
                    );
                    reorderCompositionLayers(actualIndex, targetIndex);
                  }
                }}
                onMoveDown={() => {
                  // Moving down in display = decreasing zIndex
                  if (displayIndex < sortedLayers.length - 1) {
                    const targetIndex = compositionLayers.findIndex(
                      (l) => l.id === sortedLayers[displayIndex + 1].id
                    );
                    reorderCompositionLayers(actualIndex, targetIndex);
                  }
                }}
                onUpdateOpacity={(opacity) => updateCompositionLayer(layer.id, { opacity })}
                onRename={(name) => updateCompositionLayer(layer.id, { name })}
                canMoveUp={displayIndex > 0}
                canMoveDown={displayIndex < sortedLayers.length - 1}
              />
            );
          })
        )}
      </Scrollbar>

      {/* Footer info */}
      {compositionLayers.length > 0 && (
        <div className="p-2 border-t border-border-default text-xs text-text-tertiary text-center">
          {compositionLayers.length} {t.layerCount}
        </div>
      )}
    </div>
  );
}
