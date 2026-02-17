"use client";

import { ReactNode, forwardRef, useState, useEffect } from "react";
import {
  OverlayScrollbarsComponent,
  OverlayScrollbarsComponentRef,
} from "overlayscrollbars-react";
import { useTheme } from "../contexts/ThemeContext";

type OverflowBehavior = "scroll" | "hidden" | "visible";

export interface ScrollbarProps {
  children: ReactNode;
  className?: string;
  /** 스크롤 방향 설정. 기본값: { x: "scroll", y: "scroll" } */
  overflow?: {
    x?: OverflowBehavior;
    y?: OverflowBehavior;
  };
  /** 지연 초기화 여부. 기본값: true */
  defer?: boolean;
}

export const Scrollbar = forwardRef<
  OverlayScrollbarsComponentRef,
  ScrollbarProps
>(({ children, className = "", overflow, defer = true }, ref) => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // SSR: 일반 div 렌더 → hydration mismatch 원천 차단
  if (!mounted) {
    return (
      <div className={className} style={{ overflow: "auto" }}>
        {children}
      </div>
    );
  }

  return (
    <OverlayScrollbarsComponent
      ref={ref}
      defer={defer}
      options={{
        scrollbars: {
          theme: resolvedTheme === "dark" ? "os-theme-light" : "os-theme-dark",
          autoHide: "scroll",
          autoHideDelay: 800,
          clickScroll: true,
        },
        overflow: overflow ?? { x: "scroll", y: "scroll" },
      }}
      className={className}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
});

Scrollbar.displayName = "Scrollbar";
