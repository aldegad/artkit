"use client";

import {
  ReactNode,
  forwardRef,
  useState,
  useEffect,
  useCallback,
  useRef,
  MutableRefObject,
} from "react";
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
  /** OverlayScrollbars viewport 엘리먼트를 외부 ref에 노출 */
  viewportRef?: MutableRefObject<HTMLDivElement | null>;
  /** OverlayScrollbars viewport 엘리먼트 준비/해제 콜백 */
  onViewportReady?: (viewport: HTMLDivElement | null) => void;
}

export const Scrollbar = forwardRef<
  OverlayScrollbarsComponentRef,
  ScrollbarProps
>(
  (
    {
      children,
      className = "",
      overflow,
      defer = true,
      viewportRef,
      onViewportReady,
    },
    ref
  ) => {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const overlayRef = useRef<OverlayScrollbarsComponentRef | null>(null);

  const setOverlayRef = useCallback(
    (instance: OverlayScrollbarsComponentRef | null) => {
      overlayRef.current = instance;
      if (!ref) return;
      if (typeof ref === "function") {
        ref(instance);
        return;
      }
      (ref as MutableRefObject<OverlayScrollbarsComponentRef | null>).current = instance;
    },
    [ref]
  );

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!mounted) return;
    const viewport = (overlayRef.current?.osInstance()?.elements().viewport ?? null) as HTMLDivElement | null;
    if (viewportRef) {
      viewportRef.current = viewport;
    }
    onViewportReady?.(viewport);

    return () => {
      if (viewportRef) {
        viewportRef.current = null;
      }
      onViewportReady?.(null);
    };
  }, [mounted, onViewportReady, viewportRef]);

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
      ref={setOverlayRef}
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
