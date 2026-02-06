import React from "react";
import { IconProps } from "./types";

export const SidebarEditorIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
    <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15l-5-5L5 21" />
  </svg>
);

export const SidebarSpriteIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={2} />
    <line x1="8" y1="4" x2="8" y2="20" strokeWidth={2} />
    <line x1="16" y1="4" x2="16" y2="20" strokeWidth={2} />
    <circle cx="5" cy="7" r="1" fill="currentColor" />
    <circle cx="5" cy="17" r="1" fill="currentColor" />
    <circle cx="12" cy="7" r="1" fill="currentColor" />
    <circle cx="12" cy="17" r="1" fill="currentColor" />
    <circle cx="19" cy="7" r="1" fill="currentColor" />
    <circle cx="19" cy="17" r="1" fill="currentColor" />
  </svg>
);

export const SidebarConverterIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
  </svg>
);

export const SidebarSoundIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" />
  </svg>
);

export const SidebarVideoIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="6" width="20" height="12" rx="2" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9l5 3-5 3V9z" />
  </svg>
);

export const SidebarIconsIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="7" height="7" rx="1.5" strokeWidth={2} />
    <rect x="14" y="3" width="7" height="7" rx="1.5" strokeWidth={2} />
    <rect x="3" y="14" width="7" height="7" rx="1.5" strokeWidth={2} />
    <rect x="14" y="14" width="7" height="7" rx="1.5" strokeWidth={2} />
  </svg>
);
