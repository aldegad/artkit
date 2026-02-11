"use client";

import { useState } from "react";
import { useAuth } from "@/shared/contexts";
import { useLanguage } from "@/shared/contexts";
import { Popover } from "@/shared/components/Popover";
import { CheckIcon } from "@/shared/components/icons";

export function UserMenu() {
  const { user, logOut } = useAuth();
  const { language } = useLanguage();
  const [isOpen, setIsOpen] = useState(false);

  const t = {
    logout: language === "ko" ? "로그아웃" : "Sign out",
    cloudSync: language === "ko" ? "클라우드 동기화 중" : "Cloud sync enabled",
  };

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await logOut();
      setIsOpen(false);
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const trigger = (
    <button className="flex items-center gap-2 p-1 rounded-full hover:bg-muted transition-colors">
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
  );

  return (
    <Popover
      trigger={trigger}
      open={isOpen}
      onOpenChange={setIsOpen}
      align="end"
      sideOffset={4}
      closeOnScroll={false}
      className="w-48"
    >
      <div className="p-2 border-b border-border">
        <p className="text-sm font-medium truncate">{user.displayName || "User"}</p>
        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
      </div>

      <div className="p-1">
        <div className="flex items-center gap-2 px-2 py-1.5 text-xs text-muted-foreground">
          <CheckIcon className="w-3 h-3 text-accent-success" />
          {t.cloudSync}
        </div>

        <button
          onClick={handleLogout}
          className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-muted transition-colors"
        >
          {t.logout}
        </button>
      </div>
    </Popover>
  );
}
