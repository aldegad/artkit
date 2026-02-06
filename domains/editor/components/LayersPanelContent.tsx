"use client";

import React, { useState, useEffect, RefObject } from "react";
import { useEditorLayers, useEditorState } from "../contexts";
import { useLanguage } from "../../../shared/contexts";
import { PlusIcon, ImageIcon, EyeOpenIcon, EyeClosedIcon, LockClosedIcon, LockOpenIcon, DuplicateIcon, DeleteIcon, AlignLeftIcon, AlignCenterHIcon, AlignRightIcon, AlignTopIcon, AlignMiddleVIcon, AlignBottomIcon, DistributeHIcon, DistributeVIcon } from "@/shared/components/icons";

// ============================================
// Layer Thumbnail Component (memoized)
// ============================================

interface LayerThumbnailProps {
  layerId: string;
  layerName: string;
  visible: boolean;
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
}

const LayerThumbnail = React.memo(function LayerThumbnail({
  layerId,
  layerName,
  visible,
  layerCanvasesRef,
}: LayerThumbnailProps) {
  const [thumbnailSrc, setThumbnailSrc] = useState<string | null>(null);

  useEffect(() => {
    const updateThumbnail = () => {
      const canvas = layerCanvasesRef.current?.get(layerId);
      if (canvas && canvas.width > 0 && canvas.height > 0) {
        setThumbnailSrc(canvas.toDataURL("image/png"));
      }
    };

    updateThumbnail();
    const interval = setInterval(updateThumbnail, 500);

    return () => clearInterval(interval);
  }, [layerId, layerCanvasesRef]);

  return (
    <div className="w-10 h-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iI2NjYyIvPjxyZWN0IHg9IjgiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNjY2MiLz48L3N2Zz4=')] border border-border-default rounded overflow-hidden shrink-0">
      {thumbnailSrc ? (
        <img
          src={thumbnailSrc}
          alt={layerName}
          className="w-full h-full object-contain"
          style={{ opacity: visible ? 1 : 0.5 }}
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center">
          <ImageIcon className="w-5 h-5 text-text-tertiary" />
        </div>
      )}
    </div>
  );
});

// ============================================
// Alignment Toolbar Props
// ============================================

interface AlignmentToolbarProps {
  onAlign: (alignment: "left" | "center" | "right" | "top" | "middle" | "bottom") => void;
  onDistribute: (direction: "horizontal" | "vertical") => void;
  selectedCount: number;
}

const AlignmentToolbar = React.memo(function AlignmentToolbar({
  onAlign,
  onDistribute,
  selectedCount,
}: AlignmentToolbarProps) {
  const hasSelection = selectedCount > 0;
  const canDistribute = selectedCount >= 2;

  return (
    <div className="flex items-center gap-0.5 border-l border-border-default pl-2 ml-1">
      {/* Horizontal alignment */}
      <button
        onClick={() => onAlign("left")}
        disabled={!hasSelection}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Align Left"
      >
        <AlignLeftIcon />
      </button>
      <button
        onClick={() => onAlign("center")}
        disabled={!hasSelection}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Align Center"
      >
        <AlignCenterHIcon />
      </button>
      <button
        onClick={() => onAlign("right")}
        disabled={!hasSelection}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Align Right"
      >
        <AlignRightIcon />
      </button>

      <div className="w-px h-4 bg-border-default mx-0.5" />

      {/* Vertical alignment */}
      <button
        onClick={() => onAlign("top")}
        disabled={!hasSelection}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Align Top"
      >
        <AlignTopIcon />
      </button>
      <button
        onClick={() => onAlign("middle")}
        disabled={!hasSelection}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Align Middle"
      >
        <AlignMiddleVIcon />
      </button>
      <button
        onClick={() => onAlign("bottom")}
        disabled={!hasSelection}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Align Bottom"
      >
        <AlignBottomIcon />
      </button>

      <div className="w-px h-4 bg-border-default mx-0.5" />

      {/* Distribute */}
      <button
        onClick={() => onDistribute("horizontal")}
        disabled={!canDistribute}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Distribute Horizontally (2+ layers)"
      >
        <DistributeHIcon />
      </button>
      <button
        onClick={() => onDistribute("vertical")}
        disabled={!canDistribute}
        className="w-5 h-5 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        title="Distribute Vertically (2+ layers)"
      >
        <DistributeVIcon />
      </button>
    </div>
  );
});

