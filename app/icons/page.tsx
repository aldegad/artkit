"use client";

import { useLanguage, HeaderSlot } from "../../shared/contexts";
import { IconShowcase } from "../../domains/icons";

export default function IconsPage() {
  const { t } = useLanguage();

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      <HeaderSlot>
        <h1 className="text-sm font-semibold whitespace-nowrap">{t.iconShowcase}</h1>
      </HeaderSlot>
      <IconShowcase />
    </div>
  );
}
