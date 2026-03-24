"use client";

import { useState, useEffect } from "react";
import { EditorToolMode, AspectRatio, Point, CropArea, ASPECT_RATIOS, MarqueeSubTool, CropSizePivot, SelectionCombineMode, TextAlign, TextStyleSettings, TextVerticalAlign } from "../../types";
import { BrushPreset } from "../../types/brush";
import { BrushPresetSelector } from "./BrushPresetSelector";
import { Select, Scrollbar, NumberScrubber, Popover } from "../../../../shared/components";
import { LockAspectIcon, UnlockAspectIcon, SquareExpandIcon, SquareFitIcon, PivotIcon, CloseIcon, AlignLeftIcon, AlignCenterHIcon, AlignRightIcon, AlignTopIcon, AlignMiddleVIcon, AlignBottomIcon } from "@/shared/components/icons";
import { DeleteIcon } from "@/shared/components/icons";
import { INTERACTION } from "../../constants";

// ============================================
// Types
// ============================================

export interface EditorToolOptionsProps {
  toolMode: EditorToolMode;
  // Brush props
  brushSize: number;
  setBrushSize: React.Dispatch<React.SetStateAction<number>>;
  brushHardness: number;
  setBrushHardness: React.Dispatch<React.SetStateAction<number>>;
  brushOpacity: number;
  setBrushOpacity: React.Dispatch<React.SetStateAction<number>>;
  brushColor: string;
  setBrushColor: React.Dispatch<React.SetStateAction<string>>;
  stampSource: Point | null;
  selection: CropArea | null;
  selectionOffset: number;
  setSelectionOffset: React.Dispatch<React.SetStateAction<number>>;
  marqueeSubTool: MarqueeSubTool;
  setMarqueeSubTool: React.Dispatch<React.SetStateAction<MarqueeSubTool>>;
  selectionCombineMode: SelectionCombineMode;
  setSelectionCombineMode: React.Dispatch<React.SetStateAction<SelectionCombineMode>>;
  magicWandTolerance: number;
  setMagicWandTolerance: React.Dispatch<React.SetStateAction<number>>;
  magicWandAllowAlpha: boolean;
  setMagicWandAllowAlpha: React.Dispatch<React.SetStateAction<boolean>>;
  textStyle: TextStyleSettings;
  setTextStyle: React.Dispatch<React.SetStateAction<TextStyleSettings>>;
  textFontOptions: readonly string[];
  hasTextDraft: boolean;
  onApplyTextDraft: () => void;
  onCancelTextDraft: () => void;
  onClearSelection: () => void;
  onClearSelectionPixels: () => void;
  onInvertSelection: () => void;
  // Preset props
  activePreset: BrushPreset;
  presets: BrushPreset[];
  onSelectPreset: (preset: BrushPreset) => void;
  onDeletePreset: (presetId: string) => void;
  pressureEnabled: boolean;
  onPressureToggle: (enabled: boolean) => void;
  // Crop props
  aspectRatio: AspectRatio;
  setAspectRatio: React.Dispatch<React.SetStateAction<AspectRatio>>;
  cropArea: CropArea | null;
  canObjectFit: boolean;
  selectAll: () => void;
  clearCrop: () => void;
  // Extended crop props
  lockAspect: boolean;
  setLockAspect: React.Dispatch<React.SetStateAction<boolean>>;
  cropSizePivot: CropSizePivot;
  setCropSizePivot: React.Dispatch<React.SetStateAction<CropSizePivot>>;
  setCropSize: (width: number, height: number) => void;
  expandToSquare: () => void;
  fitToSquare: () => void;
  onObjectFit: () => void;
  onApplyCrop: () => void;
  // Tool name for default display
  currentToolName?: string;
  // Transform props
  isTransformActive?: boolean;
  transformAspectRatio?: AspectRatio;
  setTransformAspectRatio?: React.Dispatch<React.SetStateAction<AspectRatio>>;
  transformBounds?: CropArea | null;
  setTransformSizeByWidth?: (width: number) => void;
  setTransformSizeByHeight?: (height: number) => void;
  onApplyTransform?: () => void;
  onCancelTransform?: () => void;
  // Translations
  translations: {
    size: string;
    hardness: string;
    opacity: string;
    color: string;
    source: string;
    altClickToSetSource: string;
    feather: string;
    tolerance: string;
    allowAlpha: string;
    delete: string;
    presets: string;
    pressure: string;
    builtIn: string;
  };
}

