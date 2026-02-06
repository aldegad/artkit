import React from "react";
import { IconProps } from "./types";

export const EyeOpenIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

export const EyeClosedIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

export const LockClosedIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

export const LockOpenIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
  </svg>
);

export const DuplicateIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

export const AlignLeftIcon: React.FC<IconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="4" y1="4" x2="4" y2="20" />
    <rect x="7" y="6" width="10" height="4" rx="1" />
    <rect x="7" y="14" width="6" height="4" rx="1" />
  </svg>
);

export const AlignCenterHIcon: React.FC<IconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="12" y1="4" x2="12" y2="20" strokeDasharray="2 2" />
    <rect x="5" y="6" width="14" height="4" rx="1" />
    <rect x="7" y="14" width="10" height="4" rx="1" />
  </svg>
);

export const AlignRightIcon: React.FC<IconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="20" y1="4" x2="20" y2="20" />
    <rect x="7" y="6" width="10" height="4" rx="1" />
    <rect x="11" y="14" width="6" height="4" rx="1" />
  </svg>
);

export const AlignTopIcon: React.FC<IconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="4" y1="4" x2="20" y2="4" />
    <rect x="6" y="7" width="4" height="10" rx="1" />
    <rect x="14" y="7" width="4" height="6" rx="1" />
  </svg>
);

export const AlignMiddleVIcon: React.FC<IconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="4" y1="12" x2="20" y2="12" strokeDasharray="2 2" />
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="7" width="4" height="10" rx="1" />
  </svg>
);

export const AlignBottomIcon: React.FC<IconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <line x1="4" y1="20" x2="20" y2="20" />
    <rect x="6" y="7" width="4" height="10" rx="1" />
    <rect x="14" y="11" width="4" height="6" rx="1" />
  </svg>
);

export const DistributeHIcon: React.FC<IconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="4" y="8" width="4" height="8" rx="1" />
    <rect x="10" y="8" width="4" height="8" rx="1" />
    <rect x="16" y="8" width="4" height="8" rx="1" />
  </svg>
);

export const DistributeVIcon: React.FC<IconProps> = ({ className = "w-3.5 h-3.5" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
    <rect x="8" y="4" width="8" height="4" rx="1" />
    <rect x="8" y="10" width="8" height="4" rx="1" />
    <rect x="8" y="16" width="8" height="4" rx="1" />
  </svg>
);
