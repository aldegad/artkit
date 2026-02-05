"use client";

import { useState, useRef, useEffect, useCallback, KeyboardEvent } from "react";
import { Popover } from "./Popover";
import { Scrollbar } from "./Scrollbar";

// ============================================
// Types
// ============================================

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
}

export interface SelectProps<T extends string = string> {
  /** Current value */
  value: T;
  /** Callback when value changes */
  onChange: (value: T) => void;
  /** Available options */
  options: SelectOption<T>[];
  /** Placeholder when no value selected */
  placeholder?: string;
  /** Additional class name for trigger button */
  className?: string;
  /** Size variant */
  size?: "sm" | "md";
  /** Disabled state */
  disabled?: boolean;
}

// ============================================
// Component
// ============================================

export function Select<T extends string = string>({
  value,
  onChange,
  options,
  placeholder = "Select...",
  className = "",
  size = "md",
  disabled = false,
}: SelectProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const listRef = useRef<HTMLDivElement>(null);

  // Find current option
  const selectedOption = options.find((opt) => opt.value === value);
  const selectedIndex = options.findIndex((opt) => opt.value === value);

  // Reset highlight when opening
  useEffect(() => {
    if (isOpen) {
      setHighlightedIndex(selectedIndex >= 0 ? selectedIndex : 0);
    }
  }, [isOpen, selectedIndex]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (isOpen && listRef.current && highlightedIndex >= 0) {
      const items = listRef.current.querySelectorAll("[data-select-item]");
      const item = items[highlightedIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: "nearest" });
      }
    }
  }, [isOpen, highlightedIndex]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (disabled) return;

      switch (e.key) {
        case "ArrowDown":
          e.preventDefault();
          if (!isOpen) {
            setIsOpen(true);
          } else {
            setHighlightedIndex((prev) => (prev < options.length - 1 ? prev + 1 : prev));
          }
          break;
        case "ArrowUp":
          e.preventDefault();
          if (isOpen) {
            setHighlightedIndex((prev) => (prev > 0 ? prev - 1 : prev));
          }
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          if (isOpen && highlightedIndex >= 0) {
            onChange(options[highlightedIndex].value);
            setIsOpen(false);
          } else if (!isOpen) {
            setIsOpen(true);
          }
          break;
        case "Escape":
          e.preventDefault();
          setIsOpen(false);
          break;
        case "Tab":
          if (isOpen) {
            setIsOpen(false);
          }
          break;
      }
    },
    [disabled, isOpen, highlightedIndex, options, onChange]
  );

  const handleSelect = useCallback(
    (option: SelectOption<T>) => {
      onChange(option.value);
      setIsOpen(false);
    },
    [onChange]
  );

  const sizeClasses = {
    sm: "px-1.5 py-0.5 text-xs min-h-[24px]",
    md: "px-3 py-1.5 text-sm min-h-[32px]",
  };

  const trigger = (
    <button
      type="button"
      disabled={disabled}
      onKeyDown={handleKeyDown}
      className={`flex items-center justify-between gap-2 bg-surface-primary border border-border-default rounded focus:outline-none focus:border-accent-primary transition-colors ${
        disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-surface-tertiary cursor-pointer"
      } ${sizeClasses[size]} ${className}`}
    >
      <span className={selectedOption ? "text-text-primary" : "text-text-tertiary"}>
        {selectedOption?.label ?? placeholder}
      </span>
      <svg
        className={`w-3 h-3 text-text-tertiary transition-transform ${isOpen ? "rotate-180" : ""}`}
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    </button>
  );

  return (
    <Popover
      trigger={trigger}
      open={isOpen}
      onOpenChange={setIsOpen}
      align="start"
      side="bottom"
      sideOffset={4}
      closeOnScroll={true}
    >
      <Scrollbar className="max-h-60 min-w-[120px]" overflow={{ x: "hidden", y: "scroll" }}>
        <div
          ref={listRef}
          className="py-1"
          role="listbox"
          aria-activedescendant={highlightedIndex >= 0 ? `select-option-${highlightedIndex}` : undefined}
        >
        {options.map((option, index) => {
          const isSelected = option.value === value;
          const isHighlighted = index === highlightedIndex;

          return (
            <button
              key={option.value}
              type="button"
              id={`select-option-${index}`}
              data-select-item
              role="option"
              aria-selected={isSelected}
              onClick={() => handleSelect(option)}
              onMouseEnter={() => setHighlightedIndex(index)}
              className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                size === "sm" ? "text-xs" : "text-sm"
              } ${isHighlighted ? "bg-interactive-hover" : ""} ${
                isSelected ? "text-accent-primary font-medium" : "text-text-primary"
              }`}
            >
              {/* Check mark for selected item */}
              <span className="w-4 flex-shrink-0">
                {isSelected && (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </span>
              <span>{option.label}</span>
            </button>
          );
        })}
        </div>
      </Scrollbar>
    </Popover>
  );
}
