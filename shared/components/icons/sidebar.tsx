import React from "react";
import { IconProps } from "./types";

export const SidebarEditorIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* 뒤쪽 레이어 */}
    <rect x="6" y="3" width="15" height="15" rx="2" strokeWidth={2} opacity={0.4} />
    {/* 앞쪽 캔버스 */}
    <rect x="3" y="6" width="15" height="15" rx="2" strokeWidth={2} />
    {/* 브러시 스트로크 */}
    <path strokeLinecap="round" strokeWidth={2} d="M7 17l8-8" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 9l2-2" />
  </svg>
);

export const SidebarSpriteIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* 필름 프레임 */}
    <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={2} />
    {/* 프레임 구분선 */}
    <line x1="9" y1="5" x2="9" y2="19" strokeWidth={1.5} />
    <line x1="15" y1="5" x2="15" y2="19" strokeWidth={1.5} />
    {/* 애니메이션 동작 표현 (위치 변화하는 점) */}
    <circle cx="5.5" cy="14" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="12" cy="10" r="1.5" fill="currentColor" stroke="none" />
    <circle cx="18.5" cy="14" r="1.5" fill="currentColor" stroke="none" />
  </svg>
);

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

export const SidebarVideoIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* 클래퍼보드 */}
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
    {/* 클래퍼 영역 구분선 */}
    <line x1="3" y1="10" x2="21" y2="10" strokeWidth={2} />
    {/* 클래퍼 줄무늬 */}
    <line x1="8" y1="3" x2="6" y2="10" strokeWidth={1.5} />
    <line x1="13" y1="3" x2="11" y2="10" strokeWidth={1.5} />
    <line x1="18" y1="3" x2="16" y2="10" strokeWidth={1.5} />
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
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* A - 브러시 스트로크 왼쪽 다리 */}
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 3L4 17c-.5 1.5-1.5 2.5-2 2.5" />
    {/* A - 오른쪽 다리 */}
    <path strokeLinecap="round" strokeWidth={2} d="M8 3l3 17" />
    {/* A - 가로줄 */}
    <path strokeLinecap="round" strokeWidth={2} d="M5 14h5" />
    {/* K - 세로줄 */}
    <path strokeLinecap="round" strokeWidth={2} d="M14 20V3" />
    {/* K - 위쪽 대각선 */}
    <path strokeLinecap="round" strokeWidth={2} d="M14 11l6-6" />
    {/* 음표 머리 */}
    <ellipse cx="20.5" cy="4.5" rx="1.5" ry="1" fill="currentColor" stroke="none" transform="rotate(-20 20.5 4.5)" />
    {/* K - 아래쪽 대각선 */}
    <path strokeLinecap="round" strokeWidth={2} d="M15.5 9.5L19 20" />
  </svg>
);
