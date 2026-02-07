"use client";

import { useLanguage } from "@/shared/contexts";
import { HeaderContent } from "@/shared/components";
import { IconShowcase } from "@/domains/icons";

export default function IconsPage() {
  const { t } = useLanguage();

  return (
    <div className="h-full bg-background text-text-primary flex flex-col overflow-hidden">
      <HeaderContent title={t.iconShowcase} />
      <IconShowcase />
    </div>
  );
}
