"use client";

import { useBufferMonitor } from "../../hooks/useBufferMonitor";
import { SpinnerIcon } from "@/shared/components/icons";

export function BufferIndicator() {
  const { isBuffering } = useBufferMonitor();

  if (!isBuffering) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
      <div className="flex items-center gap-2 bg-black/60 rounded-lg px-4 py-2">
        <SpinnerIcon className="w-5 h-5 text-white animate-spin" />
        <span className="text-white text-sm">Buffering...</span>
      </div>
    </div>
  );
}
