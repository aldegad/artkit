"use client";

import { GithubIcon } from "@/shared/components/icons";

export default function Footer() {
  return (
    <footer className="px-4 py-2 bg-surface-primary border-t border-border-default text-center text-xs text-text-tertiary flex-shrink-0">
      <div className="flex items-center justify-center gap-2">
        <span>© 2026 Soo Hong Kim</span>
        <span className="text-border-default">|</span>
        <a
          href="https://github.com/aldegad"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-text-secondary transition-colors"
        >
          <span className="hidden sm:inline">github.com/aldegad</span>
          <GithubIcon className="sm:hidden w-4 h-4" />
        </a>
        <span className="text-border-default">|</span>
        <a
          href="mailto:aldegad@gmail.com"
          className="hover:text-text-secondary transition-colors"
        >
          aldegad@gmail.com
        </a>
      </div>
    </footer>
  );
}
