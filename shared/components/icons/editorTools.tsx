import React from "react";
import { IconProps } from "./types";

export const CursorIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 15l-2 5L9 9l11 4-5 2zm0 0l5 5M7.188 2.239l.777 2.897M5.136 7.965l-2.898-.777M13.95 4.05l-2.122 2.122m-5.657 5.656l-2.12 2.122" />
  </svg>
);

export const MarqueeIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" strokeWidth={2} strokeDasharray="4 2" rx="1" />
  </svg>
);

export const MoveIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m0-16l-3 3m3-3l3 3m-3 13l-3-3m3 3l3-3M4 12h16m-16 0l3-3m-3 3l3 3m13-3l-3-3m3 3l-3 3" />
  </svg>
);

export const TransformIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="4" y="4" width="16" height="16" strokeWidth={2} rx="1" />
    <circle cx="4" cy="4" r="2" fill="currentColor" />
    <circle cx="20" cy="4" r="2" fill="currentColor" />
    <circle cx="4" cy="20" r="2" fill="currentColor" />
    <circle cx="20" cy="20" r="2" fill="currentColor" />
  </svg>
);

export const BrushIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
  </svg>
);

export const EraserIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636l-1.414-1.414a2 2 0 00-2.828 0L3.636 14.707a2 2 0 000 2.829l2.828 2.828a2 2 0 002.829 0L19.778 9.879a2 2 0 000-2.829l-1.414-1.414zM9.172 20.485L3.515 14.83M15 9l-6 6" />
    <path strokeLinecap="round" strokeWidth={2} d="M3 21h18" />
  </svg>
);

export const FillBucketIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11V5a2 2 0 00-2-2H7a2 2 0 00-2 2v6M5 11l7 10 7-10H5z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 17c0 1.657-1.343 3-3 3s-3-1.343-3-3c0-2 3-5 3-5s3 3 3 5z" />
  </svg>
);

export const EyedropperIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 6a3 3 0 016 0v7l-3 4-3-4V6z" />
    <line x1="12" y1="17" x2="12" y2="21" strokeLinecap="round" strokeWidth={2} />
  </svg>
);

export const CloneStampIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v4M12 7c-3 0-6 1-6 4v1h12v-1c0-3-3-4-6-4zM4 14h16v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM8 18v3M16 18v3" />
  </svg>
);

export const CropIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="square" strokeLinejoin="miter" strokeWidth={2} d="M6 2v4H2M6 6h12v12M18 22v-4h4M18 18H6V6" />
  </svg>
);

export const HandIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 11.5V14m0-2.5v-6a1.5 1.5 0 113 0m-3 6a1.5 1.5 0 00-3 0v2a7.5 7.5 0 0015 0v-5a1.5 1.5 0 00-3 0m-6-3V11m0-5.5v-1a1.5 1.5 0 013 0v1m0 0V11m0-5.5a1.5 1.5 0 013 0v3m0 0V11" />
  </svg>
);

export const ZoomSearchIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
  </svg>
);

export const PanIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v18m0-18l-3 3m3-3l3 3m-3 15l-3-3m3 3l3-3M3 12h18m-18 0l3-3m-3 3l3 3m15-3l-3-3m3 3l-3 3" />
  </svg>
);

export const ReorderIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeWidth={2} d="M4 8h16M4 12h16M4 16h16" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3l3 3h-6l3-3zM12 21l3-3h-6l3 3z" />
  </svg>
);

export const OffsetIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" strokeWidth={1.5} strokeDasharray="3 2" rx="2" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v8m0-8l-2 2m2-2l2 2m-2 6l-2-2m2 2l2-2M8 12h8m-8 0l2-2m-2 2l2 2m6-2l-2-2m2 2l-2 2" />
  </svg>
);

export const FrameSkipToggleIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="4" width="8" height="16" rx="1.5" strokeWidth={2} />
    <rect x="14" y="4" width="8" height="16" rx="1.5" strokeWidth={2} />
    <line x1="14" y1="20" x2="22" y2="4" strokeWidth={2} strokeLinecap="round" />
  </svg>
);

export const NthFrameSkipIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="2" y="4" width="4" height="16" rx="1" strokeWidth={2} />
    <line x1="10" y1="4" x2="10" y2="20" strokeWidth={2} strokeDasharray="3 2" />
    <line x1="14" y1="4" x2="14" y2="20" strokeWidth={2} strokeDasharray="3 2" />
    <rect x="18" y="4" width="4" height="16" rx="1" strokeWidth={2} />
  </svg>
);
