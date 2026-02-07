import React from "react";
import { IconProps } from "./types";


export const SidebarConverterIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* 상단 화살표: 왼쪽에서 오른쪽 */}
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h12m0 0l-3-3m3 3l-3 3" />
    {/* 하단 화살표: 오른쪽에서 왼쪽 */}
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 16H8m0 0l3-3m-3 3l3 3" />
  </svg>
);

export const SidebarSoundIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* 오디오 파형 */}
    <line x1="4" y1="10" x2="4" y2="14" strokeWidth={2} strokeLinecap="round" />
    <line x1="7.5" y1="7" x2="7.5" y2="17" strokeWidth={2} strokeLinecap="round" />
    <line x1="11" y1="4" x2="11" y2="20" strokeWidth={2} strokeLinecap="round" />
    <line x1="14.5" y1="8" x2="14.5" y2="16" strokeWidth={2} strokeLinecap="round" />
    <line x1="18" y1="5" x2="18" y2="19" strokeWidth={2} strokeLinecap="round" />
    <line x1="21" y1="9" x2="21" y2="15" strokeWidth={2} strokeLinecap="round" />
  </svg>
);


export const SidebarIconsIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* 원 */}
    <circle cx="7" cy="7" r="3" strokeWidth={2} />
    {/* 삼각형 */}
    <path strokeLinejoin="round" strokeWidth={2} d="M17 4l3 6h-6l3-6z" />
    {/* 사각형 */}
    <rect x="4" y="14" width="6" height="6" rx="1" strokeWidth={2} />
    {/* 다이아몬드 */}
    <path strokeLinejoin="round" strokeWidth={2} d="M17 14l3 3-3 3-3-3 3-3z" />
  </svg>
);

export const ArtkitIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" viewBox="-1 0 36 32">
    <path d="M13 5L6.5 22C5 25 3 27.5 1 28C-0.5 28.3 -0.5 27 0.5 25"
      stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M13 5L17 26" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
      strokeLinejoin="round" opacity="0.6" />
    <path d="M8 18H15" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M20 26V5" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" />
    <path d="M20 15L30 5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M27.5 5 C29 3, 32 3, 33 5 C34 7, 32 8.5, 29.5 8 C27 7.5, 26 7, 27.5 5 Z"
      fill="currentColor" />
    <path d="M23 12L28 26" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
      strokeLinejoin="round" opacity="0.6" />
  </svg>
);
