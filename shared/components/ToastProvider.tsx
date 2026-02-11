"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { CheckIcon, CloseIcon, SpinnerIcon, WarningIcon } from "./icons";

export type ToastVariant = "success" | "error" | "info" | "progress";

export interface ToastInput {
  id?: string;
  variant: ToastVariant;
  title: string;
  description?: string;
  duration?: number | null;
  progress?: number;
}

interface ToastRecord extends Required<Pick<ToastInput, "id" | "variant" | "title">> {
  description?: string;
  duration: number | null;
  progress?: number;
}

type ToastMessage = string | Omit<ToastInput, "variant">;

interface ToastController {
  push: (input: ToastInput) => string;
  update: (id: string, patch: Partial<Omit<ToastInput, "id" | "variant">>) => void;
  dismiss: (id: string) => void;
  success: (message: ToastMessage) => string;
  error: (message: ToastMessage) => string;
  info: (message: ToastMessage) => string;
  progress: (message: ToastMessage) => string;
}

const DEFAULT_DURATION: Record<Exclude<ToastVariant, "progress">, number> = {
  success: 1800,
  error: 3200,
  info: 2400,
};

const ToastContext = createContext<ToastController | null>(null);

let globalController: ToastController | null = null;

function generateToastId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeMessage(variant: ToastVariant, message: ToastMessage): ToastInput {
  if (typeof message === "string") {
    return { variant, title: message };
  }
  return {
    ...message,
    variant,
  };
}

function toRecord(input: ToastInput): ToastRecord {
  const id = input.id ?? generateToastId();
  const duration = input.duration ?? (input.variant === "progress" ? null : DEFAULT_DURATION[input.variant]);
  return {
    id,
    variant: input.variant,
    title: input.title,
    description: input.description,
    duration,
    progress: input.progress,
  };
}

function getToastBorderClass(variant: ToastVariant): string {
  switch (variant) {
    case "success":
      return "border-green-500/40";
    case "error":
      return "border-accent-danger/50";
    case "progress":
      return "border-accent-primary/50";
    default:
      return "border-border-default";
  }
}

function ToastIcon({ variant }: { variant: ToastVariant }) {
  if (variant === "progress") {
    return <SpinnerIcon className="w-4 h-4 text-accent-primary" />;
  }
  if (variant === "success") {
    return (
      <span className="w-4 h-4 rounded-full bg-green-500/20 flex items-center justify-center">
        <CheckIcon className="w-3 h-3 text-green-500" />
      </span>
    );
  }
  if (variant === "error") {
    return <WarningIcon className="w-4 h-4 text-accent-danger" />;
  }
  return <WarningIcon className="w-4 h-4 text-accent-primary" />;
}

export function showToast(input: ToastInput): string {
  if (!globalController) {
    return input.id ?? generateToastId();
  }
  return globalController.push(input);
}

export function updateToast(id: string, patch: Partial<Omit<ToastInput, "id" | "variant">>) {
  globalController?.update(id, patch);
}

export function dismissToast(id: string) {
  globalController?.dismiss(id);
}

export function showSuccessToast(message: ToastMessage): string {
  return globalController?.success(message) ?? generateToastId();
}

export function showErrorToast(message: ToastMessage): string {
  if (!globalController) {
    const fallbackText = typeof message === "string" ? message : message.title;
    if (fallbackText.trim()) {
      console.error(`[ToastProvider] ${fallbackText}`);
    }
    return generateToastId();
  }
  return globalController?.error(message) ?? generateToastId();
}

export function showInfoToast(message: ToastMessage): string {
  return globalController?.info(message) ?? generateToastId();
}

export function showProgressToast(message: ToastMessage): string {
  return globalController?.progress(message) ?? generateToastId();
}

export function useToast(): ToastController {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const dismissTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    setMounted(true);
  }, []);

  const clearDismissTimer = useCallback((id: string) => {
    const existing = dismissTimersRef.current.get(id);
    if (!existing) return;
    clearTimeout(existing);
    dismissTimersRef.current.delete(id);
  }, []);

  const dismiss = useCallback((id: string) => {
    clearDismissTimer(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, [clearDismissTimer]);

  const scheduleDismiss = useCallback((toast: ToastRecord) => {
    clearDismissTimer(toast.id);
    if (toast.duration === null || toast.duration <= 0) return;
    const timer = setTimeout(() => {
      dismiss(toast.id);
    }, toast.duration);
    dismissTimersRef.current.set(toast.id, timer);
  }, [clearDismissTimer, dismiss]);

  const push = useCallback((input: ToastInput): string => {
    const next = toRecord(input);
    setToasts((prev) => {
      const exists = prev.some((item) => item.id === next.id);
      if (exists) {
        return prev.map((item) => (item.id === next.id ? next : item));
      }
      return [...prev, next];
    });
    scheduleDismiss(next);
    return next.id;
  }, [scheduleDismiss]);

  const update = useCallback((id: string, patch: Partial<Omit<ToastInput, "id" | "variant">>) => {
    setToasts((prev) =>
      prev.map((toast) => {
        if (toast.id !== id) return toast;
        const updated: ToastRecord = {
          ...toast,
          ...patch,
          duration: patch.duration === undefined ? toast.duration : patch.duration,
        };
        scheduleDismiss(updated);
        return updated;
      }),
    );
  }, [scheduleDismiss]);

  const success = useCallback((message: ToastMessage) => {
    return push(normalizeMessage("success", message));
  }, [push]);

  const error = useCallback((message: ToastMessage) => {
    return push(normalizeMessage("error", message));
  }, [push]);

  const info = useCallback((message: ToastMessage) => {
    return push(normalizeMessage("info", message));
  }, [push]);

  const progress = useCallback((message: ToastMessage) => {
    return push({
      ...normalizeMessage("progress", message),
      duration: null,
    });
  }, [push]);

  const controller = useMemo<ToastController>(() => ({
    push,
    update,
    dismiss,
    success,
    error,
    info,
    progress,
  }), [dismiss, error, info, progress, push, success, update]);

  useEffect(() => {
    globalController = controller;
    return () => {
      globalController = null;
    };
  }, [controller]);

  useEffect(() => {
    return () => {
      dismissTimersRef.current.forEach((timer) => clearTimeout(timer));
      dismissTimersRef.current.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={controller}>
      {children}
      {mounted && typeof document !== "undefined" && createPortal(
        <div className="fixed bottom-4 right-4 z-[70] flex flex-col items-end gap-2 pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto min-w-[220px] max-w-[420px] rounded-lg border bg-surface-primary shadow-lg ${getToastBorderClass(toast.variant)}`}
            >
              <div className="px-3 py-2">
                <div className="flex items-start gap-2">
                  <div className="mt-0.5 shrink-0">
                    <ToastIcon variant={toast.variant} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-text-primary break-words">{toast.title}</p>
                    {toast.description && (
                      <p className="text-xs text-text-tertiary mt-0.5 break-words">{toast.description}</p>
                    )}
                  </div>
                  <button
                    onClick={() => dismiss(toast.id)}
                    className="w-5 h-5 rounded flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-surface-secondary transition-colors"
                    aria-label="Dismiss notification"
                  >
                    <CloseIcon className="w-3 h-3" />
                  </button>
                </div>
                {typeof toast.progress === "number" && (
                  <div className="mt-2 w-full h-1 bg-surface-tertiary rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent-primary rounded-full transition-all"
                      style={{ width: `${Math.max(0, Math.min(100, toast.progress))}%` }}
                    />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}
