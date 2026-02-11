"use client";

import { Scrollbar, Tooltip } from "@/shared/components";
import { useLanguage } from "@/shared/contexts";
import {
  BrushIcon,
  EraserIcon,
  EyedropperIcon,
  CursorIcon,
  HandIcon,
  ZoomSearchIcon,
  CropIcon,
  BackgroundRemovalIcon,
  MagicWandIcon,
  FilmStripIcon,
  UndoIcon,
  RedoIcon,
} from "@/shared/components/icons";
import type { SpriteToolMode } from "../types";

interface SpriteTopToolbarProps {
  toolMode: SpriteToolMode;
  setSpriteToolMode: (mode: SpriteToolMode) => void;
  isRemovingBackground: boolean;
  isInterpolating: boolean;
  hasFramesWithImage: boolean;
  hasInterpolatableSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onRequestBackgroundRemoval: () => void;
  onRequestFrameInterpolation: () => void;
}

export default function SpriteTopToolbar({
  toolMode,
  setSpriteToolMode,
  isRemovingBackground,
  isInterpolating,
  hasFramesWithImage,
  hasInterpolatableSelection,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onRequestBackgroundRemoval,
  onRequestFrameInterpolation,
}: SpriteTopToolbarProps) {
  const { t } = useLanguage();

  return (
    <Scrollbar
      className="bg-surface-primary border-b border-border-default shrink-0"
      overflow={{ x: "scroll", y: "hidden" }}
    >
      <div className="flex items-center gap-1 px-3.5 py-1 whitespace-nowrap">
        <div className="flex gap-0.5 bg-surface-secondary rounded p-0.5">
          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.select}</span>
                <span className="text-text-tertiary text-[11px]">{t.selectToolTip}</span>
                <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default text-[10px] text-text-tertiary">
                  <span>{t.clickToSelect}</span>
                  <span>{t.dragToMove}</span>
                </div>
              </div>
            }
            shortcut="V"
          >
            <button
              onClick={() => setSpriteToolMode("select")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "select" ? "bg-accent-primary text-white" : "hover:bg-interactive-hover"
              }`}
            >
              <CursorIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.hand}</span>
                <span className="text-text-tertiary text-[11px]">{t.handToolTip}</span>
              </div>
            }
            shortcut="H"
          >
            <button
              onClick={() => setSpriteToolMode("hand")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "hand" ? "bg-accent-primary text-white" : "hover:bg-interactive-hover"
              }`}
            >
              <HandIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.brush}</span>
                <span className="text-text-tertiary text-[11px]">{t.brushToolTip}</span>
              </div>
            }
            shortcut="B"
          >
            <button
              onClick={() => setSpriteToolMode("brush")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "brush"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <BrushIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.eraser}</span>
                <span className="text-text-tertiary text-[11px]">{t.eraserToolTip}</span>
              </div>
            }
            shortcut="E"
          >
            <button
              onClick={() => setSpriteToolMode("eraser")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "eraser"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <EraserIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.magicWand}</span>
                <span className="text-text-tertiary text-[11px]">{t.magicWandToolTip}</span>
              </div>
            }
            shortcut="W"
          >
            <button
              onClick={() => setSpriteToolMode("magicwand")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "magicwand"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <MagicWandIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.eyedropper}</span>
                <span className="text-text-tertiary text-[11px]">{t.eyedropperToolTip}</span>
              </div>
            }
            shortcut="I"
          >
            <button
              onClick={() => setSpriteToolMode("eyedropper")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "eyedropper"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <EyedropperIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.zoomInOut}</span>
                <span className="text-text-tertiary text-[11px]">{t.zoomToolTip}</span>
              </div>
            }
            shortcut="Z"
          >
            <button
              onClick={() => setSpriteToolMode("zoom")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "zoom"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <ZoomSearchIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.crop}</span>
                <span className="text-text-tertiary text-[11px]">{t.cropToolTip}</span>
                <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default text-[10px] text-text-tertiary">
                  <span>Drag: Select crop area</span>
                  <span>Handles: Resize</span>
                  <span>Enter: Apply</span>
                  <span>Esc: Clear</span>
                </div>
              </div>
            }
            shortcut="R"
          >
            <button
              onClick={() => setSpriteToolMode("crop")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "crop"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <CropIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <div className="w-px bg-border-default mx-0.5" />

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.frameInterpolation}</span>
                <span className="text-text-tertiary text-[11px]">{t.frameInterpolationDescription}</span>
                <span className="text-[10px] text-text-tertiary">{t.interpolationFirstRunDownload}</span>
              </div>
            }
          >
            <button
              onClick={onRequestFrameInterpolation}
              disabled={isInterpolating || !hasInterpolatableSelection}
              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isInterpolating ? "bg-accent-primary text-white cursor-wait" : "hover:bg-interactive-hover"
              }`}
            >
              <FilmStripIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.removeBackground}</span>
                <span className="text-text-tertiary text-[11px]">AI 모델을 사용해 프레임 배경을 제거합니다</span>
                <span className="text-[10px] text-text-tertiary">첫 실행 시 모델 다운로드 (~30MB)</span>
              </div>
            }
          >
            <button
              onClick={onRequestBackgroundRemoval}
              disabled={isRemovingBackground || isInterpolating || !hasFramesWithImage}
              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isRemovingBackground ? "bg-accent-primary text-white cursor-wait" : "hover:bg-interactive-hover"
              }`}
            >
              <BackgroundRemovalIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <div className="w-px bg-border-default mx-0.5" />

          <Tooltip content={`${t.undo} (Ctrl+Z)`}>
            <button
              onClick={onUndo}
              disabled={!canUndo}
              className="p-1 hover:bg-interactive-hover disabled:opacity-30 rounded transition-colors"
            >
              <UndoIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip content={`${t.redo} (Ctrl+Shift+Z)`}>
            <button
              onClick={onRedo}
              disabled={!canRedo}
              className="p-1 hover:bg-interactive-hover disabled:opacity-30 rounded transition-colors"
            >
              <RedoIcon className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        <div className="flex-1 min-w-0" />
      </div>
    </Scrollbar>
  );
}
