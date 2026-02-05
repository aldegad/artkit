"use client";

import { useState } from "react";
import { useLanguage } from "../../shared/contexts";
import { useEditor } from "../../domains/sprite/contexts/SpriteEditorContext";
import { Point } from "../../types";
import {
  downloadFramesAsZip,
  downloadSpriteSheet,
  downloadFullProject,
  downloadProjectMetadata,
} from "../../utils/export";
import { SpinnerIcon, ExportIcon, ChevronDownIcon } from "../../shared/components";

// ============================================
// Types
// ============================================

export interface ExportDropdownProps {
  frames: { id: number; points: Point[]; name: string; imageData?: string; offset: Point }[];
  fps: number;
  onExportSpriteSheet: () => void;
}

// ============================================
// Component
// ============================================

export default function ExportDropdown({ frames, fps, onExportSpriteSheet }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { t } = useLanguage();
  const { projectName } = useEditor();

  const handleExport = async (type: string) => {
    setIsExporting(true);
    try {
      switch (type) {
        case "spritesheet":
          onExportSpriteSheet();
          break;
        case "zip":
          await downloadFramesAsZip(frames, projectName);
          break;
        case "spritesheet-new":
          await downloadSpriteSheet(frames, projectName);
          break;
        case "full":
          await downloadFullProject(frames, projectName, fps);
          break;
        case "metadata":
          downloadProjectMetadata(frames, projectName, fps);
          break;
      }
    } catch (error) {
      console.error("Export failed:", error);
      alert(`${t.exportFailed}: ${(error as Error).message}`);
    } finally {
      setIsExporting(false);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        disabled={isExporting}
        className="btn btn-primary text-sm"
      >
        {isExporting ? (
          <>
            <SpinnerIcon />
            내보내는 중...
          </>
        ) : (
          <>
            <ExportIcon />
            내보내기
            <ChevronDownIcon />
          </>
        )}
      </button>

      {isOpen && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          {/* Dropdown menu */}
          <div className="absolute right-0 top-full mt-1 bg-surface-secondary border border-border-default rounded-lg shadow-xl z-50 min-w-[200px] py-1">
            <button
              onClick={() => handleExport("zip")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-interactive-hover flex items-center gap-2 text-text-primary"
            >
              <span className="text-accent-primary">📦</span>
              <div>
                <div>PNG ZIP 다운로드</div>
                <div className="text-xs text-text-tertiary">개별 프레임 파일들</div>
              </div>
            </button>

            <button
              onClick={() => handleExport("spritesheet-new")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-interactive-hover flex items-center gap-2 text-text-primary"
            >
              <span className="text-accent-primary">🖼️</span>
              <div>
                <div>스프라이트 시트</div>
                <div className="text-xs text-text-tertiary">한 장에 모든 프레임</div>
              </div>
            </button>

            <div className="border-t border-border-default my-1" />

            <button
              onClick={() => handleExport("full")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-interactive-hover flex items-center gap-2 text-text-primary"
            >
              <span className="text-accent-warning">📁</span>
              <div>
                <div>전체 프로젝트 (ZIP)</div>
                <div className="text-xs text-text-tertiary">이미지 + 메타데이터</div>
              </div>
            </button>

            <button
              onClick={() => handleExport("metadata")}
              className="w-full px-4 py-2 text-left text-sm hover:bg-interactive-hover flex items-center gap-2 text-text-primary"
            >
              <span className="text-accent-primary">📋</span>
              <div>
                <div>메타데이터 (JSON)</div>
                <div className="text-xs text-text-tertiary">게임 통합용 데이터</div>
              </div>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
