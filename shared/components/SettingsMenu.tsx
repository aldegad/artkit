"use client";

import { useState } from "react";
import { useTheme, useLanguage } from "../contexts";
import { Popover } from "./Popover";
import { MenuIcon, CogIcon, SunIcon, MoonIcon, SystemIcon } from "./icons";

interface SettingsMenuProps {
  variant?: "sidebar" | "default";
}

export default function SettingsMenu({ variant = "default" }: SettingsMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { language, setLanguage, t } = useLanguage();

  const isSidebar = variant === "sidebar";

  const trigger = (
    <button
      className={`p-2 rounded-lg transition-colors ${
        isSidebar
          ? "text-text-secondary hover:bg-interactive-hover hover:text-text-primary"
          : "bg-interactive-default hover:bg-interactive-hover"
      }`}
      title={t.settings}
    >
      {isSidebar ? (
        <CogIcon className="w-5 h-5" />
      ) : (
        <MenuIcon className="w-5 h-5 text-text-primary" />
      )}
    </button>
  );

  return (
    <Popover
      trigger={trigger}
      open={isOpen}
      onOpenChange={setIsOpen}
      side={isSidebar ? "right" : "bottom"}
      align="end"
      sideOffset={8}
      closeOnScroll={false}
      className="w-48 overflow-hidden rounded-xl"
    >
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
    </Popover>
  );
}
