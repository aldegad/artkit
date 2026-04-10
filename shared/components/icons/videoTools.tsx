import React from "react";
import { IconProps } from "./types";

export const TrimStartIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.5 4v16" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 5h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-2" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} strokeDasharray="1.5 3" d="M5 7v10" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} strokeDasharray="1.5 3" d="M8 7v10" />
  </svg>
);

export const TrimToolIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4H5v16h4M15 4h4v16h-4" />
  </svg>
);

export const TrimEndIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12.5 4v16" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h2" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} strokeDasharray="1.5 3" d="M16 7v10" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} strokeDasharray="1.5 3" d="M19 7v10" />
  </svg>
);

export const RazorToolIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="6" cy="6" r="3" strokeWidth={2} />
    <circle cx="6" cy="18" r="3" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.46 8.46L20 20M8.46 15.54L20 4" />
  </svg>
);

export const TimelineCompactIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="7" width="4" height="10" rx="1.5" strokeWidth={2} />
    <rect x="17" y="7" width="4" height="10" rx="1.5" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 8l-3 4 3 4" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 8l3 4-3 4" />
  </svg>
);

export const MaskToolIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
    <circle cx="12" cy="12" r="6" strokeWidth={2} strokeDasharray="4 2" />
  </svg>
);
