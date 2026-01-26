"use client";

import { useCallback, useRef } from "react";
import { useLanguage } from "../contexts";

type DropZoneVariant = "sprite" | "editor" | "converter";

interface ImageDropZoneProps {
  variant: DropZoneVariant;
  onFileSelect: (files: File[]) => void;
  accept?: string;
  className?: string;
}

const variantIcons: Record<DropZoneVariant, React.ReactNode> = {
  sprite: (
    <svg className="w-16 h-16 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {/* Film strip icon */}
      <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={1.5} />
      <line x1="8" y1="4" x2="8" y2="20" strokeWidth={1.5} />
      <line x1="16" y1="4" x2="16" y2="20" strokeWidth={1.5} />
      <circle cx="5" cy="7" r="1" fill="currentColor" />
      <circle cx="5" cy="17" r="1" fill="currentColor" />
      <circle cx="12" cy="7" r="1" fill="currentColor" />
      <circle cx="12" cy="17" r="1" fill="currentColor" />
      <circle cx="19" cy="7" r="1" fill="currentColor" />
      <circle cx="19" cy="17" r="1" fill="currentColor" />
    </svg>
  ),
  editor: (
    <svg className="w-16 h-16 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {/* Image with edit icon */}
      <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={1.5} />
      <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 15l-5-5L5 21" />
    </svg>
  ),
  converter: (
    <svg className="w-16 h-16 text-text-tertiary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {/* Multiple images stack icon */}
      <rect x="6" y="6" width="14" height="14" rx="2" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 18V6a2 2 0 012-2h12" />
      <circle cx="11" cy="11" r="1.5" strokeWidth={1.5} />
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 14l-3-3-4 4" />
    </svg>
  ),
};

const variantMultiple: Record<DropZoneVariant, boolean> = {
  sprite: false,
  editor: false,
  converter: true,
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
  };

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
      if (files.length > 0) {
        onFileSelect(isMultiple ? files : [files[0]]);
      }
    },
    [onFileSelect, isMultiple]
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
