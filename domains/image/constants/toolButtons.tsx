"use client";

import React from "react";
import {
  MarqueeIcon,
  LassoIcon,
  MoveIcon,
  TransformIcon,
  BrushIcon,
  EraserIcon,
  MagicWandIcon,
  FillBucketIcon,
  EyedropperIcon,
  CloneStampIcon,
  CropIcon,
  HandIcon,
  ZoomSearchIcon,
} from "@/shared/components/icons";
import { EditorToolMode, MarqueeSubTool } from "../types";

export interface EditorToolButtonConfig {
  mode: EditorToolMode;
  icon: React.ReactNode;
  name: string;
  description: string;
  keys?: string[];
  shortcut: string;
}

export interface EditorToolButtonTranslations {
  marquee: string;
  move: string;
  moveToolTip: string;
  brush: string;
  brushToolTip: string;
  eraser: string;
  eraserToolTip: string;
  magicWand: string;
  magicWandToolTip: string;
  fill: string;
  fillToolTip: string;
  eyedropper: string;
  eyedropperToolTip: string;
  cloneStamp: string;
  cloneStampToolTip: string;
  crop: string;
  cropToolTip: string;
  hand: string;
  handToolTip: string;
  zoomInOut: string;
  zoomToolTip: string;
}

interface CreateEditorToolButtonsOptions {
  marqueeSubTool?: MarqueeSubTool;
}

export function createEditorToolButtons(
  t: EditorToolButtonTranslations,
  options: CreateEditorToolButtonsOptions = {}
): EditorToolButtonConfig[] {
  const marqueeIcon = options.marqueeSubTool === "lasso"
    ? <LassoIcon className="w-4 h-4" />
    : <MarqueeIcon className="w-4 h-4" />;

  return [
    {
      mode: "marquee",
      name: t.marquee,
      description: t.marquee,
      keys: ["⌥+Drag: Clone", "⇧: Axis lock", "Delete: Clear"],
      shortcut: "M",
      icon: marqueeIcon,
    },
    {
      mode: "move",
      name: t.move,
      description: t.moveToolTip,
      keys: ["Drag: Move selection"],
      shortcut: "V",
      icon: <MoveIcon className="w-4 h-4" />,
    },
    {
      mode: "transform",
      name: "Transform",
      description: "Scale and move layer content",
      keys: ["⌘T: Enter transform", "⇧: Keep aspect ratio", "⌥: From center", "Enter: Apply", "Esc: Cancel"],
      shortcut: "T",
      icon: <TransformIcon className="w-4 h-4" />,
    },
    {
      mode: "hand",
      name: t.hand,
      description: t.handToolTip,
      keys: ["Drag: Pan canvas", "Space: Temp hand", "Wheel: Zoom"],
      shortcut: "H",
      icon: <HandIcon className="w-4 h-4" />,
    },
    {
      mode: "zoom",
      name: t.zoomInOut,
      description: t.zoomToolTip,
      keys: ["Click: Zoom in", "⌥+Click: Zoom out", "Wheel: Zoom"],
      shortcut: "Z",
      icon: <ZoomSearchIcon className="w-4 h-4" />,
    },
    {
      mode: "crop",
      name: t.crop,
      description: t.cropToolTip,
      keys: ["Drag: Select area", "Enter: Apply crop"],
      shortcut: "C",
      icon: <CropIcon className="w-4 h-4" />,
    },
    {
      mode: "brush",
      name: t.brush,
      description: t.brushToolTip,
      keys: ["[ ]: Size -/+", "⇧: Straight line"],
      shortcut: "B",
      icon: <BrushIcon className="w-4 h-4" />,
    },
    {
      mode: "eraser",
      name: t.eraser,
      description: t.eraserToolTip,
      keys: ["[ ]: Size -/+"],
      shortcut: "E",
      icon: <EraserIcon className="w-4 h-4" />,
    },
    {
      mode: "magicWand",
      name: t.magicWand,
      description: t.magicWandToolTip,
      keys: ["Click: Select connected colors"],
      shortcut: "W",
      icon: <MagicWandIcon className="w-4 h-4" />,
    },
    {
      mode: "fill",
      name: t.fill,
      description: t.fillToolTip,
      keys: ["Click: Fill area"],
      shortcut: "G",
      icon: <FillBucketIcon className="w-4 h-4" />,
    },
    {
      mode: "eyedropper",
      name: t.eyedropper,
      description: t.eyedropperToolTip,
      keys: ["Click: Pick color", "⌥+Click: From any tool"],
      shortcut: "I",
      icon: <EyedropperIcon className="w-4 h-4" />,
    },
    {
      mode: "stamp",
      name: t.cloneStamp,
      description: t.cloneStampToolTip,
      keys: ["⌥+Click: Set source", "Drag: Clone paint"],
      shortcut: "S",
      icon: <CloneStampIcon className="w-4 h-4" />,
    },
  ];
}
