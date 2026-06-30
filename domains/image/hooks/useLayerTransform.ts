"use client";

import { useCallback } from "react";

interface UseLayerTransformOptions {
  transformLayerId: string | null;
  transformLayerIds: string[];
  applyTransform: () => void;
  clearTextLayerMetadata: (layerIds: string[]) => void;
}

export function useLayerTransform(options: UseLayerTransformOptions) {
  const {
    transformLayerId,
    transformLayerIds,
    applyTransform,
    clearTextLayerMetadata,
  } = options;

  const handleApplyTransform = useCallback(() => {
    const transformedLayerIds = (
      transformLayerIds.length > 0
        ? transformLayerIds
        : (transformLayerId ? [transformLayerId] : [])
    );
    applyTransform();
    clearTextLayerMetadata(transformedLayerIds);
  }, [applyTransform, clearTextLayerMetadata, transformLayerId, transformLayerIds]);

  return {
    handleApplyTransform,
  };
}