// ============================================
// Component
// ============================================

export function EditorToolOptions({
  toolMode,
  brushSize,
  setBrushSize,
  brushHardness,
  setBrushHardness,
  brushOpacity,
  setBrushOpacity,
  brushColor,
  setBrushColor,
  stampSource,
  selection,
  selectionOffset,
  setSelectionOffset,
  marqueeSubTool,
  setMarqueeSubTool,
  selectionCombineMode,
  setSelectionCombineMode,
  magicWandTolerance,
  setMagicWandTolerance,
  magicWandAllowAlpha,
  setMagicWandAllowAlpha,
  textStyle,
  setTextStyle,
  textFontOptions,
  hasTextDraft,
  onApplyTextDraft,
  onCancelTextDraft,
  onClearSelection,
  onClearSelectionPixels,
  onInvertSelection,
  activePreset,
  presets,
  onSelectPreset,
  onDeletePreset,
  pressureEnabled,
  onPressureToggle,
  aspectRatio,
  setAspectRatio,
  cropArea,
  canObjectFit,
  selectAll,
  clearCrop,
  lockAspect,
  setLockAspect,
  cropSizePivot,
  setCropSizePivot,
  setCropSize,
  expandToSquare,
  fitToSquare,
  onObjectFit,
  onApplyCrop,
  currentToolName,
  isTransformActive,
  transformAspectRatio,
  setTransformAspectRatio,
  transformBounds,
  setTransformSizeByWidth,
  setTransformSizeByHeight,
  onApplyTransform,
  onCancelTransform,
  translations: t,
}: EditorToolOptionsProps) {
  const marqueeModeOptions: Array<{ value: MarqueeSubTool; label: string }> = [
    { value: "lasso", label: "올가미" },
    { value: "object", label: "오브젝트" },
    { value: "freeRect", label: "자유 사각형" },
    { value: "ratio1x1", label: "1:1" },
    { value: "ratio4x3", label: "4:3" },
    { value: "ratio16x9", label: "16:9" },
  ];
  const cropPivotOptions: Array<{ value: CropSizePivot; label: string; fx: number; fy: number }> = [
    { value: "topLeft", label: "Top Left", fx: 0, fy: 0 },
    { value: "topCenter", label: "Top Center", fx: 0.5, fy: 0 },
    { value: "topRight", label: "Top Right", fx: 1, fy: 0 },
    { value: "middleLeft", label: "Middle Left", fx: 0, fy: 0.5 },
    { value: "center", label: "Center", fx: 0.5, fy: 0.5 },
    { value: "middleRight", label: "Middle Right", fx: 1, fy: 0.5 },
    { value: "bottomLeft", label: "Bottom Left", fx: 0, fy: 1 },
    { value: "bottomCenter", label: "Bottom Center", fx: 0.5, fy: 1 },
    { value: "bottomRight", label: "Bottom Right", fx: 1, fy: 1 },
  ];
  const [isPivotPopoverOpen, setIsPivotPopoverOpen] = useState(false);
  const pivotLabel = cropPivotOptions.find((option) => option.value === cropSizePivot)?.label || "Center";

  // 자르기/변형 수치 입력: 입력 중에는 빈 칸·부분 입력 허용, blur 시에만 적용
  const [cropWidthInput, setCropWidthInput] = useState<string | null>(null);
  const [cropHeightInput, setCropHeightInput] = useState<string | null>(null);
  const [transformWidthInput, setTransformWidthInput] = useState<string | null>(null);
  const [transformHeightInput, setTransformHeightInput] = useState<string | null>(null);
  // 둘 다 빈값일 때 한쪽만 입력해도 반대쪽에 아무 값도 넣지 않음. 입력한 쪽만 pending에 보관 후 둘 다 있을 때 setCropSize 호출
  const [pendingCropWidth, setPendingCropWidth] = useState<number | null>(null);
  const [pendingCropHeight, setPendingCropHeight] = useState<number | null>(null);

  const MIN_SIZE = INTERACTION.MIN_CROP_SIZE;
  const hasValidWidth = cropArea && cropArea.width >= MIN_SIZE;
  const hasValidHeight = cropArea && cropArea.height >= MIN_SIZE;
  const effectiveCropWidth = hasValidWidth ? cropArea!.width : pendingCropWidth;
  const effectiveCropHeight = hasValidHeight ? cropArea!.height : pendingCropHeight;

  useEffect(() => {
    if (!cropArea) {
      setPendingCropWidth(null);
      setPendingCropHeight(null);
    }
  }, [cropArea]);

  const handleWidthChange = (newWidth: number) => {
    const w = Math.max(MIN_SIZE, newWidth);
    if (lockAspect && hasValidWidth && hasValidHeight) {
      const ratio = cropArea!.height / cropArea!.width;
      setCropSize(w, Math.round(w * ratio));
      setPendingCropWidth(null);
      setPendingCropHeight(null);
    } else {
      const height = hasValidHeight ? cropArea!.height : pendingCropHeight;
      if (height != null && height >= MIN_SIZE) {
        setCropSize(w, height);
        setPendingCropWidth(null);
        setPendingCropHeight(null);
      } else {
        setPendingCropWidth(w);
      }
    }
  };

  const handleHeightChange = (newHeight: number) => {
    const h = Math.max(MIN_SIZE, newHeight);
    if (lockAspect && hasValidWidth && hasValidHeight) {
      const ratio = cropArea!.width / cropArea!.height;
      setCropSize(Math.round(h * ratio), h);
      setPendingCropWidth(null);
      setPendingCropHeight(null);
    } else {
      const width = hasValidWidth ? cropArea!.width : pendingCropWidth;
      if (width != null && width >= MIN_SIZE) {
        setCropSize(width, h);
        setPendingCropWidth(null);
        setPendingCropHeight(null);
      } else {
        setPendingCropHeight(h);
      }
    }
  };

  const isTransformRatioLocked = (transformAspectRatio || "free") !== "free";
  return (
    <Scrollbar
      className="bg-surface-secondary border-b border-border-default shrink-0 min-h-[32px]"
      overflow={{ x: "scroll", y: "hidden" }}
    >
      <div className="flex items-center gap-2 px-3.5 py-1 whitespace-nowrap">
      {/* Brush and fill controls */}
      {(toolMode === "brush" || toolMode === "eraser" || toolMode === "stamp" || toolMode === "fill") && (
        <>
          {/* Preset selector for brush/eraser */}
          {(toolMode === "brush" || toolMode === "eraser") && (
            <BrushPresetSelector
              presets={presets}
              activePreset={activePreset}
              onSelectPreset={onSelectPreset}
              onDeletePreset={onDeletePreset}
              pressureEnabled={pressureEnabled}
              onPressureToggle={onPressureToggle}
              translations={{
                presets: t.presets,
                pressure: t.pressure,
                builtIn: t.builtIn,
              }}
            />
          )}

          {/* Size control - not for fill tool */}
          {toolMode !== "fill" && (
            <NumberScrubber
              value={brushSize}
              onChange={(v) => setBrushSize(Math.round(v))}
              min={1}
              max={200}
              step={1}
              label={`${t.size}:`}
              size="sm"
              editable
            />
          )}

          {(toolMode === "brush" || toolMode === "eraser") && (
            <NumberScrubber
              value={brushHardness}
              onChange={(v) => setBrushHardness(Math.round(v))}
              min={0}
              max={100}
              step={1}
              label={`${t.hardness}:`}
              format={(v) => `${Math.round(v)}%`}
              size="sm"
            />
          )}

          {(toolMode === "brush" || toolMode === "eraser") && (
            <NumberScrubber
              value={brushOpacity}
              onChange={(v) => setBrushOpacity(Math.round(v))}
              min={1}
              max={100}
              step={1}
              label={`${t.opacity}:`}
              format={(v) => `${Math.round(v)}%`}
              size="sm"
            />
          )}

          {(toolMode === "brush" || toolMode === "fill") && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-text-secondary">{t.color}:</span>
              <input
                type="color"
                value={brushColor}
                onChange={(e) => setBrushColor(e.target.value)}
                className="w-6 h-6 rounded cursor-pointer border border-border-default"
              />
              <span className="text-xs text-text-tertiary hidden md:inline">{brushColor}</span>
            </div>
          )}

          {toolMode === "stamp" && (
            <span className="text-xs text-text-secondary">
              {stampSource
                ? `${t.source}: (${Math.round(stampSource.x)}, ${Math.round(stampSource.y)})`
                : t.altClickToSetSource}
            </span>
          )}
        </>
      )}

      {toolMode === "marquee" && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">Shape:</span>
            <Select
              value={marqueeSubTool}
              onChange={(value) => setMarqueeSubTool(value as MarqueeSubTool)}
              options={marqueeModeOptions}
              size="sm"
            />
          </div>
          <div className="flex items-center gap-0.5" title="선택 영역 결합 모드 (새로/추가/제거/교차)">
            {(
              [
                { value: "new" as const, label: "새로", title: "새 선택 (기존 제거)" },
                { value: "add" as const, label: "+", title: "추가 영역 선택" },
                { value: "subtract" as const, label: "−", title: "선택 영역 제거" },
                { value: "intersect" as const, label: "∩", title: "선택 영역 교차" },
              ] as const
            ).map(({ value, label, title }) => (
              <button
                key={value}
                type="button"
                onClick={() => setSelectionCombineMode(value)}
                title={title}
                className={`min-w-[28px] h-7 px-1.5 text-xs rounded border transition-colors ${
                  selectionCombineMode === value
                    ? "bg-accent-primary text-white border-accent-primary"
                    : "bg-surface-primary border-border-default text-text-secondary hover:bg-interactive-hover hover:text-text-primary"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="w-px h-4 bg-border-default" />
          <NumberScrubber
            value={selectionOffset}
            onChange={(v) => setSelectionOffset(Math.max(-64, Math.min(64, Math.round(v * 2) / 2)))}
            min={-64}
            max={64}
            step={0.5}
            label="Offset:"
            format={(v) => `${v > 0 ? "+" : ""}${Number.isInteger(v) ? Math.round(v) : v.toFixed(1)}px`}
            size="sm"
          />
          <button
            onClick={onInvertSelection}
            disabled={!selection}
            className="px-3 py-1.5 text-xs font-medium rounded border border-border-default bg-surface-primary text-text-primary hover:bg-interactive-hover disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            title="선택 영역 반전"
          >
            선택 반전
          </button>
          <button
            onClick={onClearSelection}
            disabled={!selection}
            className="px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1 hover:bg-interactive-hover disabled:opacity-30 disabled:cursor-not-allowed"
            title="선택 해제"
          >
            <CloseIcon className="w-3.5 h-3.5" />
            <span>선택 해제</span>
          </button>
          <button
            onClick={onClearSelectionPixels}
            disabled={!selection}
            className="px-2 py-0.5 text-xs rounded transition-colors flex items-center gap-1 hover:bg-interactive-hover disabled:opacity-30 disabled:cursor-not-allowed"
            title={t.delete}
          >
            <DeleteIcon className="w-3.5 h-3.5" />
            <span>{t.delete}</span>
          </button>
        </div>
      )}

      {toolMode === "magicWand" && (
        <div className="flex items-center gap-2">
          <NumberScrubber
            value={magicWandTolerance}
            onChange={(v) => setMagicWandTolerance(Math.max(0, Math.min(255, Math.round(v))))}
            min={0}
            max={255}
            step={1}
            label={`${t.tolerance}:`}
            size="sm"
          />
          <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer select-none">
            <input
              type="checkbox"
              checked={magicWandAllowAlpha}
              onChange={(event) => setMagicWandAllowAlpha(event.target.checked)}
              className="w-3.5 h-3.5 rounded accent-accent-primary"
            />
            {t.allowAlpha}
          </label>
          <span className="text-xs text-text-tertiary">Click to auto-select similar connected color</span>
        </div>
      )}

      {toolMode === "text" && (
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">폰트:</span>
            <Select
              value={textStyle.fontFamily}
              onChange={(value) => setTextStyle((prev) => ({ ...prev, fontFamily: value }))}
              options={textFontOptions.map((font) => ({ value: font, label: font }))}
              size="sm"
            />
          </div>
          <NumberScrubber
            value={textStyle.fontSize}
            onChange={(v) => setTextStyle((prev) => ({ ...prev, fontSize: Math.max(8, Math.round(v)) }))}
            min={8}
            max={240}
            step={1}
            label="크기:"
            size="sm"
            editable
          />
          <NumberScrubber
            value={textStyle.lineHeight * 100}
            onChange={(v) => setTextStyle((prev) => ({ ...prev, lineHeight: Math.max(80, Math.round(v)) / 100 }))}
            min={80}
            max={300}
            step={5}
            label="줄간:"
            format={(v) => `${Math.round(v)}%`}
            size="sm"
          />
          <NumberScrubber
            value={textStyle.letterSpacing}
            onChange={(v) => setTextStyle((prev) => ({ ...prev, letterSpacing: Math.max(-20, Math.min(100, Math.round(v))) }))}
            min={-20}
            max={100}
            step={1}
            label="자간:"
            size="sm"
            editable
          />
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => setTextStyle((prev) => ({ ...prev, fontWeight: prev.fontWeight === "bold" ? "normal" : "bold" }))}
              className={`px-2 py-1 text-xs rounded border ${textStyle.fontWeight === "bold" ? "bg-accent-primary text-white border-accent-primary" : "bg-surface-primary border-border-default hover:bg-interactive-hover"}`}
              title="굵게"
            >
              B
            </button>
            <button
              type="button"
              onClick={() => setTextStyle((prev) => ({ ...prev, fontStyle: prev.fontStyle === "italic" ? "normal" : "italic" }))}
              className={`px-2 py-1 text-xs rounded border italic ${textStyle.fontStyle === "italic" ? "bg-accent-primary text-white border-accent-primary" : "bg-surface-primary border-border-default hover:bg-interactive-hover"}`}
              title="기울임"
            >
              I
            </button>
          </div>
          <div className="flex items-center gap-0.5">
            {([
              { value: "left" as TextAlign, title: "왼쪽 정렬", icon: <AlignLeftIcon className="w-3.5 h-3.5" /> },
              { value: "center" as TextAlign, title: "가운데 정렬", icon: <AlignCenterHIcon className="w-3.5 h-3.5" /> },
              { value: "right" as TextAlign, title: "오른쪽 정렬", icon: <AlignRightIcon className="w-3.5 h-3.5" /> },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTextStyle((prev) => ({ ...prev, textAlign: option.value }))}
                className={`p-1.5 rounded border ${textStyle.textAlign === option.value ? "bg-accent-primary text-white border-accent-primary" : "bg-surface-primary border-border-default hover:bg-interactive-hover"}`}
                title={option.title}
              >
                {option.icon}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-0.5">
            {([
              { value: "top" as TextVerticalAlign, title: "위쪽 정렬", icon: <AlignTopIcon className="w-3.5 h-3.5" /> },
              { value: "middle" as TextVerticalAlign, title: "가운데 정렬", icon: <AlignMiddleVIcon className="w-3.5 h-3.5" /> },
              { value: "bottom" as TextVerticalAlign, title: "아래쪽 정렬", icon: <AlignBottomIcon className="w-3.5 h-3.5" /> },
            ]).map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setTextStyle((prev) => ({ ...prev, verticalAlign: option.value }))}
                className={`p-1.5 rounded border ${textStyle.verticalAlign === option.value ? "bg-accent-primary text-white border-accent-primary" : "bg-surface-primary border-border-default hover:bg-interactive-hover"}`}
                title={option.title}
              >
                {option.icon}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">색상:</span>
            <input
              type="color"
              value={textStyle.color}
              onChange={(e) => setTextStyle((prev) => ({ ...prev, color: e.target.value }))}
              className="w-6 h-6 rounded cursor-pointer border border-border-default"
            />
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">배경:</span>
            <input
              type="color"
              value={textStyle.backgroundColor || "#ffffff"}
              onChange={(e) => setTextStyle((prev) => ({ ...prev, backgroundColor: e.target.value }))}
              className="w-6 h-6 rounded cursor-pointer border border-border-default"
            />
            <button
              type="button"
              onClick={() => setTextStyle((prev) => ({ ...prev, backgroundColor: null }))}
              className="px-1.5 py-1 text-[11px] rounded border border-border-default bg-surface-primary hover:bg-interactive-hover"
            >
              없음
            </button>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">외곽선:</span>
            <input
              type="color"
              value={textStyle.strokeColor}
              onChange={(e) => setTextStyle((prev) => ({ ...prev, strokeColor: e.target.value }))}
              className="w-6 h-6 rounded cursor-pointer border border-border-default"
            />
          </div>
          <NumberScrubber
            value={textStyle.strokeWidth}
            onChange={(v) => setTextStyle((prev) => ({ ...prev, strokeWidth: Math.max(0, Math.round(v)) }))}
            min={0}
            max={24}
            step={1}
            label="선폭:"
            size="sm"
            editable
          />
          <button
            type="button"
            onClick={onCancelTextDraft}
            disabled={!hasTextDraft}
            className="px-2 py-1 text-xs rounded border border-border-default bg-surface-primary hover:bg-interactive-hover disabled:opacity-30 disabled:cursor-not-allowed"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onApplyTextDraft}
            disabled={!hasTextDraft}
            className="px-2 py-1 text-xs rounded bg-accent-primary text-white hover:bg-accent-hover disabled:opacity-30 disabled:cursor-not-allowed"
          >
            적용
          </button>
        </div>
      )}

      {/* Crop ratio and canvas resize controls */}
      {toolMode === "crop" && (
        <div className="flex items-center gap-2">
          {/* Aspect ratio selector */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">Ratio:</span>
            <Select
              value={aspectRatio}
              onChange={(value) => setAspectRatio(value as AspectRatio)}
              options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
              size="sm"
            />
          </div>

          {/* Width/Height input */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-text-secondary">W:</span>
            <input
              type="number"
              value={cropWidthInput !== null ? cropWidthInput : (effectiveCropWidth != null ? String(Math.round(effectiveCropWidth)) : "")}
              onFocus={() => setCropWidthInput(effectiveCropWidth != null ? String(Math.round(effectiveCropWidth)) : "")}
              onChange={(e) => setCropWidthInput(e.target.value)}
              onBlur={() => {
                const parsed = parseInt(cropWidthInput ?? "", 10);
                if (!Number.isNaN(parsed)) {
                  handleWidthChange(Math.max(MIN_SIZE, parsed));
                }
                setCropWidthInput(null);
              }}
              placeholder="---"
              className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
              min={MIN_SIZE}
            />
            <span className="text-xs text-text-tertiary">×</span>
            <span className="text-xs text-text-secondary">H:</span>
            <input
              type="number"
              value={cropHeightInput !== null ? cropHeightInput : (effectiveCropHeight != null ? String(Math.round(effectiveCropHeight)) : "")}
              onFocus={() => setCropHeightInput(effectiveCropHeight != null ? String(Math.round(effectiveCropHeight)) : "")}
              onChange={(e) => setCropHeightInput(e.target.value)}
              onBlur={() => {
                const parsed = parseInt(cropHeightInput ?? "", 10);
                if (!Number.isNaN(parsed)) {
                  handleHeightChange(Math.max(MIN_SIZE, parsed));
                }
                setCropHeightInput(null);
              }}
              placeholder="---"
              className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
              min={MIN_SIZE}
            />
            {/* Lock aspect ratio button */}
            <button
              onClick={() => setLockAspect(!lockAspect)}
              className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                lockAspect
                  ? "bg-accent-primary text-white"
                  : "hover:bg-interactive-hover text-text-secondary"
              }`}
              title={lockAspect ? "Unlock aspect ratio" : "Lock aspect ratio"}
            >
              {lockAspect ? (
                <LockAspectIcon />
              ) : (
                <UnlockAspectIcon />
              )}
            </button>
            <Popover
              trigger={(
                <button
                  className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                    isPivotPopoverOpen
                      ? "bg-accent-primary text-white"
                      : "hover:bg-interactive-hover text-text-secondary"
                  }`}
                  title={`Pivot: ${pivotLabel}`}
                >
                  <PivotIcon className="w-3.5 h-3.5" />
                </button>
              )}
              open={isPivotPopoverOpen}
              onOpenChange={setIsPivotPopoverOpen}
              align="start"
              side="bottom"
              sideOffset={4}
              closeOnScroll={false}
              className="p-1"
            >
              <div className="grid grid-cols-3 gap-1">
                {cropPivotOptions.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      setCropSizePivot(option.value);
                      setIsPivotPopoverOpen(false);
                    }}
                    className={`w-7 h-7 rounded border transition-colors flex items-center justify-center ${
                      cropSizePivot === option.value
                        ? "bg-accent-primary text-white border-accent-primary"
                        : "hover:bg-interactive-hover border-border-default text-text-secondary"
                    }`}
                    title={option.label}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        cropSizePivot === option.value ? "bg-white" : "bg-current"
                      }`}
                      style={{
                        transform: `translate(${(option.fx - 0.5) * 6}px, ${(option.fy - 0.5) * 6}px)`,
                      }}
                    />
                  </button>
                ))}
              </div>
            </Popover>
          </div>

          {/* Divider */}
          <div className="w-px h-4 bg-border-default" />

          {/* All, Expand/Fit, Object Fit, Apply, Clear buttons */}
          <button
            onClick={selectAll}
            className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
          >
            All
          </button>
          {aspectRatio !== "free" && (
            <>
              <button
                onClick={expandToSquare}
                className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
                title="Cover canvas with selected ratio (can expand outside canvas)"
              >
                <SquareExpandIcon />
                <span>Expand</span>
              </button>
              <button
                onClick={fitToSquare}
                className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5"
                title="Contain inside canvas with selected ratio"
              >
                <SquareFitIcon />
                <span>Fit</span>
              </button>
            </>
          )}
          <button
            onClick={onObjectFit}
            disabled={!canObjectFit}
            className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors flex items-center gap-0.5 disabled:opacity-30 disabled:cursor-not-allowed"
            title="Contain using active layer bounds"
          >
            <SquareFitIcon />
            <span>Object Fit</span>
          </button>
          {cropArea && (
            <>
              <button
                onClick={onApplyCrop}
                className="px-1.5 py-0.5 text-xs bg-accent-primary text-white hover:bg-accent-primary/90 rounded transition-colors font-medium"
                title="Apply crop/resize to canvas"
              >
                Apply
              </button>
              <button
                onClick={clearCrop}
                className="px-1.5 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
              >
                Clear
              </button>
            </>
          )}
        </div>
      )}

      {/* Transform controls */}
      {toolMode === "transform" && (
        <div className="flex items-center gap-2">
          {/* Aspect ratio selector for transform */}
          {isTransformActive && setTransformAspectRatio && (
            <>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-secondary">Ratio:</span>
                <Select
                  value={transformAspectRatio || "free"}
                  onChange={(value) => setTransformAspectRatio(value as AspectRatio)}
                  options={ASPECT_RATIOS.map((r) => ({ value: r.value, label: r.label }))}
                  size="sm"
                />
              </div>
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-secondary">W:</span>
                <input
                  type="number"
                  value={transformWidthInput !== null ? transformWidthInput : (transformBounds?.width ? String(Math.round(transformBounds.width)) : "")}
                  onFocus={() => setTransformWidthInput(transformBounds?.width != null ? String(Math.round(transformBounds.width)) : "")}
                  onChange={(e) => setTransformWidthInput(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(transformWidthInput ?? "", 10);
                    if (!Number.isNaN(parsed)) {
                      setTransformSizeByWidth?.(Math.max(MIN_SIZE, parsed));
                    }
                    setTransformWidthInput(null);
                  }}
                  placeholder="---"
                  className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
                  min={MIN_SIZE}
                />
                <span className="text-xs text-text-tertiary">×</span>
                <span className="text-xs text-text-secondary">H:</span>
                <input
                  type="number"
                  value={transformHeightInput !== null ? transformHeightInput : (transformBounds?.height ? String(Math.round(transformBounds.height)) : "")}
                  onFocus={() => setTransformHeightInput(transformBounds?.height != null ? String(Math.round(transformBounds.height)) : "")}
                  onChange={(e) => setTransformHeightInput(e.target.value)}
                  onBlur={() => {
                    const parsed = parseInt(transformHeightInput ?? "", 10);
                    if (!Number.isNaN(parsed)) {
                      setTransformSizeByHeight?.(Math.max(MIN_SIZE, parsed));
                    }
                    setTransformHeightInput(null);
                  }}
                  placeholder="---"
                  className="w-14 px-1 py-0.5 bg-surface-primary border border-border-default rounded text-xs text-center focus:outline-none focus:border-accent-primary"
                  min={MIN_SIZE}
                />
                <button
                  onClick={() =>
                    setTransformAspectRatio?.(isTransformRatioLocked ? "free" : "fixed")
                  }
                  className={`w-6 h-6 flex items-center justify-center rounded text-xs transition-colors ${
                    isTransformRatioLocked
                      ? "bg-accent-primary text-white"
                      : "hover:bg-interactive-hover text-text-secondary"
                  }`}
                  title={isTransformRatioLocked ? "Unlock aspect ratio" : "Lock aspect ratio"}
                >
                  {isTransformRatioLocked ? <LockAspectIcon /> : <UnlockAspectIcon />}
                </button>
              </div>
              <div className="w-px h-4 bg-border-default" />
            </>
          )}
          <span className="text-xs text-text-secondary">
            {isTransformActive
              ? "Drag handles to resize. Shift: keep ratio, Alt: from center"
              : "Select a layer with content to transform"}
          </span>
          {isTransformActive && (
            <>
              <div className="w-px h-4 bg-border-default" />
              <button
                onClick={onApplyTransform}
                className="px-2 py-0.5 text-xs bg-accent-primary text-white hover:bg-accent-primary/90 rounded transition-colors font-medium"
              >
                Apply (Enter)
              </button>
              <button
                onClick={onCancelTransform}
                className="px-2 py-0.5 text-xs hover:bg-interactive-hover rounded transition-colors"
              >
                Cancel (Esc)
              </button>
            </>
          )}
        </div>
      )}

      {/* Default message when no tool-specific controls */}
      {toolMode !== "brush" && toolMode !== "eraser" && toolMode !== "stamp" && toolMode !== "crop" && toolMode !== "fill" && toolMode !== "transform" && toolMode !== "marquee" && toolMode !== "magicWand" && (
        <span className="text-xs text-text-tertiary">{currentToolName}</span>
      )}
      </div>
    </Scrollbar>
  );
}
