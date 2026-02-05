"use client";

import React, { useState, useEffect, RefObject } from "react";
import { useEditorLayers } from "../contexts";
import { useLanguage } from "../../../shared/contexts";

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
          <svg className="w-5 h-5 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </div>
      )}
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
    layerCanvasesRef,
    draggedLayerId,
    setDraggedLayerId,
    dragOverLayerId,
    setDragOverLayerId,
    addPaintLayer,
    addImageLayer,
    selectLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    duplicateLayer,
    deleteLayer,
    renameLayer,
    updateLayerOpacity,
    reorderLayers,
  } = useEditorLayers();

  const { t } = useLanguage();

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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </button>
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
            .map((layer) => (
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
                onClick={() => selectLayer(layer.id)}
                className={`flex items-center gap-2 p-2 rounded-lg cursor-grab active:cursor-grabbing transition-all ${
                  activeLayerId === layer.id
                    ? "bg-accent-primary/20 border border-accent-primary/50"
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    {layer.visible ? (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                    ) : (
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                    )}
                  </svg>
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
                  <input
                    type="text"
                    value={layer.name}
                    onChange={(e) => renameLayer(layer.id, e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    className="w-full text-xs bg-transparent border-none focus:outline-none focus:bg-surface-secondary px-1 rounded truncate"
                  />
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
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {layer.locked ? (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                      ) : (
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
                      )}
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      duplicateLayer(layer.id);
                    }}
                    className="p-1 rounded text-text-quaternary hover:text-text-primary"
                    title={t.duplicateLayer}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteLayer(layer.id);
                    }}
                    className="p-1 rounded text-text-quaternary hover:text-accent-danger"
                    title={t.deleteLayer}
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))
        )}
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
