"use client";

import { useRef } from "react";
import Link from "next/link";
import { useLanguage, useTheme } from "../shared/contexts";
import ArtkitLogo from "../components/icons/ArtkitLogo";
import ArtkitWordmark from "../components/icons/ArtkitWordmark";
import {
  SidebarSoundIcon,
  SidebarConverterIcon,
  SidebarIconsIcon,
  LandingImageIcon,
  LandingVideoIcon,
  LandingSpriteIcon,
  SunIcon,
  MoonIcon,
} from "../shared/components/icons";

const tools = [
  {
    id: "image",
    path: "/image",
    nameKey: "imageEditor" as const,
    descKey: "landingEditorDesc" as const,
    Icon: LandingImageIcon,
    accent: "#3B82F6",
    accentBg: "rgba(59, 130, 246, 0.06)",
  },
  {
    id: "video",
    path: "/video",
    nameKey: "videoEditor" as const,
    descKey: "landingVideoDesc" as const,
    Icon: LandingVideoIcon,
    accent: "#8B5CF6",
    accentBg: "rgba(139, 92, 246, 0.06)",
  },
  {
    id: "sprite",
    path: "/sprite",
    nameKey: "spriteEditor" as const,
    descKey: "landingSpriteDesc" as const,
    Icon: LandingSpriteIcon,
    accent: "#10B981",
    accentBg: "rgba(16, 185, 129, 0.06)",
  },
  {
    id: "sound",
    path: "/sound",
    nameKey: "soundEditor" as const,
    descKey: "landingSoundDesc" as const,
    Icon: SidebarSoundIcon,
    accent: "#EC4899",
    accentBg: "rgba(236, 72, 153, 0.06)",
  },
  {
    id: "converter",
    path: "/converter",
    nameKey: "imageConverter" as const,
    descKey: "landingConverterDesc" as const,
    Icon: SidebarConverterIcon,
    accent: "#06B6D4",
    accentBg: "rgba(6, 182, 212, 0.06)",
  },
  {
    id: "icons",
    path: "/icons",
    nameKey: "iconShowcase" as const,
    descKey: "landingIconsDesc" as const,
    Icon: SidebarIconsIcon,
    accent: "#F59E0B",
    accentBg: "rgba(245, 158, 11, 0.06)",
  },
];

