import React from "react";
import { IconProps } from "./types";

export const TrimToolIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 4H5v16h4M15 4h4v16h-4" />
  </svg>
);

export const RazorToolIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <circle cx="6" cy="6" r="3" strokeWidth={2} />
    <circle cx="6" cy="18" r="3" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.46 8.46L20 20M8.46 15.54L20 4" />
  </svg>
);

export const MaskToolIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
    <circle cx="12" cy="12" r="6" strokeWidth={2} strokeDasharray="4 2" />
  </svg>
);

export const VideoCropToolIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 14v6h6M20 10V4h-6M4 20l7-7M20 4l-7 7" />
  </svg>
);
