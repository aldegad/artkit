"use client";

import { useSidebar, useAuth } from "@/shared/contexts";
import { useHeaderSlot } from "@/shared/contexts/HeaderSlotContext";
import { Scrollbar } from "@/shared/components";
import { LoginButton, UserMenu } from "@/shared/components/app/auth";
import ArtkitLogo from "@/shared/components/app/icons/ArtkitLogo";

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
        {/* Animated logo container */}
        <div className="relative w-7 h-7 flex items-center justify-center">
          {/* Background box - shrinks to 0 when open */}
          <div
            className={`absolute inset-0 bg-accent-primary rounded-md transition-transform duration-300 ease-out ${
              isOpen ? "scale-0" : "scale-100"
            }`}
          />
          {/* Logo icon - color and size transition */}
          <ArtkitLogo
            size={isOpen ? 28 : 22}
            className={`relative z-10 transition-all duration-300 ease-out ${
              isOpen ? "text-accent-primary scale-[1.27]" : "text-white scale-100"
            }`}
          />
        </div>
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
