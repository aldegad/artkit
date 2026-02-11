"use client";

import { ReactNode } from "react";
import { Tooltip, Scrollbar, NumberScrubber } from "@/shared/components";
import {
  BackgroundRemovalIcon,
  UndoIcon,
  RedoIcon,
  RotateIcon,
} from "@/shared/components/icons";
import { EditorToolMode } from "../../types";

interface ToolButton {
  mode: EditorToolMode;
  name: string;
  description: string;
  keys?: string[];
  shortcut?: string;
  icon: ReactNode;
}

export interface EditorActionToolbarProps {
  toolButtons: ToolButton[];
  toolMode: EditorToolMode;
  onToolModeChange: (mode: EditorToolMode) => void;
  onOpenBackgroundRemoval: () => void;
  isRemovingBackground: boolean;
  onUndo: () => void;
  onRedo: () => void;
  showRotateMenu: boolean;
  onToggleRotateMenu: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  zoom: number;
  setZoom: (zoom: number | ((z: number) => number)) => void;
  onFitToScreen: () => void;
  translations: {
    removeBackground: string;
    undo: string;
    redo: string;
    rotate: string;
    rotateLeft: string;
    rotateRight: string;
    fitToScreen: string;
  };
}

export function EditorActionToolbar({
  toolButtons,
  toolMode,
  onToolModeChange,
  onOpenBackgroundRemoval,
  isRemovingBackground,
  onUndo,
  onRedo,
  showRotateMenu,
  onToggleRotateMenu,
  onRotateLeft,
  onRotateRight,
  zoom,
  setZoom,
  onFitToScreen,
  translations: t,
}: EditorActionToolbarProps) {
  return (
    <Scrollbar
      className="bg-surface-primary border-b border-border-default shrink-0"
      overflow={{ x: "scroll", y: "hidden" }}
    >
      <div className="flex items-center gap-1 px-3.5 py-1 whitespace-nowrap">
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
                      {tool.keys.map((key, index) => (
                        <span key={index} className="text-[10px] text-text-tertiary font-mono">
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
                    : "hover:bg-interactive-hover"
                }`}
              >
                {tool.icon}
              </button>
            </Tooltip>
          ))}

          <div className="w-px bg-border-default mx-0.5" />

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{t.removeBackground}</span>
                <span className="text-text-tertiary text-[11px]">
                  AI 모델을 사용해 이미지 배경을 제거합니다
                </span>
                <span className="text-[10px] text-text-tertiary">
                  첫 실행 시 모델 다운로드 (~30MB)
                </span>
              </div>
            }
          >
            <button
              onClick={onOpenBackgroundRemoval}
              disabled={isRemovingBackground}
              className={`p-1.5 rounded transition-colors ${
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
              className="p-1 hover:bg-interactive-hover rounded transition-colors"
            >
              <UndoIcon className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content={`${t.redo} (Ctrl+Shift+Z)`}>
            <button
              onClick={onRedo}
              className="p-1 hover:bg-interactive-hover rounded transition-colors"
            >
              <RedoIcon className="w-4 h-4" />
            </button>
          </Tooltip>
        </div>

        <div className="h-4 w-px bg-border-default mx-1" />

        <div className="relative" onClick={(e) => e.stopPropagation()}>
          <Tooltip content={t.rotate}>
            <button
              onClick={onToggleRotateMenu}
              className={`p-1 hover:bg-interactive-hover rounded transition-colors ${showRotateMenu ? "bg-interactive-hover" : ""}`}
            >
              <RotateIcon className="w-4 h-4" />
            </button>
          </Tooltip>
          {showRotateMenu && (
            <div className="absolute top-full left-0 mt-1 bg-surface-primary border border-border-default rounded-lg shadow-lg z-50 p-1 min-w-max">
              <button
                onClick={onRotateLeft}
                className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-interactive-hover rounded text-sm text-left"
              >
                <UndoIcon className="w-4 h-4" />
                {t.rotateLeft} 90°
              </button>
              <button
                onClick={onRotateRight}
                className="flex items-center gap-2 w-full px-3 py-1.5 hover:bg-interactive-hover rounded text-sm text-left"
              >
                <RedoIcon className="w-4 h-4" />
                {t.rotateRight} 90°
              </button>
            </div>
          )}
        </div>

        <div className="h-4 w-px bg-border-default mx-1" />

        <div className="flex items-center gap-1">
          <NumberScrubber
            value={zoom}
            onChange={setZoom}
            min={0.1}
            max={10}
            step={{ multiply: 1.25 }}
            format={(value) => `${Math.round(value * 100)}%`}
            size="sm"
            variant="zoom"
          />
          <button
            onClick={onFitToScreen}
            className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
            title={t.fitToScreen}
          >
            Fit
          </button>
        </div>

        <div className="flex-1 min-w-0" />
      </div>
    </Scrollbar>
  );
}
