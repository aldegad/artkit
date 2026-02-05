"use client";

import { useEditorState } from "../../contexts";

// ============================================
// Component
// ============================================

export function PanModeToggle() {
  const {
    state: { isPanLocked },
    setIsPanLocked,
  } = useEditorState();

  return (
    <button
      onClick={() => setIsPanLocked(!isPanLocked)}
      className={`
        relative p-3 rounded-full shadow-lg transition-all
        ${
          isPanLocked
            ? "bg-accent-primary text-white"
            : "bg-surface-secondary/90 text-text-secondary hover:bg-surface-tertiary"
        }
      `}
      title={isPanLocked ? "Pan mode ON (tap to disable)" : "Pan mode OFF (tap to enable)"}
    >
      {/* Hand icon */}
      <svg
        className="w-6 h-6"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
        />
      </svg>
      {/* Active indicator */}
      {isPanLocked && (
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
      )}
    </button>
  );
}
