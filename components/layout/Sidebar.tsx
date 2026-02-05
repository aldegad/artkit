"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "../../shared/contexts";
import SettingsMenu from "../SettingsMenu";
import ArtkitLogo from "../icons/ArtkitLogo";

interface Tool {
  id: string;
  nameKey: "spriteEditor" | "imageEditor" | "imageConverter" | "soundEditor";
  path: string;
  icon: React.ReactNode;
}

const tools: Tool[] = [
  {
    id: "editor",
    nameKey: "imageEditor",
    path: "/editor",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Image editing icon - picture with edit pencil */}
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
        <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={2} />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 15l-5-5L5 21"
        />
      </svg>
    ),
  },
  {
    id: "sprite",
    nameKey: "spriteEditor",
    path: "/sprite",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Film strip / sprite frames icon */}
        <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={2} />
        <line x1="8" y1="4" x2="8" y2="20" strokeWidth={2} />
        <line x1="16" y1="4" x2="16" y2="20" strokeWidth={2} />
        <circle cx="5" cy="7" r="1" fill="currentColor" />
        <circle cx="5" cy="17" r="1" fill="currentColor" />
        <circle cx="12" cy="7" r="1" fill="currentColor" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
        <circle cx="19" cy="7" r="1" fill="currentColor" />
        <circle cx="19" cy="17" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "converter",
    nameKey: "imageConverter",
    path: "/converter",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  },
  {
    id: "sound",
    nameKey: "soundEditor",
    path: "/sound",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Sound wave / audio icon */}
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3"
        />
      </svg>
    ),
  },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export default function Sidebar({ onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { t } = useLanguage();
  const isMobile = !!onNavigate;

  return (
    <div className={`w-14 h-full bg-surface-primary flex flex-col items-center gap-2 pb-2 ${
      isMobile ? "pt-2" : "border-r border-border-default"
    }`}>
      {/* Logo area - Desktop only: link to home (colored icon, no box) */}
      {!isMobile && (
        <Link
          href="/"
          className="h-10 w-full flex items-center justify-center shrink-0 text-accent-primary hover:text-accent-primary/80 transition-colors"
          aria-label="Home"
        >
          <ArtkitLogo size={28} />
        </Link>
      )}

      {/* Tool buttons */}
      {tools.map((tool) => {
        const isActive = pathname.startsWith(tool.path);
        return (
          <Link
            key={tool.id}
            href={tool.path}
            onClick={onNavigate}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              isActive
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:bg-interactive-hover hover:text-text-primary"
            }`}
            title={t[tool.nameKey]}
          >
            {tool.icon}
          </Link>
        );
      })}

      <div className="flex-1" />

      <div className="w-8 h-px bg-border-default" />

      <SettingsMenu />
    </div>
  );
}
