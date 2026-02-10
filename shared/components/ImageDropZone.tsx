"use client";

import { useCallback, useRef } from "react";
import { useLanguage } from "../contexts";
import { FilmStripIcon, ImageIcon, DuplicateIcon, VideoCameraIcon } from "./icons";

type DropZoneVariant = "sprite" | "editor" | "converter" | "video";

interface ImageDropZoneProps {
  variant: DropZoneVariant;
  onFileSelect: (files: File[]) => void;
  accept?: string;
  className?: string;
}

const variantIcons: Record<DropZoneVariant, React.ReactNode> = {
  sprite: (
    <FilmStripIcon className="w-16 h-16 text-text-tertiary" />
  ),
  editor: (
    <ImageIcon className="w-16 h-16 text-text-tertiary" />
  ),
  converter: (
    <DuplicateIcon className="w-16 h-16 text-text-tertiary" />
  ),
  video: (
    <VideoCameraIcon className="w-16 h-16 text-text-tertiary" />
  ),
};

const variantMultiple: Record<DropZoneVariant, boolean> = {
  sprite: true,
  editor: false,
  converter: true,
  video: true,
};

export default function ImageDropZone({
  variant,
  onFileSelect,
  accept = "image/*",
  className = "",
}: ImageDropZoneProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useLanguage();
  const isMultiple = variantMultiple[variant];

  const variantTexts: Record<DropZoneVariant, { title: string; description: string }> = {
    sprite: {
      title: t.dragOrClickToOpen,
      description: t.selectImageForSprite,
    },
    editor: {
      title: t.dragOrClickToOpen,
      description: t.startImageEditing,
    },
    converter: {
      title: t.dragOrClickToSelect,
      description: t.selectImagesToConvert,
    },
    video: {
      title: t.dropMediaHere,
      description: t.dropMediaDesc,
    },
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const acceptParts = accept.split(",").map((a) => a.trim());
      const files = Array.from(e.dataTransfer.files).filter((f) =>
        acceptParts.some((a) => {
          if (a.endsWith("/*")) return f.type.startsWith(a.replace("/*", "/"));
          if (a.startsWith(".")) return f.name.toLowerCase().endsWith(a.toLowerCase());
          return f.type === a;
        })
      );
      if (files.length > 0) {
        onFileSelect(isMultiple ? files : [files[0]]);
      }
    },
    [onFileSelect, isMultiple, accept]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files || []);
      if (files.length > 0) {
        onFileSelect(isMultiple ? files : [files[0]]);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [onFileSelect, isMultiple]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
      className={`m-4 w-[calc(100%-2rem)] h-[calc(100%-2rem)] bg-surface-secondary border-2 border-dashed border-text-tertiary/50 rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-accent-primary hover:bg-surface-tertiary/50 transition-colors ${className}`}
    >
      {variantIcons[variant]}
      <div className="text-center">
        <p className="text-lg text-text-primary">{variantTexts[variant].title}</p>
        <p className="text-sm text-text-tertiary mt-1">{variantTexts[variant].description}</p>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={accept}
        multiple={isMultiple}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
