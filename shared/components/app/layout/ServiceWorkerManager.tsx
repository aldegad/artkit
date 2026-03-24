"use client";

import { useEffect } from "react";

export default function ServiceWorkerManager() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    if (process.env.NODE_ENV !== "production") {
      // Dev에서는 오래된 SW가 _rsc 요청을 가로채지 않도록 항상 해제
      navigator.serviceWorker.getRegistrations().then((regs) => {
        regs.forEach((registration) => registration.unregister());
      });
      return;
    }

    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
