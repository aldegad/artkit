"use client";

import { RefObject, useEffect } from "react";

interface UseHorizontalWheelCaptureOptions {
  rootRef: RefObject<HTMLElement | null>;
}

function isHorizontallyScrollable(el: HTMLElement): boolean {
  if (el.scrollWidth <= el.clientWidth + 1) return false;
  const overflowX = window.getComputedStyle(el).overflowX;
  return overflowX === "auto" || overflowX === "scroll" || overflowX === "overlay";
}

function findHorizontalScrollContainer(root: HTMLElement, start: HTMLElement): HTMLElement | null {
  let node: HTMLElement | null = start;
  while (node && node !== root) {
    if (isHorizontallyScrollable(node)) return node;
    node = node.parentElement;
  }
  return isHorizontallyScrollable(root) ? root : null;
}

export function useHorizontalWheelCapture(options: UseHorizontalWheelCaptureOptions) {
  const { rootRef } = options;

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const handleWheelCapture = (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) return;
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      const target = event.target;
      if (!(target instanceof HTMLElement) || !root.contains(target)) return;

      const scrollContainer = findHorizontalScrollContainer(root, target);
      if (scrollContainer) {
        scrollContainer.scrollLeft += event.deltaX;
      }

      event.preventDefault();
    };

    document.addEventListener("wheel", handleWheelCapture, { passive: false, capture: true });
    return () => {
      document.removeEventListener("wheel", handleWheelCapture, { capture: true });
    };
  }, [rootRef]);
}
