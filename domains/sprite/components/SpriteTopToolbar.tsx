"use client";

import { Scrollbar, Tooltip } from "@/shared/components";
import { useLanguage } from "@/shared/contexts";
import {
  BrushIcon,
  CursorIcon,
  HandIcon,
  BackgroundRemovalIcon,
  MagicWandIcon,
  UndoIcon,
  RedoIcon,
} from "@/shared/components/icons";
import type { SpriteFrame, SpriteToolMode } from "../types";

interface SpriteTopToolbarProps {
  toolMode: SpriteToolMode;
  setSpriteToolMode: (mode: SpriteToolMode) => void;
  currentPoints: { x: number; y: number }[];
  selectedFrameId: number | null;
  selectedPointIndex: number | null;
  frames: SpriteFrame[];
  isRemovingBackground: boolean;
  isInterpolating: boolean;
  hasFramesWithImage: boolean;
  hasInterpolatableSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onUndoLastPoint: () => void;
  onCancelCurrentPolygon: () => void;
  onCompleteFrame: () => void;
  onRequestBackgroundRemoval: () => void;
  onRequestFrameInterpolation: () => void;
}

export default function SpriteTopToolbar({
  toolMode,
  setSpriteToolMode,
  currentPoints,
  selectedFrameId,
  selectedPointIndex,
  frames,
  isRemovingBackground,
  isInterpolating,
  hasFramesWithImage,
  hasInterpolatableSelection,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onUndoLastPoint,
  onCancelCurrentPolygon,
  onCompleteFrame,
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
                <span className="font-medium">{t.pen}</span>
                <span className="text-text-tertiary text-[11px]">{t.penToolTip}</span>
                <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default text-[10px] text-text-tertiary">
                  <span>{t.clickToAddPoint}</span>
                  <span>{t.firstPointToComplete}</span>
                </div>
              </div>
            }
            shortcut="P"
          >
            <button
              onClick={() => setSpriteToolMode("pen")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "pen"
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
                toolMode === "select"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
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
                <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-border-default text-[10px] text-text-tertiary">
                  <span>{t.dragToPan}</span>
                  <span>{t.spaceAltToPan}</span>
                  <span>{t.wheelToZoom}</span>
                </div>
              </div>
            }
            shortcut="H"
          >
            <button
              onClick={() => setSpriteToolMode("hand")}
              className={`p-1.5 rounded transition-colors ${
                toolMode === "hand"
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <HandIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <div className="w-px bg-border-default mx-0.5" />

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.frameInterpolation}</span>
                <span className="text-text-tertiary text-[11px]">
                  {t.frameInterpolationDescription}
                </span>
                <span className="text-[10px] text-text-tertiary">
                  {t.interpolationFirstRunDownload}
                </span>
              </div>
            }
          >
            <button
              onClick={onRequestFrameInterpolation}
              disabled={isInterpolating || !hasInterpolatableSelection}
              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isInterpolating
                  ? "bg-accent-primary text-white cursor-wait"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <MagicWandIcon className="w-4 h-4" />
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.removeBackground}</span>
                <span className="text-text-tertiary text-[11px]">
                  AI 모델을 사용해 프레임 배경을 제거합니다
                </span>
                <span className="text-[10px] text-text-tertiary">
                  첫 실행 시 모델 다운로드 (~30MB)
                </span>
              </div>
            }
          >
            <button
              onClick={onRequestBackgroundRemoval}
              disabled={isRemovingBackground || isInterpolating || !hasFramesWithImage}
              className={`p-1.5 rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
                isRemovingBackground
                  ? "bg-accent-primary text-white cursor-wait"
                  : "hover:bg-interactive-hover"
              }`}
            >
              <BackgroundRemovalIcon className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        <div className="h-4 w-px bg-border-default mx-1" />

        <div className="flex items-center gap-0.5">
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

        <div className="h-4 w-px bg-border-default mx-1" />

        {toolMode === "pen" && currentPoints.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={onUndoLastPoint}
              className="px-2 py-1 bg-accent-warning hover:bg-accent-warning-hover text-white rounded text-xs transition-colors"
            >
              {t.undo}
            </button>
            <button
              onClick={onCancelCurrentPolygon}
              className="px-2 py-1 bg-accent-danger hover:bg-accent-danger-hover text-white rounded text-xs transition-colors"
            >
              {t.cancel}
            </button>
            {currentPoints.length >= 3 && (
              <button
                onClick={onCompleteFrame}
                className="px-2 py-1 bg-accent-primary hover:bg-accent-primary-hover text-white rounded text-xs transition-colors"
              >
                {t.complete}
              </button>
            )}
            <span className="text-text-secondary text-xs">
              {t.points}: {currentPoints.length}
            </span>
          </div>
        )}

        {toolMode === "select" && selectedFrameId !== null && (
          <span className="text-accent-primary text-xs">
            {t.frame} {frames.findIndex((f) => f.id === selectedFrameId) + 1} {t.selected}
            {selectedPointIndex !== null && ` (${t.point} ${selectedPointIndex + 1})`}
          </span>
        )}

        <div className="flex-1 min-w-0" />
      </div>
    </Scrollbar>
  );
}
