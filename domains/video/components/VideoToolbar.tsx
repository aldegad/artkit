"use client";

import Tooltip from "../../../shared/components/Tooltip";
import { NumberScrubber } from "@/shared/components";
import {
  MoveIcon,
  TransformIcon,
  HandIcon,
  ZoomSearchIcon,
  CropIcon,
  RazorToolIcon,
  MaskToolIcon,
  MagicWandIcon,
  DeleteIcon,
} from "@/shared/components/icons";
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
  onInterpolateGap?: () => void;
  canInterpolateGap?: boolean;
  isInterpolatingGap?: boolean;
  onDelete?: () => void;
  hasSelection?: boolean;
  previewZoom: number;
  setPreviewZoom: (zoom: number | ((z: number) => number)) => void;
  onPreviewFit: () => void;
  translations: {
    select: string;
    selectDesc: string;
    transform: string;
    transformDesc: string;
    hand: string;
    handDesc: string;
    zoomInOut: string;
    zoomToolTip: string;
    crop: string;
    cropDesc: string;
    trim: string;
    trimDesc: string;
    razor: string;
    razorDesc: string;
    mask: string;
    maskDesc: string;
    frameInterpolation: string;
    frameInterpolationDescription: string;
    delete: string;
    fitToScreen: string;
  };
}

export default function VideoToolbar({
  toolMode,
  onToolModeChange,
  onInterpolateGap,
  canInterpolateGap,
  isInterpolatingGap,
  onDelete,
  hasSelection,
  previewZoom,
  setPreviewZoom,
  onPreviewFit,
  translations: t,
}: VideoToolbarProps) {
  const toolButtons: ToolButton[] = [
    {
      mode: "select",
      name: t.select,
      description: t.selectDesc,
      shortcut: "V",
      keys: ["Drag: Move clip", "Drag edge: Trim in/out", "Alt+Drag: Duplicate"],
      icon: <MoveIcon />,
    },
    {
      mode: "transform",
      name: t.transform,
      description: t.transformDesc,
      shortcut: "T",
      keys: ["⌘T: Enter transform", "⇧: Keep aspect ratio", "⌥: From center", "Enter: Apply", "Esc: Cancel"],
      icon: <TransformIcon />,
    },
    {
      mode: "crop",
      name: t.crop,
      description: t.cropDesc,
      shortcut: "R",
      keys: ["Drag: Select crop area", "Handles: Resize", "Enter: Apply", "Esc: Cancel"],
      icon: <CropIcon />,
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
    {
      mode: "hand",
      name: t.hand,
      description: t.handDesc,
      shortcut: "H",
      keys: ["Drag: Pan preview"],
      icon: <HandIcon />,
    },
    {
      mode: "zoom",
      name: t.zoomInOut,
      description: t.zoomToolTip,
      shortcut: "Z",
      keys: ["Click: Zoom in", "Alt+Click: Zoom out"],
      icon: <ZoomSearchIcon />,
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

      {/* Separator */}
      <div className="w-px bg-border-default mx-0.5" />

      {/* AI gap interpolation */}
      <Tooltip
        content={
          <div className="flex flex-col gap-1">
            <span className="font-medium">{t.frameInterpolation}</span>
            <span className="text-text-tertiary text-[11px]">{t.frameInterpolationDescription}</span>
          </div>
        }
      >
        <button
          onClick={onInterpolateGap}
          disabled={!canInterpolateGap || isInterpolatingGap}
          className={`p-1.5 rounded transition-colors ${
            canInterpolateGap
              ? isInterpolatingGap
                ? "bg-accent-primary text-white cursor-wait"
                : "hover:bg-interactive-hover text-text-secondary hover:text-text-primary"
              : "text-text-quaternary cursor-not-allowed"
          }`}
        >
          <MagicWandIcon />
        </button>
      </Tooltip>

      {/* Separator */}
      <div className="w-px bg-border-default mx-0.5" />

      {/* Delete button */}
      <Tooltip content={t.delete} shortcut="Del">
        <button
          onClick={onDelete}
          disabled={!hasSelection}
          className={`p-1.5 rounded transition-colors ${
            hasSelection
              ? "hover:bg-red-500/20 text-text-secondary hover:text-red-400"
              : "text-text-quaternary cursor-not-allowed"
          }`}
        >
          <DeleteIcon />
        </button>
      </Tooltip>

      <div className="w-px bg-border-default mx-0.5" />

      <div className="flex items-center gap-1">
        <NumberScrubber
          value={previewZoom}
          onChange={setPreviewZoom}
          min={0.1}
          max={10}
          step={{ multiply: 1.25 }}
          format={(value) => `${Math.round(value * 100)}%`}
          size="sm"
          variant="zoom"
        />
        <button
          onClick={onPreviewFit}
          className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
          title={t.fitToScreen}
        >
          Fit
        </button>
      </div>
    </div>
  );
}
