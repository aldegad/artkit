"use client";

import Tooltip from "./Tooltip";
import { ZoomSearchIcon } from "./icons";

interface PanZoomToolbarButtonsProps {
  isPanLocked: boolean;
  onTogglePanLock: () => void;
  translations: {
    panLockOn: string;
    panLockOff: string;
  };
}

export function PanZoomToolbarButtons({
  isPanLocked,
  onTogglePanLock,
  translations: t,
}: PanZoomToolbarButtonsProps) {
  return (
    <Tooltip content={isPanLocked ? t.panLockOn : t.panLockOff}>
      <button
        type="button"
        onClick={onTogglePanLock}
        aria-label="Touch pan lock"
        aria-pressed={isPanLocked}
        className={`relative p-1.5 rounded transition-colors ${
          isPanLocked
            ? "bg-accent-primary text-white"
            : "hover:bg-interactive-hover"
        }`}
      >
        <ZoomSearchIcon className="w-4 h-4" />
        {isPanLocked && (
          <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-green-400 rounded-full border border-surface-primary" />
        )}
      </button>
    </Tooltip>
  );
}
