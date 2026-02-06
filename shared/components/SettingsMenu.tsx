"use client";

import { useState, useRef, useEffect } from "react";
import { useTheme, useLanguage } from "../contexts";
import { MenuIcon, SunIcon, MoonIcon, SystemIcon } from "./icons";

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
