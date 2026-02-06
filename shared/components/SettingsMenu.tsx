"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme, useLanguage, useKeymap } from "../contexts";

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();
  const { keymap, setKeymap, resolvedKeymap } = useKeymap();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close menu on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };

    if (isOpen) {
      document.addEventListener("keydown", handleEscape);
    }
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-interactive-default hover:bg-interactive-hover transition-colors"
        title={t.settings}
      >
        <MenuIcon className="w-5 h-5 text-text-primary" />
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-48 bg-surface-primary border border-border-default rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Theme section */}
          <div className="p-3 border-b border-border-default">
            <div className="text-xs font-medium text-text-tertiary mb-2">{t.theme}</div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setTheme("light")}
                className={`w-full px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                  theme === "light"
                    ? "bg-accent-primary text-white"
                    : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary"
                }`}
              >
                <SunIcon className="w-3.5 h-3.5" />
                {t.light}
              </button>
              <button
                onClick={() => setTheme("dark")}
                className={`w-full px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                  theme === "dark"
                    ? "bg-accent-primary text-white"
                    : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary"
                }`}
              >
                <MoonIcon className="w-3.5 h-3.5" />
                {t.dark}
              </button>
              <button
                onClick={() => setTheme("system")}
                className={`w-full px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                  theme === "system"
                    ? "bg-accent-primary text-white"
                    : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary"
                }`}
              >
                <SystemIcon className="w-3.5 h-3.5" />
                {t.system}
                {theme === "system" && (
                  <span className="text-[10px] opacity-70">
                    ({resolvedTheme === "dark" ? t.dark : t.light})
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Keymap section */}
          <div className="p-3 border-b border-border-default">
            <div className="text-xs font-medium text-text-tertiary mb-2">{t.keymap}</div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setKeymap("auto")}
                className={`w-full px-3 py-1.5 rounded-lg text-xs transition-colors flex items-center gap-2 ${
                  keymap === "auto"
                    ? "bg-accent-primary text-white"
                    : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary"
                }`}
              >
                {t.auto}
                {keymap === "auto" && (
                  <span className="text-[10px] opacity-70">
                    ({resolvedKeymap === "mac" ? t.mac : t.windows})
                  </span>
                )}
              </button>
              <button
                onClick={() => setKeymap("mac")}
                className={`w-full px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                  keymap === "mac"
                    ? "bg-accent-primary text-white"
                    : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary"
                }`}
              >
                {t.mac}
              </button>
              <button
                onClick={() => setKeymap("windows")}
                className={`w-full px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                  keymap === "windows"
                    ? "bg-accent-primary text-white"
                    : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary"
                }`}
              >
                {t.windows}
              </button>
            </div>
          </div>

          {/* Language section */}
          <div className="p-3">
            <div className="text-xs font-medium text-text-tertiary mb-2">{t.language}</div>
            <div className="flex flex-col gap-1">
              <button
                onClick={() => setLanguage("ko")}
                className={`w-full px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                  language === "ko"
                    ? "bg-accent-primary text-white"
                    : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary"
                }`}
              >
                한국어
              </button>
              <button
                onClick={() => setLanguage("en")}
                className={`w-full px-3 py-1.5 rounded-lg text-xs transition-colors text-left ${
                  language === "en"
                    ? "bg-accent-primary text-white"
                    : "bg-surface-secondary hover:bg-surface-tertiary text-text-primary"
                }`}
              >
                English
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const MenuIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 6h16M4 12h16M4 18h16"
    />
  </svg>
);

const SunIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z"
    />
  </svg>
);

const MoonIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z"
    />
  </svg>
);

const SystemIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
    />
  </svg>
);
