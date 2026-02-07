"use client";

interface ArtkitWordmarkProps {
  className?: string;
  gradient?: boolean;
}

export default function ArtkitWordmark({
  className = "w-80",
  gradient = false,
}: ArtkitWordmarkProps) {
  const gradId = "awm-grad";
  const s = gradient ? `url(#${gradId})` : "currentColor";
  const f = gradient ? `url(#${gradId})` : "currentColor";

  return (
    <svg
      className={className}
      viewBox="-2 0 108 34"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {gradient && (
        <defs>
          <linearGradient
            id={gradId}
            x1="0"
            y1="17"
            x2="106"
            y2="17"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#FF8C00">
              <animate
                attributeName="stop-color"
                values="#FF8C00;#FFB347;#FF6B35;#FF8C00"
                dur="6s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="50%" stopColor="#FFB347">
              <animate
                attributeName="stop-color"
                values="#FFB347;#FF6B35;#FF8C00;#FFB347"
                dur="6s"
                repeatCount="indefinite"
              />
            </stop>
            <stop offset="100%" stopColor="#FF6B35">
              <animate
                attributeName="stop-color"
                values="#FF6B35;#FF8C00;#FFB347;#FF6B35"
                dur="6s"
                repeatCount="indefinite"
              />
            </stop>
          </linearGradient>
        </defs>
      )}

      {/* A - left stroke with brush tail */}
      <path
        d="M14 5L7 23C5.5 26 3.5 28.5 1.5 29C0 29.3 0 28 1 26"
        stroke={s}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* A - right stroke */}
      <path
        d="M14 5L18 28"
        stroke={s}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />
      {/* A - crossbar */}
      <path d="M9 19H16" stroke={s} strokeWidth="2.5" strokeLinecap="round" />

      {/* r - vertical */}
      <path d="M28 28V14" stroke={s} strokeWidth="3" strokeLinecap="round" />
      {/* r - top curve */}
      <path
        d="M28 17C28 12 32 11 36 12.5"
        stroke={s}
        strokeWidth="2.5"
        strokeLinecap="round"
      />

      {/* t - vertical */}
      <path d="M49 8V28" stroke={s} strokeWidth="3" strokeLinecap="round" />
      {/* t - crossbar */}
      <path d="M43 15H55" stroke={s} strokeWidth="2.5" strokeLinecap="round" />

      {/* k - vertical */}
      <path d="M64 28V5" stroke={s} strokeWidth="3.5" strokeLinecap="round" />
      {/* k - upper diagonal */}
      <path
        d="M64 17L74 7"
        stroke={s}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* k - leaf */}
      <path
        d="M71.5 7C73 5 76 5 77 7C78 9 76 10.5 73.5 10C71 9.5 70 9 71.5 7Z"
        fill={f}
      />
      {/* k - lower diagonal */}
      <path
        d="M67 14L72 28"
        stroke={s}
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.6"
      />

      {/* i - vertical */}
      <path d="M84 28V14" stroke={s} strokeWidth="3" strokeLinecap="round" />
      {/* i - dot */}
      <circle cx="84" cy="8" r="2.2" fill={f} />

      {/* t - vertical */}
      <path d="M96 8V28" stroke={s} strokeWidth="3" strokeLinecap="round" />
      {/* t - crossbar */}
      <path
        d="M90 15H102"
        stroke={s}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
