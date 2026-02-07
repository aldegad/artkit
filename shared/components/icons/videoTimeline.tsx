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

export const FilmStripIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor">
    <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={2} />
    <path strokeWidth={2} d="M6 4v16M18 4v16" />
    <path strokeLinecap="round" strokeWidth={1.5} d="M2 8h4M2 12h4M2 16h4M18 8h4M18 12h4M18 16h4" />
  </svg>
);
