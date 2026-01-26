"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Tool {
  id: string;
  name: string;
  path: string;
  icon: React.ReactNode;
}

const tools: Tool[] = [
  {
    id: "sprite",
    name: "Sprite Editor",
    path: "/sprite",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Film strip / sprite frames icon */}
        <rect x="2" y="4" width="20" height="16" rx="2" strokeWidth={2} />
        <line x1="8" y1="4" x2="8" y2="20" strokeWidth={2} />
        <line x1="16" y1="4" x2="16" y2="20" strokeWidth={2} />
        <circle cx="5" cy="7" r="1" fill="currentColor" />
        <circle cx="5" cy="17" r="1" fill="currentColor" />
        <circle cx="12" cy="7" r="1" fill="currentColor" />
        <circle cx="12" cy="17" r="1" fill="currentColor" />
        <circle cx="19" cy="7" r="1" fill="currentColor" />
        <circle cx="19" cy="17" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: "editor",
    name: "Image Editor",
    path: "/editor",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {/* Image editing icon - picture with edit pencil */}
        <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth={2} />
        <circle cx="8.5" cy="8.5" r="1.5" strokeWidth={2} />
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 15l-5-5L5 21"
        />
      </svg>
    ),
  },
  {
    id: "converter",
    name: "Image Converter",
    path: "/converter",
    icon: (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <div className="w-14 bg-surface-primary border-r border-border-default flex flex-col items-center py-3 gap-2">
      {/* Logo */}
      <div className="w-9 h-9 bg-accent-primary rounded-lg flex items-center justify-center text-white font-bold text-sm mb-2">
        DT
      </div>

      <div className="w-8 h-px bg-border-default" />

      {/* Tool buttons */}
      {tools.map((tool) => {
        const isActive = pathname.startsWith(tool.path);
        return (
          <Link
            key={tool.id}
            href={tool.path}
            className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
              isActive
                ? "bg-accent-primary text-white"
                : "text-text-secondary hover:bg-interactive-hover hover:text-text-primary"
            }`}
            title={tool.name}
          >
            {tool.icon}
          </Link>
        );
      })}

      <div className="flex-1" />

      {/* Settings (optional) */}
      <button
        className="w-10 h-10 rounded-lg flex items-center justify-center text-text-secondary hover:bg-interactive-hover hover:text-text-primary transition-colors"
        title="Settings"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
      </button>
    </div>
  );
}
