"use client";

import { useLanguage } from "@/shared/contexts";

interface SyncDialogProps {
  isOpen: boolean;
  localCount: number;
  cloudCount: number;
  onKeepCloud: () => void;
  onKeepLocal: () => void;
  onCancel: () => void;
}

export function SyncDialog({
  isOpen,
  localCount,
  cloudCount,
  onKeepCloud,
  onKeepLocal,
  onCancel,
}: SyncDialogProps) {
  const { language } = useLanguage();

  const t = {
    title: language === "ko" ? "데이터 충돌" : "Data Conflict",
    description:
      language === "ko"
        ? "클라우드에 기존 데이터가 있습니다. 어떤 데이터를 사용하시겠습니까?"
        : "You have existing data in the cloud. Which data would you like to keep?",
    localData: language === "ko" ? "로컬 데이터" : "Local Data",
    cloudData: language === "ko" ? "클라우드 데이터" : "Cloud Data",
    projects: language === "ko" ? "개 프로젝트" : " projects",
    keepCloud:
      language === "ko"
        ? "클라우드 유지 (로컬 삭제)"
        : "Keep Cloud (Delete Local)",
    keepLocal:
      language === "ko"
        ? "로컬 유지 (클라우드 덮어쓰기)"
        : "Keep Local (Overwrite Cloud)",
    cancel: language === "ko" ? "취소" : "Cancel",
    warning:
      language === "ko"
        ? "이 작업은 되돌릴 수 없습니다."
        : "This action cannot be undone.",
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-popover border border-border rounded-lg shadow-xl w-full max-w-md mx-4">
        <div className="p-4 border-b border-border">
          <h2 className="text-lg font-semibold">{t.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{t.description}</p>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 border border-border rounded-md">
              <div className="flex items-center gap-2 text-sm font-medium">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                {t.localData}
              </div>
              <p className="text-2xl font-bold mt-2">
                {localCount}
                <span className="text-sm font-normal text-muted-foreground">
                  {t.projects}
                </span>
              </p>
            </div>

            <div className="p-3 border border-border rounded-md">
              <div className="flex items-center gap-2 text-sm font-medium">
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 15a4 4 0 004 4h9a5 5 0 10-.1-9.999 5.002 5.002 0 10-9.78 2.096A4.001 4.001 0 003 15z"
                  />
                </svg>
                {t.cloudData}
              </div>
              <p className="text-2xl font-bold mt-2">
                {cloudCount}
                <span className="text-sm font-normal text-muted-foreground">
                  {t.projects}
                </span>
              </p>
            </div>
          </div>

          <p className="text-xs text-destructive">{t.warning}</p>
        </div>

        <div className="p-4 border-t border-border flex flex-col gap-2">
          <button
            onClick={onKeepCloud}
            className="w-full px-4 py-2 text-sm rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            {t.keepCloud}
          </button>
          <button
            onClick={onKeepLocal}
            className="w-full px-4 py-2 text-sm rounded-md border border-border hover:bg-muted transition-colors"
          >
            {t.keepLocal}
          </button>
          <button
            onClick={onCancel}
            className="w-full px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t.cancel}
          </button>
        </div>
      </div>
    </div>
  );
}
