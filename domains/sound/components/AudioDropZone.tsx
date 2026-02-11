"use client";

import { useCallback, useRef } from "react";
import { useSoundEditor } from "../contexts/SoundEditorContext";
import { useLanguage } from "@/shared/contexts/LanguageContext";
import { showErrorToast } from "@/shared/components";
import { MusicNoteIcon } from "@/shared/components/icons";

const ACCEPTED_AUDIO_EXTENSIONS = [".mp3", ".wav", ".ogg", ".m4a", ".aac", ".oga"] as const;
const ACCEPTED_VIDEO_EXTENSIONS = [".mp4", ".mov", ".webm", ".m4v", ".ogv"] as const;
const ACCEPTED_MEDIA_INPUT =
  "audio/*,video/*,.mp3,.wav,.ogg,.m4a,.aac,.oga,.mp4,.mov,.webm,.m4v,.ogv";

function hasAnyExtension(fileName: string, extensions: readonly string[]): boolean {
  const lower = fileName.toLowerCase();
  return extensions.some((ext) => lower.endsWith(ext));
}

function isSupportedMediaFile(file: File): boolean {
  const mimeType = file.type.toLowerCase();
  if (mimeType.startsWith("audio/") || mimeType.startsWith("video/")) {
    return true;
  }
  return (
    hasAnyExtension(file.name, ACCEPTED_AUDIO_EXTENSIONS) ||
    hasAnyExtension(file.name, ACCEPTED_VIDEO_EXTENSIONS)
  );
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "Unsupported media format or missing audio track.";
}

export function AudioDropZone() {
  const { t } = useLanguage();
  const { loadAudio } = useSoundEditor();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      const file = e.dataTransfer.files[0];
      if (!file || !isSupportedMediaFile(file)) return;

      try {
        await loadAudio(file);
      } catch (error) {
        console.error("[SoundEditor] Failed to load dropped media:", error);
        showErrorToast(`${t.importFailed}: ${toErrorMessage(error)}`);
      }
    },
    [loadAudio, t]
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
        try {
          await loadAudio(file);
        } catch (error) {
          console.error("[SoundEditor] Failed to load selected media:", error);
          showErrorToast(`${t.importFailed}: ${toErrorMessage(error)}`);
        }
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [loadAudio, t]
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
          MP3, WAV, OGG, M4A, MP4, MOV, WEBM
        </p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_MEDIA_INPUT}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
