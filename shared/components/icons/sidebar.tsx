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
    {/* 클래퍼보드 */}
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
    {/* 클래퍼 구분선 */}
    <line x1="3" y1="10" x2="21" y2="10" strokeWidth={2} />
    {/* 줄무늬 2개 (굵게, 20px에서도 선명) */}
    <line x1="9" y1="3" x2="7" y2="10" strokeWidth={2} />
    <line x1="16" y1="3" x2="14" y2="10" strokeWidth={2} />
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
    {/* 팔레트 외형 */}
    <path strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c1 0 1.7-.8 1.7-1.7 0-.4-.2-.8-.4-1.1-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H17c2.8 0 5-2.2 5-5 0-5.5-4.5-9.3-10-9.3z" />
    {/* 물감 방울들 */}
    <circle cx="7.5" cy="11.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="8" cy="7.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="5.5" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="16" cy="8" r="1.3" fill="currentColor" stroke="none" />
  </svg>
);
