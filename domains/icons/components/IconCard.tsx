"use client";

import { useState, useCallback } from "react";
import type { IconMeta } from "../types";
import { iconToSvgString, copyToClipboard, downloadSvg, getImportStatement } from "../utils/svgExport";

interface IconCardProps {
  icon: IconMeta;
}

export function IconCard({ icon }: IconCardProps) {
  const [copied, setCopied] = useState<string | null>(null);

  const handleCopySvg = useCallback(async () => {
    const svgString = iconToSvgString(icon.component);
    const ok = await copyToClipboard(svgString);
    if (ok) {
      setCopied("svg");
      setTimeout(() => setCopied(null), 1500);
    }
  }, [icon.component]);

  const handleCopyImport = useCallback(async () => {
    const importStr = getImportStatement(icon.name);
    const ok = await copyToClipboard(importStr);
    if (ok) {
      setCopied("import");
      setTimeout(() => setCopied(null), 1500);
    }
  }, [icon.name]);

  const handleDownload = useCallback(() => {
    const svgString = iconToSvgString(icon.component);
    downloadSvg(svgString, icon.name);
  }, [icon.component, icon.name]);

  const IconComponent = icon.component;

  return (
    <div className="group relative flex flex-col items-center gap-2 p-4 rounded-lg border border-border-default hover:border-accent-primary/50 hover:bg-surface-secondary transition-all">
      {/* Icon preview */}
      <div className="w-10 h-10 flex items-center justify-center text-text-primary">
        <IconComponent className="w-6 h-6" />
      </div>

      {/* Icon name */}
      <span className="text-[11px] text-text-secondary text-center leading-tight truncate w-full">
        {icon.name.replace(/Icon$/, "")}
      </span>

      {/* Hover actions */}
      <div className="absolute inset-0 bg-surface-primary/95 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1.5 p-2">
        <IconComponent className="w-8 h-8 text-text-primary mb-1" />
        <span className="text-[10px] text-text-secondary">{icon.name}</span>
        <div className="flex gap-1">
          <button
            onClick={handleCopySvg}
            className="px-2 py-0.5 text-[10px] rounded bg-surface-tertiary hover:bg-interactive-hover transition-colors"
          >
            {copied === "svg" ? "Copied!" : "SVG"}
          </button>
          <button
            onClick={handleCopyImport}
            className="px-2 py-0.5 text-[10px] rounded bg-surface-tertiary hover:bg-interactive-hover transition-colors"
          >
            {copied === "import" ? "Copied!" : "Import"}
          </button>
          <button
            onClick={handleDownload}
            className="px-2 py-0.5 text-[10px] rounded bg-surface-tertiary hover:bg-interactive-hover transition-colors"
          >
            .svg
          </button>
        </div>
      </div>
    </div>
  );
}
