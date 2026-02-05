"use client";

import { useSidebar, useAuth } from "../../shared/contexts";
import { useHeaderSlot } from "../../shared/contexts/HeaderSlotContext";
import { Scrollbar } from "../../shared/components";
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
      {/* Logo area - Mobile only: fixed position to stay above sidebar (z-60) */}
      <button
        onClick={toggle}
        className="md:hidden w-14 h-10 flex items-center justify-center shrink-0 fixed left-0 top-0 z-60 bg-surface-primary border-b border-border-default"
        aria-label="Toggle menu"
      >
        {isOpen ? (
          /* Open: no box, just orange icon (like desktop) */
          <ArtkitLogo size={28} className="text-accent-primary" />
        ) : (
          /* Closed: orange box with white icon */
          <div className="w-7 h-7 bg-accent-primary rounded-md flex items-center justify-center text-white">
            <ArtkitLogo size={22} />
          </div>
        )}
      </button>
      {/* Spacer for fixed logo button on mobile */}
      <div className="md:hidden w-14 shrink-0" />

      {/* Slot area - Page-specific content */}
      <Scrollbar
        className="flex-1 min-w-0"
        overflow={{ x: "scroll", y: "hidden" }}
      >
        <div className="flex items-center gap-2 px-3.5 whitespace-nowrap">
          {slot}
        </div>
      </Scrollbar>

      {/* Auth area */}
      <div className="pr-3.5 shrink-0">
        {!isLoading && (user ? <UserMenu /> : <LoginButton />)}
      </div>
    </div>
  );
}
