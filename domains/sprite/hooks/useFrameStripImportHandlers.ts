"use client";

import { useCallback, useState, type DragEvent } from "react";
import type { SpriteFrame } from "../types";

interface UseFrameStripImportHandlersOptions {
  nextFrameId: number;
  pushHistory: () => void;
  setNextFrameId: (nextFrameId: number) => void;
  setCurrentFrameIndex: (index: number) => void;
  addTrack: (name?: string, frames?: SpriteFrame[]) => string;
}

interface UseFrameStripImportHandlersResult {
  isFileDragOver: boolean;
  handleFileDragOver: (event: DragEvent) => void;
  handleFileDragLeave: (event: DragEvent) => void;
  handleFileDrop: (event: DragEvent) => Promise<void>;
}

export function useFrameStripImportHandlers(
  options: UseFrameStripImportHandlersOptions
): UseFrameStripImportHandlersResult {
  const { nextFrameId, pushHistory, setNextFrameId, setCurrentFrameIndex, addTrack } = options;
  const [isFileDragOver, setIsFileDragOver] = useState(false);

  const handleFileDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer.types.includes("Files")) {
      setIsFileDragOver(true);
    }
  }, []);

  const handleFileDragLeave = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsFileDragOver(false);
  }, []);

  const handleFileDrop = useCallback(async (event: DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsFileDragOver(false);

    const files = Array.from(event.dataTransfer.files).filter((file) =>
      file.type.startsWith("image/"),
    );
    if (files.length === 0) return;

    files.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    pushHistory();

    let currentId = nextFrameId;
    const newFrames: SpriteFrame[] = [];

    for (const file of files) {
      await new Promise<void>((resolve) => {
        const reader = new FileReader();
        reader.onload = (event) => {
          const imageData = event.target?.result as string;
          const img = new Image();
          img.onload = () => {
            newFrames.push({
              id: currentId,
              points: [
                { x: 0, y: 0 },
                { x: img.width, y: 0 },
                { x: img.width, y: img.height },
                { x: 0, y: img.height },
              ],
              name: file.name.replace(/\.[^/.]+$/, ""),
              imageData,
              offset: { x: 0, y: 0 },
            });
            currentId += 1;
            resolve();
          };
          img.src = imageData;
        };
        reader.readAsDataURL(file);
      });
    }

    addTrack("Image Import", newFrames);
    setNextFrameId(currentId);
    setCurrentFrameIndex(0);
  }, [addTrack, nextFrameId, pushHistory, setCurrentFrameIndex, setNextFrameId]);

  return {
    isFileDragOver,
    handleFileDragOver,
    handleFileDragLeave,
    handleFileDrop,
  };
}
