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
