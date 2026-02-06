"use client";

import Tooltip from "../../../shared/components/Tooltip";
import { CursorIcon, VideoCropToolIcon, TrimToolIcon, RazorToolIcon, MaskToolIcon } from "@/shared/components/icons";
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
    crop: string;
    cropDesc: string;
    trim: string;
    trimDesc: string;
    razor: string;
    razorDesc: string;
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
      icon: <CursorIcon />,
    },
    {
      mode: "crop",
      name: t.crop,
      description: t.cropDesc,
      shortcut: "R",
      keys: ["Drag: Select crop area", "Handles: Resize", "Enter: Apply", "Esc: Cancel"],
      icon: <VideoCropToolIcon />,
    },
    {
      mode: "trim",
      name: t.trim,
      description: t.trimDesc,
      shortcut: "T",
      keys: ["Drag edges: Adjust in/out points"],
      icon: <TrimToolIcon />,
    },
    {
      mode: "razor",
      name: t.razor,
      description: t.razorDesc,
      shortcut: "C",
      keys: ["Click: Split clip at cursor"],
      icon: <RazorToolIcon />,
    },
    {
      mode: "mask",
      name: t.mask,
      description: t.maskDesc,
      shortcut: "M",
      keys: ["Draw: Paint mask", "Alt+Draw: Erase mask"],
      icon: <MaskToolIcon />,
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
