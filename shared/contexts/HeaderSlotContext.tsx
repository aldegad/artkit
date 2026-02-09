"use client";

import { createContext, useContext, useEffect, useRef, useSyncExternalStore, ReactNode } from "react";

// ============================================
// Types
// ============================================

type HeaderSlotSetter = (slot: ReactNode) => void;

interface HeaderSlotStore {
  getSlot: () => ReactNode;
  setSlot: HeaderSlotSetter;
  subscribe: (listener: () => void) => () => void;
}

function createHeaderSlotStore(): HeaderSlotStore {
  let slot: ReactNode = null;
  const listeners = new Set<() => void>();

  const notify = () => {
    for (const listener of listeners) {
      listener();
    }
  };

  return {
    getSlot: () => slot,
    setSlot: (nextSlot: ReactNode) => {
      if (Object.is(slot, nextSlot)) return;
      slot = nextSlot;
      notify();
    },
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

// ============================================
// Context
// ============================================

const HeaderSlotStoreContext = createContext<HeaderSlotStore | null>(null);

// ============================================
// Provider
// ============================================

export function HeaderSlotProvider({ children }: { children: ReactNode }) {
  const storeRef = useRef<HeaderSlotStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createHeaderSlotStore();
  }

  return (
    <HeaderSlotStoreContext.Provider value={storeRef.current}>
      {children}
    </HeaderSlotStoreContext.Provider>
  );
}

// ============================================
// Hooks
// ============================================

export function useHeaderSlot() {
  const store = useContext(HeaderSlotStoreContext);
  if (!store) {
    throw new Error("useHeaderSlot must be used within HeaderSlotProvider");
  }
  const slot = useSyncExternalStore(store.subscribe, store.getSlot, store.getSlot);
  return { slot };
}

export function useSetHeaderSlot() {
  const store = useContext(HeaderSlotStoreContext);
  if (!store) {
    throw new Error("useSetHeaderSlot must be used within HeaderSlotProvider");
  }
  return store.setSlot;
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
  const setSlot = useSetHeaderSlot();

  useEffect(() => {
    setSlot(children);
    return () => setSlot(null);
  }, [children, setSlot]);

  return null;
}
