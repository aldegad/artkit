"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "./Modal";

export interface ConfirmDialogOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmRequest {
  id: string;
  options: ConfirmDialogOptions;
  resolve: (value: boolean) => void;
}

type ConfirmHandler = (options: ConfirmDialogOptions) => Promise<boolean>;

let globalConfirmHandler: ConfirmHandler | null = null;

function normalizeConfirmOptions(input: string | ConfirmDialogOptions): ConfirmDialogOptions {
  if (typeof input === "string") {
    return { message: input };
  }
  return input;
}

function generateConfirmId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `confirm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function confirmDialog(input: string | ConfirmDialogOptions): Promise<boolean> {
  const options = normalizeConfirmOptions(input);
  if (globalConfirmHandler) {
    return globalConfirmHandler(options);
  }
  if (typeof window !== "undefined") {
    return Promise.resolve(window.confirm(options.message));
  }
  return Promise.resolve(false);
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<ConfirmRequest[]>([]);
  const active = queue[0] ?? null;

  const enqueueConfirm = useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      const request: ConfirmRequest = {
        id: generateConfirmId(),
        options,
        resolve,
      };
      setQueue((prev) => [...prev, request]);
    });
  }, []);

  const resolveActive = useCallback((value: boolean) => {
    setQueue((prev) => {
      if (prev.length === 0) return prev;
      const [current, ...rest] = prev;
      current.resolve(value);
      return rest;
    });
  }, []);

  useEffect(() => {
    globalConfirmHandler = enqueueConfirm;
    return () => {
      globalConfirmHandler = null;
    };
  }, [enqueueConfirm]);

  const footer = useMemo(() => {
    if (!active) return null;
    const options = active.options;
    return (
      <div className="flex justify-end gap-2">
        <button
          onClick={() => resolveActive(false)}
          className="px-4 py-2 text-sm rounded bg-surface-secondary hover:bg-surface-tertiary transition-colors"
        >
          {options.cancelLabel || "Cancel"}
        </button>
        <button
          onClick={() => resolveActive(true)}
          className={`px-4 py-2 text-sm rounded text-white transition-colors ${
            options.danger
              ? "bg-accent-danger hover:bg-accent-danger-hover"
              : "bg-accent-primary hover:bg-accent-primary-hover"
          }`}
        >
          {options.confirmLabel || "Confirm"}
        </button>
      </div>
    );
  }, [active, resolveActive]);

  return (
    <>
      {children}
      {active && (
        <Modal
          key={active.id}
          isOpen
          onClose={() => resolveActive(false)}
          title={active.options.title || "Confirm"}
          width="420px"
          contentClassName="px-6 py-4"
          footer={footer}
        >
          <p className="text-sm text-text-secondary whitespace-pre-wrap">
            {active.options.message}
          </p>
        </Modal>
      )}
    </>
  );
}
