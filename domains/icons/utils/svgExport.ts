import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Render a React icon component to an SVG string.
 */
export function iconToSvgString(
  component: React.FC<{ className?: string }>,
  className = "w-24 h-24"
): string {
  const element = createElement(component, { className });
  return renderToStaticMarkup(element);
}

/**
 * Copy text to clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Download an SVG string as an .svg file.
 */
export function downloadSvg(svgString: string, filename: string): void {
  // Wrap raw SVG output in a proper standalone SVG document
  const fullSvg = svgString.includes("xmlns")
    ? svgString
    : svgString.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');

  const blob = new Blob([fullSvg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename.endsWith(".svg") ? filename : `${filename}.svg`;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Get the import statement for a given icon name.
 */
export function getImportStatement(iconName: string): string {
  return `import { ${iconName} } from "@/shared/components/icons";`;
}
