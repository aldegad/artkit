"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";

// ============================================
// Types
// ============================================

interface HeaderSlotContextValue {
  slot: ReactNode;
  setSlot: (slot: ReactNode) => void;
}

// ============================================
// Context
// ============================================

const HeaderSlotContext = createContext<HeaderSlotContextValue | null>(null);

// ============================================
// Provider
// ============================================

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const [slot, setSlot] = useState<ReactNode>(null);

  return (
    <HeaderSlotContext.Provider value={{ slot, setSlot }}>
      {children}
    </HeaderSlotContext.Provider>
  );
}

// ============================================
// Hooks
// ============================================

export function useHeaderSlot() {
  const ctx = useContext(HeaderSlotContext);
  if (!ctx) {
    throw new Error("useHeaderSlot must be used within HeaderSlotProvider");
  }
  return ctx;
}

// ============================================
// HeaderSlot Component
// ============================================

/**
 * Component to set header slot content from page level.
 * Content will be rendered in the Header component's slot area.
 *
 * @example
 * <HeaderSlot>
 *   <h1>Page Title</h1>
 *   <MenuBar />
 * </HeaderSlot>
 */
export function HeaderSlot({ children }: { children: ReactNode }) {
  const { setSlot } = useHeaderSlot();

  useEffect(() => {
    setSlot(children);
    return () => setSlot(null);
  }, [children, setSlot]);

  return null;
}
