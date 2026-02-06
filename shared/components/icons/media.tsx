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
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 6h3l3-3v10l-3-3H2V6zm8.5 2a3.5 3.5 0 00-1.2-2.6l.9-.9A4.8 4.8 0 0111.8 8a4.8 4.8 0 01-1.6 3.5l-.9-.9A3.5 3.5 0 0010.5 8zm2.1 0c0-1.8-.7-3.4-1.9-4.6l.9-.9A7.1 7.1 0 0114.3 8a7.1 7.1 0 01-2.7 5.5l-.9-.9A5.8 5.8 0 0012.6 8z" />
  </svg>
);

export const VolumeMutedIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 6h3l3-3v10l-3-3H2V6zm9.5-1L14 11.5l-1 1L10.5 6l1-1zm-1 6L13 8.5l1 1-2.5 2.5-1-1z" />
  </svg>
);
