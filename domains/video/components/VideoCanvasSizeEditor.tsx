"use client";

import { useCallback, useState } from "react";

interface VideoCanvasSizeEditorProps {
  canvasWidth: number;
  canvasHeight: number;
  onApplyCanvasSize: (width: number, height: number) => void;
}

const MAX_CANVAS_SIZE = 7680;

export default function VideoCanvasSizeEditor({
  canvasWidth,
  canvasHeight,
  onApplyCanvasSize,
}: VideoCanvasSizeEditorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [inputSize, setInputSize] = useState({ w: "", h: "" });

  const handleCanvasSizeSubmit = useCallback(() => {
    const width = parseInt(inputSize.w, 10);
    const height = parseInt(inputSize.h, 10);
    if (width > 0 && height > 0 && width <= MAX_CANVAS_SIZE && height <= MAX_CANVAS_SIZE) {
      onApplyCanvasSize(width, height);
    }
    setIsEditing(false);
  }, [inputSize, onApplyCanvasSize]);

  if (isEditing) {
    return (
      <form
        className="flex items-center gap-0.5"
        onSubmit={(event) => {
          event.preventDefault();
          handleCanvasSizeSubmit();
        }}
      >
        <input
          type="number"
          defaultValue={canvasWidth}
          onChange={(event) => setInputSize((prev) => ({ ...prev, w: event.target.value }))}
          onFocus={(event) => event.target.select()}
          autoFocus
          className="w-14 px-1 py-0.5 rounded bg-surface-tertiary border border-border-default text-xs text-text-primary text-center focus:outline-none focus:border-accent-primary"
          min={1}
          max={MAX_CANVAS_SIZE}
        />
        <span className="text-xs text-text-quaternary">x</span>
        <input
          type="number"
          defaultValue={canvasHeight}
          onChange={(event) => setInputSize((prev) => ({ ...prev, h: event.target.value }))}
          onFocus={(event) => event.target.select()}
          className="w-14 px-1 py-0.5 rounded bg-surface-tertiary border border-border-default text-xs text-text-primary text-center focus:outline-none focus:border-accent-primary"
          min={1}
          max={MAX_CANVAS_SIZE}
        />
        <button
          type="submit"
          className="px-1.5 py-0.5 text-[10px] rounded bg-accent-primary text-white hover:bg-accent-hover transition-colors"
        >
          OK
        </button>
        <button
          type="button"
          onClick={() => setIsEditing(false)}
          className="px-1.5 py-0.5 text-[10px] rounded bg-surface-tertiary text-text-secondary hover:bg-interactive-hover transition-colors"
        >
          Cancel
        </button>
      </form>
    );
  }

  return (
    <button
      onClick={() => {
        setInputSize({ w: String(canvasWidth), h: String(canvasHeight) });
        setIsEditing(true);
      }}
      className="text-xs text-text-tertiary hover:text-text-secondary transition-colors"
      title="Change canvas size"
    >
      {canvasWidth}x{canvasHeight}
    </button>
  );
}
