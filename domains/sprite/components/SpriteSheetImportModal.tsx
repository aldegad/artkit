"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { SpriteFrame, Point } from "../types";
import { getCanvasColorsSync } from "@/hooks";

interface SpriteSheetImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (frames: Omit<SpriteFrame, "id">[]) => void;
  startFrameId: number;
}

interface GridCell {
  row: number;
  col: number;
  selected: boolean;
}

export default function SpriteSheetImportModal({
  isOpen,
  onClose,
  onImport,
  startFrameId,
}: SpriteSheetImportModalProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [rows, setRows] = useState(4);
  const [cols, setCols] = useState(4);
  const [cells, setCells] = useState<GridCell[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [dragSelectMode, setDragSelectMode] = useState<boolean | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Initialize cells when rows/cols change
  useEffect(() => {
    const newCells: GridCell[] = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        newCells.push({ row: r, col: c, selected: false });
      }
    }
    setCells(newCells);
  }, [rows, cols]);

  // Draw preview canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !imageSrc) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Get theme colors
    const colors = getCanvasColorsSync();

    // Calculate display size to fit in preview area
    const maxWidth = 500;
    const maxHeight = 400;
    const scale = Math.min(maxWidth / img.width, maxHeight / img.height, 1);
    const displayWidth = img.width * scale;
    const displayHeight = img.height * scale;

    canvas.width = displayWidth;
    canvas.height = displayHeight;

    // Draw image
    ctx.drawImage(img, 0, 0, displayWidth, displayHeight);

    // Draw grid
    const cellWidth = displayWidth / cols;
    const cellHeight = displayHeight / rows;

    // Draw selected cells with highlight
    cells.forEach((cell) => {
      if (cell.selected) {
        ctx.fillStyle = colors.selectionFill;
        ctx.fillRect(cell.col * cellWidth, cell.row * cellHeight, cellWidth, cellHeight);
      }
    });

    // Draw grid lines (black shadow + cyan line for visibility on any background)
    // First pass: black shadow
    ctx.strokeStyle = colors.overlay;
    ctx.lineWidth = 2;

    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellWidth, 0);
      ctx.lineTo(i * cellWidth, displayHeight);
      ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellHeight);
      ctx.lineTo(displayWidth, i * cellHeight);
      ctx.stroke();
    }

    // Second pass: cyan line
    ctx.strokeStyle = colors.gridAlt;
    ctx.lineWidth = 1;

    for (let i = 0; i <= cols; i++) {
      ctx.beginPath();
      ctx.moveTo(i * cellWidth, 0);
      ctx.lineTo(i * cellWidth, displayHeight);
      ctx.stroke();
    }
    for (let i = 0; i <= rows; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * cellHeight);
      ctx.lineTo(displayWidth, i * cellHeight);
      ctx.stroke();
    }

    // Draw cell numbers
    ctx.font = "12px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    cells.forEach((cell, idx) => {
      const x = (cell.col + 0.5) * cellWidth;
      const y = (cell.row + 0.5) * cellHeight;

      // Background circle
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fillStyle = cell.selected ? colors.selection : colors.overlay;
      ctx.fill();

      // Number
      ctx.fillStyle = colors.textOnColor;
      ctx.fillText(String(idx + 1), x, y);
    });
  }, [imageSrc, rows, cols, cells]);

  // Handle file input
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setImageSrc(src);

      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setImageSize({ width: img.width, height: img.height });

        // Auto-detect grid size if image is square-ish
        const aspectRatio = img.width / img.height;
        if (aspectRatio > 0.9 && aspectRatio < 1.1) {
          // Square image, try common sprite sheet sizes
          const possibleSizes = [2, 3, 4, 5, 6, 7, 8];
          for (const size of possibleSizes) {
            if (img.width % size === 0 && img.height % size === 0) {
              setRows(size);
              setCols(size);
              break;
            }
          }
        }
      };
      img.src = src;
    };
    reader.readAsDataURL(file);

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }, []);

  // Handle drag and drop
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file || !file.type.startsWith("image/")) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const src = event.target?.result as string;
      setImageSrc(src);

      const img = new Image();
      img.onload = () => {
        imageRef.current = img;
        setImageSize({ width: img.width, height: img.height });
      };
      img.src = src;
    };
    reader.readAsDataURL(file);
  }, []);

  // Canvas mouse handlers for drag selection
  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas || !imageSrc || cells.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const cellWidth = canvas.width / cols;
      const cellHeight = canvas.height / rows;

      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);

      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        const cellIndex = row * cols + col;
        const currentCell = cells[cellIndex];
        if (!currentCell) return;

        const newSelected = !currentCell.selected;
        setDragSelectMode(newSelected);
        setIsDragging(true);
        setCells((prev) =>
          prev.map((cell, idx) => (idx === cellIndex ? { ...cell, selected: newSelected } : cell)),
        );
      }
    },
    [imageSrc, rows, cols, cells],
  );

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!isDragging || dragSelectMode === null) return;

      const canvas = canvasRef.current;
      if (!canvas || !imageSrc || cells.length === 0) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const cellWidth = canvas.width / cols;
      const cellHeight = canvas.height / rows;

      const col = Math.floor(x / cellWidth);
      const row = Math.floor(y / cellHeight);

      if (row >= 0 && row < rows && col >= 0 && col < cols) {
        const cellIndex = row * cols + col;
        setCells((prev) =>
          prev.map((cell, idx) =>
            idx === cellIndex ? { ...cell, selected: dragSelectMode } : cell,
          ),
        );
      }
    },
    [isDragging, dragSelectMode, imageSrc, rows, cols, cells.length],
  );

  const handleCanvasMouseUp = useCallback(() => {
    setIsDragging(false);
    setDragSelectMode(null);
  }, []);

  // Select all/none
  const selectAll = useCallback(() => {
    setCells((prev) => prev.map((cell) => ({ ...cell, selected: true })));
  }, []);

  const selectNone = useCallback(() => {
    setCells((prev) => prev.map((cell) => ({ ...cell, selected: false })));
  }, []);

  // Invert selection
  const invertSelection = useCallback(() => {
    setCells((prev) => prev.map((cell) => ({ ...cell, selected: !cell.selected })));
  }, []);

  // Import selected frames
  const handleImport = useCallback(() => {
    const img = imageRef.current;
    if (!img || cells.filter((c) => c.selected).length === 0) return;

    const cellWidth = img.width / cols;
    const cellHeight = img.height / rows;

    const selectedCells = cells.filter((c) => c.selected);
    const newFrames: Omit<SpriteFrame, "id">[] = [];

    selectedCells.forEach((cell, idx) => {
      const x = cell.col * cellWidth;
      const y = cell.row * cellHeight;

      // Create canvas for this cell
      const tempCanvas = document.createElement("canvas");
      tempCanvas.width = cellWidth;
      tempCanvas.height = cellHeight;
      const ctx = tempCanvas.getContext("2d");
      if (!ctx) return;

      ctx.drawImage(img, x, y, cellWidth, cellHeight, 0, 0, cellWidth, cellHeight);
      const imageData = tempCanvas.toDataURL("image/png");

      // Create rectangle polygon points
      const points: Point[] = [
        { x: x, y: y },
        { x: x + cellWidth, y: y },
        { x: x + cellWidth, y: y + cellHeight },
        { x: x, y: y + cellHeight },
      ];

      newFrames.push({
        points,
        name: `Frame ${startFrameId + idx}`,
        imageData,
        offset: { x: 0, y: 0 },
      });
    });

    onImport(newFrames);
    onClose();

    // Reset state
    setImageSrc(null);
    setCells([]);
  }, [cells, cols, rows, startFrameId, onImport, onClose]);

  // Close and reset
  const handleClose = useCallback(() => {
    setImageSrc(null);
    setCells([]);
    onClose();
  }, [onClose]);

  const selectedCount = cells.filter((c) => c.selected).length;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-surface-primary border border-border-default rounded-xl w-[600px] max-h-[90vh] flex flex-col shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border-default">
          <h2 className="text-lg font-semibold text-text-primary">스프라이트 시트 가져오기</h2>
          <button
            onClick={handleClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-interactive-hover text-text-secondary hover:text-text-primary transition-colors"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* File upload area */}
          {!imageSrc ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-border-default rounded-lg p-8 text-center cursor-pointer hover:border-accent-primary hover:bg-surface-secondary/50 transition-colors"
            >
              <svg
                className="w-12 h-12 mx-auto text-text-tertiary mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1.5}
                  d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                />
              </svg>
              <p className="text-text-primary">
                스프라이트 시트 이미지를 드래그하거나 클릭해서 선택
              </p>
              <p className="text-sm text-text-tertiary mt-1">PNG, JPG, WebP 지원</p>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />
            </div>
          ) : (
            <>
              {/* Grid settings */}
              <div className="flex items-center gap-4 bg-surface-secondary p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <label className="text-sm text-text-secondary">행:</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={rows}
                    onChange={(e) =>
                      setRows(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                    }
                    className="w-16 px-2 py-1 bg-surface-primary border border-border-default rounded text-sm focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-text-secondary">열:</label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={cols}
                    onChange={(e) =>
                      setCols(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))
                    }
                    className="w-16 px-2 py-1 bg-surface-primary border border-border-default rounded text-sm focus:outline-none focus:border-accent-primary"
                  />
                </div>
                <div className="h-4 w-px bg-border-default" />
                <span className="text-xs text-text-tertiary">
                  셀 크기: {Math.round(imageSize.width / cols)} ×{" "}
                  {Math.round(imageSize.height / rows)}px
                </span>
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setImageSrc(null);
                    setCells([]);
                  }}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  이미지 변경
                </button>
              </div>

              {/* Selection buttons */}
              <div className="flex items-center gap-2">
                <button
                  onClick={selectAll}
                  className="px-3 py-1.5 bg-accent-primary hover:bg-accent-primary-hover text-white rounded-lg text-sm transition-colors"
                >
                  전체 선택
                </button>
                <button
                  onClick={selectNone}
                  className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-text-primary border border-border-default rounded-lg text-sm transition-colors"
                >
                  선택 해제
                </button>
                <button
                  onClick={invertSelection}
                  className="px-3 py-1.5 bg-surface-secondary hover:bg-surface-tertiary text-text-primary border border-border-default rounded-lg text-sm transition-colors"
                >
                  선택 반전
                </button>
                <div className="flex-1" />
                <span className="text-sm text-text-secondary">
                  {selectedCount}개 선택됨 / {rows * cols}개
                </span>
              </div>

              {/* Preview canvas */}
              <div className="flex justify-center bg-surface-secondary rounded-lg p-4">
                <canvas
                  ref={canvasRef}
                  onMouseDown={handleCanvasMouseDown}
                  onMouseMove={handleCanvasMouseMove}
                  onMouseUp={handleCanvasMouseUp}
                  onMouseLeave={handleCanvasMouseUp}
                  className="max-w-full cursor-pointer rounded border border-border-default"
                  style={{ imageRendering: "pixelated" }}
                />
              </div>

              {/* Help text */}
              <p className="text-xs text-text-tertiary text-center">
                클릭하거나 드래그해서 셀을 선택/해제하세요. 선택된 셀이 프레임으로 추가됩니다.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        {imageSrc && (
          <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border-default">
            <button
              onClick={handleClose}
              className="px-4 py-2 bg-surface-secondary hover:bg-surface-tertiary text-text-primary border border-border-default rounded-lg text-sm transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleImport}
              disabled={selectedCount === 0}
              className="px-4 py-2 bg-accent-primary hover:bg-accent-primary-hover disabled:bg-surface-tertiary disabled:text-text-tertiary disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors"
            >
              {selectedCount}개 프레임 가져오기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
