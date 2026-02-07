"use client";

import Link from "next/link";
import { useLanguage } from "../../shared/contexts";
import { HeaderSlot } from "../../shared/contexts/HeaderSlotContext";
import ArtkitLogo from "../icons/ArtkitLogo";
import {
  SidebarEditorIcon,
  SidebarVideoIcon,
  SidebarSpriteIcon,
  SidebarSoundIcon,
  SidebarConverterIcon,
  SidebarIconsIcon,
} from "../../shared/components/icons";
import InteractiveDotGrid from "./InteractiveDotGrid";

interface AppInfo {
  id: string;
  nameKey: "imageEditor" | "videoEditor" | "spriteEditor" | "soundEditor" | "imageConverter" | "iconShowcase";
  descKey: "landingEditorDesc" | "landingVideoDesc" | "landingSpriteDesc" | "landingSoundDesc" | "landingConverterDesc" | "landingIconsDesc";
  path: string;
  Icon: React.ComponentType<{ className?: string }>;
}

const apps: AppInfo[] = [
  {
    id: "editor",
    nameKey: "imageEditor",
    descKey: "landingEditorDesc",
    path: "/editor",
    Icon: SidebarEditorIcon,
  },
  {
    id: "video",
    nameKey: "videoEditor",
    descKey: "landingVideoDesc",
    path: "/video",
    Icon: SidebarVideoIcon,
  },
  {
    id: "sprite",
    nameKey: "spriteEditor",
    descKey: "landingSpriteDesc",
    path: "/sprite",
    Icon: SidebarSpriteIcon,
  },
  {
    id: "sound",
    nameKey: "soundEditor",
    descKey: "landingSoundDesc",
    path: "/sound",
    Icon: SidebarSoundIcon,
  },
  {
    id: "converter",
    nameKey: "imageConverter",
    descKey: "landingConverterDesc",
    path: "/converter",
    Icon: SidebarConverterIcon,
  },
  {
    id: "icons",
    nameKey: "iconShowcase",
    descKey: "landingIconsDesc",
    path: "/icons",
    Icon: SidebarIconsIcon,
  },
];

export default function LandingPage() {
  const { t } = useLanguage();

  return (
    <div className="h-full overflow-auto">
      <HeaderSlot>
        <span className="font-semibold text-sm text-text-primary">Artkit</span>
      </HeaderSlot>

      {/* Hero Section */}
      <section className="relative flex items-center justify-center py-20">
        <div className="absolute inset-0 overflow-hidden">
          <InteractiveDotGrid />
        </div>
        <div className="relative z-10 text-center px-6">
          <ArtkitLogo
            size={56}
            className="text-accent-primary mx-auto mb-4"
          />
          <h1 className="text-2xl font-bold text-text-primary mb-2">Artkit</h1>
          <p className="text-base text-text-secondary">{t.landingTagline}</p>
          <p className="text-sm text-text-tertiary mt-1">
            {t.landingSubtagline}
          </p>
        </div>
      </section>

      {/* App Grid */}
      <section className="max-w-lg mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {apps.map((app) => (
            <Link key={app.id} href={app.path} className="group">
              <div className="p-5 rounded-2xl bg-surface-primary border border-border-default hover:shadow-lg hover:-translate-y-1 transition-all duration-200 text-center">
                <div className="w-14 h-14 mx-auto mb-3 rounded-2xl bg-accent-primary flex items-center justify-center shadow-sm group-hover:shadow-md transition-shadow duration-200">
                  <app.Icon className="w-7 h-7 text-white" />
                </div>
                <h2 className="font-semibold text-text-primary text-sm">
                  {t[app.nameKey]}
                </h2>
                <p className="text-xs text-text-tertiary mt-1 leading-relaxed">
                  {t[app.descKey]}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
