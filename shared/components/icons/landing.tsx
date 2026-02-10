import React from "react";
import { IconProps } from "./types";

/**
 * Landing page premium icons
 * 32x32 viewBox, fill-heavy design with depth layers
 */

// Image Editor - Canvas with 8-petal flower + layer panel
export const LandingImageIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    <defs>
      <clipPath id="img-canvas-clip">
        <path
          d="M0 0h48v48H0z M32 2h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H32a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2z M32 11h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H32a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z M32 20h12a2 2 0 0 1 2 2v2a2 2 0 0 1-2 2H32a2 2 0 0 1-2-2v-2a2 2 0 0 1 2-2z"
          clipRule="evenodd"
        />
      </clipPath>
    </defs>

    {/* Main canvas (square, rounded) - clipped to exclude layer areas */}
    <rect x="2" y="4" width="39" height="39" rx="6" fill="currentColor" opacity={0.22} clipPath="url(#img-canvas-clip)" />

    {/* 5-petal flower, clipped to avoid layer overlap */}
    <g clipPath="url(#img-canvas-clip)">
      <ellipse cx="21" cy="15.5" rx="6" ry="7.5" fill="currentColor" opacity={0.4} />
      <ellipse cx="28.3" cy="20.7" rx="6" ry="7.5" fill="currentColor" opacity={0.5} transform="rotate(72 28.3 20.7)" />
      <ellipse cx="25.5" cy="29.3" rx="6" ry="7.5" fill="currentColor" opacity={0.6} transform="rotate(144 25.5 29.3)" />
      <ellipse cx="16.5" cy="29.3" rx="6" ry="7.5" fill="currentColor" opacity={0.5} transform="rotate(216 16.5 29.3)" />
      <ellipse cx="13.7" cy="20.7" rx="6" ry="7.5" fill="currentColor" opacity={0.4} transform="rotate(288 13.7 20.7)" />
      {/* Flower center */}
      <circle cx="21" cy="23.5" r="4.5" fill="currentColor" opacity={1} />
    </g>

    {/* Side layer thumbnails (thinner) */}
    <rect x="30" y="2" width="16" height="6" rx="2" fill="currentColor" opacity={0.65} />
    <rect x="30" y="11" width="16" height="6" rx="2" fill="currentColor" opacity={0.45} />
    <rect x="30" y="20" width="16" height="6" rx="2" fill="currentColor" opacity={0.3} />
  </svg>
);

// Video Editor - Multi-track timeline with playhead
export const LandingVideoIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    {/* Track 1 - Video */}
    <rect x="1" y="5" width="21" height="5.5" rx="1.7" fill="currentColor" opacity={0.47} />
    <rect x="24" y="5" width="7.5" height="5.5" rx="1.7" fill="currentColor" opacity={0.29} />

    {/* Track 2 - B-roll */}
    <rect x="5" y="14" width="17.5" height="5" rx="1.7" fill="currentColor" opacity={0.35} />
    <rect x="24" y="14" width="7.5" height="5" rx="1.7" fill="currentColor" opacity={0.24} />

    {/* Track 3 - Audio */}
    <rect x="1" y="23" width="22.5" height="5" rx="1.7" fill="currentColor" opacity={0.24} />

    {/* Playhead */}
    <path d="M18 3l2 3 2-3z" fill="currentColor" opacity={0.94} />
    <line x1="20" y1="5" x2="20" y2="29" stroke="currentColor" strokeWidth={1.7} opacity={0.82} />

    {/* Play button */}
    <path d="M13 10v12l11-6z" fill="currentColor" opacity={1} />
  </svg>
);

