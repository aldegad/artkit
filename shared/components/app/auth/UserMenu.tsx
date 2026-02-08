"use client";

import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/shared/contexts";
import { useLanguage } from "@/shared/contexts";

export function UserMenu() {
  const { user, logOut } = useAuth();
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const t = {
    logout: language === "ko" ? "로그아웃" : "Sign out",
    cloudSync: language === "ko" ? "클라우드 동기화 중" : "Cloud sync enabled",
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logOut();
      setIsOpen(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1 rounded-full hover:bg-muted transition-colors"
      >
        {user.photoURL ? (
          <img
            src={user.photoURL}
            alt={user.displayName || "User"}
            className="w-7 h-7 rounded-full"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-medium">
            {user.displayName?.[0] || user.email?.[0] || "U"}
          </div>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 top-full mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50">
          <div className="p-2 border-b border-border">
            <p className="text-sm font-medium truncate">
              {user.displayName || "User"}
            </p>
            <p className="text-xs text-muted-foreground truncate">
              {user.email}
            </p>
          </div>

          <div className="p-1">
            <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
              <svg
                className="w-3 h-3 text-accent-success"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
              {t.cloudSync}
            </div>

            <button
              onClick={handleLogout}
              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors"
            >
              {t.logout}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
