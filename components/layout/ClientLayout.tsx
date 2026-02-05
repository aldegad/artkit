"use client";

import { ReactNode } from "react";
import { SidebarProvider, useSidebar, useAuth } from "../../shared/contexts";
import Sidebar from "./Sidebar";
import Footer from "./Footer";
import { LoginButton, UserMenu } from "../auth";

function MobileHeader() {
  const { toggle } = useSidebar();
  const { user, isLoading } = useAuth();

  return (
    <div className="md:hidden flex items-center h-10 px-3 bg-surface-primary border-b border-border-default shrink-0">
      <button
        onClick={toggle}
        className="w-7 h-7 bg-accent-primary rounded flex items-center justify-center text-white font-bold text-xs"
        aria-label="Toggle menu"
      >
        AK
      </button>
      <div className="flex-1" />
      {!isLoading && (user ? <UserMenu /> : <LoginButton />)}
    </div>
  );
}

function MobileSidebarOverlay() {
  const { isOpen, close } = useSidebar();

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="md:hidden fixed inset-0 bg-black/50 z-40"
        onClick={close}
      />
      {/* Sidebar */}
      <div className="md:hidden fixed left-0 top-0 bottom-0 z-50">
        <Sidebar onNavigate={close} />
      </div>
    </>
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
