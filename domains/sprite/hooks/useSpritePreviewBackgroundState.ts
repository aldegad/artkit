"use client";

import { useCallback, useState } from "react";

type PreviewBackgroundType = "checkerboard" | "solid" | "image";

interface UseSpritePreviewBackgroundStateResult {
  bgType: PreviewBackgroundType;
  setBgType: (bgType: PreviewBackgroundType) => void;
  bgColor: string;
  setBgColor: (color: string) => void;
  bgImage: string | null;
  setBgImage: (bgImage: string | null) => void;
  handleBgImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function useSpritePreviewBackgroundState(): UseSpritePreviewBackgroundStateResult {
  const [bgType, setBgType] = useState<PreviewBackgroundType>("checkerboard");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgImage, setBgImage] = useState<string | null>(null);

  const handleBgImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setBgImage(src);
      setBgType("image");
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  return {
    bgType,
    setBgType,
    bgColor,
    setBgColor,
    bgImage,
    setBgImage,
    handleBgImageUpload,
  };
}