// Sprite Editor - Sprite sheet grid with walking animation sequence
export const LandingSpriteIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    {/* 3×2 filled rectangles — gap 2px */}
    <rect x="2" y="3" width="8" height="12" rx="1.5" fill="currentColor" opacity={0.08} />
    <rect x="12" y="3" width="8" height="12" rx="1.5" fill="currentColor" opacity={0.14} />
    <rect x="22" y="3" width="8" height="12" rx="1.5" fill="currentColor" opacity={0.10} />
    <rect x="2" y="17" width="8" height="12" rx="1.5" fill="currentColor" opacity={0.06} />
    <rect x="12" y="17" width="8" height="12" rx="1.5" fill="currentColor" opacity={0.10} />
    <rect x="22" y="17" width="8" height="12" rx="1.5" fill="currentColor" opacity={0.07} />

    {/* Frame 1 — Stand (top-left) */}
    <g opacity={0.3}>
      <circle cx="6" cy="5.7" r="1.6" fill="currentColor" />
      <line x1="6" y1="7.4" x2="6" y2="9" stroke="currentColor" strokeWidth={1.05} strokeLinecap="round" />
      <line x1="6" y1="9" x2="5" y2="12.2" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
      <line x1="6" y1="9" x2="7" y2="12.2" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
    </g>

    {/* Frame 2 — Right step (top-center) */}
    <g opacity={0.85}>
      <circle cx="16" cy="5.2" r="1.7" fill="currentColor" />
      <line x1="16" y1="7" x2="16" y2="8.5" stroke="currentColor" strokeWidth={1.15} strokeLinecap="round" />
      <line x1="16" y1="8.5" x2="14.4" y2="12.2" stroke="currentColor" strokeWidth={1.0} strokeLinecap="round" />
      <line x1="16" y1="8.5" x2="18" y2="11.6" stroke="currentColor" strokeWidth={1.0} strokeLinecap="round" />
      <line x1="16" y1="7.6" x2="14.4" y2="8.8" stroke="currentColor" strokeWidth={0.75} strokeLinecap="round" />
      <line x1="16" y1="7.6" x2="17.8" y2="8.4" stroke="currentColor" strokeWidth={0.75} strokeLinecap="round" />
    </g>

    {/* Frame 3 — Full stride right (top-right) */}
    <g opacity={0.3}>
      <circle cx="26" cy="5.7" r="1.6" fill="currentColor" />
      <line x1="26" y1="7.4" x2="25.8" y2="9" stroke="currentColor" strokeWidth={1.05} strokeLinecap="round" />
      <line x1="25.8" y1="9" x2="24" y2="12.1" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
      <line x1="25.8" y1="9" x2="27.8" y2="11.3" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
    </g>

    {/* Frame 4 — Contact/pass (bottom-left) */}
    <g opacity={0.3}>
      <circle cx="6" cy="20.7" r="1.6" fill="currentColor" />
      <line x1="6" y1="22.4" x2="6" y2="24" stroke="currentColor" strokeWidth={1.05} strokeLinecap="round" />
      <line x1="6" y1="24" x2="5.6" y2="27.2" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
      <line x1="6" y1="24" x2="6.4" y2="27.2" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
    </g>

    {/* Frame 5 — Left step (bottom-center) */}
    <g opacity={0.3}>
      <circle cx="16" cy="20.7" r="1.6" fill="currentColor" />
      <line x1="16" y1="22.4" x2="16" y2="24" stroke="currentColor" strokeWidth={1.05} strokeLinecap="round" />
      <line x1="16" y1="24" x2="17.6" y2="27.1" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
      <line x1="16" y1="24" x2="14" y2="27.2" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
    </g>

    {/* Frame 6 — Full stride left (bottom-right) */}
    <g opacity={0.3}>
      <circle cx="26" cy="20.7" r="1.6" fill="currentColor" />
      <line x1="26" y1="22.4" x2="26.2" y2="24" stroke="currentColor" strokeWidth={1.05} strokeLinecap="round" />
      <line x1="26.2" y1="24" x2="28" y2="27.1" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
      <line x1="26.2" y1="24" x2="24.4" y2="27.2" stroke="currentColor" strokeWidth={0.9} strokeLinecap="round" />
    </g>
  </svg>
);
