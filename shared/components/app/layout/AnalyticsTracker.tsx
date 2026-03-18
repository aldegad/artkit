"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import {
  GA_MEASUREMENT_ID,
  getToolNameFromPathname,
  isAnalyticsEnabled,
  trackEvent,
  trackPageView,
} from "@/shared/utils/analytics";

export default function AnalyticsTracker() {
  const pathname = usePathname();
  const lastTrackedPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isAnalyticsEnabled()) return;

    if (lastTrackedPathRef.current === pathname) {
      return;
    }

    lastTrackedPathRef.current = pathname;
    trackPageView(pathname);

    const tool = getToolNameFromPathname(pathname);
    if (tool) {
      trackEvent("tool_open", {
        tool,
        page_path: pathname,
      });
    }
  }, [pathname]);

  useEffect(() => {
    if (!isAnalyticsEnabled() || typeof window === "undefined") return;

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag(...args: unknown[]) {
      window.dataLayer?.push(args);
    };

    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
    });
  }, []);

  return null;
}
