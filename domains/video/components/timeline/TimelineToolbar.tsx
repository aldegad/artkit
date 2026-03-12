"use client";

import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/shared/contexts";
import { useTimeline, useVideoState } from "../../contexts";
import { cn } from "@/shared/utils/cn";
import {
  FilmStripIcon,
  LoopIcon,
  LoopOffIcon,
  PlusIcon,
  RazorToolIcon,
  SnapIcon,
  SnapOffIcon,
  StepForwardIcon,
} from "@/shared/components/icons";
import Tooltip from "@/shared/components/Tooltip";
import { NumberScrubber, Popover } from "@/shared/components";
import { CLIP_PLAYBACK, TIMELINE } from "../../constants";
import { getClipPlaybackSpeed, getClipSourceSpan } from "../../types";
import { normalizeTimelineFrameRate } from "../../utils/timelineFrame";

interface TimelineToolbarProps {
  className?: string;
}

function formatSeconds(value: number): string {
  if (!Number.isFinite(value)) return "0.00s";
  const safeValue = Math.max(0, value);
  if (safeValue >= 10) return `${safeValue.toFixed(1)}s`;
  return `${safeValue.toFixed(2)}s`;
}

export function TimelineToolbar({ className }: TimelineToolbarProps) {
  const { language } = useLanguage();
  const { viewState, setZoom, toggleSnap, addTrack, clips, splitClipAtTime, setClipPlaybackSpeed } = useTimeline();
  const {
    playback,
    currentTimeRef,
    project,
    selectedClipIds,
    selectClip,
    setLoopRange,
    clearLoopRange,
    toggleLoop,
  } = useVideoState();

  const isKorean = language === "ko";
  const labels = isKorean
    ? {
        addLayer: "레이어 추가",
        addLayerDesc: "새 타임라인 레이어를 추가합니다",
        snapOn: "스냅: 켜짐",
        snapOff: "스냅: 꺼짐",
        snapOnDesc: "클립 가장자리가 다른 클립에 달라붙습니다",
        snapOffDesc: "스냅 없이 자유롭게 배치합니다",
        cutAtPlayhead: "플레이헤드에서 자르기",
        cutAtPlayheadDesc: "선택한 클립을 현재 시간에서 분할합니다",
        setIn: "현재 시간을 IN 지점으로 설정",
        setOut: "현재 시간을 OUT 지점으로 설정",
        clearRange: "재생 구간 지우기",
        loopOn: "루프: 켜짐",
        loopOff: "루프: 꺼짐",
        speedTitle: "클립 속도",
        speedDesc: "원본은 그대로 두고 타임라인 길이만 압축해서 더 빠르게 재생합니다.",
        selectClip: "속도를 바꾸려면 비디오 또는 오디오 클립을 선택하세요.",
        unsupportedClip: "이미지 클립은 속도 변경을 지원하지 않습니다.",
        sourceLength: "원본 구간",
        timelineLength: "타임라인 길이",
        nonDestructive: "비파괴 편집: 소스 파일 자체는 변경되지 않습니다.",
        maxSpeed: "이 클립에서 가능한 최대 속도",
        noSelection: "선택 없음",
      }
    : {
        addLayer: "Add Layer",
        addLayerDesc: "Add a new timeline layer",
        snapOn: "Snap: ON",
        snapOff: "Snap: OFF",
        snapOnDesc: "Clip edges snap to nearby clips",
        snapOffDesc: "Move clips without snapping",
        cutAtPlayhead: "Cut at Playhead",
        cutAtPlayheadDesc: "Split the selected clip at the current time",
        setIn: "Set current time as IN point",
        setOut: "Set current time as OUT point",
        clearRange: "Clear playback range",
        loopOn: "Loop: On",
        loopOff: "Loop: Off",
        speedTitle: "Clip Speed",
        speedDesc: "Compress the clip on the timeline to play it faster without touching the source.",
        selectClip: "Select a video or audio clip to change its speed.",
        unsupportedClip: "Image clips do not support speed changes.",
        sourceLength: "Source span",
        timelineLength: "Timeline span",
        nonDestructive: "Non-destructive: the source file stays untouched.",
        maxSpeed: "Max speed available for this clip",
        noSelection: "No clip",
      };

  const toolbarRef = useRef<HTMLDivElement>(null);
  const [isCompact, setIsCompact] = useState(false);
  const projectDuration = Math.max(project.duration || 0, 0);
  const rangeStart = Math.max(0, Math.min(playback.loopStart, projectDuration));
  const hasRange = playback.loopEnd > rangeStart + 0.001;
  const rangeEnd = hasRange
    ? Math.max(rangeStart + 0.001, Math.min(playback.loopEnd, projectDuration))
    : projectDuration;
  const hasCustomRange = hasRange && (rangeStart > 0.001 || rangeEnd < projectDuration - 0.001);
  const selectedClipId = selectedClipIds[selectedClipIds.length - 1] || null;
  const selectedClip = selectedClipId
    ? clips.find((clip) => clip.id === selectedClipId) ?? null
    : null;
  const selectedSpeedClip = selectedClip && selectedClip.type !== "image" ? selectedClip : null;
  const selectedClipSpeed = selectedSpeedClip
    ? getClipPlaybackSpeed(selectedSpeedClip)
    : CLIP_PLAYBACK.DEFAULT_SPEED;
  const selectedClipSourceSpan = selectedSpeedClip
    ? getClipSourceSpan(selectedSpeedClip)
    : 0;
  const minClipDuration = Math.max(
    TIMELINE.CLIP_MIN_DURATION,
    1 / normalizeTimelineFrameRate(project.frameRate)
  );
  const maxSelectableSpeed = selectedSpeedClip
    ? Math.max(
        CLIP_PLAYBACK.MIN_SPEED,
        Math.min(
          CLIP_PLAYBACK.MAX_SPEED,
          selectedClipSourceSpan / Math.max(minClipDuration, 0.0001)
        )
      )
    : CLIP_PLAYBACK.MIN_SPEED;
  const hasSpeedBoost = selectedSpeedClip
    ? selectedClipSpeed > CLIP_PLAYBACK.DEFAULT_SPEED + 0.001
    : false;
  const canSplitSelectedClip = Boolean(
    selectedClip
    && currentTimeRef.current > selectedClip.startTime + TIMELINE.CLIP_MIN_DURATION
    && currentTimeRef.current < selectedClip.startTime + selectedClip.duration - TIMELINE.CLIP_MIN_DURATION
  );

  const setInPoint = () => {
    if (projectDuration <= 0) return;
    const current = Math.max(0, Math.min(currentTimeRef.current, projectDuration));
    const nextEnd = hasCustomRange ? rangeEnd : projectDuration;
    setLoopRange(current, nextEnd, true);
  };

  const setOutPoint = () => {
    if (projectDuration <= 0) return;
    const current = Math.max(0, Math.min(currentTimeRef.current, projectDuration));
    const nextStart = hasCustomRange ? rangeStart : 0;
    setLoopRange(nextStart, current, true);
  };

  const splitSelectedClipAtPlayhead = () => {
    if (!selectedClipId) return;
    const splitClipId = splitClipAtTime(selectedClipId, currentTimeRef.current);
    if (splitClipId) {
      selectClip(splitClipId, false);
    }
  };

  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setIsCompact(entry.contentRect.width < TIMELINE.TOOLBAR_COMPACT_BREAKPOINT);
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const renderSpeedPanel = (embedded: boolean) => (
    <div
      className={cn(
        "flex flex-col gap-2",
        embedded
          ? "mt-1 border-t border-border-default px-2 pt-2 pb-1"
          : "p-2 min-w-[260px]"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-xs font-medium text-text-primary">{labels.speedTitle}</div>
          <div className="text-[11px] text-text-tertiary">{labels.speedDesc}</div>
        </div>
        <span className="rounded bg-surface-tertiary px-1.5 py-0.5 text-[10px] font-medium text-text-secondary">
          {selectedSpeedClip ? `${selectedClipSpeed.toFixed(2)}x` : labels.noSelection}
        </span>
      </div>

      {selectedSpeedClip ? (
        <>
          <div className="truncate text-[11px] text-text-secondary">{selectedSpeedClip.name}</div>

          <div className="grid grid-cols-3 gap-1">
            {CLIP_PLAYBACK.PRESETS.map((speed) => {
              const disabled = speed > maxSelectableSpeed + 0.0001;
              const active = Math.abs(selectedClipSpeed - speed) <= 0.01;
              return (
                <button
                  key={speed}
                  onClick={() => {
                    if (disabled) return;
                    setClipPlaybackSpeed(selectedSpeedClip.id, speed);
                  }}
                  className={cn(
                    "rounded px-2 py-1 text-[11px] font-medium transition-colors",
                    active
                      ? "bg-accent-primary text-white"
                      : disabled
                        ? "cursor-not-allowed bg-surface-tertiary/50 text-text-quaternary"
                        : "bg-surface-tertiary text-text-secondary hover:bg-interactive-hover hover:text-text-primary"
                  )}
                >
                  {speed.toFixed(speed % 1 === 0 ? 0 : 2)}x
                </button>
              );
            })}
          </div>

          <div className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[11px] text-text-secondary">
            <span>{labels.sourceLength}</span>
            <span>{formatSeconds(selectedClipSourceSpan)}</span>
            <span>{labels.timelineLength}</span>
            <span>{formatSeconds(selectedSpeedClip.duration)}</span>
          </div>

          {maxSelectableSpeed < CLIP_PLAYBACK.MAX_SPEED - 0.01 && (
            <div className="text-[10px] text-text-tertiary">
              {labels.maxSpeed}: {maxSelectableSpeed.toFixed(2)}x
            </div>
          )}

          <div className="text-[10px] text-text-tertiary">{labels.nonDestructive}</div>
        </>
      ) : (
        <div className="text-[11px] text-text-tertiary">
          {selectedClip ? labels.unsupportedClip : labels.selectClip}
        </div>
      )}
    </div>
  );

  const speedTrigger = (
    <button
      className={cn(
        "flex items-center gap-1.5 rounded px-2 py-1 text-xs transition-colors",
        hasSpeedBoost
          ? "bg-accent/20 text-accent hover:bg-accent/25"
          : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
      )}
      title={labels.speedTitle}
    >
      <StepForwardIcon className="h-4 w-4" />
      <span className="font-medium">
        {selectedSpeedClip ? `${selectedClipSpeed.toFixed(2)}x` : "1.00x"}
      </span>
    </button>
  );

  return (
    <div
      ref={toolbarRef}
      className={cn(
        "flex items-center gap-2 px-2 py-1 bg-surface-secondary border-b border-border-default",
        className
      )}
    >
      {isCompact ? (
        <Popover
          trigger={
            <button className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors">
              <FilmStripIcon />
            </button>
          }
          align="start"
          side="bottom"
          closeOnScroll={false}
        >
          <div className="flex flex-col gap-0.5 p-1.5 min-w-[240px]">
            <button
              onClick={() => addTrack()}
              className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-surface-tertiary text-text-secondary text-xs transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              <span>{labels.addLayer}</span>
            </button>
            <div className="h-px bg-border-default my-1" />
            <button
              onClick={toggleSnap}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                viewState.snapEnabled
                  ? "bg-accent/20 text-accent"
                  : "hover:bg-surface-tertiary text-text-secondary"
              )}
            >
              {viewState.snapEnabled ? <SnapIcon className="w-4 h-4" /> : <SnapOffIcon className="w-4 h-4" />}
              <span>{viewState.snapEnabled ? labels.snapOn : labels.snapOff}</span>
            </button>
            <button
              onClick={splitSelectedClipAtPlayhead}
              disabled={!canSplitSelectedClip}
              className={cn(
                "flex items-center gap-2 px-2 py-1.5 rounded text-xs transition-colors",
                canSplitSelectedClip
                  ? "hover:bg-surface-tertiary text-text-secondary"
                  : "text-text-quaternary cursor-not-allowed"
              )}
              title={labels.cutAtPlayhead}
            >
              <RazorToolIcon className="w-4 h-4 rotate-90" />
              <span>{labels.cutAtPlayhead}</span>
            </button>

            {renderSpeedPanel(true)}

            <div className="flex items-center gap-1 px-2 pt-1">
              <button
                onClick={setInPoint}
                className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
                title={labels.setIn}
              >
                IN
              </button>
              <button
                onClick={setOutPoint}
                className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
                title={labels.setOut}
              >
                OUT
              </button>
              <button
                onClick={() => clearLoopRange()}
                disabled={!hasCustomRange}
                className={cn(
                  "px-1.5 py-1 rounded text-[10px] transition-colors",
                  hasCustomRange
                    ? "bg-surface-tertiary hover:bg-interactive-hover text-text-secondary"
                    : "bg-surface-tertiary/50 text-text-quaternary cursor-not-allowed"
                )}
                title={labels.clearRange}
              >
                CLR
              </button>
              <button
                onClick={toggleLoop}
                className={cn(
                  "p-1 rounded transition-colors ml-auto",
                  playback.loop
                    ? "text-accent hover:bg-accent/20"
                    : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
                )}
                title={playback.loop ? labels.loopOn : labels.loopOff}
              >
                {playback.loop ? <LoopIcon className="w-3.5 h-3.5" /> : <LoopOffIcon className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </Popover>
      ) : (
        <>
          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{labels.addLayer}</span>
                <span className="text-text-tertiary text-[11px]">{labels.addLayerDesc}</span>
              </div>
            }
          >
            <button
              onClick={() => addTrack()}
              className="p-1.5 rounded hover:bg-surface-tertiary text-text-secondary transition-colors"
            >
              <PlusIcon />
            </button>
          </Tooltip>

          <div className="w-px h-4 bg-border-default" />

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{viewState.snapEnabled ? labels.snapOn : labels.snapOff}</span>
                <span className="text-text-tertiary text-[11px]">
                  {viewState.snapEnabled ? labels.snapOnDesc : labels.snapOffDesc}
                </span>
              </div>
            }
          >
            <button
              onClick={toggleSnap}
              className={cn(
                "p-1.5 rounded transition-colors",
                viewState.snapEnabled
                  ? "bg-accent/20 text-accent"
                  : "hover:bg-surface-tertiary text-text-secondary"
              )}
            >
              {viewState.snapEnabled ? <SnapIcon /> : <SnapOffIcon />}
            </button>
          </Tooltip>

          <Tooltip
            content={
              <div className="flex flex-col gap-1">
                <span className="font-medium">{labels.cutAtPlayhead}</span>
                <span className="text-text-tertiary text-[11px]">{labels.cutAtPlayheadDesc}</span>
              </div>
            }
          >
            <button
              onClick={splitSelectedClipAtPlayhead}
              disabled={!canSplitSelectedClip}
              className={cn(
                "p-1.5 rounded transition-colors",
                canSplitSelectedClip
                  ? "hover:bg-surface-tertiary text-text-secondary hover:text-text-primary"
                  : "text-text-quaternary cursor-not-allowed"
              )}
              title={labels.cutAtPlayhead}
            >
              <RazorToolIcon className="w-4 h-4 rotate-90" />
            </button>
          </Tooltip>

          <Popover
            trigger={speedTrigger}
            align="start"
            side="bottom"
            closeOnScroll={false}
          >
            {renderSpeedPanel(false)}
          </Popover>

          <div className="flex items-center gap-1">
            <button
              onClick={setInPoint}
              className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
              title={labels.setIn}
            >
              IN
            </button>
            <button
              onClick={setOutPoint}
              className="px-1.5 py-1 rounded text-[10px] bg-surface-tertiary hover:bg-interactive-hover text-text-secondary transition-colors"
              title={labels.setOut}
            >
              OUT
            </button>
            <button
              onClick={() => clearLoopRange()}
              disabled={!hasCustomRange}
              className={cn(
                "px-1.5 py-1 rounded text-[10px] transition-colors",
                hasCustomRange
                  ? "bg-surface-tertiary hover:bg-interactive-hover text-text-secondary"
                  : "bg-surface-tertiary/50 text-text-quaternary cursor-not-allowed"
              )}
              title={labels.clearRange}
            >
              CLR
            </button>
            <button
              onClick={toggleLoop}
              className={cn(
                "p-1.5 rounded transition-colors",
                playback.loop
                  ? "text-accent hover:bg-accent/20"
                  : "text-text-secondary hover:bg-surface-tertiary hover:text-text-primary"
              )}
              title={playback.loop ? labels.loopOn : labels.loopOff}
            >
              {playback.loop ? <LoopIcon className="w-4 h-4" /> : <LoopOffIcon className="w-4 h-4" />}
            </button>
          </div>
        </>
      )}

      <div className="flex-1" />

      <NumberScrubber
        value={viewState.zoom}
        onChange={setZoom}
        min={TIMELINE.MIN_ZOOM}
        max={TIMELINE.MAX_ZOOM}
        step={{ multiply: 1.5 }}
        format={(value) => `${Math.round(value)}px/s`}
        valueWidth="min-w-[60px]"
        size="sm"
        variant="zoom"
      />
    </div>
  );
}
