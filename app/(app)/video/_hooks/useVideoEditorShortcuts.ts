"use client";

import { useCallback, type RefObject } from "react";
import type { Clip } from "@/domains/video";
import { useVideoKeyboardShortcuts } from "@/domains/video/hooks";
import { useHorizontalWheelCapture } from "@/shared/hooks";

type VideoKeyboardShortcutOptions = Parameters<typeof useVideoKeyboardShortcuts>[0];

type UseVideoEditorShortcutsOptions = Omit<
  VideoKeyboardShortcutOptions,
  "handleStartTransformShortcut"
> & {
  rootRef: RefObject<HTMLElement | null>;
  selectedVisualClip: Clip | null;
  handleStartTransformShortcut: (hasVisualClip: boolean) => void;
};

export function useVideoEditorShortcuts(options: UseVideoEditorShortcutsOptions): void {
  const {
    rootRef,
    selectedVisualClip,
    handleStartTransformShortcut,
    ...keyboardOptions
  } = options;

  const handleStartTransformShortcutAction = useCallback(() => {
    handleStartTransformShortcut(Boolean(selectedVisualClip));
  }, [handleStartTransformShortcut, selectedVisualClip]);

  useVideoKeyboardShortcuts({
    ...keyboardOptions,
    handleStartTransformShortcut: handleStartTransformShortcutAction,
  });

  useHorizontalWheelCapture({ rootRef });
}
