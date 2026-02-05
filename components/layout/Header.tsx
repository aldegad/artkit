"use client";

import { useSidebar, useAuth } from "../../shared/contexts";
import { useHeaderSlot } from "../../shared/contexts/HeaderSlotContext";
import { LoginButton, UserMenu } from "../auth";
import ArtkitLogo from "../icons/ArtkitLogo";

/**
 * Unified Header component for desktop and mobile.
 *
 * Structure:
 * - Mobile: [Logo w-14] | [Slot flex-1] | [Auth]
 * - Desktop: [Slot flex-1] | [Auth] (Logo is in Sidebar)
 */
export default function Header() {
  const { toggle } = useSidebar();
  const { user, isLoading } = useAuth();
  const { slot } = useHeaderSlot();

  return (
    <div className="flex items-center h-10 bg-surface-primary border-b border-border-default shrink-0">
      {/* Logo area - Mobile only: sidebar toggle button */}
      <button
        onClick={toggle}
        className="md:hidden w-14 h-10 flex items-center justify-center shrink-0"
        aria-label="Toggle menu"
      >
        <div className="w-7 h-7 bg-accent-primary rounded-md flex items-center justify-center text-white">
          <ArtkitLogo size={22} />
        </div>
      </button>

      {/* Slot area - Page-specific content */}
      <div className="flex-1 min-w-0 flex items-center gap-2 px-2 md:px-4 overflow-x-auto">
        {slot}
      </div>

      {/* Auth area */}
      <div className="pr-3 shrink-0">
        {!isLoading && (user ? <UserMenu /> : <LoginButton />)}
      </div>
    </div>
  );
}
