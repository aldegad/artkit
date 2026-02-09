"use client";

import { useCallback, useState } from "react";
import { GuideOrientation } from "../types";

type GuideDragState = { orientation: GuideOrientation; position: number } | null;

interface UseGuideDragPreviewReturn {
  guideDragPreview: GuideDragState;
  handleGuideDragStateChange: (dragState: GuideDragState) => void;
}

export function useGuideDragPreview(): UseGuideDragPreviewReturn {
  const [guideDragPreview, setGuideDragPreview] = useState<GuideDragState>(null);

  const handleGuideDragStateChange = useCallback((dragState: GuideDragState) => {
    setGuideDragPreview(dragState);
  }, []);

  return {
    guideDragPreview,
    handleGuideDragStateChange,
  };
}
