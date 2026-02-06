"use client";

import Tooltip from "../../../shared/components/Tooltip";
import { VideoToolMode } from "../types";

interface ToolButton {
  mode: VideoToolMode;
  icon: React.ReactNode;
  name: string;
  description: string;
  shortcut: string;
  keys?: string[];
}

interface VideoToolbarProps {
  toolMode: VideoToolMode;
  onToolModeChange: (mode: VideoToolMode) => void;
  translations: {
    select: string;
    selectDesc: string;
    trim: string;
    trimDesc: string;
    razor: string;
    razorDesc: string;
    crop: string;
    cropDesc: string;
    mask: string;
    maskDesc: string;
  };
}

export default function VideoToolbar({
  toolMode,
  onToolModeChange,
  translations: t,
}: VideoToolbarProps) {
  const toolButtons: ToolButton[] = [
    {
      mode: "select",
      name: t.select,
      description: t.selectDesc,
      shortcut: "V",
      keys: ["Drag: Move clip", "Alt+Drag: Duplicate"],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
        </svg>
      ),
    },
    {
      mode: "trim",
      name: t.trim,
      description: t.trimDesc,
      shortcut: "T",
      keys: ["Drag edges: Adjust in/out points"],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 18h16M8 6v12M16 6v12" />
        </svg>
      ),
    },
    {
      mode: "razor",
      name: t.razor,
      description: t.razorDesc,
      shortcut: "C",
      keys: ["Click: Split clip at cursor"],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758a3 3 0 10-4.243 4.243 3 3 0 004.243-4.243zm0-5.758a3 3 0 10-4.243-4.243 3 3 0 004.243 4.243z" />
        </svg>
      ),
    },
    {
      mode: "crop",
      name: t.crop,
      description: t.cropDesc,
      shortcut: "R",
      keys: ["Drag: Set area", "Enter: Apply crop"],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" />
        </svg>
      ),
    },
    {
      mode: "mask",
      name: t.mask,
      description: t.maskDesc,
      shortcut: "M",
      keys: ["Draw: Paint mask", "Alt+Draw: Erase mask"],
      icon: (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="flex gap-0.5 bg-surface-secondary rounded p-0.5">
      {toolButtons.map((tool) => (
        <Tooltip
          key={tool.mode}
          content={
            <div className="flex flex-col gap-1">
              <span className="font-medium">{tool.name}</span>
              <span className="text-text-tertiary text-[11px]">{tool.description}</span>
              {tool.keys && tool.keys.length > 0 && (
                <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default">
                  {tool.keys.map((key, i) => (
                    <span key={i} className="text-[10px] text-text-tertiary font-mono">
                      {key}
                    </span>
                  ))}
                </div>
              )}
            </div>
          }
          shortcut={tool.shortcut}
        >
          <button
            onClick={() => onToolModeChange(tool.mode)}
            className={`p-1.5 rounded transition-colors ${
              toolMode === tool.mode
                ? "bg-accent-primary text-white"
                : "hover:bg-interactive-hover text-text-secondary hover:text-text-primary"
            }`}
          >
            {tool.icon}
          </button>
        </Tooltip>
      ))}
    </div>
  );
}
