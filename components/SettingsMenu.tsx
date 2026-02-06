"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme, useLanguage } from "../shared/contexts";

export default function SettingsMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

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
        className="p-2 rounded-lg text-text-secondary hover:bg-interactive-hover hover:text-text-primary transition-colors"
        title={t.settings}
      >
        <CogIcon className="w-5 h-5" />
      </button>

      {isOpen && (
        <div className="absolute left-full bottom-0 ml-2 w-48 bg-surface-primary border border-border-default rounded-xl shadow-lg z-50 overflow-hidden">
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

const CogIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
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
