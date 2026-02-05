"use client";

interface ArtkitLogoProps {
  size?: number;
  className?: string;
}

export default function ArtkitLogo({ size = 24, className = "" }: ArtkitLogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 0 36 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* A - left stroke as brush (with brush tip curve at bottom) */}
      <path
        d="M13 5L6.5 22C5 25 3 27.5 1 28C-0.5 28.3 -0.5 27 0.5 25"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* A - right stroke */}
      <path
        d="M13 5L17 26"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      {/* A crossbar */}
      <path
        d="M8 18H15"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* K - vertical stroke (bold) */}
      <path
        d="M20 26V5"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinecap="round"
      />
      {/* K - upper diagonal (note stem) */}
      <path
        d="M20 15L30 5"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* Music note head (tilted ellipse shape) */}
      <path
        d="M27.5 5 C29 3, 32 3, 33 5 C34 7, 32 8.5, 29.5 8 C27 7.5, 26 7, 27.5 5 Z"
        fill="currentColor"
      />
      {/* K - lower diagonal */}
      <path
        d="M23 12L28 26"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
    </svg>
  );
}
