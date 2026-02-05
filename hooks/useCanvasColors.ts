"use client";

import { useSyncExternalStore } from "react";

/**
 * Canvas 2D 컨텍스트에서 사용할 색상 값들
 * CSS 변수에서 읽어와서 테마 변경 시 자동 업데이트
 */
export interface CanvasColors {
  // Selection
  selection: string;
  selectionFill: string;
  selectionAlt: string;
  selectionAltFill: string;

  // Tools
  toolDraw: string;
  toolErase: string;
  toolHighlight: string;

  // States
  stateDuplicate: string;
  stateMove: string;

  // Checkerboard
  checkerboardLight: string;
  checkerboardDark: string;

  // Overlay & UI
  overlay: string;
  grid: string;
  gridAlt: string;
  textOnColor: string;

  // Waveform
  waveformBg: string;
  waveformLine: string;
  waveformHandle: string;
  waveformPlayhead: string;
  waveformTrimFill: string;
}

function getCSSVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function getCanvasColors(): CanvasColors {
  return {
    // Selection
    selection: getCSSVar("--canvas-selection", "#3b82f6"),
    selectionFill: getCSSVar(
      "--canvas-selection-fill",
      "rgba(59, 130, 246, 0.25)"
    ),
    selectionAlt: getCSSVar("--canvas-selection-alt", "#00aaff"),
    selectionAltFill: getCSSVar(
      "--canvas-selection-alt-fill",
      "rgba(0, 150, 255, 0.25)"
    ),

    // Tools
    toolDraw: getCSSVar("--canvas-tool-draw", "#00ff00"),
    toolErase: getCSSVar("--canvas-tool-erase", "#ff4444"),
    toolHighlight: getCSSVar("--canvas-tool-highlight", "#ff0000"),

    // States
    stateDuplicate: getCSSVar("--canvas-state-duplicate", "#22c55e"),
    stateMove: getCSSVar("--canvas-state-move", "#f59e0b"),

    // Checkerboard
    checkerboardLight: getCSSVar("--checkerboard-light", "#ffffff"),
    checkerboardDark: getCSSVar("--checkerboard-dark", "#e5e7eb"),

    // Overlay & UI
    overlay: getCSSVar("--canvas-overlay", "rgba(0, 0, 0, 0.5)"),
    grid: getCSSVar("--canvas-grid", "rgba(255, 255, 255, 0.3)"),
    gridAlt: getCSSVar("--canvas-grid-alt", "rgba(0, 255, 255, 0.9)"),
    textOnColor: getCSSVar("--canvas-text-on-color", "#ffffff"),

    // Waveform
    waveformBg: getCSSVar("--waveform-bg", "#1a1a2e"),
    waveformLine: getCSSVar("--waveform-line", "#3b82f6"),
    waveformHandle: getCSSVar("--waveform-handle", "#60a5fa"),
    waveformPlayhead: getCSSVar("--waveform-playhead", "#ef4444"),
    waveformTrimFill: getCSSVar(
      "--waveform-trim-fill",
      "rgba(59, 130, 246, 0.1)"
    ),
  };
}

// 테마 변경을 감지하기 위한 subscribe 함수
function subscribe(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};

  // MutationObserver로 html 클래스 변경 감지 (light/dark 전환)
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (
        mutation.type === "attributes" &&
        mutation.attributeName === "class"
      ) {
        callback();
      }
    }
  });

  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class"],
  });

  return () => observer.disconnect();
}

// SSR 대응을 위한 서버 스냅샷
function getServerSnapshot(): CanvasColors {
  return {
    selection: "#3b82f6",
    selectionFill: "rgba(59, 130, 246, 0.25)",
    selectionAlt: "#00aaff",
    selectionAltFill: "rgba(0, 150, 255, 0.25)",
    toolDraw: "#00ff00",
    toolErase: "#ff4444",
    toolHighlight: "#ff0000",
    stateDuplicate: "#22c55e",
    stateMove: "#f59e0b",
    checkerboardLight: "#ffffff",
    checkerboardDark: "#e5e7eb",
    overlay: "rgba(0, 0, 0, 0.5)",
    grid: "rgba(255, 255, 255, 0.3)",
    gridAlt: "rgba(0, 255, 255, 0.9)",
    textOnColor: "#ffffff",
    waveformBg: "#1a1a2e",
    waveformLine: "#3b82f6",
    waveformHandle: "#60a5fa",
    waveformPlayhead: "#ef4444",
    waveformTrimFill: "rgba(59, 130, 246, 0.1)",
  };
}

/**
 * Canvas에서 사용할 테마 색상을 제공하는 훅
 * 테마 변경 시 자동으로 업데이트됨
 */
export function useCanvasColors(): CanvasColors {
  return useSyncExternalStore(subscribe, getCanvasColors, getServerSnapshot);
}

/**
 * 컴포넌트 외부에서 현재 테마의 캔버스 색상을 가져오는 함수
 * (훅을 사용할 수 없는 상황에서 사용)
 */
export function getCanvasColorsSync(): CanvasColors {
  return getCanvasColors();
}