export default function LandingPage() {
  const { t, language, setLanguage } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const toolsRef = useRef<HTMLDivElement>(null);
  const isDark = resolvedTheme === "dark";

  const scrollToTools = () => {
    toolsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-background text-foreground overflow-auto">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 landing-nav bg-background/70 border-b border-border-subtle">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ArtkitLogo size={26} className="text-accent-primary" />
            <span className="text-lg font-bold text-text-primary tracking-tight">
              Artkit
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setLanguage(language === "ko" ? "en" : "ko")}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-interactive-hover transition-colors"
            >
              {language === "ko" ? "EN" : "KO"}
            </button>
            <button
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="w-9 h-9 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-interactive-hover transition-colors"
              aria-label="Toggle theme"
            >
              {isDark ? (
                <SunIcon className="w-4 h-4" />
              ) : (
                <MoonIcon className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={scrollToTools}
              className="ml-2 px-4 py-2 rounded-xl text-sm font-medium bg-accent-primary text-white hover:bg-accent-primary-hover transition-all duration-200 hover:-translate-y-0.5 shadow-sm"
            >
              {t.landingCTA}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-14 landing-mesh-bg">
        {/* Dot grid overlay */}
        <div className="absolute inset-0 landing-dot-grid opacity-30 dark:opacity-15 pointer-events-none" />

        {/* Badge */}
        <div
          className="relative z-10 mb-10 px-5 py-2.5 rounded-full border border-border-default bg-surface-primary/60 backdrop-blur-sm text-sm text-text-secondary font-medium animate-landing-slide-up"
          style={{ animationDelay: "0.1s" }}
        >
          {t.landingBadge}
        </div>

        {/* Title — SVG wordmark */}
        <div
          className="relative z-10 animate-landing-slide-up"
          style={{ animationDelay: "0.25s" }}
        >
          <ArtkitWordmark
            className="h-20 sm:h-28 md:h-36 lg:h-44 w-auto"
            gradient
          />
        </div>

        {/* Tagline */}
        <p
          className="relative z-10 mt-6 text-xl md:text-2xl text-text-secondary text-center max-w-2xl leading-relaxed animate-landing-slide-up"
          style={{ animationDelay: "0.4s" }}
        >
          {t.landingHeroTitle}
        </p>

        {/* Sub-tagline */}
        <p
          className="relative z-10 mt-3 text-sm md:text-base text-text-tertiary text-center max-w-lg leading-relaxed animate-landing-slide-up"
          style={{ animationDelay: "0.5s" }}
        >
          {t.landingHeroSubtitle}
        </p>

        {/* CTA */}
        <div
          className="relative z-10 mt-10 animate-landing-slide-up"
          style={{ animationDelay: "0.65s" }}
        >
          <button
            onClick={scrollToTools}
            className="group px-8 py-3.5 rounded-2xl text-base font-semibold bg-accent-primary text-white shadow-lg shadow-accent-primary/25 hover:shadow-xl hover:shadow-accent-primary/30 hover:-translate-y-1 transition-all duration-300"
          >
            {t.landingCTA}
            <span className="inline-block ml-2 transition-transform duration-300 group-hover:translate-x-1">
              →
            </span>
          </button>
        </div>

        {/* Feature pills */}
        <div
          className="relative z-10 mt-16 flex flex-wrap justify-center gap-8 text-sm text-text-tertiary animate-landing-slide-up"
          style={{ animationDelay: "0.8s" }}
        >
          {[
            t.landingFeatureNoInstall,
            t.landingFeatureFree,
            t.landingFeaturePrivate,
          ].map((feat, i) => (
            <div key={i} className="flex items-center gap-2.5">
              <div className="w-1.5 h-1.5 rounded-full bg-accent-primary/60" />
              <span>{feat}</span>
            </div>
          ))}
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 text-text-tertiary/50 animate-bounce">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M12 5v14M5 12l7 7 7-7" />
          </svg>
        </div>
      </section>

      {/* ── Tools ── */}
      <section ref={toolsRef} className="py-28 md:py-36 px-6">
        <div className="max-w-6xl mx-auto">
          {/* Section heading */}
          <div className="text-center mb-16 md:mb-20">
            <p className="text-sm font-semibold text-accent-primary tracking-widest uppercase mb-4">
              Tools
            </p>
            <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold text-text-primary tracking-tight">
              {t.landingToolsSection}
            </h2>
            <p className="mt-4 text-base md:text-lg text-text-secondary max-w-lg mx-auto leading-relaxed">
              {t.landingToolsSubtitle}
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 md:gap-6">
            {tools.map((tool, i) => (
              <Link
                key={tool.id}
                href={tool.path}
                className="group landing-tool-card animate-landing-card"
                style={{ animationDelay: `${0.08 * i}s` }}
              >
                <div className="relative p-7 md:p-8">
                  {/* Hover glow */}
                  <div
                    className="absolute -top-16 -right-16 w-48 h-48 rounded-full blur-3xl opacity-0 group-hover:opacity-20 transition-opacity duration-500 pointer-events-none"
                    style={{ background: tool.accent }}
                  />

                  {/* Icon */}
                  <div
                    className="relative w-14 h-14 rounded-2xl flex items-center justify-center mb-5 transition-all duration-300 group-hover:scale-110 group-hover:shadow-lg"
                    style={{
                      backgroundColor: tool.accentBg,
                      color: tool.accent,
                    }}
                  >
                    <tool.Icon className="w-[34px] h-[34px]" />
                  </div>

                  {/* Name */}
                  <h3 className="relative text-lg font-semibold text-text-primary mb-2">
                    {t[tool.nameKey]}
                  </h3>

                  {/* Description */}
                  <p className="relative text-sm text-text-tertiary leading-relaxed">
                    {t[tool.descKey]}
                  </p>

                  {/* Arrow */}
                  <div
                    className="relative mt-5 flex items-center gap-1 text-sm font-medium opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300"
                    style={{ color: tool.accent }}
                  >
                    <span>{t.landingOpenTool}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 border-t border-border-subtle">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <ArtkitLogo size={18} className="text-accent-primary" />
              <span className="text-sm font-semibold text-text-secondary">
                Artkit
              </span>
            </div>
            <div className="flex items-center gap-4 text-xs text-text-tertiary">
              <span>© 2026 Soo Hong Kim</span>
              <span className="text-border-default">·</span>
              <a
                href="https://github.com/aldegad"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-text-secondary transition-colors"
              >
                GitHub
              </a>
              <span className="text-border-default">·</span>
              <a
                href="mailto:aldegad@gmail.com"
                className="hover:text-text-secondary transition-colors"
              >
                aldegad@gmail.com
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
