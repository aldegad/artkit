"use client";

import React, { useState, useEffect, useRef, RefObject } from "react";
import { useEditorLayers, useEditorState } from "../contexts";
import { useLanguage } from "../../../shared/contexts";
import { LAYER_CANVAS_UPDATED_EVENT } from "../constants";
import { Select } from "@/shared/components";
import { PlusIcon, ImageIcon, EyeOpenIcon, EyeClosedIcon, LockClosedIcon, LockOpenIcon, DuplicateIcon, MergeDownIcon, DeleteIcon, AlignLeftIcon, AlignCenterHIcon, AlignRightIcon, AlignTopIcon, AlignMiddleVIcon, AlignBottomIcon, DistributeHIcon, DistributeVIcon, PencilPresetIcon } from "@/shared/components/icons";
import type { LayerBlendMode } from "@/shared/types";

// ============================================
// Layer Thumbnail Component (memoized)
// ============================================

interface LayerThumbnailProps {
  layerId: string;
  visible: boolean;
  layerCanvasesRef: RefObject<Map<string, HTMLCanvasElement>>;
  renderTick: number;
}

const THUMB_SIZE = 40;
const THUMBNAIL_REFRESH_THROTTLE_MS = 120;
const BLEND_MODE_OPTIONS: Array<{ value: LayerBlendMode; label: string }> = [
  { value: "source-over", label: "Normal" },
  { value: "soft-light", label: "Soft Light" },
  { value: "overlay", label: "Overlay" },
  { value: "multiply", label: "Multiply" },
  { value: "screen", label: "Screen" },
  { value: "color", label: "Color" },
  { value: "luminosity", label: "Luminosity" },
];

const LayerThumbnail = React.memo(function LayerThumbnail({
  layerId,
  visible,
  layerCanvasesRef,
  renderTick,
}: LayerThumbnailProps) {
  const thumbRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const updateThumbnail = () => {
      const src = layerCanvasesRef.current?.get(layerId);
      const thumb = thumbRef.current;
      if (!src || !thumb || src.width === 0 || src.height === 0) return;
      const ctx = thumb.getContext("2d");
      if (!ctx) return;
      ctx.clearRect(0, 0, THUMB_SIZE, THUMB_SIZE);
      const scale = Math.min(THUMB_SIZE / src.width, THUMB_SIZE / src.height);
      const w = src.width * scale;
      const h = src.height * scale;
      ctx.drawImage(src, (THUMB_SIZE - w) / 2, (THUMB_SIZE - h) / 2, w, h);
    };

    updateThumbnail();
  }, [layerId, layerCanvasesRef, renderTick]);

  return (
    <div className="w-10 h-10 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxNiIgaGVpZ2h0PSIxNiI+PHJlY3Qgd2lkdGg9IjgiIGhlaWdodD0iOCIgZmlsbD0iI2NjYyIvPjxyZWN0IHg9IjgiIHk9IjgiIHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9IiNjY2MiLz48L3N2Zz4=')] border border-border-default rounded overflow-hidden shrink-0">
      <canvas
        ref={thumbRef}
        width={THUMB_SIZE}
        height={THUMB_SIZE}
        className="w-full h-full"
        style={{ opacity: visible ? 1 : 0.5 }}
      />
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
    addFilterLayer,
    addImageLayer,
    selectLayerWithModifier,
    toggleLayerVisibility,
    toggleLayerLock,
    duplicateLayer,
    mergeLayerDown,
    deleteLayer,
    renameLayer,
    updateLayer,
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
  const [thumbRenderTick, setThumbRenderTick] = useState(0);
  const lastThumbUpdateMsRef = useRef(0);

  useEffect(() => {
    const handleLayerCanvasUpdated = () => {
      const now = performance.now();
      if (now - lastThumbUpdateMsRef.current < THUMBNAIL_REFRESH_THROTTLE_MS) return;
      lastThumbUpdateMsRef.current = now;
      setThumbRenderTick((tick) => tick + 1);
    };

    window.addEventListener(LAYER_CANVAS_UPDATED_EVENT, handleLayerCanvasUpdated);
    return () => {
      window.removeEventListener(LAYER_CANVAS_UPDATED_EVENT, handleLayerCanvasUpdated);
    };
  }, []);

  useEffect(() => {
    setThumbRenderTick((tick) => tick + 1);
  }, [layers.length]);

  // Handle image file upload
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    for (const file of files) {
      if (!file.type.startsWith("image/")) continue;
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
  const sortedLayers = [...layers].sort((a, b) => b.zIndex - a.zIndex);
  const activeLayer = activeLayerId ? layers.find((l) => l.id === activeLayerId) || null : null;

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
          {/* Add Warm Filter Layer */}
          <button
            onClick={addFilterLayer}
            className="px-1.5 h-6 flex items-center justify-center rounded hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors text-[11px] font-semibold"
            title="Add Warm Filter Layer"
          >
            Fx
          </button>
          {/* Add Image Layer */}
          <input
            type="file"
            accept="image/*"
            multiple
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
          sortedLayers.map((layer, index) => {
              const isSelected = isLayerSelected(layer.id);
              const isActive = activeLayerId === layer.id;
              const canMergeDown = index < sortedLayers.length - 1;

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
                  className={`group/layer flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all ${
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
                    visible={layer.visible}
                    layerCanvasesRef={layerCanvasesRef}
                    renderTick={thumbRenderTick}
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
                      <div className="flex items-center gap-0.5 min-w-0">
                        <span className="text-xs px-1 truncate select-none">
                          {layer.name}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingLayerId(layer.id);
                            setEditingName(layer.name);
                          }}
                          className="p-0.5 rounded text-text-quaternary hover:text-text-primary shrink-0 opacity-0 group-hover/layer:opacity-100 transition-opacity"
                          title="Rename"
                        >
                          <PencilPresetIcon className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <span className="text-[10px] text-text-quaternary px-1">
                      {layer.blendMode && layer.blendMode !== "source-over" ? "Filter" : "Layer"}
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
                        mergeLayerDown(layer.id);
                      }}
                      disabled={!canMergeDown}
                      className="p-1 rounded text-text-quaternary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
                      title={t.mergeDown}
                    >
                      <MergeDownIcon className="w-3.5 h-3.5" />
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
      {activeLayerId && activeLayer && (
        <div className="px-3 py-2 border-t border-border-default bg-surface-secondary shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary">{t.opacity}:</span>
            <input
              type="range"
              min="0"
              max="100"
              value={activeLayer.opacity}
              onChange={(e) => updateLayerOpacity(activeLayerId, Number(e.target.value))}
              className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
            />
            <span className="text-xs text-text-secondary w-8 text-right">
              {activeLayer.opacity}%
            </span>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-text-secondary w-12">Blend:</span>
            <Select<LayerBlendMode>
              value={activeLayer.blendMode || "source-over"}
              onChange={(value) => updateLayer(activeLayerId, { blendMode: value })}
              options={BLEND_MODE_OPTIONS}
              size="sm"
              className="flex-1"
            />
          </div>
        </div>
      )}
    </div>
  );
}
