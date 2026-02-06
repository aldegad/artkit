import React, { useId } from "react";
import { IconProps } from "./types";

// All icons: 24x24 viewBox, stroke-based to match other icons

export const AddVideoTrackIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <defs>
        <mask id={`${id}-v`}>
          <rect width="24" height="24" fill="white" />
          <circle cx="19" cy="5" r="5.5" fill="black" />
        </mask>
      </defs>
      <g mask={`url(#${id}-v)`}>
        <rect x="2" y="6" width="13" height="12" rx="2" strokeWidth={2} />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l5-3v10l-5-3" />
      </g>
      <path strokeLinecap="round" strokeWidth={2.5} d="M19 2v6M16 5h6" />
    </svg>
  );
};

export const AddAudioTrackIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => {
  const id = useId();
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
      <defs>
        <mask id={`${id}-a`}>
          <rect width="24" height="24" fill="white" />
          <circle cx="19" cy="5" r="5.5" fill="black" />
        </mask>
      </defs>
      <g mask={`url(#${id}-a)`}>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.54 8.46a5 5 0 010 7.07" />
      </g>
      <path strokeLinecap="round" strokeWidth={2.5} d="M19 2v6M16 5h6" />
    </svg>
  );
};

export const SnapIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17V9a5 5 0 0110 0v8" />
    <path strokeLinecap="round" strokeWidth={2} d="M5 13h4m6 0h4M5 17h4m6 0h4" />
  </svg>
);

export const SnapOffIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 17V9a5 5 0 0110 0v8" />
    <path strokeLinecap="round" strokeWidth={2} d="M5 13h2m10 0h2M5 17h2m10 0h2" />
    <path strokeLinecap="round" strokeWidth={2} d="M3 21L21 3" />
  </svg>
);

export const TimelineZoomInIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
  </svg>
);

export const TimelineZoomOutIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
  </svg>
);

export const VideoClipIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <rect x="2" y="6" width="13" height="12" rx="2" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l5-3v10l-5-3" />
  </svg>
);

export const AudioClipIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
  </svg>
);

export const ImageClipIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
    <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={2} />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 15l-5-5L5 21" />
  </svg>
);

export const TrackVisibleIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
  </svg>
);

export const TrackHiddenIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
  </svg>
);

export const TrackMutedIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6m0-6l6 6" />
  </svg>
);

export const TrackUnmutedIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5L6 9H2v6h4l5 4V5zM15.54 8.46a5 5 0 010 7.07M19.07 4.93a10 10 0 010 14.14" />
  </svg>
);
