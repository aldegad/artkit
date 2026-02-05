/**
 * File Download Utilities
 *
 * Provides simple functions for client-side file downloads.
 * Handles both data URLs and Blobs with proper cleanup.
 */

/**
 * Download a file from a data URL (e.g., base64 encoded image)
 *
 * @param dataUrl - The data URL to download
 * @param filename - The filename for the download
 *
 * @example
 * downloadDataUrl("data:image/png;base64,...", "image.png")
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.download = filename;
  link.href = dataUrl;
  link.click();
}

/**
 * Download a file from a Blob, handling URL cleanup automatically
 *
 * @param blob - The Blob to download
 * @param filename - The filename for the download
 *
 * @example
 * const blob = new Blob([data], { type: "application/zip" });
 * downloadBlob(blob, "archive.zip")
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.download = filename;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Download JSON data as a file
 *
 * @param data - The data to serialize to JSON
 * @param filename - The filename for the download (should end with .json)
 * @param pretty - Whether to pretty-print the JSON (default: true)
 *
 * @example
 * downloadJson({ name: "project", frames: [] }, "project.json")
 */
export function downloadJson(data: unknown, filename: string, pretty: boolean = true): void {
  const json = pretty ? JSON.stringify(data, null, 2) : JSON.stringify(data);
  const blob = new Blob([json], { type: "application/json" });
  downloadBlob(blob, filename);
}

/**
 * Download text content as a file
 *
 * @param content - The text content to download
 * @param filename - The filename for the download
 * @param mimeType - The MIME type (default: "text/plain")
 *
 * @example
 * downloadText("Hello, World!", "hello.txt")
 */
export function downloadText(
  content: string,
  filename: string,
  mimeType: string = "text/plain"
): void {
  const blob = new Blob([content], { type: mimeType });
  downloadBlob(blob, filename);
}
