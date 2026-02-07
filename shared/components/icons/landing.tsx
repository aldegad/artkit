import React from "react";
import { IconProps } from "./types";

/**
 * Landing page premium icons
 * 32x32 viewBox, fill-heavy design with depth layers
 */

// Image Editor - Layered canvas with bold brush
export const LandingImageIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    {/* Back layer (depth) */}
    <rect
      x="8"
      y="1"
      width="18"
      height="22"
      rx="2.5"
      stroke="currentColor"
      strokeWidth={1.5}
      opacity={0.18}
    />

    {/* Front canvas */}
    <rect
      x="3"
      y="5"
      width="18"
      height="22"
      rx="2.5"
      fill="currentColor"
      opacity={0.07}
    />
    <rect
      x="3"
      y="5"
      width="18"
      height="22"
      rx="2.5"
      stroke="currentColor"
      strokeWidth={1.5}
    />

    {/* Sun */}
    <circle cx="8" cy="11" r="2.5" fill="currentColor" opacity={0.3} />

    {/* Mountain silhouette */}
    <path
      d="M3 25l5-7 3.5 2.5 5.5-8 4 6v6.5H3z"
      fill="currentColor"
      opacity={0.18}
    />

    {/* Paintbrush handle */}
    <path
      d="M20 23L30 5"
      stroke="currentColor"
      strokeWidth={3}
      strokeLinecap="round"
      opacity={0.55}
    />

    {/* Brush tip paint blob */}
    <circle cx="19" cy="24.5" r="3.5" fill="currentColor" opacity={0.75} />
  </svg>
);

// Video Editor - Multi-track timeline with playhead
export const LandingVideoIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 48 48" fill="none">
    {/* Track 1 - Main video clip */}
    <rect
      x="3"
      y="5"
      width="28"
      height="11"
      rx="2.5"
      fill="currentColor"
      opacity={0.25}
    />
    {/* Thumbnail frames inside clip */}
    <rect x="5" y="7" width="5" height="7" rx="1" fill="currentColor" opacity={0.15} />
    <rect x="12" y="7" width="5" height="7" rx="1" fill="currentColor" opacity={0.15} />
    <rect x="19" y="7" width="5" height="7" rx="1" fill="currentColor" opacity={0.15} />
    {/* Short clip after gap */}
    <rect
      x="34"
      y="5"
      width="11"
      height="11"
      rx="2.5"
      fill="currentColor"
      opacity={0.12}
    />

    {/* Track 2 - B-roll */}
    <rect
      x="10"
      y="19"
      width="22"
      height="10"
      rx="2.5"
      fill="currentColor"
      opacity={0.18}
    />
    <rect
      x="35"
      y="19"
      width="10"
      height="10"
      rx="2.5"
      fill="currentColor"
      opacity={0.1}
    />

    {/* Track 3 - Audio waveform */}
    <rect
      x="3"
      y="32"
      width="34"
      height="9"
      rx="2.5"
      fill="currentColor"
      opacity={0.08}
    />
    {/* Waveform bars */}
    <line x1="8" y1="34.5" x2="8" y2="38.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.18} />
    <line x1="13" y1="33.5" x2="13" y2="39.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.18} />
    <line x1="18" y1="35" x2="18" y2="38" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.18} />
    <line x1="23" y1="33" x2="23" y2="40" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.18} />
    <line x1="28" y1="34.5" x2="28" y2="38.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.18} />
    <line x1="33" y1="35.5" x2="33" y2="37.5" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" opacity={0.18} />

    {/* Playhead knob */}
    <path d="M25 1l3 4 3-4z" fill="currentColor" opacity={0.7} />
    {/* Playhead line */}
    <line
      x1="28"
      y1="4"
      x2="28"
      y2="44"
      stroke="currentColor"
      strokeWidth={2}
      opacity={0.55}
    />

    {/* Play button overlay - centered, YouTube-style */}
    <circle cx="24" cy="22" r="8" fill="currentColor" opacity={0.15} />
    <path d="M21 18v8l7-4z" fill="currentColor" opacity={0.65} />
  </svg>
);

// Sprite Editor - Fanned animation frames with motion
export const LandingSpriteIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    {/* Back frame (rotated clockwise) */}
    <rect
      x="7"
      y="2"
      width="15"
      height="20"
      rx="2"
      stroke="currentColor"
      strokeWidth={1.2}
      opacity={0.15}
      transform="rotate(12 14.5 12)"
    />

    {/* Middle frame */}
    <rect
      x="5.5"
      y="3"
      width="15"
      height="20"
      rx="2"
      stroke="currentColor"
      strokeWidth={1.3}
      opacity={0.3}
      transform="rotate(-4 13 13)"
    />

    {/* Front frame */}
    <rect
      x="4"
      y="4"
      width="15"
      height="20"
      rx="2.5"
      fill="currentColor"
      opacity={0.08}
    />
    <rect
      x="4"
      y="4"
      width="15"
      height="20"
      rx="2.5"
      stroke="currentColor"
      strokeWidth={1.5}
    />

    {/* Sprite element on front frame */}
    <rect
      x="7.5"
      y="9"
      width="8"
      height="8"
      rx="1.5"
      fill="currentColor"
      opacity={0.1}
    />
    <rect
      x="9"
      y="10.5"
      width="5"
      height="5"
      rx="0.5"
      fill="currentColor"
      opacity={0.45}
    />

    {/* Horizontal motion trail (animation feel) */}
    <circle cx="23" cy="14" r="1.5" fill="currentColor" opacity={0.12} />
    <circle cx="26" cy="14" r="2" fill="currentColor" opacity={0.28} />
    <circle cx="29.5" cy="14" r="2.5" fill="currentColor" opacity={0.5} />
  </svg>
);