// ============================================
// Layers Panel Content Component
// ============================================

export default function LayersPanelContent() {
  const {
    layers,
    activeLayerId,
    selectedLayerIds,
    layerCanvasesRef,
    draggedLayerId,
    setDraggedLayerId,
    dragOverLayerId,
    setDragOverLayerId,
    addPaintLayer,
    addImageLayer,
    selectLayerWithModifier,
    toggleLayerVisibility,
    toggleLayerLock,
    duplicateLayer,
    deleteLayer,
    renameLayer,
    updateLayerOpacity,
    reorderLayers,
    alignLayers,
    distributeLayers,
  } = useEditorLayers();

  const { state: { selection } } = useEditorState();
  const { t } = useLanguage();

  // Editing state for layer names
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Handle image file upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const src = event.target?.result as string;
        const fileName = file.name.replace(/\.[^/.]+$/, "");
        addImageLayer(src, fileName);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = "";
  };

  // Handle layer click with shift modifier
  const handleLayerClick = (e: React.MouseEvent, layerId: string) => {
    selectLayerWithModifier(layerId, e.shiftKey);
  };

  // Check if layer is selected (either active or in multi-selection)
  const isLayerSelected = (layerId: string) => {
    return selectedLayerIds.includes(layerId) || (selectedLayerIds.length === 0 && activeLayerId === layerId);
  };

  // Get effective selected count
  const effectiveSelectedCount = selectedLayerIds.length > 0 ? selectedLayerIds.length : (activeLayerId ? 1 : 0);

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Panel Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border-default bg-surface-secondary shrink-0">
        <div className="flex items-center gap-1">
          {/* Add Paint Layer */}
          <button
            onClick={addPaintLayer}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            title={t.addLayer}
          >
            <PlusIcon />
          </button>
          {/* Add Image Layer */}
          <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="hidden"
            id="editor-layers-panel-file-input"
          />
          <button
            onClick={() => document.getElementById("editor-layers-panel-file-input")?.click()}
            className="w-6 h-6 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
            title="Add Image Layer"
          >
            <ImageIcon />
          </button>

          {/* Alignment Toolbar */}
          <AlignmentToolbar
            onAlign={(alignment) => alignLayers(alignment, selection || undefined)}
            onDistribute={(direction) => distributeLayers(direction, selection || undefined)}
            selectedCount={effectiveSelectedCount}
          />
        </div>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {layers.length === 0 ? (
          <div className="text-center py-8 text-text-tertiary text-sm">
            <p>{t.noLayersYet}</p>
            <p className="text-xs mt-1">{t.clickAddLayerToStart}</p>
          </div>
        ) : (
          [...layers]
            .sort((a, b) => b.zIndex - a.zIndex)
            .map((layer) => {
              const isSelected = isLayerSelected(layer.id);
              const isActive = activeLayerId === layer.id;

              return (
                <div
                  key={layer.id}
                  draggable
                  onDragStart={(e) => {
                    setDraggedLayerId(layer.id);
                    e.dataTransfer.effectAllowed = "move";
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (draggedLayerId && draggedLayerId !== layer.id) {
                      setDragOverLayerId(layer.id);
                    }
                  }}
                  onDragLeave={() => {
                    setDragOverLayerId(null);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedLayerId && draggedLayerId !== layer.id) {
                      reorderLayers(draggedLayerId, layer.id);
                    }
                    setDraggedLayerId(null);
                    setDragOverLayerId(null);
                  }}
                  onDragEnd={() => {
                    setDraggedLayerId(null);
                    setDragOverLayerId(null);
                  }}
                  onClick={(e) => handleLayerClick(e, layer.id)}
                  className={`flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all ${
                    isActive
                      ? "bg-accent-primary/20 border border-accent-primary/50"
                      : isSelected
                      ? "bg-accent-primary/10 border border-accent-primary/30"
                      : "hover:bg-interactive-hover border border-transparent"
                  } ${
                    draggedLayerId === layer.id ? "opacity-50 scale-95" : ""
                  } ${
                    dragOverLayerId === layer.id ? "border-accent-primary! bg-accent-primary/10 scale-105" : ""
                  }`}
                >
                  {/* Visibility toggle */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleLayerVisibility(layer.id);
                    }}
                    className={`p-1 rounded ${layer.visible ? "text-text-primary" : "text-text-quaternary"}`}
                    title={layer.visible ? t.hideLayer : t.showLayer}
                  >
                    {layer.visible ? <EyeOpenIcon /> : <EyeClosedIcon />}
                  </button>

                  {/* Layer thumbnail */}
                  <LayerThumbnail
                    layerId={layer.id}
                    layerName={layer.name}
                    visible={layer.visible}
                    layerCanvasesRef={layerCanvasesRef}
                  />

                  {/* Layer name */}
                  <div className="flex-1 min-w-0">
                    {editingLayerId === layer.id ? (
                      <input
                        type="text"
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        onBlur={() => {
                          if (editingName.trim()) {
                            renameLayer(layer.id, editingName.trim());
                          }
                          setEditingLayerId(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            if (editingName.trim()) {
                              renameLayer(layer.id, editingName.trim());
                            }
                            setEditingLayerId(null);
                          } else if (e.key === "Escape") {
                            setEditingLayerId(null);
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        autoFocus
                        className="w-full text-xs bg-surface-secondary border border-accent-primary/50 focus:outline-none px-1 rounded"
                      />
                    ) : (
                      <div
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          const timeout = setTimeout(() => {
                            setEditingLayerId(layer.id);
                            setEditingName(layer.name);
                          }, 500);
                          const handleUp = () => {
                            clearTimeout(timeout);
                            window.removeEventListener("mouseup", handleUp);
                          };
                          window.addEventListener("mouseup", handleUp);
                        }}
                        className="text-xs px-1 truncate cursor-default select-none"
                        title="Long press to rename"
                      >
                        {layer.name}
                      </div>
                    )}
                    <span className="text-[10px] text-text-quaternary px-1">
                      Layer
                    </span>
                  </div>

                  {/* Layer actions */}
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerLock(layer.id);
                      }}
                      className={`p-1 rounded ${layer.locked ? "text-accent-warning" : "text-text-quaternary hover:text-text-primary"}`}
                      title={layer.locked ? t.unlockLayer : t.lockLayer}
                    >
                      {layer.locked ? <LockClosedIcon className="w-3.5 h-3.5" /> : <LockOpenIcon className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        duplicateLayer(layer.id);
                      }}
                      className="p-1 rounded text-text-quaternary hover:text-text-primary"
                      title={t.duplicateLayer}
                    >
                      <DuplicateIcon className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteLayer(layer.id);
                      }}
                      className="p-1 rounded text-text-quaternary hover:text-accent-danger"
                      title={t.deleteLayer}
                    >
                      <DeleteIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Shift hint */}
      <div className="px-3 py-1.5 border-t border-border-default bg-surface-tertiary/50 shrink-0">
        <p className="text-[10px] text-text-quaternary text-center">
          Shift+Click to multi-select
        </p>
      </div>

      {/* Panel Footer - Opacity control */}
      {activeLayerId && layers.find(l => l.id === activeLayerId) && (
        <div className="px-3 py-2 border-t border-border-default bg-surface-secondary shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">{t.opacity}:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={layers.find(l => l.id === activeLayerId)?.opacity || 100}
              onChange={(e) => updateLayerOpacity(activeLayerId, Number(e.target.value))}
              className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-text-secondary w-8 text-right">
              {layers.find(l => l.id === activeLayerId)?.opacity || 100}%
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
