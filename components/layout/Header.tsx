"use client";

import { ReactNode } from "react";

interface HeaderProps {
  title: string;
  children?: ReactNode;
}

export default function Header({ title, children }: HeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-surface-primary border-b border-border-default flex-shrink-0 shadow-sm h-12">
      <h1 className="text-sm font-semibold whitespace-nowrap">{title}</h1>

      {children && (
        <>
          <div className="h-5 w-px bg-border-default" />
          {children}
        </>
      )}
    </div>
  );
}
