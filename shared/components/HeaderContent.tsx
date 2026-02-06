"use client";

import { ReactNode } from "react";
import { HeaderSlot } from "../contexts/HeaderSlotContext";

// ============================================
// Types
// ============================================

interface HeaderContentProps {
  /** Page title text */
  title: string;
  /** Domain-specific menu bar. When present, title is hidden on mobile */
  menuBar?: ReactNode;
  /** Editable project name input */
  projectName?: {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
  };
  /** Read-only info displayed after divider (file name, dimensions, etc.) */
  info?: ReactNode;
  /** Additional content appended at the end */
  extra?: ReactNode;
}

// ============================================
// Sub-components
// ============================================

function HeaderDivider() {
  return <div className="h-4 w-px bg-border-default shrink-0" />;
}

// ============================================
// HeaderContent
// ============================================

export function HeaderContent({
  title,
  menuBar,
  projectName,
  info,
  extra,
}: HeaderContentProps) {
  const titleMobileClass = menuBar ? "hidden md:block" : "";
  const hasSecondary = projectName || info;

  return (
    <HeaderSlot>
      <h1
        className={`text-sm font-semibold whitespace-nowrap ${titleMobileClass}`}
      >
        {title}
      </h1>

      {menuBar}

      {hasSecondary && (
        <>
          <HeaderDivider />

          {projectName && (
            <input
              type="text"
              value={projectName.value}
              onChange={(e) => projectName.onChange(e.target.value)}
              placeholder={projectName.placeholder}
              className="px-2 py-0.5 bg-surface-secondary border border-border-default rounded text-xs w-16 md:w-24 focus:outline-none focus:border-accent-primary"
            />
          )}

          {info}
        </>
      )}

      {extra}
    </HeaderSlot>
  );
}
