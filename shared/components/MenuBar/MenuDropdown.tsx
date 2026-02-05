"use client";

import { Popover } from "../Popover";
import { CheckIcon } from "../icons";
import type { MenuDropdownProps } from "./types";

export function MenuDropdown({
  label,
  items,
  isOpen,
  onOpenChange,
}: MenuDropdownProps) {
  return (
    <Popover
      trigger={
        <button
          className={`px-3 py-1 text-sm transition-colors rounded ${
            isOpen
              ? "bg-interactive-hover text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-interactive-hover"
          }`}
        >
          {label}
        </button>
      }
      open={isOpen}
      onOpenChange={onOpenChange}
      align="start"
      sideOffset={4}
      closeOnScroll={false}
    >
      <div className="min-w-[180px] py-1">
        {items.map((item, index) =>
          item.divider ? (
            <div key={index} className="my-1 border-t border-border-default" />
          ) : (
            <button
              key={index}
              onClick={() => {
                if (!item.disabled && item.onClick) {
                  item.onClick();
                  onOpenChange(false);
                }
              }}
              disabled={item.disabled}
              className={`w-full px-3 py-1.5 text-left text-sm flex items-center gap-2 transition-colors ${
                item.disabled
                  ? "text-text-quaternary cursor-not-allowed"
                  : "text-text-primary hover:bg-interactive-hover"
              }`}
            >
              <span className="w-4 h-4 flex items-center justify-center shrink-0">
                {item.checked && <CheckIcon />}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.shortcut && (
                <span className="text-text-quaternary text-xs">
                  {item.shortcut}
                </span>
              )}
            </button>
          )
        )}
      </div>
    </Popover>
  );
}
