"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/shared/contexts";
import { SettingsMenu } from "@/shared/components";
import ArtkitLogo from "@/shared/components/app/icons/ArtkitLogo";
import { LandingImageIcon, LandingVideoIcon, LandingSpriteIcon, SidebarConverterIcon, SidebarSoundIcon, SidebarIconsIcon } from "@/shared/components/icons";

interface Tool {
  id: string;
  nameKey: "spriteEditor" | "imageEditor" | "imageConverter" | "soundEditor" | "videoEditor" | "iconShowcase";
  path: string;
  icon: React.ReactNode;
}

const tools: Tool[] = [
  {
    id: "image",
    nameKey: "imageEditor",
    path: "/image",
    icon: <LandingImageIcon className="w-6 h-6" />,
  },
  {
    id: "video",
    nameKey: "videoEditor",
    path: "/video",
    icon: <LandingVideoIcon className="w-6 h-6" />,
  },
  {
    id: "sprite",
    nameKey: "spriteEditor",
    path: "/sprite",
    icon: <LandingSpriteIcon className="w-6 h-6" />,
  },
  {
    id: "sound",
    nameKey: "soundEditor",
    path: "/sound",
    icon: <SidebarSoundIcon />,
  },
  {
    id: "converter",
    nameKey: "imageConverter",
    path: "/converter",
    icon: <SidebarConverterIcon />,
  },
  {
    id: "icons",
    nameKey: "iconShowcase",
    path: "/icons",
    icon: <SidebarIconsIcon />,
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

      <SettingsMenu variant="sidebar" />
    </div>
  );
}
