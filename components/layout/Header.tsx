"use client";

import { useSidebar, useAuth } from "../../shared/contexts";
import { useHeaderSlot } from "../../shared/contexts/HeaderSlotContext";
import { LoginButton, UserMenu } from "../auth";
import ArtkitLogo from "../icons/ArtkitLogo";

/**
 * Unified Header component for desktop and mobile.
 *
 * Structure:
 * - Mobile: [Logo w-14 z-60] | [Slot flex-1] | [Auth]
 * - Desktop: [Slot flex-1] | [Auth] (Logo is in Sidebar)
 *
 * Mobile sidebar appears between logo (z-60) and header content (z-40)
 */
export default function Header() {
  const { isOpen, toggle } = useSidebar();
  const { user, isLoading } = useAuth();
  const { slot } = useHeaderSlot();

  return (
    <div className="flex items-center h-10 bg-surface-primary border-b border-border-default shrink-0">
      {/* Logo area - Mobile only: fixed position to stay above sidebar (z-[60]) */}
      <button
        onClick={toggle}
        className="md:hidden w-14 h-10 flex items-center justify-center shrink-0 fixed left-0 top-0 z-60 bg-surface-primary"
        aria-label="Toggle menu"
      >
        <div className={`w-7 h-7 rounded-md flex items-center justify-center transition-colors ${
          isOpen
            ? "bg-white text-accent-primary"
            : "bg-accent-primary text-white"
        }`}>
          <ArtkitLogo size={22} />
        </div>
      </button>
      {/* Spacer for fixed logo button on mobile */}
      <div className="md:hidden w-14 shrink-0" />

      {/* Slot area - Page-specific content */}
      <div className="flex-1 min-w-0 flex items-center gap-2 px-4 overflow-x-auto">
        {slot}
      </div>

      {/* Auth area */}
      <div className="pr-4 shrink-0">
        {!isLoading && (user ? <UserMenu /> : <LoginButton />)}
      </div>
    </div>
  );
}
