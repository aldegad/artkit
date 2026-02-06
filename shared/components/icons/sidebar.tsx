import React from "react";
import { IconProps } from "./types";

export const SidebarEditorIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* 뒤쪽 레이어 (편집기=레이어 개념) */}
    <rect x="6" y="2" width="16" height="16" rx="2" strokeWidth={2} opacity={0.35} />
    {/* 앞쪽 캔버스 */}
    <rect x="2" y="6" width="16" height="16" rx="2" strokeWidth={2} />
    {/* 태양 (사진/이미지 직관적 인식) */}
    <circle cx="7" cy="11" r="1.5" fill="currentColor" stroke="none" />
    {/* 산 풍경 (이미지 편집기의 보편적 메타포) */}
    <path d="M2 20l5-5 3 2.5 5-6 3 4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

export const SidebarSpriteIcon: React.FC<IconProps> = ({ className = "w-5 h-5" }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    {/* 필름 프레임 */}
    <rect x="2" y="5" width="20" height="14" rx="2" strokeWidth={2} />
    {/* 프레임 구분선 */}
    <line x1="9" y1="5" x2="9" y2="19" strokeWidth={1.5} />
    <line x1="15" y1="5" x2="15" y2="19" strokeWidth={1.5} />
    {/* 모션 트레일 (투명도 변화로 움직임 표현) */}
    <circle cx="5.5" cy="12" r="1.5" fill="currentColor" stroke="none" opacity={0.25} />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" opacity={0.55} />
    <circle cx="18.5" cy="12" r="1.5" fill="currentColor" stroke="none" />
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
    {/* 캠코더 본체 */}
    <rect x="2" y="6" width="13" height="12" rx="2" strokeWidth={2} />
    {/* 렌즈 (삼각형) */}
    <path d="M15 10l5-3v10l-5-3" strokeLinejoin="round" strokeWidth={2} />
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
    {/* A - 왼쪽 다리 (붓 터치: 아래에서 곡선으로 휘어짐) */}
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5}
      d="M9 3L5 17c-.3 1-1 2-1.8 2.3" />
    {/* A - 오른쪽 다리 (반투명) */}
    <path strokeLinecap="round" strokeWidth={2} d="M9 3l2.5 17" opacity={0.5} />
    {/* A - 가로줄 */}
    <path strokeLinecap="round" strokeWidth={1.8} d="M6 14.5h5" />
    {/* K - 세로줄 (굵게) */}
    <path strokeLinecap="round" strokeWidth={2.5} d="M15 20V3" />
    {/* K - 위쪽 대각선 (음표 줄기) */}
    <path strokeLinecap="round" strokeWidth={1.8} d="M15 12l5.5-6" />
    {/* 음표 머리 (기울어진 타원 — ArtkitLogo 시그니처) */}
    <ellipse cx="21" cy="5.5" rx="2" ry="1.3" fill="currentColor" stroke="none"
      transform="rotate(-25 21 5.5)" />
    {/* K - 아래쪽 대각선 (반투명) */}
    <path strokeLinecap="round" strokeWidth={2} d="M16.5 10.5L20 20" opacity={0.5} />
  </svg>
);
