"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useEditor } from "../contexts/SpriteEditorContext";
import { useLanguage } from "../../../shared/contexts";
import { compositeFrame } from "../utils/compositor";

// ============================================
// Component
// ============================================

export default function AnimationPreviewContent() {
  const { tracks, fps, setFps, toolMode, getMaxFrameCount } = useEditor();
  const { t } = useLanguage();

  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrameIndex, setCurrentFrameIndex] = useState(0);
  const [previewScale, setPreviewScale] = useState(2);
  const [isPanning, setIsPanning] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [bgType, setBgType] = useState<"checkerboard" | "solid" | "image">("checkerboard");
  const [bgColor, setBgColor] = useState("#000000");
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [compositedDataUrl, setCompositedDataUrl] = useState<string | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const maxFrameCount = getMaxFrameCount();

  // Preset colors for quick selection
  const presetColors = [
    { color: "#000000", label: t.colorBlack },
    { color: "#FFFFFF", label: t.colorWhite },
    { color: "#808080", label: t.colorGray },
    { color: "#87CEEB", label: t.colorSky },
    { color: "#90EE90", label: t.colorGreen },
    { color: "#FFB6C1", label: t.colorPink },
  ];

  // Handle background image upload
  const handleBgImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setBgImage(src);
      setBgType("image");
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = "";
  }, []);

  // Wheel zoom - 마우스 커서 위치 기준 확대/축소
  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();

      const container = containerRef.current;
      const canvas = canvasRef.current;
      if (!container || !canvas) return;

      const containerRect = container.getBoundingClientRect();
      const mouseX = e.clientX - containerRect.left;
      const mouseY = e.clientY - containerRect.top;

      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;

      // Calculate image coordinates under cursor (before zoom)
      const canvasTopLeftX = containerWidth / 2 + pan.x - canvasWidth / 2;
      const canvasTopLeftY = containerHeight / 2 + pan.y - canvasHeight / 2;

      const imageX = (mouseX - canvasTopLeftX) / previewScale;
      const imageY = (mouseY - canvasTopLeftY) / previewScale;

      // Calculate new scale
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      const newScale = Math.max(1, Math.min(20, previewScale * delta));

      if (newScale === previewScale) return;

      // New canvas size
      const newCanvasWidth = (canvasWidth / previewScale) * newScale;
      const newCanvasHeight = (canvasHeight / previewScale) * newScale;

      // Calculate new pan to keep image point under cursor
      const newPanX = mouseX - containerWidth / 2 + newCanvasWidth / 2 - imageX * newScale;
      const newPanY = mouseY - containerHeight / 2 + newCanvasHeight / 2 - imageY * newScale;

      setPreviewScale(newScale);
      setPan({ x: newPanX, y: newPanY });
    },
    [pan, previewScale],
  );

  // Register wheel event
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
    };
  }, [handleWheel]);

  // Animation playback
  useEffect(() => {
    if (!isPlaying || maxFrameCount === 0) return;

    const interval = setInterval(() => {
      setCurrentFrameIndex((prev) => (prev + 1) % maxFrameCount);
    }, 1000 / fps);

    return () => clearInterval(interval);
  }, [isPlaying, fps, maxFrameCount]);

  // Composite current frame from all tracks
  useEffect(() => {
    if (maxFrameCount === 0) {
      setCompositedDataUrl(null);
      return;
    }

    let cancelled = false;
    compositeFrame(tracks, currentFrameIndex).then((result) => {
      if (!cancelled) {
        setCompositedDataUrl(result?.dataUrl ?? null);
      }
    });

    return () => { cancelled = true; };
  }, [tracks, currentFrameIndex, maxFrameCount]);

  // Draw composited frame to canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !compositedDataUrl) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = new Image();
    img.onload = () => {
      canvas.width = img.width * previewScale;
      canvas.height = img.height * previewScale;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    };
    img.src = compositedDataUrl;
  }, [compositedDataUrl, previewScale]);

  const handlePrev = useCallback(() => {
    if (maxFrameCount === 0) return;
    setCurrentFrameIndex((prev) => (prev - 1 + maxFrameCount) % maxFrameCount);
  }, [maxFrameCount]);

  const handleNext = useCallback(() => {
    if (maxFrameCount === 0) return;
    setCurrentFrameIndex((prev) => (prev + 1) % maxFrameCount);
  }, [maxFrameCount]);

  // 스페이스바 패닝 기능
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 버튼, input 등에 포커스가 있으면 스페이스바 패닝 무시
      const target = e.target as HTMLElement;
      const isInteractiveElement =
        target.tagName === "BUTTON" ||
        target.tagName === "INPUT" ||
        target.tagName === "SELECT" ||
        target.tagName === "TEXTAREA" ||
        target.isContentEditable;

      if (e.code === "Space" && !e.repeat && !isInteractiveElement) {
        e.preventDefault();
        setIsPanning(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        setIsPanning(false);
        setIsDragging(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  // 손 툴 또는 스페이스바로 패닝 활성화
  const isHandMode = toolMode === "hand" || isPanning;

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isPanning || toolMode === "hand") {
        e.preventDefault();
        setIsDragging(true);
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [isPanning, toolMode],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDragging) {
        const dx = e.clientX - lastMousePosRef.current.x;
        const dy = e.clientY - lastMousePosRef.current.y;
        setPan((prev) => ({ x: prev.x + dx, y: prev.y + dy }));
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
      }
    },
    [isDragging],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  // 커서 결정
  const getCursor = () => {
    if (isHandMode) {
      return isDragging ? "grabbing" : "grab";
    }
    return "default";
  };

  return (
    <div className="flex flex-col h-full bg-surface-primary">
      {/* Preview area */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden relative ${bgType === "checkerboard" ? "checkerboard" : ""}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          cursor: getCursor(),
          backgroundColor: bgType === "solid" ? bgColor : undefined,
        }}
      >
        {/* Background image */}
        {bgType === "image" && bgImage && (
          <img
            src={bgImage}
            alt="background"
            className="absolute inset-0 w-full h-full object-cover pointer-events-none"
          />
        )}
        {maxFrameCount > 0 && compositedDataUrl ? (
          <canvas
            ref={canvasRef}
            className="absolute border border-border-default"
            style={{
              cursor: getCursor(),
              pointerEvents: isHandMode ? "none" : "auto",
              left: "50%",
              top: "50%",
              transform: `translate(calc(-50% + ${pan.x}px), calc(-50% + ${pan.y}px))`,
            }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-text-tertiary text-sm">
            {t.noFramesAvailable}
          </div>
        )}
      </div>

      {/* Control area */}
      <div className="p-3 border-t border-border-default space-y-3">
        {/* Playback controls */}
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={handlePrev}
            className="px-3 py-1.5 bg-interactive-default hover:bg-interactive-hover rounded-lg text-sm transition-colors"
            disabled={maxFrameCount === 0}
          >
            ◀
          </button>
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium text-white transition-colors ${
              isPlaying
                ? "bg-accent-danger hover:bg-accent-danger-hover"
                : "bg-accent-primary hover:bg-accent-primary-hover"
            }`}
            disabled={maxFrameCount === 0}
          >
            {isPlaying ? `⏸ ${t.pause}` : `▶ ${t.play}`}
          </button>
          <button
            onClick={handleNext}
            className="px-3 py-1.5 bg-interactive-default hover:bg-interactive-hover rounded-lg text-sm transition-colors"
            disabled={maxFrameCount === 0}
          >
            ▶
          </button>
        </div>

        {/* FPS & Scale controls */}
        <div className="flex items-center gap-4 text-sm">
          <div className="flex items-center gap-2 flex-1">
            <span className="text-text-secondary whitespace-nowrap">FPS:</span>
            <input
              type="range"
              min="1"
              max="30"
              value={fps}
              onChange={(e) => setFps(Number(e.target.value))}
              className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-8 text-center text-text-primary">{fps}</span>
          </div>

          <div className="flex items-center gap-2 flex-1">
            <span className="text-text-secondary whitespace-nowrap">{t.scale}:</span>
            <input
              type="range"
              min="1"
              max="20"
              step="0.5"
              value={previewScale}
              onChange={(e) => setPreviewScale(Number(e.target.value))}
              className="flex-1 h-1.5 bg-surface-tertiary rounded-lg appearance-none cursor-pointer"
            />
            <span className="w-8 text-center text-text-primary">{previewScale}x</span>
          </div>
        </div>

        {/* Background selector */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary whitespace-nowrap">{t.background}:</span>
          <button
            onClick={() => setBgType("checkerboard")}
            className={`w-6 h-6 rounded-lg border-2 checkerboard transition-colors ${
              bgType === "checkerboard" ? "border-accent-primary" : "border-border-default"
            }`}
            title={t.transparent}
          />
          {presetColors.map(({ color, label }) => (
            <button
              key={color}
              onClick={() => {
                setBgType("solid");
                setBgColor(color);
              }}
              className={`w-6 h-6 rounded-lg border-2 transition-colors ${
                bgType === "solid" && bgColor === color
                  ? "border-accent-primary"
                  : "border-border-default"
              }`}
              style={{ backgroundColor: color }}
              title={label}
            />
          ))}
          <input
            type="color"
            value={bgColor}
            onChange={(e) => {
              setBgType("solid");
              setBgColor(e.target.value);
            }}
            className="w-6 h-6 rounded-lg cursor-pointer border-0 p-0"
            title={t.customColor}
          />
          <div className="border-l border-border-default h-4 mx-1" />
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleBgImageUpload}
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className={`px-2 py-0.5 rounded-lg border-2 text-xs transition-colors ${
              bgType === "image"
                ? "border-accent-primary bg-accent-primary/20"
                : "border-border-default hover:bg-interactive-hover"
            }`}
            title={t.uploadBgImage}
          >
            {t.image}
          </button>
          {bgType === "image" && bgImage && (
            <button
              onClick={() => {
                setBgImage(null);
                setBgType("checkerboard");
              }}
              className="px-1.5 py-0.5 rounded-lg border border-border-default hover:bg-interactive-hover text-xs text-text-secondary transition-colors"
              title={t.removeBgImage}
            >
              ✕
            </button>
          )}
        </div>

        {/* Frame info */}
        <div className="text-center text-xs text-text-tertiary">
          {maxFrameCount > 0
            ? `${t.frame} ${currentFrameIndex + 1} / ${maxFrameCount}`
            : t.noFrames}
        </div>
      </div>
    </div>
  );
}
