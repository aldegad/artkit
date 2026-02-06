import React from "react";
import { IconProps } from "./types";

// 16x16 viewBox, fill-based icons for video domain
export const PlayIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M4 2L14 8L4 14V2Z" />
  </svg>
);

export const PauseIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="2" width="4" height="12" />
    <rect x="9" y="2" width="4" height="12" />
  </svg>
);

export const StopIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="3" width="10" height="10" />
  </svg>
);

export const StepBackwardIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="3" width="2" height="10" />
    <path d="M14 3L6 8L14 13V3Z" />
  </svg>
);

export const StepForwardIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 3L10 8L2 13V3Z" />
    <rect x="12" y="3" width="2" height="10" />
  </svg>
);

// 24x24 viewBox versions for sound domain
export const PlayIcon24: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <polygon points="5,3 19,12 5,21" />
  </svg>
);

export const PauseIcon24: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="4" width="4" height="16" />
    <rect x="14" y="4" width="4" height="16" />
  </svg>
);

export const StopIcon24: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <rect x="6" y="6" width="12" height="12" />
  </svg>
);

export const VolumeOnIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
  </svg>
);

export const VolumeMutedIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6m0-6l6 6" />
  </svg>
);
