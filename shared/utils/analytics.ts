"use client";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export type AnalyticsParams = Record<string, string | number | boolean | null | undefined>;

export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "";

const TOOL_NAME_BY_PATHNAME: Record<string, string> = {
  "/image": "image",
  "/video": "video",
  "/sprite": "sprite",
  "/sound": "sound",
  "/converter": "converter",
  "/icons": "icons",
};

export function isAnalyticsEnabled(): boolean {
  return GA_MEASUREMENT_ID.length > 0;
}

export function getToolNameFromPathname(pathname: string): string | null {
  for (const [toolPath, toolName] of Object.entries(TOOL_NAME_BY_PATHNAME)) {
    if (pathname === toolPath || pathname.startsWith(`${toolPath}/`)) {
      return toolName;
    }
  }

  return null;
}

function sendGtag(command: string, ...args: unknown[]) {
  if (!isAnalyticsEnabled() || typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }

  window.gtag(command, ...args);
}

export function trackPageView(path: string) {
  sendGtag("event", "page_view", {
    page_path: path,
    page_location: typeof window !== "undefined" ? window.location.href : path,
    page_title: typeof document !== "undefined" ? document.title : "Artkit",
  });
}

export function trackEvent(name: string, params: AnalyticsParams = {}) {
  sendGtag("event", name, params);
}

