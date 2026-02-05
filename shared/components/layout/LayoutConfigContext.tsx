"use client";

import { createContext, useContext, ReactNode } from "react";
import { LayoutConfiguration, LayoutContextValue } from "./types";

// ============================================
// Layout Config Context
// ============================================

const LayoutConfigContext = createContext<LayoutConfiguration | null>(null);
const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayoutConfig() {
  const config = useContext(LayoutConfigContext);
  if (!config) {
    throw new Error("useLayoutConfig must be used within LayoutConfigProvider");
  }
  return config;
}

export function useLayout() {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error("useLayout must be used within LayoutProvider");
  }
  return context;
}

interface LayoutConfigProviderProps {
  config: LayoutConfiguration;
  layoutContext: LayoutContextValue;
  children: ReactNode;
}

export function LayoutConfigProvider({
  config,
  layoutContext,
  children,
}: LayoutConfigProviderProps) {
  return (
    <LayoutConfigContext.Provider value={config}>
      <LayoutContext.Provider value={layoutContext}>{children}</LayoutContext.Provider>
    </LayoutConfigContext.Provider>
  );
}

export { LayoutConfigContext, LayoutContext };
