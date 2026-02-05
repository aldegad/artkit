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
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* A - left stroke as brush (with brush tip curve at bottom) */}
      <path
        d="M13 5L6.5 23Q5 27 2.5 28Q1 28.5 1 27"
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
        d="M20 15L27 6"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Music note head at K's upper diagonal end */}
      <ellipse
        cx="29.5"
        cy="4.5"
        rx="3"
        ry="2.2"
        fill="currentColor"
        transform="rotate(-35 29.5 4.5)"
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
