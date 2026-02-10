"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { PanIcon } from "@/shared/components/icons";
import { safeReleasePointerCapture, safeSetPointerCapture } from "@/shared/utils";
import { useVideoState } from "../contexts";

const STORAGE_KEY = "artkit.video.pan-toggle-position-v1";
const BUTTON_SIZE = 48;
const MARGIN = 16;
const DRAG_THRESHOLD = 6;
const FLING_SPEED_THRESHOLD = 0.8;
const FLING_DISTANCE = 180;

type Position = { x: number; y: number };

interface DragState {
  pointerId: number;
  startPointer: Position;
  startPosition: Position;
  offset: Position;
  currentPosition: Position;
  moved: boolean;
}

function getDefaultPosition(): Position {
  if (typeof window === "undefined") return { x: MARGIN, y: MARGIN };
  return {
    x: window.innerWidth - BUTTON_SIZE - MARGIN,
    y: window.innerHeight - BUTTON_SIZE - MARGIN,
  };
}

function clampPosition(pos: Position): Position {
  if (typeof window === "undefined") return pos;

  const maxX = Math.max(MARGIN, window.innerWidth - BUTTON_SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - BUTTON_SIZE - MARGIN);
  return {
    x: Math.min(maxX, Math.max(MARGIN, pos.x)),
    y: Math.min(maxY, Math.max(MARGIN, pos.y)),
  };
}

function readSavedPosition(): Position | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Position;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    return clampPosition(parsed);
  } catch {
    return null;
  }
}

function savePosition(pos: Position) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch {
    // Ignore storage errors.
  }
}

function snapToNearestEdge(pos: Position): Position {
  if (typeof window === "undefined") return pos;

  const maxX = Math.max(MARGIN, window.innerWidth - BUTTON_SIZE - MARGIN);
  const maxY = Math.max(MARGIN, window.innerHeight - BUTTON_SIZE - MARGIN);

  const distances = [
    { edge: "left", value: pos.x - MARGIN },
    { edge: "right", value: maxX - pos.x },
    { edge: "top", value: pos.y - MARGIN },
    { edge: "bottom", value: maxY - pos.y },
  ] as const;

  const nearest = distances.reduce((closest, current) =>
    current.value < closest.value ? current : closest
  );

  switch (nearest.edge) {
    case "left":
      return { x: MARGIN, y: pos.y };
    case "right":
      return { x: maxX, y: pos.y };
    case "top":
      return { x: pos.x, y: MARGIN };
    case "bottom":
      return { x: pos.x, y: maxY };
    default:
      return pos;
  }
}

export default function VideoPanModeToggle() {
  const { isPanLocked, setIsPanLocked } = useVideoState();

  const [position, setPosition] = useState<Position | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<DragState | null>(null);
  const trailRef = useRef<Array<{ x: number; y: number; t: number }>>([]);

  const togglePanMode = useCallback(() => {
    setIsPanLocked(!isPanLocked);
  }, [isPanLocked, setIsPanLocked]);

  useEffect(() => {
    const initial = readSavedPosition() || getDefaultPosition();
    const clamped = clampPosition(initial);
    setPosition(clamped);
    savePosition(clamped);
  }, []);

  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => {
        if (!prev) return prev;
        const clamped = clampPosition(prev);
        savePosition(clamped);
        return clamped;
      });
    };

    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!position) return;
      if (!e.isPrimary) return;

      e.preventDefault();
      safeSetPointerCapture(e.currentTarget, e.pointerId);

      dragRef.current = {
        pointerId: e.pointerId,
        startPointer: { x: e.clientX, y: e.clientY },
        startPosition: position,
        offset: {
          x: e.clientX - position.x,
          y: e.clientY - position.y,
        },
        currentPosition: position,
        moved: false,
      };

      trailRef.current = [{ x: e.clientX, y: e.clientY, t: performance.now() }];
      setIsDragging(true);
    },
    [position]
  );

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const dragState = dragRef.current;
    if (!dragState || dragState.pointerId !== e.pointerId) return;

    e.preventDefault();
    const nextPos = clampPosition({
      x: e.clientX - dragState.offset.x,
      y: e.clientY - dragState.offset.y,
    });

    const moveDistance = Math.hypot(
      e.clientX - dragState.startPointer.x,
      e.clientY - dragState.startPointer.y
    );
    if (!dragState.moved && moveDistance > DRAG_THRESHOLD) {
      dragState.moved = true;
    }

    dragState.currentPosition = nextPos;
    setPosition(nextPos);

    const now = performance.now();
    trailRef.current.push({ x: e.clientX, y: e.clientY, t: now });
    trailRef.current = trailRef.current.filter((point) => now - point.t <= 120);
  }, []);

  const handlePointerUp = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      const dragState = dragRef.current;
      if (!dragState || dragState.pointerId !== e.pointerId) return;

      safeReleasePointerCapture(e.currentTarget, e.pointerId);

      setIsDragging(false);
      dragRef.current = null;

      const tapDistance = Math.hypot(
        e.clientX - dragState.startPointer.x,
        e.clientY - dragState.startPointer.y
      );

      if (!dragState.moved && tapDistance <= DRAG_THRESHOLD) {
        setPosition(dragState.startPosition);
        togglePanMode();
        return;
      }

      let projected = dragState.currentPosition;
      const trail = trailRef.current;
      if (trail.length >= 2) {
        const first = trail[0];
        const last = trail[trail.length - 1];
        const dt = Math.max(1, last.t - first.t);
        const vx = (last.x - first.x) / dt;
        const vy = (last.y - first.y) / dt;
        const speed = Math.hypot(vx, vy);

        if (speed > FLING_SPEED_THRESHOLD) {
          projected = clampPosition({
            x: dragState.currentPosition.x + vx * FLING_DISTANCE,
            y: dragState.currentPosition.y + vy * FLING_DISTANCE,
          });
        }
      }

      const snapped = clampPosition(snapToNearestEdge(projected));
      setPosition(snapped);
      savePosition(snapped);
    },
    [togglePanMode]
  );

  if (!position) return null;

  return (
    <button
      type="button"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          togglePanMode();
        }
      }}
      aria-label="Touch pan lock"
      aria-pressed={isPanLocked}
      className={`
        fixed md:hidden z-50 rounded-full shadow-lg transition-[left,top,transform,background-color,color] duration-200 ease-out
        w-12 h-12 flex items-center justify-center select-none touch-none
        ${
          isPanLocked
            ? "bg-accent-primary text-white"
            : "bg-surface-secondary/90 text-text-secondary hover:bg-surface-tertiary"
        }
        ${isDragging ? "scale-105 cursor-grabbing" : "scale-100 cursor-grab"}
      `}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        transitionDuration: isDragging ? "0ms" : "180ms",
      }}
      title={isPanLocked ? "Touch pan lock ON (touch: pan/zoom only, pen: edit tools)" : "Touch pan lock OFF"}
    >
      <PanIcon className="w-5 h-5" />
      {isPanLocked && (
        <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-green-400 rounded-full border-2 border-white" />
      )}
    </button>
  );
}
