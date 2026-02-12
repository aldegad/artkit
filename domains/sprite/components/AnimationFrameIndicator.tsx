"use client";

import { useRef, useState } from "react";

interface AnimationFrameIndicatorProps {
  currentIndex: number;
  maxCount: number;
  onChange: (index: number) => void;
}

export function AnimationFrameIndicator({
  currentIndex,
  maxCount,
  onChange,
}: AnimationFrameIndicatorProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDoubleClick = () => {
    setEditValue(String(currentIndex + 1));
    setIsEditing(true);
    setTimeout(() => inputRef.current?.select(), 0);
  };

  const handleSubmit = () => {
    const num = parseInt(editValue, 10);
    if (!isNaN(num) && num >= 1 && num <= maxCount) {
      onChange(num - 1);
    }
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSubmit}
        onKeyDown={(e) => {
          if (e.key === "Enter") handleSubmit();
          if (e.key === "Escape") setIsEditing(false);
        }}
        className="w-12 text-xs text-center bg-surface-tertiary border border-border-default rounded px-1 py-0.5"
        autoFocus
      />
    );
  }

  return (
    <span
      onDoubleClick={handleDoubleClick}
      className="text-xs text-text-secondary cursor-default select-none tabular-nums"
      title="Double-click to edit"
    >
      {currentIndex + 1}/{maxCount}
    </span>
  );
}
