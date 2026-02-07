"use client";

import { useState } from "react";
import { useLanguage } from "@/shared/contexts";
import { useEditorProject } from "../contexts/SpriteEditorContext";
import { SpriteTrack } from "../types";
import {
  downloadCompositedFramesAsZip,
  downloadCompositedSpriteSheet,
} from "../utils/export";
import { SpinnerIcon, ExportIcon, ChevronDownIcon } from "@/shared/components";

// ============================================
// Types
// ============================================

export interface ExportDropdownProps {
  tracks: SpriteTrack[];
  fps: number;
  onExportSpriteSheet: () => void;
}

// ============================================
// Component
// ============================================

export default function ExportDropdown({ tracks, fps, onExportSpriteSheet }: ExportDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { t } = useLanguage();
  const { projectName } = useEditorProject();

  const handleExport = async (type: string) => {
    setIsExporting(true);
    try {
      switch (type) {
        case "spritesheet":
          onExportSpriteSheet();
          break;
        case "zip":
          await downloadCompositedFramesAsZip(tracks, projectName);
          break;
        case "spritesheet-new":
          await downloadCompositedSpriteSheet(tracks, projectName);
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

          </div>
        </>
      )}
    </div>
  );
}
