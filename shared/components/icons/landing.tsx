import React from "react";
import { IconProps } from "./types";

/**
 * Landing page icons
 * 24x24 viewBox, stroke-based design matching sidebar icon style
 */

// Image Editor - Photo/landscape icon
export const LandingImageIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
    <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15l-5-5L5 21" />
  </svg>
);

// Video Editor - Screen with play button
export const LandingVideoIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 8.5v7l6-3.5-6-3.5z" />
  </svg>
);

// Sprite Editor - Sprite sheet grid (3x2 frames)
export const LandingSpriteIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="3" width="20" height="18" rx="2" strokeWidth={2} />
    <line x1="9" y1="3" x2="9" y2="21" strokeWidth={2} />
    <line x1="16" y1="3" x2="16" y2="21" strokeWidth={2} />
    <line x1="2" y1="12" x2="22" y2="12" strokeWidth={2} />
  </svg>
);
