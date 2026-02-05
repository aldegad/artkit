"use client";

import { ReactNode } from "react";
import { SidebarProvider, useSidebar, useAuth } from "../../shared/contexts";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import { LoginButton, UserMenu } from "../auth";
import ArtkitLogo from "../icons/ArtkitLogo";

function MobileHeader() {
  const { toggle } = useSidebar();
  const { user, isLoading } = useAuth();

  return (
    <div className="md:hidden flex items-center h-10 bg-surface-primary border-b border-border-default shrink-0">
      {/* Logo area - width matches sidebar (w-14 = 56px) */}
      <button
        onClick={toggle}
        className="w-14 h-10 flex items-center justify-center shrink-0"
        aria-label="Toggle menu"
      >
        <div className="w-7 h-7 bg-accent-primary rounded-md flex items-center justify-center text-white">
          <ArtkitLogo size={22} />
        </div>
      </button>
      <div className="flex-1" />
      <div className="pr-3">
        {!isLoading && (user ? <UserMenu /> : <LoginButton />)}
      </div>
    </div>
  );
}

function MobileSidebarOverlay() {
  const { isOpen, close } = useSidebar();

  return (
    <div className={`md:hidden ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}>
      {/* Backdrop with fade animation - starts below header */}
      <div
        className={`fixed inset-0 top-10 bg-black/50 z-40 transition-opacity duration-300 ease-out ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={close}
        aria-hidden={!isOpen}
      />
      {/* Sidebar with slide animation - starts below header */}
      <div
        className={`fixed left-0 top-10 bottom-0 z-50 transition-transform duration-300 ease-out ${
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
        {/* Mobile header with AK button */}
        <MobileHeader />
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
        <Footer />
      </div>
      {/* Mobile sidebar overlay */}
      <MobileSidebarOverlay />
    </div>
  );
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <SidebarProvider>
      <LayoutContent>{children}</LayoutContent>
    </SidebarProvider>
  );
}
