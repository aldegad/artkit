"use client";

import { useCallback, useState } from "react";
import type { RifeInterpolationQuality } from "@/shared/ai/frameInterpolation";
import { readAISettings, updateAISettings } from "@/shared/ai/settings";

export function useVideoInterpolationControls() {
  const [videoInterpolationQuality, setVideoInterpolationQuality] = useState<RifeInterpolationQuality>(
    () => readAISettings().frameInterpolationQuality,
  );

  const handleVideoInterpolationQualityChange = useCallback((quality: RifeInterpolationQuality) => {
    setVideoInterpolationQuality(quality);
    updateAISettings({ frameInterpolationQuality: quality });
  }, []);

  return {
    videoInterpolationQuality,
    handleVideoInterpolationQualityChange,
  };
}
