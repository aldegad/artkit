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

// Video Editor - Clapperboard with play
export const LandingVideoIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    {/* Clapper hinge (top) */}
    <path
      d="M4 3h24l2 7H2L4 3z"
      fill="currentColor"
      opacity={0.35}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    />

    {/* Clapper stripes (2 bold) */}
    <line
      x1="11"
      y1="3"
      x2="13.5"
      y2="10"
      stroke="currentColor"
      strokeWidth={2.5}
      opacity={0.25}
    />
    <line
      x1="20"
      y1="3"
      x2="22.5"
      y2="10"
      stroke="currentColor"
      strokeWidth={2.5}
      opacity={0.25}
    />

    {/* Hinge pivot */}
    <circle cx="5" cy="10" r="1.5" fill="currentColor" opacity={0.4} />

    {/* Board body */}
    <rect
      x="2"
      y="10"
      width="28"
      height="19"
      rx="2.5"
      fill="currentColor"
      opacity={0.07}
    />
    <rect
      x="2"
      y="10"
      width="28"
      height="19"
      rx="2.5"
      stroke="currentColor"
      strokeWidth={1.5}
    />

    {/* Play triangle (prominent) */}
    <path d="M12 15v9l8-4.5L12 15z" fill="currentColor" opacity={0.6} />
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
