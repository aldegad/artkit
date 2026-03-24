"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { calculateViewOffset } from "../utils/coordinateSystem";
import { getTextLayoutMetrics, renderTextLayerToCanvas, TEXT_LAYER_PADDING_X } from "../utils/textLayer";
import type { TextDraft, TextStyleSettings } from "../types";

interface TextEditorCanvasOverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  displaySize: { width: number; height: number };
  zoom: number;
  pan: { x: number; y: number };
  draft: TextDraft | null;
  styleSettings: TextStyleSettings;
  onChangePosition: (x: number, y: number) => void;
  onChangeText: (text: string) => void;
  onChangeSize: (width: number, height: number) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function TextEditorCanvasOverlay({
  canvasRef,
  displaySize,
  zoom,
  pan,
  draft,
  styleSettings,
  onChangePosition,
  onChangeText,
  onChangeSize,
  onApply,
  onCancel,
}: TextEditorCanvasOverlayProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionRef = useRef<{
    mode: "move" | "resize" | null;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);
  const [interactionMode, setInteractionMode] = useState<"move" | "resize" | null>(null);

  useEffect(() => {
    if (!draft || !textareaRef.current) return;
    textareaRef.current.focus();
  }, [draft]);

  useEffect(() => {
    if (!draft || !previewCanvasRef.current) return;
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
    const pixelScale = Math.max(1, zoom * dpr);

    renderTextLayerToCanvas(previewCanvasRef.current, {
      text: draft.text,
      width: draft.width,
      height: draft.height,
      fontFamily: styleSettings.fontFamily,
      fontSize: styleSettings.fontSize,
      fontWeight: styleSettings.fontWeight,
      fontStyle: styleSettings.fontStyle,
      textAlign: styleSettings.textAlign,
      verticalAlign: styleSettings.verticalAlign,
      color: styleSettings.color,
      lineHeight: styleSettings.lineHeight,
      letterSpacing: styleSettings.letterSpacing,
      backgroundColor: styleSettings.backgroundColor,
      strokeColor: styleSettings.strokeColor,
      strokeWidth: styleSettings.strokeWidth,
    }, {
      pixelScale,
    });
  }, [draft, styleSettings, zoom]);

  useEffect(() => {
    if (!draft || !interactionMode) return;

    const handlePointerMove = (event: PointerEvent) => {
      const interaction = interactionRef.current;
      if (!interaction) return;

      const deltaX = (event.clientX - interaction.startClientX) / zoom;
      const deltaY = (event.clientY - interaction.startClientY) / zoom;

      if (interaction.mode === "move") {
        onChangePosition(interaction.startX + deltaX, interaction.startY + deltaY);
        return;
      }

      if (interaction.mode === "resize") {
        onChangeSize(interaction.startWidth + deltaX, interaction.startHeight + deltaY);
      }
    };

    const handlePointerUp = () => {
      interactionRef.current = null;
      setInteractionMode(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [draft, interactionMode, onChangePosition, onChangeSize, zoom]);

  const overlayStyle = useMemo(() => {
    if (!draft || !canvasRef.current) return null;

    const canvasRect = canvasRef.current.getBoundingClientRect();
    const offset = calculateViewOffset({
      canvasSize: { width: canvasRect.width, height: canvasRect.height },
      displaySize,
      zoom,
      pan,
    });

    return {
      left: canvasRect.left + offset.x + draft.x * zoom,
      top: canvasRect.top + offset.y + draft.y * zoom,
      width: draft.width * zoom,
      height: draft.height * zoom,
      fontSize: Math.max(12, styleSettings.fontSize * zoom),
      fontFamily: styleSettings.fontFamily,
      fontWeight: styleSettings.fontWeight,
      fontStyle: styleSettings.fontStyle,
      color: styleSettings.color,
      textAlign: styleSettings.textAlign,
      lineHeight: styleSettings.lineHeight,
      letterSpacing: styleSettings.letterSpacing * zoom,
      backgroundColor: styleSettings.backgroundColor,
    } as const;
  }, [canvasRef, displaySize, draft, pan, styleSettings, zoom]);

  const textareaPaddingStyle = useMemo(() => {
    if (!draft || typeof document === "undefined") return null;
    const measureCanvas = document.createElement("canvas");
    const measureCtx = measureCanvas.getContext("2d");
    if (!measureCtx) return null;
    measureCtx.font = `${styleSettings.fontStyle} ${styleSettings.fontWeight} ${styleSettings.fontSize}px ${styleSettings.fontFamily}`;
    const metrics = getTextLayoutMetrics(measureCtx, {
      text: draft.text,
      width: draft.width,
      height: draft.height,
      fontFamily: styleSettings.fontFamily,
      fontSize: styleSettings.fontSize,
      fontWeight: styleSettings.fontWeight,
      fontStyle: styleSettings.fontStyle,
      textAlign: styleSettings.textAlign,
      verticalAlign: styleSettings.verticalAlign,
      color: styleSettings.color,
      lineHeight: styleSettings.lineHeight,
      letterSpacing: styleSettings.letterSpacing,
      backgroundColor: styleSettings.backgroundColor,
      strokeColor: styleSettings.strokeColor,
      strokeWidth: styleSettings.strokeWidth,
    });
    const scaledStartY = metrics.startY * zoom;
    const scaledBottomPadding = Math.max(0, draft.height * zoom - scaledStartY - metrics.blockHeight * zoom);
    return {
      paddingTop: scaledStartY,
      paddingBottom: scaledBottomPadding,
    };
  }, [draft, styleSettings, zoom]);

  if (!draft || !overlayStyle || !textareaPaddingStyle) return null;

  return (
    <div
      className="fixed z-[80] pointer-events-none"
      style={{
        left: overlayStyle.left,
        top: overlayStyle.top,
      }}
    >
      <div className="pointer-events-auto flex flex-col gap-1">
        <div
          className="relative"
          style={{
            width: overlayStyle.width,
            height: overlayStyle.height,
          }}
          onPointerDown={(event) => {
            if (!draft) return;
            const target = event.target as HTMLElement | null;
            if (target?.dataset.textResizeHandle === "true") return;
            if (target === textareaRef.current) return;
            interactionRef.current = {
              mode: "move",
              startClientX: event.clientX,
              startClientY: event.clientY,
              startX: draft.x,
              startY: draft.y,
              startWidth: draft.width,
              startHeight: draft.height,
            };
            setInteractionMode("move");
          }}
        >
          <div
            className="relative rounded border border-accent-primary shadow-lg overflow-hidden"
            style={{
              width: overlayStyle.width,
              height: overlayStyle.height,
            }}
          >
            <canvas
              ref={previewCanvasRef}
              className="absolute inset-0 w-full h-full pointer-events-none z-0"
              style={{ imageRendering: "auto" }}
            />
            <textarea
              ref={textareaRef}
              value={draft.text}
              onChange={(e) => onChangeText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
                  e.preventDefault();
                  onApply();
                }
                if (e.key === "Escape") {
                  e.preventDefault();
                  onCancel();
                }
              }}
              spellCheck={false}
              placeholder=""
              className="absolute inset-0 z-10 outline-none resize-none overflow-hidden bg-transparent border-0"
              style={{
                width: overlayStyle.width,
                height: overlayStyle.height,
                fontSize: overlayStyle.fontSize,
                fontFamily: overlayStyle.fontFamily,
                fontWeight: overlayStyle.fontWeight,
                fontStyle: overlayStyle.fontStyle,
                color: "transparent",
                caretColor: overlayStyle.color,
                textAlign: overlayStyle.textAlign,
                lineHeight: overlayStyle.lineHeight,
                letterSpacing: overlayStyle.letterSpacing,
                paddingLeft: TEXT_LAYER_PADDING_X * zoom,
                paddingRight: TEXT_LAYER_PADDING_X * zoom,
                paddingTop: textareaPaddingStyle.paddingTop,
                paddingBottom: textareaPaddingStyle.paddingBottom,
                backgroundColor: "transparent",
                whiteSpace: "pre-wrap",
              }}
            />
          </div>
          <button
            type="button"
            data-text-resize-handle="true"
            onPointerDown={(event) => {
              if (!draft) return;
              event.preventDefault();
              event.stopPropagation();
              interactionRef.current = {
                mode: "resize",
                startClientX: event.clientX,
                startClientY: event.clientY,
                startX: draft.x,
                startY: draft.y,
                startWidth: draft.width,
                startHeight: draft.height,
              };
              setInteractionMode("resize");
            }}
            className="absolute left-full top-full z-20 ml-2 mt-2 w-5 h-5 rounded-md border-2 border-accent-primary bg-white shadow cursor-nwse-resize"
            title="크기 조절"
          />
        </div>
        <div className="flex items-center justify-end gap-1 text-[11px]">
          <button
            type="button"
            onClick={onCancel}
            className="px-2 py-1 rounded bg-surface-secondary border border-border-default hover:bg-interactive-hover"
          >
            취소
          </button>
          <button
            type="button"
            onClick={onApply}
            className="px-2 py-1 rounded bg-accent-primary text-white hover:bg-accent-hover"
          >
            적용
          </button>
        </div>
      </div>
    </div>
  );
}
