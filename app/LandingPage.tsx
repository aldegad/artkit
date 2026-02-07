"use client";

import { useRef } from "react";
import Link from "next/link";
import { useLanguage, useTheme } from "../shared/contexts";
import ArtkitLogo from "../components/icons/ArtkitLogo";
import {
  SidebarEditorIcon,
  SidebarVideoIcon,
  SidebarSpriteIcon,
  SidebarSoundIcon,
  SidebarConverterIcon,
  SidebarIconsIcon,
  SunIcon,
  MoonIcon,
} from "../shared/components/icons";

const tools = [
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
  const { t, language, setLanguage } = useLanguage();
  const { resolvedTheme, setTheme } = useTheme();
  const toolsRef = useRef<HTMLDivElement>(null);

  const scrollToTools = () => {
    toolsRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="fixed inset-0 z-30 min-h-screen bg-background text-foreground overflow-auto">
      {/* ── Nav ── */}
      <nav className="fixed top-0 left-0 right-0 z-50 landing-nav bg-background/80 border-b border-border-subtle">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <ArtkitLogo size={26} className="text-accent-primary" />
            <span className="text-lg font-bold text-text-primary">Artkit</span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setLanguage(language === "ko" ? "en" : "ko")}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-interactive-hover transition-colors"
            >
              {language === "ko" ? "EN" : "KO"}
            </button>
            <button
              onClick={() =>
                setTheme(resolvedTheme === "dark" ? "light" : "dark")
              }
              className="w-9 h-9 rounded-lg flex items-center justify-center text-text-secondary hover:text-text-primary hover:bg-interactive-hover transition-colors"
              aria-label="Toggle theme"
            >
              {resolvedTheme === "dark" ? (
                <SunIcon className="w-4 h-4" />
              ) : (
                <MoonIcon className="w-4 h-4" />
              )}
            </button>
            <button
              onClick={scrollToTools}
              className="ml-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-accent-primary text-white hover:bg-accent-primary-hover transition-all duration-200 hover:-translate-y-0.5"
            >
              {t.landingCTA}
            </button>
          </div>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section className="relative min-h-screen flex flex-col items-center justify-center px-6 pt-14 landing-hero-bg">
        {/* Glow */}
        <div className="absolute w-72 h-72 rounded-full bg-accent-primary/10 blur-3xl animate-landing-glow pointer-events-none" />

        {/* Logo */}
        <div className="relative animate-landing-logo">
          <ArtkitLogo size={72} className="text-accent-primary" />
        </div>

        {/* Title */}
        <h1
          className="mt-6 text-5xl md:text-6xl font-extrabold landing-gradient-text animate-landing-slide-up"
          style={{ animationDelay: "0.2s" }}
        >
          Artkit
        </h1>

        {/* Tagline */}
        <p
          className="mt-5 text-lg md:text-xl text-text-secondary text-center max-w-xl animate-landing-slide-up"
          style={{ animationDelay: "0.4s" }}
        >
          {t.landingHeroTitle}
        </p>

        {/* Sub-tagline */}
        <p
          className="mt-2 text-sm md:text-base text-text-tertiary text-center max-w-lg animate-landing-slide-up"
          style={{ animationDelay: "0.5s" }}
        >
          {t.landingHeroSubtitle}
        </p>

        {/* CTA */}
        <button
          onClick={scrollToTools}
          className="mt-10 px-8 py-3.5 rounded-xl text-base font-semibold bg-accent-primary text-white shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-landing-slide-up"
          style={{ animationDelay: "0.7s" }}
        >
          {t.landingCTA}
        </button>

        {/* Scroll indicator */}
        <div className="absolute bottom-10 text-text-tertiary animate-bounce">
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
      <section ref={toolsRef} className="py-24 px-6">
        <div className="max-w-5xl mx-auto">
          {/* Section heading */}
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-text-primary">
              {t.landingToolsSection}
            </h2>
            <p className="mt-3 text-base text-text-secondary max-w-md mx-auto">
              {t.landingToolsSubtitle}
            </p>
          </div>

          {/* Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {tools.map((tool, i) => (
              <Link
                key={tool.id}
                href={tool.path}
                className="group animate-landing-card"
                style={{ animationDelay: `${0.1 * i}s` }}
              >
                <div className="h-full p-6 rounded-2xl bg-surface-primary border border-border-default hover:border-accent-primary/40 hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
                  {/* Icon */}
                  <div className="w-14 h-14 rounded-2xl bg-accent-primary/10 flex items-center justify-center mb-4 group-hover:bg-accent-primary group-hover:shadow-md transition-all duration-300">
                    <tool.Icon className="w-7 h-7 text-accent-primary group-hover:text-white transition-colors duration-300" />
                  </div>

                  {/* Name */}
                  <h3 className="text-base font-semibold text-text-primary mb-1.5">
                    {t[tool.nameKey]}
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-text-tertiary leading-relaxed">
                    {t[tool.descKey]}
                  </p>

                  {/* Arrow */}
                  <div className="mt-4 text-accent-primary text-sm font-medium opacity-0 group-hover:opacity-100 translate-x-0 group-hover:translate-x-1 transition-all duration-300">
                    {t.landingOpenTool}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="py-10 px-6 border-t border-border-default">
        <div className="max-w-5xl mx-auto text-center">
          <div className="flex items-center justify-center gap-3 text-xs text-text-tertiary">
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
      </footer>
    </div>
  );
}
