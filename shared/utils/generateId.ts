/**
 * Generate a unique ID with optional prefix
 *
 * Uses timestamp + random string for uniqueness.
 * Suitable for client-side ID generation where collision probability is negligible.
 *
 * @param prefix - Optional prefix for the ID (default: "id")
 * @returns A unique string ID in format: "{prefix}-{timestamp}-{random}"
 *
 * @example
 * generateId()          // "id-1234567890-abc123def"
 * generateId("node")    // "node-1234567890-abc123def"
 * generateId("layer")   // "layer-1234567890-abc123def"
 */
export function generateId(prefix: string = "id"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}
