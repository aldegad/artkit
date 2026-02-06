import React from "react";
import { IconProps } from "./types";

export const PencilPresetIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

export const AirbrushPresetIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="3" strokeWidth={1.5} opacity={0.5} />
    <circle cx="12" cy="12" r="6" strokeWidth={1.5} opacity={0.7} />
    <circle cx="12" cy="12" r="9" strokeWidth={1.5} />
  </svg>
);

export const MarkerPresetIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="8" y="4" width="8" height="16" rx="1" strokeWidth={2} />
    <line x1="8" y1="8" x2="16" y2="8" strokeWidth={2} />
  </svg>
);

export const WatercolorPresetIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3c-2 4-4 6-4 9a4 4 0 108 0c0-3-2-5-4-9z" />
  </svg>
);

export const DefaultBrushPresetIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" strokeWidth={2} />
  </svg>
);

export const MagicWandIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 4l-1 1 4 4 1-1a1.414 1.414 0 00-4-4zM12.5 6.5L3 16v4h4l9.5-9.5-4-4z" />
    <path strokeWidth={2} d="M7 2v3M5.5 3.5h3M17 12v3M15.5 13.5h3M3 7v2M2 8h2" />
  </svg>
);
