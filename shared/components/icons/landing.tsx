import React from "react";
import { IconProps } from "./types";

/**
 * Landing page premium icons
 * 32x32 viewBox, fill-heavy design with depth layers
 * More detailed and distinctive than sidebar toolbar icons
 */

// Image Editor - Layered canvas with bold brush stroke
export const LandingImageIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    {/* Back layer (offset canvas) */}
    <rect
      x="8"
      y="1"
      width="18"
      height="22"
      rx="2.5"
      stroke="currentColor"
      strokeWidth={1.5}
      opacity={0.2}
    />

    {/* Front canvas */}
    <rect
      x="3"
      y="5"
      width="18"
      height="22"
      rx="2.5"
      fill="currentColor"
      opacity={0.08}
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
    <circle cx="8" cy="11" r="2.5" fill="currentColor" opacity={0.25} />

    {/* Mountain silhouette (filled) */}
    <path
      d="M3 25l5-7 3.5 2.5 5.5-8 4 6v6.5H3z"
      fill="currentColor"
      opacity={0.15}
    />

    {/* Paintbrush - bold diagonal stroke */}
    <path
      d="M19 24L29.5 6"
      stroke="currentColor"
      strokeWidth={3.5}
      strokeLinecap="round"
      opacity={0.6}
    />

    {/* Brush tip with paint blob */}
    <circle cx="18" cy="25.5" r="3" fill="currentColor" opacity={0.75} />

    {/* Paint splatter */}
    <circle cx="15.5" cy="29.5" r="1.5" fill="currentColor" opacity={0.3} />
    <circle cx="28" cy="18" r="2" fill="currentColor" opacity={0.2} />
  </svg>
);

// Video Editor - Clapperboard with play button
export const LandingVideoIcon: React.FC<IconProps> = ({
  className = "w-7 h-7",
}) => (
  <svg className={className} viewBox="0 0 32 32" fill="none">
    {/* Clapper hinge (top part) */}
    <path
      d="M4 3h24l2 7H2L4 3z"
      fill="currentColor"
      opacity={0.4}
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinejoin="round"
    />

    {/* Clapper diagonal stripes */}
    <line
      x1="9"
      y1="3"
      x2="11.5"
      y2="10"
      stroke="currentColor"
      strokeWidth={2}
      opacity={0.2}
    />
    <line
      x1="16"
      y1="3"
      x2="18.5"
      y2="10"
      stroke="currentColor"
      strokeWidth={2}
      opacity={0.2}
    />
    <line
      x1="23"
      y1="3"
      x2="25.5"
      y2="10"
      stroke="currentColor"
      strokeWidth={2}
      opacity={0.2}
    />

    {/* Board body */}
    <rect
      x="2"
      y="10"
      width="28"
      height="19"
      rx="2.5"
      fill="currentColor"
      opacity={0.08}
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

    {/* Play triangle */}
    <path d="M12 15v9l8-4.5L12 15z" fill="currentColor" opacity={0.5} />
  </svg>
);

// Sprite Editor - Fanned animation frames with motion trail
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

    {/* Middle frame (rotated counter-clockwise) */}
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
      opacity={0.1}
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

    {/* Sprite pixel element on front frame */}
    <rect
      x="8"
      y="9"
      width="7"
      height="7"
      rx="1"
      fill="currentColor"
      opacity={0.12}
    />
    <rect
      x="9.5"
      y="10.5"
      width="4"
      height="4"
      fill="currentColor"
      opacity={0.4}
    />

    {/* Motion trail dots (cascading opacity) */}
    <circle cx="23" cy="10" r="1.8" fill="currentColor" opacity={0.15} />
    <circle cx="26" cy="14" r="2.2" fill="currentColor" opacity={0.3} />
    <circle cx="28" cy="19" r="2.8" fill="currentColor" opacity={0.5} />

    {/* Play indicator */}
    <path d="M24 26l5 3-5 3v-6z" fill="currentColor" opacity={0.3} />
  </svg>
);
