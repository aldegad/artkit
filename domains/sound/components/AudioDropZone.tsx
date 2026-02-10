"use client";

import { useCallback, useRef } from "react";
import { useSoundEditor } from "../contexts/SoundEditorContext";
import { useLanguage } from "@/shared/contexts/LanguageContext";
import { MusicNoteIcon } from "@/shared/components/icons";

export function AudioDropZone() {
  const { t } = useLanguage();
  const { loadAudio } = useSoundEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (file && file.type.startsWith("audio/")) {
        await loadAudio(file);
      }
    },
    [loadAudio]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  const handleClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
        await loadAudio(file);
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [loadAudio]
  );

  return (
    <div
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onClick={handleClick}
      className="m-4 w-[calc(100%-2rem)] h-[calc(100%-2rem)] bg-surface-secondary border-2 border-dashed border-text-tertiary/50 rounded-xl flex flex-col items-center justify-center gap-4 cursor-pointer hover:border-accent-primary hover:bg-surface-tertiary/50 transition-colors"
    >
      <MusicNoteIcon className="w-16 h-16 text-text-tertiary" />

      <div className="text-center">
        <p className="text-lg text-text-primary">{t.dragOrClickToOpen}</p>
        <p className="text-sm text-text-tertiary mt-1">
          MP3, WAV, OGG, M4A
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
