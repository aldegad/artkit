"use client";

// ============================================
// Snap System Hook
// React hook wrapper for the snap system
// ============================================

import { useMemo, useState, useCallback } from "react";
import type { Point, BoundingBox, UnifiedLayer } from "@/shared/types";
import type {
  SnapSource,
  SnapResult,
  SnapConfig,
  SnapEdge,
  Guide,
} from "../types";
import { DEFAULT_SNAP_CONFIG } from "../types";
import {
  snapPoint as snapPointCore,
  snapBounds as snapBoundsCore,
  collectSnapSources,
  getActiveSnapSources,
} from "../utils/snapSystem";

// ============================================
// Types
// ============================================

export interface UseSnapSystemOptions {
  guides: Guide[];
  canvasSize: { width: number; height: number };
  layers?: UnifiedLayer[];
  activeLayerId?: string;
  config?: Partial<SnapConfig>;
}

export interface UseSnapSystemReturn {
  // Snap functions
  snapPoint: (point: Point) => { x: SnapResult; y: SnapResult };
  snapBounds: (
    bounds: BoundingBox,
    edges?: SnapEdge[]
  ) => { bounds: BoundingBox; snappedEdges: SnapResult[] };

  // Snap sources for rendering
  snapSources: SnapSource[];

  // Active snap state (what we're currently snapped to)
  activeSnapSources: SnapSource[];
  setActiveSnapSources: (sources: SnapSource[]) => void;
  clearActiveSnapSources: () => void;

  // Configuration
  config: SnapConfig;
}

// ============================================
// Hook Implementation
// ============================================

export function useSnapSystem(options: UseSnapSystemOptions): UseSnapSystemReturn {
  const {
    guides,
    canvasSize,
    layers,
    activeLayerId,
    config: configOverride,
  } = options;

  // Merge config with defaults
  const config = useMemo<SnapConfig>(
    () => ({
      ...DEFAULT_SNAP_CONFIG,
      ...configOverride,
    }),
    [configOverride]
  );

  // Track active snap sources for visual feedback
  const [activeSnapSources, setActiveSnapSources] = useState<SnapSource[]>([]);

  const clearActiveSnapSources = useCallback(() => {
    setActiveSnapSources([]);
  }, []);

  // Collect all snap sources
  const snapSources = useMemo(() => {
    if (!config.enabled) return [];

    return collectSnapSources({
      guides: config.sources.includes("guide") ? guides : undefined,
      canvasSize: config.sources.includes("canvas-edge") ? canvasSize : undefined,
      includeCanvasEdges: config.sources.includes("canvas-edge"),
      includeLayerEdges: config.sources.includes("layer-edge"),
      layers: config.sources.includes("layer-edge") ? layers : undefined,
      activeLayerId,
    });
  }, [guides, canvasSize, layers, activeLayerId, config]);

  // Snap point function
  const snapPoint = useCallback(
    (point: Point): { x: SnapResult; y: SnapResult } => {
      if (!config.enabled) {
        return {
          x: { snapped: false, position: point.x, source: null, delta: 0 },
          y: { snapped: false, position: point.y, source: null, delta: 0 },
        };
      }

      const result = snapPointCore(point, snapSources, config.tolerance);

      // Update active snap sources for visual feedback
      const newActiveSources: SnapSource[] = [];
      if (result.x.snapped && result.x.source) {
        newActiveSources.push(result.x.source);
      }
      if (result.y.snapped && result.y.source) {
        newActiveSources.push(result.y.source);
      }
      setActiveSnapSources(newActiveSources);

      return result;
    },
    [config.enabled, config.tolerance, snapSources]
  );

  // Snap bounds function
  const snapBounds = useCallback(
    (
      bounds: BoundingBox,
      edges: SnapEdge[] = ["left", "right", "top", "bottom"]
    ): { bounds: BoundingBox; snappedEdges: SnapResult[] } => {
      if (!config.enabled) {
        return { bounds, snappedEdges: [] };
      }

      const result = snapBoundsCore(bounds, snapSources, config.tolerance, edges);

      // Update active snap sources for visual feedback
      const newActiveSources = getActiveSnapSources(result.snappedEdges);
      setActiveSnapSources(newActiveSources);

      return result;
    },
    [config.enabled, config.tolerance, snapSources]
  );

  return {
    snapPoint,
    snapBounds,
    snapSources,
    activeSnapSources,
    setActiveSnapSources,
    clearActiveSnapSources,
    config,
  };
}
