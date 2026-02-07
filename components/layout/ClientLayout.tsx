"use client";

import { ReactNode, useEffect } from "react";
import { SidebarProvider, useSidebar } from "../../shared/contexts";
import { HeaderSlotProvider } from "../../shared/contexts/HeaderSlotContext";
import Sidebar from "./Sidebar";
import Header from "./Header";
import Footer from "./Footer";

function useServiceWorker() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
}

function MobileSidebarOverlay() {
  const { isOpen, close } = useSidebar();

  return (
    <div className={`md:hidden ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      {/* Backdrop - full screen, below sidebar */}
      <div
        className={`fixed inset-0 bg-black/50 z-40 transition-opacity duration-300 ease-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
        aria-hidden={!isOpen}
      />
      {/* Sidebar - slides from left, above header but below logo (z-50) */}
      <div
        className={`fixed left-0 top-0 bottom-0 z-50 pt-10 transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <Sidebar onNavigate={close} />
      </div>
    </div>
  );
}

function LayoutContent({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-screen">
      {/* Desktop sidebar - hidden on mobile */}
      <div className="hidden md:block">
        <Sidebar />
      </div>
      <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
        {/* Unified header for desktop and mobile */}
        <Header />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
        <Footer />
      </div>
      {/* Mobile sidebar overlay */}
      <MobileSidebarOverlay />
    </div>
  );
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  useServiceWorker();

  return (
    <SidebarProvider>
      <HeaderSlotProvider>
        <LayoutContent>{children}</LayoutContent>
      </HeaderSlotProvider>
    </SidebarProvider>
  );
}
