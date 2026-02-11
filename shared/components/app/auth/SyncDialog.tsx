"use client";

import { useLanguage } from "@/shared/contexts";
import { SystemIcon, CloudIcon } from "@/shared/components/icons";
import { Modal } from "@/shared/components/Modal";

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

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={t.title}
      width="448px"
      maxHeight="80vh"
      contentClassName="px-4 py-4 space-y-3"
      footer={(
        <div className="flex flex-col gap-2">
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
      )}
    >
      <p className="text-sm text-muted-foreground">{t.description}</p>

      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 border border-border rounded-md">
          <div className="flex items-center gap-2 text-sm font-medium">
            <SystemIcon />
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
            <CloudIcon />
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
    </Modal>
  );
}
