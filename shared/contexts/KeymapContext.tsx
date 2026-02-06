"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Keymap = "auto" | "mac" | "windows";
export type ResolvedKeymap = "mac" | "windows";

interface KeymapContextType {
  keymap: Keymap;
  setKeymap: (value: Keymap) => void;
  resolvedKeymap: ResolvedKeymap;
}

const STORAGE_KEY = "artkit-keymap";

const KeymapContext = createContext<KeymapContextType | undefined>(undefined);

function detectSystemKeymap(): ResolvedKeymap {
  if (typeof navigator === "undefined") return "windows";

  const uaDataPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData?.platform;
  const platform = uaDataPlatform || navigator.platform || "";
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? "mac" : "windows";
}

export function KeymapProvider({ children }: { children: ReactNode }) {
  const [keymap, setKeymapState] = useState<Keymap>("auto");
  const [systemKeymap, setSystemKeymap] = useState<ResolvedKeymap>("windows");

  useEffect(() => {
    setSystemKeymap(detectSystemKeymap());

    const stored = localStorage.getItem(STORAGE_KEY) as Keymap | null;
    if (stored === "auto" || stored === "mac" || stored === "windows") {
      setKeymapState(stored);
    }
  }, []);

  const setKeymap = (value: Keymap) => {
    setKeymapState(value);
    localStorage.setItem(STORAGE_KEY, value);
  };

  const resolvedKeymap = useMemo<ResolvedKeymap>(
    () => (keymap === "auto" ? systemKeymap : keymap),
    [keymap, systemKeymap]
  );

  return (
    <KeymapContext.Provider value={{ keymap, setKeymap, resolvedKeymap }}>
      {children}
    </KeymapContext.Provider>
  );
}

export function useKeymap() {
  const context = useContext(KeymapContext);
  if (!context) {
    throw new Error("useKeymap must be used within a KeymapProvider");
  }
  return context;
}
