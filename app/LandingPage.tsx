"use client";

import Link from "next/link";
import { useLanguage } from "../shared/contexts";
import { HeaderSlot } from "../shared/contexts/HeaderSlotContext";
import ArtkitLogo from "../components/icons/ArtkitLogo";
import {
  SidebarEditorIcon,
  SidebarVideoIcon,
  SidebarSpriteIcon,
  SidebarSoundIcon,
  SidebarConverterIcon,
  SidebarIconsIcon,
} from "../shared/components/icons";

const apps = [
  {
    id: "editor",
    path: "/editor",
    nameKey: "imageEditor" as const,
    descKey: "landingEditorDesc" as const,
    Icon: SidebarEditorIcon,
  },
  {
    id: "video",
    path: "/video",
    nameKey: "videoEditor" as const,
    descKey: "landingVideoDesc" as const,
    Icon: SidebarVideoIcon,
  },
  {
    id: "sprite",
    path: "/sprite",
    nameKey: "spriteEditor" as const,
    descKey: "landingSpriteDesc" as const,
    Icon: SidebarSpriteIcon,
  },
  {
    id: "sound",
    path: "/sound",
    nameKey: "soundEditor" as const,
    descKey: "landingSoundDesc" as const,
    Icon: SidebarSoundIcon,
  },
  {
    id: "converter",
    path: "/converter",
    nameKey: "imageConverter" as const,
    descKey: "landingConverterDesc" as const,
    Icon: SidebarConverterIcon,
  },
  {
    id: "icons",
    path: "/icons",
    nameKey: "iconShowcase" as const,
    descKey: "landingIconsDesc" as const,
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

      <div className="max-w-lg mx-auto px-6 py-16">
        {/* Hero */}
        <div className="text-center mb-12">
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

        {/* App Grid */}
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
      </div>
    </div>
  );
}
