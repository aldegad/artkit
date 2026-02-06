import React from "react";
import { IconProps } from "./types";

// 16x16 viewBox, fill-based icons for video timeline
export const AddVideoTrackIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 3h8v10H2V3zm10 2l4-2v10l-4-2V5z" />
    <path d="M8 1h1v3h3v1H9v3H8V5H5V4h3V1z" />
  </svg>
);

export const AddAudioTrackIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 6h3l3-3v10l-3-3H2V6zm8.5 2a3.5 3.5 0 00-1.2-2.6l.9-.9A4.8 4.8 0 0111.8 8a4.8 4.8 0 01-1.6 3.5l-.9-.9A3.5 3.5 0 0010.5 8z" />
    <path d="M11 1h1v2h2v1h-2v2h-1V4H9V3h2V1z" />
  </svg>
);

export const SnapIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <rect x="3.5" y="2" width="1" height="12" />
    <rect x="11.5" y="2" width="1" height="12" />
    <rect x="2" y="7.5" width="12" height="1" />
  </svg>
);

export const TimelineZoomInIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <rect x="7.5" y="3" width="1" height="10" />
    <rect x="3" y="7.5" width="10" height="1" />
  </svg>
);

export const TimelineZoomOutIcon: React.FC<IconProps> = ({ className = "w-4 h-4" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <rect x="3" y="7.5" width="10" height="1" />
  </svg>
);

export const VideoClipIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 3h8v10H2V3zm10 2l4-2v10l-4-2V5z" />
  </svg>
);

export const AudioClipIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 6h3l3-3v10l-3-3H2V6zm8.5 2a3.5 3.5 0 00-1.2-2.6l.9-.9A4.8 4.8 0 0111.8 8a4.8 4.8 0 01-1.6 3.5l-.9-.9A3.5 3.5 0 0010.5 8zm2.1 0c0-1.8-.7-3.4-1.9-4.6l.9-.9A7.1 7.1 0 0114.3 8a7.1 7.1 0 01-2.7 5.5l-.9-.9A5.8 5.8 0 0012.6 8z" />
  </svg>
);

export const ImageClipIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <rect x="2" y="2" width="12" height="12" rx="1" />
  </svg>
);

export const TrackVisibleIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M8 3C4.5 3 1.5 6 0 8c1.5 2 4.5 5 8 5s6.5-3 8-5c-1.5-2-4.5-5-8-5zm0 8a3 3 0 110-6 3 3 0 010 6z" />
  </svg>
);

export const TrackHiddenIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 2l12 12M8 4c2 0 4 1 5.5 2.5L12 8c-.5-1-1.5-2-4-2-1 0-2 .3-2.5.8L4 5.3C5 4.5 6.5 4 8 4zM3.5 6.5L5 8c.5 1 1.5 2 3 2 .5 0 1-.1 1.5-.3l1.5 1.5c-1 .5-2 .8-3 .8-3.5 0-6.5-3-8-5 .5-.7 1.2-1.5 2-2.2l1.5 1.7z" />
  </svg>
);

export const TrackMutedIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 6h3l3-3v10l-3-3H2V6zm9.5-1L14 11.5l-1 1L10.5 6l1-1zm-1 6L13 8.5l1 1-2.5 2.5-1-1z" />
  </svg>
);

export const TrackUnmutedIcon: React.FC<IconProps> = ({ className = "w-3 h-3" }) => (
  <svg className={className} viewBox="0 0 16 16" fill="currentColor">
    <path d="M2 6h3l3-3v10l-3-3H2V6zm8.5 2a3.5 3.5 0 00-1.2-2.6l.9-.9A4.8 4.8 0 0111.8 8a4.8 4.8 0 01-1.6 3.5l-.9-.9A3.5 3.5 0 0010.5 8zm2.1 0c0-1.8-.7-3.4-1.9-4.6l.9-.9A7.1 7.1 0 0114.3 8a7.1 7.1 0 01-2.7 5.5l-.9-.9A5.8 5.8 0 0012.6 8z" />
  </svg>
);
