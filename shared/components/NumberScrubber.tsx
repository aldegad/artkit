"use client";

import { useState, useRef, useCallback } from "react";
import { MinusIcon, PlusIcon } from "./icons";
import { cn } from "@/shared/utils/cn";

interface NumberScrubberProps {
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number | { multiply: number };
  format?: (value: number) => string;
  label?: string;
  size?: "sm" | "md";
  disabled?: boolean;
  className?: string;
  sensitivity?: number;
  valueWidth?: string;
  editable?: boolean;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function NumberScrubber({
  value,
  onChange,
  min,
  max,
  step,
  format,
  label,
  size = "sm",
  disabled = false,
  className,
  sensitivity,
  valueWidth,
  editable = false,
}: NumberScrubberProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const isDraggingRef = useRef(false);

  const isMultiplicative = typeof step === "object" && "multiply" in step;
  const linearStep = typeof step === "number" ? step : 1;
  const multiplyFactor = isMultiplicative ? step.multiply : 1;
  const defaultSensitivity = isMultiplicative ? 40 : Math.max(2, 8 / linearStep);
  const dragSensitivity = sensitivity ?? defaultSensitivity;

  const handleIncrement = useCallback(() => {
    if (disabled) return;
    if (isMultiplicative) {
      onChange(clamp(value * multiplyFactor, min, max));
    } else {
      onChange(clamp(value + linearStep, min, max));
    }
  }, [disabled, isMultiplicative, value, multiplyFactor, linearStep, min, max, onChange]);

  const handleDecrement = useCallback(() => {
    if (disabled) return;
    if (isMultiplicative) {
      onChange(clamp(value / multiplyFactor, min, max));
    } else {
      onChange(clamp(value - linearStep, min, max));
    }
  }, [disabled, isMultiplicative, value, multiplyFactor, linearStep, min, max, onChange]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (disabled || isEditing) return;
      e.preventDefault();
      const startX = e.clientX;
      const startValue = value;
      isDraggingRef.current = false;

      const handlePointerMove = (moveEvent: PointerEvent) => {
        const deltaX = moveEvent.clientX - startX;
        if (Math.abs(deltaX) > 2) isDraggingRef.current = true;

        if (isMultiplicative) {
          const steps = Math.round(deltaX / dragSensitivity);
          let newValue = startValue;
          if (steps > 0) {
            for (let i = 0; i < steps; i++) newValue *= multiplyFactor;
          } else {
            for (let i = 0; i < Math.abs(steps); i++) newValue /= multiplyFactor;
          }
          onChange(clamp(newValue, min, max));
        } else {
          const steps = Math.round(deltaX / dragSensitivity);
          const newValue = startValue + steps * linearStep;
          onChange(clamp(Math.round(newValue / linearStep) * linearStep, min, max));
        }
      };

      const handlePointerUp = () => {
        document.body.style.cursor = "";
        document.removeEventListener("pointermove", handlePointerMove);
        document.removeEventListener("pointerup", handlePointerUp);
      };

      document.body.style.cursor = "ew-resize";
      document.addEventListener("pointermove", handlePointerMove);
      document.addEventListener("pointerup", handlePointerUp);
    },
    [disabled, isEditing, value, isMultiplicative, dragSensitivity, multiplyFactor, linearStep, min, max, onChange]
  );

  const handleDoubleClick = useCallback(() => {
    if (!editable || disabled) return;
    setEditValue(String(Math.round(value)));
    setIsEditing(true);
  }, [editable, disabled, value]);

  const commitEdit = useCallback(() => {
    const parsed = parseFloat(editValue);
    if (!isNaN(parsed)) {
      onChange(clamp(parsed, min, max));
    }
    setIsEditing(false);
  }, [editValue, onChange, min, max]);

  const displayValue = format ? format(value) : String(value);

  const iconSize = size === "sm" ? "w-3 h-3" : "w-3.5 h-3.5";
  const btnClass = cn(
    "flex items-center justify-center rounded transition-colors",
    size === "sm" ? "w-5 h-5" : "p-1",
    disabled
      ? "opacity-40 cursor-not-allowed"
      : "hover:bg-interactive-hover text-text-secondary"
  );

  return (
    <div className={cn("flex items-center gap-1", className)}>
      {label && (
        <span className="text-xs text-text-secondary whitespace-nowrap">{label}</span>
      )}
      <button
        onClick={handleDecrement}
        disabled={disabled || value <= min}
        className={btnClass}
        tabIndex={-1}
      >
        <MinusIcon className={iconSize} />
      </button>

      {isEditing ? (
        <input
          autoFocus
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitEdit();
            if (e.key === "Escape") setIsEditing(false);
          }}
          className={cn(
            "px-1 py-0.5 bg-surface-primary border border-accent-primary rounded text-center focus:outline-none",
            size === "sm" ? "w-10 text-xs" : "w-12 text-xs"
          )}
          min={min}
          max={max}
        />
      ) : (
        <span
          onPointerDown={handlePointerDown}
          onDoubleClick={editable ? handleDoubleClick : undefined}
          className={cn(
            "text-xs text-center text-text-primary select-none",
            !disabled && "cursor-ew-resize",
            valueWidth ?? (size === "sm" ? "min-w-[32px]" : "min-w-[40px]")
          )}
        >
          {displayValue}
        </span>
      )}

      <button
        onClick={handleIncrement}
        disabled={disabled || value >= max}
        className={btnClass}
        tabIndex={-1}
      >
        <PlusIcon className={iconSize} />
      </button>
    </div>
  );
}
