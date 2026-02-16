"use client";

export function clampExportQuality(value: number | undefined, fallback: number = 0.9): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.max(0.1, Math.min(1, value as number));
}
