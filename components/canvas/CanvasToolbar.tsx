"use client";

import { Point, ToolMode, SpriteFrame, SavedProject } from "../../types";

// ============================================
// Icon Components
// ============================================

const PenIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
    />
  </svg>
);

const SelectIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122"
    />
  </svg>
);

const HandIcon = () => (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11"
    />
  </svg>
);

// ============================================
// Types
// ============================================

interface CanvasToolbarProps {
  // Image
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  imageSrc: string | null;

  // Tool Mode
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;

  // Pen Tool
  currentPoints: Point[];
  onUndoLastPoint: () => void;
  onCancelPolygon: () => void;
  onCompleteFrame: () => void;

  // Selection
  selectedFrameId: number | null;
  selectedPointIndex: number | null;
  frames: SpriteFrame[];

  // Project
  projectName: string;
  onProjectNameChange: (name: string) => void;
  onSaveProject: () => void;
  onSaveProjectAs: () => void;
  onOpenProjectList: () => void;
  onNewProject: () => void;
  savedProjects: SavedProject[];
  isExistingProject: boolean;

  // Canvas Collapse
  isCanvasCollapsed: boolean;
  onToggleCanvasCollapse: () => void;

  // Viewport
  zoom: number;
}

// ============================================
// Component
// ============================================

export default function CanvasToolbar({
  onImageUpload,
  imageSrc,
  toolMode,
  onToolModeChange,
  currentPoints,
  onUndoLastPoint,
  onCancelPolygon,
  onCompleteFrame,
  selectedFrameId,
  selectedPointIndex,
  frames,
  projectName,
  onProjectNameChange,
  onSaveProject,
  onSaveProjectAs,
  onOpenProjectList,
  onNewProject,
  savedProjects,
  isExistingProject,
  isCanvasCollapsed,
  onToggleCanvasCollapse,
  zoom,
}: CanvasToolbarProps) {
  const canSave = imageSrc !== null && frames.length > 0;
  const selectedFrameIndex = frames.findIndex((f) => f.id === selectedFrameId);

  const getHintText = () => {
    if (toolMode === "pen") {
      return "클릭: 점 추가 | 첫점: 완성";
    } else if (toolMode === "select") {
      return "클릭: 선택 | 드래그: 이동";
    } else {
      return "드래그: 화면 이동";
    }
  };

  return (
    <div className="toolbar">
      {/* 파일 선택 버튼 */}
      <label className="btn btn-secondary text-sm cursor-pointer">
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
        파일 선택
        <input type="file" accept="image/*" onChange={onImageUpload} className="hidden" />
      </label>

      {imageSrc && <span className="text-text-tertiary text-xs px-2">선택된 파일 있음</span>}

      <div className="divider" />

      {/* 툴 모드 버튼 */}
      <div className="tool-group">
        <button
          onClick={() => onToolModeChange("pen")}
          className={`tool-btn ${toolMode === "pen" ? "active" : ""}`}
          title="펜 툴 (폴리곤 그리기)"
        >
          <PenIcon />펜
        </button>
        <button
          onClick={() => onToolModeChange("select")}
          className={`tool-btn ${toolMode === "select" ? "active" : ""}`}
          title="선택 툴 (이동/편집)"
        >
          <SelectIcon />
          선택
        </button>
        <button
          onClick={() => onToolModeChange("hand")}
          className={`tool-btn ${toolMode === "hand" ? "active" : ""}`}
          title="손 툴 (화면 이동)"
        >
          <HandIcon />손
        </button>
      </div>

      <div className="divider" />

      {/* 펜 툴 컨트롤 */}
      {toolMode === "pen" && currentPoints.length > 0 && (
        <div className="flex items-center gap-2">
          <button
            onClick={onUndoLastPoint}
            className="btn btn-ghost text-sm"
            title="마지막 점 취소"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
              />
            </svg>
          </button>
          <button onClick={onCancelPolygon} className="btn btn-danger text-sm">
            취소
          </button>
          {currentPoints.length >= 3 && (
            <button onClick={onCompleteFrame} className="btn btn-primary text-sm">
              완성
            </button>
          )}
          <span className="text-text-secondary text-sm font-medium">
            점: {currentPoints.length}
          </span>
        </div>
      )}

      {/* 선택 상태 표시 */}
      {toolMode === "select" && selectedFrameId !== null && (
        <span className="text-accent-primary text-sm font-medium">
          프레임 {selectedFrameIndex + 1} 선택됨
          {selectedPointIndex !== null && ` (점 ${selectedPointIndex + 1})`}
        </span>
      )}

      <div className="flex-1" />

      {/* 프로젝트 관리 버튼 */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (frames.length > 0 || imageSrc) {
              if (window.confirm("현재 작업이 삭제됩니다. 새 프로젝트를 시작하시겠습니까?")) {
                onNewProject();
              }
            } else {
              onNewProject();
            }
          }}
          className="btn btn-ghost text-sm"
          title="새 프로젝트 시작"
        >
          새로만들기
        </button>

        <input
          type="text"
          placeholder="프로젝트명"
          value={projectName}
          onChange={(e) => onProjectNameChange(e.target.value)}
          className="input text-sm w-32"
        />

        <button
          onClick={onSaveProject}
          disabled={!canSave}
          className="btn btn-primary text-sm"
          title={isExistingProject ? "현재 프로젝트에 덮어쓰기" : "새 프로젝트로 저장"}
        >
          저장
        </button>

        <button
          onClick={onSaveProjectAs}
          disabled={!canSave}
          className="btn btn-secondary text-sm"
          title="새 이름으로 저장"
        >
          다른이름
        </button>

        <button
          onClick={onOpenProjectList}
          className="btn btn-secondary text-sm relative"
          title="저장된 프로젝트 목록"
        >
          불러오기
          {savedProjects.length > 0 && (
            <span className="badge absolute -top-2 -right-2">{savedProjects.length}</span>
          )}
        </button>
      </div>

      <div className="divider" />

      <button onClick={onToggleCanvasCollapse} className="btn btn-ghost text-sm">
        {isCanvasCollapsed ? "▼ 펼치기" : "▲ 접기"}
      </button>

      {/* 힌트 텍스트 */}
      <span className="text-text-tertiary text-xs hidden lg:inline">
        {getHintText()} | Space: 이동 | 휠: 줌 ({Math.round(zoom * 100)}%)
      </span>
    </div>
  );
}
